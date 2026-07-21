-- Realtime everywhere: publish the remaining user-facing tables so every
-- surface updates by subscription instead of polling or reload-on-navigate.
-- (0036 already published group_expenses, settlements, group_members,
-- notifications.) replica identity full so DELETE events keep their non-PK
-- columns and still pass client-side filters like user_id=eq / group_id=eq.

do $$
declare t text;
begin
  foreach t in array array[
    'transactions', 'categories', 'accounts', 'budgets',
    'recurring_rules', 'savings_goals',
    'groups', 'group_invites', 'group_comments'
  ]
  loop
    execute format('alter table public.%I replica identity full', t);
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
