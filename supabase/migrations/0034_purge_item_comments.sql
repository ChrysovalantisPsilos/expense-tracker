-- group_comments has a polymorphic target (target_type + target_id, no FK to
-- the two item tables), so a deleted expense/settlement would leave orphan
-- comments. Purge them when the item is deleted. SECURITY DEFINER so the
-- cleanup isn't blocked by RLS (the caller already passed the item's own
-- delete policy); TG_ARGV[0] carries the target_type for the table.

create or replace function public.purge_item_comments()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.group_comments
  where target_type = TG_ARGV[0] and target_id = OLD.id;
  return OLD;
end $$;
revoke execute on function public.purge_item_comments() from anon, authenticated, public;

drop trigger if exists trg_purge_expense_comments on public.group_expenses;
create trigger trg_purge_expense_comments after delete on public.group_expenses
  for each row execute function public.purge_item_comments('expense');

drop trigger if exists trg_purge_settlement_comments on public.settlements;
create trigger trg_purge_settlement_comments after delete on public.settlements
  for each row execute function public.purge_item_comments('settlement');
