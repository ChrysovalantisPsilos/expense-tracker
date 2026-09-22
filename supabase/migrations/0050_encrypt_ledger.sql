-- Encrypt the ledger's money and free text at rest, extending 0046/0047 (same
-- pgcrypto + Vault key `app_enc_key`, same threat model: a leaked dump/backup
-- shows only ciphertext; the running project still decrypts via definer RPCs —
-- this is NOT end-to-end encryption).
--
--   transactions     amount_minor, description, notes
--   group_expenses   amount_minor, description
--   expense_splits   share_minor
--   settlements      amount_minor, note
--   group_comments   body
--   recurring_rules  amount_minor, description
--   group_audit_log  summary, amount_minor   (a verbatim copy of the above)
--
-- Dates, categories, currency, exchange_rate, ids and foreign keys stay plain,
-- so filtering, sorting and RLS keep working. Base tables stay real tables, so
-- Realtime still fires (payloads now carry ciphertext; the client only uses
-- them as a refetch signal). Reads go through decrypting definer RPCs, writes
-- through encrypting ones; direct INSERT/UPDATE by the API roles is revoked so
-- nobody can plant undecryptable bytes that would break a group's balances.
--
-- Notification bodies no longer quote encrypted values (expense descriptions,
-- digest totals), for the same reason 0047 dropped the budget figures: they'd
-- otherwise re-leak the ciphertext's plaintext into notifications.body.
--
-- PERFORMANCE: every server-side SUM over these columns (balances, budget
-- alerts, the weekly digest) now decrypts per row. Fine at the current scale;
-- revisit (e.g. cached per-group totals) if a group or month grows to many
-- thousands of rows.

-- ===========================================================================
-- 1. Helpers — the only place the pgcrypto calls live. Invoker functions:
--    they run as the definer RPC/trigger that calls them (never as an API
--    role, which has EXECUTE revoked). Pass `k` (app_enc_key()) when looping
--    so the Vault secret is read once per statement, not once per row.
-- ===========================================================================
create or replace function public.enc_text(p text, k text default null)
returns bytea language sql volatile set search_path = public as $$
  select case when p is null then null
    else extensions.pgp_sym_encrypt(p, coalesce(k, public.app_enc_key())) end
$$;

create or replace function public.dec_text(p bytea, k text default null)
returns text language sql stable set search_path = public as $$
  select case when p is null then null
    else extensions.pgp_sym_decrypt(p, coalesce(k, public.app_enc_key())) end
$$;

create or replace function public.enc_minor(p bigint, k text default null)
returns bytea language sql volatile set search_path = public as $$
  select public.enc_text(p::text, k)
$$;

create or replace function public.dec_minor(p bytea, k text default null)
returns bigint language sql stable set search_path = public as $$
  select public.dec_text(p, k)::bigint
$$;

revoke execute on function public.enc_text(text, text)    from anon, authenticated, public;
revoke execute on function public.dec_text(bytea, text)   from anon, authenticated, public;
revoke execute on function public.enc_minor(bigint, text) from anon, authenticated, public;
revoke execute on function public.dec_minor(bytea, text)  from anon, authenticated, public;

-- ===========================================================================
-- 2. Ciphertext columns → backfill → drop plaintext.
--    User triggers are disabled during the backfill so it doesn't write audit
--    rows, re-sync mirrors or bump updated_at.
-- ===========================================================================
alter table public.transactions
  add column if not exists amount_enc bytea,
  add column if not exists description_enc bytea,
  add column if not exists notes_enc bytea;
alter table public.group_expenses
  add column if not exists amount_enc bytea,
  add column if not exists description_enc bytea;
alter table public.expense_splits  add column if not exists share_enc bytea;
alter table public.settlements
  add column if not exists amount_enc bytea,
  add column if not exists note_enc bytea;
alter table public.group_comments  add column if not exists body_enc bytea;
alter table public.recurring_rules
  add column if not exists amount_enc bytea,
  add column if not exists description_enc bytea;
alter table public.group_audit_log
  add column if not exists summary_enc bytea,
  add column if not exists amount_enc bytea;

alter table public.transactions    disable trigger user;
alter table public.group_expenses  disable trigger user;
alter table public.expense_splits  disable trigger user;
alter table public.settlements     disable trigger user;
alter table public.group_comments  disable trigger user;
alter table public.recurring_rules disable trigger user;
alter table public.group_audit_log disable trigger user;

