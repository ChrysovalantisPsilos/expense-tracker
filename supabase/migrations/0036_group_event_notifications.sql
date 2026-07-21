-- Group event notifications + delivery fan-out + realtime.
--
-- New bell types: member_joined (invite accepted / phantom claimed) and
-- member_left (voluntary leave; skipped when the leaver picks "leave
-- silently"). A fan-out trigger on notifications forwards EVERY insert to the
-- notify-user edge function, which delivers web push (all types, if the user's
-- push switch is on) and email (big events only — invite / member_joined /
-- member_left — if the email switch is on). Realtime is enabled on the group
-- tables + notifications so open pages update without refresh.

-- ---------------------------------------------------------------------------
-- 1) Account-wide delivery switches (defaults on).
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists notify_email boolean not null default true,
  add column if not exists notify_push  boolean not null default true;

-- ---------------------------------------------------------------------------
-- 2) member_joined — someone became a real (user-linked) member: fresh insert
--    with user_id, or a phantom slot claimed (user_id null -> value).
-- ---------------------------------------------------------------------------
create or replace function public.notify_member_joined()
returns trigger language plpgsql security definer set search_path = public as $$
declare gname text;
begin
  if NEW.user_id is null then return NEW; end if;
  if TG_OP = 'UPDATE' and OLD.user_id is not distinct from NEW.user_id then
    return NEW;
  end if;
  select name into gname from public.groups where id = NEW.group_id;
  insert into public.notifications (user_id, type, title, body, group_id, actor_id)
  select m.user_id, 'member_joined', 'New group member',
         coalesce(NEW.display_name, 'Someone') || ' joined “' || coalesce(gname, 'a group') || '”',
         NEW.group_id, NEW.user_id
  from public.group_members m
  where m.group_id = NEW.group_id
    and m.user_id is not null
    and m.user_id <> NEW.user_id
    and m.id <> NEW.id;
  return NEW;
end $$;
revoke execute on function public.notify_member_joined() from anon, authenticated, public;

drop trigger if exists trg_notify_member_joined_ins on public.group_members;
create trigger trg_notify_member_joined_ins after insert on public.group_members
  for each row execute function public.notify_member_joined();
drop trigger if exists trg_notify_member_joined_upd on public.group_members;
create trigger trg_notify_member_joined_upd after update of user_id on public.group_members
  for each row execute function public.notify_member_joined();

-- ---------------------------------------------------------------------------
-- 3) member_left — remove_group_member grows a p_silent flag. Notifications
--    fire only for voluntary self-leave (not owner removals), before the row
--    mutates so the remaining-member list is still intact.
--    Replaces the 0009 single-arg signature (dropped to avoid RPC ambiguity).
-- ---------------------------------------------------------------------------
drop function if exists public.remove_group_member(uuid);

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

  -- Voluntary leave tells the rest of the group — unless asked not to.
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
    update public.group_members set user_id = null where id = tgt.id;
  else
    raise exception 'This person has expense history and can''t be removed individually — delete the group instead.';
  end if;

  return tgt.group_id;
end;
$$;
revoke execute on function public.remove_group_member(uuid, boolean) from anon, public;
grant execute on function public.remove_group_member(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Delivery fan-out: every notification insert is forwarded to the
--    notify-user edge function (push + email decisions happen there, against
--    the user's switches). Same Vault shared secret as the reminders cron —
--    one trust domain: this database calling this project's functions.
-- ---------------------------------------------------------------------------
create or replace function public.notify_fanout()
returns trigger language plpgsql security definer set search_path = public as $$
declare secret text;
begin
  select decrypted_secret into secret
  from vault.decrypted_secrets where name = 'reminder_cron_secret';
  if secret is null then return NEW; end if;  -- delivery off until Vault is set
  perform net.http_post(
    url     := 'https://ctvdljzybbujuywppixo.supabase.co/functions/v1/notify-user',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cron-secret', secret),
    body    := jsonb_build_object('notification_id', NEW.id)
  );
  return NEW;
end $$;
revoke execute on function public.notify_fanout() from anon, authenticated, public;

drop trigger if exists trg_notify_fanout on public.notifications;
create trigger trg_notify_fanout after insert on public.notifications
  for each row execute function public.notify_fanout();

-- ---------------------------------------------------------------------------
-- 5) Realtime: open group pages + the bell subscribe to these tables.
--    replica identity full so DELETE events still carry group_id and pass
--    the client-side filters (default identity strips non-PK columns).
-- ---------------------------------------------------------------------------
alter table public.group_expenses  replica identity full;
alter table public.settlements     replica identity full;
alter table public.group_members   replica identity full;

do $$
declare t text;
begin
  foreach t in array array['group_expenses', 'settlements', 'group_members', 'notifications']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
