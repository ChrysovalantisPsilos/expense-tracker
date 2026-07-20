-- F2: addSharedExpense inserted the group_expenses row and then the
-- expense_splits in a SEPARATE client call — a failed second step orphaned the
-- expense and corrupted balances. Move creation into one transactional RPC
-- (mirrors update_group_expense), so the expense and its equal split are all-or-
-- nothing. The same-group validation triggers (0023) still guard paid_by/members.
create or replace function public.create_group_expense(
  p_group uuid, p_description text, p_amount bigint, p_currency char(3),
  p_paid_by uuid, p_spent_at date, p_member_ids uuid[], p_receipt_path text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); eid uuid; n int; base bigint; rem bigint; i int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not public.is_group_member(p_group) then raise exception 'not a member of this group'; end if;
  n := coalesce(array_length(p_member_ids, 1), 0);
  if n = 0 then raise exception 'split between at least one person'; end if;

  insert into public.group_expenses
    (group_id, description, amount_minor, currency, paid_by, spent_at, receipt_path, created_by)
    values (p_group, p_description, p_amount, p_currency, p_paid_by, p_spent_at, p_receipt_path, uid)
    returning id into eid;

  base := p_amount / n;
  rem  := p_amount - base * n;
  for i in 1 .. n loop
    insert into public.expense_splits (expense_id, member_id, share_minor)
      values (eid, p_member_ids[i], base + case when i <= rem then 1 else 0 end);
  end loop;

  return eid;
end $$;

revoke execute on function public.create_group_expense(uuid, text, bigint, char, uuid, date, uuid[], text) from anon, public;
grant execute on function public.create_group_expense(uuid, text, bigint, char, uuid, date, uuid[], text) to authenticated;
