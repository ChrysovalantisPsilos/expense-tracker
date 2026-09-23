-- Fixes from the 2026-09-23 security + database review (security.md M1–M4,
-- L3, L6, L7, Info; database.md F1, F9–F11, F14; the zero-decimal budget/digest
-- bug). Applies on top of 0057 (TEST) and on top of 0048–0057 (PROD release).
--
-- M3/F1 Group owners can no longer rewrite membership or ownership directly.
--       group_members has no client write path at all (every change goes
--       through a definer RPC); groups keeps UPDATE on (name, image_url) only.
--       BEFORE UPDATE triggers pin the identity columns for API roles, as
--       defence in depth against a future re-grant. Direct owner DELETEs of a
--       group or member row (which skipped the settled-up / footprint checks
--       in delete_group / remove_group_member) are closed too.
-- M1    save_push_subscription: https + push-service allowlist, at most 10
--       per user, and an endpoint owned by another account is only re-bound
--       when the caller proves possession (same p256dh + auth keys).
-- M2    join_via_link is rate-limited (10/h); a loud leave notifies at most
--       once per group per hour (and 10/h overall); a re-join within an hour
--       of leaving doesn't notify the group again.
-- M4    invite_user_to_group returns a status instead of raising on a miss,
--       so every lookup commits its rate-limit increment (20/h).
-- L7    add_settlement: the caller must be one of the two parties, or the
--       group owner.
-- L3    Storage: size + MIME limits on both buckets, no anonymous listing of
--       group-images, and client-set avatar_url / image_url must point at this
--       project's own public bucket folder.
-- L6    Length / control-character limits on display and group names; the
--       send-invite quota drops to 10/h and gains a per-recipient cap.
-- F9    Dead RPCs dropped (shares_group, the v1 expense wrappers);
--       member_name_for is no longer callable by clients.
-- F10   anon has no table privileges in public; API roles lose TRUNCATE /
--       REFERENCES / TRIGGER / MAINTAIN; unused write grants are revoked.
-- F11   3 FK indexes added, 2 redundant indexes dropped, 7 policies use
--       (select auth.uid()) so it's evaluated once per statement.
-- F14   A nightly job purges stale rate_limits rows and old cron run logs.
-- $$    Budget alerts and the weekly digest convert to the base currency with
--       the minor-unit factor (¥1,800 at 0.0062 is €11.16, not €0.11).
--
-- Every function created or replaced here pins search_path = public, pg_temp.
-- Not fixable from SQL: net.* EXECUTE is owned by supabase_admin (postgres
-- can't revoke it); the net schema is not exposed through the API.

-- ===========================================================================
-- Shared helpers
-- ===========================================================================

-- Minor-unit factor per currency; the zero-decimal set matches
-- src/shared/lib/currency.js and supabase/functions/_shared/money.ts.
create or replace function public.minor_factor(p_currency text)
returns int language sql immutable parallel safe
set search_path = public, pg_temp as $$
  select case when upper(p_currency) in ('JPY', 'KRW', 'VND', 'CLP') then 1 else 100 end;
$$;

-- Minor units in p_from -> minor units in p_base, with the major-per-major
-- rate captured at entry (mirrors currency.js toBaseMinor).
create or replace function public.to_base_minor(p_minor bigint, p_rate numeric, p_from text, p_base text)
returns bigint language sql immutable parallel safe
set search_path = public, pg_temp as $$
  select round(p_minor::numeric * coalesce(p_rate, 1) * public.minor_factor(p_base)
               / public.minor_factor(coalesce(p_from, p_base)))::bigint;
$$;

revoke execute on function public.minor_factor(text) from public, anon, authenticated;
revoke execute on function public.to_base_minor(bigint, numeric, text, text) from public, anon, authenticated;

-- ===========================================================================
-- M3 / F1 — no direct client rewrites of groups / group_members
-- ===========================================================================
revoke insert, update, delete on public.group_members from anon, authenticated;
revoke insert, update, delete on public.groups from anon, authenticated;
grant update (name, image_url) on public.groups to authenticated;

-- Policies no grant can reach any more (CLAUDE.md #7). Creation, joining,
-- leaving, removal and deletion all go through definer RPCs.
drop policy if exists gm_update on public.group_members;
drop policy if exists gm_insert on public.group_members;
drop policy if exists gm_delete on public.group_members;
drop policy if exists groups_insert on public.groups;
drop policy if exists groups_delete on public.groups;

-- Defence in depth. SECURITY INVOKER on purpose: inside a definer RPC
-- current_user is the function owner, so the RPCs' own writes pass, while a
-- direct API statement runs as anon/authenticated and is pinned.
create or replace function public.group_members_guard()
returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin
  if current_user in ('anon', 'authenticated') then
    raise exception using errcode = '42501',
      message = 'Group members can only be changed through the app.';
  end if;
  return NEW;
end $$;

create or replace function public.groups_guard()
returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin
  if current_user in ('anon', 'authenticated') then
    NEW.id         := OLD.id;
    NEW.owner_id   := OLD.owner_id;
    NEW.currency   := OLD.currency;
    NEW.created_at := OLD.created_at;
  end if;
  return NEW;
end $$;

revoke execute on function public.group_members_guard() from public, anon, authenticated;
revoke execute on function public.groups_guard() from public, anon, authenticated;

drop trigger if exists trg_group_members_guard on public.group_members;
create trigger trg_group_members_guard before update on public.group_members
  for each row execute function public.group_members_guard();
drop trigger if exists trg_groups_guard on public.groups;
create trigger trg_groups_guard before update on public.groups
  for each row execute function public.groups_guard();

-- ===========================================================================
-- M1 — push subscriptions
-- ===========================================================================
revoke insert, update on public.push_subscriptions from anon, authenticated;

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); cur record;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  -- Browser push services only (Chrome/Edge-Chromium/Opera/Samsung via FCM,
  -- Firefox, Safari, legacy Edge). Keep in step with _shared/push.ts.
  if p_endpoint is null or char_length(p_endpoint) > 1024
     or p_endpoint !~* '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)/' then
    raise exception 'unsupported push endpoint';
  end if;
  if p_p256dh is null or p_auth is null
     or char_length(p_p256dh) > 256 or char_length(p_auth) > 64 then
    raise exception 'invalid push keys';
  end if;

  select * into cur from public.push_subscriptions where endpoint = p_endpoint;
  if cur.id is not null and cur.user_id <> uid then
    -- Another account's endpoint: only whoever holds the subscription's keys
    -- (the same browser, after a sign-in switch) may take it over.
    if cur.p256dh is distinct from p_p256dh or cur.auth is distinct from p_auth then
      return;
    end if;
    delete from public.push_subscriptions where id = cur.id;
  elsif cur.id is not null then
    update public.push_subscriptions set p256dh = p_p256dh, auth = p_auth where id = cur.id;
    return;
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
    values (uid, p_endpoint, p_p256dh, p_auth);
  -- At most 10 devices per account: drop the oldest.
  delete from public.push_subscriptions
   where id in (select id from public.push_subscriptions where user_id = uid
                 order by created_at desc, id offset 10);
end $$;

-- ===========================================================================
-- M2 — join / leave throttling
-- ===========================================================================
-- "Recently left" markers reuse rate_limits: key 'left:<group>:<user>'.
create or replace function public.mark_member_left(p_group uuid, p_user uuid)
returns void language sql security definer
set search_path = public, pg_temp as $$
  insert into public.rate_limits (key, count, window_start)
  values ('left:' || p_group || ':' || p_user, 1, now())
  on conflict (key) do update set count = public.rate_limits.count + 1, window_start = now();
$$;
revoke execute on function public.mark_member_left(uuid, uuid) from public, anon, authenticated;

create or replace function public.join_via_link(p_token text)
returns uuid language plpgsql security definer
set search_path = public, pg_temp as $$
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
  -- Each join notifies (and may email) every member.
  if not public.rate_limit('join:' || uid, 10, 3600) then
    raise exception 'Too many groups joined — please try again later.';
  end if;
  nm := public.member_name_for(uid);
  perform public.claim_or_insert_member(inv.group_id, uid, nm);
  return inv.group_id;
end $$;

create or replace function public.notify_member_joined()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare gname text;
begin
  if NEW.user_id is null then return NEW; end if;
  if TG_OP = 'UPDATE' and OLD.user_id is not distinct from NEW.user_id then
    return NEW;
  end if;
  -- A re-join within an hour of leaving doesn't announce itself again.
  if exists (select 1 from public.rate_limits
             where key = 'left:' || NEW.group_id || ':' || NEW.user_id
               and window_start > now() - interval '1 hour') then
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

create or replace function public.remove_group_member(p_member uuid, p_silent boolean default false)
returns uuid language plpgsql security definer
set search_path = public, pg_temp as $$
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

  -- A loud leave tells the group, at most once per group per hour and 10
  -- times an hour overall (join/leave loops can't email-bomb members).
  if tgt.user_id = uid and not p_silent
     and not exists (select 1 from public.notifications
                     where type = 'member_left' and group_id = tgt.group_id and actor_id = uid
                       and created_at > now() - interval '1 hour')
     and public.rate_limit('leave:' || uid, 10, 3600) then
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

  if tgt.user_id is not null then
    perform public.mark_member_left(tgt.group_id, tgt.user_id);
  end if;

  if not public.member_has_footprint(tgt.group_id, tgt.id) then
    delete from public.group_members where id = tgt.id;
  elsif tgt.user_id is not null then
    update public.group_members
       set user_id = null, former_user_id = tgt.user_id
     where id = tgt.id;
  else
    raise exception 'This person has expense history and can''t be removed individually — delete the group instead.';
  end if;

  return tgt.group_id;
end;
$$;

-- ===========================================================================
-- M4 — invite by email returns a status (the rate-limit increment commits)
-- ===========================================================================
drop function if exists public.invite_user_to_group(uuid, text);
create function public.invite_user_to_group(p_group uuid, p_email text)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); target uuid; inv_id uuid; addr text := lower(btrim(p_email));
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not public.is_group_member(p_group) then raise exception 'not a member of this group'; end if;
  if addr is null or addr = '' or char_length(addr) > 320 then raise exception 'invalid email'; end if;
  -- Counted for every lookup, hit or miss: nothing below raises, so the
  -- increment commits and the account-existence check stays bounded.
  if not public.rate_limit('invite:' || uid, 20, 3600) then
    raise exception 'Too many invites — please slow down.';
  end if;

  select id into target from auth.users where lower(email) = addr limit 1;
  if target is null then
    return jsonb_build_object('status', 'no_account');  -- caller sends a link invite
  end if;
  if exists (select 1 from public.group_members where group_id = p_group and user_id = target) then
    return jsonb_build_object('status', 'already_member');
  end if;
  if exists (select 1 from public.group_invites
             where group_id = p_group and invited_user_id = target
               and accepted_at is null and declined_at is null) then
    return jsonb_build_object('status', 'already_invited');
  end if;

  insert into public.group_invites (group_id, invited_user_id, invited_email, created_by)
    values (p_group, target, addr, uid)
    returning id into inv_id;
  return jsonb_build_object('status', 'invited', 'invite_id', inv_id);
end $$;
revoke execute on function public.invite_user_to_group(uuid, text) from public, anon;
grant execute on function public.invite_user_to_group(uuid, text) to authenticated;

-- ===========================================================================
-- L7 — settlements only between the caller and someone else (or the owner)
-- ===========================================================================
create or replace function public.add_settlement(
  p_group uuid, p_from uuid, p_to uuid, p_amount bigint, p_currency character,
  p_settled_at date default null, p_note text default null)
returns uuid language plpgsql security definer
set search_path = public, pg_temp as $$
declare k text; sid uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not public.is_group_member(p_group) then raise exception 'not a member of this group'; end if;
  -- The owner may record any pair (e.g. between two unlinked members).
  if not public.is_group_owner(p_group) and not exists (
    select 1 from public.group_members
     where group_id = p_group and user_id = auth.uid() and id in (p_from, p_to)) then
    raise exception 'You can only record settlements you are part of.';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive'; end if;
  k := public.app_enc_key();
  insert into public.settlements (group_id, from_member, to_member, amount_enc, currency, settled_at, note_enc)
    values (p_group, p_from, p_to, public.enc_minor(p_amount, k), coalesce(p_currency, 'EUR'),
            coalesce(p_settled_at, current_date), public.enc_text(nullif(btrim(p_note), ''), k))
    returning id into sid;
  return sid;
end $$;

-- ===========================================================================
-- L3 — storage limits and own-storage image URLs
-- ===========================================================================
update storage.buckets
   set file_size_limit = 5 * 1024 * 1024,
       allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']
 where id in ('avatars', 'group-images');

-- Public-bucket URLs are served without any policy; this one only enabled
-- anonymous listing of every group id with a cover image. Owners keep
-- group_images_owner_select (needed for upsert).
drop policy if exists group_images_read on storage.objects;

-- This project's public-object base URL (from Vault project_url, so it stays
-- env-agnostic). The URL itself is public; clients may call it.
create or replace function public.storage_public_base()
returns text language sql stable security definer
set search_path = public, pg_temp as $$
  select rtrim(decrypted_secret, '/') || '/storage/v1/object/public/'
  from vault.decrypted_secrets where name = 'project_url';
