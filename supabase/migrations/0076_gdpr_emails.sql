-- 0076: GDPR service emails — what the database records so the edge function
-- privacy-emails can send them, coalesced, exactly once. (The deletion
-- confirmations and the privacy-request receipt are sent straight from their
-- edge functions and need nothing here.) Templates: _shared/gdprEmails.ts.
--
-- 1. privacy_email_queue — one row per (user, kind), coalescing events:
--      consent_change  any settings change of a consent switch (a
--                      public.consents row with source 'settings'). Due 15
--                      minutes after the first change and never sooner than
--                      15 minutes after the last email, so a burst of toggles
--                      becomes one email with the final state.
--      data_export     every export_my_data() call. Due at once, but never
--                      sooner than an hour after the last email; the email
--                      counts the downloads it covers.
--    The sweep claims due rows (a 10-minute lease), sends, then finishes each
--    one: sent → cleared, unless something newer arrived meanwhile (then due
--    again after the window); failed → retried with back-off, dropped after 5.
-- 2. legal_update_notices — per user, the Privacy Notice / Terms versions last
--    emailed about. legal_update_recipients() selects who still needs an
--    email for the versions in force: signed up before them, not yet accepted
--    them, not yet emailed about them.
-- 3. Cron: the queue every 5 minutes, the legal sweep hourly — each calls the
--    edge function (Vault project_url + reminder_cron_secret, as 0073) only
--    when something is due.
--
-- Both tables: RLS on, no client grants or policies (server-only). All the
-- functions are SECURITY DEFINER with a pinned search_path; none is callable
-- by anon/authenticated except export_my_data() (as before). Rate limits: the
-- events come from already rate-limited paths (switch changes 60/h, exports
-- 10/h), and the coalescing windows cap the emails at 4/h and 1/h per user.

-- ===========================================================================
-- 1. The queue
-- ===========================================================================
create table if not exists public.privacy_email_queue (
  user_id        uuid not null references auth.users(id) on delete cascade,
  kind           text not null check (kind in ('consent_change', 'data_export')),
  due_at         timestamptz,              -- null = nothing to send
  last_event_at  timestamptz not null,
  pending_events int not null default 0,   -- events since the last email
  last_sent_at   timestamptz,
  attempts       int not null default 0,
  primary key (user_id, kind)
);
create index if not exists privacy_email_queue_due_idx
  on public.privacy_email_queue (due_at) where due_at is not null;
alter table public.privacy_email_queue enable row level security;
revoke all on public.privacy_email_queue from public, anon, authenticated;

-- Record one event. (delay, window) per kind — see the header.
create or replace function public.enqueue_privacy_email(p_user uuid, p_kind text)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare delay interval; win interval;
begin
  case p_kind
    when 'consent_change' then delay := interval '15 minutes'; win := interval '15 minutes';
    when 'data_export'    then delay := interval '0';          win := interval '1 hour';
    else raise exception 'unknown privacy email kind %', p_kind;
  end case;
  insert into public.privacy_email_queue as q (user_id, kind, due_at, last_event_at, pending_events)
  values (p_user, p_kind, now() + delay, now(), 1)
  on conflict (user_id, kind) do update set
    last_event_at  = now(),
    pending_events = q.pending_events + 1,
    attempts       = case when q.due_at is null then 0 else q.attempts end,
    -- Already pending: keep its time (the burst is coalesced into it).
    due_at         = coalesce(q.due_at, greatest(now() + delay, coalesce(q.last_sent_at + win, now())));
end $$;
revoke execute on function public.enqueue_privacy_email(uuid, text) from public, anon, authenticated;

-- A consent switch changed in Settings (0072's log_preference_consent writes
-- the row). Acceptance of the legal documents is not a switch.
create or replace function public.enqueue_consent_email()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  perform public.enqueue_privacy_email(NEW.user_id, 'consent_change');
  return null;
end $$;
revoke execute on function public.enqueue_consent_email() from public, anon, authenticated;
drop trigger if exists trg_consents_email on public.consents;
create trigger trg_consents_email after insert on public.consents
  for each row
  when (NEW.source = 'settings'
        and NEW.purpose in ('weekly_digest', 'email_notifications', 'push_notifications'))
  execute function public.enqueue_consent_email();

