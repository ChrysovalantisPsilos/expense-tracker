-- 0091: the account's language, for the Greek translation.
--
-- profiles.language is the language the user picked in Settings › Language:
-- 'en' or 'el'. Null = "Follow my device" (the default): the app then uses
-- the device's languages (Greek when any is Greek, else English). It follows
-- the user across devices, and the server will read it to write emails,
-- pushes and PDFs in the same language (docs/I18N.md, "Server texts").
--
-- Like whats_new_seen (0087) the owner updates it directly, through the
-- column grant below, and RLS (profile_update, 0052) limits that to their own
-- row. The CHECK keeps it to the languages the app has.
--
-- A preference, not financial data: a backup leaves it out as UI state;
-- export_my_data() includes it with the rest of the profile row.

alter table public.profiles
  add column if not exists language text null
    constraint profiles_language_check check (language in ('en', 'el'));

grant update (language) on public.profiles to authenticated;
