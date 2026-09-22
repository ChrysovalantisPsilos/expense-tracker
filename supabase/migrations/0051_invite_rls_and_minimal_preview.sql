-- (1) group_invites: split the blanket FOR ALL policy (0029 `gi_all`) into
--     per-verb rules, and make created_by / expires_at server-authoritative
--     with a BEFORE trigger, so an API caller can't mint a link that never
--     expires or attribute it to someone else (CLAUDE.md #6).
-- (2) group_preview (anon-callable via a share token) now returns only what
--     the public join page needs: group name + picture, member count, the
--     inviter's name and the link's expiry. No member names/avatars, expenses
--     or balances leave the database for a logged-out visitor.
-- (3) preview_link_invite (signed-in) keeps the member list for the
--     accept/decline screen but no longer carries any money.

-- ===========================================================================
-- 1. group_invites policies + guard
-- ===========================================================================
drop policy if exists gi_all on public.group_invites;

create policy gi_select on public.group_invites for select to authenticated
  using (public.is_group_member(group_id));
create policy gi_insert on public.group_invites for insert to authenticated
  with check (public.is_group_member(group_id)
              and created_by = (select auth.uid())
              and invited_user_id is null);
create policy gi_update on public.group_invites for update to authenticated
  using (public.is_group_member(group_id)
         and (created_by = (select auth.uid()) or public.is_group_owner(group_id)))
  with check (public.is_group_member(group_id)
              and (created_by = (select auth.uid()) or public.is_group_owner(group_id)));
create policy gi_delete on public.group_invites for delete to authenticated
  using (public.is_group_member(group_id)
         and (created_by = (select auth.uid()) or public.is_group_owner(group_id)));

-- Invoker on purpose: `current_user` tells a direct API write (anon /
-- authenticated) apart from the definer RPCs (invite_user_to_group,
-- respond_to_invite) that legitimately set the response columns.
create or replace function public.group_invite_guard()
returns trigger language plpgsql security invoker set search_path = public as $$
declare max_exp timestamptz := now() + interval '24 hours';
begin
  if TG_OP = 'INSERT' then
    NEW.created_by := coalesce(auth.uid(), NEW.created_by);
    NEW.expires_at := least(coalesce(NEW.expires_at, max_exp), max_exp);
    if current_user in ('anon', 'authenticated') then
      NEW.accepted_by := null; NEW.accepted_at := null; NEW.declined_at := null;
    end if;
  else
    NEW.created_by := OLD.created_by;
    -- Expiry can be shortened (e.g. revoking a link), never pushed past 24h
    -- from now or cleared.
    if NEW.expires_at is distinct from OLD.expires_at then
      NEW.expires_at := least(coalesce(NEW.expires_at, max_exp), max_exp);
    end if;
    if current_user in ('anon', 'authenticated') then
      NEW.group_id := OLD.group_id;           NEW.token := OLD.token;
      NEW.invited_user_id := OLD.invited_user_id; NEW.invited_email := OLD.invited_email;
      NEW.accepted_by := OLD.accepted_by;     NEW.accepted_at := OLD.accepted_at;
      NEW.declined_at := OLD.declined_at;     NEW.created_at := OLD.created_at;
    end if;
  end if;
  return NEW;
end $$;
revoke execute on function public.group_invite_guard() from anon, authenticated, public;

drop trigger if exists trg_group_invite_guard on public.group_invites;
create trigger trg_group_invite_guard before insert or update on public.group_invites
  for each row execute function public.group_invite_guard();

-- ===========================================================================
-- 2. Public (anon) preview — minimal. Same signature, so grants are kept
--    (anon + authenticated, as before).
-- ===========================================================================
create or replace function public.group_preview(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare inv record;
begin
  select * into inv from public.group_invites
    where token = p_token and (expires_at is null or expires_at > now());
  if inv is null then return null; end if;
  return (
    select jsonb_build_object(
      'group', jsonb_build_object('name', g.name, 'image_url', g.image_url),
      'member_count', (select count(*) from public.group_members m
                       where m.group_id = inv.group_id and m.user_id is not null),
      'invited_by', coalesce((select p.display_name from public.profiles p where p.id = inv.created_by), 'Someone'),
      'expires_at', inv.expires_at)
    from public.groups g where g.id = inv.group_id);
end $$;

-- ===========================================================================
-- 3. Signed-in link preview — member list for the accept screen, no money.
-- ===========================================================================
create or replace function public.preview_link_invite(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare inv record; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into inv from public.group_invites
    where token = p_token and (expires_at is null or expires_at > now());
  if inv is null then
    return jsonb_build_object('status', 'invalid');
  end if;
  if exists (select 1 from public.group_members
             where group_id = inv.group_id and user_id = uid) then
    return jsonb_build_object('status', 'already_member', 'group_id', inv.group_id);
  end if;
  return jsonb_build_object(
    'status', 'joinable',
    'group_id', inv.group_id,
    'preview', public.group_preview(p_token) || jsonb_build_object(
      'members', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', m.id, 'display_name', m.display_name, 'avatar_url', p.avatar_url)
                    order by m.created_at), '[]'::jsonb)
                  from public.group_members m
                  left join public.profiles p on p.id = m.user_id
                  where m.group_id = inv.group_id)));
end $$;
