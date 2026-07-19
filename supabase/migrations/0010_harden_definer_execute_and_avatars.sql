-- Trigger functions are never meant to be called over the REST API.
revoke execute on function public.sync_group_share() from anon, authenticated, public;
revoke execute on function public.sync_group_expense_meta() from anon, authenticated, public;
revoke execute on function public.sync_member_link() from anon, authenticated, public;

-- Balance helpers are internal to the group RPCs (which run as definer) only.
revoke execute on function public.group_member_net(uuid, uuid) from anon, authenticated, public;
revoke execute on function public.member_has_footprint(uuid, uuid) from anon, authenticated, public;

-- Public `avatars` bucket serves objects via the public URL and doesn't need a
-- broad SELECT policy; dropping it stops clients from listing all avatars.
drop policy if exists avatars_read on storage.objects;
