-- Expense Tracker — initial schema (v1: personal tracker)
--
-- Design notes:
--  * Money is stored as integer minor units (cents) to avoid float drift.
--    `amount_minor` + `currency` + `exchange_rate` (to the user's base
--    currency, captured at entry time) support multi-currency reporting
--    without ever recomputing history with today's FX rate.
--  * Every user-owned row carries `user_id` and is guarded by RLS so a user
--    can only ever see or mutate their own data.
--  * v2 split layer (groups, group_members, expense_splits, expense_items)
--    is intentionally NOT created here, but the `expenses` table already has
--    a nullable `group_id` and an `is_shared` flag so it bolts on without a
--    destructive migration.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type txn_kind as enum ('expense', 'income');
exception when duplicate_object then null; end $$;

do $$ begin
  create type recurrence_freq as enum ('daily', 'weekly', 'monthly', 'yearly');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- profiles: 1:1 with auth.users, holds the user's base/display currency
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  base_currency char(3) not null default 'USD',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- categories: user-defined buckets (food, rent, ...). Seeded per-user.
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  icon       text,
  color      text,
  kind       txn_kind not null default 'expense',
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, name, kind)
);
create index if not exists categories_user_idx on public.categories(user_id);

-- ---------------------------------------------------------------------------
-- accounts: optional "wallets" (cash, card, bank). Every txn has one.
-- ---------------------------------------------------------------------------
create table if not exists public.accounts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  currency   char(3) not null default 'USD',
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists accounts_user_idx on public.accounts(user_id);

-- ---------------------------------------------------------------------------
-- transactions: the core ledger. Both expenses and income live here,
-- discriminated by `kind`, so net cash-flow is a single query.
-- ---------------------------------------------------------------------------
create table if not exists public.transactions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  kind           txn_kind not null default 'expense',
  category_id    uuid references public.categories(id) on delete set null,
  account_id     uuid references public.accounts(id) on delete set null,
  -- money
  amount_minor   bigint not null check (amount_minor >= 0),
  currency       char(3) not null default 'USD',
  exchange_rate  numeric(18, 8) not null default 1,  -- to base_currency at entry time
  -- meta
  description    text,
  notes          text,
  spent_at       date not null default current_date,
  -- v2 split layer (nullable now; populated once groups exist)
  group_id       uuid,
  is_shared      boolean not null default false,
  -- client-generated id lets the offline queue dedupe on sync
  client_uuid    uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, client_uuid)
);
create index if not exists transactions_user_date_idx
  on public.transactions(user_id, spent_at desc);
create index if not exists transactions_category_idx
  on public.transactions(category_id);

-- ---------------------------------------------------------------------------
-- budgets: a monthly cap per category (period is a month anchor date).
-- ---------------------------------------------------------------------------
create table if not exists public.budgets (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  category_id   uuid references public.categories(id) on delete cascade,
  amount_minor  bigint not null check (amount_minor >= 0),
  currency      char(3) not null default 'USD',
  period_start  date not null default date_trunc('month', current_date)::date,
  created_at    timestamptz not null default now(),
  unique (user_id, category_id, period_start)
);
create index if not exists budgets_user_period_idx
  on public.budgets(user_id, period_start);

-- ---------------------------------------------------------------------------
-- recurring_rules: templates that spawn transactions on a schedule.
-- A scheduled edge function materializes due rules into transactions.
-- ---------------------------------------------------------------------------
create table if not exists public.recurring_rules (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          txn_kind not null default 'expense',
  category_id   uuid references public.categories(id) on delete set null,
  account_id    uuid references public.accounts(id) on delete set null,
  amount_minor  bigint not null check (amount_minor >= 0),
  currency      char(3) not null default 'USD',
  description   text,
  frequency     recurrence_freq not null default 'monthly',
  interval_n    int not null default 1 check (interval_n >= 1),
  next_run      date not null default current_date,
  end_date      date,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists recurring_user_next_idx
  on public.recurring_rules(user_id, next_run) where is_active;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_txn_touch on public.transactions;
create trigger trg_txn_touch before update on public.transactions
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_profile_touch on public.profiles;
create trigger trg_profile_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security: every table is owner-scoped.
-- ---------------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.categories       enable row level security;
alter table public.accounts         enable row level security;
alter table public.transactions     enable row level security;
alter table public.budgets          enable row level security;
alter table public.recurring_rules  enable row level security;

-- profiles: a user can read/update only their own row.
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- Generic owner policy for the user_id tables.
do $$
declare t text;
begin
  foreach t in array array['categories','accounts','transactions','budgets','recurring_rules']
  loop
    execute format('drop policy if exists "own rows" on public.%I;', t);
    execute format(
      'create policy "own rows" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id);',
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Seed default categories for a user (called from the app after signup).
-- ---------------------------------------------------------------------------
create or replace function public.seed_default_categories()
returns void
language plpgsql
security definer set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  insert into public.categories (user_id, name, icon, kind) values
    (uid, 'Food & Dining', '🍽️', 'expense'),
    (uid, 'Groceries',     '🛒', 'expense'),
    (uid, 'Transport',     '🚗', 'expense'),
    (uid, 'Housing',       '🏠', 'expense'),
    (uid, 'Utilities',     '💡', 'expense'),
    (uid, 'Shopping',      '🛍️', 'expense'),
    (uid, 'Health',        '⚕️', 'expense'),
    (uid, 'Entertainment', '🎬', 'expense'),
    (uid, 'Salary',        '💼', 'income'),
    (uid, 'Other',         '📌', 'expense')
  on conflict (user_id, name, kind) do nothing;
end;
$$;
