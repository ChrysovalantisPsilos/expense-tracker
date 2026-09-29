-- public.save_recurring_rule: the current definition (canonical copy).
-- To change it, edit this file, then paste the whole file into a new
-- migration; test/sqlFunctions.test.js keeps the two equal.
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
