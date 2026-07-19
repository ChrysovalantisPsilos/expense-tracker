-- Link (share-token) invites used to AUTO-JOIN the moment the recipient opened
-- them: JoinGroup called accept_group_invite immediately, silently claiming the
-- phantom slot with no accept/decline and no notification.
--
-- New flow: opening a link "claims" the anonymous invite for the signed-in user
-- (sets invited_user_id), which (a) drops an in-app notification via the
-- notify_invite trigger and (b) makes it show up in the Groups inbox
-- (list_my_group_invites). The recipient then explicitly Accepts or Declines
-- (respond_to_invite) — and only on Accept is the phantom slot replaced.

-- 1. notify_invite: also fire when invited_user_id transitions NULL -> value on
--    UPDATE (a link invite being claimed), not just on INSERT. Skip UPDATEs that
--    don't change the target (accept/decline set accepted_at/declined_at only),
--    so no duplicate notifications.
create or replace function public.notify_invite()
returns trigger language plpgsql security definer set search_path = public as $$
declare gname text; actor text;
begin
  if NEW.invited_user_id is null then return NEW; end if;
  if TG_OP = 'UPDATE' and OLD.invited_user_id is not distinct from NEW.invited_user_id then
    return NEW; -- target unchanged; don't re-notify on accept/decline updates
  end if;
  select name into gname from public.groups where id = NEW.group_id;
  select coalesce(display_name, 'Someone') into actor from public.profiles where id = NEW.created_by;
  insert into public.notifications (user_id, type, title, body, group_id, invite_id, actor_id)
  values (NEW.invited_user_id, 'invite', 'Group invite',
          actor || ' invited you to “' || coalesce(gname, 'a group') || '”',
          NEW.group_id, NEW.id, NEW.created_by);
  return NEW;
end $$;

drop trigger if exists trg_notify_invite on public.group_invites;
create trigger trg_notify_invite after insert or update on public.group_invites
  for each row execute function public.notify_invite();

-- 2. claim_link_invite: called when a signed-in user opens a /join/:token link.
--    Does NOT join the group. It points the invite at the opener (firing the
--    notification) and returns a preview + the invite id so the UI can render an
--    inline Accept/Decline. Actual joining happens through respond_to_invite.
create or replace function public.claim_link_invite(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare inv record; uid uuid := auth.uid(); summary jsonb;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select * into inv from public.group_invites
    where token = p_token and (expires_at is null or expires_at > now());
  if inv is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- Already in the group (e.g. re-opening after accepting) — nothing to do.
  if exists (select 1 from public.group_members
             where group_id = inv.group_id and user_id = uid) then
    return jsonb_build_object('status', 'already_member', 'group_id', inv.group_id);
  end if;

  -- Someone else already claimed this single-use link.
  if inv.invited_user_id is not null and inv.invited_user_id <> uid then
    return jsonb_build_object('status', 'claimed_by_other');
  end if;

  -- Already accepted (slot taken) but caller isn't the member — treat as used.
  if inv.accepted_at is not null then
    return jsonb_build_object('status', 'claimed_by_other');
  end if;

  -- Point the invite at the opener. NULL -> uid fires notify_invite (the
  -- in-app notification). Clearing declined_at lets a prior decliner re-open.
  if inv.invited_user_id is null or inv.declined_at is not null then
    update public.group_invites
      set invited_user_id = uid, declined_at = null
      where id = inv.id;
  end if;

  select public.group_preview(p_token) into summary;
  return jsonb_build_object(
    'status', 'pending',
    'invite_id', inv.id,
    'group_id', inv.group_id,
    'preview', summary
  );
end $$;

revoke execute on function public.claim_link_invite(text) from anon, public;
grant execute on function public.claim_link_invite(text) to authenticated;