-- export_my_data(): the 0074 body now builds the document; the callable
-- wrapper also records the export for the security email — in the same
-- transaction, so an export can't happen without it — and adds the two new
-- tables to the export.
do $$
begin
  if to_regprocedure('public.build_my_data_export()') is null then
    alter function public.export_my_data() rename to build_my_data_export;
  end if;
end $$;
revoke execute on function public.build_my_data_export() from public, anon, authenticated;

create or replace function public.export_my_data()
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); doc jsonb;
begin
  doc := public.build_my_data_export();   -- checks the caller and the 10/h limit
  perform public.enqueue_privacy_email(uid, 'data_export');
  return doc || jsonb_build_object(
    'privacy_emails', (select coalesce(jsonb_agg(jsonb_build_object(
        'kind', q.kind, 'last_event_at', q.last_event_at, 'last_sent_at', q.last_sent_at,
        'next_due_at', q.due_at) order by q.kind), '[]'::jsonb)
      from public.privacy_email_queue q where q.user_id = uid),
    'legal_update_emails', (select coalesce(jsonb_agg(jsonb_build_object(
        'privacy_version', n.privacy_version, 'terms_version', n.terms_version,
        'emailed_at', n.emailed_at)), '[]'::jsonb)
      from public.legal_update_notices n where n.user_id = uid));
end $$;

-- The sweep's side (service_role only). Claim: due rows, oldest first, leased
-- for 10 minutes; returns what the email needs (address, and for a consent
-- email the switches' state now).
create or replace function public.claim_privacy_emails(p_limit int)
returns table (user_id uuid, kind text, email text, last_event_at timestamptz, pending_events int,
               notify_digest boolean, notify_email boolean, notify_push boolean)
language sql security definer
set search_path = public, pg_temp as $$
  with due as (
    select q.user_id, q.kind from public.privacy_email_queue q
     where q.due_at <= now()
     order by q.due_at
     limit greatest(p_limit, 0)
     for update skip locked
  ), leased as (
    update public.privacy_email_queue q set due_at = now() + interval '10 minutes'
      from due where q.user_id = due.user_id and q.kind = due.kind
    returning q.user_id, q.kind, q.last_event_at, q.pending_events
  )
  select l.user_id, l.kind, u.email::text, l.last_event_at, l.pending_events,
         coalesce(p.notify_digest, false), coalesce(p.notify_email, true), coalesce(p.notify_push, true)
    from leased l
    join auth.users u on u.id = l.user_id
    left join public.profiles p on p.id = l.user_id
$$;

-- Finish a claimed row. p_event_at / p_events = what the claim covered.
create or replace function public.finish_privacy_email(
  p_user uuid, p_kind text, p_event_at timestamptz, p_events int, p_sent boolean)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare win interval := case p_kind when 'consent_change' then interval '15 minutes' else interval '1 hour' end;
begin
  if p_sent then
    update public.privacy_email_queue q set
      last_sent_at   = now(),
      attempts       = 0,
      pending_events = greatest(q.pending_events - p_events, 0),
      due_at         = case when q.last_event_at > p_event_at then now() + win end
     where q.user_id = p_user and q.kind = p_kind;
  else
    update public.privacy_email_queue q set
      attempts       = case when q.attempts + 1 >= 5 then 0 else q.attempts + 1 end,
      pending_events = case when q.attempts + 1 >= 5 then 0 else q.pending_events end,
      due_at         = case when q.attempts + 1 >= 5 then null
                            else now() + (q.attempts + 1) * interval '30 minutes' end
     where q.user_id = p_user and q.kind = p_kind;
  end if;
end $$;

-- ===========================================================================
-- 2. Legal-document update emails
-- ===========================================================================
create table if not exists public.legal_update_notices (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  privacy_version text,
  terms_version   text,
  emailed_at      timestamptz not null default now()
);
alter table public.legal_update_notices enable row level security;
revoke all on public.legal_update_notices from public, anon, authenticated;

-- Who still needs an email about the versions in force, oldest accounts
-- first, and which documents they haven't accepted. The versions in force are
-- returned too, so the sender can check its texts match them.
create or replace function public.legal_update_recipients(p_limit int)
returns table (user_id uuid, email text, privacy_changed boolean, terms_changed boolean,
               privacy_version text, terms_version text)
language sql stable security definer
set search_path = public, pg_temp as $$
  with v as (
    select cv->>'privacy' as privacy, cv->>'terms' as terms,
           greatest(cv->>'privacy', cv->>'terms')::date as effective
      from (select public.current_legal_versions() as cv) x
  ), acc as (
    select u.id, u.email::text as email, u.created_at,
      (select c.version from public.consents c
        where c.user_id = u.id and c.purpose = 'privacy_notice' and c.granted
        order by c.created_at desc, c.id limit 1) as privacy,
      (select c.version from public.consents c
        where c.user_id = u.id and c.purpose = 'terms' and c.granted
        order by c.created_at desc, c.id limit 1) as terms
      from auth.users u
  )
  select a.id, a.email, a.privacy is distinct from v.privacy, a.terms is distinct from v.terms,
         v.privacy, v.terms
    from acc a cross join v
    left join public.legal_update_notices n on n.user_id = a.id
   where a.email is not null
     and a.created_at < v.effective
     and (a.privacy is distinct from v.privacy or a.terms is distinct from v.terms)
     and (n.user_id is null
          or n.privacy_version is distinct from v.privacy
          or n.terms_version is distinct from v.terms)
   order by a.created_at, a.id
   limit greatest(p_limit, 0)
$$;

-- Stamp the versions a user was emailed about (only after Resend accepted it).
create or replace function public.mark_legal_update_emailed(p_user uuid, p_privacy text, p_terms text)
returns void language sql security definer
set search_path = public, pg_temp as $$
  insert into public.legal_update_notices (user_id, privacy_version, terms_version, emailed_at)
  values (p_user, p_privacy, p_terms, now())
  on conflict (user_id) do update
    set privacy_version = excluded.privacy_version, terms_version = excluded.terms_version,
        emailed_at = excluded.emailed_at
$$;

-- ===========================================================================
-- 3. Cron hooks → edge function privacy-emails (x-cron-secret, as 0073)
-- ===========================================================================
create or replace function public.call_privacy_emails(p_mode text)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare secret text; base_url text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'reminder_cron_secret';
  select decrypted_secret into base_url from vault.decrypted_secrets where name = 'project_url';
  if secret is null or base_url is null then
    raise warning 'reminder_cron_secret/project_url not set in Vault; skipping privacy emails';
    return;
  end if;
  perform net.http_post(
    url     := base_url || '/functions/v1/privacy-emails',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body    := jsonb_build_object('mode', p_mode)
  );
end $$;

create or replace function public.run_privacy_email_queue()
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.privacy_email_queue where due_at <= now()) then
    perform public.call_privacy_emails('queue');
  end if;
