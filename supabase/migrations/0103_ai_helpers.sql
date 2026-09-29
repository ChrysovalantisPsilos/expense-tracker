-- 0103: AI helpers — three optional helpers that use Claude (Anthropic), each
-- off until its owner switches it on in Settings → AI helpers:
--   * "Type it" (Add): a typed line fills in the form      helper parse_entry
--   * category ideas for new merchants on Import            suggest_categories
--   * "Month in plain words" (Insights, Home)               month_summary
-- The edge function ai-helper does the calling; this migration holds the
-- switches, the consent history, the stored month summaries and the checks
-- the function relies on.
--
--   1. profiles.ai_quick_entry / ai_import_categories / ai_month_summary:
--      one switch per helper, default OFF for every account (existing ones
--      too: nothing is sent before an explicit opt-in). The owner reads and
--      writes them like the other preference switches (own-row RLS, column
--      grants). The shared demo login can't turn them on.
--   2. Every switch change is a consents row (source 'settings'), like the
--      message switches (0072): three new purposes, rate-limited 60/hour.
--      Turning "Month in plain words" off also deletes its stored summaries.
--   3. ai_month_summaries: one summary per account and month, the words
--      encrypted at rest (enc_text + app_enc_key, like 0097/0102), with the
--      fingerprint (md5) of the totals it was written from. RLS on, no
--      policies, no grants: written only by ai_save_month_summary (service
--      role, called by the edge function after it checked the caller), read
--      only through my_month_summary. Summaries older than 12 months are
--      dropped on each save.
--   4. ai_month_totals(user, month): what "Month in plain words" sends —
--      per-category totals (base currency, minor units) for the month and the
--      six before, and the month's budgets. No entries, descriptions or notes.
--      Computed here, never taken from the client. Internal.
--   5. my_month_summary(month): the caller's summary for this (or an adjacent)
--      month, whether its totals changed since ('stale'), whether the month has
--      any spending yet ('empty'), and the totals + fingerprint the edge
--      function sends and stores. Null while the helper is off.
--   6. ai_helper_start(helper): the edge function's gate before each call to
--      Claude, run as the caller: the helper's switch must be on (and the
--      account not the demo), then per-user rate limits (parse_entry 60/hour,
--      suggest_categories 20/hour, month_summary 10/day) and an overall daily
--      cap. Returns the base currency.
--   7. export_my_data() also returns the summaries (decrypted); demo_wipe
--      clears them. Account deletion cascades.
--
-- 0101 closed new functions by default: the two callable ones are granted to
-- authenticated here; ai_save_month_summary is left to service_role (its
-- default); the rest to nobody.

-- 1 ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists ai_quick_entry boolean not null default false,
  add column if not exists ai_import_categories boolean not null default false,
  add column if not exists ai_month_summary boolean not null default false;
grant select (ai_quick_entry, ai_import_categories, ai_month_summary) on public.profiles to authenticated;
grant update (ai_quick_entry, ai_import_categories, ai_month_summary) on public.profiles to authenticated;

-- The demo login is shared: nothing of it goes to a third party. Turning a
-- switch off is always fine. SECURITY INVOKER (asks who is writing), as
-- profiles_demo_guard (0090).
create or replace function public.profiles_ai_demo_guard()
returns trigger language plpgsql security invoker
set search_path = public, pg_temp as $$
begin
  if current_user in ('anon', 'authenticated') and OLD.is_demo
     and ((NEW.ai_quick_entry and not OLD.ai_quick_entry)
          or (NEW.ai_import_categories and not OLD.ai_import_categories)
          or (NEW.ai_month_summary and not OLD.ai_month_summary)) then
    raise exception 'That isn’t available on the demo account.';
  end if;
  return NEW;
end $$;
revoke execute on function public.profiles_ai_demo_guard() from public, anon, authenticated;
drop trigger if exists trg_profiles_ai_demo_guard on public.profiles;
create trigger trg_profiles_ai_demo_guard
  before update of ai_quick_entry, ai_import_categories, ai_month_summary on public.profiles
  for each row execute function public.profiles_ai_demo_guard();

