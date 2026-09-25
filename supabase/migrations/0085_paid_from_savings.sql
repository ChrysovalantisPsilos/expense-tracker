-- 0085: an EXPENSE can be "Paid from savings" (paid_from_savings): money taken
-- out of the savings pot rather than out of this period's income. It is still
-- spending everywhere spending is counted (Home's Spent, spending by
-- category, budgets — including notify_budget_threshold and
-- send_weekly_digests, which count every expense and need no change —
-- Insights and the statement), but it doesn't lower the net, and it takes
-- away from Insights' net-worth "Savings" line (the app's rule:
-- supabase/functions/_shared/savings.ts, rowEffect 'expense-from-savings').
-- Recurring expense rules carry the same flag and hand it to the entries
-- they create.
--
--   1. transactions.paid_from_savings and recurring_rules.paid_from_savings
--      (default false; true only on an expense, CHECK). No client can write
--      either table directly (0050), so the flag is set through the
--      encrypting RPCs below, owner-only like every other field.
--   2. save_transactions / update_transaction (as 0084) take it
--      (`paid_from_savings`; ignored on income). Callers that don't send it
--      get false — CSV imports are paid from income by default. An entry's
--      kind is fixed once saved (0077), so update_transaction only has to
--      keep it off income.
--   3. my_transactions (as 0084) returns it, and takes p_paid_from_savings
--      (default false): true keeps only the expenses paid from savings (the
--      net-worth Savings line reads them all-time without every expense).
--   4. save_recurring_rule (as 0084) takes it — a rule switched to income
--      drops it — my_recurring_rules (as 0084) returns it, and
--      materialize_recurring_rules (as 0084) copies it onto each entry.

-- 1 ---------------------------------------------------------------------------
alter table public.transactions
  add column if not exists paid_from_savings boolean not null default false;
alter table public.transactions drop constraint if exists transactions_paid_from_savings_expense_check;
alter table public.transactions
  add constraint transactions_paid_from_savings_expense_check
  check (not paid_from_savings or kind = 'expense');

alter table public.recurring_rules
  add column if not exists paid_from_savings boolean not null default false;
alter table public.recurring_rules drop constraint if exists recurring_rules_paid_from_savings_expense_check;
alter table public.recurring_rules
  add constraint recurring_rules_paid_from_savings_expense_check
  check (not paid_from_savings or kind = 'expense');

-- 2 ---------------------------------------------------------------------------
create or replace function public.save_transactions(p_rows jsonb, p_ignore_duplicates boolean default false)
returns integer language plpgsql security definer
set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); k text; n int; base text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'rows must be an array'; end if;
  if jsonb_array_length(p_rows) > 1000 then raise exception 'too many rows in one request'; end if;
  if exists (select 1 from jsonb_to_recordset(p_rows) as x(amount_minor bigint)
             where x.amount_minor is null or x.amount_minor < 0) then
    raise exception 'amount must be zero or more';
  end if;
  select coalesce(base_currency, 'EUR') into base from public.profiles where id = uid;
  base := coalesce(base, 'EUR');
  if exists (select 1 from jsonb_to_recordset(p_rows) as x(currency text, exchange_rate numeric)
             where x.exchange_rate <= 0
                or (x.exchange_rate is null and upper(coalesce(x.currency, 'EUR')) <> upper(base))) then
    raise exception 'A foreign-currency entry needs a positive exchange rate.';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_rows) as x(category_id uuid, account_id uuid)
             where not public.owns_refs(uid, x.category_id, x.account_id)) then
    raise exception 'category or account not found';
  end if;
  if not public.rate_limit('txn:' || uid, 300, 3600) then
    raise exception 'Too many saves — please slow down.';
  end if;
  k := public.app_enc_key();
  with ins as (
    insert into public.transactions as t
      (user_id, client_uuid, kind, category_id, account_id, amount_enc, currency,
       exchange_rate, description_enc, notes_enc, spent_at, savings_from_income, paid_from_savings)
    select uid, coalesce(x.client_uuid, gen_random_uuid()),
           coalesce(x.kind, 'expense')::public.txn_kind, x.category_id, x.account_id,
           public.enc_minor(x.amount_minor, k), coalesce(x.currency, 'EUR'),
           coalesce(x.exchange_rate, 1), public.enc_text(x.description, k),
           public.enc_text(x.notes, k), coalesce(x.spent_at, current_date),
           coalesce(x.savings_from_income, false) and coalesce(x.kind, 'expense') = 'income',
           coalesce(x.paid_from_savings, false) and coalesce(x.kind, 'expense') = 'expense'
    from jsonb_to_recordset(p_rows) as x(client_uuid uuid, kind text, category_id uuid,
         account_id uuid, amount_minor bigint, currency text, exchange_rate numeric,
         description text, notes text, spent_at date, savings_from_income boolean,
         paid_from_savings boolean)
    on conflict (user_id, client_uuid) do update set
      kind = excluded.kind, category_id = excluded.category_id,
      account_id = excluded.account_id, amount_enc = excluded.amount_enc,
      currency = excluded.currency, exchange_rate = excluded.exchange_rate,
      description_enc = excluded.description_enc, notes_enc = excluded.notes_enc,
      spent_at = excluded.spent_at, savings_from_income = excluded.savings_from_income,
      paid_from_savings = excluded.paid_from_savings
      where not p_ignore_duplicates
    returning (t.xmax = 0) as inserted
  )
  select count(*) filter (where inserted) into n from ins;
  return n;
