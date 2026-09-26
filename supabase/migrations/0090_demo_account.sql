-- 0090: a shared demo account for the TEST site (dev.budgeer.com).
--
-- The owner hands one login (demo@budgeer.com) to friends and testers, so
-- anyone holding it can sign in. Everything here is about making that safe:
-- a visitor can try every feature on believable, fake data, but can't reach
-- a real person or the outside world through the account, can't lock the
-- next visitor out, and whatever they change is put back every night.
--
-- Nothing in this file creates an account or data. On a project where no one
-- has been registered as a demo account (PROD) every piece below is inert:
-- the guards find no demo profile and the nightly reset loops over nothing.
--
--   1. profiles.is_demo (default false) marks a demo account. Server-only:
--      profiles UPDATE is column-granted (0053 and later) and this column is
--      left out, exactly like is_developer (0075); there is no client INSERT
--      path. The app reads it (own-row select) to hide what the demo can't do.
--   2. demo_accounts: which users are demo accounts ('main' = the shared
--      login, 'friend' = the fake group members), and what the reset puts
--      back: the email, the display name and, for the main login, the bcrypt
--      HASH of the shared password (never the password). RLS on, no policies,
--      no grants: no client role can read or write it.
--   3. Refusals, all with one message the app shows as is ("That isn’t
--      available on the demo account."): refuse_if_demo(uid) is called by
--        invite_user_to_group   (emails people; also refused when the person
--                                invited is a demo account)
--        join_via_link, respond_to_invite (accept)
--                               (a demo account never shares a group with a
--                                real person, so no group activity of theirs
--                                can notify or email anyone real)
--        nudge_member           (a push/email to someone else)
--        save_push_subscription (pushes to a shared login would reach every
--                                visitor's device; it would also take the
--                                subscription over from the visitor's own
--                                account on that browser)
--      and by three guard triggers:
--        group_invites BEFORE INSERT  (share links: made by direct insert)
--        profiles BEFORE UPDATE OF notify_email/notify_push/notify_digest
--                                     (turning any of them on; off is fine)
--        profiles BEFORE DELETE       (a deleted profile would drop the flag)
--      Uploads (avatars, group pictures: public buckets) are refused by two
--      restrictive storage policies, so nothing a visitor uploads is hosted.
--   4. Emails that don't go through those paths skip demo accounts:
--      enqueue_privacy_email (data-export and consent-change notices),
--      legal_update_recipients (policy-change notices) and inactive_accounts
--      (the inactivity warning and deletion — the fake friends never sign in).
--   5. Password, email and phone changes go through Supabase Auth, not SQL.
--      demo_auth_guard (BEFORE UPDATE on auth.users) keeps those columns as
--      they were when anyone but the database owner changes them for a demo
--      account, so a visitor can't take the login away from the next one. The
--      app hides those controls too, and the reset restores them regardless.
--   6. reset_demo_accounts() (pg_cron, daily 03:00 UTC) wipes each demo
--      account's data and the demo group, then re-seeds them through the same
--      encrypting RPCs the app uses (signed in as the demo user for the
--      duration), with dates relative to current_date; restores the profile,
--      email and password hash; clears payment details, avatar, push devices,
--      passkeys and MFA factors, linked identities and rate limits; and signs
--      out every session. The first seed is simply its first run.
--   7. register_demo_account(email, name, role, hash) creates a demo sign-in
--      (confirmed email, legal documents accepted) or re-registers one. It
--      refuses an address that already belongs to a non-demo account, so a
--      real account can never be turned into one the reset wipes. Friends get
--      a random, discarded password and a ban, so nobody can sign in as them.
--
-- Every function here pins its search_path and is revoked from
-- anon/authenticated, except caller_is_demo() (the storage policies need it;
-- it answers only for the caller). All are SECURITY DEFINER but
-- profiles_demo_guard, which must see the writer's own role.

-- 1 ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists is_demo boolean not null default false;

-- Belt and braces: make the absence of any client write grant explicit.
revoke insert (is_demo), update (is_demo) on public.profiles from anon, authenticated;

-- 2 ---------------------------------------------------------------------------
create table if not exists public.demo_accounts (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  role          text not null check (role in ('main', 'friend')),
  email         text not null,
  display_name  text not null check (char_length(display_name) between 1 and 60),
  password_hash text null check (password_hash is null or password_hash ~ '^\$2[aby]\$'),
  created_at    timestamptz not null default now()
);
alter table public.demo_accounts enable row level security;
revoke all on public.demo_accounts from public, anon, authenticated;

-- Is this user a demo account? Either record counts, so deleting one can't
-- turn the guards off.
create or replace function public.is_demo_user(p_uid uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select p_uid is not null and (
    exists (select 1 from public.profiles p where p.id = p_uid and p.is_demo)
    or exists (select 1 from public.demo_accounts d where d.user_id = p_uid))
$$;
revoke execute on function public.is_demo_user(uuid) from public, anon, authenticated;

-- The caller's own answer, for the storage policies (they run as the caller).
create or replace function public.caller_is_demo()
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select public.is_demo_user(auth.uid())
$$;
revoke execute on function public.caller_is_demo() from public, anon, authenticated;
grant execute on function public.caller_is_demo() to authenticated;

-- 3 ---------------------------------------------------------------------------
create or replace function public.refuse_if_demo(p_uid uuid)
returns void language plpgsql stable security definer
set search_path = public, pg_temp as $$
begin
  if public.is_demo_user(p_uid) then
    raise exception 'That isn’t available on the demo account.';
  end if;
end $$;
revoke execute on function public.refuse_if_demo(uuid) from public, anon, authenticated;

-- As 0058, plus: the demo can't invite, and nobody can invite a demo account
-- (its invites would show the inviter's name and group to every visitor).
create or replace function public.invite_user_to_group(p_group uuid, p_email text)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); target uuid; inv_id uuid; addr text := lower(btrim(p_email));
begin
  if uid is null then raise exception 'not authenticated'; end if;
  perform public.refuse_if_demo(uid);
  if not public.is_group_member(p_group) then raise exception 'not a member of this group'; end if;
  if addr is null or addr = '' or char_length(addr) > 320 then raise exception 'invalid email'; end if;
  -- Counted for every lookup, hit or miss: nothing below raises (but the
  -- demo refusal, which only says what the app already shows), so the
  -- increment commits and the account-existence check stays bounded.
  if not public.rate_limit('invite:' || uid, 20, 3600) then
    raise exception 'Too many invites — please slow down.';
  end if;

  select id into target from auth.users where lower(email) = addr limit 1;
  if target is null then
    return jsonb_build_object('status', 'no_account');  -- caller sends a link invite
  end if;
  perform public.refuse_if_demo(target);
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

-- As 0058, plus: a demo account can't join a group through a link.
create or replace function public.join_via_link(p_token text)
returns uuid language plpgsql security definer
set search_path = public, pg_temp as $$
declare inv record; uid uuid := auth.uid(); nm text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  perform public.refuse_if_demo(uid);
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
revoke execute on function public.join_via_link(text) from public, anon;
grant execute on function public.join_via_link(text) to authenticated;

-- As 0038 (search_path now also pins pg_temp), plus: a demo account can
-- decline an invite but not accept one.
create or replace function public.respond_to_invite(p_invite uuid, p_accept boolean)
returns uuid language plpgsql security definer
set search_path = public, pg_temp as $$
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
  perform public.refuse_if_demo(uid);
  if not exists (select 1 from public.group_members
                 where group_id = inv.group_id and user_id = uid) then
    nm := public.member_name_for(uid);
    perform public.claim_or_insert_member(inv.group_id, uid, nm);
  end if;
  update public.group_invites set accepted_by = uid, accepted_at = now() where id = inv.id;
  return inv.group_id;
end $$;
revoke execute on function public.respond_to_invite(uuid, boolean) from public, anon;
grant execute on function public.respond_to_invite(uuid, boolean) to authenticated;

-- As 0039 (search_path now also pins pg_temp), plus: the demo can't nudge.
create or replace function public.nudge_member(p_group uuid, p_member uuid)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  me record; tgt record; gname text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  perform public.refuse_if_demo(uid);
  select * into me from public.group_members where group_id = p_group and user_id = uid;
  if me is null then raise exception 'not a member of this group'; end if;
  select * into tgt from public.group_members where id = p_member and group_id = p_group;
  if tgt is null or tgt.user_id is null then raise exception 'member not found'; end if;
  if tgt.user_id = uid then raise exception 'cannot nudge yourself'; end if;
  if not public.rate_limit('nudge:' || uid || ':' || p_member, 2, 86400) then
    raise exception 'You''ve already reminded them today.';
  end if;
  select name into gname from public.groups where id = p_group;
  insert into public.notifications (user_id, type, title, body, group_id, actor_id)
  values (tgt.user_id, 'nudge', 'Friendly reminder',
    coalesce(me.display_name, 'A group member') || ' nudged you to settle up in “'
    || coalesce(gname, 'a group') || '”.', p_group, uid);
end $$;
revoke execute on function public.nudge_member(uuid, uuid) from public, anon;
grant execute on function public.nudge_member(uuid, uuid) to authenticated;

-- As 0058, plus: the demo registers no push devices (refused before the
-- takeover below could move a visitor's own subscription to the demo).
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); cur record;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  perform public.refuse_if_demo(uid);
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
revoke execute on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

-- Share links are made by a direct insert (RLS gi_insert, 0051). Runs after
-- trg_group_invite_guard (alphabetical), which has forced created_by.
create or replace function public.group_invites_demo_guard()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  perform public.refuse_if_demo(NEW.created_by);
  perform public.refuse_if_demo(NEW.invited_user_id);
  return NEW;
end $$;
revoke execute on function public.group_invites_demo_guard() from public, anon, authenticated;
drop trigger if exists trg_group_invites_demo on public.group_invites;
create trigger trg_group_invites_demo before insert on public.group_invites
  for each row execute function public.group_invites_demo_guard();

-- The demo's message switches stay off (turning one off is always fine), and
-- its profile row can't be deleted by the client. SECURITY INVOKER, like the
-- other guards that ask who is writing (image_url_guard, consents_guard): in
-- a definer function current_user would always be the owner.
create or replace function public.profiles_demo_guard()
returns trigger language plpgsql security invoker
set search_path = public, pg_temp as $$
begin
  if current_user not in ('anon', 'authenticated') or not OLD.is_demo then
    return case when TG_OP = 'DELETE' then OLD else NEW end;
  end if;
  if TG_OP = 'DELETE'
     or (NEW.notify_email is true and OLD.notify_email is not true)
     or (NEW.notify_push is true and OLD.notify_push is not true)
     or (NEW.notify_digest is true and OLD.notify_digest is not true) then
    raise exception 'That isn’t available on the demo account.';
  end if;
  return NEW;
end $$;
revoke execute on function public.profiles_demo_guard() from public, anon, authenticated;
drop trigger if exists trg_profiles_demo_guard on public.profiles;
create trigger trg_profiles_demo_guard
  before update of notify_email, notify_push, notify_digest or delete on public.profiles
  for each row execute function public.profiles_demo_guard();

-- Uploads land in public buckets (avatars, group-images): refuse them for
-- the demo, whatever the bucket. Restrictive, so they narrow every existing
-- permissive policy instead of adding to it.
drop policy if exists demo_no_uploads_insert on storage.objects;
create policy demo_no_uploads_insert on storage.objects
  as restrictive for insert to authenticated
  with check (not public.caller_is_demo());
drop policy if exists demo_no_uploads_update on storage.objects;
create policy demo_no_uploads_update on storage.objects
  as restrictive for update to authenticated
  using (not public.caller_is_demo())
  with check (not public.caller_is_demo());

-- 4 ---------------------------------------------------------------------------
-- As 0076, plus: nothing is queued for a demo account (its address is a
-- shared placeholder, and a visitor's export shouldn't send mail).
create or replace function public.enqueue_privacy_email(p_user uuid, p_kind text)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare delay interval; win interval;
begin
  case p_kind
    when 'consent_change' then delay := interval '15 minutes'; win := interval '15 minutes';
    when 'data_export'    then delay := interval '0';          win := interval '1 hour';
    else raise exception 'unknown privacy email kind %', p_kind;
  end case;
  if public.is_demo_user(p_user) then return; end if;
  insert into public.privacy_email_queue as q (user_id, kind, due_at, last_event_at, pending_events)
  values (p_user, p_kind, now() + delay, now(), 1)
  on conflict (user_id, kind) do update set
    last_event_at  = now(),
    pending_events = q.pending_events + 1,
    attempts       = case when q.due_at is null then 0 else q.attempts end,
    -- Already pending: keep its time (the burst is coalesced into it).
    due_at         = coalesce(q.due_at, greatest(now() + delay, coalesce(q.last_sent_at + win, now())));
end $$;
revoke execute on function public.enqueue_privacy_email(uuid, text) from public, anon, authenticated;

-- As 0076, plus: demo accounts get no policy-change emails (the reset
-- accepts the current versions for them every night).
create or replace function public.legal_update_recipients(p_limit int)
returns table (user_id uuid, email text, privacy_changed boolean, terms_changed boolean,
               privacy_version text, terms_version text)
language sql stable security definer
set search_path = public, pg_temp as $$
  with v as (
    select cv->>'privacy' as privacy, cv->>'terms' as terms,
           greatest(cv->>'privacy', cv->>'terms')::date as effective
      from (select public.current_legal_versions() as cv) x
  ), acc as (
    select u.id, u.email::text as email, u.created_at,
      (select c.version from public.consents c
        where c.user_id = u.id and c.purpose = 'privacy_notice' and c.granted
        order by c.created_at desc, c.id limit 1) as privacy,
      (select c.version from public.consents c
        where c.user_id = u.id and c.purpose = 'terms' and c.granted
        order by c.created_at desc, c.id limit 1) as terms
      from auth.users u
     where not public.is_demo_user(u.id)
  )
  select a.id, a.email, a.privacy is distinct from v.privacy, a.terms is distinct from v.terms,
         v.privacy, v.terms
    from acc a cross join v
    left join public.legal_update_notices n on n.user_id = a.id
   where a.email is not null
     and a.created_at < v.effective
     and (a.privacy is distinct from v.privacy or a.terms is distinct from v.terms)
     and (n.user_id is null
          or n.privacy_version is distinct from v.privacy
          or n.terms_version is distinct from v.terms)
   order by a.created_at, a.id
   limit greatest(p_limit, 0)
$$;
revoke execute on function public.legal_update_recipients(int) from public, anon, authenticated;
grant execute on function public.legal_update_recipients(int) to service_role;

-- As 0073, plus: demo accounts are never warned or deleted for inactivity
-- (the fake friends never sign in; the reset keeps them all).
create or replace function public.inactive_accounts()
returns table (user_id uuid, email text, last_active timestamptz, warned_at timestamptz, action text)
language sql stable security definer
set search_path = public, pg_temp as $$
  select a.user_id, a.email, a.last_active, n.warned_at,
         case when n.warned_at >= a.last_active then 'delete' else 'warn' end
    from public.inactive_account_activity() a
    left join public.inactivity_notices n on n.user_id = a.user_id
   where not public.is_demo_user(a.user_id)
     and ((a.last_active < now() - interval '23 months'
           and (n.warned_at is null or n.warned_at < a.last_active))
       or (a.last_active < now() - interval '24 months'
           and n.warned_at >= a.last_active
           and n.warned_at <= now() - interval '28 days'))
$$;
revoke execute on function public.inactive_accounts() from public, anon, authenticated;
grant execute on function public.inactive_accounts() to service_role;

-- 5 ---------------------------------------------------------------------------
-- Supabase Auth (its own database role) can't change a demo account's
-- password, email or phone: the old values are kept, silently, so a visitor
-- who "changes the password" can't lock the next one out. The database owner
-- (the nightly reset, an operator in the SQL editor) is not held back.
create or replace function public.demo_auth_guard()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if session_user not in ('postgres', 'supabase_admin') and public.is_demo_user(OLD.id) then
    NEW.encrypted_password := OLD.encrypted_password;
    NEW.email := OLD.email;
    NEW.email_change := OLD.email_change;
    NEW.phone := OLD.phone;
    NEW.phone_change := OLD.phone_change;
  end if;
  return NEW;
end $$;
revoke execute on function public.demo_auth_guard() from public, anon, authenticated;
drop trigger if exists on_auth_user_demo_guard on auth.users;
create trigger on_auth_user_demo_guard
  before update of encrypted_password, email, email_change, phone, phone_change on auth.users
  for each row execute function public.demo_auth_guard();

-- 6 ---------------------------------------------------------------------------
-- A day of the month `p_months_ago` months back, clamped to that month's
-- length. In the current month the days are squeezed into the ones already
-- gone, so nothing is dated in the future and the month is never empty.
create or replace function public.demo_day(p_months_ago int, p_day int)
returns date language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare m date := (date_trunc('month', current_date) - make_interval(months => p_months_ago))::date;
        len int := extract(day from (m + interval '1 month - 1 day'))::int;
        d int := least(greatest(p_day, 1), len);
begin
  if p_months_ago = 0 then
    return m + ((d - 1) * extract(day from current_date)::int / len);
  end if;
  return m + (d - 1);
end $$;
revoke execute on function public.demo_day(int, int) from public, anon, authenticated;

-- The next time a monthly entry on day `p_day` (1–28) falls due, after today.
create or replace function public.demo_next_run(p_day int)
returns date language sql stable security definer
set search_path = public, pg_temp as $$
  select case when extract(day from current_date)::int < p_day
              then date_trunc('month', current_date)::date + (p_day - 1)
              else (date_trunc('month', current_date) + interval '1 month')::date + (p_day - 1) end
$$;
revoke execute on function public.demo_next_run(int) from public, anon, authenticated;

-- Everything a demo account owns (and the groups it owns), gone. Group
-- deletion cascades to members, expenses, splits (and their personal
-- mirrors), settlements, comments, audit entries, invites and notifications.
create or replace function public.demo_wipe(p_ids uuid[])
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  delete from public.notifications where user_id = any(p_ids);
  delete from public.groups where owner_id = any(p_ids);
  delete from public.group_invites where created_by = any(p_ids) or invited_user_id = any(p_ids);
  update public.profiles set salary_category_id = null where id = any(p_ids);
  delete from public.transactions where user_id = any(p_ids);
  delete from public.recurring_rules where user_id = any(p_ids);
  delete from public.budgets where user_id = any(p_ids);
  delete from public.category_rules where user_id = any(p_ids);
  delete from public.accounts where user_id = any(p_ids);
  delete from public.savings_goals where user_id = any(p_ids);
  delete from public.categories where user_id = any(p_ids);
  delete from public.push_subscriptions where user_id = any(p_ids);
  delete from public.consents where user_id = any(p_ids);
  delete from public.privacy_email_queue where user_id = any(p_ids);
  delete from public.inactivity_notices where user_id = any(p_ids);
  delete from public.legal_update_notices where user_id = any(p_ids);
  delete from public.rate_limits r
   where exists (select 1 from unnest(p_ids) i where position(i::text in r.key) > 0);
end $$;
revoke execute on function public.demo_wipe(uuid[]) from public, anon, authenticated;

-- The sign-in and profile as registered: email, password hash (main login),
-- display name and settings; no payment details, avatar, linked identities,
-- passkeys, MFA factors, pending tokens or sessions.
create or replace function public.demo_restore_account(p_user uuid)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare d public.demo_accounts;
begin
  select * into d from public.demo_accounts where user_id = p_user;
  update auth.users set
    email = d.email,
    encrypted_password = coalesce(d.password_hash, encrypted_password),
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    email_change = '', email_change_token_new = '', email_change_token_current = '',
    email_change_confirm_status = 0, confirmation_token = '', recovery_token = '',
    reauthentication_token = '', phone = null, phone_change = '', phone_change_token = '',
    banned_until = case when d.role = 'friend' then now() + interval '100 years' end,
    updated_at = now()
  where id = p_user;
  delete from auth.identities where user_id = p_user and provider <> 'email';
  update auth.identities
     set identity_data = identity_data || jsonb_build_object('email', d.email)
   where user_id = p_user and provider = 'email';
  delete from auth.sessions where user_id = p_user;
  delete from auth.refresh_tokens where user_id = p_user::text;
  delete from auth.mfa_factors where user_id = p_user;
  delete from auth.webauthn_credentials where user_id = p_user;
  delete from auth.one_time_tokens where user_id = p_user;

  insert into public.profiles (id, display_name) values (p_user, d.display_name)
    on conflict (id) do nothing;
  -- is_demo first, on its own: the switches below then log their consent
  -- change without queueing an email (enqueue_privacy_email skips demos).
  update public.profiles set is_demo = true where id = p_user;
  update public.profiles set
    display_name = d.display_name, avatar_url = null, base_currency = 'EUR',
    notify_email = false, notify_push = false, notify_digest = false,
    onboarded_at = now(), tour_done = true, whats_new_seen = null,
    passkey_reminder_off = true, yearly_separate = false, is_developer = false,
    salary_shift_from_day = null, salary_category_id = null,
    payment_iban_enc = null, payment_revolut_enc = null, payment_paypal_enc = null
  where id = p_user;
end $$;
revoke execute on function public.demo_restore_account(uuid) from public, anon, authenticated;

-- The demo data, written through the app's own encrypting RPCs while signed
-- in as the demo user (request.jwt.claims, restored by the caller).
create or replace function public.demo_seed(p_user uuid, p_friends uuid[])
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  m0 date := date_trunc('month', current_date)::date;
  today int := extract(day from current_date)::int;
  cat jsonb; batch jsonb; yearly_uuid uuid := gen_random_uuid(); yearly_on date;
  gid uuid; me uuid; f1 uuid; f2 uuid; f3 uuid; members uuid[];
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);

  perform public.accept_legal_documents();
  perform public.seed_default_categories();
  select jsonb_object_agg(name || ':' || kind::text, id) into cat
    from public.categories where user_id = p_user;

  -- Monthly spending, this month and the three before. Amounts that vary in
  -- real life move a little from month to month.
  select jsonb_agg(jsonb_build_object(
           'kind', 'expense', 'category_id', cat->>(t.c || ':expense'), 'currency', 'EUR',
           'amount_minor', case when t.vary then t.amt * (90 + (i * 7 + t.d * 3) % 21) / 100 else t.amt end,
           'description', t.descr, 'spent_at', public.demo_day(i, t.d)))
    into batch
    from generate_series(0, 3) i
    cross join (values
      ('Housing', 'Rent', 1, 115000, false),
      ('Transport', 'Monthly transit pass', 2, 4900, false),
      ('Groceries', 'Lidl', 3, 5840, true),
      ('Health', 'Gym membership', 4, 3990, false),
      ('Utilities', 'Electricity', 5, 6480, true),
      ('Food & Dining', 'Lunch with colleagues', 6, 1850, true),
      ('Utilities', 'Internet & phone', 8, 3999, false),
      ('Entertainment', 'Spotify', 9, 1099, false),
      ('Groceries', 'Farmers'' market', 10, 3215, true),
      ('Shopping', 'Books', 11, 2450, true),
      ('Food & Dining', 'Pizza night', 13, 3200, true),
      ('Transport', 'Fuel', 15, 5520, true),
      ('Groceries', 'Albert Heijn', 17, 7390, true),
      ('Health', 'Pharmacy', 19, 1275, true),
      ('Food & Dining', 'Coffee & pastry', 21, 640, true),
      ('Entertainment', 'Cinema', 22, 2400, true),
      ('Groceries', 'Lidl', 24, 6625, true),
      ('Food & Dining', 'Sushi dinner', 26, 4760, true)
    ) as t(c, descr, d, amt, vary);
  perform public.save_transactions(batch);

  -- One-offs: a laptop paid from savings, a course paid in dollars, a bonus,
  -- a friend paying back, savings set aside every month, and interest.
  perform public.save_transactions(jsonb_build_array(
    jsonb_build_object('kind', 'expense', 'category_id', cat->>'Shopping:expense', 'amount_minor', 119900,
      'currency', 'EUR', 'description', 'New laptop', 'spent_at', public.demo_day(2, 14),
      'paid_from_savings', true),
    jsonb_build_object('kind', 'expense', 'category_id', cat->>'Shopping:expense', 'amount_minor', 8999,
      'currency', 'EUR', 'description', 'Running shoes', 'spent_at', public.demo_day(1, 12)),
    jsonb_build_object('kind', 'expense', 'category_id', cat->>'Health:expense', 'amount_minor', 6500,
      'currency', 'EUR', 'description', 'Dentist', 'spent_at', public.demo_day(3, 16)),
    jsonb_build_object('kind', 'expense', 'category_id', cat->>'Other:expense', 'amount_minor', 4900,
      'currency', 'USD', 'exchange_rate', 0.92, 'description', 'Online photography course',
      'spent_at', public.demo_day(1, 7)),
    jsonb_build_object('kind', 'expense', 'category_id', cat->>'Entertainment:expense', 'amount_minor', 5500,
      'currency', 'EUR', 'description', 'Concert tickets', 'spent_at', public.demo_day(0, 3)),
    jsonb_build_object('kind', 'income', 'category_id', cat->>'Bonus:income', 'amount_minor', 50000,
      'currency', 'EUR', 'description', 'Quarterly bonus', 'spent_at', public.demo_day(2, 15)),
    jsonb_build_object('kind', 'income', 'category_id', cat->>'Friends & family:income', 'amount_minor', 4000,
      'currency', 'EUR', 'description', 'Sam paid me back for the concert', 'spent_at', public.demo_day(1, 20)),
    jsonb_build_object('kind', 'income', 'category_id', cat->>'Savings:income', 'amount_minor', 1245,
      'currency', 'EUR', 'description', 'Savings interest', 'spent_at', public.demo_day(1, 27))));

  -- Salary on the 28th (counted toward the next month: the salary shift is
  -- on from the 25th) and a monthly transfer to savings on the 1st.
  select jsonb_agg(x) into batch from (
    select jsonb_build_object('kind', 'income', 'category_id', cat->>'Salary:income', 'amount_minor', 325000,
             'currency', 'EUR', 'description', 'Salary', 'spent_at', (m0 - make_interval(months => i))::date + 27) as x
      from generate_series(0, 3) i where i > 0 or today >= 28
    union all
    select jsonb_build_object('kind', 'income', 'category_id', cat->>'Savings:income', 'amount_minor', 30000,
             'currency', 'EUR', 'description', 'Monthly transfer to savings', 'savings_from_income', true,
             'spent_at', (m0 - make_interval(months => i))::date)
      from generate_series(0, 3) i) s;
  perform public.save_transactions(batch);

  update public.profiles set salary_shift_from_day = 25, salary_category_id = (cat->>'Salary:income')::uuid
   where id = p_user;

  -- Recurring entries, including a yearly plan made from one of its entries
  -- (so the entry is spread over the year like the app does it).
  yearly_on := public.demo_day(2, 18);
  perform public.save_transactions(jsonb_build_array(jsonb_build_object(
    'client_uuid', yearly_uuid, 'kind', 'expense', 'category_id', cat->>'Utilities:expense',
    'amount_minor', 9999, 'currency', 'EUR', 'description', 'Cloud storage (yearly plan)',
    'spent_at', yearly_on)));
  perform public.save_recurring_rule(null, jsonb_build_object(
    'kind', 'expense', 'category_id', cat->>'Utilities:expense', 'amount_minor', 9999, 'currency', 'EUR',
    'description', 'Cloud storage (yearly plan)', 'frequency', 'yearly', 'interval_n', 1,
    'next_run', (yearly_on + interval '1 year')::date, 'remind_days_before', 7,
    'source_client_uuid', yearly_uuid));
  perform public.save_recurring_rule(null, jsonb_build_object(
    'kind', 'expense', 'category_id', cat->>'Housing:expense', 'amount_minor', 115000, 'currency', 'EUR',
    'description', 'Rent', 'frequency', 'monthly', 'next_run', public.demo_next_run(1)));
  perform public.save_recurring_rule(null, jsonb_build_object(
    'kind', 'expense', 'category_id', cat->>'Entertainment:expense', 'amount_minor', 1099, 'currency', 'EUR',
    'description', 'Spotify', 'frequency', 'monthly', 'next_run', public.demo_next_run(9)));
  perform public.save_recurring_rule(null, jsonb_build_object(
    'kind', 'expense', 'category_id', cat->>'Health:expense', 'amount_minor', 3990, 'currency', 'EUR',
    'description', 'Gym membership', 'frequency', 'monthly', 'next_run', public.demo_next_run(4)));
  perform public.save_recurring_rule(null, jsonb_build_object(
    'kind', 'income', 'category_id', cat->>'Salary:income', 'amount_minor', 325000, 'currency', 'EUR',
    'description', 'Salary', 'frequency', 'monthly', 'next_run', public.demo_next_run(28)));
  perform public.save_recurring_rule(null, jsonb_build_object(
    'kind', 'income', 'category_id', cat->>'Savings:income', 'amount_minor', 30000, 'currency', 'EUR',
    'description', 'Monthly transfer to savings', 'frequency', 'monthly', 'savings_from_income', true,
    'next_run', public.demo_next_run(1)));

  -- This month's budgets, partly used by the entries above.
  perform public.save_budget((cat->>'Groceries:expense')::uuid, 30000, 'EUR', m0);
  perform public.save_budget((cat->>'Food & Dining:expense')::uuid, 18000, 'EUR', m0);
  perform public.save_budget((cat->>'Transport:expense')::uuid, 12000, 'EUR', m0);
  perform public.save_budget((cat->>'Entertainment:expense')::uuid, 6000, 'EUR', m0);
  perform public.save_budget((cat->>'Shopping:expense')::uuid, 15000, 'EUR', m0);

  -- Net worth and goals.
  perform public.save_account(null, 'Checking account', 'asset', 248000, 'EUR');
  perform public.save_account(null, 'Savings account', 'asset', 820000, 'EUR');
  perform public.save_account(null, 'Credit card', 'liability', 34000, 'EUR');
  perform public.save_goal(null, 'Summer trip to Japan', 300000, 115000, 'EUR',
    (m0 + interval '8 months')::date);
  perform public.save_goal(null, 'Emergency fund', 600000, 420000, 'EUR', null);

  -- Import rules (the import wizard saves them by direct insert, own rows).
  insert into public.category_rules (user_id, pattern, category_id) values
    (p_user, 'lidl', (cat->>'Groceries:expense')::uuid),
    (p_user, 'albert heijn', (cat->>'Groceries:expense')::uuid),
    (p_user, 'spotify', (cat->>'Entertainment:expense')::uuid),
    (p_user, 'shell', (cat->>'Transport:expense')::uuid);

  -- A group trip with the friend accounts: a few expenses (one in pounds),
  -- one settlement, and balances still open.
  if coalesce(array_length(p_friends, 1), 0) >= 3 then
    gid := public.create_group('Lisbon trip', 'EUR');
    for i in 1 .. array_length(p_friends, 1) loop
      perform public.claim_or_insert_member(gid, p_friends[i], public.member_name_for(p_friends[i]));
    end loop;
    select id into me from public.group_members where group_id = gid and user_id = p_user;
    select id into f1 from public.group_members where group_id = gid and user_id = p_friends[1];
    select id into f2 from public.group_members where group_id = gid and user_id = p_friends[2];
    select id into f3 from public.group_members where group_id = gid and user_id = p_friends[3];
    members := array[me, f1, f2, f3];
    perform public.create_group_expense_v2(gid, 'Flights', 36000, 'GBP', f2, current_date - 30,
      members, null, 'equal', 1.17);
    perform public.create_group_expense_v2(gid, 'Airbnb in Alfama', 48000, 'EUR', me, current_date - 24,
      members, null);
    perform public.create_group_expense_v2(gid, 'Dinner at Time Out Market', 9600, 'EUR', f1, current_date - 23,
      members, null);
    perform public.create_group_expense_v2(gid, 'Tram 28 & castle tickets', 5200, 'EUR', f3, current_date - 22,
      members, null);
    perform public.create_group_expense_v2(gid, 'Pastéis de Belém', 1680, 'EUR', me, current_date - 22,
      array[me, f1, f2], null);
    perform public.create_group_expense_v2(gid, 'Sunset boat tour', 14000, 'EUR', f1, current_date - 21,
      members, null);
    perform public.add_settlement(gid, f3, me, 5000, 'EUR', current_date - 10, 'For the Airbnb');
  end if;
end $$;
revoke execute on function public.demo_seed(uuid, uuid[]) from public, anon, authenticated;

create or replace function public.reset_demo_accounts()
returns integer language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  prev_claims text := current_setting('request.jwt.claims', true);
  prev_sub text := current_setting('request.jwt.claim.sub', true);
  ids uuid[]; friends uuid[]; m record; n int := 0;
begin
  select array_agg(user_id), array_agg(user_id order by email) filter (where role = 'friend')
    into ids, friends
    from public.demo_accounts;
  if ids is null then return 0; end if;

  perform public.demo_wipe(ids);
  for m in select user_id from public.demo_accounts order by role, email loop
    perform public.demo_restore_account(m.user_id);
  end loop;
  for m in select user_id from public.demo_accounts where role = 'main' order by email loop
    perform public.demo_seed(m.user_id, coalesce(friends, '{}'));
    n := n + 1;
  end loop;
  -- Visitors start with fresh limits (the seed used some).
  delete from public.rate_limits r
   where exists (select 1 from unnest(ids) i where position(i::text in r.key) > 0);

  perform set_config('request.jwt.claims', coalesce(prev_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(prev_sub, ''), true);
  return n;
end $$;
revoke execute on function public.reset_demo_accounts() from public, anon, authenticated;

-- 7 ---------------------------------------------------------------------------
create or replace function public.register_demo_account(
  p_email text, p_display_name text, p_role text, p_password_hash text default null)
returns uuid language plpgsql security definer
set search_path = public, pg_temp as $$
declare addr text := lower(btrim(p_email)); uid uuid; v jsonb := public.current_legal_versions();
begin
  if p_role is null or p_role not in ('main', 'friend') then raise exception 'unknown demo role'; end if;
  if addr is null or addr !~ '^[^@[:space:]]+@[^@[:space:]]+$' then raise exception 'invalid email'; end if;
  if p_role = 'main' and p_password_hash is null then raise exception 'a demo login needs a password hash'; end if;
  select id into uid from auth.users where lower(email) = addr;
  if uid is not null and not exists (select 1 from public.demo_accounts where user_id = uid) then
    raise exception 'that address belongs to an existing account';
  end if;
  if uid is null then
    uid := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change,
                            email_change_token_current, reauthentication_token, phone_change, phone_change_token,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', addr,
            coalesce(p_password_hash,
                     extensions.crypt(encode(extensions.gen_random_bytes(32), 'hex'), extensions.gen_salt('bf'))),
            now(), '', '', '', '', '', '', '', '',
            '{"provider": "email", "providers": ["email"]}'::jsonb,
            jsonb_build_object('full_name', p_display_name, 'email_verified', true,
                               'accepted_privacy', v->>'privacy', 'accepted_terms', v->>'terms'),
            now(), now());
    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (uid::text, uid,
            jsonb_build_object('sub', uid::text, 'email', addr, 'email_verified', true, 'phone_verified', false),
            'email', now(), now(), now());
  end if;
  insert into public.demo_accounts (user_id, role, email, display_name, password_hash)
  values (uid, p_role, addr, p_display_name, p_password_hash)
  on conflict (user_id) do update set role = excluded.role, email = excluded.email,
    display_name = excluded.display_name, password_hash = excluded.password_hash;
  perform public.demo_restore_account(uid);
  return uid;
end $$;
revoke execute on function public.register_demo_account(text, text, text, text) from public, anon, authenticated;

-- Daily at 03:00 UTC, after the 02:00 recurring materializer (idempotent:
-- unschedule any prior job first).
select cron.unschedule('reset-demo-accounts')
  where exists (select 1 from cron.job where jobname = 'reset-demo-accounts');
select cron.schedule('reset-demo-accounts', '0 3 * * *',
  $cron$select public.reset_demo_accounts();$cron$);
