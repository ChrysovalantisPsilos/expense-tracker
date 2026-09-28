-- 0097: Meal vouchers — an amount per working day on its own card, on top
-- of the salary (Belgium's maaltijdcheques / titres-repas, Greece's
-- κουπόνια σίτισης). The app keeps the card apart from the bank money: its
-- top-ups are never income, and an expense paid with vouchers is spending
-- everywhere spending counts (Home's Spent, categories, budgets, Insights,
-- the statement) but doesn't lower the net and never touches savings (the
-- app's rule: supabase/functions/_shared/savings.ts, 'expense-from-vouchers').
-- The balance maths lives on the device (src/features/vouchers/voucherMath.js).
--
--   1. transactions.paid_with_vouchers (default false; true only on an
--      expense, and never with paid_from_savings: CHECK). Set only through
--      the encrypting RPCs below, owner-only like every other field; callers
--      that don't send it get false (CSV imports, group mirrors, recurring
--      entries).
--   2. save_transactions / update_transaction (as 0085) take it; both flags
--      on one expense keep savings.
--   3. my_transactions (as 0094) returns it and takes p_paid_with_vouchers
--      (default false): true keeps only the expenses paid with vouchers (the
--      card's history). A new signature, so the old one is dropped first.
--   4. meal_vouchers — ONE setup per account (user_id is the key), one JSON
--      document encrypted at rest like other amounts (enc_text + app_enc_key):
--        { v: 1, country: 'BE' | 'GR', per_day_minor, currency, topup_day
--          (1–28), start_on: 'YYYY-MM-DD', start_balance_minor,
--          days: { 'YYYY-MM': n } }
--      RLS on, no policies and no grants — reached only through the definer
--      functions; the 0095 owner guard forces user_id to the caller.
--        my_meal_vouchers()        the caller's setup, or null
--        save_meal_vouchers(doc)   validates the shape (meal_vouchers_check),
--                                  300 saves/hour; null turns vouchers off
--                                  (deletes the setup; the expenses keep
--                                  their flag)
--   5. export_my_data() (as 0095) also returns the setup. Account deletion
--      needs nothing new (the table cascades from auth.users).
--   6. demo_wipe (as 0095) also clears the demo accounts' setups.

-- 1 ---------------------------------------------------------------------------
alter table public.transactions
  add column if not exists paid_with_vouchers boolean not null default false;
alter table public.transactions drop constraint if exists transactions_paid_with_vouchers_check;
alter table public.transactions
  add constraint transactions_paid_with_vouchers_check
  check (not paid_with_vouchers or (kind = 'expense' and not paid_from_savings));

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
       exchange_rate, description_enc, notes_enc, spent_at, savings_from_income, paid_from_savings,
       paid_with_vouchers)
    select uid, coalesce(x.client_uuid, gen_random_uuid()),
           coalesce(x.kind, 'expense')::public.txn_kind, x.category_id, x.account_id,
           public.enc_minor(x.amount_minor, k), coalesce(x.currency, 'EUR'),
           coalesce(x.exchange_rate, 1), public.enc_text(x.description, k),
           public.enc_text(x.notes, k), coalesce(x.spent_at, current_date),
           coalesce(x.savings_from_income, false) and coalesce(x.kind, 'expense') = 'income',
           coalesce(x.paid_from_savings, false) and coalesce(x.kind, 'expense') = 'expense',
           coalesce(x.paid_with_vouchers, false) and coalesce(x.kind, 'expense') = 'expense'
             and not coalesce(x.paid_from_savings, false)
    from jsonb_to_recordset(p_rows) as x(client_uuid uuid, kind text, category_id uuid,
         account_id uuid, amount_minor bigint, currency text, exchange_rate numeric,
         description text, notes text, spent_at date, savings_from_income boolean,
         paid_from_savings boolean, paid_with_vouchers boolean)
    on conflict (user_id, client_uuid) do update set
      kind = excluded.kind, category_id = excluded.category_id,
      account_id = excluded.account_id, amount_enc = excluded.amount_enc,
      currency = excluded.currency, exchange_rate = excluded.exchange_rate,
      description_enc = excluded.description_enc, notes_enc = excluded.notes_enc,
      spent_at = excluded.spent_at, savings_from_income = excluded.savings_from_income,
      paid_from_savings = excluded.paid_from_savings, paid_with_vouchers = excluded.paid_with_vouchers
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
        base text; cur record; new_cur text; new_rate numeric; from_savings boolean; vouchers boolean;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if f ? 'amount_minor' and coalesce((f->>'amount_minor')::bigint, -1) < 0 then
    raise exception 'amount must be zero or more';
  end if;
  if not public.owns_refs(uid, (f->>'category_id')::uuid, (f->>'account_id')::uuid) then
    raise exception 'category or account not found';
  end if;
  select currency, exchange_rate, kind, paid_from_savings, paid_with_vouchers into cur
    from public.transactions where id = p_id and user_id = uid;
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
  -- Paid from savings or with vouchers: expenses only, never both (savings wins).
  from_savings := case when f ? 'paid_from_savings' then coalesce((f->>'paid_from_savings')::boolean, false)
                       else cur.paid_from_savings end and cur.kind = 'expense';
  vouchers := case when f ? 'paid_with_vouchers' then coalesce((f->>'paid_with_vouchers')::boolean, false)
                   else cur.paid_with_vouchers end and cur.kind = 'expense' and not from_savings;
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
    paid_from_savings = from_savings,
    paid_with_vouchers = vouchers
  where t.id = p_id and t.user_id = uid;
