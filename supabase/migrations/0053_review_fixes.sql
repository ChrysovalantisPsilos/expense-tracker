-- Fixes from the adversarial review of 0049–0052.
--
-- H1  Decryption oracle. Every ciphertext column is now writable ONLY through
--     the encrypting RPCs (which take plaintext), so nobody can paste foreign
--     ciphertext — e.g. ledger bytes from a leaked dump, same app_enc_key —
--     into their own row and read it back. dec_minor never echoes a failed
--     decrypt-to-number, and the 0047 readers go through it.
-- M1  Budget alerts are a statement-level trigger: each (user, category,
--     month) touched by a statement is evaluated once, decrypting each row
--     once, instead of re-summing the whole month for every inserted row
--     (quadratic; 150 imported rows took 13.7 s). _group_net decrypts every
--     row exactly once. save_transactions is rate-limited.
-- M2  Recurring rules: next_run is clamped to at most 1 year back and a user
--     can hold at most 200 rules, bounding the nightly materializer.
-- L1  Editing a group expense no longer rewrites former members' personal
--     copies.
-- L2  Write RPCs reject category/account ids the caller doesn't own, and the
--     category-name lookups only resolve the row owner's own categories.
-- L3  API callers can't choose an invite token.
-- +   group_audit_log: INSERT/UPDATE revoked from the API roles (RLS already
--     blocked them), and insert/update policies that no grant can reach any
--     more are dropped (CLAUDE.md #7), so the table grants are the one gate.

-- ===========================================================================
-- H1 — close every direct write path to ciphertext
-- ===========================================================================
revoke insert, update on public.budgets, public.accounts, public.savings_goals
  from anon, authenticated;
revoke insert, update on public.group_audit_log from anon, authenticated;

-- profiles: the client updates only its editable fields (display name,
-- currency, avatar, notification switches, onboarding stamp); the payment
-- ciphertext is written by set_payment_info alone, and rows are created by the
-- signup trigger.
revoke insert, update on public.profiles from anon, authenticated;
grant update (display_name, base_currency, avatar_url, notify_email, notify_push, onboarded_at)
  on public.profiles to authenticated;

-- Policies no grant can reach any more (writes go through definer RPCs).
drop policy if exists own_insert on public.budgets;
drop policy if exists own_update on public.budgets;
drop policy if exists own_insert on public.accounts;
drop policy if exists own_update on public.accounts;
drop policy if exists own_insert on public.savings_goals;
drop policy if exists own_update on public.savings_goals;
drop policy if exists profile_insert on public.profiles;
drop policy if exists txn_insert on public.transactions;
drop policy if exists txn_update on public.transactions;
drop policy if exists rr_insert on public.recurring_rules;
drop policy if exists rr_update on public.recurring_rules;
drop policy if exists ge_insert on public.group_expenses;
drop policy if exists ge_update on public.group_expenses;
drop policy if exists es_insert on public.expense_splits;
drop policy if exists es_update on public.expense_splits;
drop policy if exists st_insert on public.settlements;
drop policy if exists st_update on public.settlements;
drop policy if exists gc_insert on public.group_comments;

-- A failed decrypt-to-number must not echo the plaintext (the ::bigint cast
-- error would print it: "invalid input syntax for type bigint: <plaintext>").
create or replace function public.dec_minor(p bytea, k text default null)
returns bigint language plpgsql stable set search_path = public as $$
declare t text;
begin
  if p is null then return null; end if;
  t := public.dec_text(p, k);
  if t !~ '^-?[0-9]{1,18}$' then
    raise exception 'encrypted value is not an amount' using errcode = '22023';
  end if;
  return t::bigint;
end $$;

-- The 0047 readers cast decrypted text themselves; route them through
-- dec_minor (key read once per call). Same shapes and grants.
create or replace function public.my_accounts()
returns table(id uuid, name text, type text, balance_minor bigint,
              currency text, is_archived boolean, created_at timestamptz)
language sql security definer stable set search_path = public as $$
  select a.id, a.name, a.type, public.dec_minor(a.balance_enc, k.k),
         a.currency::text, a.is_archived, a.created_at
  from public.accounts a
  cross join (select public.app_enc_key() as k) k
  where a.user_id = auth.uid() and a.is_archived = false
  order by a.created_at
$$;

create or replace function public.my_goals()
returns table(id uuid, name text, target_minor bigint, saved_minor bigint,
              currency text, target_date date, created_at timestamptz)
language sql security definer stable set search_path = public as $$
  select g.id, g.name, public.dec_minor(g.target_enc, k.k), public.dec_minor(g.saved_enc, k.k),
         g.currency::text, g.target_date, g.created_at
  from public.savings_goals g
  cross join (select public.app_enc_key() as k) k
  where g.user_id = auth.uid()
  order by g.created_at
$$;

-- (+ L2: only the budget owner's own category is embedded.)
create or replace function public.my_budgets(p_period date)
returns table(id uuid, category_id uuid, amount_minor bigint, currency text,
              period_start date, categories jsonb)
language sql security definer stable set search_path = public as $$
  select b.id, b.category_id, public.dec_minor(b.amount_enc, k.k),
         b.currency::text, b.period_start,
         case when c.id is not null then jsonb_build_object('name', c.name, 'icon', c.icon) end
  from public.budgets b
  cross join (select public.app_enc_key() as k) k
  left join public.categories c on c.id = b.category_id and c.user_id = b.user_id
  where b.user_id = auth.uid() and b.period_start = p_period
$$;

-- ===========================================================================
-- L2 — ownership of referenced categories/accounts (shared by the write RPCs)
-- ===========================================================================
create or replace function public.owns_refs(p_uid uuid, p_category uuid, p_account uuid)
returns boolean language sql stable set search_path = public as $$
  select (p_category is null or exists (
            select 1 from public.categories c where c.id = p_category and c.user_id = p_uid))
     and (p_account is null or exists (
            select 1 from public.accounts a where a.id = p_account and a.user_id = p_uid))
$$;
revoke execute on function public.owns_refs(uuid, uuid, uuid) from anon, authenticated, public;

create or replace function public.save_budget(
  p_category uuid, p_amount bigint, p_currency text, p_period date)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); k text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not public.owns_refs(uid, p_category, null) then raise exception 'category not found'; end if;
  k := public.app_enc_key();
  insert into public.budgets (user_id, category_id, currency, period_start, amount_enc)
    values (uid, p_category, coalesce(p_currency, 'EUR'),
            coalesce(p_period, date_trunc('month', current_date)::date),
            public.enc_minor(coalesce(p_amount, 0), k))
  on conflict (user_id, category_id, period_start)
    do update set amount_enc = excluded.amount_enc, currency = excluded.currency;
end $$;

-- Only the listed plaintext keys are read (jsonb_to_recordset ignores any
-- other key, including *_enc), refs must be the caller's own, ≤ 1000 rows per
-- call, and a per-user flood guard bounds CPU (encrypting) and fan-out.
create or replace function public.save_transactions(p_rows jsonb, p_ignore_duplicates boolean default false)
returns integer language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); k text; n int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'rows must be an array'; end if;
  if jsonb_array_length(p_rows) > 1000 then raise exception 'too many rows in one request'; end if;
  if exists (select 1 from jsonb_to_recordset(p_rows) as x(amount_minor bigint)
             where x.amount_minor is null or x.amount_minor < 0) then
    raise exception 'amount must be zero or more';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_rows) as x(category_id uuid, account_id uuid)
             where not public.owns_refs(uid, x.category_id, x.account_id)) then
    raise exception 'category or account not found';
  end if;
  if not public.rate_limit('txn:' || uid, 300, 3600) then
    raise exception 'Too many saves — please slow down.';
  end if;
  k := public.app_enc_key();
  with ins as (
    insert into public.transactions as t
      (user_id, client_uuid, kind, category_id, account_id, amount_enc, currency,
       exchange_rate, description_enc, notes_enc, spent_at)
    select uid, coalesce(x.client_uuid, gen_random_uuid()),
           coalesce(x.kind, 'expense')::public.txn_kind, x.category_id, x.account_id,
           public.enc_minor(x.amount_minor, k), coalesce(x.currency, 'EUR'),
           coalesce(x.exchange_rate, 1), public.enc_text(x.description, k),
           public.enc_text(x.notes, k), coalesce(x.spent_at, current_date)
    from jsonb_to_recordset(p_rows) as x(client_uuid uuid, kind text, category_id uuid,
         account_id uuid, amount_minor bigint, currency text, exchange_rate numeric,
         description text, notes text, spent_at date)
    on conflict (user_id, client_uuid) do update set
      kind = excluded.kind, category_id = excluded.category_id,
      account_id = excluded.account_id, amount_enc = excluded.amount_enc,
      currency = excluded.currency, exchange_rate = excluded.exchange_rate,
      description_enc = excluded.description_enc, notes_enc = excluded.notes_enc,
      spent_at = excluded.spent_at
      where not p_ignore_duplicates
    returning (t.xmax = 0) as inserted
  )
  select count(*) filter (where inserted) into n from ins;
  return n;
