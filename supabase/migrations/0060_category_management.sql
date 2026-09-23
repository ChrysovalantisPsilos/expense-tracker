-- 0060: category management (Settings → Categories).
--
-- Categories were fixed at the 10 seeded rows. Users can now add, rename,
-- recolour, re-icon, archive and delete their own expense AND income
-- categories. Plain columns (names aren't financial amounts), so the page
-- writes the table directly under the existing per-verb RLS (own_select /
-- own_insert / own_update / own_delete, all `user_id = auth.uid()`).
--
-- 1. Server rules the client mirrors (features/categories/categoryMath.js):
--      name  1–60 characters after trimming, no control characters
--      icon  one of the app's icon keys (shared/lib/categoryStyle.js), or null
--      color one of the palette keys (same file), or null
--    Added NOT VALID and validated only when every existing row already
--    passes, so an odd legacy row (e.g. an emoji icon from an early build)
--    can't block the migration; new and edited rows are always checked.
-- 2. categories_guard (BEFORE INSERT/UPDATE): ownership is server-authoritative
--    — an insert is stamped with the caller's id, an update can't move a row
--    to another account or flip its kind (its transactions are that kind).
--    The name is trimmed before the checks run.
-- 3. delete_category(id, move_to): delete a category, first moving its
--    transactions, recurring rules and auto-category rules to another category
--    of the same kind (or leaving them uncategorised when move_to is null).
--    Transactions have no client UPDATE path (encrypted, RPC-only), so the
--    move needs a definer function. Its budgets go with it (FK cascade).
-- 4. The decrypting read RPCs now return the category colour too.

-- 1 ---------------------------------------------------------------------------
alter table public.categories drop constraint if exists categories_name_check;
alter table public.categories
  add constraint categories_name_check
  check (char_length(name) between 1 and 60 and name !~ '[[:cntrl:]]') not valid;

alter table public.categories drop constraint if exists categories_icon_check;
alter table public.categories
  add constraint categories_icon_check
  check (icon is null or icon in (
    'utensils', 'groceries', 'transport', 'housing', 'utilities', 'shopping', 'health',
    'entertainment', 'salary', 'travel', 'coffee', 'fitness', 'education', 'gifts',
    'savings', 'other')) not valid;

alter table public.categories drop constraint if exists categories_color_check;
alter table public.categories
  add constraint categories_color_check
  check (color is null or color in (
    'coral', 'amber', 'green', 'teal', 'blue', 'purple', 'pink', 'slate')) not valid;

do $$
begin
  if not exists (select 1 from public.categories
                  where not (char_length(name) between 1 and 60 and name !~ '[[:cntrl:]]')) then
    alter table public.categories validate constraint categories_name_check;
  end if;
  if not exists (select 1 from public.categories where icon is not null and icon not in (
      'utensils', 'groceries', 'transport', 'housing', 'utilities', 'shopping', 'health',
      'entertainment', 'salary', 'travel', 'coffee', 'fitness', 'education', 'gifts',
      'savings', 'other')) then
    alter table public.categories validate constraint categories_icon_check;
  end if;
  if not exists (select 1 from public.categories where color is not null and color not in (
      'coral', 'amber', 'green', 'teal', 'blue', 'purple', 'pink', 'slate')) then
    alter table public.categories validate constraint categories_color_check;
  end if;
end $$;

-- 2 ---------------------------------------------------------------------------
create or replace function public.categories_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    -- API callers always own what they create; definer/service paths (seed,
    -- account handover) keep the id they pass.
    if auth.uid() is not null then new.user_id := auth.uid(); end if;
  else
    if new.user_id is distinct from old.user_id then
      raise exception 'A category can''t be moved to another account.';
    end if;
    if new.kind is distinct from old.kind then
      raise exception 'A category''s type (expense or income) can''t change.';
    end if;
  end if;
  new.name := btrim(new.name);
  return new;
end
$$;

revoke execute on function public.categories_guard() from public, anon, authenticated;

drop trigger if exists trg_categories_guard on public.categories;
create trigger trg_categories_guard
  before insert or update on public.categories
  for each row execute function public.categories_guard();

-- 3 ---------------------------------------------------------------------------
create or replace function public.delete_category(p_category uuid, p_move_to uuid default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare uid uuid := auth.uid(); src_kind public.txn_kind; moved int := 0;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select kind into src_kind from public.categories where id = p_category and user_id = uid;
  if not found then raise exception 'category not found'; end if;

  if p_move_to is not null then
    if p_move_to = p_category then
      raise exception 'Pick a different category to move its entries to.';
    end if;
    if not exists (select 1 from public.categories
                    where id = p_move_to and user_id = uid and kind = src_kind) then
      raise exception 'category to move to not found';
    end if;
    update public.transactions set category_id = p_move_to
     where user_id = uid and category_id = p_category;
    get diagnostics moved = row_count;
    update public.recurring_rules set category_id = p_move_to
     where user_id = uid and category_id = p_category;
    update public.category_rules set category_id = p_move_to
     where user_id = uid and category_id = p_category;
  end if;

  delete from public.categories where id = p_category and user_id = uid;
  return moved;
end
$$;

revoke execute on function public.delete_category(uuid, uuid) from public, anon;
grant execute on function public.delete_category(uuid, uuid) to authenticated;

-- 4 ---------------------------------------------------------------------------
create or replace function public.my_transactions(
  p_kind text default null, p_from date default null, p_to date default null,
  p_category uuid default null, p_limit integer default null)
returns table(id uuid, user_id uuid, kind text, category_id uuid, account_id uuid,
  amount_minor bigint, currency text, exchange_rate numeric, description text, notes text,
  spent_at date, group_id uuid, is_shared boolean, client_uuid uuid,
  created_at timestamptz, updated_at timestamptz, group_expense_id uuid,
  categories jsonb, group_expenses jsonb)
language sql
stable security definer
set search_path = public
as $$
  select t.id, t.user_id, t.kind::text, t.category_id, t.account_id,
         public.dec_minor(t.amount_enc, k.k), t.currency::text, t.exchange_rate,
         public.dec_text(t.description_enc, k.k), public.dec_text(t.notes_enc, k.k),
         t.spent_at, t.group_id, t.is_shared, t.client_uuid, t.created_at,
         t.updated_at, t.group_expense_id,
         case when c.id is not null then jsonb_build_object('name', c.name, 'icon', c.icon, 'color', c.color) end,
         case when g.id is not null then jsonb_build_object('groups', jsonb_build_object('name', g.name)) end
  from public.transactions t
  cross join (select public.app_enc_key() as k) k
  left join public.categories c on c.id = t.category_id and c.user_id = t.user_id
  left join public.group_expenses ge on ge.id = t.group_expense_id
  left join public.groups g on g.id = ge.group_id and public.is_group_member(ge.group_id)
  where t.user_id = auth.uid()
    and (p_kind is null or t.kind::text = p_kind)
    and (p_from is null or t.spent_at >= p_from)
    and (p_to is null or t.spent_at <= p_to)
    and (p_category is null or t.category_id = p_category)
  order by t.spent_at desc, t.created_at desc
  limit p_limit
$$;

create or replace function public.my_recurring_rules()
returns table(id uuid, user_id uuid, kind text, category_id uuid, account_id uuid,
  amount_minor bigint, currency text, description text, frequency text, interval_n integer,
  next_run date, end_date date, is_active boolean, created_at timestamptz,
  remind_days_before integer, last_reminded_for date, categories jsonb)
language sql
stable security definer
set search_path = public
as $$
  select r.id, r.user_id, r.kind::text, r.category_id, r.account_id,
         public.dec_minor(r.amount_enc, k.k), r.currency::text,
         public.dec_text(r.description_enc, k.k), r.frequency::text, r.interval_n,
         r.next_run, r.end_date, r.is_active, r.created_at, r.remind_days_before,
         r.last_reminded_for,
         case when c.id is not null then jsonb_build_object('name', c.name, 'icon', c.icon, 'color', c.color) end
  from public.recurring_rules r
  cross join (select public.app_enc_key() as k) k
  left join public.categories c on c.id = r.category_id and c.user_id = r.user_id
  where r.user_id = auth.uid()
  order by r.is_active desc, r.next_run asc
$$;
