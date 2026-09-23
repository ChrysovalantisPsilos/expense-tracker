-- 0075: a server-side "developer" flag on the profile. It unlocks the
-- live ⇄ test site switch in the app (top bar, sidebar, Settings) and nothing
-- else — it grants no data access.
--
-- Not client-writable: profiles UPDATE is column-granted (0053, then 0056 /
-- 0068 / 0069 / 0072 add their own columns), and this column is deliberately
-- left out of that set. There is no client INSERT path either (0053 revoked
-- insert; rows come from the handle_new_user signup trigger, which names its
-- columns and never this one), so a new profile always starts false. The flag
-- is set by an operator with SQL; this migration sets it for nobody.
--
-- The owner reads it through the existing own-row select (profile_select, 0052).

alter table public.profiles
  add column if not exists is_developer boolean not null default false;

-- Belt and braces: make the absence of any client write grant explicit.
revoke insert (is_developer), update (is_developer) on public.profiles from anon, authenticated;