end $$;

create or replace function public.update_transaction(p_id uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); k text; f jsonb := coalesce(p_patch, '{}'::jsonb);
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if f ? 'amount_minor' and coalesce((f->>'amount_minor')::bigint, -1) < 0 then
    raise exception 'amount must be zero or more';
  end if;
  if not public.owns_refs(uid, (f->>'category_id')::uuid, (f->>'account_id')::uuid) then
    raise exception 'category or account not found';
  end if;
  k := public.app_enc_key();
  update public.transactions t set
    kind            = case when f ? 'kind' then (f->>'kind')::public.txn_kind else t.kind end,
    category_id     = case when f ? 'category_id' then (f->>'category_id')::uuid else t.category_id end,
    account_id      = case when f ? 'account_id' then (f->>'account_id')::uuid else t.account_id end,
    amount_enc      = case when f ? 'amount_minor' then public.enc_minor((f->>'amount_minor')::bigint, k) else t.amount_enc end,
    currency        = case when f ? 'currency' then f->>'currency' else t.currency end,
    exchange_rate   = case when f ? 'exchange_rate' then (f->>'exchange_rate')::numeric else t.exchange_rate end,
    description_enc = case when f ? 'description' then public.enc_text(f->>'description', k) else t.description_enc end,
    notes_enc       = case when f ? 'notes' then public.enc_text(f->>'notes', k) else t.notes_enc end,
    spent_at        = case when f ? 'spent_at' then (f->>'spent_at')::date else t.spent_at end
  where t.id = p_id and t.user_id = uid;
  if not found then raise exception 'not found'; end if;