end $$;
revoke execute on function public.update_transaction(uuid, jsonb) from anon, public;
grant execute on function public.update_transaction(uuid, jsonb) to authenticated;

-- 3 ---------------------------------------------------------------------------
drop function if exists public.my_transactions(text, date, date, uuid, integer, boolean, boolean);
create or replace function public.my_transactions(
  p_kind text default null, p_from date default null, p_to date default null,
  p_category uuid default null, p_limit integer default null, p_spread boolean default false,
  p_paid_from_savings boolean default false, p_paid_with_vouchers boolean default false)
returns table(id uuid, user_id uuid, kind text, category_id uuid, account_id uuid,
  amount_minor bigint, currency text, exchange_rate numeric, description text, notes text,
  spent_at date, group_id uuid, is_shared boolean, client_uuid uuid,
  created_at timestamptz, updated_at timestamptz, group_expense_id uuid,
  categories jsonb, group_expenses jsonb, recurring_rule_id uuid, recurring jsonb,
  spread_months smallint, savings_from_income boolean, paid_from_savings boolean,
  paid_with_vouchers boolean)
language sql
stable security definer
set search_path = public, pg_temp
as $$
  select t.id, t.user_id, t.kind::text, t.category_id, t.account_id,
         public.dec_minor(t.amount_enc, k.k), t.currency::text, t.exchange_rate,
         public.dec_text(t.description_enc, k.k), public.dec_text(t.notes_enc, k.k),
         t.spent_at, t.group_id, t.is_shared, t.client_uuid, t.created_at,
         t.updated_at, t.group_expense_id,
         case when c.id is not null then jsonb_build_object(
           'name', c.name, 'icon', c.icon, 'color', c.color, 'default_key', c.default_key) end,
         case when g.id is not null then jsonb_build_object('groups', jsonb_build_object('name', g.name)) end,
         t.recurring_rule_id,
         case when rr.id is not null then jsonb_build_object(
           'frequency', rr.frequency, 'interval_n', rr.interval_n, 'is_active', rr.is_active) end,
         t.spread_months, t.savings_from_income, t.paid_from_savings, t.paid_with_vouchers
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
    and (not coalesce(p_paid_with_vouchers, false) or t.paid_with_vouchers)
  order by t.spent_at desc, t.created_at desc
  limit p_limit
