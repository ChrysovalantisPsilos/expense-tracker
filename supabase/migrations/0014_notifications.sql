create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  type       text not null,               -- 'invite' | 'expense' | 'settlement'
  title      text not null,
  body       text,
  group_id   uuid references public.groups(id) on delete cascade,
  invite_id  uuid references public.group_invites(id) on delete cascade,
  actor_id   uuid references auth.users(id) on delete set null,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx
  on public.notifications(user_id, created_at desc);

alter table public.notifications enable row level security;
drop policy if exists notif_own on public.notifications;
create policy notif_own on public.notifications for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.notify_invite()
returns trigger language plpgsql security definer set search_path = public as $$
declare gname text; actor text;
begin
  if NEW.invited_user_id is null then return NEW; end if;
  select name into gname from public.groups where id = NEW.group_id;
  select coalesce(display_name, 'Someone') into actor from public.profiles where id = NEW.created_by;
  insert into public.notifications (user_id, type, title, body, group_id, invite_id, actor_id)
  values (NEW.invited_user_id, 'invite', 'Group invite',
          actor || ' invited you to “' || coalesce(gname, 'a group') || '”',
          NEW.group_id, NEW.id, NEW.created_by);
  return NEW;
end $$;
drop trigger if exists trg_notify_invite on public.group_invites;
create trigger trg_notify_invite after insert on public.group_invites
  for each row execute function public.notify_invite();

create or replace function public.notify_group_expense()
returns trigger language plpgsql security definer set search_path = public as $$
declare gname text; actor text;
begin
  select name into gname from public.groups where id = NEW.group_id;
  select coalesce(display_name, 'Someone') into actor from public.profiles where id = NEW.created_by;
  insert into public.notifications (user_id, type, title, body, group_id, actor_id)
  select m.user_id, 'expense', coalesce(gname, 'Group') || ': new expense',
         actor || ' added “' || coalesce(NEW.description, 'an expense') || '”',
         NEW.group_id, NEW.created_by
  from public.group_members m
  where m.group_id = NEW.group_id and m.user_id is not null and m.user_id <> NEW.created_by;
  return NEW;
end $$;
drop trigger if exists trg_notify_expense on public.group_expenses;
create trigger trg_notify_expense after insert on public.group_expenses
  for each row execute function public.notify_group_expense();

create or replace function public.notify_settlement()
returns trigger language plpgsql security definer set search_path = public as $$
declare gname text; actor text;
begin
  select name into gname from public.groups where id = NEW.group_id;
  select coalesce(display_name, 'Someone') into actor from public.profiles where id = NEW.created_by;
  insert into public.notifications (user_id, type, title, body, group_id, actor_id)
  select m.user_id, 'settlement', coalesce(gname, 'Group') || ': settlement recorded',
         actor || ' recorded a payment', NEW.group_id, NEW.created_by
  from public.group_members m
  where m.id in (NEW.from_member, NEW.to_member)
    and m.user_id is not null and m.user_id <> NEW.created_by;
  return NEW;
end $$;
drop trigger if exists trg_notify_settlement on public.settlements;
create trigger trg_notify_settlement after insert on public.settlements
  for each row execute function public.notify_settlement();

revoke execute on function public.notify_invite() from anon, authenticated, public;
revoke execute on function public.notify_group_expense() from anon, authenticated, public;
revoke execute on function public.notify_settlement() from anon, authenticated, public;
