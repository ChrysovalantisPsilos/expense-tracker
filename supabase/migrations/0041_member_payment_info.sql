-- Payment info for settle-up shortcuts. profiles is strictly own-row RLS, so
-- the settle modal couldn't read the payee's IBAN/Revolut tag — the shortcuts
-- silently never rendered. This definer RPC exposes EXACTLY those two fields,
-- and only to callers who share the group with the member.

create or replace function public.member_payment_info(p_member uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare
  uid uuid := auth.uid();
  tgt record;
  res jsonb;
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
  select jsonb_build_object(
    'payment_iban', p.payment_iban,
    'payment_revolut', p.payment_revolut
  ) into res
  from public.profiles p where p.id = tgt.user_id;
  return coalesce(res, '{}'::jsonb);
end $$;
revoke execute on function public.member_payment_info(uuid) from anon, public;
grant execute on function public.member_payment_info(uuid) to authenticated;
