-- V2 slice: groups, hybrid members, equal splits, pairwise balances, settle-up.
-- Track-only ledger. Membership-based RLS.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  currency   char(3) not null default 'USD',
  owner_id   uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A member is a person in the group. user_id is NULL for a phantom member
-- (name only); it gets set when they claim their slot via an invite.
create table if not exists public.group_members (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete set null,
  display_name text not null,
  role         text not null default 'member' check (role in ('owner','member')),
  created_at   timestamptz not null default now()
);
create index if not exists group_members_group_idx on public.group_members(group_id);
create index if not exists group_members_user_idx on public.group_members(user_id);
create unique index if not exists group_members_group_user_uniq
  on public.group_members(group_id, user_id) where user_id is not null;

-- Shareable invites. member_id set = invite to claim a specific phantom slot;
-- null = open "join this group" link. invited_email reserved for future email
-- invites.
create table if not exists public.group_invites (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.groups(id) on delete cascade,
  member_id     uuid references public.group_members(id) on delete cascade,
  token         text not null unique default encode(gen_random_bytes(9), 'hex'),
  invited_email text,
  created_by    uuid not null references auth.users(id) on delete cascade,
  expires_at    timestamptz,
  accepted_by   uuid references auth.users(id) on delete set null,
  accepted_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists group_invites_group_idx on public.group_invites(group_id);

create table if not exists public.group_expenses (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups(id) on delete cascade,
  description  text,
  amount_minor bigint not null check (amount_minor >= 0),
  currency     char(3) not null default 'USD',
  paid_by      uuid not null references public.group_members(id) on delete restrict,
  spent_at     date not null default current_date,
  receipt_path text,
  created_by   uuid not null references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists group_expenses_group_idx on public.group_expenses(group_id, spent_at desc);

create table if not exists public.expense_splits (
  id          uuid primary key default gen_random_uuid(),
  expense_id  uuid not null references public.group_expenses(id) on delete cascade,
  member_id   uuid not null references public.group_members(id) on delete cascade,
  share_minor bigint not null check (share_minor >= 0),
  unique (expense_id, member_id)
);
create index if not exists expense_splits_expense_idx on public.expense_splits(expense_id);

create table if not exists public.settlements (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups(id) on delete cascade,
  from_member  uuid not null references public.group_members(id) on delete cascade,
  to_member    uuid not null references public.group_members(id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0),
  currency     char(3) not null default 'USD',
  note         text,
  settled_at   date not null default current_date,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  check (from_member <> to_member)
);
create index if not exists settlements_group_idx on public.settlements(group_id);

-- updated_at triggers
drop trigger if exists trg_groups_touch on public.groups;
create trigger trg_groups_touch before update on public.groups
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_gexp_touch on public.group_expenses;
create trigger trg_gexp_touch before update on public.group_expenses
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Membership helpers (SECURITY DEFINER -> bypass RLS, so policies that call
-- them don't recurse on group_members).
-- ---------------------------------------------------------------------------
create or replace function public.is_group_member(gid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid()
  );
$$;

create or replace function public.is_group_owner(gid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.groups where id = gid and owner_id = auth.uid()
  );
$$;

revoke execute on function public.is_group_member(uuid) from public;
revoke execute on function public.is_group_owner(uuid) from public;
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.is_group_owner(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.groups          enable row level security;
alter table public.group_members   enable row level security;
alter table public.group_invites   enable row level security;
alter table public.group_expenses  enable row level security;
alter table public.expense_splits  enable row level security;
alter table public.settlements     enable row level security;

drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups for select to authenticated
  using (public.is_group_member(id) or owner_id = auth.uid());
drop policy if exists groups_insert on public.groups;
create policy groups_insert on public.groups for insert to authenticated
  with check (owner_id = auth.uid());
drop policy if exists groups_modify on public.groups;
create policy groups_modify on public.groups for update to authenticated
  using (public.is_group_owner(id)) with check (public.is_group_owner(id));
drop policy if exists groups_delete on public.groups;
create policy groups_delete on public.groups for delete to authenticated
  using (public.is_group_owner(id));

drop policy if exists gm_select on public.group_members;
create policy gm_select on public.group_members for select to authenticated
  using (public.is_group_member(group_id) or public.is_group_owner(group_id));
drop policy if exists gm_insert on public.group_members;
create policy gm_insert on public.group_members for insert to authenticated
  with check (public.is_group_member(group_id) or public.is_group_owner(group_id));
drop policy if exists gm_update on public.group_members;
create policy gm_update on public.group_members for update to authenticated
  using (public.is_group_member(group_id) or public.is_group_owner(group_id));
drop policy if exists gm_delete on public.group_members;
create policy gm_delete on public.group_members for delete to authenticated
  using (public.is_group_owner(group_id));

drop policy if exists gi_all on public.group_invites;
create policy gi_all on public.group_invites for all to authenticated
  using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));

drop policy if exists ge_all on public.group_expenses;
create policy ge_all on public.group_expenses for all to authenticated
  using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));

drop policy if exists es_all on public.expense_splits;
create policy es_all on public.expense_splits for all to authenticated
  using (exists (select 1 from public.group_expenses e
                 where e.id = expense_id and public.is_group_member(e.group_id)))
  with check (exists (select 1 from public.group_expenses e
                 where e.id = expense_id and public.is_group_member(e.group_id)));

drop policy if exists st_all on public.settlements;
create policy st_all on public.settlements for all to authenticated
  using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
create or replace function public.create_group(p_name text, p_currency char(3) default 'USD')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  gid uuid;
  uid uuid := auth.uid();
  nm  text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select coalesce(display_name, 'Me') into nm from public.profiles where id = uid;
  insert into public.groups (name, currency, owner_id)
    values (p_name, coalesce(p_currency, 'USD'), uid) returning id into gid;
  insert into public.group_members (group_id, user_id, display_name, role)
    values (gid, uid, coalesce(nm, 'Me'), 'owner');
  return gid;
end;
$$;

create or replace function public.accept_group_invite(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  inv record;
  uid uuid := auth.uid();
  nm  text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into inv from public.group_invites
    where token = p_token and (expires_at is null or expires_at > now());
  if inv is null then raise exception 'invite invalid or expired'; end if;

  if exists (select 1 from public.group_members
             where group_id = inv.group_id and user_id = uid) then
    return inv.group_id;
  end if;

  select coalesce(display_name, 'Member') into nm from public.profiles where id = uid;

  if inv.member_id is not null then
    update public.group_members
      set user_id = uid, display_name = coalesce(display_name, nm)
      where id = inv.member_id and user_id is null;
    if not found then
      insert into public.group_members (group_id, user_id, display_name)
        values (inv.group_id, uid, coalesce(nm, 'Member'));
    end if;
    update public.group_invites
      set accepted_by = uid, accepted_at = now() where id = inv.id;
  else
    insert into public.group_members (group_id, user_id, display_name)
      values (inv.group_id, uid, coalesce(nm, 'Member'));
  end if;

  return inv.group_id;
end;
$$;

revoke execute on function public.create_group(text, char) from public;
revoke execute on function public.accept_group_invite(text) from public;
grant execute on function public.create_group(text, char) to authenticated;
grant execute on function public.accept_group_invite(text) to authenticated;
