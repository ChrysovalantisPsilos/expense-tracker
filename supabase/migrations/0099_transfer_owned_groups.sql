-- 0099: account deletion hands over the user's shared groups in one
-- transaction.
--
-- deleteAccount (_shared/accountDeletion.ts, used by delete-account and
-- purge-inactive) used to hand each owned group over with separate API calls
-- and never checked their results: if the "other members" read or the
-- groups/group_members updates failed, the account was still deleted, and
-- groups.owner_id cascades on delete, so a group other people still used
-- went with it. Now one server-side call does the whole hand-over, all or
-- nothing, and the function throws on its error before anything is deleted.
--
-- Same rule as before: each group the user owns passes to its earliest
-- other linked member (created_at, then id to break a tie), who becomes its
-- owner in groups and in group_members.role. Groups with no other linked
-- member are left alone and their ids returned: they cascade-delete with the
-- account (the caller removes their cover images first).
--
-- Service role only (the edge functions); no API role can move a group.

create or replace function public.transfer_owned_groups(p_user uuid)
returns uuid[] language plpgsql security definer
set search_path = public, pg_temp as $$
declare g record; nxt record; doomed uuid[] := '{}';
begin
  if p_user is null then raise exception 'transfer_owned_groups: p_user is required'; end if;
  for g in
    select id from public.groups where owner_id = p_user order by id for update
  loop
    select m.id, m.user_id into nxt
      from public.group_members m
     where m.group_id = g.id and m.user_id is not null and m.user_id <> p_user
     order by m.created_at, m.id
     limit 1;
    if found then
      update public.groups set owner_id = nxt.user_id where id = g.id;
      update public.group_members set role = 'owner' where id = nxt.id;
    else
      doomed := doomed || g.id;
    end if;
  end loop;
  return doomed;
end $$;
revoke execute on function public.transfer_owned_groups(uuid) from public, anon, authenticated;
grant execute on function public.transfer_owned_groups(uuid) to service_role;