end $$;
revoke execute on function public.save_transactions(jsonb, boolean) from anon, public;
grant execute on function public.save_transactions(jsonb, boolean) to authenticated;

create or replace function public.update_transaction(p_id uuid, p_patch jsonb)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); k text; f jsonb := coalesce(p_patch, '{}'::jsonb);
        base text; cur record; new_cur text; new_rate numeric;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if f ? 'amount_minor' and coalesce((f->>'amount_minor')::bigint, -1) < 0 then
    raise exception 'amount must be zero or more';
  end if;
  if not public.owns_refs(uid, (f->>'category_id')::uuid, (f->>'account_id')::uuid) then
    raise exception 'category or account not found';
  end if;
  select currency, exchange_rate into cur from public.transactions where id = p_id and user_id = uid;
  if not found then raise exception 'not found'; end if;
  select coalesce(base_currency, 'EUR') into base from public.profiles where id = uid;
  base := coalesce(base, 'EUR');
  new_cur := case when f ? 'currency' then f->>'currency' else cur.currency end;
  -- A currency change must bring its own rate; the old one belonged to the old currency.
  new_rate := case when f ? 'exchange_rate' then (f->>'exchange_rate')::numeric
                   when f ? 'currency' and upper(coalesce(new_cur, base)) <> upper(cur.currency) then null
                   else cur.exchange_rate end;
  if new_rate <= 0
     or (new_rate is null and upper(coalesce(new_cur, base)) <> upper(base)) then
    raise exception 'A foreign-currency entry needs a positive exchange rate.';
  end if;
  k := public.app_enc_key();
  update public.transactions t set
    kind            = case when f ? 'kind' then (f->>'kind')::public.txn_kind else t.kind end,
    category_id     = case when f ? 'category_id' then (f->>'category_id')::uuid else t.category_id end,
    account_id      = case when f ? 'account_id' then (f->>'account_id')::uuid else t.account_id end,
    amount_enc      = case when f ? 'amount_minor' then public.enc_minor((f->>'amount_minor')::bigint, k) else t.amount_enc end,
    currency        = coalesce(new_cur, t.currency),
    exchange_rate   = coalesce(new_rate, 1),
    description_enc = case when f ? 'description' then public.enc_text(f->>'description', k) else t.description_enc end,
    notes_enc       = case when f ? 'notes' then public.enc_text(f->>'notes', k) else t.notes_enc end,
    spent_at        = case when f ? 'spent_at' then (f->>'spent_at')::date else t.spent_at end,
    savings_from_income = case when f ? 'savings_from_income'
                               then coalesce((f->>'savings_from_income')::boolean, false) and t.kind = 'income'
                               else t.savings_from_income end,
    paid_from_savings = case when f ? 'paid_from_savings'
                             then coalesce((f->>'paid_from_savings')::boolean, false) and t.kind = 'expense'
                             else t.paid_from_savings end
  where t.id = p_id and t.user_id = uid;
end $$;
revoke execute on function public.update_transaction(uuid, jsonb) from anon, public;
grant execute on function public.update_transaction(uuid, jsonb) to authenticated;

-- 3 ---------------------------------------------------------------------------
drop function if exists public.my_transactions(text, date, date, uuid, integer, boolean);
create function public.my_transactions(
  p_kind text default null, p_from date default null, p_to date default null,
  p_category uuid default null, p_limit integer default null, p_spread boolean default false,
  p_paid_from_savings boolean default false)
