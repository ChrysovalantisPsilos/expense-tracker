-- 0088: a group can't be deleted while other people are still in it.
--
-- The owner's rule: deleting a group is refused while anyone else is still a
-- member. They leave (or the owner removes them) first; once the owner is the
-- only one left, delete_group works as before.
--
-- Where it's enforced: delete_group is the ONLY way a client can delete a
-- group. 0058 revoked DELETE on public.groups from anon/authenticated and
-- dropped the groups_delete policy, so there is no RLS delete policy to
-- tighten; the definer RPC is the authority, and the rule lives there.
--
-- Who counts as "still in it": every member row linked to an account
-- (user_id set) other than the caller's. A row with user_id null is someone
-- who has LEFT: leaving with history detaches the row (former_user_id, 0038)
-- and a deleted account is anonymised to "Former member" (0072/0080). Those
-- rows only keep the books whole; remove_group_member can't remove them
-- (their splits reference them), so counting them would lock the group
-- forever. People can't be added by name since 0019/0021, so there are no
-- never-joined placeholders to count. Pending invites aren't members; they go
-- with the group (group_invites.group_id cascades), as before.
--
-- Server paths are untouched on purpose: account deletion (delete-account,
-- purge-inactive → _shared/accountDeletion.ts) first hands every owned group
-- with another linked member to that member, then deletes the auth user; the
-- groups left cascade through groups.owner_id. That path never calls
-- delete_group, and the rule isn't a trigger, so nothing there needs a bypass.
-- anonymise_departing_user only rewrites member rows and never deletes groups.
--
-- The client mirrors this with canDeleteGroup (groups/groupFormat.js) to
-- explain before asking; the message below is on SQL_USER_MESSAGES.

create or replace function public.delete_group(p_group uuid)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  -- Lock the group row so a join can't slip in between the check and the delete.
  perform 1 from public.groups where id = p_group and owner_id = uid for update;
  if not found then
    raise exception 'only the owner can delete this group';
  end if;
  if exists (
    select 1 from public.group_members m
    where m.group_id = p_group and m.user_id is not null and m.user_id <> uid
  ) then
    raise exception 'Remove the other members before deleting this group.';
  end if;
  if exists (
    select 1 from public.group_members m
    where m.group_id = p_group and public.group_member_net(p_group, m.id) <> 0
  ) then
    raise exception 'Everyone must be settled up before the group can be deleted.';
  end if;
  delete from public.groups where id = p_group;
end $$;

revoke execute on function public.delete_group(uuid) from public, anon;
grant execute on function public.delete_group(uuid) to authenticated;
