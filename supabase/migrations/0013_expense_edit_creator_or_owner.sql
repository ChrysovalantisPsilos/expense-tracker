-- Any member can ADD expenses, but only the creator (or the group owner) may
-- edit/delete them.

drop policy if exists ge_all on public.group_expenses;

create policy ge_select on public.group_expenses for select to authenticated
  using (public.is_group_member(group_id));
create policy ge_insert on public.group_expenses for insert to authenticated
  with check (public.is_group_member(group_id));
create policy ge_update on public.group_expenses for update to authenticated
  using (created_by = auth.uid() or public.is_group_owner(group_id))
  with check (created_by = auth.uid() or public.is_group_owner(group_id));
create policy ge_delete on public.group_expenses for delete to authenticated
  using (created_by = auth.uid() or public.is_group_owner(group_id));

drop policy if exists es_all on public.expense_splits;

create policy es_select on public.expense_splits for select to authenticated
  using (exists (select 1 from public.group_expenses e
                 where e.id = expense_id and public.is_group_member(e.group_id)));
create policy es_insert on public.expense_splits for insert to authenticated
  with check (exists (select 1 from public.group_expenses e
                 where e.id = expense_id and public.is_group_member(e.group_id)));
create policy es_update on public.expense_splits for update to authenticated
  using (exists (select 1 from public.group_expenses e
                 where e.id = expense_id and (e.created_by = auth.uid() or public.is_group_owner(e.group_id))));
create policy es_delete on public.expense_splits for delete to authenticated
  using (exists (select 1 from public.group_expenses e
                 where e.id = expense_id and (e.created_by = auth.uid() or public.is_group_owner(e.group_id))));

-- Enforce the same rule inside the edit RPC (runs as definer, bypassing RLS).
create or replace function public.update_group_expense(
  p_expense uuid, p_description text, p_amount bigint, p_currency char(3),
  p_paid_by uuid, p_spent_at date, p_member_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare gid uuid; creator uuid; n int; base bigint; rem bigint; i int;
begin
  select group_id, created_by into gid, creator from public.group_expenses where id = p_expense;
  if gid is null then raise exception 'expense not found'; end if;
  if not public.is_group_member(gid) then raise exception 'not a member'; end if;
  if not (creator = auth.uid() or public.is_group_owner(gid)) then
    raise exception 'Only the person who added this expense (or the group owner) can edit it.';
  end if;
  n := coalesce(array_length(p_member_ids, 1), 0);
  if n = 0 then raise exception 'split between at least one person'; end if;

  update public.group_expenses
    set description = p_description, amount_minor = p_amount, currency = p_currency,
        paid_by = p_paid_by, spent_at = p_spent_at
    where id = p_expense;

  delete from public.expense_splits where expense_id = p_expense;
  base := p_amount / n;
  rem  := p_amount - base * n;
  for i in 1 .. n loop
    insert into public.expense_splits (expense_id, member_id, share_minor)
      values (p_expense, p_member_ids[i], base + case when i <= rem then 1 else 0 end);
  end loop;
end;
$$;