update public.transactions t set
  amount_enc = public.enc_minor(t.amount_minor, k.k),
  description_enc = public.enc_text(t.description, k.k),
  notes_enc = public.enc_text(t.notes, k.k)
from (select public.app_enc_key() as k) k;

update public.group_expenses e set
  amount_enc = public.enc_minor(e.amount_minor, k.k),
  description_enc = public.enc_text(e.description, k.k)
from (select public.app_enc_key() as k) k;

update public.expense_splits s set share_enc = public.enc_minor(s.share_minor, k.k)
from (select public.app_enc_key() as k) k;

update public.settlements st set
  amount_enc = public.enc_minor(st.amount_minor, k.k),
  note_enc = public.enc_text(st.note, k.k)
from (select public.app_enc_key() as k) k;

update public.group_comments c set body_enc = public.enc_text(c.body, k.k)
from (select public.app_enc_key() as k) k;

update public.recurring_rules r set
  amount_enc = public.enc_minor(r.amount_minor, k.k),
  description_enc = public.enc_text(r.description, k.k)
from (select public.app_enc_key() as k) k;

update public.group_audit_log a set
  summary_enc = public.enc_text(a.summary, k.k),
  amount_enc = public.enc_minor(a.amount_minor, k.k)
from (select public.app_enc_key() as k) k;

alter table public.transactions    enable trigger user;
alter table public.group_expenses  enable trigger user;
alter table public.expense_splits  enable trigger user;
alter table public.settlements     enable trigger user;
alter table public.group_comments  enable trigger user;
alter table public.recurring_rules enable trigger user;
alter table public.group_audit_log enable trigger user;

-- Drop the plaintext (their CHECKs go with them; the write RPCs below enforce
-- the same rules) and require the ciphertext where the plaintext was NOT NULL.
alter table public.transactions
  drop column amount_minor, drop column description, drop column notes,
  alter column amount_enc set not null;
alter table public.group_expenses
  drop column amount_minor, drop column description,
  alter column amount_enc set not null;
alter table public.expense_splits
  drop column share_minor,
  alter column share_enc set not null;
alter table public.settlements
  drop column amount_minor, drop column note,
  alter column amount_enc set not null;
alter table public.group_comments
  drop column body,
  alter column body_enc set not null;
alter table public.recurring_rules
  drop column amount_minor, drop column description,
  alter column amount_enc set not null;
alter table public.group_audit_log
  drop column summary, drop column amount_minor,
  alter column summary_enc set not null;

-- ===========================================================================
-- 3. Writes only through the encrypting RPCs. SELECT/DELETE stay direct (RLS
--    unchanged); INSERT/UPDATE are revoked from the API roles.
-- ===========================================================================
revoke insert, update on public.transactions, public.group_expenses, public.expense_splits,
  public.settlements, public.group_comments, public.recurring_rules
  from anon, authenticated;

