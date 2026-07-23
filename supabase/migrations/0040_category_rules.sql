-- Auto-categorization rules for statement imports: "descriptions containing
-- <pattern> belong to <category>". Created from the import wizard's review
-- step (categorize a merchant once, it sticks for every future import) and
-- applied client-side when building import rows.

create table if not exists public.category_rules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  pattern     text not null check (length(pattern) between 2 and 80),
  category_id uuid not null references public.categories(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (user_id, pattern)
);

alter table public.category_rules enable row level security;
create policy cr_select on public.category_rules for select using (auth.uid() = user_id);
create policy cr_insert on public.category_rules for insert with check (auth.uid() = user_id);
create policy cr_update on public.category_rules for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy cr_delete on public.category_rules for delete using (auth.uid() = user_id);

-- Realtime, consistent with every other user-facing table.
alter table public.category_rules replica identity full;
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'category_rules'
  ) then
    alter publication supabase_realtime add table public.category_rules;
  end if;
end $$;
