-- Unequal / itemized splits.
--
-- Balances already read arbitrary expense_splits.share_minor (see _group_net),
-- and the personal mirror copies each member's share_minor — so custom splits
-- "just work" downstream. Only the create/update RPCs forced an equal split.
--
-- New *_v2 RPCs accept an explicit p_shares[] aligned to p_member_ids. When
-- p_shares is null they fall back to the equal split (split_equally), so the
-- equal path is unchanged. Percent / shares / itemized modes are resolved to
-- exact minor amounts on the client; the server only stores the final per-
-- member amounts plus a split_type label, and validates that the shares add up
-- to the expense total. The original 8-arg create_group_expense /
-- update_group_expense are left in place so an older deployed bundle keeps
-- working during the frontend deploy lag.

alter table public.group_expenses
  add column if not exists split_type text not null default 'equal';

do $$ begin
  alter table public.group_expenses
    add constraint group_expenses_split_type_chk
    check (split_type in ('equal', 'exact', 'percent', 'shares', 'items'));
exception when duplicate_object then null; end $$;

-- ── create ──────────────────────────────────────────────────────────────────
create or replace function public.create_group_expense_v2(
  p_group uuid, p_description text, p_amount bigint, p_currency char(3),
  p_paid_by uuid, p_spent_at date, p_member_ids uuid[], p_shares bigint[],
  p_split_type text default 'equal', p_receipt_path text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); eid uuid; n int := coalesce(array_length(p_member_ids, 1), 0); total bigint;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not public.is_group_member(p_group) then raise exception 'not a member of this group'; end if;
  if n = 0 then raise exception 'split between at least one person'; end if;

  if p_shares is not null then
    if coalesce(array_length(p_shares, 1), 0) <> n then
      raise exception 'each person needs a share';
    end if;
    if exists (select 1 from unnest(p_shares) s where s < 0) then
      raise exception 'shares cannot be negative';
    end if;
    select sum(s) into total from unnest(p_shares) s;
    if total <> p_amount then
      raise exception 'the split must add up to the total';
    end if;
  end if;

  insert into public.group_expenses
    (group_id, description, amount_minor, currency, paid_by, spent_at, receipt_path, created_by, split_type)
    values (p_group, p_description, p_amount, p_currency, p_paid_by, p_spent_at, p_receipt_path, uid,
            case when p_shares is null then 'equal' else coalesce(p_split_type, 'exact') end)
    returning id into eid;

  if p_shares is null then
    insert into public.expense_splits (expense_id, member_id, share_minor)
      select eid, member_id, share_minor from public.split_equally(p_amount, p_member_ids);
  else
    insert into public.expense_splits (expense_id, member_id, share_minor)
      select eid, p_member_ids[i], p_shares[i] from generate_series(1, n) as i;
  end if;

  return eid;
end $$;

revoke execute on function public.create_group_expense_v2(uuid, text, bigint, char, uuid, date, uuid[], bigint[], text, text) from anon, public;
grant execute on function public.create_group_expense_v2(uuid, text, bigint, char, uuid, date, uuid[], bigint[], text, text) to authenticated;

-- ── update ──────────────────────────────────────────────────────────────────
create or replace function public.update_group_expense_v2(
  p_expense uuid, p_description text, p_amount bigint, p_currency char(3),
  p_paid_by uuid, p_spent_at date, p_member_ids uuid[], p_shares bigint[],
  p_split_type text default 'equal')
returns void language plpgsql security definer set search_path = public as $$
declare gid uuid; creator uuid; n int := coalesce(array_length(p_member_ids, 1), 0); total bigint;
begin
  select group_id, created_by into gid, creator from public.group_expenses where id = p_expense;
  if gid is null then raise exception 'expense not found'; end if;
  if not public.is_group_member(gid) then raise exception 'not a member'; end if;
  if not (creator = auth.uid() or public.is_group_owner(gid)) then
    raise exception 'Only the person who added this expense (or the group owner) can edit it.';
  end if;
  if n = 0 then raise exception 'split between at least one person'; end if;

  if p_shares is not null then
    if coalesce(array_length(p_shares, 1), 0) <> n then
      raise exception 'each person needs a share';
    end if;
    if exists (select 1 from unnest(p_shares) s where s < 0) then
      raise exception 'shares cannot be negative';
    end if;
    select sum(s) into total from unnest(p_shares) s;
    if total <> p_amount then
      raise exception 'the split must add up to the total';
    end if;
  end if;

  update public.group_expenses
    set description = p_description, amount_minor = p_amount, currency = p_currency,
        paid_by = p_paid_by, spent_at = p_spent_at,
        split_type = case when p_shares is null then 'equal' else coalesce(p_split_type, 'exact') end
    where id = p_expense;

  delete from public.expense_splits where expense_id = p_expense;
  if p_shares is null then
    insert into public.expense_splits (expense_id, member_id, share_minor)
      select p_expense, member_id, share_minor from public.split_equally(p_amount, p_member_ids);
  else
    insert into public.expense_splits (expense_id, member_id, share_minor)
      select p_expense, p_member_ids[i], p_shares[i] from generate_series(1, n) as i;
  end if;
end $$;

revoke execute on function public.update_group_expense_v2(uuid, text, bigint, char, uuid, date, uuid[], bigint[], text) from anon, public;
grant execute on function public.update_group_expense_v2(uuid, text, bigint, char, uuid, date, uuid[], bigint[], text) to authenticated;
