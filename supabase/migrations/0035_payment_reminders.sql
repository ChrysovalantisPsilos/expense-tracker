-- Payment reminders: opt-in per recurring rule, delivered via the in-app bell
-- and web push. A daily pg_cron job calls the send-reminders edge function,
-- which finds rules whose reminder window opened (next_run minus
-- remind_days_before), inserts a bell notification, and pushes to the user's
-- subscribed devices. Secrets (VAPID keys + the cron shared secret) live in
-- Vault — never in this file.

-- ---------------------------------------------------------------------------
-- 1) Per-rule reminder config. null = no reminder (opt-in). last_reminded_for
--    stamps the next_run a reminder was sent for, making the daily job
--    idempotent per occurrence.
-- ---------------------------------------------------------------------------
alter table public.recurring_rules
  add column if not exists remind_days_before int
    check (remind_days_before between 1 and 60),
  add column if not exists last_reminded_for date;

create index if not exists recurring_remind_idx
  on public.recurring_rules(next_run)
  where is_active and remind_days_before is not null;

-- ---------------------------------------------------------------------------
-- 2) Web-push subscriptions — one row per browser/device. endpoint is unique
--    across users: the same browser re-subscribed under a different account
--    must move, not duplicate (see save_push_subscription).
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subs_user_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;
create policy ps_select on public.push_subscriptions
  for select using (auth.uid() = user_id);
create policy ps_delete on public.push_subscriptions
  for delete using (auth.uid() = user_id);

-- Writes go through this instead of direct insert/upsert: if the endpoint
-- already belongs to another account (same browser, different login), RLS
-- would block the takeover — so reassign it here, definer-side.
create or replace function public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth);
end $$;
revoke execute on function public.save_push_subscription(text, text, text)
  from anon, public;
grant execute on function public.save_push_subscription(text, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Secrets access for the edge function (service_role only). Returns the
--    Vault secrets the sender needs: the cron shared secret + VAPID keys.
-- ---------------------------------------------------------------------------
create or replace function public.reminder_secrets()
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(name, decrypted_secret), '{}'::jsonb)
  from vault.decrypted_secrets
  where name in ('reminder_cron_secret', 'vapid_public_key',
                 'vapid_private_key', 'vapid_subject');
$$;
revoke execute on function public.reminder_secrets() from anon, authenticated, public;
grant execute on function public.reminder_secrets() to service_role;

-- ---------------------------------------------------------------------------
-- 4) Daily cron → edge function. The function authenticates the call by
--    comparing x-cron-secret against the same Vault secret (verify_jwt off).
--    08:00 UTC — a humane reminder hour, well after the 02:00 materializer.
-- ---------------------------------------------------------------------------
create extension if not exists pg_net;

create or replace function public.send_payment_reminders()
returns void language plpgsql security definer set search_path = public as $$
declare
  secret text;
begin
  select decrypted_secret into secret
  from vault.decrypted_secrets where name = 'reminder_cron_secret';
  if secret is null then
    raise warning 'reminder_cron_secret not set in Vault; skipping reminders';
    return;
  end if;
  perform net.http_post(
    url     := 'https://ctvdljzybbujuywppixo.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cron-secret', secret),
    body    := '{}'::jsonb
  );
end $$;
revoke execute on function public.send_payment_reminders() from anon, authenticated, public;

select cron.unschedule('send-payment-reminders')
  where exists (select 1 from cron.job where jobname = 'send-payment-reminders');
select cron.schedule('send-payment-reminders', '0 8 * * *',
  $cron$select public.send_payment_reminders();$cron$);
