-- 0063: a PayPal.me handle next to the IBAN and Revolut tag.
--
-- Same model as 0046's payment fields: encrypted at rest with the Vault
-- payment key, written and read only through definer RPCs (no column grant,
-- so a client can't plant ciphertext), and shown to co-members by
-- member_payment_info for the settle-up shortcuts.
--
-- set_payment_info gains p_paypal. NULL leaves the stored handle alone (an
-- old cached client that only knows IBAN/Revolut can't wipe it); '' clears it.
-- The old 2-argument version is dropped so PostgREST calls aren't ambiguous.

alter table public.profiles add column if not exists payment_paypal_enc bytea;
revoke update (payment_paypal_enc) on public.profiles from public, anon, authenticated;

drop function if exists public.set_payment_info(text, text);
create function public.set_payment_info(p_iban text, p_revolut text, p_paypal text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid := auth.uid(); k text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if char_length(coalesce(p_iban, '')) > 64 or char_length(coalesce(p_revolut, '')) > 64
     or char_length(coalesce(p_paypal, '')) > 64 then
    raise exception 'Payment details are too long.';
  end if;
  if nullif(btrim(p_paypal), '') is not null and btrim(p_paypal) !~ '^[A-Za-z0-9]{1,20}$' then
    raise exception 'A PayPal.me name is up to 20 letters and numbers.';
  end if;
  k := public.payment_enc_key();
  update public.profiles set
    payment_iban_enc = case when nullif(btrim(p_iban), '') is not null
      then extensions.pgp_sym_encrypt(btrim(p_iban), k) end,
    payment_revolut_enc = case when nullif(btrim(p_revolut), '') is not null
      then extensions.pgp_sym_encrypt(btrim(p_revolut), k) end,
    payment_paypal_enc = case
      when p_paypal is null then payment_paypal_enc
      when btrim(p_paypal) = '' then null
      else extensions.pgp_sym_encrypt(btrim(p_paypal), k) end
  where id = uid;
end $$;
revoke execute on function public.set_payment_info(text, text, text) from public, anon;
grant execute on function public.set_payment_info(text, text, text) to authenticated;

create or replace function public.my_payment_info()
returns jsonb
language plpgsql
stable security definer
set search_path = public
as $$
declare uid uuid := auth.uid(); k text; res jsonb;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  k := public.payment_enc_key();
  select jsonb_build_object(
    'payment_iban', case when p.payment_iban_enc is not null
      then extensions.pgp_sym_decrypt(p.payment_iban_enc, k) end,
    'payment_revolut', case when p.payment_revolut_enc is not null
      then extensions.pgp_sym_decrypt(p.payment_revolut_enc, k) end,
    'payment_paypal', case when p.payment_paypal_enc is not null
      then extensions.pgp_sym_decrypt(p.payment_paypal_enc, k) end
  ) into res from public.profiles p where p.id = uid;
  return coalesce(res, '{}'::jsonb);
end $$;

create or replace function public.member_payment_info(p_member uuid)
returns jsonb
language plpgsql
stable security definer
set search_path = public
as $$
declare uid uuid := auth.uid(); tgt record; k text; res jsonb;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select gm.user_id, gm.group_id into tgt
    from public.group_members gm where gm.id = p_member;
  if tgt is null or tgt.user_id is null then return '{}'::jsonb; end if;
  if not exists (
    select 1 from public.group_members me
    where me.group_id = tgt.group_id and me.user_id = uid
  ) then
    raise exception 'not allowed';
  end if;
  k := public.payment_enc_key();
  select jsonb_build_object(
    'payment_iban', case when p.payment_iban_enc is not null
      then extensions.pgp_sym_decrypt(p.payment_iban_enc, k) end,
    'payment_revolut', case when p.payment_revolut_enc is not null
      then extensions.pgp_sym_decrypt(p.payment_revolut_enc, k) end,
    'payment_paypal', case when p.payment_paypal_enc is not null
      then extensions.pgp_sym_decrypt(p.payment_paypal_enc, k) end
  ) into res
  from public.profiles p where p.id = tgt.user_id;
  return coalesce(res, '{}'::jsonb);
end $$;