returns table(id uuid, user_id uuid, kind text, category_id uuid, account_id uuid,
  amount_minor bigint, currency text, exchange_rate numeric, description text, notes text,
  spent_at date, group_id uuid, is_shared boolean, client_uuid uuid,
  created_at timestamptz, updated_at timestamptz, group_expense_id uuid,
  categories jsonb, group_expenses jsonb, recurring_rule_id uuid, recurring jsonb,
  spread_months smallint, savings_from_income boolean, paid_from_savings boolean)
language sql
stable security definer
set search_path = public, pg_temp
as $$
  select t.id, t.user_id, t.kind::text, t.category_id, t.account_id,
         public.dec_minor(t.amount_enc, k.k), t.currency::text, t.exchange_rate,
         public.dec_text(t.description_enc, k.k), public.dec_text(t.notes_enc, k.k),
         t.spent_at, t.group_id, t.is_shared, t.client_uuid, t.created_at,
         t.updated_at, t.group_expense_id,
         case when c.id is not null then jsonb_build_object('name', c.name, 'icon', c.icon, 'color', c.color) end,
         case when g.id is not null then jsonb_build_object('groups', jsonb_build_object('name', g.name)) end,
         t.recurring_rule_id,
         case when rr.id is not null then jsonb_build_object(
           'frequency', rr.frequency, 'interval_n', rr.interval_n, 'is_active', rr.is_active) end,
         t.spread_months, t.savings_from_income, t.paid_from_savings
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
             and t.spent_at >= (p_from - interval '119 months')::date
             and date_trunc('month', t.spent_at) + make_interval(months => t.spread_months) > p_from))
    and (p_to is null or t.spent_at <= p_to)
    and (p_category is null or t.category_id = p_category)
    and (not coalesce(p_paid_from_savings, false) or t.paid_from_savings)
  order by t.spent_at desc, t.created_at desc
  limit p_limit
$$;
revoke execute on function public.my_transactions(text, date, date, uuid, integer, boolean, boolean) from public, anon;
grant execute on function public.my_transactions(text, date, date, uuid, integer, boolean, boolean) to authenticated;

