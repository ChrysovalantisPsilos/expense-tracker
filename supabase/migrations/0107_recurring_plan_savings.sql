-- 0107: Plan mode counts the money set aside as savings from income.
--
-- A recurring "saved from income" rule (income in a savings category with
-- savings_from_income, 0084) lowers what's left each month, exactly like
-- Home's net, so Plan now lists it in its own Savings group and lets the user
-- change, stop or add one like any payment (src/features/plan/planMath.js).
-- Changes to an existing savings rule already went through apply unchanged:
-- recurring_plan_fields sets only amount, currency, frequency and interval,
-- so save_recurring_rule keeps the rule's category and savings_from_income.
-- What was missing:
--
--   1. apply_recurring_plan: an added item can be savings. The app sends it
--      as income in its savings category with savings_from_income = true;
--      the flag is passed on to save_recurring_rule (0095 dropped it, so a new
--      savings rule would have been "received" savings that the plan leaves
--      out). The flag must be a boolean, true only on income, and a savings
--      add must name its category; anything else is 'bad plan'.
--   2. recurring_plan_check: the plan document can hold a `savings` edit
--      beside 0096's `salary` one — the what-if on the Savings row the app
--      works out from savings entries when there's no recurring savings rule.
--      Same shape: an object with only amount_minor (a positive whole number)
--      and/or cancel (true). Plan-only: apply never sends it.
--   3. store_recurring_plan: a plan holding only a savings edit is kept.
--
-- Same signatures, pinned search_path and grants as 0095/0096 (restated
-- below); RLS and the tables are untouched. Plans saved before stay valid.

-- 1 ---------------------------------------------------------------------------
-- p_apply: { changes: [{ rule_id, cancel: true } | { rule_id, amount_minor,
--   currency, frequency, interval_n }], adds: [{ kind, description,
--   amount_minor, currency, frequency, interval_n, next_run, category_id,
--   savings_from_income? }] }
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
    -- Savings from income: a boolean, only on income, and always in a category.
    if e ? 'savings_from_income' then
      if jsonb_typeof(e->'savings_from_income') <> 'boolean' then raise exception 'bad plan'; end if;
      if e->'savings_from_income' = 'true'::jsonb and (e->>'kind' <> 'income' or e->>'category_id' is null) then
        raise exception 'bad plan';
      end if;
    end if;
    f := public.recurring_plan_fields(e) || jsonb_build_object(
      'kind', e->>'kind',
      'description', nullif(btrim(coalesce(e->>'description', '')), ''),
      -- A new rule starts on its date, never in the past (no back-filled charges).
      'next_run', greatest((e->>'next_run')::date, current_date),
      'category_id', e->>'category_id',
      'savings_from_income', coalesce((e->>'savings_from_income')::boolean, false));
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
revoke execute on function public.apply_recurring_plan(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_recurring_plan(jsonb, jsonb) to authenticated;

-- 2 ---------------------------------------------------------------------------
-- The plan document's shape (0095, 0096), plus the `savings` edit.
create or replace function public.recurring_plan_check(p jsonb)
returns void
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare e jsonb; s jsonb; key text;
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
  -- The derived rows' plan-only edits: the salary (0096) and the savings.
  foreach key in array array['salary', 'savings'] loop
    if p ? key then
      s := p->key;
      -- One test at a time: SQL doesn't promise to stop at the first false
      -- one, and jsonb_object_keys fails on anything but an object.
      if jsonb_typeof(s) <> 'object' then raise exception 'bad plan'; end if;
      if exists (select 1 from jsonb_object_keys(s) x where x not in ('amount_minor', 'cancel'))
         or not (s ? 'amount_minor' or s ? 'cancel') then
        raise exception 'bad plan';
      end if;
      if s ? 'amount_minor' then
        if jsonb_typeof(s->'amount_minor') <> 'number' or (s->>'amount_minor') !~ '^[0-9]{1,15}$' then
          raise exception 'bad plan';
        end if;
        if (s->>'amount_minor')::bigint <= 0 then raise exception 'bad plan'; end if;
      end if;
      if s ? 'cancel' and s->'cancel' is distinct from 'true'::jsonb then raise exception 'bad plan'; end if;
    end if;
  end loop;
end $$;
revoke execute on function public.recurring_plan_check(jsonb) from public, anon, authenticated;

-- 3 ---------------------------------------------------------------------------
create or replace function public.store_recurring_plan(uid uuid, p jsonb, k text)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if p is not null then perform public.recurring_plan_check(p); end if;
  if p is null or (jsonb_array_length(coalesce(p->'changes', '[]')) = 0
                   and jsonb_array_length(coalesce(p->'adds', '[]')) = 0
                   and jsonb_array_length(coalesce(p->'dismissed', '[]')) = 0
                   and not p ? 'salary' and not p ? 'savings') then
    delete from public.recurring_plans where user_id = uid;
    return;
  end if;
  insert into public.recurring_plans (user_id, payload_enc, updated_at)
  values (uid, public.enc_text(p::text, k), now())
  on conflict (user_id) do update set payload_enc = excluded.payload_enc, updated_at = now();
end $$;
revoke execute on function public.store_recurring_plan(uuid, jsonb, text) from public, anon, authenticated;
