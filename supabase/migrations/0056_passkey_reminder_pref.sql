-- "Don't remind me again" for the passkey prompt, stored on the profile so it
-- follows the user across devices. Profiles UPDATE is column-granted (0053):
-- add this column to the owner-editable set. RLS still limits it to own row.
alter table public.profiles
  add column if not exists passkey_reminder_off boolean not null default false;

grant update (passkey_reminder_off) on public.profiles to authenticated;
