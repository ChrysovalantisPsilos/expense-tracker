-- 0078: review fixes.
--
-- 1. Split rows are no longer deletable over REST. es_delete (0013/0029) let an
--    expense's creator or the group owner delete single splits: balances then
--    stopped adding up, the member's mirrored transaction vanished (0008's
--    split trigger) and the change log recorded nothing. Splits now change
--    only through create/update_group_expense_v2 (definer) or the cascade when
--    the expense itself is deleted (which the change log records).
-- 2. Settlements likewise (st_delete, 0045): the app never deletes one, and a
--    REST delete left no change-log entry. They go only with their group.
-- 3. Account deletion also scrubs the departing user's name from the texts
--    that stay: the encrypted change-log summaries (log_group_expense /
--    log_settlement wrote "Alice added …", "… recorded a payment: Alice → Bob")
--    and other members' notifications in their groups. Every name the user is
--    known by there — their member-row names, the actor names the log
--    snapshotted, their profile name — becomes "Former member", as
--    DELETION_SCOPE (_shared/accountDeletion.ts) says.
-- 4. consume_invite_recipient_quota() is server-only: any signed-in user could
--    use up an address's 3 invite emails a day (blocking invites to it) or
--    grow rate_limits without bound. send-invite now calls it with the service
--    role, after checking the caller can see the invite and it names that
--    address.
-- 5. The base currency is fixed once the account has entries whose amounts
--    depend on it: every row's exchange_rate is to the base currency it was
--    saved under, so a later switch would misprice all of history. A BEFORE
--    UPDATE trigger refuses the change; base_currency_locked() tells the app.
--
-- Every definer function pins search_path; none is client-callable except
-- base_currency_locked() (the caller's own flag).

-- ===========================================================================
-- 1 + 2. No direct deletes of splits or settlements
-- ===========================================================================
drop policy if exists es_delete on public.expense_splits;
revoke delete on public.expense_splits from anon, authenticated;

drop policy if exists st_delete on public.settlements;
revoke delete on public.settlements from anon, authenticated;

-- ===========================================================================
-- 3. Anonymise the departing user's name in change-log texts and notifications
-- ===========================================================================
-- `p` with every whole-word occurrence of each name in `p_names` replaced by
-- "Former member" (longest names first, so "Ann Lee" goes before "Ann"). A
-- name only matches between non-alphanumerics, so "Ann" leaves "Annual"
-- alone. Every non-alphanumeric character of a name is escaped (in an ARE, a
-- backslash before one always means that character itself); should a pattern
-- still fail, a plain replace of the name is used instead. Pure helper.
create or replace function public.redact_names(p text, p_names text[])
returns text language plpgsql immutable
set search_path = public, pg_temp as $$
declare nm text; out text := p;
begin
  if p is null or p_names is null then return p; end if;
  for nm in
    select d.n from (select distinct u.n from unnest(p_names) as u(n)
                      where u.n is not null and btrim(u.n) <> '' and u.n <> 'Former member') d
     order by char_length(d.n) desc, d.n
  loop
    begin
      out := regexp_replace(out,
        '(?<![[:alnum:]_])' || regexp_replace(nm, '([^[:alnum:][:space:]])', '\\\1', 'g') || '(?![[:alnum:]_])',
        'Former member', 'g');
    exception when others then
      out := replace(out, nm, 'Former member');
    end;
  end loop;
  return out;
end $$;
revoke execute on function public.redact_names(text, text[]) from public, anon, authenticated;

-- BEFORE the auth user goes (as in 0072), so the member rows still carry the
-- names and the links. Per group the user was ever in: every name they appear
-- under there, redacted from the group's change-log summaries (decrypted,
-- rewritten, re-encrypted — only rows that change) and from the group's
-- notifications to other users. A summary that won't decrypt is left alone
-- rather than blocking the deletion. Then, as in 0072, the member rows and
-- the log's actor names become "Former member" and lose their link.
create or replace function public.anonymise_departing_user()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare k text; g record; r record; plain text; red text;
begin
  for g in
    select s.gid, array_agg(distinct s.nm) as names
      from (
        select m.group_id as gid, m.display_name as nm
          from public.group_members m
         where m.user_id = OLD.id or m.former_user_id = OLD.id
        union all
        select a.group_id, a.actor_name
          from public.group_audit_log a
         where a.actor_id = OLD.id
        union all
        select m.group_id, p.display_name
          from public.group_members m
          join public.profiles p on p.id = OLD.id
         where m.user_id = OLD.id or m.former_user_id = OLD.id
      ) s
     where s.nm is not null and btrim(s.nm) <> ''
       and s.nm not in ('Former member', 'Someone', 'System', '?')
     group by s.gid
  loop
    k := coalesce(k, public.app_enc_key());
    for r in select a.id, a.summary_enc from public.group_audit_log a where a.group_id = g.gid loop
      begin
        plain := public.dec_text(r.summary_enc, k);
      exception when others then
        plain := null;
      end;
      red := public.redact_names(plain, g.names);
      if red is distinct from plain then
        update public.group_audit_log set summary_enc = public.enc_text(red, k) where id = r.id;
      end if;
    end loop;

    update public.notifications n
       set title = public.redact_names(n.title, g.names),
           body  = public.redact_names(n.body, g.names)
     where n.group_id = g.gid
       and n.user_id <> OLD.id
       and (public.redact_names(n.title, g.names) is distinct from n.title
            or public.redact_names(n.body, g.names) is distinct from n.body);
  end loop;

  update public.group_members
     set display_name = 'Former member', former_user_id = null
   where user_id = OLD.id or former_user_id = OLD.id;
  update public.group_audit_log
     set actor_name = 'Former member'
   where actor_id = OLD.id;
  return OLD;
