-- 0094: default categories in the app's language. The seeded categories
-- (seed_default_categories, 0084) are stored per user as plain English text,
-- so they showed in English in Greek mode. Each one now carries a stable key
-- (categories.default_key: 'groceries', 'salary', 'savings', …) that the app
-- translates (categoryDisplayName in src/shared/lib/categoryName.js, names in
-- common:defaultCategories.*). A category the user renamed, or made
-- themselves, has none and shows its stored name. Logic that matches on the
-- stored name (breakdown buckets, import matching, the "New" tag, duplicate
-- checks) is unchanged.
--
--   1. categories.default_key (text, null).
--   2. category_default_key(name, kind): the key of an exact default
--      (name, kind), or null. The one list of defaults for the trigger, the
--      seed and the backfill; "Friend Transfer" (the income default before
--      0083 renamed it) has its own key.
--   3. Backfill: existing rows whose (name, kind) is still exactly a default.
--      It runs before the trigger below exists (that trigger would keep an
--      update from setting the key).
--   4. categories_default_key (BEFORE INSERT OR UPDATE) makes the key
--      server-authoritative (CLAUDE.md #6), so a client can never set it:
--        - INSERT: a key sent by the client is only a hint (a restored
--          backup's "this was a default"). It is re-derived from the row's
--          own name and kind, and a row sent without one gets none.
--        - UPDATE: the key stays while the name stays, and is cleared when
--          the name changes (the user renamed it). Any other value the
--          client sends is ignored.
--      It runs as the caller (no SECURITY DEFINER), with a pinned search_path.
--   5. seed_default_categories() (as 0084) passes each default's key.
--   6. The decrypting reads that embed a category (my_transactions,
--      my_recurring_rules, my_budgets) return default_key with its name, icon
--      and colour. Same signatures, grants and pinned search_path. Direct
--      table reads select the column; export_my_data (0074) takes whole rows
--      (to_jsonb), so it includes it without a change.
-- RLS and the per-verb policies on categories are untouched.

-- 1 ---------------------------------------------------------------------------
alter table public.categories add column if not exists default_key text null;

-- 2 ---------------------------------------------------------------------------
create or replace function public.category_default_key(p_name text, p_kind public.txn_kind)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select d.key from (values
    ('Food & Dining',    'expense', 'food'),
    ('Groceries',        'expense', 'groceries'),
    ('Transport',        'expense', 'transport'),
    ('Housing',          'expense', 'housing'),
    ('Utilities',        'expense', 'utilities'),
    ('Shopping',         'expense', 'shopping'),
    ('Health',           'expense', 'health'),
    ('Entertainment',    'expense', 'entertainment'),
    ('Other',            'expense', 'other'),
    ('Salary',           'income',  'salary'),
    ('Friends & family', 'income',  'friends'),
    ('Friend Transfer',  'income',  'friendTransfer'),
    ('Bonus',            'income',  'bonus'),
    ('Savings',          'income',  'savings')
  ) as d(name, kind, key)
  where d.name = p_name and d.kind = p_kind::text
$$;
-- Pure and harmless, but only the trigger (running as the caller) needs it.
revoke execute on function public.category_default_key(text, public.txn_kind) from public, anon;
grant execute on function public.category_default_key(text, public.txn_kind) to authenticated;

-- 3 ---------------------------------------------------------------------------
drop trigger if exists trg_categories_default_key on public.categories;

update public.categories c
   set default_key = public.category_default_key(c.name, c.kind)
 where c.default_key is distinct from public.category_default_key(c.name, c.kind)
   and public.category_default_key(c.name, c.kind) is not null;

-- 4 ---------------------------------------------------------------------------
create or replace function public.categories_default_key()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.default_key := case when new.default_key is not null
                            then public.category_default_key(btrim(new.name), new.kind) end;
  elsif btrim(new.name) is distinct from old.name then
    new.default_key := null;
  else
    new.default_key := old.default_key;
  end if;
  return new;
end
$$;
revoke execute on function public.categories_default_key() from public, anon, authenticated;

create trigger trg_categories_default_key
  before insert or update on public.categories
  for each row execute function public.categories_default_key();

-- 5 ---------------------------------------------------------------------------
create or replace function public.seed_default_categories()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare uid uuid := auth.uid();
begin
  insert into public.categories (user_id, name, icon, kind, default_key) values
    (uid, 'Food & Dining',    'utensils',      'expense', 'food'),
    (uid, 'Groceries',        'groceries',     'expense', 'groceries'),
    (uid, 'Transport',        'transport',     'expense', 'transport'),
    (uid, 'Housing',          'housing',       'expense', 'housing'),
    (uid, 'Utilities',        'utilities',     'expense', 'utilities'),
    (uid, 'Shopping',         'shopping',      'expense', 'shopping'),
    (uid, 'Health',           'health',        'expense', 'health'),
    (uid, 'Entertainment',    'entertainment', 'expense', 'entertainment'),
    (uid, 'Salary',           'salary',        'income',  'salary'),
    (uid, 'Friends & family', 'transfer',      'income',  'friends'),
    (uid, 'Bonus',            'salary',        'income',  'bonus'),
    (uid, 'Other',            'other',         'expense', 'other')
  on conflict (user_id, name, kind) do nothing;
  insert into public.categories (user_id, name, icon, kind, is_savings, default_key) values
    (uid, 'Savings',          'savings',       'income', true, 'savings')
  on conflict (user_id, name, kind) do nothing;
end;
$$;
revoke execute on function public.seed_default_categories() from anon, public;
grant execute on function public.seed_default_categories() to authenticated;

-- 6 ---------------------------------------------------------------------------
create or replace function public.my_transactions(
  p_kind text default null, p_from date default null, p_to date default null,
  p_category uuid default null, p_limit integer default null, p_spread boolean default false,
  p_paid_from_savings boolean default false)
returns table(id uuid, user_id uuid, kind text, category_id uuid, account_id uuid,
  amount_minor bigint, currency text, exchange_rate numeric, description text, notes text,
  spent_at date, group_id uuid, is_shared boolean, client_uuid uuid,
  created_at timestamptz, updated_at timestamptz, group_expense_id uuid,
  categories jsonb, group_expenses jsonb, recurring_rule_id uuid, recurring jsonb,
  spread_months smallint, savings_from_income boolean, paid_from_savings boolean)
language sql
stable security definer
set search_path = public, pg_temp
as $$
  select t.id, t.user_id, t.kind::text, t.category_id, t.account_id,
         public.dec_minor(t.amount_enc, k.k), t.currency::text, t.exchange_rate,
         public.dec_text(t.description_enc, k.k), public.dec_text(t.notes_enc, k.k),
         t.spent_at, t.group_id, t.is_shared, t.client_uuid, t.created_at,
         t.updated_at, t.group_expense_id,
         case when c.id is not null then jsonb_build_object(
           'name', c.name, 'icon', c.icon, 'color', c.color, 'default_key', c.default_key) end,
         case when g.id is not null then jsonb_build_object('groups', jsonb_build_object('name', g.name)) end,
         t.recurring_rule_id,
         case when rr.id is not null then jsonb_build_object(
           'frequency', rr.frequency, 'interval_n', rr.interval_n, 'is_active', rr.is_active) end,
         t.spread_months, t.savings_from_income, t.paid_from_savings
  from public.transactions t
  cross join (select public.app_enc_key() as k) k
  left join public.categories c on c.id = t.category_id and c.user_id = t.user_id
  left join public.group_expenses ge on ge.id = t.group_expense_id
  left join public.groups g on g.id = ge.group_id and public.is_group_member(ge.group_id)
  left join public.recurring_rules rr on rr.id = t.recurring_rule_id and rr.user_id = t.user_id
  where t.user_id = auth.uid()
    and (p_kind is null or t.kind::text = p_kind)
    and (p_from is null or t.spent_at >= p_from
         or (p_spread and t.kind = 'expense' and t.spread_months is not null
             and t.spent_at >= (p_from - interval '119 months')::date
             and date_trunc('month', t.spent_at) + make_interval(months => t.spread_months) > p_from))
    and (p_to is null or t.spent_at <= p_to)
    and (p_category is null or t.category_id = p_category)
    and (not coalesce(p_paid_from_savings, false) or t.paid_from_savings)
  order by t.spent_at desc, t.created_at desc
  limit p_limit
$$;
revoke execute on function public.my_transactions(text, date, date, uuid, integer, boolean, boolean) from public, anon;
grant execute on function public.my_transactions(text, date, date, uuid, integer, boolean, boolean) to authenticated;

create or replace function public.my_recurring_rules()
returns table(id uuid, user_id uuid, kind text, category_id uuid, account_id uuid,
  amount_minor bigint, currency text, description text, frequency text, interval_n integer,
  next_run date, end_date date, is_active boolean, created_at timestamptz,
  remind_days_before integer, last_reminded_for date, categories jsonb, savings_from_income boolean,
  paid_from_savings boolean)
language sql
stable security definer
set search_path = public, pg_temp
as $$
  select r.id, r.user_id, r.kind::text, r.category_id, r.account_id,
         public.dec_minor(r.amount_enc, k.k), r.currency::text,
         public.dec_text(r.description_enc, k.k), r.frequency::text, r.interval_n,
         r.next_run, r.end_date, r.is_active, r.created_at, r.remind_days_before,
         r.last_reminded_for,
         case when c.id is not null then jsonb_build_object(
           'name', c.name, 'icon', c.icon, 'color', c.color, 'default_key', c.default_key) end,
         r.savings_from_income, r.paid_from_savings
  from public.recurring_rules r
  cross join (select public.app_enc_key() as k) k
  left join public.categories c on c.id = r.category_id and c.user_id = r.user_id
  where r.user_id = auth.uid()
  order by r.is_active desc, r.next_run asc
$$;
revoke execute on function public.my_recurring_rules() from anon, public;
grant execute on function public.my_recurring_rules() to authenticated;

create or replace function public.my_budgets(p_period date)
returns table(id uuid, category_id uuid, amount_minor bigint, currency text,
  period_start date, categories jsonb)
language sql
stable security definer
set search_path = public, pg_temp
as $$
  select b.id, b.category_id, public.dec_minor(b.amount_enc, k.k),
         b.currency::text, b.period_start,
         case when c.id is not null then jsonb_build_object(
           'name', c.name, 'icon', c.icon, 'color', c.color, 'default_key', c.default_key) end
  from public.budgets b
  cross join (select public.app_enc_key() as k) k
  left join public.categories c on c.id = b.category_id and c.user_id = b.user_id
  where b.user_id = auth.uid() and not b.removed
    and b.period_start = public.budget_source_period(auth.uid(), p_period)
$$;
revoke execute on function public.my_budgets(date) from public, anon;
grant execute on function public.my_budgets(date) to authenticated;
