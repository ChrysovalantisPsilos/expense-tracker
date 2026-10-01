-- 0108: push notifications on the iOS apps (Apple Push Notification service).
--
-- The native apps (Budgeer, com.budgeer.app, on PROD; Budgeer Dev,
-- com.budgeer.app.dev, on TEST) register for remote notifications and hand
-- the server their APNs device token. notify-user (_shared/apns.ts) sends
-- each notification to them beside the browsers' web push, under the same
-- switch (profiles.notify_push).
--
--   1. apns_devices: one row per app install (the device token, unique;
--      which APNs host it belongs to: 'sandbox' for a build run from Xcode,
--      'production' for TestFlight and the App Store). RLS: the owner reads
--      and deletes their own rows; nobody inserts or updates directly (the
--      grants are revoked), only through save_apns_token. A BEFORE trigger
--      forces user_id to the caller whenever a user session writes.
--   2. save_apns_token(token, env): the caller's install. Refused for the
--      shared demo login (as save_push_subscription, 0090), a token that
--      isn't lowercase hex of a sane length, an unknown env, and past 20
--      saves an hour. A token held by another account moves to the caller
--      (the same phone after a sign-in switch: only that install has it).
--      At most 10 installs per account: the least recently seen go.
--   3. delete_apns_token(token): the app's sign-out drops its own install.
--   4. Deleted with the account (on delete cascade), in export_my_data()
--      (which service, the environment and when; never the token), and
--      wiped with the demo accounts (demo_wipe).
--
-- Both functions pin search_path, are SECURITY DEFINER, revoked from
-- public/anon and granted to authenticated only.

-- 1 ---------------------------------------------------------------------------
create table if not exists public.apns_devices (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  token        text not null unique,
  env          text not null,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint apns_devices_token_format check (token ~ '^[0-9a-f]{64,200}$' and char_length(token) % 2 = 0),
  constraint apns_devices_env check (env in ('sandbox', 'production'))
);
create index if not exists apns_devices_user_idx on public.apns_devices(user_id);

alter table public.apns_devices enable row level security;
revoke all on public.apns_devices from anon;
revoke insert, update on public.apns_devices from authenticated;
grant select, delete on public.apns_devices to authenticated;

drop policy if exists apns_select on public.apns_devices;
drop policy if exists apns_delete on public.apns_devices;
create policy apns_select on public.apns_devices for select to authenticated
  using ((select auth.uid()) = user_id);
create policy apns_delete on public.apns_devices for delete to authenticated
  using ((select auth.uid()) = user_id);

-- The owner is never the client's word: a user session's write is the
-- caller's row (the service role, which only deletes, has no auth.uid()).
create or replace function public.apns_devices_owner()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null then
    NEW.user_id := auth.uid();
  end if;
  return NEW;
end $$;
revoke execute on function public.apns_devices_owner() from public, anon, authenticated;
drop trigger if exists trg_apns_devices_owner on public.apns_devices;
create trigger trg_apns_devices_owner before insert or update on public.apns_devices
  for each row execute function public.apns_devices_owner();

-- 2 ---------------------------------------------------------------------------
create or replace function public.save_apns_token(p_token text, p_env text)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); tok text := lower(btrim(coalesce(p_token, '')));
begin
  if uid is null then raise exception 'not authenticated'; end if;
  perform public.refuse_if_demo(uid);
  if tok !~ '^[0-9a-f]{64,200}$' or char_length(tok) % 2 <> 0 then
    raise exception 'invalid device token';
  end if;
  if p_env is null or p_env not in ('sandbox', 'production') then
    raise exception 'invalid push environment';
  end if;
  if not public.rate_limit('apns:' || uid, 20, 3600) then
    raise exception 'Too many requests — please try again later.';
  end if;

  insert into public.apns_devices (user_id, token, env)
    values (uid, tok, p_env)
  on conflict (token) do update
    set user_id = uid, env = excluded.env, last_seen_at = now();
  -- At most 10 installs per account: drop the least recently seen.
  delete from public.apns_devices
   where id in (select id from public.apns_devices where user_id = uid
                 order by last_seen_at desc, id offset 10);
end $$;
revoke execute on function public.save_apns_token(text, text) from public, anon;
grant execute on function public.save_apns_token(text, text) to authenticated;

-- 3 ---------------------------------------------------------------------------
create or replace function public.delete_apns_token(p_token text)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  delete from public.apns_devices
   where user_id = uid and token = lower(btrim(coalesce(p_token, '')));
