-- 0069: the app tour (a spotlight walk-through that follows the first-run
-- setup wizard, and can be replayed from Settings) — "has this account
-- finished or skipped it?".
--
-- profiles.tour_done follows the user across devices like
-- passkey_reminder_off (0056) and yearly_separate (0068): the owner sets it
-- directly, through the column grant below, and RLS limits that to their own
-- row. False = the app offers the tour again (once per session) after
-- onboarding, i.e. it was started but never finished or skipped.
--
-- Accounts that already finished onboarding before the tour existed have seen
-- the app: they're backfilled as seen, so it never auto-starts for them (they
-- can still replay it from Settings).

alter table public.profiles
  add column if not exists tour_done boolean not null default false;

grant update (tour_done) on public.profiles to authenticated;

update public.profiles set tour_done = true
 where onboarded_at is not null and not tour_done;
