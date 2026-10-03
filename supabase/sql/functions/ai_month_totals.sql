-- public.ai_month_totals: the current definition (canonical copy).
-- To change it, edit this file, then paste the whole file into a new
-- migration; test/sqlFunctions.test.js keeps the two equal.
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
