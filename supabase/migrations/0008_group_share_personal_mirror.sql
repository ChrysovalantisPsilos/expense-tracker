-- Auto-mirror a linked member's split share into their personal transactions,
-- so group spending flows into their dashboard / budgets / reports. The mirror
-- is keyed by (user_id, group_expense_id) and kept in sync via triggers.
-- NOTE: mirror is stored in the group expense's currency at rate 1; base-
-- currency conversion for cross-currency groups is approximate for now.

alter table public.transactions
  add column if not exists group_expense_id uuid
    references public.group_expenses(id) on delete cascade;

create unique index if not exists transactions_user_group_expense_uniq
  on public.transactions(user_id, group_expense_id) where group_expense_id is not null;

create or replace function public.sync_group_share()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_exp record;
begin
  if TG_OP = 'DELETE' then
    select user_id into v_user from public.group_members where id = OLD.member_id;
    if v_user is not null then
      delete from public.transactions
        where user_id = v_user and group_expense_id = OLD.expense_id;
    end if;
    return OLD;
  end if;

  select user_id into v_user from public.group_members where id = NEW.member_id;
  select * into v_exp from public.group_expenses where id = NEW.expense_id;
  if v_user is not null and v_exp.id is not null then
    insert into public.transactions
      (user_id, kind, amount_minor, currency, exchange_rate, description,
       spent_at, is_shared, group_id, group_expense_id)
    values
      (v_user, 'expense', NEW.share_minor, v_exp.currency, 1, v_exp.description,
       v_exp.spent_at, true, v_exp.group_id, NEW.expense_id)
    -- partial unique index requires its predicate in the conflict target
    on conflict (user_id, group_expense_id) where group_expense_id is not null
    do update
      set amount_minor = excluded.amount_minor,
          currency     = excluded.currency,
          description   = excluded.description,
          spent_at      = excluded.spent_at;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_split_sync on public.expense_splits;
create trigger trg_split_sync
  after insert or update or delete on public.expense_splits
  for each row execute function public.sync_group_share();

create or replace function public.sync_group_expense_meta()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.transactions
    set description = NEW.description, spent_at = NEW.spent_at, currency = NEW.currency
    where group_expense_id = NEW.id;
  return NEW;
end;
$$;

drop trigger if exists trg_gexp_meta_sync on public.group_expenses;
create trigger trg_gexp_meta_sync after update on public.group_expenses
  for each row execute function public.sync_group_expense_meta();

create or replace function public.sync_member_link()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.user_id is not null and OLD.user_id is null then
    insert into public.transactions
      (user_id, kind, amount_minor, currency, exchange_rate, description,
       spent_at, is_shared, group_id, group_expense_id)
    select NEW.user_id, 'expense', s.share_minor, e.currency, 1, e.description,
           e.spent_at, true, e.group_id, e.id
    from public.expense_splits s
    join public.group_expenses e on e.id = s.expense_id
    where s.member_id = NEW.id
    on conflict (user_id, group_expense_id) where group_expense_id is not null
    do nothing;
  elsif NEW.user_id is null and OLD.user_id is not null then
    delete from public.transactions t
    using public.group_expenses e
    where t.group_expense_id = e.id
      and e.group_id = NEW.group_id
      and t.user_id = OLD.user_id;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_member_link_sync on public.group_members;
create trigger trg_member_link_sync after update on public.group_members
  for each row execute function public.sync_member_link();
