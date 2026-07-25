-- Encrypt personal money fields at rest with pgcrypto + a Vault key, extending
-- the payment-field pattern (0046) to: account balances, budget caps, and
-- savings-goal amounts. A leaked DB dump shows only ciphertext for these.
--
-- Same threat model as 0046: AT-REST protection (leaked backups / casual
-- browsing), NOT end-to-end — the running project decrypts via the definer RPCs
-- below. pgcrypto lives in the `extensions` schema, so its functions are
-- schema-qualified. Reads go through decrypting RPCs; writes through encrypting
-- RPCs. Realtime keeps working because the base tables stay real tables.

-- ---------------------------------------------------------------------------
-- Key: a per-project random symmetric key in Vault (separate from the payment
-- key, clearly named for the broader set of personal fields).
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'app_enc_key') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'base64'),
      'app_enc_key',
      'Symmetric key for encrypting personal money fields (balances, budgets, goals).'
    );
  end if;
end $$;

create or replace function public.app_enc_key()
returns text language sql security definer stable
set search_path = public as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'app_enc_key' limit 1;
$$;
revoke execute on function public.app_enc_key() from anon, authenticated, public;

-- ===========================================================================
-- ACCOUNTS — balance_minor
-- ===========================================================================
alter table public.accounts add column if not exists balance_enc bytea;
update public.accounts
  set balance_enc = extensions.pgp_sym_encrypt(balance_minor::text, public.app_enc_key())
  where balance_minor is not null;
alter table public.accounts drop column if exists balance_minor;

create or replace function public.save_account(
  p_id uuid, p_name text, p_type text, p_balance bigint, p_currency text)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); k text; rid uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if coalesce(p_type, 'asset') not in ('asset', 'liability') then raise exception 'bad type'; end if;
  k := public.app_enc_key();
  if p_id is null then
    insert into public.accounts (user_id, name, type, currency, balance_enc)
      values (uid, p_name, coalesce(p_type, 'asset'), coalesce(p_currency, 'EUR'),
              extensions.pgp_sym_encrypt(coalesce(p_balance, 0)::text, k))
      returning id into rid;
  else
    update public.accounts set
      name = p_name, type = coalesce(p_type, 'asset'), currency = coalesce(p_currency, 'EUR'),
      balance_enc = extensions.pgp_sym_encrypt(coalesce(p_balance, 0)::text, k)
      where id = p_id and user_id = uid returning id into rid;
    if rid is null then raise exception 'not found'; end if;
  end if;
  return rid;
end $$;
revoke execute on function public.save_account(uuid, text, text, bigint, text) from anon, public;
grant execute on function public.save_account(uuid, text, text, bigint, text) to authenticated;

create or replace function public.my_accounts()
returns table(id uuid, name text, type text, balance_minor bigint,
              currency text, is_archived boolean, created_at timestamptz)
language sql security definer stable set search_path = public as $$
  select a.id, a.name, a.type,
         extensions.pgp_sym_decrypt(a.balance_enc, public.app_enc_key())::bigint,
         a.currency::text, a.is_archived, a.created_at
  from public.accounts a
  where a.user_id = auth.uid() and a.is_archived = false
  order by a.created_at
$$;
revoke execute on function public.my_accounts() from anon, public;
grant execute on function public.my_accounts() to authenticated;

-- ===========================================================================
-- BUDGETS — amount_minor (the monthly cap)
-- ===========================================================================
alter table public.budgets add column if not exists amount_enc bytea;
update public.budgets
  set amount_enc = extensions.pgp_sym_encrypt(amount_minor::text, public.app_enc_key())
  where amount_minor is not null;
alter table public.budgets drop column if exists amount_minor;

create or replace function public.save_budget(
  p_category uuid, p_amount bigint, p_currency text, p_period date)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); k text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  k := public.app_enc_key();
  insert into public.budgets (user_id, category_id, currency, period_start, amount_enc)
    values (uid, p_category, coalesce(p_currency, 'EUR'),
            coalesce(p_period, date_trunc('month', current_date)::date),
            extensions.pgp_sym_encrypt(coalesce(p_amount, 0)::text, k))
  on conflict (user_id, category_id, period_start)
    do update set amount_enc = excluded.amount_enc, currency = excluded.currency;
end $$;
revoke execute on function public.save_budget(uuid, bigint, text, date) from anon, public;
grant execute on function public.save_budget(uuid, bigint, text, date) to authenticated;

create or replace function public.my_budgets(p_period date)
returns table(id uuid, category_id uuid, amount_minor bigint, currency text,
              period_start date, categories jsonb)
language sql security definer stable set search_path = public as $$
  select b.id, b.category_id,
         extensions.pgp_sym_decrypt(b.amount_enc, public.app_enc_key())::bigint,
         b.currency::text, b.period_start,
         case when c.id is not null then jsonb_build_object('name', c.name, 'icon', c.icon) end
  from public.budgets b
  left join public.categories c on c.id = b.category_id
  where b.user_id = auth.uid() and b.period_start = p_period