end $$;

-- (+ M2: next_run at most 1 year back; at most 200 rules per user.)
create or replace function public.save_recurring_rule(p_id uuid, p_fields jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); k text; rid uuid; f jsonb := coalesce(p_fields, '{}'::jsonb);
        oldest date := (current_date - interval '1 year')::date;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if (p_id is null or f ? 'amount_minor') and coalesce((f->>'amount_minor')::bigint, -1) < 0 then
    raise exception 'amount must be zero or more';
  end if;
  if not public.owns_refs(uid, (f->>'category_id')::uuid, (f->>'account_id')::uuid) then
    raise exception 'category or account not found';
  end if;
  k := public.app_enc_key();
  if p_id is null then
    if (select count(*) from public.recurring_rules where user_id = uid) >= 200 then
      raise exception 'You can have at most 200 recurring entries.';
    end if;
    insert into public.recurring_rules
      (user_id, kind, category_id, account_id, amount_enc, currency, description_enc,
       frequency, interval_n, next_run, end_date, is_active, remind_days_before)
    values
      (uid, coalesce(f->>'kind', 'expense')::public.txn_kind, (f->>'category_id')::uuid,
       (f->>'account_id')::uuid, public.enc_minor((f->>'amount_minor')::bigint, k),
       coalesce(f->>'currency', 'EUR'), public.enc_text(f->>'description', k),
       coalesce(f->>'frequency', 'monthly')::public.recurrence_freq,
       coalesce((f->>'interval_n')::int, 1),
       greatest(coalesce((f->>'next_run')::date, current_date), oldest),
       (f->>'end_date')::date, coalesce((f->>'is_active')::boolean, true),
       (f->>'remind_days_before')::int)
    returning id into rid;
  else
    update public.recurring_rules r set
      kind               = case when f ? 'kind' then (f->>'kind')::public.txn_kind else r.kind end,
      category_id        = case when f ? 'category_id' then (f->>'category_id')::uuid else r.category_id end,
      account_id         = case when f ? 'account_id' then (f->>'account_id')::uuid else r.account_id end,
      amount_enc         = case when f ? 'amount_minor' then public.enc_minor((f->>'amount_minor')::bigint, k) else r.amount_enc end,
      currency           = case when f ? 'currency' then f->>'currency' else r.currency end,
      description_enc    = case when f ? 'description' then public.enc_text(f->>'description', k) else r.description_enc end,
      frequency          = case when f ? 'frequency' then (f->>'frequency')::public.recurrence_freq else r.frequency end,
      interval_n         = case when f ? 'interval_n' then (f->>'interval_n')::int else r.interval_n end,
      next_run           = case when f ? 'next_run' then greatest((f->>'next_run')::date, oldest) else r.next_run end,
      end_date           = case when f ? 'end_date' then (f->>'end_date')::date else r.end_date end,
      is_active          = case when f ? 'is_active' then (f->>'is_active')::boolean else r.is_active end,
      remind_days_before = case when f ? 'remind_days_before' then (f->>'remind_days_before')::int else r.remind_days_before end
    where r.id = p_id and r.user_id = uid
    returning r.id into rid;
    if rid is null then raise exception 'not found'; end if;
  end if;
  return rid;
