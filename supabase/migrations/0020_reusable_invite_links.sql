-- Make share links reusable by any number of people.
--
-- claim_link_invite stamped invited_user_id onto the single shared group_invites
-- row, so the FIRST opener consumed the link and everyone after got
-- 'claimed_by_other'. A share link should let unlimited people join.
--
-- Split into two functions that never mutate the shared invite row:
--   * preview_link_invite  — read-only: is this joinable, and a group snapshot.
--   * join_via_link        — idempotent: add the caller as a member.
-- Targeted email-to-existing-user requests still use invited_user_id +
-- respond_to_invite (one known person, notification + inbox) — unchanged.

drop function if exists public.claim_link_invite(text);

-- Read-only: never writes, so any number of people can open the same link.
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
    'preview', public.group_preview(p_token));
end $$;

-- Idempotent join. Does NOT touch invited_user_id/accepted_at on the shared
-- row, so the link stays open for the next person. ON CONFLICT guards the race
-- of two rapid clicks against the (group_id, user_id) unique index.
create or replace function public.join_via_link(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv record; uid uuid := auth.uid(); nm text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into inv from public.group_invites
    where token = p_token and (expires_at is null or expires_at > now());
  if inv is null then raise exception 'invite invalid or expired'; end if;
  if exists (select 1 from public.group_members
             where group_id = inv.group_id and user_id = uid) then
    return inv.group_id; -- already a member
  end if;
  nm := public.member_name_for(uid);
  insert into public.group_members (group_id, user_id, display_name)
    values (inv.group_id, uid, coalesce(nm, 'Member'))
  on conflict (group_id, user_id) where user_id is not null do nothing;
  return inv.group_id;
end $$;

revoke execute on function public.preview_link_invite(text) from anon, public;
revoke execute on function public.join_via_link(text) from anon, public;
grant execute on function public.preview_link_invite(text) to authenticated;
grant execute on function public.join_via_link(text) to authenticated;
