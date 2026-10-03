-- 0111: Pay months. With the salary setting on (0081), a month runs from the
-- day its salary arrived to the day before the next one (a 29 Sep salary
-- opens October on 29 Sep), so the app's month matches the bank's. Every row
-- keeps its real date; the month's WINDOW moves. The rule, its fallbacks and
-- its guard are payCalendar.ts (supabase/functions/_shared); this migration
-- is its SQL twin (DB test 121 checks both against one case table). With
-- the setting off nothing changes: calendar months, current_date as before.
--
--   1. profiles.time_zone + save_time_zone(tz) (callable): the device saves
--      its IANA zone, so user_today(user) (internal) is the user's date, not
--      UTC's. A name Postgres doesn't know is refused; clients can't write
--      the column directly (no column grant).
--   2. pay_days(user) (internal): the salary-category income rows that are
--      real paydays, at least half the median salary (a refund booked in the
--      category never opens a month). The one copy of the filter; amounts
--      never leave the server.
--   3. pay_month_windows(user, first, last, today) (internal): each month's
--      { from_date, to_date, open }, worked out from the user's first payday
--      as payCalendar does (real start; the floor before the first payday;
--      D of the month before once a salary is certainly missing; else the
--      1st, provisionally; never before the day after the previous start).
--      pay_month_of(user, date, today) and current_pay_month(user)
--      (internal; the latter is date_trunc('month', current_date) with the
--      setting off, exactly as before).
--   4. my_pay_calendar() (callable): the caller's payday dates and their
--      today, for the app's calendar (no amounts).
--   5. my_transactions: a spread row's reach-back is one month wider, as a
--      part's pay month can be one later than its calendar month.
--   6. ai_month_totals counts by pay month (salary_counted_date is dropped:
--      a payday now opens the month instead of being re-dated into it) and
--      returns the month's window, the current month, the user's today and
--      the last payday; my_month_summary takes the current pay month and the
--      one before (or tomorrow's, at a time-zone edge), and leaves the user's
--      today out of the fingerprint. Every stored summary is deleted (their
--      months and fingerprints changed).
--   7. notify_budget_threshold checks the pay month a new expense counts in
--      (and its spread parts' months), with one windows read per user per
--      statement.
--   8. save_budget, edit_budget, delete_budget and copy_previous_budgets
--      default to the current pay month instead of today's calendar month.
--
-- search_path pinned on every function; the internal ones are closed to
-- public/anon/authenticated, save_time_zone and my_pay_calendar are granted
-- to authenticated. profiles.time_zone is personal data (docs/GDPR.md); the
-- data export includes it with the rest of the profile row.

-- 1 ---------------------------------------------------------------------------
alter table public.profiles add column if not exists time_zone text null;
grant select (time_zone) on public.profiles to authenticated;

create or replace function public.save_time_zone(p_tz text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_tz is null or length(p_tz) > 64 or not exists (select 1 from pg_timezone_names z where z.name = p_tz) then
    raise exception 'unknown time zone';
  end if;
  update public.profiles set time_zone = p_tz where id = uid and time_zone is distinct from p_tz;
end $$;
revoke execute on function public.save_time_zone(text) from public, anon;
grant execute on function public.save_time_zone(text) to authenticated;

create or replace function public.user_today(p_user uuid)
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select (now() at time zone coalesce((select p.time_zone from public.profiles p where p.id = p_user), 'UTC'))::date
$$;
revoke execute on function public.user_today(uuid) from public, anon, authenticated;

-- 2 ---------------------------------------------------------------------------
create or replace function public.pay_days(p_user uuid)
returns setof date
language sql
stable
set search_path = public, pg_temp
as $$
  with p as (
    select coalesce(pr.base_currency, 'EUR') as base, pr.salary_category_id as cat
      from public.profiles pr
     where pr.id = p_user and pr.salary_shift_from_day between 1 and 31 and pr.salary_category_id is not null
  ), r as (
    select t.spent_at,
           public.to_base_minor(public.dec_minor(t.amount_enc, k.k), t.exchange_rate, t.currency, p.base) as v
      from p
      cross join (select public.app_enc_key() as k) k
      join public.transactions t on t.user_id = p_user and t.kind = 'income' and t.category_id = p.cat
  ), m as (
    select percentile_cont(0.5) within group (order by r.v) as median from r where r.v is not null
  )
  select distinct r.spent_at from r, m where r.v is not null and r.v >= 0.5 * m.median order by 1
$$;
revoke execute on function public.pay_days(uuid) from public, anon, authenticated;

-- 3 ---------------------------------------------------------------------------
create or replace function public.pay_month_windows(p_user uuid, p_first date, p_last date, p_today date default null)
returns table(month date, from_date date, to_date date, open boolean)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare d int; today date := coalesce(p_today, public.user_today(p_user));
        m0 date := date_trunc('month', p_first)::date; m1 date := date_trunc('month', p_last)::date;
begin
  select p.salary_shift_from_day into d from public.profiles p
   where p.id = p_user and p.salary_shift_from_day between 1 and 31 and p.salary_category_id is not null;
  if d is null then
    -- The setting off: calendar months, open while they're today's.
    return query
      select g::date, g::date, (g + interval '1 month - 1 day')::date, date_trunc('month', today)::date = g::date
        from generate_series(m0, m1, interval '1 month') g;
    return;
  end if;
  return query
  with recursive days as (
    select x.pd from public.pay_days(p_user) as x(pd)
  ), opens as (            -- payCalendar.opensMonth
    select case when extract(day from x.pd)::int >= least(d, extract(day from (date_trunc('month', x.pd)
                       + interval '1 month - 1 day'))::int)
                then (date_trunc('month', x.pd) + interval '1 month')::date else date_trunc('month', x.pd)::date end as label,
           case when extract(day from x.pd)::int >= least(d, extract(day from (date_trunc('month', x.pd)
                       + interval '1 month - 1 day'))::int)
                then x.pd else date_trunc('month', x.pd)::date end as start
      from days x
  ), real as (             -- rule 1: the earliest start a payday opens a month with
    select o.label, min(o.start) as start from opens o group by o.label
  ), bounds as (
    select min(o.label) as first, (select max(x.pd) from days x) as last_pay,
           greatest(max(o.label), (date_trunc('month', today) + interval '1 month')::date,
                    (m1 + interval '1 month')::date) as last
      from opens o
  ), walk(label, start, is_set) as (
    -- From the first payday's month (the floor: anything earlier is a
    -- calendar month), each month's start from the one before it.
    select b.first, s.start, s.is_set
      from bounds b
      cross join lateral (
        select coalesce((select r.start from real r where r.label = b.first),
                        case when today >= b.first + least(d, extract(day from (b.first + interval '1 month - 1 day'))::int) - 1
                               or b.last_pay >= b.first + least(d, extract(day from (b.first + interval '1 month - 1 day'))::int) - 1
                             then (b.first - interval '1 month')::date
                                  + least(d, extract(day from (b.first - interval '1 day'))::int) - 1 end) as cand
      ) c
      cross join lateral (
        select case when c.cand is null then b.first
                    else greatest(c.cand, (b.first - interval '1 month')::date + 1) end as start,
               c.cand is not null as is_set
      ) s
     where b.first is not null
    union all
    select n.label, s.start, s.is_set
      from walk w
      cross join bounds b
      cross join lateral (select (w.label + interval '1 month')::date as label) n
      cross join lateral (
        -- rules 1 and 3: a real start, else certainly missing (today or a
        -- payday is past D of the month): D of the month before.
        select coalesce((select r.start from real r where r.label = n.label),
                        case when today >= n.label + least(d, extract(day from (n.label + interval '1 month - 1 day'))::int) - 1
                               or b.last_pay >= n.label + least(d, extract(day from (n.label + interval '1 month - 1 day'))::int) - 1
                             then w.label + least(d, extract(day from (n.label - interval '1 day'))::int) - 1 end) as cand
      ) c
      cross join lateral (
        -- The guard: never before the day after the previous month's start.
        -- Rule 4 (not known yet): the 1st, provisionally.
        select case when c.cand is null then n.label else greatest(c.cand, w.start + 1) end as start,
               c.cand is not null as is_set
      ) s
     where w.label < b.last
  )
  select g::date,
         coalesce(ws.start, g::date),
         (coalesce(wn.start, (g + interval '1 month')::date) - 1)::date,
         not (coalesce(wn.is_set, false) or today >= (g + interval '1 month')::date)
    from generate_series(m0, m1, interval '1 month') g
    left join walk ws on ws.label = g::date and ws.is_set
    left join walk wn on wn.label = (g + interval '1 month')::date and wn.is_set
   order by 1;
end $$;
revoke execute on function public.pay_month_windows(uuid, date, date, date) from public, anon, authenticated;

-- The pay month (its 1st) a date counts in: its calendar month, or the next
-- one once that has started (payCalendar.payMonthOf).
create or replace function public.pay_month_of(p_user uuid, p_date date, p_today date default null)
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select case when p_date >= w.from_date then w.month else date_trunc('month', p_date)::date end
    from public.pay_month_windows(p_user, (date_trunc('month', p_date) + interval '1 month')::date,
                                  (date_trunc('month', p_date) + interval '1 month')::date, p_today) w
$$;
revoke execute on function public.pay_month_of(uuid, date, date) from public, anon, authenticated;

-- This month for budgets and the month summary: the pay month holding the
-- user's today, or today's calendar month with the setting off (as before).
create or replace function public.current_pay_month(p_user uuid)
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select case when exists (select 1 from public.profiles p where p.id = p_user
                             and p.salary_shift_from_day between 1 and 31 and p.salary_category_id is not null)
              then public.pay_month_of(p_user, public.user_today(p_user))
              else date_trunc('month', current_date)::date end
$$;
revoke execute on function public.current_pay_month(uuid) from public, anon, authenticated;

-- 4 ---------------------------------------------------------------------------
create or replace function public.my_pay_calendar()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  return jsonb_build_object(
    'days', (select coalesce(jsonb_agg(d order by d), '[]'::jsonb) from public.pay_days(uid) d),
    'today', public.user_today(uid));
end $$;
revoke execute on function public.my_pay_calendar() from public, anon;
grant execute on function public.my_pay_calendar() to authenticated;

-- 5 ---------------------------------------------------------------------------
create or replace function public.my_transactions(
  p_kind text default null, p_from date default null, p_to date default null,
  p_category uuid default null, p_limit integer default null, p_spread boolean default false,
  p_paid_from_savings boolean default false, p_paid_with_vouchers boolean default false)
returns table(id uuid, user_id uuid, kind text, category_id uuid, account_id uuid,
  amount_minor bigint, currency text, exchange_rate numeric, description text, notes text,
  spent_at date, group_id uuid, is_shared boolean, client_uuid uuid,
  created_at timestamptz, updated_at timestamptz, group_expense_id uuid,
  categories jsonb, group_expenses jsonb, recurring_rule_id uuid, recurring jsonb,
  spread_months smallint, savings_from_income boolean, paid_from_savings boolean,
  paid_with_vouchers boolean)
language sql
stable security definer
set search_path = public, pg_temp
as $$
  select t.id, t.user_id, t.kind::text, t.category_id, t.account_id,
         public.dec_minor(t.amount_enc, k.k), t.currency::text, t.exchange_rate,
         public.dec_text(t.description_enc, k.k), public.dec_text(t.notes_enc, k.k),
         t.spent_at, t.group_id, t.is_shared, t.client_uuid, t.created_at,
         t.updated_at, t.group_expense_id,
         case when c.id is not null then jsonb_build_object(
           'name', c.name, 'icon', c.icon, 'color', c.color, 'default_key', c.default_key) end,
         case when g.id is not null then jsonb_build_object('groups', jsonb_build_object('name', g.name)) end,
         t.recurring_rule_id,
         case when rr.id is not null then jsonb_build_object(
           'frequency', rr.frequency, 'interval_n', rr.interval_n, 'is_active', rr.is_active) end,
         t.spread_months, t.savings_from_income, t.paid_from_savings, t.paid_with_vouchers
  from public.transactions t
  cross join (select public.app_enc_key() as k) k
  left join public.categories c on c.id = t.category_id and c.user_id = t.user_id
  left join public.group_expenses ge on ge.id = t.group_expense_id
  left join public.groups g on g.id = ge.group_id and public.is_group_member(ge.group_id)
  left join public.recurring_rules rr on rr.id = t.recurring_rule_id and rr.user_id = t.user_id
  where t.user_id = auth.uid()
    and (p_kind is null or t.kind::text = p_kind)
    and (p_from is null or t.spent_at >= p_from
         or (p_spread and t.kind = 'expense' and t.spread_months is not null
             and t.spent_at >= (p_from - interval '120 months')::date
             and date_trunc('month', t.spent_at) + make_interval(months => t.spread_months + 1) > p_from))
    and (p_to is null or t.spent_at <= p_to)
    and (p_category is null or t.category_id = p_category)
    and (not coalesce(p_paid_from_savings, false) or t.paid_from_savings)
    and (not coalesce(p_paid_with_vouchers, false) or t.paid_with_vouchers)
  order by t.spent_at desc, t.created_at desc
  limit p_limit
$$;
revoke execute on function public.my_transactions(text, date, date, uuid, integer, boolean, boolean, boolean) from public, anon;
grant execute on function public.my_transactions(text, date, date, uuid, integer, boolean, boolean, boolean) to authenticated;

-- 6 ---------------------------------------------------------------------------
--
-- { currency, month: 'YYYY-MM', salary_category_id: uuid | null,
--   salary_shift_from_day: 1..31 | null, window: { from, to, open },
--   current_month: 'YYYY-MM', today, last_pay_day,
--   categories: [{ id, name, kind, totals: [7 minor amounts, the month first], budget: minor | null }] },
-- in a fixed order so its md5 only changes when a number (or a name) does
-- (my_month_summary leaves today and current_month out of it). The months
-- are the user's pay months with the salary setting on (pay_month_windows,
-- 0111): every row counts in the window holding its date, a yearly spread
-- row by its parts from its own pay month (month_share fed the labels).
-- Expenses as Home counts them (yearly spread, unless kept separate);
-- income without the savings categories (savings aren't income). Categories
-- with a budget this month are listed even with nothing spent.
create or replace function public.ai_month_totals(p_user uuid, p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare k text := public.app_enc_key(); base text; ysep boolean; sday int; scat uuid; res jsonb;
        m0 date := date_trunc('month', p_month)::date; today date := public.user_today(p_user);
begin
  select coalesce(p.base_currency, 'EUR'), coalesce(p.yearly_separate, false),
         p.salary_shift_from_day, p.salary_category_id
    into base, ysep, sday, scat from public.profiles p where p.id = p_user;
  with w as (
    select * from public.pay_month_windows(p_user, (m0 - interval '126 months')::date, m0, today)
  ), months as (
    select g.i, (m0 - make_interval(months => g.i))::date as month from generate_series(0, 6) g(i)
  ), labelled as (
    select t.kind::text as kind, t.category_id, t.spread_months, w.month as label,
           public.to_base_minor(public.dec_minor(t.amount_enc, k), t.exchange_rate, t.currency, base) as v
      from public.transactions t
      join w on t.spent_at between w.from_date and w.to_date
     where t.user_id = p_user
       and (w.month >= (m0 - interval '6 months')::date or t.spread_months is not null)
       and public.counts_in_month(t.spread_months, ysep)
       and not (t.kind = 'income' and exists (
             select 1 from public.categories c where c.id = t.category_id and c.is_savings))
  ), parts as (
    select mo.i, l.kind, l.category_id, public.month_share(l.v, l.label, l.spread_months, mo.month) as v
      from months mo
      join labelled l on l.label = mo.month or (l.spread_months is not null and l.label < mo.month)
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
           'salary_category_id', scat,
           'salary_shift_from_day', sday,
           'window', (select jsonb_build_object('from', w.from_date, 'to', w.to_date, 'open', w.open)
                        from w where w.month = m0),
           'current_month', to_char(public.current_pay_month(p_user), 'YYYY-MM'),
           'today', today,
           'last_pay_day', (select max(d) from public.pay_days(p_user) d),
           'categories', coalesce(jsonb_agg(jsonb_build_object(
               'id', l.category_id, 'name', l.name, 'kind', l.kind,
               'totals', l.totals, 'budget', l.budget)
             order by l.kind, l.name nulls last, l.category_id), '[]'::jsonb))
    into res
    from listed l;
  return res;
end $$;
revoke execute on function public.ai_month_totals(uuid, date) from public, anon, authenticated;

-- As 0106, with the month checked against the user's current pay month: it
-- or the one before, or tomorrow's (a device a day ahead at a time-zone
-- edge). The fingerprint leaves out what changes every day (today, the
-- current month), so a summary isn't stale just because a day passed.
create or replace function public.my_month_summary(p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare uid uuid := auth.uid(); m0 date := date_trunc('month', p_month)::date;
        cur date; totals jsonb; fp text; s record;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not coalesce((select p.ai_month_summary from public.profiles p where p.id = uid), false) then
    return null;
  end if;
  cur := public.current_pay_month(uid);
  if m0 is null or not (m0 in (cur, (cur - interval '1 month')::date)
                        or m0 = public.pay_month_of(uid, public.user_today(uid) + 1)) then
    raise exception 'bad month';
  end if;
  totals := public.ai_month_totals(uid, m0);
  fp := md5((totals - 'today' - 'current_month')::text);
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

drop function if exists public.salary_counted_date(text, uuid, date, int, uuid);

delete from public.ai_month_summaries;

-- 7 ---------------------------------------------------------------------------
--
-- After insert of expense rows (statement level, new_rows): each month a new
-- row counts in — its pay month (pay_month_of, 0111: the calendar month with
-- the salary setting off), and for a yearly spread row each later month of
-- its spread up to the user's current pay month — is checked against that
-- month's cap (budget_source_period: rollover) at 80% and 100%. Spend is
-- every expense of the category in the month's window plus the parts of
-- spread rows paid in earlier windows (month_share fed the pay labels), as
-- the app counts it. The windows come from one pay_month_windows read per
-- user per statement, so a bulk save_transactions costs no more per row.
-- A salary saved or edited later that re-cuts a month (it opens the month
-- on another day) does not re-check alerts already sent or not sent.
create or replace function public.notify_budget_threshold()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare g record; k text := public.app_enc_key(); cap bigint;
begin
  for g in
    with nr as (
      select n.id, n.user_id, n.category_id, n.spent_at, n.spread_months
        from new_rows n
       where n.kind = 'expense' and n.category_id is not null
    ), u as (
      select nr.user_id, min(nr.spent_at) as lo, max(nr.spent_at) as hi,
             public.current_pay_month(nr.user_id) as cur, public.user_today(nr.user_id) as today,
             coalesce(p.base_currency, 'EUR') as base, coalesce(p.yearly_separate, false) as yearly_separate
        from nr left join public.profiles p on p.id = nr.user_id
       group by nr.user_id, p.base_currency, p.yearly_separate
    ), w as (
      select u.user_id, x.month, x.from_date, x.to_date
        from u
        cross join lateral public.pay_month_windows(u.user_id,
               (date_trunc('month', u.lo) - interval '121 months')::date,
               greatest((date_trunc('month', u.hi) + interval '1 month')::date, u.cur), u.today) x
    ), labelled as (
      select nr.*, w.month as label
        from nr join w on w.user_id = nr.user_id and nr.spent_at between w.from_date and w.to_date
    ), touched as (
      select l.id, l.user_id, l.category_id, (l.label + make_interval(months => i))::date as month
        from labelled l
        join u on u.user_id = l.user_id
        cross join lateral generate_series(0, coalesce(l.spread_months, 1) - 1) i
       where public.counts_in_month(l.spread_months, u.yearly_separate)
         and (i = 0 or (l.label + make_interval(months => i))::date <= u.cur)
    ), grp as (
      select t.user_id, t.category_id, t.month, array_agg(t.id) as new_ids
        from touched t group by t.user_id, t.category_id, t.month
    ), spend as (
      select grp.user_id, grp.category_id, grp.month,
             coalesce(sum(s.v), 0) as spent_after,
             coalesce(sum(s.v) filter (where s.id = any(grp.new_ids)), 0) as spent_new
        from grp
        join u on u.user_id = grp.user_id
        left join lateral (
          select t.id, public.month_share(
                   public.to_base_minor(public.dec_minor(t.amount_enc, k), t.exchange_rate, t.currency, u.base),
                   w2.month, t.spread_months, grp.month) as v
            from public.transactions t
            join w w2 on w2.user_id = t.user_id and t.spent_at between w2.from_date and w2.to_date
           where t.user_id = grp.user_id and t.category_id = grp.category_id and t.kind = 'expense'
             and w2.month <= grp.month
             and (w2.month = grp.month
                  or (t.spread_months is not null and w2.month > (grp.month - interval '120 months')::date))
             and public.counts_in_month(t.spread_months, u.yearly_separate)
        ) s on true
       group by grp.user_id, grp.category_id, grp.month
    )
    select sp.user_id, sp.category_id, sp.month, sp.spent_after, sp.spent_after - sp.spent_new as spent_before,
           b.amount_enc as cap_enc, coalesce(c.name, 'A category') as cat_name
      from spend sp
      join public.budgets b
        on b.user_id = sp.user_id and b.category_id = sp.category_id and not b.removed
       and b.period_start = public.budget_source_period(sp.user_id, sp.month)
      left join public.categories c on c.id = sp.category_id and c.user_id = sp.user_id
  loop
    cap := public.dec_minor(g.cap_enc, k);
    continue when cap is null or cap <= 0;
    if g.spent_before < cap and g.spent_after >= cap then
      insert into public.notifications (user_id, type, title, body)
      values (g.user_id, 'budget', 'Budget exceeded', g.cat_name || ' has passed its monthly budget.');
    elsif g.spent_before < round(cap * 0.8) and g.spent_after >= round(cap * 0.8) then
      insert into public.notifications (user_id, type, title, body)
      values (g.user_id, 'budget', 'Budget almost used', g.cat_name || ' is nearly at its monthly budget.');
    end if;
  end loop;
  return null;
end $$;
revoke execute on function public.notify_budget_threshold() from public, anon, authenticated;

-- 8 ---------------------------------------------------------------------------
-- As 0061 (search_path as 0101 left it), each defaulting to the current pay
-- month instead of today's calendar month.
create or replace function public.save_budget(p_category uuid, p_amount bigint, p_currency text, p_period date)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare uid uuid := auth.uid(); k text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not public.owns_refs(uid, p_category, null) then raise exception 'category not found'; end if;
  if p_amount is not null and p_amount < 0 then raise exception 'amount must be zero or more'; end if;
  k := public.app_enc_key();
  insert into public.budgets (user_id, category_id, currency, period_start, amount_enc, removed)
    values (uid, p_category, coalesce(p_currency, 'EUR'),
            coalesce(p_period, public.current_pay_month(uid)),
            public.enc_minor(coalesce(p_amount, 0), k), false)
  on conflict (user_id, category_id, period_start)
    do update set amount_enc = excluded.amount_enc, currency = excluded.currency, removed = false;
end $$;
revoke execute on function public.save_budget(uuid, bigint, text, date) from anon, public;
grant execute on function public.save_budget(uuid, bigint, text, date) to authenticated;

create or replace function public.edit_budget(p_category uuid, p_amount bigint, p_currency text, p_period date)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare uid uuid := auth.uid(); m date;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not public.owns_refs(uid, p_category, null) then raise exception 'category not found'; end if;
  m := coalesce(p_period, public.current_pay_month(uid));
  perform public.materialise_budgets(uid, m);
  perform public.save_budget(p_category, p_amount, p_currency, public.budget_period_key(m));
end $$;

create or replace function public.delete_budget(p_category uuid, p_period date)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare uid uuid := auth.uid(); m date;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  m := public.budget_period_key(coalesce(p_period, public.current_pay_month(uid)));
  perform public.materialise_budgets(uid, m);
  update public.budgets set removed = true
   where user_id = uid and category_id = p_category and period_start = m;
end $$;

create or replace function public.copy_previous_budgets(p_period date)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare uid uuid := auth.uid(); m date; src date; n int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  m := public.budget_period_key(coalesce(p_period, public.current_pay_month(uid)));
  src := public.budget_source_period(uid, (m - interval '1 month')::date);
  if src is null or not exists (select 1 from public.budgets
                                 where user_id = uid and period_start = src and not removed) then
    raise exception 'Last month has no budgets to copy.';
  end if;
  delete from public.budgets where user_id = uid and period_start = m;
  insert into public.budgets (user_id, category_id, currency, period_start, amount_enc, removed)
    select b.user_id, b.category_id, b.currency, m, b.amount_enc, false
      from public.budgets b
     where b.user_id = uid and b.period_start = src and not b.removed;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.edit_budget(uuid, bigint, text, date) from public, anon;
revoke execute on function public.delete_budget(uuid, date) from public, anon;
revoke execute on function public.copy_previous_budgets(date) from public, anon;
grant execute on function public.edit_budget(uuid, bigint, text, date) to authenticated;
grant execute on function public.delete_budget(uuid, date) to authenticated;
grant execute on function public.copy_previous_budgets(date) to authenticated;
