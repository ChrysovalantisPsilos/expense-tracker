-- D1: equal-split rounding lived in JS (equalShares) AND twice in SQL. Extract a
-- single split_equally() used by both create/update RPCs.
-- D2: net-balance formula lived in JS (computeBalances) AND SQL (group_member_net).
-- Make ONE SQL function (_group_net) the source of truth; the client, the
-- preview, and the leave/delete guards all read from it.

-- ── D1: one split implementation ────────────────────────────────────────────
create or replace function public.split_equally(p_amount bigint, p_member_ids uuid[])
returns table (member_id uuid, share_minor bigint)
language sql immutable set search_path = public as $$
  with params as (select coalesce(array_length(p_member_ids, 1), 0) as n)
  select p_member_ids[i] as member_id,
         (p_amount / p.n) + case when i <= (p_amount - (p_amount / p.n) * p.n) then 1 else 0 end as share_minor
  from params p, generate_series(1, (select n from params)) as i
  where p.n > 0;
$$;

-- ── D2: one net-balance implementation ──────────────────────────────────────
-- Internal, unguarded core. Never exposed to clients; only the guarded wrappers
-- (and definer functions) call it.
create or replace function public._group_net(p_group uuid)
returns table (member_id uuid, net_minor bigint)
language sql stable security definer set search_path = public as $$
  select m.id,
      coalesce((select sum(e.amount_minor) from public.group_expenses e
                where e.group_id = p_group and e.paid_by = m.id), 0)
    - coalesce((select sum(s.share_minor) from public.expense_splits s
                join public.group_expenses e on e.id = s.expense_id
                where e.group_id = p_group and s.member_id = m.id), 0)
    + coalesce((select sum(st.amount_minor) from public.settlements st
                where st.group_id = p_group and st.from_member = m.id), 0)
    - coalesce((select sum(st.amount_minor) from public.settlements st
                where st.group_id = p_group and st.to_member = m.id), 0)
  from public.group_members m
  where m.group_id = p_group;
$$;
revoke execute on function public._group_net(uuid) from anon, authenticated, public;

-- Public, membership-guarded: what the client reads on group load.
create or replace function public.group_balances(p_group uuid)
returns table (member_id uuid, net_minor bigint)
language sql stable security definer set search_path = public as $$
  select n.member_id, n.net_minor
  from public._group_net(p_group) n
  where public.is_group_member(p_group) or public.is_group_owner(p_group);
$$;
revoke execute on function public.group_balances(uuid) from anon, public;
grant execute on function public.group_balances(uuid) to authenticated;

-- Single-member net for the leave/delete guards — now a thin wrapper over the
-- same core (internal only).
create or replace function public.group_member_net(p_group uuid, p_member uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce((select net_minor from public._group_net(p_group) where member_id = p_member), 0);
$$;
revoke execute on function public.group_member_net(uuid, uuid) from anon, authenticated, public;

-- ── Rewrite create/update expense RPCs to use split_equally ─────────────────
create or replace function public.create_group_expense(
  p_group uuid, p_description text, p_amount bigint, p_currency char(3),
  p_paid_by uuid, p_spent_at date, p_member_ids uuid[], p_receipt_path text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); eid uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not public.is_group_member(p_group) then raise exception 'not a member of this group'; end if;
  if coalesce(array_length(p_member_ids, 1), 0) = 0 then raise exception 'split between at least one person'; end if;

  insert into public.group_expenses
    (group_id, description, amount_minor, currency, paid_by, spent_at, receipt_path, created_by)
    values (p_group, p_description, p_amount, p_currency, p_paid_by, p_spent_at, p_receipt_path, uid)
    returning id into eid;

  insert into public.expense_splits (expense_id, member_id, share_minor)
    select eid, member_id, share_minor from public.split_equally(p_amount, p_member_ids);

  return eid;
end $$;

create or replace function public.update_group_expense(
  p_expense uuid, p_description text, p_amount bigint, p_currency char(3),
  p_paid_by uuid, p_spent_at date, p_member_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare gid uuid; creator uuid;
begin
  select group_id, created_by into gid, creator from public.group_expenses where id = p_expense;
  if gid is null then raise exception 'expense not found'; end if;
  if not public.is_group_member(gid) then raise exception 'not a member'; end if;
  if not (creator = auth.uid() or public.is_group_owner(gid)) then
    raise exception 'Only the person who added this expense (or the group owner) can edit it.';
  end if;
  if coalesce(array_length(p_member_ids, 1), 0) = 0 then raise exception 'split between at least one person'; end if;

  update public.group_expenses
    set description = p_description, amount_minor = p_amount, currency = p_currency,
        paid_by = p_paid_by, spent_at = p_spent_at
    where id = p_expense;

  delete from public.expense_splits where expense_id = p_expense;
  insert into public.expense_splits (expense_id, member_id, share_minor)
    select p_expense, member_id, share_minor from public.split_equally(p_amount, p_member_ids);
end $$;

-- ── group_preview: embed server-computed net per member (for the anon preview) ─
create or replace function public.group_preview(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare inv record; result jsonb;
begin
  select * into inv from public.group_invites
    where token = p_token and (expires_at is null or expires_at > now());
  if inv is null then return null; end if;
  select jsonb_build_object(
    'group', (select jsonb_build_object('id', g.id, 'name', g.name, 'currency', g.currency, 'image_url', g.image_url)
              from public.groups g where g.id = inv.group_id),
    'members', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', m.id, 'display_name', m.display_name, 'avatar_url', p.avatar_url,
                  'net_minor', coalesce(b.net_minor, 0)) order by m.created_at), '[]'::jsonb)
                from public.group_members m
                left join public.profiles p on p.id = m.user_id
                left join public._group_net(inv.group_id) b on b.member_id = m.id
                where m.group_id = inv.group_id),
    'expenses', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', e.id, 'description', e.description, 'amount_minor', e.amount_minor,
                  'currency', e.currency, 'paid_by', e.paid_by, 'spent_at', e.spent_at,
                  'expense_splits', (select coalesce(jsonb_agg(jsonb_build_object(
                        'member_id', s.member_id, 'share_minor', s.share_minor)), '[]'::jsonb)
                     from public.expense_splits s where s.expense_id = e.id)
                  ) order by e.spent_at desc), '[]'::jsonb)
                from public.group_expenses e where e.group_id = inv.group_id),
    'settlements', (select coalesce(jsonb_agg(jsonb_build_object(
                  'from_member', st.from_member, 'to_member', st.to_member,
                  'amount_minor', st.amount_minor)), '[]'::jsonb)
                from public.settlements st where st.group_id = inv.group_id)
  ) into result;
  return result;
end $$;