$$;
revoke execute on function public.storage_public_base() from public, anon;
grant execute on function public.storage_public_base() to authenticated;

-- A client-set avatar / cover must live in the caller's own folder of this
-- project's bucket (no third-party tracking pixels). Invoker, like the guards
-- above: server-side writers (signup trigger, service role) are unaffected.
create or replace function public.image_url_guard()
returns trigger language plpgsql
set search_path = public, pg_temp as $$
declare v text; old_v text; prefix text;
begin
  if current_user not in ('anon', 'authenticated') then return NEW; end if;
  if TG_TABLE_NAME = 'profiles' then
    v := NEW.avatar_url; old_v := OLD.avatar_url;
    prefix := public.storage_public_base() || 'avatars/' || NEW.id || '/';
  else
    v := NEW.image_url; old_v := OLD.image_url;
    prefix := public.storage_public_base() || 'group-images/' || NEW.id || '/';
  end if;
  if v is null or v is not distinct from old_v then return NEW; end if;
  if prefix is null or left(v, char_length(prefix)) <> prefix
     or v ~ '\.\.' or v ~ '[[:space:]]' then
    raise exception using errcode = '23514', message = 'Images must be uploaded to Budgeer.';
  end if;
  return NEW;
end $$;
revoke execute on function public.image_url_guard() from public, anon, authenticated;

