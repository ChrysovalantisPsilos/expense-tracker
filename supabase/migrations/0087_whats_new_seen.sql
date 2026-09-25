-- 0087: "What's new" is shown once per ACCOUNT, not once per device.
--
-- profiles.whats_new_seen holds the id of the newest "What's new" release the
-- account has seen (src/features/whatsnew/releases.js; an id is the release
-- day, 'YYYY-MM-DD'). Null = nothing recorded yet: the app then decides from
-- onboarded_at (a new account marks the newest release seen silently).
-- Until now this lived in each device's localStorage ('budge:whatsNewSeen');
-- the app moves an existing device value here once, then deletes the key.
--
-- Like yearly_separate (0068) and tour_done (0069) it follows the user across
-- devices: the owner updates it directly, through the column grant below, and
-- RLS (profile_update, 0052) limits that to their own row. The CHECK keeps it
-- a release id (the shape test/whatsNew.test.js enforces on releases.js), so
-- nothing else can be stored in it.
--
-- A UI state only: not part of a backup, and nothing on the server reads it.

alter table public.profiles
  add column if not exists whats_new_seen text null
    constraint profiles_whats_new_seen_check
      check (whats_new_seen ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$');

grant update (whats_new_seen) on public.profiles to authenticated;
