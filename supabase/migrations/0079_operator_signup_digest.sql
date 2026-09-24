-- 0079: a daily sign-up count for the operator — "N new sign-ups yesterday ·
-- M accounts in total", emailed by the edge function operator-digest. A count
-- only: no addresses, names or ids leave the database.
--
-- 1. operator_digest_log — one row per UTC day a digest was sent (claimed
--    before sending, released if Resend refused it), so a day is emailed at
--    most once however often the job runs. RLS on, no client grants or
--    policies (server-only).
-- 2. signup_digest(day) — the counts for a UTC day (default: yesterday) and
--    whether it was already sent. Accounts are auth.users rows; deleted
--    accounts are gone (or soft-deleted) and are not counted.
-- 3. operator_signup_email() — the recipient, from the Vault secret
--    operator_signup_email. Not in the repo; created only on PROD, so the same
--    code stays inert on TEST (no secret → no call, no email).
-- 4. Cron: daily at 06:00 UTC (07:00 Brussels in winter, 08:00 in summer).
--    Calls the function (Vault project_url + reminder_cron_secret, as 0073/
--    0076) only when a recipient is set, yesterday had a sign-up and it
--    wasn't sent yet.
--
-- Every function is SECURITY DEFINER with a pinned search_path and not
-- callable by anon/authenticated.

-- ===========================================================================
-- 1. The send log
-- ===========================================================================
create table if not exists public.operator_digest_log (
  day     date primary key,
  sent_at timestamptz not null default now()
);
alter table public.operator_digest_log enable row level security;
revoke all on public.operator_digest_log from public, anon, authenticated;

-- ===========================================================================
-- 2. The counts
-- ===========================================================================
create or replace function public.signup_digest(
  p_day date default ((now() at time zone 'utc')::date - 1))
returns jsonb language sql stable security definer
set search_path = public, pg_temp as $$
  with b as (
    select p_day::timestamp at time zone 'utc' as day_start,
           (p_day + 1)::timestamp at time zone 'utc' as day_end
  )
  select jsonb_build_object(
    'day', p_day,
    'new_count', (select count(*) from auth.users u, b
                   where u.deleted_at is null
                     and u.created_at >= b.day_start and u.created_at < b.day_end),
    'total', (select count(*) from auth.users u, b
               where u.deleted_at is null and u.created_at < b.day_end),
    'sent', exists (select 1 from public.operator_digest_log l where l.day = p_day))
$$;

-- Claim a day before sending: true only for the one call that inserted it.
create or replace function public.claim_operator_digest(p_day date)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  insert into public.operator_digest_log (day) values (p_day) on conflict (day) do nothing;
  return found;
end $$;

-- The send failed: free the day so a rerun can try again.
create or replace function public.release_operator_digest(p_day date)
returns void language sql security definer
set search_path = public, pg_temp as $$
  delete from public.operator_digest_log where day = p_day
$$;

-- ===========================================================================
-- 3. The recipient (Vault)
-- ===========================================================================
create or replace function public.operator_signup_email()
returns text language sql stable security definer
set search_path = public, pg_temp as $$
  select nullif(btrim(decrypted_secret), '') from vault.decrypted_secrets
   where name = 'operator_signup_email' limit 1
$$;

-- ===========================================================================
-- 4. Cron hook → edge function operator-digest (x-cron-secret, as 0073)
-- ===========================================================================
create or replace function public.run_operator_digest()
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare d jsonb; secret text; base_url text;
begin
  if public.operator_signup_email() is null then return; end if;   -- not enabled here
  d := public.signup_digest();
  if (d->>'sent')::boolean or (d->>'new_count')::int < 1 then return; end if;
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'reminder_cron_secret';
  select decrypted_secret into base_url from vault.decrypted_secrets where name = 'project_url';
  if secret is null or base_url is null then
    raise warning 'reminder_cron_secret/project_url not set in Vault; skipping operator digest';
    return;
  end if;
  perform net.http_post(
    url     := base_url || '/functions/v1/operator-digest',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body    := '{}'::jsonb
  );
end $$;

revoke execute on function public.signup_digest(date) from public, anon, authenticated;
revoke execute on function public.claim_operator_digest(date) from public, anon, authenticated;
revoke execute on function public.release_operator_digest(date) from public, anon, authenticated;
revoke execute on function public.operator_signup_email() from public, anon, authenticated;
revoke execute on function public.run_operator_digest() from public, anon, authenticated;
grant execute on function public.signup_digest(date) to service_role;
grant execute on function public.claim_operator_digest(date) to service_role;
grant execute on function public.release_operator_digest(date) to service_role;
grant execute on function public.operator_signup_email() to service_role;

select cron.unschedule('operator-signup-digest')
  where exists (select 1 from cron.job where jobname = 'operator-signup-digest');
select cron.schedule('operator-signup-digest', '0 6 * * *',
  $cron$select public.run_operator_digest();$cron$);
