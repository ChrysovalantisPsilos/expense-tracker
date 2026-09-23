-- Follow-up to 0058, in step with the client's FX fix:
--
-- 1. ISK is a zero-decimal currency (ISO 4217), now selectable in the app.
--    minor_factor gains it; the set matches src/shared/lib/currency.js and
--    supabase/functions/_shared/money.ts (test/edgeShared.test.js checks all
--    three). HUF and IDR stay 2-decimal, as in ISO 4217.
-- 2. A transaction in a currency other than the owner's base currency must
--    carry a real rate. save_transactions used coalesce(exchange_rate, 1), so
--    a missing rate silently stored ¥1,800 as €1,800. Now: a foreign-currency
--    row without a positive rate is rejected, as is any non-positive rate; a
--    base-currency row still defaults to 1. update_transaction applies the
--    same rule to the row as it will be after the patch.
--    (Group shares mirrored by sync_group_share are out of scope here.)

create or replace function public.minor_factor(p_currency text)
returns int language sql immutable parallel safe
set search_path = public, pg_temp as $$
  select case when upper(p_currency) in ('JPY', 'KRW', 'ISK', 'VND', 'CLP') then 1 else 100 end;
$$;
revoke execute on function public.minor_factor(text) from public, anon, authenticated;

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
       exchange_rate, description_enc, notes_enc, spent_at)
    select uid, coalesce(x.client_uuid, gen_random_uuid()),
           coalesce(x.kind, 'expense')::public.txn_kind, x.category_id, x.account_id,
           public.enc_minor(x.amount_minor, k), coalesce(x.currency, 'EUR'),
           coalesce(x.exchange_rate, 1), public.enc_text(x.description, k),
           public.enc_text(x.notes, k), coalesce(x.spent_at, current_date)
    from jsonb_to_recordset(p_rows) as x(client_uuid uuid, kind text, category_id uuid,
         account_id uuid, amount_minor bigint, currency text, exchange_rate numeric,
         description text, notes text, spent_at date)
    on conflict (user_id, client_uuid) do update set
      kind = excluded.kind, category_id = excluded.category_id,
      account_id = excluded.account_id, amount_enc = excluded.amount_enc,
      currency = excluded.currency, exchange_rate = excluded.exchange_rate,
      description_enc = excluded.description_enc, notes_enc = excluded.notes_enc,
      spent_at = excluded.spent_at
      where not p_ignore_duplicates
    returning (t.xmax = 0) as inserted
  )
  select count(*) filter (where inserted) into n from ins;
  return n;
end $$;

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
    spent_at        = case when f ? 'spent_at' then (f->>'spent_at')::date else t.spent_at end
  where t.id = p_id and t.user_id = uid;
end $$;