end $$;

-- ===========================================================================
-- M1 — budget alerts once per (user, category, month) per statement
-- ===========================================================================
-- Same 80% / 100% thresholds and generic bodies as before. When one statement
-- crosses both, only "exceeded" is sent (as a single row crossing both always
-- did). The category name resolves only against the owner's own categories (L2).
create or replace function public.notify_budget_threshold()
returns trigger language plpgsql security definer set search_path = public as $$
declare g record; k text; cap bigint; spent_after bigint; spent_new bigint; spent_before bigint;
begin
  for g in
    select n.user_id, n.category_id, b.period_start, b.amount_enc as cap_enc,
           coalesce(c.name, 'A category') as cat_name, array_agg(n.id) as new_ids
    from new_rows n
    join public.budgets b on b.user_id = n.user_id and b.category_id = n.category_id
                         and b.period_start = date_trunc('month', n.spent_at)::date
    left join public.categories c on c.id = n.category_id and c.user_id = n.user_id
    where n.kind = 'expense' and n.category_id is not null
    group by n.user_id, n.category_id, b.period_start, b.amount_enc, c.name
  loop
    k := coalesce(k, public.app_enc_key());
    cap := public.dec_minor(g.cap_enc, k);
    continue when cap is null or cap <= 0;

    -- Every row of the category-month is decrypted exactly once.
    select coalesce(sum(s.v), 0), coalesce(sum(s.v) filter (where s.id = any(g.new_ids)), 0)
      into spent_after, spent_new
      from (select t.id, round(public.dec_minor(t.amount_enc, k) * coalesce(t.exchange_rate, 1)) as v
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

drop trigger if exists trg_notify_budget on public.transactions;
create trigger trg_notify_budget after insert on public.transactions
  referencing new table as new_rows
  for each statement execute function public.notify_budget_threshold();

-- (L2) digest's top category: only the owner's own categories.
create or replace function public.send_weekly_digests()
returns integer language plpgsql security definer set search_path = public as $$
declare
  u record; k text; cnt int; top_name text; n int := 0;
begin
  k := public.app_enc_key();
  for u in
    select distinct user_id from public.transactions
    where kind = 'expense' and spent_at >= current_date - 6
  loop
    select count(*) into cnt
      from public.transactions
     where user_id = u.user_id and kind = 'expense' and spent_at >= current_date - 6;
    select coalesce(c.name, 'Uncategorized') into top_name
      from public.transactions t
      left join public.categories c on c.id = t.category_id and c.user_id = t.user_id
     where t.user_id = u.user_id and t.kind = 'expense' and t.spent_at >= current_date - 6
     group by 1
     order by sum(round(public.dec_minor(t.amount_enc, k) * coalesce(t.exchange_rate, 1))) desc
     limit 1;

    insert into public.notifications (user_id, type, title, body)
    values (u.user_id, 'digest', 'Your week in money',
      cnt || ' expense' || case when cnt = 1 then '' else 's' end
      || ' this week · top category: ' || top_name || '. Open Budgeer to see your totals.');
    n := n + 1;
  end loop;
  return n;
end $$;

-- Balances: every expense, split and settlement is decrypted exactly once
-- (multiply-referenced CTEs are materialised), then netted per member.
create or replace function public._group_net(p_group uuid)
returns table(member_id uuid, net_minor bigint)
language sql stable security definer set search_path = public as $$
  with k as (select public.app_enc_key() as k),
  e as (
    select e.id, e.paid_by, public.dec_minor(e.amount_enc, k.k) as amt
    from public.group_expenses e cross join k where e.group_id = p_group),
  s as (
    select s.member_id, public.dec_minor(s.share_enc, k.k) as amt
    from public.expense_splits s join e on e.id = s.expense_id cross join k),
  st as (
    select st.from_member, st.to_member, public.dec_minor(st.amount_enc, k.k) as amt
    from public.settlements st cross join k where st.group_id = p_group),
  moves as (
    select paid_by as mid, amt as v from e
    union all select member_id, -amt from s
    union all select from_member, amt from st
    union all select to_member, -amt from st)
  select m.id, coalesce(sum(mv.v), 0)::bigint
  from public.group_members m
  left join moves mv on mv.mid = m.id
  where m.group_id = p_group
  group by m.id;
$$;

-- ===========================================================================
-- L1 — expense edits only reach the personal copies of current members
-- ===========================================================================
create or replace function public.sync_group_expense_meta()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.transactions t
    set description_enc = NEW.description_enc, spent_at = NEW.spent_at, currency = NEW.currency
    where t.group_expense_id = NEW.id
      and exists (select 1 from public.group_members m
                  where m.group_id = NEW.group_id and m.user_id = t.user_id);
  return NEW;
end;
$$;

-- ===========================================================================
-- L3 — the invite token is always server-generated for API callers
-- ===========================================================================
create or replace function public.group_invite_guard()
returns trigger language plpgsql security invoker set search_path = public as $$
declare max_exp timestamptz := now() + interval '24 hours';
begin
  if TG_OP = 'INSERT' then
    NEW.created_by := coalesce(auth.uid(), NEW.created_by);
    NEW.expires_at := least(coalesce(NEW.expires_at, max_exp), max_exp);
    if current_user in ('anon', 'authenticated') then
      NEW.token := encode(extensions.gen_random_bytes(16), 'hex');
      NEW.accepted_by := null; NEW.accepted_at := null; NEW.declined_at := null;
    end if;
  else
    NEW.created_by := OLD.created_by;
    -- Expiry can be shortened (e.g. revoking a link), never pushed past 24h
    -- from now or cleared.
    if NEW.expires_at is distinct from OLD.expires_at then
      NEW.expires_at := least(coalesce(NEW.expires_at, max_exp), max_exp);
    end if;
    if current_user in ('anon', 'authenticated') then
      NEW.group_id := OLD.group_id;           NEW.token := OLD.token;
      NEW.invited_user_id := OLD.invited_user_id; NEW.invited_email := OLD.invited_email;
      NEW.accepted_by := OLD.accepted_by;     NEW.accepted_at := OLD.accepted_at;
      NEW.declined_at := OLD.declined_at;     NEW.created_at := OLD.created_at;
    end if;
  end if;
  return NEW;
end $$;
