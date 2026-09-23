-- 0077: once saved, an entry's kind is fixed — an expense stays an expense
-- and income stays income. The edit page shows the kind as a label and never
-- sends it; this makes the rule server-authoritative for every write path:
-- update_transaction's `kind` patch key, save_transactions' upsert on a
-- retried client_uuid, and any definer function that touches the row.
-- New rows (the form, CSV import, backup restore) are unaffected: this is an
-- UPDATE trigger, and inserts pick their kind freely.
--
-- SECURITY INVOKER trigger function (it only compares OLD and NEW); pinned
-- search_path, and not callable as an RPC.

create or replace function public.transactions_kind_fixed()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.kind is distinct from old.kind then
    raise exception 'An entry’s type can’t be changed once it’s saved.'
      using errcode = 'check_violation',
            hint = 'Delete it and add it again as the other type.';
  end if;
  return new;
end $$;
revoke execute on function public.transactions_kind_fixed() from public, anon, authenticated;

drop trigger if exists trg_txn_kind_fixed on public.transactions;
create trigger trg_txn_kind_fixed before update of kind on public.transactions
  for each row execute function public.transactions_kind_fixed();
