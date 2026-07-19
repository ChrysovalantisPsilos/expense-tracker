-- Receipt attachments + icon-key migration.

-- 1. Column linking a transaction to its stored receipt image.
alter table public.transactions
  add column if not exists receipt_path text;

-- 2. Private Storage bucket for receipts.
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- 3. RLS on storage.objects: a user may only touch files under their own
--    top-level folder (path shape: "<user_id>/<filename>").
drop policy if exists "own receipts" on storage.objects;
create policy "own receipts" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 4. Store Lucide icon *keys* (not emoji) going forward.
create or replace function public.seed_default_categories()
returns void
language plpgsql
security definer set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  insert into public.categories (user_id, name, icon, kind) values
    (uid, 'Food & Dining', 'utensils',      'expense'),
    (uid, 'Groceries',     'groceries',     'expense'),
    (uid, 'Transport',     'transport',     'expense'),
    (uid, 'Housing',       'housing',       'expense'),
    (uid, 'Utilities',     'utilities',     'expense'),
    (uid, 'Shopping',      'shopping',      'expense'),
    (uid, 'Health',        'health',        'expense'),
    (uid, 'Entertainment', 'entertainment', 'expense'),
    (uid, 'Salary',        'salary',        'income'),
    (uid, 'Other',         'other',         'expense')
  on conflict (user_id, name, kind) do nothing;
end;
$$;
revoke execute on function public.seed_default_categories() from anon, public;
grant execute on function public.seed_default_categories() to authenticated;

-- 5. Backfill existing categories: emoji -> icon key (by name).
update public.categories set icon = case name
  when 'Food & Dining' then 'utensils'
  when 'Groceries'     then 'groceries'
  when 'Transport'     then 'transport'
  when 'Housing'       then 'housing'
  when 'Utilities'     then 'utilities'
  when 'Shopping'      then 'shopping'
  when 'Health'        then 'health'
  when 'Entertainment' then 'entertainment'
  when 'Salary'        then 'salary'
  when 'Other'         then 'other'
  else icon
end
where icon ~ '[^a-z]';  -- only rows whose icon isn't already a key