$$;
revoke execute on function public.my_budgets(date) from anon, public;
grant execute on function public.my_budgets(date) to authenticated;

-- ===========================================================================
-- SAVINGS GOALS — target_minor + saved_minor
-- ===========================================================================
alter table public.savings_goals
  add column if not exists target_enc bytea,
  add column if not exists saved_enc bytea;
update public.savings_goals set
  target_enc = extensions.pgp_sym_encrypt(target_minor::text, public.app_enc_key()),
  saved_enc  = extensions.pgp_sym_encrypt(saved_minor::text,  public.app_enc_key());
alter table public.savings_goals
  drop column if exists target_minor,
  drop column if exists saved_minor;

create or replace function public.save_goal(
  p_id uuid, p_name text, p_target bigint, p_saved bigint, p_currency text, p_target_date date)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); k text; rid uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  k := public.app_enc_key();
  if p_id is null then
    insert into public.savings_goals (user_id, name, currency, target_date, target_enc, saved_enc)
      values (uid, p_name, coalesce(p_currency, 'EUR'), p_target_date,
              extensions.pgp_sym_encrypt(coalesce(p_target, 0)::text, k),
              extensions.pgp_sym_encrypt(coalesce(p_saved, 0)::text, k))
      returning id into rid;
  else
    update public.savings_goals set
      name = p_name, currency = coalesce(p_currency, 'EUR'), target_date = p_target_date,
      target_enc = extensions.pgp_sym_encrypt(coalesce(p_target, 0)::text, k),
      saved_enc  = extensions.pgp_sym_encrypt(coalesce(p_saved, 0)::text, k)
      where id = p_id and user_id = uid returning id into rid;
    if rid is null then raise exception 'not found'; end if;
  end if;
  return rid;
end $$;
revoke execute on function public.save_goal(uuid, text, bigint, bigint, text, date) from anon, public;
grant execute on function public.save_goal(uuid, text, bigint, bigint, text, date) to authenticated;

create or replace function public.my_goals()
returns table(id uuid, name text, target_minor bigint, saved_minor bigint,
              currency text, target_date date, created_at timestamptz)
language sql security definer stable set search_path = public as $$
  select g.id, g.name,
         extensions.pgp_sym_decrypt(g.target_enc, public.app_enc_key())::bigint,
         extensions.pgp_sym_decrypt(g.saved_enc,  public.app_enc_key())::bigint,
         g.currency::text, g.target_date, g.created_at
  from public.savings_goals g
  where g.user_id = auth.uid()
  order by g.created_at
$$;
revoke execute on function public.my_goals() from anon, public;
grant execute on function public.my_goals() to authenticated;

-- ===========================================================================
-- Budget-threshold alert trigger: the cap now lives encrypted, so decrypt it
-- for the comparison, and drop the figures from the notification body (they'd
-- otherwise re-leak the encrypted cap into notifications.body in plaintext).
-- ===========================================================================
create or replace function public.notify_budget_threshold()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  b record;
  cap bigint;
  spent_after bigint;
  spent_before bigint;
  cat_name text;
begin
  if NEW.kind <> 'expense' or NEW.category_id is null then return NEW; end if;

  select * into b from public.budgets
   where user_id = NEW.user_id and category_id = NEW.category_id
     and period_start = date_trunc('month', NEW.spent_at)::date;
  if b is null then return NEW; end if;
  cap := extensions.pgp_sym_decrypt(b.amount_enc, public.app_enc_key())::bigint;
  if cap is null or cap <= 0 then return NEW; end if;

  select coalesce(sum(round(amount_minor * coalesce(exchange_rate, 1))), 0)
    into spent_after
    from public.transactions
   where user_id = NEW.user_id and category_id = NEW.category_id and kind = 'expense'
     and spent_at >= b.period_start
     and spent_at < (b.period_start + interval '1 month')::date;
  spent_before := spent_after - round(NEW.amount_minor * coalesce(NEW.exchange_rate, 1));

  select name into cat_name from public.categories where id = NEW.category_id;
  cat_name := coalesce(cat_name, 'A category');

  -- Generic bodies: no amounts, so the encrypted cap never lands in plaintext.
  if spent_before < cap and spent_after >= cap then
    insert into public.notifications (user_id, type, title, body)
    values (NEW.user_id, 'budget', 'Budget exceeded',
      cat_name || ' has passed its monthly budget.');
  elsif spent_before < round(cap * 0.8) and spent_after >= round(cap * 0.8) then
    insert into public.notifications (user_id, type, title, body)
    values (NEW.user_id, 'budget', 'Budget almost used',
      cat_name || ' is nearly at its monthly budget.');
  end if;

  return NEW;
end $$;
