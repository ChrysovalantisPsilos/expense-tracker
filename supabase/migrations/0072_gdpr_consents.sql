-- 0072: GDPR — consent records, legal-document versions, opt-in weekly digest,
-- and anonymised group history when an account is deleted.
--
-- 1. current_legal_versions(): the Privacy Notice and Terms of Use versions
--    in force. JS↔SQL LOCKSTEP pair with LEGAL_VERSIONS in
--    src/features/privacy/legal.js (test/legal.test.js checks they match).
--    Bump both together when a document changes: every signed-in user is then
--    asked to accept the new version before they carry on (the app's gate).
-- 2. public.consents: an append-only history of what each user accepted or
--    switched on/off, and when. Clients can only READ their own rows. Rows are
--    written by server code alone, and a BEFORE trigger stamps created_at with
--    the server clock, so neither the owner nor the time can be forged:
--      * sign-up: the auth.users insert trigger records acceptance when the
--        sign-up form sent the CURRENT versions (a Google sign-up sends none,
--        so it's asked on first sign-in instead);
--      * accept_legal_documents(): the "accept the updated terms" prompt;
--      * the profiles trigger: every change to the digest / email / push
--        switches (rate-limited, since a client could toggle in a loop).
-- 3. profiles.notify_digest: the weekly summary is optional, so it is OFF for
--    new accounts and sent only after opt-in. Accounts that existed before
--    this migration keep receiving it (their current setting), and Settings
--    shows the switch.
-- 4. Deleting an account (an auth.users delete, from delete-account or the
--    inactivity sweep) anonymises what stays behind for the other members of
--    its groups: the member rows it leaves (current and earlier-left) become
--    "Former member" with no link back to the account, and so does the actor
--    name on the group change log.

-- ===========================================================================
-- 1. Versions
-- ===========================================================================
create or replace function public.current_legal_versions()
returns jsonb language sql immutable
set search_path = public, pg_temp as $$
  select jsonb_build_object('privacy', '2026-09-23', 'terms', '2026-09-23')
$$;
-- Not secret (the pages show the same versions); my_legal_status, which runs
-- as the caller, reads it.
revoke execute on function public.current_legal_versions() from public, anon;
grant execute on function public.current_legal_versions() to authenticated;

-- ===========================================================================
-- 2. Consents
-- ===========================================================================
create table if not exists public.consents (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  purpose    text not null check (purpose in
               ('privacy_notice', 'terms', 'weekly_digest', 'email_notifications', 'push_notifications')),
  version    text,
  granted    boolean not null,
  source     text not null check (source in ('signup', 'prompt', 'settings')),
  created_at timestamptz not null default now()
);
create index if not exists consents_user_idx on public.consents (user_id, purpose, created_at desc);

alter table public.consents enable row level security;
revoke all on public.consents from public, anon, authenticated;
grant select on public.consents to authenticated;
drop policy if exists consents_select on public.consents;
create policy consents_select on public.consents
  for select to authenticated using ((select auth.uid()) = user_id);
-- No insert/update/delete policies or grants: the history is append-only and
-- written only by the definer paths below.

-- Server clock, always; and a row written on a client's behalf is theirs.
create or replace function public.consents_guard()
returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin
  NEW.created_at := now();
  if current_user in ('anon', 'authenticated') then
    if auth.uid() is null then raise exception 'not authenticated'; end if;
    NEW.user_id := auth.uid();
  end if;
  return NEW;
end $$;
revoke execute on function public.consents_guard() from public, anon, authenticated;
drop trigger if exists trg_consents_guard on public.consents;
create trigger trg_consents_guard before insert on public.consents
  for each row execute function public.consents_guard();

-- The caller's standing: the versions in force and the latest they accepted.
-- SECURITY INVOKER: it reads through the caller's own RLS.
create or replace function public.my_legal_status()
returns jsonb language sql stable
set search_path = public, pg_temp as $$
  with v as (select public.current_legal_versions() as v),
  acc as (
    select
      (select c.version from public.consents c
        where c.user_id = auth.uid() and c.purpose = 'privacy_notice' and c.granted
        order by c.created_at desc, c.id limit 1) as privacy,
      (select c.version from public.consents c
        where c.user_id = auth.uid() and c.purpose = 'terms' and c.granted
        order by c.created_at desc, c.id limit 1) as terms
  )
  select jsonb_build_object(
    'privacy_version', v.v->>'privacy', 'terms_version', v.v->>'terms',
    'privacy_accepted', acc.privacy, 'terms_accepted', acc.terms,
    'needs_acceptance', acc.privacy is distinct from v.v->>'privacy'
                        or acc.terms is distinct from v.v->>'terms')
  from v, acc
$$;
revoke execute on function public.my_legal_status() from public, anon;
grant execute on function public.my_legal_status() to authenticated;

-- "I accept the current Privacy Notice and Terms." Records the versions the
-- SERVER has in force (the client can't claim another), once per version.
create or replace function public.accept_legal_documents()
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); v jsonb := public.current_legal_versions(); st jsonb;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not public.rate_limit('consent:' || uid, 20, 3600) then
    raise exception 'Too many requests — please try again later.';
  end if;
  st := public.my_legal_status();
  if st->>'privacy_accepted' is distinct from v->>'privacy' then
    insert into public.consents (user_id, purpose, version, granted, source)
    values (uid, 'privacy_notice', v->>'privacy', true, 'prompt');
  end if;
  if st->>'terms_accepted' is distinct from v->>'terms' then
    insert into public.consents (user_id, purpose, version, granted, source)
    values (uid, 'terms', v->>'terms', true, 'prompt');
  end if;
  return public.my_legal_status();
end $$;
revoke execute on function public.accept_legal_documents() from public, anon;
grant execute on function public.accept_legal_documents() to authenticated;

-- Sign-up acceptance: the form sends { accepted_privacy, accepted_terms } as
-- user metadata; only the versions currently in force count.
create or replace function public.record_signup_consent()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare v jsonb := public.current_legal_versions();
        m jsonb := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
begin
  if m->>'accepted_privacy' = v->>'privacy' and m->>'accepted_terms' = v->>'terms' then
    insert into public.consents (user_id, purpose, version, granted, source)
    values (NEW.id, 'privacy_notice', v->>'privacy', true, 'signup'),
           (NEW.id, 'terms', v->>'terms', true, 'signup');
  end if;
  return NEW;
end $$;
revoke execute on function public.record_signup_consent() from public, anon, authenticated;
drop trigger if exists on_auth_user_consent on auth.users;
create trigger on_auth_user_consent after insert on auth.users
  for each row execute function public.record_signup_consent();

-- ===========================================================================
-- 3. Opt-in weekly digest (+ a history row for every switch change)
-- ===========================================================================
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'profiles'
                    and column_name = 'notify_digest') then
    alter table public.profiles add column notify_digest boolean not null default false;
    -- Existing accounts were getting the digest: keep their current setting.
    -- (Inside the "column is new" branch, so a re-run never re-opts anyone in.)
    update public.profiles set notify_digest = true;
  end if;
end $$;
grant update (notify_digest) on public.profiles to authenticated;

create or replace function public.log_preference_consent()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if NEW.notify_digest is not distinct from OLD.notify_digest
     and NEW.notify_email is not distinct from OLD.notify_email
     and NEW.notify_push is not distinct from OLD.notify_push then
    return null;
  end if;
  if auth.uid() is not null
     and not public.rate_limit('prefs:' || NEW.id, 60, 3600) then
    raise exception 'Too many changes — please try again later.';
  end if;
  if NEW.notify_digest is distinct from OLD.notify_digest then
    insert into public.consents (user_id, purpose, granted, source)
    values (NEW.id, 'weekly_digest', NEW.notify_digest, 'settings');
  end if;
  if NEW.notify_email is distinct from OLD.notify_email then
    insert into public.consents (user_id, purpose, granted, source)
    values (NEW.id, 'email_notifications', NEW.notify_email, 'settings');
  end if;
  if NEW.notify_push is distinct from OLD.notify_push then
    insert into public.consents (user_id, purpose, granted, source)
    values (NEW.id, 'push_notifications', NEW.notify_push, 'settings');
  end if;
  return null;
end $$;
revoke execute on function public.log_preference_consent() from public, anon, authenticated;
drop trigger if exists trg_profiles_consent_log on public.profiles;
create trigger trg_profiles_consent_log
  after update of notify_digest, notify_email, notify_push on public.profiles
  for each row execute function public.log_preference_consent();

-- The weekly digest goes only to accounts that opted in (profiles.notify_digest).
-- Body otherwise as in 0070.
create or replace function public.send_weekly_digests()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  u record; k text; n int := 0;
  d0 date := current_date - 6;
begin
  k := public.app_enc_key();
  for u in
    with spend as (
      -- One row per counted expense: a plain expense paid this week, or a
      -- part of a yearly (spread) row dated this week. Plain rows before the
      -- week are skipped before decrypting; spread rows reach back 120 months.
      select t.user_id, coalesce(c.name, 'Uncategorized') as cat,
             case when t.spread_months is null then b.v
                  else public.spread_part(b.v, t.spread_months, i.i) end as v
        from public.transactions t
        join public.profiles p on p.id = t.user_id
        left join public.categories c on c.id = t.category_id and c.user_id = t.user_id
        cross join lateral generate_series(0, coalesce(t.spread_months, 1) - 1) as i(i)
        cross join lateral (
          select public.to_base_minor(public.dec_minor(t.amount_enc, k), t.exchange_rate,
                                      t.currency, coalesce(p.base_currency, 'EUR')) as v) b
       where t.kind = 'expense'
         and p.notify_digest
         and t.spent_at <= current_date
         and (t.spent_at >= d0
              or (t.spread_months is not null and t.spent_at > (d0 - interval '120 months')::date))
         and public.counts_in_month(t.spread_months, p.yearly_separate)
         and public.spread_part_date(t.spent_at, i.i) between d0 and current_date
    ), by_cat as (
      select s.user_id, s.cat, count(*) as cnt, sum(s.v) as v
        from spend s
       group by s.user_id, s.cat
    )
    -- The digest ranks categories by base value; a pending row (NULL) mustn't
    -- sort first.
    select bc.user_id, sum(bc.cnt)::int as cnt,
           (array_agg(bc.cat order by bc.v desc nulls last))[1] as top_name
      from by_cat bc
     group by bc.user_id
  loop
    insert into public.notifications (user_id, type, title, body)
    values (u.user_id, 'digest', 'Your week in money',
      u.cnt || ' expense' || case when u.cnt = 1 then '' else 's' end
      || ' this week · top category: ' || u.top_name || '. Open Budgeer to see your totals.');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.send_weekly_digests() from public, anon, authenticated;

-- ===========================================================================
-- 4. Account deletion anonymises the group history it leaves behind
-- ===========================================================================
-- BEFORE the delete, so it runs ahead of the FK actions (group_members.user_id
-- and group_audit_log.actor_id are SET NULL; the rest cascade).
create or replace function public.anonymise_departing_user()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  update public.group_members
     set display_name = 'Former member', former_user_id = null
   where user_id = OLD.id or former_user_id = OLD.id;
  update public.group_audit_log
     set actor_name = 'Former member'
   where actor_id = OLD.id;
  return OLD;
end $$;
revoke execute on function public.anonymise_departing_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_delete_anonymise on auth.users;
create trigger on_auth_user_delete_anonymise before delete on auth.users
  for each row execute function public.anonymise_departing_user();
