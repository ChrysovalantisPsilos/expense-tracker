-- 1. Default currency -> EUR everywhere.
alter table public.profiles        alter column base_currency set default 'EUR';
alter table public.accounts        alter column currency set default 'EUR';
alter table public.transactions    alter column currency set default 'EUR';
alter table public.budgets         alter column currency set default 'EUR';
alter table public.recurring_rules alter column currency set default 'EUR';
alter table public.groups          alter column currency set default 'EUR';
alter table public.group_expenses  alter column currency set default 'EUR';
alter table public.settlements     alter column currency set default 'EUR';

update public.profiles set base_currency = 'EUR' where base_currency = 'USD';

-- 2. Profile fields: nickname + avatar.
alter table public.profiles add column if not exists nickname   text;
alter table public.profiles add column if not exists avatar_url text;

-- 3. Public avatars bucket (profile pics are meant to be seen by group members).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists avatars_write on storage.objects;
create policy avatars_write on storage.objects for all to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
