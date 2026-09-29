-- public.save_transactions: the current definition (canonical copy).
-- To change it, edit this file, then paste the whole file into a new
-- migration; test/sqlFunctions.test.js keeps the two equal.
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
