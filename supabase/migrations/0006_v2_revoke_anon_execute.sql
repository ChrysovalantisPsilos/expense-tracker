-- These SECURITY DEFINER functions should never be reachable by anonymous
-- callers; only signed-in users (and RLS policy evaluation) need them.
revoke execute on function public.create_group(text, char) from anon;
revoke execute on function public.accept_group_invite(text) from anon;
revoke execute on function public.is_group_member(uuid) from anon;
revoke execute on function public.is_group_owner(uuid) from anon;