$$;
revoke execute on function public.my_transactions(text, date, date, uuid, integer, boolean, boolean, boolean) from public, anon;
grant execute on function public.my_transactions(text, date, date, uuid, integer, boolean, boolean, boolean) to authenticated;

-- 4 ---------------------------------------------------------------------------
create table if not exists public.meal_vouchers (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  payload_enc bytea not null,
  updated_at  timestamptz not null default now()
);
alter table public.meal_vouchers enable row level security;
revoke all on public.meal_vouchers from public, anon, authenticated;

drop trigger if exists meal_vouchers_owner_guard on public.meal_vouchers;
create trigger meal_vouchers_owner_guard
  before insert or update on public.meal_vouchers
  for each row execute function public.recurring_plan_owner_guard();

-- The setup document's shape (see the header): raises 'bad setup' for
-- anything the app never sends. Each test on its own line: SQL doesn't
-- promise to stop at the first false one.
create or replace function public.meal_vouchers_check(p jsonb)
returns void
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare e record;
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'bad setup'; end if;
  if octet_length(p::text) > 4096 then raise exception 'bad setup'; end if;
  if exists (select 1 from jsonb_object_keys(p) k
             where k not in ('v', 'country', 'per_day_minor', 'currency', 'topup_day',
                             'start_on', 'start_balance_minor', 'days')) then
    raise exception 'bad setup';
  end if;
  if p->'v' is distinct from '1'::jsonb
     or coalesce(p->>'country', '') not in ('BE', 'GR')
     or coalesce(p->>'currency', '') !~ '^[A-Z]{3}$'
     or jsonb_typeof(p->'per_day_minor') is distinct from 'number'
     or jsonb_typeof(p->'topup_day') is distinct from 'number'
     or jsonb_typeof(p->'start_balance_minor') is distinct from 'number'
     or jsonb_typeof(p->'start_on') is distinct from 'string'
     or jsonb_typeof(p->'days') is distinct from 'object' then
    raise exception 'bad setup';
  end if;
  if (p->>'per_day_minor') !~ '^[0-9]{1,7}$' or (p->>'topup_day') !~ '^[0-9]{1,2}$'
     or (p->>'start_balance_minor') !~ '^[0-9]{1,12}$'
     or (p->>'start_on') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'bad setup';
  end if;
  if (p->>'per_day_minor')::int <= 0 or (p->>'topup_day')::int not between 1 and 28 then
    raise exception 'bad setup';
  end if;
  perform (p->>'start_on')::date;   -- a real date, or it raises
  if (select count(*) from jsonb_object_keys(p->'days')) > 24 then raise exception 'bad setup'; end if;
  for e in select key, value from jsonb_each(p->'days') loop
    if e.key !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or jsonb_typeof(e.value) <> 'number'
       or (e.value #>> '{}') !~ '^[0-9]{1,2}$' then
      raise exception 'bad setup';
    end if;
    if (e.value #>> '{}')::int > 31 then raise exception 'bad setup'; end if;
  end loop;
end $$;
revoke execute on function public.meal_vouchers_check(jsonb) from public, anon, authenticated;

create or replace function public.my_meal_vouchers()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  return (select public.dec_text(m.payload_enc, public.app_enc_key())::jsonb
            from public.meal_vouchers m where m.user_id = uid);
end $$;
revoke execute on function public.my_meal_vouchers() from public, anon;
grant execute on function public.my_meal_vouchers() to authenticated;

create or replace function public.save_meal_vouchers(p jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p is not null and jsonb_typeof(p) <> 'null' then perform public.meal_vouchers_check(p); end if;
  if not public.rate_limit('vouchers:' || uid, 300, 3600) then
    raise exception 'Too many saves — please slow down.';
  end if;
  if p is null or jsonb_typeof(p) = 'null' then
    delete from public.meal_vouchers where user_id = uid;
    return;
  end if;
  insert into public.meal_vouchers (user_id, payload_enc, updated_at)
  values (uid, public.enc_text(p::text, public.app_enc_key()), now())
  on conflict (user_id) do update set payload_enc = excluded.payload_enc, updated_at = now();
end $$;
revoke execute on function public.save_meal_vouchers(jsonb) from public, anon;
grant execute on function public.save_meal_vouchers(jsonb) to authenticated;

-- 5 ---------------------------------------------------------------------------
-- As 0095, plus the meal voucher setup (decrypted, the caller's only).
create or replace function public.export_my_data()
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); doc jsonb; k text;
begin
  doc := public.build_my_data_export();   -- checks the caller and the 10/h limit
  perform public.enqueue_privacy_email(uid, 'data_export');
  k := public.app_enc_key();
  return doc || jsonb_build_object(
    'privacy_emails', (select coalesce(jsonb_agg(jsonb_build_object(
        'kind', q.kind, 'last_event_at', q.last_event_at, 'last_sent_at', q.last_sent_at,
        'next_due_at', q.due_at) order by q.kind), '[]'::jsonb)
      from public.privacy_email_queue q where q.user_id = uid),
    'legal_update_emails', (select coalesce(jsonb_agg(jsonb_build_object(
        'privacy_version', n.privacy_version, 'terms_version', n.terms_version,
        'emailed_at', n.emailed_at)), '[]'::jsonb)
      from public.legal_update_notices n where n.user_id = uid),
    'recurring_plan', (select jsonb_build_object(
        'plan', public.dec_text(p.payload_enc, k)::jsonb, 'updated_at', p.updated_at)
      from public.recurring_plans p where p.user_id = uid),
    'recurring_plan_undo', (select jsonb_build_object(
        'applied_at', u.applied_at, 'change_count', u.change_count,
        'snapshot', public.dec_text(u.snapshot_enc, k)::jsonb)
      from public.recurring_plan_undo u where u.user_id = uid),
    'meal_vouchers', (select jsonb_build_object(
        'setup', public.dec_text(m.payload_enc, k)::jsonb, 'updated_at', m.updated_at)
      from public.meal_vouchers m where m.user_id = uid));
end $$;

-- 6 ---------------------------------------------------------------------------
-- As 0095, plus the meal voucher setups.
create or replace function public.demo_wipe(p_ids uuid[])
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  delete from public.notifications where user_id = any(p_ids);
  delete from public.groups where owner_id = any(p_ids);
  delete from public.group_invites where created_by = any(p_ids) or invited_user_id = any(p_ids);
  update public.profiles set salary_category_id = null where id = any(p_ids);
  delete from public.recurring_plans where user_id = any(p_ids);
  delete from public.recurring_plan_undo where user_id = any(p_ids);
  delete from public.meal_vouchers where user_id = any(p_ids);
  delete from public.transactions where user_id = any(p_ids);
  delete from public.recurring_rules where user_id = any(p_ids);
  delete from public.budgets where user_id = any(p_ids);
  delete from public.category_rules where user_id = any(p_ids);
  delete from public.accounts where user_id = any(p_ids);
  delete from public.savings_goals where user_id = any(p_ids);
  delete from public.categories where user_id = any(p_ids);
  delete from public.push_subscriptions where user_id = any(p_ids);
  delete from public.consents where user_id = any(p_ids);
  delete from public.privacy_email_queue where user_id = any(p_ids);
  delete from public.inactivity_notices where user_id = any(p_ids);
  delete from public.legal_update_notices where user_id = any(p_ids);
  delete from public.rate_limits r
   where exists (select 1 from unnest(p_ids) i where position(i::text in r.key) > 0);
end $$;
revoke execute on function public.demo_wipe(uuid[]) from public, anon, authenticated;