drop trigger if exists trg_profiles_image_url on public.profiles;
create trigger trg_profiles_image_url before update of avatar_url on public.profiles
  for each row execute function public.image_url_guard();
drop trigger if exists trg_groups_image_url on public.groups;
create trigger trg_groups_image_url before update of image_url on public.groups
  for each row execute function public.image_url_guard();

-- ===========================================================================
-- L6 — name limits, fixed invite-email quotas
-- ===========================================================================
alter table public.profiles drop constraint if exists profiles_display_name_check;
alter table public.profiles add constraint profiles_display_name_check
  check (display_name is null or (char_length(display_name) <= 60 and display_name !~ '[[:cntrl:]]'));
alter table public.groups drop constraint if exists groups_name_check;
alter table public.groups add constraint groups_name_check
  check (char_length(name) <= 60 and name !~ '[[:cntrl:]]');
alter table public.group_members drop constraint if exists group_members_display_name_check;
alter table public.group_members add constraint group_members_display_name_check
  check (display_name is null or (char_length(display_name) <= 60 and display_name !~ '[[:cntrl:]]'));

-- Signup copies the provider's name: trim it into the new limit.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    left(btrim(regexp_replace(coalesce(new.raw_user_meta_data->>'full_name',
                                       new.raw_user_meta_data->>'name',
                                       split_part(new.email, '@', 1)),
                              '[[:cntrl:]]', ' ', 'g')), 60),
    coalesce(new.raw_user_meta_data->>'avatar_url',
             new.raw_user_meta_data->>'picture')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.consume_quota(p_scope text)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); lim int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  lim := case p_scope
    when 'report'       then 30   -- generate-report
    when 'group-report' then 30   -- group-report
    when 'send-invite'  then 10   -- send-invite
  end;
  if lim is null then raise exception 'unknown quota scope'; end if;
  return public.rate_limit(p_scope || ':' || uid, lim, 3600);
