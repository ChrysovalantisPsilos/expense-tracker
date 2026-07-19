-- Leave / remove-member / delete-group, with a "must be settled" guard.

-- Net balance of one member: paid - owed_shares + settled_out - settled_in.
create or replace function public.group_member_net(p_group uuid, p_member uuid)
returns bigint language sql security definer stable set search_path = public as $$
  select
      coalesce((select sum(amount_minor) from public.group_expenses
                where group_id = p_group and paid_by = p_member), 0)
    - coalesce((select sum(s.share_minor) from public.expense_splits s
                join public.group_expenses e on e.id = s.expense_id
                where e.group_id = p_group and s.member_id = p_member), 0)
    + coalesce((select sum(amount_minor) from public.settlements
                where group_id = p_group and from_member = p_member), 0)
    - coalesce((select sum(amount_minor) from public.settlements
                where group_id = p_group and to_member = p_member), 0);
$$;

create or replace function public.member_has_footprint(p_group uuid, p_member uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists(select 1 from public.group_expenses where group_id = p_group and paid_by = p_member)
      or exists(select 1 from public.expense_splits s join public.group_expenses e on e.id = s.expense_id
                where e.group_id = p_group and s.member_id = p_member)
      or exists(select 1 from public.settlements where group_id = p_group
                and (from_member = p_member or to_member = p_member));
$$;

-- Remove a member (self-leave, or owner removing someone). Enforces settled-up
-- and handles owner auto-transfer on self-leave.
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

-- Delete a group — owner only, and only when everyone is settled.
create or replace function public.delete_group(p_group uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not exists(select 1 from public.groups where id = p_group and owner_id = uid) then
    raise exception 'only the owner can delete this group';
  end if;
  if exists(
    select 1 from public.group_members m
    where m.group_id = p_group and public.group_member_net(p_group, m.id) <> 0
  ) then
    raise exception 'Everyone must be settled up before the group can be deleted.';
  end if;
  delete from public.groups where id = p_group;
end;
$$;

revoke execute on function public.group_member_net(uuid, uuid) from anon, public;
revoke execute on function public.member_has_footprint(uuid, uuid) from anon, public;
revoke execute on function public.remove_group_member(uuid) from anon, public;
revoke execute on function public.delete_group(uuid) from anon, public;
grant execute on function public.remove_group_member(uuid) to authenticated;
grant execute on function public.delete_group(uuid) to authenticated;
