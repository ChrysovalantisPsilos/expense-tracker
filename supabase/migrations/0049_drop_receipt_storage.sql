-- Stop storing scanned receipts. OCR runs on-device (shared/lib/receiptScan.js,
-- tesseract.js) and only the extracted total/date are kept, so the private
-- `receipts` bucket, its policy, the receipt_path columns and the RPC parameter
-- that carried them are all removed.
--
-- Storage objects must be deleted through the Storage API: deleting rows from
-- storage.objects in SQL only drops the metadata and orphans the files in the
-- object store (Supabase blocks it for that reason). So this migration refuses
-- to run while the bucket still holds objects. Empty it first with the service
-- key — Dashboard → Storage → receipts → "Empty bucket", or
-- `supabase.storage.emptyBucket('receipts')` — then apply.

do $$
begin
  if exists (select 1 from storage.objects where bucket_id = 'receipts') then
    raise exception 'receipts bucket is not empty: empty it via the Storage API, then re-run this migration';
  end if;
end $$;

drop policy if exists "own receipts" on storage.objects;

-- The bucket is empty (checked above); drop its row. storage.protect_delete
-- guards direct deletes, so opt in just around this one statement.
do $$
begin
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.buckets where id = 'receipts';
  perform set_config('storage.allow_delete_query', 'false', true);
end $$;

alter table public.transactions   drop column if exists receipt_path;
alter table public.group_expenses drop column if exists receipt_path;

-- ---------------------------------------------------------------------------
-- RPCs: drop the signatures that carried p_receipt_path; recreate without it
-- and re-grant EXECUTE exactly as before (authenticated only; anon/public off).
-- ---------------------------------------------------------------------------
drop function if exists public.create_group_expense(uuid, text, bigint, char, uuid, date, uuid[], text);
drop function if exists public.create_group_expense_v2(uuid, text, bigint, char, uuid, date, uuid[], bigint[], text, text);

create function public.create_group_expense_v2(
  p_group uuid, p_description text, p_amount bigint, p_currency char(3),
  p_paid_by uuid, p_spent_at date, p_member_ids uuid[], p_shares bigint[],
  p_split_type text default 'equal')
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); eid uuid; n int := coalesce(array_length(p_member_ids, 1), 0); total bigint;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not public.is_group_member(p_group) then raise exception 'not a member of this group'; end if;
  if not public.rate_limit('gexp:' || uid, 120, 3600) then
    raise exception 'Too many expenses added — please slow down.';
  end if;
  if n = 0 then raise exception 'split between at least one person'; end if;

  if p_shares is not null then
    if coalesce(array_length(p_shares, 1), 0) <> n then
      raise exception 'each person needs a share';
    end if;
    if exists (select 1 from unnest(p_shares) s where s < 0) then
      raise exception 'shares cannot be negative';
    end if;
    select sum(s) into total from unnest(p_shares) s;
    if total <> p_amount then
      raise exception 'the split must add up to the total';
    end if;
  end if;

  insert into public.group_expenses
    (group_id, description, amount_minor, currency, paid_by, spent_at, created_by, split_type)
    values (p_group, p_description, p_amount, p_currency, p_paid_by, p_spent_at, uid,
            case when p_shares is null then 'equal' else coalesce(p_split_type, 'exact') end)
    returning id into eid;

  if p_shares is null then
    insert into public.expense_splits (expense_id, member_id, share_minor)
      select eid, member_id, share_minor from public.split_equally(p_amount, p_member_ids);
  else
    insert into public.expense_splits (expense_id, member_id, share_minor)
      select eid, p_member_ids[i], p_shares[i] from generate_series(1, n) as i;
  end if;

  return eid;
end $$;
revoke execute on function public.create_group_expense_v2(uuid, text, bigint, char, uuid, date, uuid[], bigint[], text) from anon, public;
grant execute on function public.create_group_expense_v2(uuid, text, bigint, char, uuid, date, uuid[], bigint[], text) to authenticated;

-- v1 (equal split) is now a thin wrapper over v2, so there's one insert path
-- (and v1 inherits v2's flood guard instead of bypassing it).
create function public.create_group_expense(
  p_group uuid, p_description text, p_amount bigint, p_currency char(3),
  p_paid_by uuid, p_spent_at date, p_member_ids uuid[])
returns uuid language sql security definer set search_path = public as $$
  select public.create_group_expense_v2(p_group, p_description, p_amount, p_currency,
                                        p_paid_by, p_spent_at, p_member_ids, null, 'equal');
$$;
revoke execute on function public.create_group_expense(uuid, text, bigint, char, uuid, date, uuid[]) from anon, public;
grant execute on function public.create_group_expense(uuid, text, bigint, char, uuid, date, uuid[]) to authenticated;
