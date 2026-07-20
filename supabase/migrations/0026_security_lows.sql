-- Low-severity security cleanups from the review.

-- L3: respond_to_invite used `invited_user_id <> uid`, which is NULL (not true)
-- for a share-link invite (invited_user_id NULL) — the guard was skipped and it
-- fell through to accept. Use IS DISTINCT FROM so a NULL target is rejected.
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
  if not exists (select 1 from public.group_members where group_id = inv.group_id and user_id = uid) then
    nm := public.member_name_for(uid);
    insert into public.group_members (group_id, user_id, display_name)
      values (inv.group_id, uid, coalesce(nm, 'Member'))
    on conflict (group_id, user_id) where user_id is not null do nothing;
  end if;
  update public.group_invites set accepted_by = uid, accepted_at = now() where id = inv.id;
  return inv.group_id;
end $$;

-- L4: transactions.group_id had no FK (orphan risk). Add one. Mirrored rows are
-- already cascade-cleaned via group_expense_id, so set null here is a backstop.
alter table public.transactions
  add constraint transactions_group_id_fkey
  foreign key (group_id) references public.groups(id) on delete set null;

-- L5 + DC2: profiles_read_comembers exposed a co-member's FULL profile row
-- (base_currency, nickname, timestamps) when only the avatar is needed. Replace
-- it with a column-limited SECURITY DEFINER function, and drop the now-unused
-- nickname column. Co-members can no longer read each other's profile rows
-- directly — only their own.
create or replace function public.group_member_avatars(p_group uuid)
returns table (user_id uuid, avatar_url text)
language sql security definer stable set search_path = public as $$
  select p.id, p.avatar_url
  from public.group_members m
  join public.profiles p on p.id = m.user_id
  where m.group_id = p_group and public.is_group_member(p_group);
$$;
revoke execute on function public.group_member_avatars(uuid) from anon, public;
grant execute on function public.group_member_avatars(uuid) to authenticated;

drop policy if exists profiles_read_comembers on public.profiles;

alter table public.profiles drop column if exists nickname;
