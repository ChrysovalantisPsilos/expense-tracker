-- Members of the same group may read each other's profile (name + avatar).
create or replace function public.shares_group(other_user uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists(
    select 1 from public.group_members a
    join public.group_members b on a.group_id = b.group_id
    where a.user_id = auth.uid() and b.user_id = other_user
  );
$$;
revoke execute on function public.shares_group(uuid) from anon, public;
grant execute on function public.shares_group(uuid) to authenticated;

drop policy if exists profiles_read_comembers on public.profiles;
create policy profiles_read_comembers on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_group(id));