end $$;

-- send-invite: any one address gets at most 3 invite emails a day, whoever
-- sends them. Keyed on a hash so rate_limits holds no plaintext address.
create or replace function public.consume_invite_recipient_quota(p_email text)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_email is null or btrim(p_email) = '' then raise exception 'invalid email'; end if;
  return public.rate_limit('invite-to:' || md5(lower(btrim(p_email))), 3, 86400);
end $$;
revoke execute on function public.consume_invite_recipient_quota(text) from public, anon;
grant execute on function public.consume_invite_recipient_quota(text) to authenticated;

-- ===========================================================================
-- Zero-decimal currencies in budget alerts and the weekly digest
-- ===========================================================================
create or replace function public.notify_budget_threshold()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare g record; k text; cap bigint; spent_after bigint; spent_new bigint; spent_before bigint;
begin
  for g in
    select n.user_id, n.category_id, b.period_start, b.amount_enc as cap_enc,
           coalesce(c.name, 'A category') as cat_name,
           coalesce(p.base_currency, 'EUR') as base, array_agg(n.id) as new_ids
    from new_rows n
    join public.budgets b on b.user_id = n.user_id and b.category_id = n.category_id
                         and b.period_start = date_trunc('month', n.spent_at)::date
    left join public.categories c on c.id = n.category_id and c.user_id = n.user_id
    left join public.profiles p on p.id = n.user_id
    where n.kind = 'expense' and n.category_id is not null
    group by n.user_id, n.category_id, b.period_start, b.amount_enc, c.name, p.base_currency
  loop
    k := coalesce(k, public.app_enc_key());
    cap := public.dec_minor(g.cap_enc, k);
    continue when cap is null or cap <= 0;

    -- Every row of the category-month is decrypted exactly once, and converted
    -- to the base currency's minor units (the cap's unit).
    select coalesce(sum(s.v), 0), coalesce(sum(s.v) filter (where s.id = any(g.new_ids)), 0)
      into spent_after, spent_new
      from (select t.id, public.to_base_minor(public.dec_minor(t.amount_enc, k), t.exchange_rate,
                                              t.currency, g.base) as v
              from public.transactions t
             where t.user_id = g.user_id and t.category_id = g.category_id and t.kind = 'expense'
               and t.spent_at >= g.period_start
               and t.spent_at < (g.period_start + interval '1 month')::date) s;
    spent_before := spent_after - spent_new;

    if spent_before < cap and spent_after >= cap then
      insert into public.notifications (user_id, type, title, body)
      values (g.user_id, 'budget', 'Budget exceeded', g.cat_name || ' has passed its monthly budget.');
    elsif spent_before < round(cap * 0.8) and spent_after >= round(cap * 0.8) then
      insert into public.notifications (user_id, type, title, body)
      values (g.user_id, 'budget', 'Budget almost used', g.cat_name || ' is nearly at its monthly budget.');
    end if;
  end loop;
  return null;
