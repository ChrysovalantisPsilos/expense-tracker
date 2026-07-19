-- The partial unique index on transactions (transactions_user_group_expense_uniq,
-- WHERE group_expense_id is not null) requires its predicate in the ON CONFLICT
-- target. sync_member_link was missing it on the live DB (only sync_group_share
-- got the earlier fix), which broke claiming a phantom slot when joining a group.
create or replace function public.sync_member_link()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.user_id is not null and OLD.user_id is null then
    insert into public.transactions
      (user_id, kind, amount_minor, currency, exchange_rate, description,
       spent_at, is_shared, group_id, group_expense_id)
    select NEW.user_id, 'expense', s.share_minor, e.currency, 1, e.description,
           e.spent_at, true, e.group_id, e.id
    from public.expense_splits s
    join public.group_expenses e on e.id = s.expense_id
    where s.member_id = NEW.id
    on conflict (user_id, group_expense_id) where group_expense_id is not null
    do nothing;
  elsif NEW.user_id is null and OLD.user_id is not null then
    delete from public.transactions t
    using public.group_expenses e
    where t.group_expense_id = e.id
      and e.group_id = NEW.group_id
      and t.user_id = OLD.user_id;
  end if;
  return NEW;
end $$;
