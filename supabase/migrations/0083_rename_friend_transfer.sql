-- 0083: the default income category "Friend Transfer" (0081 seed, 0082
-- backfill) is called "Friends & family" instead.
--   1. Accounts that have "Friend Transfer" (income) get it renamed — unless
--      they already have an income "Friends & family" (names are unique per
--      user and kind), in which case theirs is left as it is.
--   2. seed_default_categories() gives new accounts "Friends & family".
-- The app's list (NEW_DEFAULT_CATEGORIES in src/features/categories/
-- categoryMath.js) follows; test/categoryMath.test.js keeps them in lockstep.

-- 1 ---------------------------------------------------------------------------
update public.categories c
   set name = 'Friends & family'
 where c.name = 'Friend Transfer'
   and c.kind = 'income'
   and not exists (select 1 from public.categories o
                    where o.user_id = c.user_id
                      and o.kind = 'income'
                      and o.name = 'Friends & family');

-- 2 ---------------------------------------------------------------------------
create or replace function public.seed_default_categories()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare uid uuid := auth.uid();
begin
  insert into public.categories (user_id, name, icon, kind) values
    (uid, 'Food & Dining',    'utensils',      'expense'),
    (uid, 'Groceries',        'groceries',     'expense'),
    (uid, 'Transport',        'transport',     'expense'),
    (uid, 'Housing',          'housing',       'expense'),
    (uid, 'Utilities',        'utilities',     'expense'),
    (uid, 'Shopping',         'shopping',      'expense'),
    (uid, 'Health',           'health',        'expense'),
    (uid, 'Entertainment',    'entertainment', 'expense'),
    (uid, 'Salary',           'salary',        'income'),
    (uid, 'Friends & family', 'transfer',      'income'),
    (uid, 'Bonus',            'salary',        'income'),
    (uid, 'Other',            'other',         'expense')
  on conflict (user_id, name, kind) do nothing;
end;
$$;
revoke execute on function public.seed_default_categories() from anon, public;
grant execute on function public.seed_default_categories() to authenticated;
