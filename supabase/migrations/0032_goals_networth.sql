-- Goals, trends & net worth.
--
-- Trends are derived from the existing transactions ledger (no schema needed).
-- Net worth reuses the dormant `accounts` table, extended with a manually
-- maintained balance and an asset/liability type. Savings goals get their own
-- table. Both are per-user with the standard own-rows RLS.

-- ── Net worth: give accounts a balance + type ───────────────────────────────
alter table public.accounts
  add column if not exists balance_minor bigint not null default 0,
  add column if not exists type text not null default 'asset';

do $$ begin
  alter table public.accounts
    add constraint accounts_type_chk check (type in ('asset', 'liability'));
exception when duplicate_object then null; end $$;

-- ── Savings goals ───────────────────────────────────────────────────────────
create table if not exists public.savings_goals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  target_minor bigint not null check (target_minor >= 0),
  saved_minor  bigint not null default 0 check (saved_minor >= 0),
  currency     char(3) not null default 'EUR',
  target_date  date,
  created_at   timestamptz not null default now()
);
create index if not exists savings_goals_user_idx on public.savings_goals(user_id);

alter table public.savings_goals enable row level security;

do $$ begin
  create policy "own rows" on public.savings_goals for all
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);
exception when duplicate_object then null; end $$;

grant select, insert, update, delete on public.savings_goals to authenticated;