end $$;
revoke execute on function public.delete_apns_token(text) from public, anon;
grant execute on function public.delete_apns_token(text) to authenticated;

-- 4 ---------------------------------------------------------------------------
create or replace function public.export_my_data()
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); doc jsonb; k text;
begin
  doc := public.build_my_data_export();   -- checks the caller and the 10/h limit
  perform public.enqueue_privacy_email(uid, 'data_export');
  k := public.app_enc_key();
  return doc || jsonb_build_object(
    'privacy_emails', (select coalesce(jsonb_agg(jsonb_build_object(
        'kind', q.kind, 'last_event_at', q.last_event_at, 'last_sent_at', q.last_sent_at,
        'next_due_at', q.due_at) order by q.kind), '[]'::jsonb)
      from public.privacy_email_queue q where q.user_id = uid),
    'legal_update_emails', (select coalesce(jsonb_agg(jsonb_build_object(
        'privacy_version', n.privacy_version, 'terms_version', n.terms_version,
        'emailed_at', n.emailed_at)), '[]'::jsonb)
      from public.legal_update_notices n where n.user_id = uid),
    'recurring_plan', (select jsonb_build_object(
        'plan', public.dec_text(p.payload_enc, k)::jsonb, 'updated_at', p.updated_at)
      from public.recurring_plans p where p.user_id = uid),
    'recurring_plan_undo', (select jsonb_build_object(
        'applied_at', u.applied_at, 'change_count', u.change_count,
        'snapshot', public.dec_text(u.snapshot_enc, k)::jsonb)
      from public.recurring_plan_undo u where u.user_id = uid),
    'meal_vouchers', (select jsonb_build_object(
        'setup', public.dec_text(m.payload_enc, k)::jsonb, 'updated_at', m.updated_at)
      from public.meal_vouchers m where m.user_id = uid),
    'salary_history', (select jsonb_build_object(
        'notes', public.dec_text(s.payload_enc, k)::jsonb, 'updated_at', s.updated_at)
      from public.salary_history s where s.user_id = uid),
    'ai_month_summaries', (select coalesce(jsonb_agg(jsonb_build_object(
        'month', to_char(a.month, 'YYYY-MM'), 'summary', public.dec_text(a.payload_enc, k)::jsonb,
        'written_at', a.created_at) order by a.month), '[]'::jsonb)
      from public.ai_month_summaries a where a.user_id = uid),
    'apns_devices', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id, 'push_service', 'Apple Push Notification service', 'environment', d.env,
        'created_at', d.created_at, 'last_seen_at', d.last_seen_at) order by d.created_at), '[]'::jsonb)
      from public.apns_devices d where d.user_id = uid));
end $$;
revoke execute on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

create or replace function public.demo_wipe(p_ids uuid[])
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  delete from public.notifications where user_id = any(p_ids);
  delete from public.groups where owner_id = any(p_ids);
  delete from public.group_invites where created_by = any(p_ids) or invited_user_id = any(p_ids);
  update public.profiles set salary_category_id = null where id = any(p_ids);
  -- The AI helpers off (their consent rows go below); demo_seed turns them
  -- back on for the main login (0106).
  update public.profiles
     set ai_quick_entry = false, ai_import_categories = false, ai_month_summary = false, ai_plan_whatif = false
   where id = any(p_ids);
  delete from public.recurring_plans where user_id = any(p_ids);
  delete from public.recurring_plan_undo where user_id = any(p_ids);
  delete from public.meal_vouchers where user_id = any(p_ids);
  delete from public.salary_history where user_id = any(p_ids);
  delete from public.ai_month_summaries where user_id = any(p_ids);
  delete from public.transactions where user_id = any(p_ids);
  delete from public.recurring_rules where user_id = any(p_ids);
  delete from public.budgets where user_id = any(p_ids);
  delete from public.category_rules where user_id = any(p_ids);
  delete from public.accounts where user_id = any(p_ids);
  delete from public.savings_goals where user_id = any(p_ids);
  delete from public.categories where user_id = any(p_ids);
  delete from public.push_subscriptions where user_id = any(p_ids);
  delete from public.apns_devices where user_id = any(p_ids);
  delete from public.consents where user_id = any(p_ids);
  delete from public.privacy_email_queue where user_id = any(p_ids);
  delete from public.inactivity_notices where user_id = any(p_ids);
  delete from public.legal_update_notices where user_id = any(p_ids);
  delete from public.rate_limits r
   where exists (select 1 from unnest(p_ids) i where position(i::text in r.key) > 0);
end $$;
revoke execute on function public.demo_wipe(uuid[]) from public, anon, authenticated;
