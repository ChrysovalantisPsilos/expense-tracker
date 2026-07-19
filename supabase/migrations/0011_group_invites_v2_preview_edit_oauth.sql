-- Invite existing users (in-app requests), read-only preview, expense edit,
-- OAuth avatar/name pull, and phantom-name replacement on claim.

-- 1. Invites can target an existing user + track declines.
alter table public.group_invites
  add column if not exists invited_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists declined_at timestamptz;

-- 2. handle_new_user: pull name + avatar from OAuth metadata (fill-if-empty,
--    first signup only — never overwrites later edits).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name',
             new.raw_user_meta_data->>'name',
             split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_url',
             new.raw_user_meta_data->>'picture')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 3. accept_group_invite: replace phantom placeholder name with real name.
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
  select coalesce(display_name, 'Member') into nm from public.profiles where id = uid;
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
end;
$$;

-- 4. Look up an existing user by EXACT email.
create or replace function public.find_user_by_email(p_email text)
returns table (user_id uuid, display_name text, avatar_url text)
language sql security definer set search_path = public as $$
  select u.id, p.display_name, p.avatar_url
  from auth.users u
  left join public.profiles p on p.id = u.id
  where lower(u.email) = lower(trim(p_email))
  limit 1;
$$;

-- 5. Invite an existing user (creates an in-app request).
create or replace function public.invite_user_to_group(p_group uuid, p_email text)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); target uuid; inv_id uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not public.is_group_member(p_group) then raise exception 'not a member of this group'; end if;
  select id into target from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if target is null then raise exception 'no_account'; end if;
  if exists (select 1 from public.group_members where group_id = p_group and user_id = target) then
    raise exception 'That person is already in this group.';
  end if;
  if exists (select 1 from public.group_invites
             where group_id = p_group and invited_user_id = target
               and accepted_at is null and declined_at is null) then
    raise exception 'They already have a pending invite to this group.';
  end if;
  insert into public.group_invites (group_id, invited_user_id, invited_email, created_by)
    values (p_group, target, lower(trim(p_email)), uid) returning id into inv_id;
  return inv_id;
end;
$$;

-- 6. Pending invites addressed to the current user.
create or replace function public.list_my_group_invites()
returns table (invite_id uuid, group_id uuid, group_name text, invited_by text, created_at timestamptz)
language sql security definer set search_path = public as $$
  select i.id, i.group_id, g.name, coalesce(pi.display_name, 'Someone'), i.created_at
  from public.group_invites i
  join public.groups g on g.id = i.group_id
  left join public.profiles pi on pi.id = i.created_by
  where i.invited_user_id = auth.uid()
    and i.accepted_at is null and i.declined_at is null
    and (i.expires_at is null or i.expires_at > now())
  order by i.created_at desc;
$$;

-- 7. Accept / decline an in-app request.
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
    select coalesce(display_name, 'Member') into nm from public.profiles where id = uid;
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
end;
$$;

-- 8. Read-only group preview for a share token (callable by anon).
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
    'member_id', inv.member_id,
    'members', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', m.id, 'display_name', m.display_name,
                  'user_id', m.user_id, 'avatar_url', p.avatar_url) order by m.created_at), '[]'::jsonb)
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
end;
$$;

-- 9. Atomic edit of a group expense (fields + equal re-split).
create or replace function public.update_group_expense(
  p_expense uuid, p_description text, p_amount bigint, p_currency char(3),
  p_paid_by uuid, p_spent_at date, p_member_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare gid uuid; n int; base bigint; rem bigint; i int;
begin
  select group_id into gid from public.group_expenses where id = p_expense;
  if gid is null then raise exception 'expense not found'; end if;
  if not public.is_group_member(gid) then raise exception 'not a member'; end if;
  n := coalesce(array_length(p_member_ids, 1), 0);
  if n = 0 then raise exception 'split between at least one person'; end if;
  update public.group_expenses
    set description = p_description, amount_minor = p_amount, currency = p_currency,
        paid_by = p_paid_by, spent_at = p_spent_at
    where id = p_expense;
  delete from public.expense_splits where expense_id = p_expense;
  base := p_amount / n;
  rem  := p_amount - base * n;
  for i in 1 .. n loop
    insert into public.expense_splits (expense_id, member_id, share_minor)
      values (p_expense, p_member_ids[i], base + case when i <= rem then 1 else 0 end);
  end loop;
end;
$$;

-- Grants
revoke execute on function public.find_user_by_email(text) from anon, public;
revoke execute on function public.invite_user_to_group(uuid, text) from anon, public;
revoke execute on function public.list_my_group_invites() from anon, public;
revoke execute on function public.respond_to_invite(uuid, boolean) from anon, public;
revoke execute on function public.update_group_expense(uuid, text, bigint, char, uuid, date, uuid[]) from anon, public;
grant execute on function public.find_user_by_email(text) to authenticated;
grant execute on function public.invite_user_to_group(uuid, text) to authenticated;
grant execute on function public.list_my_group_invites() to authenticated;
grant execute on function public.respond_to_invite(uuid, boolean) to authenticated;
grant execute on function public.update_group_expense(uuid, text, bigint, char, uuid, date, uuid[]) to authenticated;

revoke execute on function public.group_preview(text) from public;
grant execute on function public.group_preview(text) to anon, authenticated;