-- 4 ---------------------------------------------------------------------------
create or replace function public.save_recurring_rule(p_id uuid, p_fields jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare uid uuid := auth.uid(); k text; rid uuid; f jsonb := coalesce(p_fields, '{}'::jsonb);
        oldest date := (current_date - interval '1 year')::date; linked int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if (p_id is null or f ? 'amount_minor') and coalesce((f->>'amount_minor')::bigint, -1) < 0 then
    raise exception 'amount must be zero or more';
  end if;
  if not public.owns_refs(uid, (f->>'category_id')::uuid, (f->>'account_id')::uuid) then
    raise exception 'category or account not found';
  end if;
  k := public.app_enc_key();
  if p_id is null then
    if (select count(*) from public.recurring_rules where user_id = uid) >= 200 then
      raise exception 'You can have at most 200 recurring entries.';
    end if;
    insert into public.recurring_rules
      (user_id, kind, category_id, account_id, amount_enc, currency, description_enc,
       frequency, interval_n, next_run, end_date, is_active, remind_days_before, savings_from_income,
       paid_from_savings)
    values
      (uid, coalesce(f->>'kind', 'expense')::public.txn_kind, (f->>'category_id')::uuid,
       (f->>'account_id')::uuid, public.enc_minor((f->>'amount_minor')::bigint, k),
       coalesce(f->>'currency', 'EUR'), public.enc_text(f->>'description', k),
       coalesce(f->>'frequency', 'monthly')::public.recurrence_freq,
       coalesce((f->>'interval_n')::int, 1),
       greatest(coalesce((f->>'next_run')::date, current_date), oldest),
       (f->>'end_date')::date, coalesce((f->>'is_active')::boolean, true),
       (f->>'remind_days_before')::int,
       coalesce((f->>'savings_from_income')::boolean, false) and coalesce(f->>'kind', 'expense') = 'income',
       coalesce((f->>'paid_from_savings')::boolean, false) and coalesce(f->>'kind', 'expense') = 'expense')
    returning id into rid;
    -- "Make recurring": link the transaction the rule was made from, by id
    -- (a listed row) or by client_uuid (unique per user: the form's Repeat
    -- switch, right after save_transactions, which returns only a count).
    if f ? 'source_transaction_id' or f ? 'source_client_uuid' then
      update public.transactions set recurring_rule_id = rid
       where user_id = uid and group_expense_id is null and recurring_rule_id is null
         and (id = (f->>'source_transaction_id')::uuid
              or client_uuid = (f->>'source_client_uuid')::uuid);
      get diagnostics linked = row_count;
      if linked = 0 then raise exception 'That entry can''t be made recurring.'; end if;
    end if;
  else
    update public.recurring_rules r set
      kind               = case when f ? 'kind' then (f->>'kind')::public.txn_kind else r.kind end,
      category_id        = case when f ? 'category_id' then (f->>'category_id')::uuid else r.category_id end,
      account_id         = case when f ? 'account_id' then (f->>'account_id')::uuid else r.account_id end,
      amount_enc         = case when f ? 'amount_minor' then public.enc_minor((f->>'amount_minor')::bigint, k) else r.amount_enc end,
      currency           = case when f ? 'currency' then f->>'currency' else r.currency end,
      description_enc    = case when f ? 'description' then public.enc_text(f->>'description', k) else r.description_enc end,
      frequency          = case when f ? 'frequency' then (f->>'frequency')::public.recurrence_freq else r.frequency end,
      interval_n         = case when f ? 'interval_n' then (f->>'interval_n')::int else r.interval_n end,
      next_run           = case when f ? 'next_run' then greatest((f->>'next_run')::date, oldest) else r.next_run end,
      end_date           = case when f ? 'end_date' then (f->>'end_date')::date else r.end_date end,
      is_active          = case when f ? 'is_active' then (f->>'is_active')::boolean else r.is_active end,
      remind_days_before = case when f ? 'remind_days_before' then (f->>'remind_days_before')::int else r.remind_days_before end,
      -- Only income can be savings: a rule switched to expense drops the flag.
      savings_from_income = case
        when (case when f ? 'kind' then f->>'kind' else r.kind::text end) <> 'income' then false
        when f ? 'savings_from_income' then coalesce((f->>'savings_from_income')::boolean, false)
        else r.savings_from_income end,
      -- Only an expense can be paid from savings: a rule switched to income
      -- drops the flag.
      paid_from_savings = case
        when (case when f ? 'kind' then f->>'kind' else r.kind::text end) <> 'expense' then false
        when f ? 'paid_from_savings' then coalesce((f->>'paid_from_savings')::boolean, false)
        else r.paid_from_savings end
    where r.id = p_id and r.user_id = uid
    returning r.id into rid;
    if rid is null then raise exception 'not found'; end if;
  end if;
  return rid;
end $$;
revoke execute on function public.save_recurring_rule(uuid, jsonb) from anon, public;
grant execute on function public.save_recurring_rule(uuid, jsonb) to authenticated;

drop function if exists public.my_recurring_rules();
create function public.my_recurring_rules()
returns table(id uuid, user_id uuid, kind text, category_id uuid, account_id uuid,
  amount_minor bigint, currency text, description text, frequency text, interval_n integer,
  next_run date, end_date date, is_active boolean, created_at timestamptz,
  remind_days_before integer, last_reminded_for date, categories jsonb, savings_from_income boolean,
  paid_from_savings boolean)
language sql
stable security definer
set search_path = public, pg_temp
as $$
  select r.id, r.user_id, r.kind::text, r.category_id, r.account_id,
         public.dec_minor(r.amount_enc, k.k), r.currency::text,
         public.dec_text(r.description_enc, k.k), r.frequency::text, r.interval_n,
         r.next_run, r.end_date, r.is_active, r.created_at, r.remind_days_before,
         r.last_reminded_for,
         case when c.id is not null then jsonb_build_object('name', c.name, 'icon', c.icon, 'color', c.color) end,
         r.savings_from_income, r.paid_from_savings
  from public.recurring_rules r
  cross join (select public.app_enc_key() as k) k
  left join public.categories c on c.id = r.category_id and c.user_id = r.user_id
  where r.user_id = auth.uid()
  order by r.is_active desc, r.next_run asc
$$;
revoke execute on function public.my_recurring_rules() from anon, public;
grant execute on function public.my_recurring_rules() to authenticated;

-- The materializer copies both of the rule's flags onto each entry
-- (otherwise as 0084).
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