end $$;

create or replace function public.run_legal_update_sweep()
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.legal_update_recipients(1)) then
    perform public.call_privacy_emails('legal');
  end if;
end $$;

revoke execute on function public.claim_privacy_emails(int) from public, anon, authenticated;
revoke execute on function public.finish_privacy_email(uuid, text, timestamptz, int, boolean) from public, anon, authenticated;
revoke execute on function public.legal_update_recipients(int) from public, anon, authenticated;
revoke execute on function public.mark_legal_update_emailed(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.call_privacy_emails(text) from public, anon, authenticated;
revoke execute on function public.run_privacy_email_queue() from public, anon, authenticated;
revoke execute on function public.run_legal_update_sweep() from public, anon, authenticated;
grant execute on function public.claim_privacy_emails(int) to service_role;
grant execute on function public.finish_privacy_email(uuid, text, timestamptz, int, boolean) to service_role;
grant execute on function public.legal_update_recipients(int) to service_role;
grant execute on function public.mark_legal_update_emailed(uuid, text, text) to service_role;
revoke execute on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

select cron.unschedule('privacy-email-queue')
  where exists (select 1 from cron.job where jobname = 'privacy-email-queue');
select cron.schedule('privacy-email-queue', '*/5 * * * *',
  $cron$select public.run_privacy_email_queue();$cron$);

select cron.unschedule('legal-update-emails')
  where exists (select 1 from cron.job where jobname = 'legal-update-emails');
select cron.schedule('legal-update-emails', '20 * * * *',
  $cron$select public.run_legal_update_sweep();$cron$);
