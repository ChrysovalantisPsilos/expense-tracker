-- 0081: "Count salary paid late in the month toward the next month", and two
-- more default income categories for new accounts.
--
-- 1. The salary shift — a per-user setting, off by default. Someone paid
--    around the 30th for the following month can have that salary count in
--    the next month's totals:
--      profiles.salary_shift_from_day  1..31, null = off. Income in the salary
--                                      category paid on or after this day of
--                                      its month (clamped to shorter months)
--                                      counts toward the NEXT month.
--      profiles.salary_category_id     which income category is the salary;
--                                      set null when the category is deleted
--                                      (which turns the shift off).
--    Like yearly_separate (0068) the owner updates both directly, through the
--    column grant below, and RLS (profile_update, 0052) limits that to their
--    own row. The category is server-checked: profiles_salary_category_guard
--    (BEFORE INSERT/UPDATE) refuses anything but one of the row owner's own
--    INCOME categories, so a client can't point the setting at another
--    user's category or at an expense one.
--
--    Only totals move (Home, Insights, the category page, the statement), and
--    the maths lives in ONE pure module shared by the app and generate-report:
--    supabase/functions/_shared/salaryShift.ts. No SQL twin is needed: no
--    server function sums income by month (budget alerts and the weekly
--    digest count expenses only; send-reminders reads recurring rules), and
--    budgets are expense-only.
--
-- 2. seed_default_categories() (last defined in 0004) also gives a NEW
--    account the income categories "Friend Transfer" and "Bonus". Existing
--    accounts are deliberately NOT backfilled here: the import wizard offers
--    these (and "Salary") as "(new)" choices and creates one only when the
--    user picks it (SUGGESTED_INCOME_CATEGORIES, src/features/import/
--    importMath.js — kept in lockstep with this seed by test/importMath.test.js).

-- 1 ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists salary_shift_from_day smallint null
    constraint profiles_salary_shift_from_day_check check (salary_shift_from_day between 1 and 31),
  add column if not exists salary_category_id uuid null
    references public.categories(id) on delete set null;

-- Deleting a category looks up the profile that names it (on delete set null).
create index if not exists profiles_salary_category_idx
  on public.profiles (salary_category_id) where salary_category_id is not null;

grant update (salary_shift_from_day, salary_category_id) on public.profiles to authenticated;

create or replace function public.profiles_salary_category_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.salary_category_id is not null
     and not exists (select 1 from public.categories c
                      where c.id = new.salary_category_id
                        and c.user_id = new.id
                        and c.kind = 'income') then
    raise exception 'Choose one of your own income categories for your salary.';
  end if;
  return new;
end $$;
revoke execute on function public.profiles_salary_category_guard() from public, anon, authenticated;

drop trigger if exists trg_profiles_salary_category_guard on public.profiles;
create trigger trg_profiles_salary_category_guard
  before insert or update of salary_category_id on public.profiles
  for each row execute function public.profiles_salary_category_guard();

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
    (uid, 'Food & Dining',   'utensils',      'expense'),
    (uid, 'Groceries',       'groceries',     'expense'),
    (uid, 'Transport',       'transport',     'expense'),
    (uid, 'Housing',         'housing',       'expense'),
    (uid, 'Utilities',       'utilities',     'expense'),
    (uid, 'Shopping',        'shopping',      'expense'),
    (uid, 'Health',          'health',        'expense'),
    (uid, 'Entertainment',   'entertainment', 'expense'),
    (uid, 'Salary',          'salary',        'income'),
    (uid, 'Friend Transfer', 'transfer',      'income'),
    (uid, 'Bonus',           'salary',        'income'),
    (uid, 'Other',           'other',         'expense')
  on conflict (user_id, name, kind) do nothing;
end;
$$;
revoke execute on function public.seed_default_categories() from anon, public;
grant execute on function public.seed_default_categories() to authenticated;
