-- 0059: repair budget period keys saved a day early east of UTC.
--
-- Until the client date fix, the app formatted "1 September, local midnight"
-- with toISOString(), which is 31 August in UTC for anyone east of UTC (e.g.
-- Cyprus). Budgets were therefore keyed period_start = last day of the
-- PREVIOUS month. The budget alert trigger joins on
-- date_trunc('month', spent_at), so those budgets never alerted.
--
-- 1. budget_period_key(d): the month a stored key really meant.
--      1st of a month        → itself
--      last day of a month   → the 1st of the NEXT month (the bug's shape)
--      any other day         → the 1st of its own month
-- 2. repair_budget_periods(): moves mis-keyed rows to their month. Where that
--    month already has a row for the same category (e.g. set from a second
--    device in another zone), the most recently created row wins and the
--    other is deleted — save_budget upserts in place, so created_at is when
--    the user first set that cap for the month. Returns rows changed.
-- 3. A BEFORE trigger normalises every future write the same way, so a
--    not-yet-updated cached PWA still lands in the right month, and a CHECK
--    makes a non-1st key impossible.

create or replace function public.budget_period_key(d date)
returns date
language sql
immutable
set search_path = ''
as $$
  select case
    when d is null then null
    when extract(day from d) = 1 then d
    when extract(day from d + 1) = 1 then d + 1
    else date_trunc('month', d)::date
  end
$$;

create or replace function public.repair_budget_periods()
returns integer
language plpgsql
set search_path = public
as $$
declare
  dropped integer;
  moved integer;
begin
  -- Keep one row per (user, category, real month): newest created first; on a
  -- tie prefer the row that is already correctly keyed.
  delete from public.budgets b
  using (
    select id,
           row_number() over (
             partition by user_id, category_id, public.budget_period_key(period_start)
             order by created_at desc,
                      (period_start = public.budget_period_key(period_start)) desc,
                      id
           ) as rn
    from public.budgets
  ) r
  where b.id = r.id and r.rn > 1;
  get diagnostics dropped = row_count;

  update public.budgets
     set period_start = public.budget_period_key(period_start)
   where period_start is distinct from public.budget_period_key(period_start);
  get diagnostics moved = row_count;

  return dropped + moved;
end
$$;

-- Maintenance only: never callable through the API.
revoke execute on function public.repair_budget_periods() from public, anon, authenticated;

select public.repair_budget_periods();

create or replace function public.budgets_normalise_period()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.period_start := public.budget_period_key(new.period_start);
  return new;
end
$$;

revoke execute on function public.budgets_normalise_period() from public, anon, authenticated;

drop trigger if exists budgets_normalise_period on public.budgets;
create trigger budgets_normalise_period
  before insert or update of period_start on public.budgets
  for each row execute function public.budgets_normalise_period();

alter table public.budgets drop constraint if exists budgets_period_is_month_start;
alter table public.budgets
  add constraint budgets_period_is_month_start check (extract(day from period_start) = 1);
