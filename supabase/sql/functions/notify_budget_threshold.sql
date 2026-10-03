-- public.notify_budget_threshold: the current definition (canonical copy).
-- To change it, edit this file, then paste the whole file into a new
-- migration; test/sqlFunctions.test.js keeps the two equal.
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
