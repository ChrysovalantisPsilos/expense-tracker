-- public.notify_budget_threshold: the current definition (canonical copy).
-- To change it, edit this file, then paste the whole file into a new
-- migration; test/sqlFunctions.test.js keeps the two equal.
create or replace function public.notify_budget_threshold()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare g record; k text; cap bigint; spent_after bigint; spent_new bigint; spent_before bigint;
begin
  for g in
    select n.user_id, n.category_id, m.month,
           b.amount_enc as cap_enc,
           coalesce(c.name, 'A category') as cat_name,
           coalesce(p.base_currency, 'EUR') as base,
           coalesce(p.yearly_separate, false) as yearly_separate,
           array_agg(n.id) as new_ids
    from new_rows n
    cross join lateral (
      select (date_trunc('month', n.spent_at) + make_interval(months => i))::date as month
        from generate_series(0, coalesce(n.spread_months, 1) - 1) i
       where i = 0
          or date_trunc('month', n.spent_at) + make_interval(months => i) <= date_trunc('month', current_date)
    ) m
    join public.budgets b
      on b.user_id = n.user_id and b.category_id = n.category_id and not b.removed
     and b.period_start = public.budget_source_period(n.user_id, m.month)
    left join public.categories c on c.id = n.category_id and c.user_id = n.user_id
    left join public.profiles p on p.id = n.user_id
    where n.kind = 'expense' and n.category_id is not null
      and public.counts_in_month(n.spread_months, p.yearly_separate)
    group by n.user_id, n.category_id, m.month, b.amount_enc, c.name, p.base_currency, p.yearly_separate
  loop
    k := coalesce(k, public.app_enc_key());
    cap := public.dec_minor(g.cap_enc, k);
    continue when cap is null or cap <= 0;

    -- Rows paid in the month, plus spread rows paid up to 119 months earlier
    -- (unless the owner keeps those separate); each decrypted once, converted
    -- to base minor units (the cap's unit), then reduced to its share of the
    -- month.
    select coalesce(sum(s.v), 0), coalesce(sum(s.v) filter (where s.id = any(g.new_ids)), 0)
      into spent_after, spent_new
      from (select t.id, public.month_share(
                     public.to_base_minor(public.dec_minor(t.amount_enc, k), t.exchange_rate, t.currency, g.base),
                     t.spent_at, t.spread_months, g.month) as v
              from public.transactions t
             where t.user_id = g.user_id and t.category_id = g.category_id and t.kind = 'expense'
               and t.spent_at < (g.month + interval '1 month')::date
               and t.spent_at >= (g.month - interval '119 months')::date
               and (t.spent_at >= g.month or t.spread_months is not null)
               and public.counts_in_month(t.spread_months, g.yearly_separate)) s;
    spent_before := spent_after - spent_new;

    if spent_before < cap and spent_after >= cap then
      insert into public.notifications (user_id, type, title, body)
      values (g.user_id, 'budget', 'Budget exceeded', g.cat_name || ' has passed its monthly budget.');
    elsif spent_before < round(cap * 0.8) and spent_after >= round(cap * 0.8) then
      insert into public.notifications (user_id, type, title, body)
      values (g.user_id, 'budget', 'Budget almost used', g.cat_name || ' is nearly at its monthly budget.');
    end if;
  end loop;
  return null;
end $$;
revoke execute on function public.notify_budget_threshold() from public, anon, authenticated;
