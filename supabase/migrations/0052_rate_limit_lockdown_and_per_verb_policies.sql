-- (a) rate_limit() is no longer callable by API roles. Before, any signed-in
--     user could call it with any key and exhaust someone else's bucket
--     (e.g. 'gexp:<victim>' or 'nudge:<victim>:…'). Every in-database caller
--     is a SECURITY DEFINER function (create_group_expense_v2, settlement_guard,
--     nudge_member, add_group_comment, invite_user_to_group), so they keep
--     working. The edge functions that rate-limited through the caller's JWT
--     now call consume_quota(scope): a fixed allow-list of scopes whose key is
--     always the caller's own uid, so a user can only spend their own quota.
-- (b) invite_user_to_group fans out a notification per call, so it gets the
--     same flood guard as the other fan-out mutations (CLAUDE.md #6).
-- (c) The remaining blanket FOR ALL policies are split per verb. The
--     expressions and roles are unchanged, so access is exactly the same.

-- ===========================================================================
-- (a) rate_limit lock-down + per-caller quota RPC for the edge functions
-- ===========================================================================
create or replace function public.consume_quota(p_scope text)
returns boolean language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); lim int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  -- Same keys and limits the edge functions used before, so live windows carry over.
  lim := case p_scope
    when 'report'       then 30   -- generate-report
    when 'group-report' then 30   -- group-report
    when 'send-invite'  then 20   -- send-invite
  end;
  if lim is null then raise exception 'unknown quota scope'; end if;
  return public.rate_limit(p_scope || ':' || uid, lim, 3600);
end $$;
revoke execute on function public.consume_quota(text) from anon, public;
grant execute on function public.consume_quota(text) to authenticated;

revoke execute on function public.rate_limit(text, integer, integer) from anon, authenticated, public;

-- ===========================================================================
-- (b) invite_user_to_group: body unchanged apart from the flood guard.
-- ===========================================================================
create or replace function public.invite_user_to_group(p_group uuid, p_email text)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); target uuid; inv_id uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not public.is_group_member(p_group) then raise exception 'not a member of this group'; end if;
  if not public.rate_limit('invite:' || uid, 30, 3600) then
    raise exception 'Too many invites — please slow down.';
  end if;

  select id into target from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if target is null then
    raise exception 'no_account';  -- caller falls back to adding a phantom
  end if;
  if exists (select 1 from public.group_members where group_id = p_group and user_id = target) then
    raise exception 'That person is already in this group.';
  end if;
  if exists (select 1 from public.group_invites
             where group_id = p_group and invited_user_id = target
               and accepted_at is null and declined_at is null) then
    raise exception 'They already have a pending invite to this group.';
  end if;

  insert into public.group_invites (group_id, invited_user_id, invited_email, created_by)
    values (p_group, target, lower(trim(p_email)), uid)
    returning id into inv_id;
  return inv_id;
end;
$$;

-- ===========================================================================
-- (c) Per-verb policies (same roles + expressions as the FOR ALL they replace)
-- ===========================================================================

-- Own-row tables: identical "own rows" rule (roles = public, as before).
do $$
declare t text; own constant text := '((select auth.uid()) = user_id)';
begin
  foreach t in array array['accounts', 'budgets', 'categories', 'savings_goals'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy own_select on public.%I for select using %s', t, own);
    execute format('create policy own_insert on public.%I for insert with check %s', t, own);
    execute format('create policy own_update on public.%I for update using %s with check %s', t, own, own);
    execute format('create policy own_delete on public.%I for delete using %s', t, own);
  end loop;
end $$;

drop policy if exists "own profile" on public.profiles;
create policy profile_select on public.profiles for select using ((select auth.uid()) = id);
create policy profile_insert on public.profiles for insert with check ((select auth.uid()) = id);
create policy profile_update on public.profiles for update
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy profile_delete on public.profiles for delete using ((select auth.uid()) = id);

drop policy if exists notif_own on public.notifications;
create policy notif_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notif_insert on public.notifications for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy notif_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notif_delete on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

-- Storage: avatars (own folder = uid) and group images (folder = group id,
-- owner only). group_images_read (public SELECT) is unchanged.
drop policy if exists avatars_write on storage.objects;
create policy avatars_select on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (auth.uid())::text);
create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (auth.uid())::text);
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (auth.uid())::text);
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (auth.uid())::text);

drop policy if exists group_images_write on storage.objects;
create policy group_images_owner_select on storage.objects for select to authenticated
  using (bucket_id = 'group-images' and public.is_group_owner(((storage.foldername(name))[1])::uuid));
create policy group_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'group-images' and public.is_group_owner(((storage.foldername(name))[1])::uuid));
create policy group_images_update on storage.objects for update to authenticated
  using (bucket_id = 'group-images' and public.is_group_owner(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'group-images' and public.is_group_owner(((storage.foldername(name))[1])::uuid));
create policy group_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'group-images' and public.is_group_owner(((storage.foldername(name))[1])::uuid));