-- 3 (before 2: the consent trigger deletes from it) ---------------------------
create table if not exists public.ai_month_summaries (
  user_id     uuid not null references auth.users(id) on delete cascade,
  month       date not null check (month = date_trunc('month', month)::date),
  payload_enc bytea not null,
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{32}$'),
  created_at  timestamptz not null default now(),
  primary key (user_id, month)
);
alter table public.ai_month_summaries enable row level security;
revoke all on public.ai_month_summaries from public, anon, authenticated;

drop trigger if exists ai_month_summaries_owner_guard on public.ai_month_summaries;
create trigger ai_month_summaries_owner_guard
  before insert or update on public.ai_month_summaries
  for each row execute function public.recurring_plan_owner_guard();

-- 2 ---------------------------------------------------------------------------
alter table public.consents drop constraint if exists consents_purpose_check;
alter table public.consents add constraint consents_purpose_check check (purpose in (
  'privacy_notice', 'terms', 'weekly_digest', 'email_notifications', 'push_notifications',
  'ai_quick_entry', 'ai_import_categories', 'ai_month_summary'));

create or replace function public.log_ai_consent()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if NEW.ai_quick_entry is not distinct from OLD.ai_quick_entry
     and NEW.ai_import_categories is not distinct from OLD.ai_import_categories
     and NEW.ai_month_summary is not distinct from OLD.ai_month_summary then
    return null;
  end if;
  if auth.uid() is not null
     and not public.rate_limit('ai-prefs:' || NEW.id, 60, 3600) then
    raise exception 'Too many changes — please try again later.';
  end if;
  if NEW.ai_quick_entry is distinct from OLD.ai_quick_entry then
    insert into public.consents (user_id, purpose, granted, source)
    values (NEW.id, 'ai_quick_entry', NEW.ai_quick_entry, 'settings');
  end if;
  if NEW.ai_import_categories is distinct from OLD.ai_import_categories then
    insert into public.consents (user_id, purpose, granted, source)
    values (NEW.id, 'ai_import_categories', NEW.ai_import_categories, 'settings');
  end if;
  if NEW.ai_month_summary is distinct from OLD.ai_month_summary then
    insert into public.consents (user_id, purpose, granted, source)
    values (NEW.id, 'ai_month_summary', NEW.ai_month_summary, 'settings');
    if not NEW.ai_month_summary then
      delete from public.ai_month_summaries where user_id = NEW.id;
    end if;
  end if;
  return null;
end $$;
revoke execute on function public.log_ai_consent() from public, anon, authenticated;
drop trigger if exists trg_profiles_ai_consent_log on public.profiles;
create trigger trg_profiles_ai_consent_log
  after update of ai_quick_entry, ai_import_categories, ai_month_summary on public.profiles
  for each row execute function public.log_ai_consent();

