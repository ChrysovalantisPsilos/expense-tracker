-- First-run setup wizard: a per-account "have they finished onboarding" flag.
-- Null = new account, show the wizard; stamped = done (or dismissed), so it
-- never shows again — even on another device (unlike the per-browser passkey /
-- notification prompt flags). Set through the normal own-row profiles RLS.

alter table public.profiles
  add column if not exists onboarded_at timestamptz;
