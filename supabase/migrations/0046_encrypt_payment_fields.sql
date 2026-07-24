-- Encrypt the profile payment fields (IBAN / Revolut) at rest with pgcrypto and
-- a symmetric key held in Supabase Vault. The Vault root key lives OUTSIDE the
-- database, so a logical dump / leaked backup contains only ciphertext and can't
-- be decrypted from the dump alone. `select payment_* from profiles` no longer
-- exists — the plaintext columns are dropped and access goes through the definer
-- RPCs below.
--
-- Scope + threat model: this is AT-REST protection against leaked backups and
-- casual table browsing. It is NOT end-to-end encryption — the running project
-- (and thus the operator, via these RPCs) can still decrypt. pgcrypto lives in
-- the `extensions` schema on Supabase, so its functions are schema-qualified.

-- ---------------------------------------------------------------------------
-- 1. Per-project random key in Vault (created once; each project gets its own).
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'payment_enc_key') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'base64'),
      'payment_enc_key',
      'Symmetric key for encrypting profile payment fields (IBAN/Revolut).'
    );
  end if;
end $$;

-- Fetch the key. Definer + locked down: only the payment RPCs use it, never the
-- API roles.
create or replace function public.payment_enc_key()
returns text language sql security definer stable
set search_path = public as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'payment_enc_key' limit 1;
$$;
revoke execute on function public.payment_enc_key() from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- 2. Ciphertext columns; backfill from plaintext; drop the plaintext columns.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists payment_iban_enc bytea,
  add column if not exists payment_revolut_enc bytea;

update public.profiles set
  payment_iban_enc = case when payment_iban is not null
    then extensions.pgp_sym_encrypt(payment_iban, public.payment_enc_key()) end,
  payment_revolut_enc = case when payment_revolut is not null
    then extensions.pgp_sym_encrypt(payment_revolut, public.payment_enc_key()) end
where payment_iban is not null or payment_revolut is not null;

alter table public.profiles
  drop column if exists payment_iban,
  drop column if exists payment_revolut;

-- ---------------------------------------------------------------------------
-- 3. Write path: encrypt into the caller's own row (empty -> NULL).
-- ---------------------------------------------------------------------------
create or replace function public.set_payment_info(p_iban text, p_revolut text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); k text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  k := public.payment_enc_key();
  update public.profiles set
    payment_iban_enc = case when nullif(btrim(p_iban), '') is not null
      then extensions.pgp_sym_encrypt(btrim(p_iban), k) end,
    payment_revolut_enc = case when nullif(btrim(p_revolut), '') is not null
      then extensions.pgp_sym_encrypt(btrim(p_revolut), k) end
  where id = uid;
end $$;
revoke execute on function public.set_payment_info(text, text) from anon, public;
grant execute on function public.set_payment_info(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Read path (own): decrypt the caller's own fields.
-- ---------------------------------------------------------------------------
create or replace function public.my_payment_info()
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare uid uuid := auth.uid(); k text; res jsonb;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  k := public.payment_enc_key();
  select jsonb_build_object(
    'payment_iban', case when p.payment_iban_enc is not null
      then extensions.pgp_sym_decrypt(p.payment_iban_enc, k) end,
    'payment_revolut', case when p.payment_revolut_enc is not null
      then extensions.pgp_sym_decrypt(p.payment_revolut_enc, k) end
  ) into res from public.profiles p where p.id = uid;
  return coalesce(res, '{}'::jsonb);
end $$;
revoke execute on function public.my_payment_info() from anon, public;
grant execute on function public.my_payment_info() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Co-member read path (settle-up): same authorization as before, but now it
--    decrypts from the ciphertext columns.
-- ---------------------------------------------------------------------------
create or replace function public.member_payment_info(p_member uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
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
      then extensions.pgp_sym_decrypt(p.payment_revolut_enc, k) end
  ) into res
  from public.profiles p where p.id = tgt.user_id;
  return coalesce(res, '{}'::jsonb);
end $$;
revoke execute on function public.member_payment_info(uuid) from anon, public;
grant execute on function public.member_payment_info(uuid) to authenticated;
