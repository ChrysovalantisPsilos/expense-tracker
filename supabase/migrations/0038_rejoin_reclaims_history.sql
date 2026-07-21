-- Rejoining a group reclaims your old member slot instead of duplicating you.
--
-- Leaving with expense history keeps the member row (detached: user_id null)
-- so the group's books stay intact — but rejoining then INSERTED a second
-- row with the same name. Now the detached row remembers whose it was
-- (former_user_id), and both join paths reattach that row when the same
-- account comes back: one member, history and balances restored.

alter table public.group_members
  add column if not exists former_user_id uuid;

-- Shared join step: reclaim the caller's own detached row if one exists,
-- otherwise insert a fresh member. Internal — called by the join functions.
create or replace function public.claim_or_insert_member(
  p_group uuid, p_uid uuid, p_name text
) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.group_members
     set user_id = p_uid,
         former_user_id = null,
         display_name = coalesce(p_name, display_name)
   where group_id = p_group and user_id is null and former_user_id = p_uid;
  if not found then
    insert into public.group_members (group_id, user_id, display_name)
    values (p_group, p_uid, coalesce(p_name, 'Member'))
    on conflict (group_id, user_id) where user_id is not null do nothing;
  end if;
end $$;
revoke execute on function public.claim_or_insert_member(uuid, uuid, text)
  from anon, authenticated, public;

-- Join path 1: share links.
create or replace function public.join_via_link(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv record; uid uuid := auth.uid(); nm text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into inv from public.group_invites
    where token = p_token and (expires_at is null or expires_at > now());
  if inv is null then raise exception 'invite invalid or expired'; end if;
  if exists (select 1 from public.group_members
             where group_id = inv.group_id and user_id = uid) then
    return inv.group_id;
  end if;
  nm := public.member_name_for(uid);
  perform public.claim_or_insert_member(inv.group_id, uid, nm);
  return inv.group_id;
end $$;

-- Join path 2: direct invites (inbox accept).
create or replace function public.respond_to_invite(p_invite uuid, p_accept boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv record; uid uuid := auth.uid(); nm text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into inv from public.group_invites where id = p_invite;
  if inv is null or inv.invited_user_id is distinct from uid then raise exception 'invite not found'; end if;
  if inv.accepted_at is not null or inv.declined_at is not null then raise exception 'already responded'; end if;
  if inv.expires_at is not null and inv.expires_at <= now() then raise exception 'invite expired'; end if;
  if not p_accept then
    update public.group_invites set declined_at = now() where id = inv.id;
    return null;
  end if;
  if not exists (select 1 from public.group_members
                 where group_id = inv.group_id and user_id = uid) then
    nm := public.member_name_for(uid);
    perform public.claim_or_insert_member(inv.group_id, uid, nm);
  end if;
  update public.group_invites set accepted_by = uid, accepted_at = now() where id = inv.id;
  return inv.group_id;
end $$;

-- Leave: stamp former_user_id when detaching (otherwise same as 0036).
create or replace function public.remove_group_member(
  p_member uuid, p_silent boolean default false
) returns uuid language plpgsql security definer set search_path = public as $$
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

  if tgt.user_id = uid and not p_silent then
    insert into public.notifications (user_id, type, title, body, group_id, actor_id)
    select m.user_id, 'member_left', 'Member left',
           coalesce(tgt.display_name, 'Someone') || ' left “' || coalesce(g.name, 'a group') || '”',
           tgt.group_id, uid
    from public.group_members m
    where m.group_id = tgt.group_id
      and m.user_id is not null
      and m.user_id <> uid;
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
    -- Detach but remember whose slot this was, so a rejoin reclaims it.
    update public.group_members
       set user_id = null, former_user_id = tgt.user_id
     where id = tgt.id;
  else
    raise exception 'This person has expense history and can''t be removed individually — delete the group instead.';
  end if;

  return tgt.group_id;
end;
$$;
revoke execute on function public.remove_group_member(uuid, boolean) from anon, public;
grant execute on function public.remove_group_member(uuid, boolean) to authenticated;
