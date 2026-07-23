-- Environment-agnostic delivery hooks. notify_fanout and
-- send_payment_reminders used to hardcode one project's functions URL, which
-- breaks the moment a second environment (prod) applies the same migrations.
-- The base URL now lives in Vault as 'project_url' (set per environment,
-- e.g. https://<ref>.supabase.co); both hooks no-op safely until it exists.

create or replace function public.notify_fanout()
returns trigger language plpgsql security definer set search_path = public as $$
declare secret text; base_url text;
begin
  select decrypted_secret into secret
  from vault.decrypted_secrets where name = 'reminder_cron_secret';
  select decrypted_secret into base_url
  from vault.decrypted_secrets where name = 'project_url';
  if secret is null or base_url is null then return NEW; end if;
  perform net.http_post(
    url     := base_url || '/functions/v1/notify-user',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cron-secret', secret),
    body    := jsonb_build_object('notification_id', NEW.id)
  );
  return NEW;
end $$;
revoke execute on function public.notify_fanout() from anon, authenticated, public;

create or replace function public.send_payment_reminders()
returns void language plpgsql security definer set search_path = public as $$
declare secret text; base_url text;
begin
  select decrypted_secret into secret
  from vault.decrypted_secrets where name = 'reminder_cron_secret';
  select decrypted_secret into base_url
  from vault.decrypted_secrets where name = 'project_url';
  if secret is null or base_url is null then
    raise warning 'reminder_cron_secret/project_url not set in Vault; skipping reminders';
    return;
  end if;
  perform net.http_post(
    url     := base_url || '/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cron-secret', secret),
    body    := '{}'::jsonb
  );
end $$;
revoke execute on function public.send_payment_reminders() from anon, authenticated, public;
