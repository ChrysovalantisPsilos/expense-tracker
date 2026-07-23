-- Within-group ledger-integrity hardening (audit findings M1, M2, L1, L2).
--
-- Before this, any group MEMBER could: forge/edit/delete any settlement
-- (settlements had a single blanket FOR ALL policy), spoof a settlement's
-- created_by, and INSERT split rows onto someone else's expense (inflating a
-- co-member's owed share, which mirrors into their personal ledger). These
-- mirror the same-tenant abuse the earlier hardening (0023) did NOT cover.

-- ---------------------------------------------------------------------------
-- M1 + L1 — settlements: split the blanket policy into per-verb rules that
-- mirror group_expenses (creator-or-owner for mutation), and force created_by
-- to the caller server-side so it can never be spoofed.
-- ---------------------------------------------------------------------------
drop policy if exists st_all on public.settlements;

create policy st_select on public.settlements for select to authenticated
  using (public.is_group_member(group_id));
create policy st_insert on public.settlements for insert to authenticated
  with check (public.is_group_member(group_id));
create policy st_update on public.settlements for update to authenticated
  using (created_by = (select auth.uid()) or public.is_group_owner(group_id))
  with check (created_by = (select auth.uid()) or public.is_group_owner(group_id));
create policy st_delete on public.settlements for delete to authenticated
  using (created_by = (select auth.uid()) or public.is_group_owner(group_id));

-- BEFORE INSERT: created_by is authoritative (not client-trusted), plus a
-- generous per-user rate limit so a member can't flood co-members via the
-- settlement fan-out (L2). 120/hour is far above any real settling session.
create or replace function public.settlement_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  NEW.created_by := auth.uid();
  if not public.rate_limit('settle:' || coalesce(auth.uid()::text, 'anon'), 120, 3600) then
    raise exception 'Too many settlements — please slow down.';
  end if;
  return NEW;
end $$;
revoke execute on function public.settlement_guard() from anon, authenticated, public;

drop trigger if exists trg_settlement_guard on public.settlements;
create trigger trg_settlement_guard before insert on public.settlements
  for each row execute function public.settlement_guard();

-- ---------------------------------------------------------------------------
-- M2 — expense_splits: INSERT was open to any member. Restrict it to the
-- owning expense's creator or the group owner (matching es_update/es_delete).
-- The v2 RPCs run as definer and manage splits, so tightening the direct
-- policy doesn't affect the normal create/edit paths.
-- ---------------------------------------------------------------------------
drop policy if exists es_insert on public.expense_splits;
create policy es_insert on public.expense_splits for insert to authenticated
  with check (exists (
    select 1 from public.group_expenses e
    where e.id = expense_id
      and (e.created_by = (select auth.uid()) or public.is_group_owner(e.group_id))
  ));

-- ---------------------------------------------------------------------------
-- L2 (expense side) — same generous flood guard on group-expense creation.
-- Body identical to the live function plus the rate-limit line.
-- ---------------------------------------------------------------------------
create or replace function public.create_group_expense_v2(
  p_group uuid, p_description text, p_amount bigint, p_currency character,
  p_paid_by uuid, p_spent_at date, p_member_ids uuid[], p_shares bigint[],
  p_split_type text default 'equal', p_receipt_path text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare uid uuid := auth.uid(); eid uuid; n int := coalesce(array_length(p_member_ids, 1), 0); total bigint;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not public.is_group_member(p_group) then raise exception 'not a member of this group'; end if;
  if not public.rate_limit('gexp:' || uid, 120, 3600) then
    raise exception 'Too many expenses added — please slow down.';
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
end $function$;
