-- public.materialize_recurring_rules: the current definition (canonical copy).
-- To change it, edit this file, then paste the whole file into a new
-- migration; test/sqlFunctions.test.js keeps the two equal.
create or replace function public.materialize_recurring_rules()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r         record;
  run_date  date;
  inserted  int := 0;
  guard     int;
  v_rate    numeric;
  need_fx   boolean := false;
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
      v_rate := public.member_share_rate(r.user_id, r.currency, run_date);
      need_fx := need_fx or v_rate is null;
      insert into public.transactions
        (user_id, kind, category_id, account_id, amount_enc, currency, exchange_rate,
         description_enc, spent_at, recurring_rule_id, savings_from_income, paid_from_savings)
      values
        (r.user_id, r.kind, r.category_id, r.account_id, r.amount_enc, r.currency, v_rate,
         r.description_enc, run_date, r.id, r.savings_from_income, r.paid_from_savings);
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

  if need_fx then perform public.fx_request(); end if;
  return inserted;
end;
$$;
revoke execute on function public.materialize_recurring_rules() from anon, authenticated, public;
