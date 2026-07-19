-- A member's name inside a group was a SNAPSHOT: group_members.display_name was
-- copied from the profile at join time and never updated. So renaming yourself
-- in Profile didn't reach the group member lists, "X paid" labels, settlement
-- pickers, previews, or reports — friends kept seeing your old name. And the
-- nickname ("what friends call you") never showed to friends at all, even
-- though the app's own nav shows nickname-preferred.
--
-- Fix: the profile is the single source of truth. The group-facing name is
-- coalesce(nickname, display_name); it is (1) seeded with that rule at join
-- time and (2) kept live by a trigger that propagates profile edits to every
-- linked group_members row the instant Save writes the profile. Phantom rows
-- (user_id null) are untouched.

-- Canonical group-facing name for a linked member.
create or replace function public.member_name_for(p_uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim(nickname), ''), display_name, 'Member')
  from public.profiles where id = p_uid;
$$;
revoke execute on function public.member_name_for(uuid) from anon, public;
grant execute on function public.member_name_for(uuid) to authenticated;

-- 1. create_group: seed the owner's member name nickname-preferred.
create or replace function public.create_group(p_name text, p_currency char(3) default 'USD')
returns uuid language plpgsql security definer set search_path = public as $$
declare gid uuid; uid uuid := auth.uid(); nm text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  nm := public.member_name_for(uid);
  insert into public.groups (name, currency, owner_id)
    values (p_name, coalesce(p_currency, 'USD'), uid) returning id into gid;
  insert into public.group_members (group_id, user_id, display_name, role)
    values (gid, uid, coalesce(nm, 'Me'), 'owner');
  return gid;
end $$;

-- 2. accept_group_invite: claim/join with the nickname-preferred name.
create or replace function public.accept_group_invite(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv record; uid uuid := auth.uid(); nm text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into inv from public.group_invites
    where token = p_token and (expires_at is null or expires_at > now());
  if inv is null then raise exception 'invite invalid or expired'; end if;
  if exists (select 1 from public.group_members where group_id = inv.group_id and user_id = uid) then
    return inv.group_id;
  end if;
  nm := public.member_name_for(uid);
  if inv.member_id is not null then
    update public.group_members
      set user_id = uid, display_name = coalesce(nm, display_name)
      where id = inv.member_id and user_id is null;
    if not found then
      insert into public.group_members (group_id, user_id, display_name) values (inv.group_id, uid, coalesce(nm, 'Member'));
    end if;
    update public.group_invites set accepted_by = uid, accepted_at = now() where id = inv.id;
  else
    insert into public.group_members (group_id, user_id, display_name) values (inv.group_id, uid, coalesce(nm, 'Member'));
  end if;
  return inv.group_id;
end $$;

-- 3. respond_to_invite: same, on accept.
create or replace function public.respond_to_invite(p_invite uuid, p_accept boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv record; uid uuid := auth.uid(); nm text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into inv from public.group_invites where id = p_invite;
  if inv is null or inv.invited_user_id <> uid then raise exception 'invite not found'; end if;
  if inv.accepted_at is not null or inv.declined_at is not null then raise exception 'already responded'; end if;
  if not p_accept then
    update public.group_invites set declined_at = now() where id = inv.id;
    return null;
  end if;
  if not exists (select 1 from public.group_members where group_id = inv.group_id and user_id = uid) then
    nm := public.member_name_for(uid);
    if inv.member_id is not null then
      update public.group_members set user_id = uid, display_name = coalesce(nm, display_name)
        where id = inv.member_id and user_id is null;
      if not found then
        insert into public.group_members (group_id, user_id, display_name) values (inv.group_id, uid, coalesce(nm,'Member'));
      end if;
    else
      insert into public.group_members (group_id, user_id, display_name) values (inv.group_id, uid, coalesce(nm,'Member'));
    end if;
  end if;
  update public.group_invites set accepted_by = uid, accepted_at = now() where id = inv.id;
  return inv.group_id;
end $$;

-- 4. Propagate profile name edits to every linked group_members row. Fires on
--    the UPDATE that "Save changes" performs, so the new name is live at once.
create or replace function public.sync_member_display_name()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.display_name is distinct from OLD.display_name
     or NEW.nickname is distinct from OLD.nickname then
    update public.group_members
      set display_name = coalesce(nullif(btrim(NEW.nickname), ''), NEW.display_name, display_name)
      where user_id = NEW.id;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_sync_member_name on public.profiles;
create trigger trg_sync_member_name after update on public.profiles
  for each row execute function public.sync_member_display_name();

-- 5. One-time backfill: make existing group memberships match current profiles.
update public.group_members m
  set display_name = coalesce(nullif(btrim(p.nickname), ''), p.display_name, m.display_name)
  from public.profiles p
  where p.id = m.user_id
    and m.display_name is distinct from coalesce(nullif(btrim(p.nickname), ''), p.display_name, m.display_name);