-- 4 ---------------------------------------------------------------------------
-- { currency, month: 'YYYY-MM', categories: [{ id, name, kind, totals: [7
--   minor amounts, the month first], budget: minor | null }] }, in a fixed
-- order so its md5 only changes when a number (or a name) does. Expenses as
-- Home counts them (yearly spread, unless kept separate); income without the
-- savings categories (savings aren't income). Categories with a budget this
-- month are listed even with nothing spent.
create or replace function public.ai_month_totals(p_user uuid, p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare k text := public.app_enc_key(); base text; ysep boolean; res jsonb;
        m0 date := date_trunc('month', p_month)::date;
begin
  select coalesce(p.base_currency, 'EUR'), coalesce(p.yearly_separate, false)
    into base, ysep from public.profiles p where p.id = p_user;
  with months as (
    select g.i, (m0 - make_interval(months => g.i))::date as month from generate_series(0, 6) g(i)
  ), parts as (
    select mo.i, t.kind::text as kind, t.category_id,
           public.month_share(public.to_base_minor(public.dec_minor(t.amount_enc, k), t.exchange_rate,
                                                   t.currency, base),
                              t.spent_at, t.spread_months, mo.month) as v
      from months mo
      join public.transactions t
        on t.user_id = p_user
       and t.spent_at < (mo.month + interval '1 month')::date
       and (t.spent_at >= mo.month
            or (t.spread_months is not null and t.spent_at >= (mo.month - interval '119 months')::date))
     where public.counts_in_month(t.spread_months, ysep)
       and not (t.kind = 'income' and exists (
             select 1 from public.categories c where c.id = t.category_id and c.is_savings))
  ), agg as (
    select kind, category_id, i, coalesce(sum(v), 0)::bigint as v from parts group by kind, category_id, i
  ), budgeted as (
    select b.category_id, public.dec_minor(b.amount_enc, k) as cap
      from public.budgets b
     where b.user_id = p_user and not b.removed and b.category_id is not null
       and b.period_start = public.budget_source_period(p_user, m0)
  ), cats as (
    select kind, category_id from agg
    union
    select 'expense', category_id from budgeted
  ), listed as (
    select c.kind, c.category_id, cat.name,
           (select jsonb_agg(coalesce((select a.v from agg a
                                        where a.kind = c.kind and a.i = g.i
                                          and a.category_id is not distinct from c.category_id), 0)
                             order by g.i)
              from generate_series(0, 6) g(i)) as totals,
           case when c.kind = 'expense' then (select b.cap from budgeted b where b.category_id = c.category_id) end as budget
      from cats c
      left join public.categories cat on cat.id = c.category_id and cat.user_id = p_user
  )
  select jsonb_build_object(
           'currency', base,
           'month', to_char(m0, 'YYYY-MM'),
           'categories', coalesce(jsonb_agg(jsonb_build_object(
               'id', l.category_id, 'name', l.name, 'kind', l.kind,
               'totals', l.totals, 'budget', l.budget)
             order by l.kind, l.name nulls last, l.category_id), '[]'::jsonb))
    into res
    from listed l;
  return res;
end $$;
revoke execute on function public.ai_month_totals(uuid, date) from public, anon, authenticated;

-- 5 ---------------------------------------------------------------------------
-- The month must be the server's current month or one next to it (a device
-- east or west of UTC can be a day into another month).
create or replace function public.my_month_summary(p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare uid uuid := auth.uid(); m0 date := date_trunc('month', p_month)::date;
        totals jsonb; fp text; s record;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not coalesce((select p.ai_month_summary and not p.is_demo from public.profiles p where p.id = uid), false) then
    return null;
  end if;
  if m0 is null or abs((extract(year from m0) * 12 + extract(month from m0))
                       - (extract(year from current_date) * 12 + extract(month from current_date))) > 1 then
    raise exception 'bad month';
  end if;
  totals := public.ai_month_totals(uid, m0);
  fp := md5(totals::text);
  select a.payload_enc, a.fingerprint, a.created_at into s
    from public.ai_month_summaries a where a.user_id = uid and a.month = m0;
  return jsonb_build_object(
    'month', to_char(m0, 'YYYY-MM'),
    'empty', not exists (select 1 from jsonb_array_elements(totals->'categories') c
                          where c->>'kind' = 'expense' and (c->'totals'->>0)::bigint > 0),
    'summary', case when s.payload_enc is not null then
                 public.dec_text(s.payload_enc, public.app_enc_key())::jsonb
                   || jsonb_build_object('written_at', s.created_at) end,
    'stale', s.payload_enc is not null and s.fingerprint is distinct from fp,
    'totals', totals,
    'fingerprint', fp);
end $$;
revoke execute on function public.my_month_summary(date) from public, anon;
grant execute on function public.my_month_summary(date) to authenticated;

-- The summary's shape: { lines: 1–5 strings of at most 300 characters,
-- lang: 'en' | 'el' }. Anything else is 'bad summary'.
create or replace function public.ai_save_month_summary(p_user uuid, p_month date, p_summary jsonb, p_fingerprint text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare e jsonb;
begin
  if p_user is null or p_month is null or p_month <> date_trunc('month', p_month)::date
     or p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{32}$'
     or p_summary is null or jsonb_typeof(p_summary) <> 'object' then
    raise exception 'bad summary';
  end if;
  if exists (select 1 from jsonb_object_keys(p_summary) x where x not in ('lines', 'lang'))
     or coalesce(p_summary->>'lang', '') not in ('en', 'el')
     or jsonb_typeof(p_summary->'lines') is distinct from 'array'
     or jsonb_array_length(p_summary->'lines') not between 1 and 5 then
    raise exception 'bad summary';
  end if;
  for e in select value from jsonb_array_elements(p_summary->'lines') loop
    if jsonb_typeof(e) <> 'string' or length(e #>> '{}') not between 1 and 300 then
      raise exception 'bad summary';
    end if;
  end loop;
  -- Switched off while it was being written: keep nothing.
  if not coalesce((select p.ai_month_summary from public.profiles p where p.id = p_user), false) then
    raise exception 'AI helper is off';
  end if;
  insert into public.ai_month_summaries (user_id, month, payload_enc, fingerprint, created_at)
  values (p_user, p_month, public.enc_text(p_summary::text, public.app_enc_key()), p_fingerprint, now())
  on conflict (user_id, month) do update
    set payload_enc = excluded.payload_enc, fingerprint = excluded.fingerprint, created_at = now();
  delete from public.ai_month_summaries
   where user_id = p_user and month < (p_month - interval '12 months')::date;
end $$;
revoke execute on function public.ai_save_month_summary(uuid, date, jsonb, text) from public, anon, authenticated;

-- 6 ---------------------------------------------------------------------------
create or replace function public.ai_helper_start(p_helper text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare uid uuid := auth.uid(); p record; on_ boolean; lim int; win int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select pr.base_currency, pr.is_demo, pr.ai_quick_entry, pr.ai_import_categories, pr.ai_month_summary
    into p from public.profiles pr where pr.id = uid;
  on_ := case p_helper
           when 'parse_entry' then p.ai_quick_entry
           when 'suggest_categories' then p.ai_import_categories
           when 'month_summary' then p.ai_month_summary
         end;
  if not coalesce(on_, false) or coalesce(p.is_demo, false) then
    raise exception 'AI helper is off';
  end if;
  lim := case p_helper when 'parse_entry' then 60 when 'suggest_categories' then 20 else 10 end;
  win := case p_helper when 'month_summary' then 86400 else 3600 end;
  if not public.rate_limit('ai:' || p_helper || ':' || uid, lim, win)
     or not public.rate_limit('ai:all', 5000, 86400) then
    raise exception 'Too many requests — please try again later.';
  end if;
  return jsonb_build_object('base_currency', coalesce(p.base_currency, 'EUR'));
end $$;
revoke execute on function public.ai_helper_start(text) from public, anon;
grant execute on function public.ai_helper_start(text) to authenticated;

-- 7 ---------------------------------------------------------------------------
-- As 0102, plus the month summaries (decrypted, the caller's only).
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
      from public.ai_month_summaries a where a.user_id = uid));
end $$;

-- As 0102, plus the month summaries.
create or replace function public.demo_wipe(p_ids uuid[])
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  delete from public.notifications where user_id = any(p_ids);
  delete from public.groups where owner_id = any(p_ids);
  delete from public.group_invites where created_by = any(p_ids) or invited_user_id = any(p_ids);
  update public.profiles set salary_category_id = null where id = any(p_ids);
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
  delete from public.consents where user_id = any(p_ids);
  delete from public.privacy_email_queue where user_id = any(p_ids);
  delete from public.inactivity_notices where user_id = any(p_ids);
  delete from public.legal_update_notices where user_id = any(p_ids);
  delete from public.rate_limits r
   where exists (select 1 from unnest(p_ids) i where position(i::text in r.key) > 0);
end $$;
revoke execute on function public.demo_wipe(uuid[]) from public, anon, authenticated;
