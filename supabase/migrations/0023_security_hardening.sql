-- Security hardening from the code review. Fixes the confirmed High-severity
-- findings plus cheap co-located Medium/Low ones.

-- ── H1: gm_update let ANY member alter/eject ANY other member ───────────────
-- The old policy used only `is_group_member` and had no WITH CHECK, so a plain
-- member could PATCH another member's row (set user_id=null, flip role, move
-- group). Membership writes all go through SECURITY DEFINER RPCs, so restrict
-- direct updates to the owner only.
drop policy if exists gm_update on public.group_members;
create policy gm_update on public.group_members for update to authenticated
  using (public.is_group_owner(group_id))
  with check (public.is_group_owner(group_id));

-- ── M3: group_expenses.created_by NOT NULL + ON DELETE SET NULL ─────────────
-- Contradiction: deleting a user who created a group expense makes SET NULL
-- violate NOT NULL and aborts account deletion. Make it nullable (matches
-- settlements.created_by).
alter table public.group_expenses alter column created_by drop not null;

-- ── H2 / L1: member references must belong to the expense/settlement's group ─
-- paid_by / split member_id / settlement from|to_member were FK-checked to
-- group_members but never constrained to the SAME group. A member could
-- reference a member row from another group, and the SECURITY DEFINER mirror
-- trigger would then inject a personal transaction into that stranger's ledger
-- (or brick a group's settle-up). Enforce same-group membership via triggers so
-- both the RPCs and direct REST writes are covered.
create or replace function public.assert_expense_paid_by_in_group()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.group_members
                 where id = NEW.paid_by and group_id = NEW.group_id) then
    raise exception 'Payer is not a member of this group';
  end if;
  return NEW;
end $$;
drop trigger if exists trg_expense_paid_by on public.group_expenses;
create trigger trg_expense_paid_by before insert or update of paid_by, group_id
  on public.group_expenses for each row execute function public.assert_expense_paid_by_in_group();

create or replace function public.assert_split_member_in_group()
returns trigger language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  select group_id into gid from public.group_expenses where id = NEW.expense_id;
  if not exists (select 1 from public.group_members
                 where id = NEW.member_id and group_id = gid) then
    raise exception 'Split member is not in this expense''s group';
  end if;
  return NEW;
end $$;
drop trigger if exists trg_split_member on public.expense_splits;
create trigger trg_split_member before insert or update of member_id, expense_id
  on public.expense_splits for each row execute function public.assert_split_member_in_group();

create or replace function public.assert_settlement_members_in_group()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.group_members where id = NEW.from_member and group_id = NEW.group_id)
     or not exists (select 1 from public.group_members where id = NEW.to_member and group_id = NEW.group_id) then
    raise exception 'Settlement members must belong to this group';
  end if;
  return NEW;
end $$;
drop trigger if exists trg_settlement_members on public.settlements;
create trigger trg_settlement_members before insert or update of from_member, to_member, group_id
  on public.settlements for each row execute function public.assert_settlement_members_in_group();

-- ── M2: group_invites insert allowed arbitrary invited_user_id / created_by ──
-- A member could insert invite rows directly (bypassing invite_user_to_group)
-- with any invited_user_id → the notify_invite trigger spams a stranger's
-- notifications, and created_by could spoof the inviter. Restrict client
-- inserts to anonymous share links they own; targeted invites go through the
-- SECURITY DEFINER RPC (which bypasses RLS).
drop policy if exists gi_all on public.group_invites;
create policy gi_all on public.group_invites for all to authenticated
  using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id)
              and created_by = auth.uid()
              and invited_user_id is null);

-- ── M1: leaving a group orphaned the leaver's mirrored personal transactions ─
-- remove_group_member nulls user_id for a member with history; the old
-- sync_member_link cleanup (dropped in 0021) used to delete their mirrored
-- personal transactions. Do it explicitly so a leaver's personal ledger isn't
-- polluted forever.
create or replace function public.remove_group_member(p_member uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  tgt record;
  g   record;
  new_owner record;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select * into tgt from public.group_members where id = p_member;
  if tgt is null then raise exception 'member not found'; end if;
  select * into g from public.groups where id = tgt.group_id;

  if not (g.owner_id = uid or tgt.user_id = uid) then
    raise exception 'not allowed';
  end if;

  if public.group_member_net(tgt.group_id, tgt.id) <> 0 then
    raise exception 'This member still has an outstanding balance — settle up first.';
  end if;

  if tgt.user_id is not null and tgt.user_id = g.owner_id then
    select * into new_owner from public.group_members
      where group_id = tgt.group_id and user_id is not null and id <> tgt.id
      order by created_at asc limit 1;
    if new_owner is null then
      raise exception 'You are the only member — delete the group instead.';
    end if;
    update public.groups set owner_id = new_owner.user_id where id = tgt.group_id;
    update public.group_members set role = 'owner' where id = new_owner.id;
    update public.group_members set role = 'member' where id = tgt.id;
  end if;

  -- Clean up the leaver's mirrored personal transactions for this group.
  if tgt.user_id is not null then
    delete from public.transactions t
    using public.group_expenses e
    where t.group_expense_id = e.id
      and e.group_id = tgt.group_id
      and t.user_id = tgt.user_id;
  end if;

  if not public.member_has_footprint(tgt.group_id, tgt.id) then
    delete from public.group_members where id = tgt.id;
  elsif tgt.user_id is not null then
    update public.group_members set user_id = null where id = tgt.id;
  else
    raise exception 'This person has expense history and can''t be removed individually — delete the group instead.';
  end if;

  return tgt.group_id;
end;
$$;

-- ── M4: find_user_by_email is dead code + an email→identity enumeration oracle ─
drop function if exists public.find_user_by_email(text);

-- ── M5: group_preview (anon-callable) leaked every member's auth user_id ─────
-- The logged-out invite preview legitimately needs this function, but it does
-- not need to expose user_ids (which fed the H2 injection). Drop the user_id
-- field; keep display_name + avatar.
create or replace function public.group_preview(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare inv record; result jsonb;
begin
  select * into inv from public.group_invites
    where token = p_token and (expires_at is null or expires_at > now());
  if inv is null then return null; end if;
  select jsonb_build_object(
    'group', (select jsonb_build_object('id', g.id, 'name', g.name, 'currency', g.currency)
              from public.groups g where g.id = inv.group_id),
    'members', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', m.id, 'display_name', m.display_name,
                  'avatar_url', p.avatar_url) order by m.created_at), '[]'::jsonb)
                from public.group_members m
                left join public.profiles p on p.id = m.user_id
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
                  'amount_minor', st.amount_minor) ), '[]'::jsonb)
                from public.settlements st where st.group_id = inv.group_id)
  ) into result;
  return result;
end $$;

-- ── L2: trigger functions never had EXECUTE revoked (unlike the others) ─────
revoke execute on function public.assert_expense_paid_by_in_group() from anon, authenticated, public;
revoke execute on function public.assert_split_member_in_group() from anon, authenticated, public;
revoke execute on function public.assert_settlement_members_in_group() from anon, authenticated, public;
revoke execute on function public.sync_member_display_name() from anon, authenticated, public;
revoke execute on function public.touch_updated_at() from anon, authenticated, public;
