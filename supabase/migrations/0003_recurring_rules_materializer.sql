-- Recurring-rules materializer: turns due recurring_rules into transactions.
-- Runs daily via pg_cron. Idempotent: next_run is advanced past today, so a
-- second run on the same day inserts nothing. Catches up multiple missed
-- periods (e.g. after downtime) with a per-rule safety cap.

create extension if not exists pg_cron;

create or replace function public.materialize_recurring_rules()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r         record;
  run_date  date;
  inserted  int := 0;
  guard     int;
begin
  for r in
    select * from public.recurring_rules
    where is_active and next_run <= current_date
  loop
    run_date := r.next_run;
    guard := 0;
    while run_date <= current_date
      and (r.end_date is null or run_date <= r.end_date)
      and guard < 1000
    loop
      insert into public.transactions
        (user_id, kind, category_id, account_id, amount_minor, currency, description, spent_at)
      values
        (r.user_id, r.kind, r.category_id, r.account_id, r.amount_minor, r.currency, r.description, run_date);
      inserted := inserted + 1;
      guard := guard + 1;
      run_date := (run_date + case r.frequency
        when 'daily'   then make_interval(days  => r.interval_n)
        when 'weekly'  then make_interval(days  => r.interval_n * 7)
        when 'monthly' then make_interval(months=> r.interval_n)
        when 'yearly'  then make_interval(years => r.interval_n)
      end)::date;
    end loop;

    update public.recurring_rules
      set next_run  = run_date,
          is_active = case when r.end_date is not null and run_date > r.end_date
                           then false else is_active end
    where id = r.id;
  end loop;

  return inserted;
end;
$$;

-- Never callable directly over the API — cron/postgres only.
revoke execute on function public.materialize_recurring_rules() from anon, authenticated, public;

-- Schedule daily at 02:00 UTC (idempotent: unschedule any prior job first).
select cron.unschedule('materialize-recurring-rules')
  where exists (select 1 from cron.job where jobname = 'materialize-recurring-rules');
select cron.schedule('materialize-recurring-rules', '0 2 * * *',
  $cron$select public.materialize_recurring_rules();$cron$);