-- Split the remaining blanket FOR ALL policies on the two personal tables
-- touched here into per-verb rules (CLAUDE.md #6). INSERT/UPDATE are kept as
-- defence in depth even though the grants above make them unreachable.
drop policy if exists "own rows" on public.transactions;
create policy txn_select on public.transactions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy txn_insert on public.transactions for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy txn_update on public.transactions for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy txn_delete on public.transactions for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "own rows" on public.recurring_rules;
create policy rr_select on public.recurring_rules for select to authenticated
  using ((select auth.uid()) = user_id);
create policy rr_insert on public.recurring_rules for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy rr_update on public.recurring_rules for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy rr_delete on public.recurring_rules for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ===========================================================================
-- 4. Personal transactions — read / write RPCs.
-- ===========================================================================

-- Mirrors the old `select *, categories(name, icon), group_expenses(groups(name))`
-- (same row shape), filtered server-side. Own rows only; a group name is only
-- embedded while the caller is still a member (what the RLS'd embed returned).
create or replace function public.my_transactions(
  p_kind text default null, p_from date default null, p_to date default null,
  p_category uuid default null, p_limit int default null)
returns table(id uuid, user_id uuid, kind text, category_id uuid, account_id uuid,
              amount_minor bigint, currency text, exchange_rate numeric,
              description text, notes text, spent_at date, group_id uuid,
              is_shared boolean, client_uuid uuid, created_at timestamptz,
              updated_at timestamptz, group_expense_id uuid,
              categories jsonb, group_expenses jsonb)
language sql stable security definer set search_path = public as $$
  select t.id, t.user_id, t.kind::text, t.category_id, t.account_id,
         public.dec_minor(t.amount_enc, k.k), t.currency::text, t.exchange_rate,
         public.dec_text(t.description_enc, k.k), public.dec_text(t.notes_enc, k.k),
         t.spent_at, t.group_id, t.is_shared, t.client_uuid, t.created_at,
         t.updated_at, t.group_expense_id,
         case when c.id is not null then jsonb_build_object('name', c.name, 'icon', c.icon) end,
         case when g.id is not null then jsonb_build_object('groups', jsonb_build_object('name', g.name)) end
  from public.transactions t
  cross join (select public.app_enc_key() as k) k
  left join public.categories c on c.id = t.category_id and c.user_id = t.user_id
  left join public.group_expenses ge on ge.id = t.group_expense_id
  left join public.groups g on g.id = ge.group_id and public.is_group_member(ge.group_id)
  where t.user_id = auth.uid()
    and (p_kind is null or t.kind::text = p_kind)
    and (p_from is null or t.spent_at >= p_from)
    and (p_to is null or t.spent_at <= p_to)
    and (p_category is null or t.category_id = p_category)
  order by t.spent_at desc, t.created_at desc
  limit p_limit
$$;
revoke execute on function public.my_transactions(text, date, date, uuid, int) from anon, public;
grant execute on function public.my_transactions(text, date, date, uuid, int) to authenticated;

-- Insert (or idempotently upsert on client_uuid) the caller's transactions.
-- user_id is forced to the caller; the mirror-only columns (group_id,
-- is_shared, group_expense_id) can't be set from the client. With
-- p_ignore_duplicates an existing client_uuid is skipped instead of updated
-- (CSV/XLSX re-imports). Returns how many rows were newly inserted.
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
revoke execute on function public.save_transactions(jsonb, boolean) from anon, public;
grant execute on function public.save_transactions(jsonb, boolean) to authenticated;

-- Patch one of the caller's own transactions: only keys present in p_patch
-- change (same semantics as the old `.update(fields)`).
create or replace function public.update_transaction(p_id uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); k text; f jsonb := coalesce(p_patch, '{}'::jsonb);
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if f ? 'amount_minor' and coalesce((f->>'amount_minor')::bigint, -1) < 0 then
    raise exception 'amount must be zero or more';
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
revoke execute on function public.update_transaction(uuid, jsonb) from anon, public;
grant execute on function public.update_transaction(uuid, jsonb) to authenticated;

-- ===========================================================================
-- 5. Recurring rules — read / write RPCs + the nightly materializer.
-- ===========================================================================
create or replace function public.my_recurring_rules()
returns table(id uuid, user_id uuid, kind text, category_id uuid, account_id uuid,
              amount_minor bigint, currency text, description text, frequency text,
              interval_n int, next_run date, end_date date, is_active boolean,
              created_at timestamptz, remind_days_before int, last_reminded_for date,
              categories jsonb)
language sql stable security definer set search_path = public as $$
  select r.id, r.user_id, r.kind::text, r.category_id, r.account_id,
         public.dec_minor(r.amount_enc, k.k), r.currency::text,
         public.dec_text(r.description_enc, k.k), r.frequency::text, r.interval_n,
         r.next_run, r.end_date, r.is_active, r.created_at, r.remind_days_before,
         r.last_reminded_for,
         case when c.id is not null then jsonb_build_object('name', c.name, 'icon', c.icon) end
  from public.recurring_rules r
  cross join (select public.app_enc_key() as k) k
  left join public.categories c on c.id = r.category_id and c.user_id = r.user_id
  where r.user_id = auth.uid()
  order by r.is_active desc, r.next_run asc
$$;
revoke execute on function public.my_recurring_rules() from anon, public;
grant execute on function public.my_recurring_rules() to authenticated;

-- Create (p_id null) or patch one of the caller's rules; only keys present in
-- p_fields change on update.
create or replace function public.save_recurring_rule(p_id uuid, p_fields jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); k text; rid uuid; f jsonb := coalesce(p_fields, '{}'::jsonb);
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if (p_id is null or f ? 'amount_minor') and coalesce((f->>'amount_minor')::bigint, -1) < 0 then
    raise exception 'amount must be zero or more';
  end if;
  k := public.app_enc_key();
  if p_id is null then
    insert into public.recurring_rules
      (user_id, kind, category_id, account_id, amount_enc, currency, description_enc,
       frequency, interval_n, next_run, end_date, is_active, remind_days_before)
    values
      (uid, coalesce(f->>'kind', 'expense')::public.txn_kind, (f->>'category_id')::uuid,
       (f->>'account_id')::uuid, public.enc_minor((f->>'amount_minor')::bigint, k),
       coalesce(f->>'currency', 'EUR'), public.enc_text(f->>'description', k),
       coalesce(f->>'frequency', 'monthly')::public.recurrence_freq,
       coalesce((f->>'interval_n')::int, 1), coalesce((f->>'next_run')::date, current_date),
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
      next_run           = case when f ? 'next_run' then (f->>'next_run')::date else r.next_run end,
      end_date           = case when f ? 'end_date' then (f->>'end_date')::date else r.end_date end,
      is_active          = case when f ? 'is_active' then (f->>'is_active')::boolean else r.is_active end,
      remind_days_before = case when f ? 'remind_days_before' then (f->>'remind_days_before')::int else r.remind_days_before end
    where r.id = p_id and r.user_id = uid
    returning r.id into rid;
    if rid is null then raise exception 'not found'; end if;
  end if;
  return rid;
end $$;
revoke execute on function public.save_recurring_rule(uuid, jsonb) from anon, public;
grant execute on function public.save_recurring_rule(uuid, jsonb) to authenticated;

-- Nightly cron: generated transactions copy the rule's ciphertext as-is (same
-- key), so nothing is decrypted here.
create or replace function public.materialize_recurring_rules()
returns integer language plpgsql security definer set search_path = public as $$
declare
  r         record;
  run_date  date;
  inserted  int := 0;
  guard     int;
begin
  for r in
    select * from public.recurring_rules
    where is_active and next_run <= current_date
  loop
    run_date := r.next_run;
    guard := 0;
    while run_date <= current_date
      and (r.end_date is null or run_date <= r.end_date)
      and guard < 1000
    loop
      insert into public.transactions
        (user_id, kind, category_id, account_id, amount_enc, currency, description_enc, spent_at)
      values
        (r.user_id, r.kind, r.category_id, r.account_id, r.amount_enc, r.currency, r.description_enc, run_date);
      inserted := inserted + 1;
      guard := guard + 1;
      run_date := (run_date + case r.frequency
        when 'daily'   then make_interval(days  => r.interval_n)
        when 'weekly'  then make_interval(days  => r.interval_n * 7)
        when 'monthly' then make_interval(months=> r.interval_n)
        when 'yearly'  then make_interval(years => r.interval_n)
      end)::date;
    end loop;

    update public.recurring_rules
      set next_run  = run_date,
          is_active = case when r.end_date is not null and run_date > r.end_date
                           then false else is_active end
    where id = r.id;
  end loop;

  return inserted;
end;
$$;

-- ===========================================================================
-- 6. Personal alerts + digest on encrypted amounts.
-- ===========================================================================
create or replace function public.notify_budget_threshold()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  b record;
  k text;
  cap bigint;
  spent_after bigint;
  spent_before bigint;
  cat_name text;
begin
  if NEW.kind <> 'expense' or NEW.category_id is null then return NEW; end if;

  select * into b from public.budgets
   where user_id = NEW.user_id and category_id = NEW.category_id
     and period_start = date_trunc('month', NEW.spent_at)::date;
  if b is null then return NEW; end if;
  k := public.app_enc_key();
  cap := public.dec_minor(b.amount_enc, k);
  if cap is null or cap <= 0 then return NEW; end if;

  select coalesce(sum(round(public.dec_minor(amount_enc, k) * coalesce(exchange_rate, 1))), 0)
    into spent_after
    from public.transactions
   where user_id = NEW.user_id and category_id = NEW.category_id and kind = 'expense'
     and spent_at >= b.period_start
     and spent_at < (b.period_start + interval '1 month')::date;
  spent_before := spent_after - round(public.dec_minor(NEW.amount_enc, k) * coalesce(NEW.exchange_rate, 1));

  select name into cat_name from public.categories where id = NEW.category_id;
  cat_name := coalesce(cat_name, 'A category');

  -- Generic bodies: no amounts, so encrypted values never land in plaintext.
  if spent_before < cap and spent_after >= cap then
    insert into public.notifications (user_id, type, title, body)
    values (NEW.user_id, 'budget', 'Budget exceeded',
      cat_name || ' has passed its monthly budget.');
  elsif spent_before < round(cap * 0.8) and spent_after >= round(cap * 0.8) then
    insert into public.notifications (user_id, type, title, body)
    values (NEW.user_id, 'budget', 'Budget almost used',
      cat_name || ' is nearly at its monthly budget.');
  end if;

  return NEW;
end $$;

-- Weekly digest: count + top category (ranked on decrypted amounts), but no
-- figures in the body — the totals are one tap away in the app.
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
      left join public.categories c on c.id = t.category_id
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

-- The digest was fmt_minor's only caller.
drop function if exists public.fmt_minor(bigint, text);

-- ===========================================================================
-- 7. Groups — balances, expense RPCs, mirror, audit, notifications.
-- ===========================================================================

-- Source of truth for balances (0030), now summing decrypted amounts.
create or replace function public._group_net(p_group uuid)
returns table(member_id uuid, net_minor bigint)
language sql stable security definer set search_path = public as $$
  with k as (select public.app_enc_key() as k),
  paid as (
    select e.paid_by as mid, sum(public.dec_minor(e.amount_enc, k.k)) as v
    from public.group_expenses e cross join k
    where e.group_id = p_group group by e.paid_by),
  owed as (
    select s.member_id as mid, sum(public.dec_minor(s.share_enc, k.k)) as v
    from public.expense_splits s
    join public.group_expenses e on e.id = s.expense_id
    cross join k
    where e.group_id = p_group group by s.member_id),
  sent as (
    select st.from_member as mid, sum(public.dec_minor(st.amount_enc, k.k)) as v
    from public.settlements st cross join k
    where st.group_id = p_group group by st.from_member),
  recv as (
    select st.to_member as mid, sum(public.dec_minor(st.amount_enc, k.k)) as v
    from public.settlements st cross join k
    where st.group_id = p_group group by st.to_member)
  select m.id,
         (coalesce(paid.v, 0) - coalesce(owed.v, 0) + coalesce(sent.v, 0) - coalesce(recv.v, 0))::bigint
  from public.group_members m
  left join paid on paid.mid = m.id
  left join owed on owed.mid = m.id
  left join sent on sent.mid = m.id
  left join recv on recv.mid = m.id
  where m.group_id = p_group;
$$;

create or replace function public.create_group_expense_v2(
  p_group uuid, p_description text, p_amount bigint, p_currency char(3),
  p_paid_by uuid, p_spent_at date, p_member_ids uuid[], p_shares bigint[],
  p_split_type text default 'equal')
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); eid uuid; n int := coalesce(array_length(p_member_ids, 1), 0);
        total bigint; k text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not public.is_group_member(p_group) then raise exception 'not a member of this group'; end if;
  if not public.rate_limit('gexp:' || uid, 120, 3600) then
    raise exception 'Too many expenses added — please slow down.';
  end if;
  if n = 0 then raise exception 'split between at least one person'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'amount must be zero or more'; end if;

  if p_shares is not null then
    if coalesce(array_length(p_shares, 1), 0) <> n then
      raise exception 'each person needs a share';
    end if;
    if exists (select 1 from unnest(p_shares) s where s < 0) then
      raise exception 'shares cannot be negative';
    end if;
    select sum(s) into total from unnest(p_shares) s;
    if total <> p_amount then
      raise exception 'the split must add up to the total';
    end if;
  end if;

  k := public.app_enc_key();
  insert into public.group_expenses
    (group_id, description_enc, amount_enc, currency, paid_by, spent_at, created_by, split_type)
    values (p_group, public.enc_text(p_description, k), public.enc_minor(p_amount, k),
            p_currency, p_paid_by, p_spent_at, uid,
            case when p_shares is null then 'equal' else coalesce(p_split_type, 'exact') end)
    returning id into eid;

  if p_shares is null then
    insert into public.expense_splits (expense_id, member_id, share_enc)
      select eid, s.member_id, public.enc_minor(s.share_minor, k)
      from public.split_equally(p_amount, p_member_ids) s;
  else
    insert into public.expense_splits (expense_id, member_id, share_enc)
      select eid, p_member_ids[i], public.enc_minor(p_shares[i], k) from generate_series(1, n) as i;
  end if;

  return eid;
end $$;

create or replace function public.update_group_expense_v2(
  p_expense uuid, p_description text, p_amount bigint, p_currency char(3),
  p_paid_by uuid, p_spent_at date, p_member_ids uuid[], p_shares bigint[],
  p_split_type text default 'equal')
returns void language plpgsql security definer set search_path = public as $$
declare gid uuid; creator uuid; n int := coalesce(array_length(p_member_ids, 1), 0);
        total bigint; k text;
begin
  select group_id, created_by into gid, creator from public.group_expenses where id = p_expense;
  if gid is null then raise exception 'expense not found'; end if;
  if not public.is_group_member(gid) then raise exception 'not a member'; end if;
  if not (creator = auth.uid() or public.is_group_owner(gid)) then
    raise exception 'Only the person who added this expense (or the group owner) can edit it.';
  end if;
  if n = 0 then raise exception 'split between at least one person'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'amount must be zero or more'; end if;

  if p_shares is not null then
    if coalesce(array_length(p_shares, 1), 0) <> n then
      raise exception 'each person needs a share';
    end if;
    if exists (select 1 from unnest(p_shares) s where s < 0) then
      raise exception 'shares cannot be negative';
    end if;
    select sum(s) into total from unnest(p_shares) s;
    if total <> p_amount then
      raise exception 'the split must add up to the total';
    end if;
  end if;

  k := public.app_enc_key();
  update public.group_expenses
    set description_enc = public.enc_text(p_description, k),
        amount_enc = public.enc_minor(p_amount, k), currency = p_currency,
        paid_by = p_paid_by, spent_at = p_spent_at,
        split_type = case when p_shares is null then 'equal' else coalesce(p_split_type, 'exact') end
    where id = p_expense;

  delete from public.expense_splits where expense_id = p_expense;
  if p_shares is null then
    insert into public.expense_splits (expense_id, member_id, share_enc)
      select p_expense, s.member_id, public.enc_minor(s.share_minor, k)
      from public.split_equally(p_amount, p_member_ids) s;
  else
    insert into public.expense_splits (expense_id, member_id, share_enc)
      select p_expense, p_member_ids[i], public.enc_minor(p_shares[i], k) from generate_series(1, n) as i;
  end if;
end $$;

-- v1 (equal re-split) becomes a thin wrapper over v2 — one write path. Same
-- signature, so existing grants are kept.
create or replace function public.update_group_expense(
  p_expense uuid, p_description text, p_amount bigint, p_currency char(3),
  p_paid_by uuid, p_spent_at date, p_member_ids uuid[])
returns void language sql security definer set search_path = public as $$
  select public.update_group_expense_v2(p_expense, p_description, p_amount, p_currency,
                                        p_paid_by, p_spent_at, p_member_ids, null, 'equal');
$$;

-- Personal mirror of a member's share: copies the ciphertext (same key), so
-- the mirror is encrypted too and nothing is decrypted here.
create or replace function public.sync_group_share()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_exp record;
begin
  if TG_OP = 'DELETE' then
    select user_id into v_user from public.group_members where id = OLD.member_id;
    if v_user is not null then
      delete from public.transactions
        where user_id = v_user and group_expense_id = OLD.expense_id;
    end if;
    return OLD;
  end if;

  select user_id into v_user from public.group_members where id = NEW.member_id;
  select * into v_exp from public.group_expenses where id = NEW.expense_id;
  if v_user is not null and v_exp.id is not null then
    insert into public.transactions
      (user_id, kind, amount_enc, currency, exchange_rate, description_enc,
       spent_at, is_shared, group_id, group_expense_id)
    values
      (v_user, 'expense', NEW.share_enc, v_exp.currency, 1, v_exp.description_enc,
       v_exp.spent_at, true, v_exp.group_id, NEW.expense_id)
    on conflict (user_id, group_expense_id) where group_expense_id is not null
    do update
      set amount_enc      = excluded.amount_enc,
          currency        = excluded.currency,
          description_enc = excluded.description_enc,
          spent_at        = excluded.spent_at;
  end if;
  return NEW;
end;
$$;

create or replace function public.sync_group_expense_meta()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.transactions
    set description_enc = NEW.description_enc, spent_at = NEW.spent_at, currency = NEW.currency
    where group_expense_id = NEW.id;
  return NEW;
end;
$$;

-- Audit trail: the summary quotes the (decrypted) description, so it is
-- stored encrypted; the amount copies the expense's ciphertext.
create or replace function public.log_group_expense()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor text; gid uuid; verb text; amt bytea; cur char(3); descr text; k text;
begin
  k := public.app_enc_key();
  if TG_OP = 'DELETE' then
    gid := OLD.group_id; verb := 'deleted'; amt := OLD.amount_enc; cur := OLD.currency;
    descr := coalesce(public.dec_text(OLD.description_enc, k), 'an expense');
  else
    gid := NEW.group_id; amt := NEW.amount_enc; cur := NEW.currency;
    descr := coalesce(public.dec_text(NEW.description_enc, k), 'an expense');
    verb := case when TG_OP = 'INSERT' then 'added' else 'edited' end;
  end if;
  select coalesce(display_name, 'Someone') into actor from public.profiles where id = auth.uid();
  insert into public.group_audit_log (group_id, actor_id, actor_name, action, summary_enc, amount_enc, currency)
  values (gid, auth.uid(), coalesce(actor, 'System'), 'expense_' || verb,
          public.enc_text(coalesce(actor, 'Someone') || ' ' || verb || ' “' || descr || '”', k),
          amt, cur);
  return null;
end $$;

create or replace function public.log_settlement()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor text; frm text; dst text;
begin
  select coalesce(display_name, 'Someone') into actor from public.profiles where id = auth.uid();
  select display_name into frm from public.group_members where id = NEW.from_member;
  select display_name into dst from public.group_members where id = NEW.to_member;
  insert into public.group_audit_log (group_id, actor_id, actor_name, action, summary_enc, amount_enc, currency)
  values (NEW.group_id, auth.uid(), coalesce(actor, 'System'), 'settlement_added',
          public.enc_text(coalesce(actor, 'Someone') || ' recorded a payment: '
                          || coalesce(frm, '?') || ' → ' || coalesce(dst, '?')),
          NEW.amount_enc, NEW.currency);
  return null;
end $$;

-- Fan-out bodies no longer quote the (encrypted) description.
create or replace function public.notify_group_expense()
returns trigger language plpgsql security definer set search_path = public as $$
declare gname text; actor text;
begin
  select name into gname from public.groups where id = NEW.group_id;
  select coalesce(display_name, 'Someone') into actor from public.profiles where id = NEW.created_by;
  insert into public.notifications (user_id, type, title, body, group_id, actor_id)
  select m.user_id, 'expense', coalesce(gname, 'Group') || ': new expense',
         actor || ' added an expense', NEW.group_id, NEW.created_by
  from public.group_members m
  where m.group_id = NEW.group_id and m.user_id is not null and m.user_id <> NEW.created_by;
  return NEW;
end $$;

create or replace function public.notify_group_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare gname text; actor text;
begin
  select name into gname from public.groups where id = NEW.group_id;
  select coalesce(display_name, 'Someone') into actor from public.profiles where id = NEW.author_id;
  insert into public.notifications (user_id, type, title, body, group_id, actor_id)
  select m.user_id, 'comment', coalesce(gname, 'Group') || ': new comment',
         actor || ' commented on '
           || case when NEW.target_type = 'expense' then 'an expense' else 'a settlement' end,
         NEW.group_id, NEW.author_id
  from public.group_members m
  where m.group_id = NEW.group_id and m.user_id is not null and m.user_id <> NEW.author_id;
  return NEW;
end $$;

-- ---------------------------------------------------------------------------
-- Group read RPCs. Same audience as the tables' SELECT policies; an outsider
-- gets nothing (null / no rows), exactly like RLS would return.
-- ---------------------------------------------------------------------------

-- Expenses (+ splits) and settlements for a group, newest first — the shape
-- getGroup() used to select directly.
create or replace function public.group_ledger(p_group uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare k text;
begin
  if not public.is_group_member(p_group) then return null; end if;
  k := public.app_enc_key();
  return jsonb_build_object(
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'group_id', e.group_id,
        'description', public.dec_text(e.description_enc, k),
        'amount_minor', public.dec_minor(e.amount_enc, k),
        'currency', e.currency, 'paid_by', e.paid_by, 'spent_at', e.spent_at,
        'created_by', e.created_by, 'created_at', e.created_at,
        'updated_at', e.updated_at, 'split_type', e.split_type,
        'expense_splits', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', s.id, 'expense_id', s.expense_id, 'member_id', s.member_id,
            'share_minor', public.dec_minor(s.share_enc, k)))
          from public.expense_splits s where s.expense_id = e.id), '[]'::jsonb)
      ) order by e.spent_at desc, e.created_at desc)
      from public.group_expenses e where e.group_id = p_group), '[]'::jsonb),
    'settlements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', st.id, 'group_id', st.group_id, 'from_member', st.from_member,
        'to_member', st.to_member, 'amount_minor', public.dec_minor(st.amount_enc, k),
        'currency', st.currency, 'note', public.dec_text(st.note_enc, k),
        'settled_at', st.settled_at, 'created_by', st.created_by, 'created_at', st.created_at
      ) order by st.settled_at desc, st.created_at desc)
      from public.settlements st where st.group_id = p_group), '[]'::jsonb));
