-- 0109: "Month in plain words" sees the month as Home does.
--
-- The summary's totals (ai_month_totals, 0103) summed income by the date it
-- was paid, so a salary paid late in September that Home counts in October
-- (the salary shift, 0081) was missing from October: the summary said the
-- salary hadn't arrived while Home showed it. Now:
--
--   1. salary_counted_date(kind, category, spent_at, from_day, salary
--      category): the date a row counts on in monthly sums. The SQL twin of
--      countedDate in supabase/functions/_shared/salaryShift.ts, kept in
--      lockstep with it: an income row in the salary category paid on or
--      after day D of its month (D clamped to the month's length) counts on
--      the 1st of the next month; anything else on its own date. Internal.
--   2. ai_month_totals counts income by that date (reaching back into the
--      month before the oldest one for the salary that counts in it), and
--      also returns the salary setting (salary_category_id and
--      salary_shift_from_day, null when not set), so the summary can say the
--      salary is in only when it is, and leave a salary still due this month
--      that counts in the next out of what's coming up.
--   3. Every stored summary is deleted: they were written from the old
--      totals and the old instructions, so each account's current month is
--      written again (once, without asking) the next time Home opens.
--
-- search_path pinned; the new function is closed to public/anon/authenticated
-- (0101's default, restated). my_month_summary is unchanged: it calls
-- ai_month_totals, whose new shape changes every fingerprint anyway.

-- 1 ---------------------------------------------------------------------------
create or replace function public.salary_counted_date(p_kind text, p_category uuid, p_spent_at date,
                                                      p_from_day int, p_salary_category uuid)
returns date
language sql immutable parallel safe
set search_path = public, pg_temp
as $$
  select case
    when p_kind = 'income' and p_from_day between 1 and 31 and p_salary_category is not null
         and p_category = p_salary_category
         and extract(day from p_spent_at)::int >= least(p_from_day,
               extract(day from (date_trunc('month', p_spent_at) + interval '1 month - 1 day'))::int)
      then (date_trunc('month', p_spent_at) + interval '1 month')::date
    else p_spent_at
  end
$$;
revoke execute on function public.salary_counted_date(text, uuid, date, int, uuid) from public, anon, authenticated;

-- 2 ---------------------------------------------------------------------------
-- { currency, month: 'YYYY-MM', salary_category_id: uuid | null,
--   salary_shift_from_day: 1..31 | null, categories: [{ id, name, kind,
--   totals: [7 minor amounts, the month first], budget: minor | null }] },
-- in a fixed order so its md5 only changes when a number (or a name) does.
-- Expenses as Home counts them (yearly spread, unless kept separate); income
-- as Home counts it (a late salary in the month it counts for), without the
-- savings categories (savings aren't income). Categories with a budget this
-- month are listed even with nothing spent.
create or replace function public.ai_month_totals(p_user uuid, p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare k text := public.app_enc_key(); base text; ysep boolean; sday int; scat uuid; res jsonb;
        m0 date := date_trunc('month', p_month)::date;
begin
  select coalesce(p.base_currency, 'EUR'), coalesce(p.yearly_separate, false),
         p.salary_shift_from_day, p.salary_category_id
    into base, ysep, sday, scat from public.profiles p where p.id = p_user;
  with months as (
    select g.i, (m0 - make_interval(months => g.i))::date as month from generate_series(0, 6) g(i)
  ), parts as (
    select mo.i, t.kind::text as kind, t.category_id,
           public.month_share(public.to_base_minor(public.dec_minor(t.amount_enc, k), t.exchange_rate,
                                                   t.currency, base),
                              public.salary_counted_date(t.kind::text, t.category_id, t.spent_at, sday, scat),
                              t.spread_months, mo.month) as v
      from months mo
      join public.transactions t
        on t.user_id = p_user
       and t.spent_at < (mo.month + interval '1 month')::date
       and (t.spent_at >= mo.month
            or (scat is not null and sday is not null and t.kind = 'income' and t.category_id = scat
                and t.spent_at >= (mo.month - interval '1 month')::date)
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
           'salary_category_id', scat,
           'salary_shift_from_day', sday,
           'categories', coalesce(jsonb_agg(jsonb_build_object(
               'id', l.category_id, 'name', l.name, 'kind', l.kind,
               'totals', l.totals, 'budget', l.budget)
             order by l.kind, l.name nulls last, l.category_id), '[]'::jsonb))
    into res
    from listed l;
  return res;
end $$;
revoke execute on function public.ai_month_totals(uuid, date) from public, anon, authenticated;

-- 3 ---------------------------------------------------------------------------
delete from public.ai_month_summaries;