end $$;

create or replace function public.send_weekly_digests()
returns integer language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  u record; k text; cnt int; top_name text; n int := 0;
begin
  k := public.app_enc_key();
  for u in
    select t.user_id, coalesce(max(p.base_currency), 'EUR') as base
      from public.transactions t
      left join public.profiles p on p.id = t.user_id
     where t.kind = 'expense' and t.spent_at >= current_date - 6
     group by t.user_id
  loop
    select count(*) into cnt
      from public.transactions
     where user_id = u.user_id and kind = 'expense' and spent_at >= current_date - 6;
    select coalesce(c.name, 'Uncategorized') into top_name
      from public.transactions t
      left join public.categories c on c.id = t.category_id and c.user_id = t.user_id
     where t.user_id = u.user_id and t.kind = 'expense' and t.spent_at >= current_date - 6
     group by 1
     order by sum(public.to_base_minor(public.dec_minor(t.amount_enc, k), t.exchange_rate,
                                       t.currency, u.base)) desc
     limit 1;

    insert into public.notifications (user_id, type, title, body)
    values (u.user_id, 'digest', 'Your week in money',
      cnt || ' expense' || case when cnt = 1 then '' else 's' end
      || ' this week · top category: ' || top_name || '. Open Budgeer to see your totals.');
    n := n + 1;
  end loop;
  return n;
