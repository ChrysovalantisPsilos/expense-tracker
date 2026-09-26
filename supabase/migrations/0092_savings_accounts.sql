-- Savings accounts: a third net-worth account type, 'savings', next to
-- 'asset' and 'liability'. A savings account is money the user holds as
-- savings (a savings or deposit account). When the user has one or more, their
-- balances ARE the savings total: the Savings page shows it instead of the pot
-- worked out from savings entries, and net worth counts those accounts once
-- and drops its computed "Savings" line, so the same money is never counted
-- twice (the rule lives in supabase/functions/_shared/savings.ts). With no
-- savings account nothing changes.
--
-- 1. accounts.type accepts 'savings'.
-- 2. save_account (the encrypting write RPC, 0047) accepts it too. Same
--    signature, body, pinned search_path and grants; only the type list grows.

-- 1 ---------------------------------------------------------------------------
alter table public.accounts drop constraint if exists accounts_type_chk;
alter table public.accounts
  add constraint accounts_type_chk check (type in ('asset', 'liability', 'savings'));

-- 2 ---------------------------------------------------------------------------
create or replace function public.save_account(
  p_id uuid, p_name text, p_type text, p_balance bigint, p_currency text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); k text; rid uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if coalesce(p_type, 'asset') not in ('asset', 'liability', 'savings') then raise exception 'bad type'; end if;
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
