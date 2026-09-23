-- 0065: mark a transaction as recurring, and remember which rule a row
-- belongs to.
--
-- "Make recurring" turns a personal transaction into a recurring rule whose
-- next charge is one period after the transaction's date. The transaction
-- itself stays as the first occurrence (no duplicate is created).
--
-- transactions.recurring_rule_id links a row to its rule:
--   * the source transaction a rule was made from (save_recurring_rule with
--     'source_transaction_id' or 'source_client_uuid': only the caller's own
--     personal row — never a mirrored group share — and only one not linked
--     yet; the link and the rule are written in one statement, so a bad source
--     rolls the rule back);
--   * every row the nightly materializer creates from the rule.
-- The app uses it to show "Repeats every month" on those rows and to hide
-- "Make recurring" on them. Deleting a rule unlinks its rows (SET NULL); the
-- rows themselves stay. No client can write the column (transactions has no
-- client INSERT/UPDATE grant).

alter table public.transactions
  add column if not exists recurring_rule_id uuid references public.recurring_rules(id) on delete set null;
create index if not exists transactions_recurring_rule_id_idx on public.transactions (recurring_rule_id);

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
       frequency, interval_n, next_run, end_date, is_active, remind_days_before)
    values
      (uid, coalesce(f->>'kind', 'expense')::public.txn_kind, (f->>'category_id')::uuid,
       (f->>'account_id')::uuid, public.enc_minor((f->>'amount_minor')::bigint, k),
       coalesce(f->>'currency', 'EUR'), public.enc_text(f->>'description', k),
       coalesce(f->>'frequency', 'monthly')::public.recurrence_freq,
       coalesce((f->>'interval_n')::int, 1),
       greatest(coalesce((f->>'next_run')::date, current_date), oldest),
       (f->>'end_date')::date, coalesce((f->>'is_active')::boolean, true),
       (f->>'remind_days_before')::int)
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
      remind_days_before = case when f ? 'remind_days_before' then (f->>'remind_days_before')::int else r.remind_days_before end
    where r.id = p_id and r.user_id = uid
    returning r.id into rid;
    if rid is null then raise exception 'not found'; end if;
  end if;
  return rid;
end $$;

-- The materializer stamps each row with its rule (otherwise as in 0062).
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
         description_enc, spent_at, recurring_rule_id)
      values
        (r.user_id, r.kind, r.category_id, r.account_id, r.amount_enc, r.currency, v_rate,
         r.description_enc, run_date, r.id);
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

-- my_transactions also returns the row's rule (id + how often it repeats).
drop function if exists public.my_transactions(text, date, date, uuid, integer);
create function public.my_transactions(
  p_kind text default null, p_from date default null, p_to date default null,
  p_category uuid default null, p_limit integer default null)
returns table(id uuid, user_id uuid, kind text, category_id uuid, account_id uuid,
  amount_minor bigint, currency text, exchange_rate numeric, description text, notes text,
  spent_at date, group_id uuid, is_shared boolean, client_uuid uuid,
  created_at timestamptz, updated_at timestamptz, group_expense_id uuid,
  categories jsonb, group_expenses jsonb, recurring_rule_id uuid, recurring jsonb)
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
           'frequency', rr.frequency, 'interval_n', rr.interval_n, 'is_active', rr.is_active) end
  from public.transactions t
  cross join (select public.app_enc_key() as k) k
  left join public.categories c on c.id = t.category_id and c.user_id = t.user_id
  left join public.group_expenses ge on ge.id = t.group_expense_id
  left join public.groups g on g.id = ge.group_id and public.is_group_member(ge.group_id)
  left join public.recurring_rules rr on rr.id = t.recurring_rule_id and rr.user_id = t.user_id
  where t.user_id = auth.uid()
    and (p_kind is null or t.kind::text = p_kind)
    and (p_from is null or t.spent_at >= p_from)
    and (p_to is null or t.spent_at <= p_to)
    and (p_category is null or t.category_id = p_category)
  order by t.spent_at desc, t.created_at desc
  limit p_limit
$$;
revoke execute on function public.my_transactions(text, date, date, uuid, integer) from public, anon;
grant execute on function public.my_transactions(text, date, date, uuid, integer) to authenticated;
