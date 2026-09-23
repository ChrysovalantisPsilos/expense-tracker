-- 0073: GDPR — storage limitation (Art. 5(1)(e)). Automatic, daily, idempotent
-- and environment-agnostic (no project URLs or keys in here: delivery reads
-- Vault's project_url / reminder_cron_secret like 0043).
--
-- Retention periods (stated in the Privacy Notice and docs/GDPR.md; the
-- notice's numbers are checked against this file by test/legal.test.js):
--   * notifications ........................ 90 days
--   * group change log (group_audit_log) ... 2 years
--   * rate-limit counters .................. 30 days at most (0058's purge
--     already clears them after 2 days; this is the backstop)
--   * Supabase Auth's sign-in audit trail (auth.audit_log_entries, holds IP
--     addresses) when the project keeps it in the database .... 30 days
--   * inactive accounts: an account nobody has signed in to or used for
--     23 months is sent one warning email; at 24 months — and never sooner
--     than 28 days after that warning — it is deleted exactly as if its owner
--     had pressed "Delete my account" (edge function purge-inactive, which
--     shares that code with delete-account). Signing in, or using the app with
--     a saved session, restarts the clock. No warning sent = no deletion.
--   Your own records (transactions, budgets, …) are kept until you delete
--   them or your account.
--
-- "Used" = the latest of: account creation, last sign-in, and the last time
-- any of its sessions was created or refreshed (the app refreshes a saved
-- session whenever it is opened, without a new sign-in).

-- ===========================================================================
-- Inactivity warnings sent (so a warning is never sent twice for the same
-- stretch of inactivity). Server-only; the owner may read theirs.
-- ===========================================================================
create table if not exists public.inactivity_notices (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  warned_at timestamptz not null default now()
);
alter table public.inactivity_notices enable row level security;
revoke all on public.inactivity_notices from public, anon, authenticated;
grant select on public.inactivity_notices to authenticated;
drop policy if exists inactivity_notices_select on public.inactivity_notices;
create policy inactivity_notices_select on public.inactivity_notices
  for select to authenticated using ((select auth.uid()) = user_id);

-- ===========================================================================
-- Daily purge of expired rows. Returns what it deleted, per table.
-- ===========================================================================
create or replace function public.purge_expired_personal_data()
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare n_notif int; n_audit int; n_rl int; n_auth int := 0; n_warn int;
begin
  delete from public.notifications where created_at < now() - interval '90 days';
  get diagnostics n_notif = row_count;

  delete from public.group_audit_log where created_at < now() - interval '2 years';
  get diagnostics n_audit = row_count;

  delete from public.rate_limits where window_start < now() - interval '30 days';
  get diagnostics n_rl = row_count;

  if to_regclass('auth.audit_log_entries') is not null then
    execute $q$delete from auth.audit_log_entries where created_at < now() - interval '30 days'$q$;
    get diagnostics n_auth = row_count;
  end if;

  -- A warning the owner answered by coming back is spent: drop it.
  delete from public.inactivity_notices n
   using public.inactive_account_activity() a
   where a.user_id = n.user_id and a.last_active > n.warned_at;
  get diagnostics n_warn = row_count;

  return jsonb_build_object('notifications', n_notif, 'group_audit_log', n_audit,
    'rate_limits', n_rl, 'auth_audit_log', n_auth, 'inactivity_notices', n_warn);
end $$;

-- Each account's last activity (see the header).
create or replace function public.inactive_account_activity()
returns table (user_id uuid, email text, last_active timestamptz)
language sql stable security definer
set search_path = public, pg_temp as $$
  select u.id, u.email::text,
         greatest(u.created_at, u.last_sign_in_at,
                  (select max(greatest(s.created_at, s.updated_at, s.refreshed_at at time zone 'UTC'))
                     from auth.sessions s where s.user_id = u.id))
    from auth.users u
$$;

-- Who the sweep acts on today: 'warn' (23 months idle, not yet warned for
-- this stretch) or 'delete' (24 months idle, warned at least 28 days ago and
-- idle ever since).
create or replace function public.inactive_accounts()
returns table (user_id uuid, email text, last_active timestamptz, warned_at timestamptz, action text)
language sql stable security definer
set search_path = public, pg_temp as $$
  select a.user_id, a.email, a.last_active, n.warned_at,
         case when n.warned_at >= a.last_active then 'delete' else 'warn' end
    from public.inactive_account_activity() a
    left join public.inactivity_notices n on n.user_id = a.user_id
   where (a.last_active < now() - interval '23 months'
          and (n.warned_at is null or n.warned_at < a.last_active))
      or (a.last_active < now() - interval '24 months'
          and n.warned_at >= a.last_active
          and n.warned_at <= now() - interval '28 days')
$$;

-- Stamp a warning as sent (the sweep calls this only after the email went out).
create or replace function public.mark_inactivity_warned(p_user uuid)
returns void language sql security definer
set search_path = public, pg_temp as $$
  insert into public.inactivity_notices (user_id, warned_at) values (p_user, now())
  on conflict (user_id) do update set warned_at = excluded.warned_at
$$;

-- Cron hook → edge function purge-inactive (x-cron-secret, as 0043).
create or replace function public.run_inactivity_sweep()
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare secret text; base_url text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'reminder_cron_secret';
  select decrypted_secret into base_url from vault.decrypted_secrets where name = 'project_url';
  if secret is null or base_url is null then
    raise warning 'reminder_cron_secret/project_url not set in Vault; skipping inactivity sweep';
    return;
  end if;
  perform net.http_post(
    url     := base_url || '/functions/v1/purge-inactive',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body    := '{}'::jsonb
  );
end $$;

revoke execute on function public.purge_expired_personal_data() from public, anon, authenticated;
revoke execute on function public.inactive_account_activity() from public, anon, authenticated;
revoke execute on function public.inactive_accounts() from public, anon, authenticated;
revoke execute on function public.mark_inactivity_warned(uuid) from public, anon, authenticated;
revoke execute on function public.run_inactivity_sweep() from public, anon, authenticated;
grant execute on function public.inactive_accounts() to service_role;
grant execute on function public.mark_inactivity_warned(uuid) to service_role;

-- Daily (idempotent: unschedule any prior job first).
select cron.unschedule('gdpr-retention')
  where exists (select 1 from cron.job where jobname = 'gdpr-retention');
select cron.schedule('gdpr-retention', '15 4 * * *',
  $cron$select public.purge_expired_personal_data();$cron$);

select cron.unschedule('inactive-accounts')
  where exists (select 1 from cron.job where jobname = 'inactive-accounts');
select cron.schedule('inactive-accounts', '45 4 * * *',
  $cron$select public.run_inactivity_sweep();$cron$);