end $$;

-- ===========================================================================
-- F9 — dead / over-exposed RPCs
-- ===========================================================================
drop function if exists public.shares_group(uuid);
drop function if exists public.create_group_expense(uuid, text, bigint, char, uuid, date, uuid[]);
drop function if exists public.update_group_expense(uuid, text, bigint, char, uuid, date, uuid[]);
-- Still used inside definer RPCs; no client needs another user's name by id.
revoke execute on function public.member_name_for(uuid) from public, anon, authenticated;

-- ===========================================================================
-- F10 — table privileges
-- ===========================================================================
-- anon reaches nothing but the group_preview RPC.
revoke all on all tables in schema public from anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;
-- Privileges no API client ever needs (TRUNCATE also bypasses RLS).
revoke truncate, references, trigger, maintain on all tables in schema public from authenticated;
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger, maintain on tables from authenticated;
-- rate_limits is definer-only.
revoke all on public.rate_limits from authenticated;

-- ===========================================================================
-- F11 — indexes and per-statement auth.uid()
-- ===========================================================================
create index if not exists category_rules_category_idx on public.category_rules (category_id);
create index if not exists group_comments_author_idx on public.group_comments (author_id);
create index if not exists group_comments_author_member_idx on public.group_comments (author_member_id);
-- Prefixes of unique indexes on the same leading column.
drop index if exists public.categories_user_idx;
drop index if exists public.expense_splits_expense_idx;

drop policy if exists cr_select on public.category_rules;
drop policy if exists cr_insert on public.category_rules;
drop policy if exists cr_update on public.category_rules;
drop policy if exists cr_delete on public.category_rules;
create policy cr_select on public.category_rules for select to authenticated
  using ((select auth.uid()) = user_id);
create policy cr_insert on public.category_rules for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy cr_update on public.category_rules for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy cr_delete on public.category_rules for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists ps_select on public.push_subscriptions;
drop policy if exists ps_delete on public.push_subscriptions;
create policy ps_select on public.push_subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy ps_delete on public.push_subscriptions for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists gc_delete on public.group_comments;
create policy gc_delete on public.group_comments for delete to authenticated
  using (author_id = (select auth.uid()) or public.is_group_owner(group_id));

-- ===========================================================================
-- F14 — retention for rate_limits and cron run logs
-- ===========================================================================
create or replace function public.purge_stale_rate_limits()
returns integer language plpgsql security definer
set search_path = public, pg_temp as $$
declare n int;
begin
  -- The longest window in use is a day (invite-to:); keep two for margin.
  delete from public.rate_limits where window_start < now() - interval '2 days';
  get diagnostics n = row_count;
  delete from cron.job_run_details where end_time < now() - interval '30 days';
  return n;
end $$;
revoke execute on function public.purge_stale_rate_limits() from public, anon, authenticated;

select cron.unschedule('purge-rate-limits')
  where exists (select 1 from cron.job where jobname = 'purge-rate-limits');
select cron.schedule('purge-rate-limits', '45 3 * * *',
  $cron$select public.purge_stale_rate_limits();$cron$);
