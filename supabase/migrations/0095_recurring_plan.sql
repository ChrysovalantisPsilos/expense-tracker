-- 0095: Plan mode — a sandbox for the user's recurring payments and income.
--
-- The user tries changes to their recurring rules (cancel one, change an
-- amount or how often it charges, add a hypothetical new cost or income) and
-- sees how their monthly net would move. Nothing real changes until they
-- apply. The maths lives on the device (src/features/plan/planMath.js); the
-- server keeps the plan, applies it atomically and can undo the last apply.
--
-- 1. recurring_plans — ONE plan per account (user_id is the key), so it
--    follows the user across devices. The whole plan is one JSON document,
--    encrypted at rest like other amounts and text (enc_text + app_enc_key):
--      { v: 1, changes: [{ rule_id, snap: {…}, cancel? | amount_minor?,
--        currency?, frequency?, interval_n? }], adds: [{ id, kind, name,
--        amount_minor, currency, frequency, interval_n, start, category_id }],
--        dismissed: ['<idea id>'] }
--    `snap` is the rule as it was when the change was planned (the client
--    compares it with today's rule to say "Updated since your plan").
-- 2. recurring_plan_undo — the last apply, for 24 hours: each touched rule's
--    prior state and the ids of the rules it created (encrypted), when it
--    happened and how many changes it made. Only the latest apply is kept.
--    Both tables: RLS on, no policies and no grants — reached only through
--    the definer functions below. A BEFORE trigger forces user_id to the
--    caller on every write, so even a definer path can't file a row under
--    someone else.
-- 3. The RPCs (SECURITY DEFINER, search_path pinned, EXECUTE only for
--    authenticated):
--      my_recurring_plan()                 { plan, undo } for the caller
--      save_recurring_plan(plan)           validates the shape, 64 KB cap,
--                                          600 saves/hour (the app debounces)
--      clear_recurring_plan()              "Start over"
--      apply_recurring_plan(apply, rest)   one transaction: every rule_id must
--                                          be the caller's; a cancel sets
--                                          is_active = false (never deletes,
--                                          history is kept); an edit sets
--                                          amount/currency/frequency/interval
--                                          from the next charge; an add
--                                          creates a rule. All through
--                                          save_recurring_rule (0085), so the
--                                          encryption, ownership checks and the
--                                          200-rule cap are the app's own.
--                                          Stores the undo snapshot and saves
--                                          `rest` (the changes not applied) as
--                                          the plan. 30/hour.
--      undo_recurring_plan()               within 24 hours of the apply: puts
--                                          every touched rule back (amount,
--                                          currency, frequency, interval,
--                                          active) and deletes the rules it
--                                          created (their entries stay, as for
--                                          any deleted rule). Refused after
--                                          that. 30/hour.
-- 4. export_my_data() (0076) also returns the plan and the undo record.
--    Account deletion needs nothing new: both tables cascade from auth.users.
-- 5. demo_wipe (0090) also clears the demo accounts' plans and undo records.

-- 1, 2 ------------------------------------------------------------------------
create table if not exists public.recurring_plans (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  payload_enc bytea not null,
  updated_at  timestamptz not null default now()
);
alter table public.recurring_plans enable row level security;
revoke all on public.recurring_plans from public, anon, authenticated;

create table if not exists public.recurring_plan_undo (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  snapshot_enc bytea not null,
  applied_at   timestamptz not null default now(),
  change_count int not null check (change_count > 0)
);
alter table public.recurring_plan_undo enable row level security;
revoke all on public.recurring_plan_undo from public, anon, authenticated;

-- A row always belongs to the signed-in caller, and never moves account.
create or replace function public.recurring_plan_owner_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null then new.user_id := auth.uid(); end if;
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'not allowed';
  end if;
  return new;
end $$;
revoke execute on function public.recurring_plan_owner_guard() from public, anon, authenticated;

drop trigger if exists recurring_plans_owner_guard on public.recurring_plans;
create trigger recurring_plans_owner_guard
  before insert or update on public.recurring_plans
  for each row execute function public.recurring_plan_owner_guard();
drop trigger if exists recurring_plan_undo_owner_guard on public.recurring_plan_undo;
create trigger recurring_plan_undo_owner_guard
  before insert or update on public.recurring_plan_undo
  for each row execute function public.recurring_plan_owner_guard();

-- 3 ---------------------------------------------------------------------------
-- The plan document's shape (see the header). Raises 'bad plan' for anything
-- the app never sends, and a user-facing message past the size cap.
create or replace function public.recurring_plan_check(p jsonb)
returns void
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare e jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' or p->'v' is distinct from '1'::jsonb then
    raise exception 'bad plan';
  end if;
  if octet_length(p::text) > 65536 then raise exception 'Your plan is too big.'; end if;
  if jsonb_typeof(coalesce(p->'changes', '[]')) <> 'array'
     or jsonb_typeof(coalesce(p->'adds', '[]')) <> 'array'
     or jsonb_typeof(coalesce(p->'dismissed', '[]')) <> 'array'
     or jsonb_array_length(coalesce(p->'changes', '[]')) > 200
     or jsonb_array_length(coalesce(p->'adds', '[]')) > 50
     or jsonb_array_length(coalesce(p->'dismissed', '[]')) > 100 then
    raise exception 'bad plan';
  end if;
  for e in select * from jsonb_array_elements(coalesce(p->'changes', '[]')) loop
    if jsonb_typeof(e) <> 'object' or jsonb_typeof(e->'snap') is distinct from 'object'
       or coalesce(e->>'rule_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'bad plan';
    end if;
  end loop;
  for e in select * from jsonb_array_elements(coalesce(p->'adds', '[]')) loop
    if jsonb_typeof(e) <> 'object' or jsonb_typeof(e->'id') is distinct from 'string' then
      raise exception 'bad plan';
    end if;
  end loop;
  for e in select * from jsonb_array_elements(coalesce(p->'dismissed', '[]')) loop
    if jsonb_typeof(e) <> 'string' or length(e #>> '{}') > 120 then raise exception 'bad plan'; end if;
  end loop;
end $$;
revoke execute on function public.recurring_plan_check(jsonb) from public, anon, authenticated;

-- A rule's schedule and amount as apply sends them, checked and normalised
-- for save_recurring_rule: { amount_minor, currency, frequency, interval_n }.
create or replace function public.recurring_plan_fields(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if jsonb_typeof(p->'amount_minor') is distinct from 'number'
     or (p->>'amount_minor') !~ '^[0-9]{1,15}$' or (p->>'amount_minor')::bigint <= 0
     or coalesce(p->>'currency', '') !~ '^[A-Z]{3}$'
     or coalesce(p->>'frequency', '') not in ('daily', 'weekly', 'monthly', 'yearly')
     or jsonb_typeof(p->'interval_n') is distinct from 'number'
     or (p->>'interval_n') !~ '^[0-9]{1,3}$' or (p->>'interval_n')::int not between 1 and 365 then
    raise exception 'bad plan';
  end if;
  return jsonb_build_object(
    'amount_minor', (p->>'amount_minor')::bigint, 'currency', p->>'currency',
    'frequency', p->>'frequency', 'interval_n', (p->>'interval_n')::int);
end $$;
revoke execute on function public.recurring_plan_fields(jsonb) from public, anon, authenticated;

-- Store (or, with an empty/null plan, remove) the caller's plan. Called only
-- from the definer functions below.
create or replace function public.store_recurring_plan(uid uuid, p jsonb, k text)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if p is not null then perform public.recurring_plan_check(p); end if;
  if p is null or (jsonb_array_length(coalesce(p->'changes', '[]')) = 0
                   and jsonb_array_length(coalesce(p->'adds', '[]')) = 0
                   and jsonb_array_length(coalesce(p->'dismissed', '[]')) = 0) then
    delete from public.recurring_plans where user_id = uid;
    return;
  end if;
  insert into public.recurring_plans (user_id, payload_enc, updated_at)
  values (uid, public.enc_text(p::text, k), now())
  on conflict (user_id) do update set payload_enc = excluded.payload_enc, updated_at = now();
end $$;
revoke execute on function public.store_recurring_plan(uuid, jsonb, text) from public, anon, authenticated;

create or replace function public.my_recurring_plan()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare uid uuid := auth.uid(); k text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  k := public.app_enc_key();
  return jsonb_build_object(
    'plan', (select public.dec_text(p.payload_enc, k)::jsonb
               from public.recurring_plans p where p.user_id = uid),
    'undo', (select jsonb_build_object(
                      'applied_at', u.applied_at, 'change_count', u.change_count,
                      'undo_until', u.applied_at + interval '24 hours')
               from public.recurring_plan_undo u where u.user_id = uid));
end $$;

create or replace function public.save_recurring_plan(p_plan jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not public.rate_limit('plan-save:' || uid, 600, 3600) then
    raise exception 'Too many saves — please slow down.';
  end if;
  if p_plan is null then raise exception 'bad plan'; end if;
  perform public.store_recurring_plan(uid, p_plan, public.app_enc_key());
end $$;

create or replace function public.clear_recurring_plan()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  delete from public.recurring_plans where user_id = uid;
end $$;

-- p_apply: { changes: [{ rule_id, cancel: true } | { rule_id, amount_minor,
--   currency, frequency, interval_n }], adds: [{ kind, description,
--   amount_minor, currency, frequency, interval_n, next_run, category_id }] }
-- p_remaining: the plan without the applied changes (null or empty: none left).
-- Returns { applied_at, change_count, undo_until }.
create or replace function public.apply_recurring_plan(p_apply jsonb, p_remaining jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare uid uuid := auth.uid(); k text; e jsonb; f jsonb; rid uuid; ids uuid[];
        changes jsonb; adds jsonb; n int; prior jsonb; created jsonb := '[]'::jsonb;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not public.rate_limit('plan-apply:' || uid, 30, 3600) then
    raise exception 'Too many changes — please try again later.';
  end if;
  if p_apply is null or jsonb_typeof(p_apply) <> 'object'
     or jsonb_typeof(coalesce(p_apply->'changes', '[]')) <> 'array'
     or jsonb_typeof(coalesce(p_apply->'adds', '[]')) <> 'array' then
    raise exception 'bad plan';
  end if;
  changes := coalesce(p_apply->'changes', '[]');
  adds := coalesce(p_apply->'adds', '[]');
  n := jsonb_array_length(changes) + jsonb_array_length(adds);
  if n = 0 or jsonb_array_length(changes) > 200 or jsonb_array_length(adds) > 50 then
    raise exception 'bad plan';
  end if;
  if p_remaining is not null then perform public.recurring_plan_check(p_remaining); end if;

  -- Every change names one of the caller's own rules, each at most once.
  for e in select * from jsonb_array_elements(changes) loop
    if jsonb_typeof(e) <> 'object'
       or coalesce(e->>'rule_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'bad plan';
    end if;
  end loop;
  ids := array(select (c.v->>'rule_id')::uuid from jsonb_array_elements(changes) as c(v));
  if (select count(distinct x) from unnest(ids) x) <> cardinality(ids) then raise exception 'bad plan'; end if;
  perform 1 from public.recurring_rules r where r.id = any(ids) and r.user_id = uid for update;
  if (select count(*) from public.recurring_rules r where r.id = any(ids) and r.user_id = uid)
     <> cardinality(ids) then
    raise exception 'not found';
  end if;

  -- What each touched rule was, for undo.
  k := public.app_enc_key();
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'amount_minor', public.dec_minor(r.amount_enc, k), 'currency', r.currency,
           'frequency', r.frequency, 'interval_n', r.interval_n, 'is_active', r.is_active)), '[]'::jsonb)
    into prior
    from public.recurring_rules r where r.id = any(ids) and r.user_id = uid;

  for e in select * from jsonb_array_elements(changes) loop
    if e->'cancel' = 'true'::jsonb then
      perform public.save_recurring_rule((e->>'rule_id')::uuid, jsonb_build_object('is_active', false));
    else
      perform public.save_recurring_rule((e->>'rule_id')::uuid, public.recurring_plan_fields(e));
    end if;
  end loop;

  for e in select * from jsonb_array_elements(adds) loop
    if jsonb_typeof(e) <> 'object' or coalesce(e->>'kind', '') not in ('expense', 'income')
       or coalesce(e->>'next_run', '') !~ '^\d{4}-\d{2}-\d{2}$'
       or (e ? 'description' and jsonb_typeof(e->'description') not in ('string', 'null'))
       or length(coalesce(e->>'description', '')) > 200
       or (e->>'category_id' is not null
           and e->>'category_id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
      raise exception 'bad plan';
    end if;
    f := public.recurring_plan_fields(e) || jsonb_build_object(
      'kind', e->>'kind',
      'description', nullif(btrim(coalesce(e->>'description', '')), ''),
      -- A new rule starts on its date, never in the past (no back-filled charges).
      'next_run', greatest((e->>'next_run')::date, current_date),
      'category_id', e->>'category_id');
    rid := public.save_recurring_rule(null, f);
    created := created || to_jsonb(rid);
  end loop;

  insert into public.recurring_plan_undo (user_id, snapshot_enc, applied_at, change_count)
  values (uid, public.enc_text(jsonb_build_object('rules', prior, 'created', created)::text, k), now(), n)
  on conflict (user_id) do update set
    snapshot_enc = excluded.snapshot_enc, applied_at = excluded.applied_at, change_count = excluded.change_count;

  perform public.store_recurring_plan(uid, p_remaining, k);
  return jsonb_build_object('applied_at', now(), 'change_count', n, 'undo_until', now() + interval '24 hours');
end $$;

-- Put the last apply back, within 24 hours. Returns how many changes it undid.
create or replace function public.undo_recurring_plan()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare uid uuid := auth.uid(); k text; u record; s jsonb; r jsonb;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not public.rate_limit('plan-undo:' || uid, 30, 3600) then
    raise exception 'Too many changes — please try again later.';
  end if;
  select * into u from public.recurring_plan_undo where user_id = uid for update;
  if not found or u.applied_at < now() - interval '24 hours' then
    raise exception 'Undo is no longer available.';
  end if;
  k := public.app_enc_key();
  s := public.dec_text(u.snapshot_enc, k)::jsonb;
  for r in select * from jsonb_array_elements(coalesce(s->'rules', '[]')) loop
    -- A rule deleted since the apply has nothing to put back.
    if exists (select 1 from public.recurring_rules x where x.id = (r->>'id')::uuid and x.user_id = uid) then
      perform public.save_recurring_rule((r->>'id')::uuid, jsonb_build_object(
        'amount_minor', (r->>'amount_minor')::bigint, 'currency', r->>'currency',
        'frequency', r->>'frequency', 'interval_n', (r->>'interval_n')::int,
        'is_active', (r->>'is_active')::boolean));
    end if;
  end loop;
  delete from public.recurring_rules x
   where x.user_id = uid
     and x.id in (select (c #>> '{}')::uuid from jsonb_array_elements(coalesce(s->'created', '[]')) c);
  delete from public.recurring_plan_undo where user_id = uid;
  return u.change_count;
end $$;

revoke execute on function public.my_recurring_plan() from public, anon, authenticated;
revoke execute on function public.save_recurring_plan(jsonb) from public, anon, authenticated;
revoke execute on function public.clear_recurring_plan() from public, anon, authenticated;
revoke execute on function public.apply_recurring_plan(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.undo_recurring_plan() from public, anon, authenticated;
grant execute on function public.my_recurring_plan() to authenticated;
grant execute on function public.save_recurring_plan(jsonb) to authenticated;
grant execute on function public.clear_recurring_plan() to authenticated;
grant execute on function public.apply_recurring_plan(jsonb, jsonb) to authenticated;
grant execute on function public.undo_recurring_plan() to authenticated;

-- 4 ---------------------------------------------------------------------------
-- As 0076, plus the plan and the undo record (decrypted, the caller's only).
create or replace function public.export_my_data()
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); doc jsonb; k text;
begin
  doc := public.build_my_data_export();   -- checks the caller and the 10/h limit
  perform public.enqueue_privacy_email(uid, 'data_export');
  k := public.app_enc_key();
  return doc || jsonb_build_object(
    'privacy_emails', (select coalesce(jsonb_agg(jsonb_build_object(
        'kind', q.kind, 'last_event_at', q.last_event_at, 'last_sent_at', q.last_sent_at,
        'next_due_at', q.due_at) order by q.kind), '[]'::jsonb)
      from public.privacy_email_queue q where q.user_id = uid),
    'legal_update_emails', (select coalesce(jsonb_agg(jsonb_build_object(
        'privacy_version', n.privacy_version, 'terms_version', n.terms_version,
        'emailed_at', n.emailed_at)), '[]'::jsonb)
      from public.legal_update_notices n where n.user_id = uid),
    'recurring_plan', (select jsonb_build_object(
        'plan', public.dec_text(p.payload_enc, k)::jsonb, 'updated_at', p.updated_at)
      from public.recurring_plans p where p.user_id = uid),
    'recurring_plan_undo', (select jsonb_build_object(
        'applied_at', u.applied_at, 'change_count', u.change_count,
        'snapshot', public.dec_text(u.snapshot_enc, k)::jsonb)
      from public.recurring_plan_undo u where u.user_id = uid));
end $$;

-- 5 ---------------------------------------------------------------------------
-- As 0090, plus the plan and its undo record.
create or replace function public.demo_wipe(p_ids uuid[])
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  delete from public.notifications where user_id = any(p_ids);
  delete from public.groups where owner_id = any(p_ids);
  delete from public.group_invites where created_by = any(p_ids) or invited_user_id = any(p_ids);
  update public.profiles set salary_category_id = null where id = any(p_ids);
  delete from public.recurring_plans where user_id = any(p_ids);
  delete from public.recurring_plan_undo where user_id = any(p_ids);
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