end $$;
revoke execute on function public.group_ledger(uuid) from anon, public;
grant execute on function public.group_ledger(uuid) to authenticated;

create or replace function public.group_audit_entries(p_group uuid, p_limit int default 200)
returns table(id uuid, actor_name text, action text, summary text, amount_minor bigint,
              currency text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.id, a.actor_name, a.action, public.dec_text(a.summary_enc, k.k),
         public.dec_minor(a.amount_enc, k.k), a.currency::text, a.created_at
  from public.group_audit_log a
  cross join (select public.app_enc_key() as k) k
  where a.group_id = p_group and public.is_group_member(p_group)
  order by a.created_at desc
  limit p_limit  -- null = the full trail (group-report)
$$;
revoke execute on function public.group_audit_entries(uuid, int) from anon, public;
grant execute on function public.group_audit_entries(uuid, int) to authenticated;

create or replace function public.group_comments_for(p_group uuid, p_target uuid)
returns table(id uuid, body text, created_at timestamptz, author_member_id uuid,
              author_id uuid, author jsonb)
language sql stable security definer set search_path = public as $$
  select c.id, public.dec_text(c.body_enc, k.k), c.created_at, c.author_member_id, c.author_id,
         case when m.id is not null then jsonb_build_object('display_name', m.display_name) end
  from public.group_comments c
  cross join (select public.app_enc_key() as k) k
  left join public.group_members m on m.id = c.author_member_id
  where c.group_id = p_group and c.target_id = p_target
    and (public.is_group_member(p_group) or public.is_group_owner(p_group))
  order by c.created_at
$$;
revoke execute on function public.group_comments_for(uuid, uuid) from anon, public;
grant execute on function public.group_comments_for(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Group write RPCs.
-- ---------------------------------------------------------------------------

-- Record a settlement. Same rule as st_insert (any member); settlement_guard
-- still forces created_by and applies the 120/h flood limit, and the ledger
-- trigger still checks both members belong to the group.
create or replace function public.add_settlement(
  p_group uuid, p_from uuid, p_to uuid, p_amount bigint, p_currency char(3),
  p_settled_at date default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare k text; sid uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not public.is_group_member(p_group) then raise exception 'not a member of this group'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive'; end if;
  k := public.app_enc_key();
  insert into public.settlements (group_id, from_member, to_member, amount_enc, currency, settled_at, note_enc)
    values (p_group, p_from, p_to, public.enc_minor(p_amount, k), coalesce(p_currency, 'EUR'),
            coalesce(p_settled_at, current_date), public.enc_text(nullif(btrim(p_note), ''), k))
    returning id into sid;
  return sid;
end $$;
revoke execute on function public.add_settlement(uuid, uuid, uuid, bigint, char, date, text) from anon, public;
grant execute on function public.add_settlement(uuid, uuid, uuid, bigint, char, date, text) to authenticated;

-- Post a comment. Same rule as gc_insert (as yourself, under YOUR member row
-- in this group); the target must belong to the group; 1–2000 chars (the old
-- CHECK); and a flood limit, since every comment fans out to the group.
create or replace function public.add_group_comment(
  p_group uuid, p_target_type text, p_target_id uuid, p_author_member uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); cid uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.group_members m
                 where m.id = p_author_member and m.group_id = p_group and m.user_id = uid) then
    raise exception 'not allowed';
  end if;
  if not (
    (p_target_type = 'expense' and exists (
       select 1 from public.group_expenses e where e.id = p_target_id and e.group_id = p_group))
    or (p_target_type = 'settlement' and exists (
       select 1 from public.settlements s where s.id = p_target_id and s.group_id = p_group))
  ) then
    raise exception 'item not found';
  end if;
  if p_body is null or char_length(p_body) not between 1 and 2000 then
    raise exception 'A comment must be 1–2000 characters.';
  end if;
  if not public.rate_limit('comment:' || uid, 120, 3600) then
    raise exception 'Too many comments — please slow down.';
  end if;
  insert into public.group_comments (group_id, target_type, target_id, author_member_id, author_id, body_enc)
    values (p_group, p_target_type, p_target_id, p_author_member, uid, public.enc_text(p_body))
    returning id into cid;
  return cid;
end $$;
revoke execute on function public.add_group_comment(uuid, text, uuid, uuid, text) from anon, public;
grant execute on function public.add_group_comment(uuid, text, uuid, uuid, text) to authenticated;
