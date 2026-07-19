-- Hardening pass: resolve Supabase security-advisor warnings.

-- Pin search_path on the updated_at trigger function.
alter function public.touch_updated_at() set search_path = '';

-- handle_new_user is a trigger only — it must never be callable over the API.
-- (Triggers still fire regardless of EXECUTE grants.)
revoke execute on function public.handle_new_user() from anon, authenticated, public;

-- seed_default_categories is called by a signed-in user after signup (it uses
-- auth.uid() and only ever writes the caller's own rows). Keep EXECUTE for
-- `authenticated`, remove it for anonymous callers.
revoke execute on function public.seed_default_categories() from anon, public;
grant execute on function public.seed_default_categories() to authenticated;
