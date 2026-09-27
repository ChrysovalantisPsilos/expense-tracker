-- 0096: Plan mode's salary edit is part of the plan.
--
-- Plan mode shows a Salary row worked out from the user's salary entries when
-- the salary isn't a recurring rule. Its edit (a raise, or switched off) is
-- stored in the plan document as a top-level `salary` object and stays
-- plan-only: apply never sends it (the app leaves it out of p_apply).
--
-- 0095 treated a plan whose changes, adds and dismissed lists were all empty
-- as "no plan" and deleted it, so a plan holding only a salary edit was lost
-- on save. And recurring_plan_check didn't look at `salary` at all.
--
--   1. recurring_plan_check: `salary`, when present, is an object with only
--      amount_minor (a positive whole number, like every other amount) and/or
--      cancel (true). Anything else is 'bad plan'.
--   2. store_recurring_plan: a plan with a `salary` edit is kept.
-- Same signatures, pinned search_path and (revoked) grants as 0095; RLS and
-- the tables are untouched.

-- 1 ---------------------------------------------------------------------------
create or replace function public.recurring_plan_check(p jsonb)
returns void
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare e jsonb; s jsonb;
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
  if p ? 'salary' then
    s := p->'salary';
    -- One test at a time: SQL doesn't promise to stop at the first false
    -- one, and jsonb_object_keys fails on anything but an object.
    if jsonb_typeof(s) <> 'object' then raise exception 'bad plan'; end if;
    if exists (select 1 from jsonb_object_keys(s) k where k not in ('amount_minor', 'cancel'))
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
end $$;
revoke execute on function public.recurring_plan_check(jsonb) from public, anon, authenticated;

-- 2 ---------------------------------------------------------------------------
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
                   and not p ? 'salary') then
    delete from public.recurring_plans where user_id = uid;
    return;
  end if;
  insert into public.recurring_plans (user_id, payload_enc, updated_at)
  values (uid, public.enc_text(p::text, k), now())
  on conflict (user_id) do update set payload_enc = excluded.payload_enc, updated_at = now();
end $$;
revoke execute on function public.store_recurring_plan(uuid, jsonb, text) from public, anon, authenticated;