end $$;
revoke execute on function public.anonymise_departing_user() from public, anon, authenticated;
-- The 0072 trigger (before delete on auth.users) keeps calling it.

-- ===========================================================================
-- 4. The per-address invite quota is server-only
-- ===========================================================================
-- Called by send-invite with the service role (no auth.uid()), only after the
-- caller's own session has shown the invite and that it names this address.
create or replace function public.consume_invite_recipient_quota(p_email text)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if p_email is null or btrim(p_email) = '' then raise exception 'invalid email'; end if;
  return public.rate_limit('invite-to:' || md5(lower(btrim(p_email))), 3, 86400);
end $$;
revoke execute on function public.consume_invite_recipient_quota(text) from public, anon, authenticated;
grant execute on function public.consume_invite_recipient_quota(text) to service_role;

-- ===========================================================================
-- 5. Base currency lock
-- ===========================================================================
-- Whether `p_user` has anything whose amounts are tied to their base currency.
create or replace function public.base_currency_in_use(p_user uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (select 1 from public.transactions    where user_id = p_user)
      or exists (select 1 from public.recurring_rules where user_id = p_user)
      or exists (select 1 from public.budgets         where user_id = p_user)
      or exists (select 1 from public.accounts        where user_id = p_user)
      or exists (select 1 from public.savings_goals   where user_id = p_user)
$$;
revoke execute on function public.base_currency_in_use(uuid) from public, anon, authenticated;

-- The caller's own flag, for Settings → Account.
create or replace function public.base_currency_locked()
returns boolean language plpgsql stable security definer
set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  return public.base_currency_in_use(auth.uid());
end $$;
revoke execute on function public.base_currency_locked() from public, anon;
grant execute on function public.base_currency_locked() to authenticated;

create or replace function public.profiles_base_currency_lock()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if new.base_currency is distinct from old.base_currency and public.base_currency_in_use(old.id) then
    raise exception 'Your base currency is fixed once you’ve added entries, so past amounts stay correct.';
  end if;
  return new;
end $$;
revoke execute on function public.profiles_base_currency_lock() from public, anon, authenticated;

drop trigger if exists trg_profiles_base_currency_lock on public.profiles;
create trigger trg_profiles_base_currency_lock before update of base_currency on public.profiles
  for each row execute function public.profiles_base_currency_lock();
