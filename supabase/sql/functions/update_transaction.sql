-- public.update_transaction: the current definition (canonical copy).
-- To change it, edit this file, then paste the whole file into a new
-- migration; test/sqlFunctions.test.js keeps the two equal.
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
