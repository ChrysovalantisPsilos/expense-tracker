-- 0062: per-expense currency in groups, and a server-side ECB rate cache so
-- server-written rows (mirrored group shares, materialised recurring entries)
-- are never booked at a made-up rate of 1.
--
-- A. Group expenses in any currency (the travel case: a EUR group paying for
--    something in GBP).
--    * group_expenses.exchange_rate: expense currency → GROUP currency, the
--      ECB rate for the expense's date captured by the client (or typed by
--      the user when none can be fetched), exactly like a personal expense.
--      1 when the expense is in the group currency.
--    * amount_enc keeps the ORIGINAL amount in the expense currency (what was
--      paid, shown on the row and in the audit log). Everything that settles
--      money uses the amount in the GROUP currency:
--         group amount = to_base_minor(amount, rate, currency, group currency)
--      and the splits (expense_splits.share_enc) are in group-currency minor
--      units and must add up to that group amount. The client computes the
--      same number with toBaseMinor (currency.js) — exact integer arithmetic
--      on both sides, so the JS preview and this authoritative value can't
--      disagree by a cent (tests on both sides use the same vectors).
--    * _group_net (balances, settle plan, group-report, leave guard) credits
--      the payer with the group amount; group_ledger returns exchange_rate and
--      group_amount_minor; the audit summary names the converted amount.
--
-- B. Mirrored personal shares (sync_group_share) are stored in the GROUP
--    currency (the share's real unit — it used to copy the expense currency)
--    with exchange_rate = group currency → the member's base currency.
--
--    Design: server-side ECB cache, filled by the database itself.
--    * fx_rates(rate_date, currency, per_eur): ECB reference rates, fetched
--      from Frankfurter (the same ECB source the client uses) by pg_net and
--      ingested by a pg_cron job (fx_sync, every 5 minutes). No client can
--      write it (RLS on, no policies, no grants), so a user can't poison the
--      rate used for other members' personal totals — which is why this isn't
--      "filled by the client".
--    * fx_rate(from, to, day): the rate in effect on `day` (that day's, else
--      the latest of the previous 10 days — weekends/holidays; a future day
--      uses today's), cross-computed from the EUR rates. null when unknown.
--    * A row the cache can't rate yet gets exchange_rate = NULL ("pending")
--      instead of 1, a fetch covering its date is queued immediately, and
--      fx_sync rates it within minutes. Until then the client converts it at
--      read time with the same ECB rate (fx.js fillPendingRates), so a
--      member's personal totals are right from the first render.
--    * materialize_recurring_rules uses the same cache for foreign-currency
--      rules (it stored rate 1 before).
--    transactions.exchange_rate therefore becomes nullable (NULL = pending)
--    and loses its default of 1, so a writer that forgets the rate produces a
--    visible pending row, never a silent 1:1. to_base_minor returns NULL for a
--    pending foreign row (sums skip it) instead of treating it as 1.

-- ---------------------------------------------------------------------------
-- 1. The ECB rate cache
-- ---------------------------------------------------------------------------
create table if not exists public.fx_rates (
  rate_date date not null,
  currency  char(3) not null check (currency ~ '^[A-Z]{3}$'),
  per_eur   numeric(18, 8) not null check (per_eur > 0),
  primary key (rate_date, currency)
);
create index if not exists fx_rates_currency_date on public.fx_rates (currency, rate_date desc);
alter table public.fx_rates enable row level security;
revoke all on public.fx_rates from public, anon, authenticated;

-- One row per pg_net request (the response lands in net._http_response).
create table if not exists public.fx_fetches (
  request_id   bigint primary key,
  url          text not null,
  requested_at timestamptz not null default now(),
  ingested_at  timestamptz,
  ok           boolean
);
alter table public.fx_fetches enable row level security;
revoke all on public.fx_fetches from public, anon, authenticated;

create or replace function public.fx_rate(p_from text, p_to text, p_on date)
returns numeric
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when upper(p_from) = upper(p_to) then 1::numeric
    else (
      select round(t.per_eur / f.per_eur, 8)
        from public.fx_rates f
        join public.fx_rates t on t.rate_date = f.rate_date and t.currency = upper(p_to)
       where f.currency = upper(p_from)
         and f.rate_date <= least(coalesce(p_on, current_date), current_date)
         and f.rate_date >  least(coalesce(p_on, current_date), current_date) - 10
       order by f.rate_date desc
       limit 1)
  end
$$;

-- Queue one Frankfurter request if the cache needs one: first the oldest
-- pending row's dates, else the latest business days (at most every 3h), else
-- nothing. One request in flight at a time. Returns the pg_net id or null.
create or replace function public.fx_request()
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare latest date; want date; last_at timestamptz; rid bigint; url text;
        api constant text := 'https://api.frankfurter.dev/v1';
begin
  if exists (select 1 from public.fx_fetches
              where ingested_at is null and requested_at > now() - interval '10 minutes') then
    return null;
  end if;
  select max(rate_date) into latest from public.fx_rates;
  select max(requested_at) into last_at from public.fx_fetches;
  -- Pending rows whose dates the cache doesn't cover at all (a row the cache
  -- covers but still can't rate — a currency the ECB doesn't publish — must
  -- not trigger a refetch loop).
  select min(t.spent_at) into want
    from public.transactions t
   where t.exchange_rate is null and t.spent_at >= date '1999-01-11'
     and not exists (select 1 from public.fx_rates r
                      where r.rate_date <= least(t.spent_at, current_date)
                        and r.rate_date >  least(t.spent_at, current_date) - 10);
  if want is not null then
    url := format('%s/%s..%s?base=EUR', api, least(want, current_date) - 7,
                  least(want + 180, current_date));
  elsif latest is null then
    url := format('%s/%s..?base=EUR', api, current_date - 400);
  elsif latest < current_date and (last_at is null or last_at < now() - interval '3 hours') then
    url := format('%s/%s..?base=EUR', api, latest - 7);
  else
    return null;
  end if;
  rid := net.http_get(url, timeout_milliseconds => 20000);
  insert into public.fx_fetches (request_id, url) values (rid, url);
  return rid;
end $$;

-- Parse one Frankfurter range answer ({"rates": {"YYYY-MM-DD": {"GBP": 0.85,
-- …}}}) into fx_rates. EUR is stored as 1 so cross rates are a plain join.
-- Returns rows written; anything malformed is skipped, never half-trusted.
create or replace function public.fx_store_rates(p_body jsonb)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare n int := 0;
begin
  if jsonb_typeof(p_body -> 'rates') is distinct from 'object' then return 0; end if;
  with days as (
    select d.key::date as day, d.value as rates
      from jsonb_each(p_body -> 'rates') d
     where d.key ~ '^\d{4}-\d{2}-\d{2}$' and jsonb_typeof(d.value) = 'object'),
  vals as (
    select day, c.key as currency,
           case when jsonb_typeof(c.value) = 'number' then (c.value::text)::numeric end as v
      from days cross join lateral jsonb_each(days.rates) c
     where c.key ~ '^[A-Z]{3}$'
    union all
    select day, 'EUR', 1 from days)
  insert into public.fx_rates (rate_date, currency, per_eur)
  select day, currency, round(v, 8) from vals where v > 0 and v < 1e9
  on conflict (rate_date, currency) do update set per_eur = excluded.per_eur;
  get diagnostics n = row_count;
  return n;
end $$;

-- Rate every pending row the cache can now rate. Returns rows rated.
create or replace function public.fx_apply_pending()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare n int;
begin
  update public.transactions t set exchange_rate = x.rate
    from (select p.id,
                 case when upper(p.currency) = upper(p.base) then 1::numeric
                      else public.fx_rate(p.currency, p.base, p.spent_at) end as rate
            from (select t2.id, t2.currency::text as currency, t2.spent_at,
                         coalesce(pr.base_currency, 'EUR')::text as base
                    from public.transactions t2
                    left join public.profiles pr on pr.id = t2.user_id
                   where t2.exchange_rate is null) p) x
   where t.id = x.id and x.rate is not null;
  get diagnostics n = row_count;
  return n;
end $$;

-- The cron job: ingest finished responses, rate pending rows, queue the next
-- request if one is needed. Returns rates written.
create or replace function public.fx_sync()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r record; body jsonb; n int := 0; wrote int;
begin
  for r in
    select f.request_id, h.status_code, h.content
      from public.fx_fetches f join net._http_response h on h.id = f.request_id
     where f.ingested_at is null
  loop
    wrote := 0;
    if r.status_code = 200 then
      begin
        body := r.content::jsonb;
        wrote := public.fx_store_rates(body);
      exception when others then wrote := 0;
      end;
    end if;
    update public.fx_fetches set ingested_at = now(), ok = wrote > 0 where request_id = r.request_id;
    n := n + wrote;
  end loop;
  -- A request pg_net lost (no response after an hour) no longer blocks.
  update public.fx_fetches set ingested_at = now(), ok = false
   where ingested_at is null and requested_at < now() - interval '1 hour';
  delete from public.fx_fetches where requested_at < now() - interval '7 days';

  perform public.fx_apply_pending();
  perform public.fx_request();
  return n;
end $$;

revoke execute on function public.fx_rate(text, text, date) from public, anon, authenticated;
revoke execute on function public.fx_request() from public, anon, authenticated;
revoke execute on function public.fx_store_rates(jsonb) from public, anon, authenticated;
revoke execute on function public.fx_apply_pending() from public, anon, authenticated;
revoke execute on function public.fx_sync() from public, anon, authenticated;

select cron.schedule('fx-sync', '*/5 * * * *', 'select public.fx_sync();');

-- ---------------------------------------------------------------------------
-- 2. Pending rates on transactions
-- ---------------------------------------------------------------------------
alter table public.transactions alter column exchange_rate drop not null;
alter table public.transactions alter column exchange_rate drop default;
alter table public.transactions drop constraint if exists transactions_exchange_rate_positive;
alter table public.transactions
  add constraint transactions_exchange_rate_positive
  check (exchange_rate is null or exchange_rate > 0) not valid;
do $$
begin
  if not exists (select 1 from public.transactions where exchange_rate <= 0) then
    alter table public.transactions validate constraint transactions_exchange_rate_positive;
  end if;
end $$;
create index if not exists transactions_pending_fx
  on public.transactions (spent_at) where exchange_rate is null;

-- A pending foreign row has no base value yet (NULL, skipped by sums) — never
-- the amount itself as if the rate were 1.
create or replace function public.to_base_minor(p_minor bigint, p_rate numeric, p_from text, p_base text)
returns bigint
language sql
immutable parallel safe
set search_path = public, pg_temp
as $$
  select case
    when p_rate is null and upper(coalesce(p_from, p_base)) <> upper(p_base) then null
    else round(p_minor::numeric * coalesce(p_rate, 1) * public.minor_factor(p_base)
               / public.minor_factor(coalesce(p_from, p_base)))::bigint
  end;
$$;

-- "12.34 EUR" (the edge functions' fmtMinor format) for audit summaries.
create or replace function public.fmt_minor_plain(p_minor bigint, p_currency text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when public.minor_factor(p_currency) = 1
              then p_minor::text
              else to_char(p_minor / 100.0, 'FM999999999999990.00') end || ' ' || p_currency
$$;
revoke execute on function public.fmt_minor_plain(bigint, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Group expenses in any currency
-- ---------------------------------------------------------------------------
alter table public.group_expenses
  add column if not exists exchange_rate numeric(18, 8) not null default 1;
alter table public.group_expenses drop constraint if exists group_expenses_exchange_rate_positive;
alter table public.group_expenses
  add constraint group_expenses_exchange_rate_positive check (exchange_rate > 0);

-- Shared validation for create/update: the expense currency, its rate to the
-- group currency, and the amount in group-currency minor units.
create or replace function public.group_expense_amount(
  p_group uuid, p_amount bigint, p_currency text, p_rate numeric,
  out currency text, out rate numeric, out group_amount bigint)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare gcur text;
begin
  select g.currency::text into gcur from public.groups g where g.id = p_group;
  if gcur is null then raise exception 'group not found'; end if;
  currency := upper(coalesce(nullif(btrim(p_currency), ''), gcur));
  if currency !~ '^[A-Z]{3}$' then raise exception 'unknown currency'; end if;
  if currency = upper(gcur) then
    rate := 1;
  else
    rate := round(p_rate, 8);
    if rate is null or rate <= 0 or rate >= 1e10 then
      raise exception 'A foreign-currency expense needs a positive exchange rate.';
    end if;
  end if;
  group_amount := public.to_base_minor(p_amount, rate, currency, gcur);
end $$;
revoke execute on function public.group_expense_amount(uuid, bigint, text, numeric) from public, anon, authenticated;

drop function if exists public.create_group_expense_v2(uuid, text, bigint, character, uuid, date, uuid[], bigint[], text);
create function public.create_group_expense_v2(
  p_group uuid, p_description text, p_amount bigint, p_currency character, p_paid_by uuid,
  p_spent_at date, p_member_ids uuid[], p_shares bigint[], p_split_type text default 'equal',
  p_exchange_rate numeric default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid := auth.uid(); eid uuid; n int := coalesce(array_length(p_member_ids, 1), 0);
        total bigint; k text; amt record;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not public.is_group_member(p_group) then raise exception 'not a member of this group'; end if;
  if not public.rate_limit('gexp:' || uid, 120, 3600) then
    raise exception 'Too many expenses added — please slow down.';
  end if;
  if n = 0 then raise exception 'split between at least one person'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'amount must be zero or more'; end if;
  select * into amt from public.group_expense_amount(p_group, p_amount, p_currency, p_exchange_rate);

  if p_shares is not null then
    if coalesce(array_length(p_shares, 1), 0) <> n then
      raise exception 'each person needs a share';
    end if;
    if exists (select 1 from unnest(p_shares) s where s < 0) then
      raise exception 'shares cannot be negative';
    end if;
    select sum(s) into total from unnest(p_shares) s;
    if total <> amt.group_amount then
      raise exception 'the split must add up to the total';
    end if;
  end if;

  k := public.app_enc_key();
  insert into public.group_expenses
    (group_id, description_enc, amount_enc, currency, exchange_rate, paid_by, spent_at, created_by, split_type)
    values (p_group, public.enc_text(p_description, k), public.enc_minor(p_amount, k),
            amt.currency, amt.rate, p_paid_by, p_spent_at, uid,
            case when p_shares is null then 'equal' else coalesce(p_split_type, 'exact') end)
    returning id into eid;

  if p_shares is null then
    insert into public.expense_splits (expense_id, member_id, share_enc)
      select eid, s.member_id, public.enc_minor(s.share_minor, k)
      from public.split_equally(amt.group_amount, p_member_ids) s;
  else
    insert into public.expense_splits (expense_id, member_id, share_enc)
      select eid, p_member_ids[i], public.enc_minor(p_shares[i], k) from generate_series(1, n) as i;
  end if;

  return eid;
end $$;
revoke execute on function public.create_group_expense_v2(uuid, text, bigint, character, uuid, date, uuid[], bigint[], text, numeric) from public, anon;
grant execute on function public.create_group_expense_v2(uuid, text, bigint, character, uuid, date, uuid[], bigint[], text, numeric) to authenticated;

drop function if exists public.update_group_expense_v2(uuid, text, bigint, character, uuid, date, uuid[], bigint[], text);
create function public.update_group_expense_v2(
  p_expense uuid, p_description text, p_amount bigint, p_currency character, p_paid_by uuid,
  p_spent_at date, p_member_ids uuid[], p_shares bigint[], p_split_type text default 'equal',
  p_exchange_rate numeric default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare gid uuid; creator uuid; n int := coalesce(array_length(p_member_ids, 1), 0);
        total bigint; k text; amt record;
begin
  select group_id, created_by into gid, creator from public.group_expenses where id = p_expense;
  if gid is null then raise exception 'expense not found'; end if;
  if not public.is_group_member(gid) then raise exception 'not a member'; end if;
  if not (creator = auth.uid() or public.is_group_owner(gid)) then
    raise exception 'Only the person who added this expense (or the group owner) can edit it.';
  end if;
  if n = 0 then raise exception 'split between at least one person'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'amount must be zero or more'; end if;
  select * into amt from public.group_expense_amount(gid, p_amount, p_currency, p_exchange_rate);

  if p_shares is not null then
    if coalesce(array_length(p_shares, 1), 0) <> n then
      raise exception 'each person needs a share';
    end if;
    if exists (select 1 from unnest(p_shares) s where s < 0) then
      raise exception 'shares cannot be negative';
    end if;
    select sum(s) into total from unnest(p_shares) s;
    if total <> amt.group_amount then
      raise exception 'the split must add up to the total';
    end if;
  end if;

  k := public.app_enc_key();
  update public.group_expenses
    set description_enc = public.enc_text(p_description, k),
        amount_enc = public.enc_minor(p_amount, k), currency = amt.currency,
        exchange_rate = amt.rate, paid_by = p_paid_by, spent_at = p_spent_at,
        split_type = case when p_shares is null then 'equal' else coalesce(p_split_type, 'exact') end
    where id = p_expense;

  delete from public.expense_splits where expense_id = p_expense;
  if p_shares is null then
    insert into public.expense_splits (expense_id, member_id, share_enc)
      select p_expense, s.member_id, public.enc_minor(s.share_minor, k)
      from public.split_equally(amt.group_amount, p_member_ids) s;
  else
    insert into public.expense_splits (expense_id, member_id, share_enc)
      select p_expense, p_member_ids[i], public.enc_minor(p_shares[i], k) from generate_series(1, n) as i;
  end if;
end $$;
revoke execute on function public.update_group_expense_v2(uuid, text, bigint, character, uuid, date, uuid[], bigint[], text, numeric) from public, anon;
grant execute on function public.update_group_expense_v2(uuid, text, bigint, character, uuid, date, uuid[], bigint[], text, numeric) to authenticated;

-- Balances: the payer is credited with the amount in the group currency.
create or replace function public._group_net(p_group uuid)
returns table(member_id uuid, net_minor bigint)
language sql
stable security definer
set search_path = public
as $$
  with k as (select public.app_enc_key() as k),
  g as (select currency::text as cur from public.groups where id = p_group),
  e as (
    select e.id, e.paid_by,
           public.to_base_minor(public.dec_minor(e.amount_enc, k.k), e.exchange_rate,
                                e.currency, g.cur) as amt
    from public.group_expenses e cross join k cross join g where e.group_id = p_group),
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

create or replace function public.group_ledger(p_group uuid)
returns jsonb
language plpgsql
stable security definer
set search_path = public
as $$
declare k text; gcur text;
begin
  if not public.is_group_member(p_group) then return null; end if;
  k := public.app_enc_key();
  select currency::text into gcur from public.groups where id = p_group;
  return jsonb_build_object(
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'group_id', e.group_id,
        'description', public.dec_text(e.description_enc, k),
        'amount_minor', x.amt,
        'currency', e.currency, 'exchange_rate', e.exchange_rate,
        'group_amount_minor', public.to_base_minor(x.amt, e.exchange_rate, e.currency, gcur),
        'paid_by', e.paid_by, 'spent_at', e.spent_at,
        'created_by', e.created_by, 'created_at', e.created_at,
        'updated_at', e.updated_at, 'split_type', e.split_type,
        'expense_splits', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', s.id, 'expense_id', s.expense_id, 'member_id', s.member_id,
            'share_minor', public.dec_minor(s.share_enc, k)))
          from public.expense_splits s where s.expense_id = e.id), '[]'::jsonb)
      ) order by e.spent_at desc, e.created_at desc)
      from public.group_expenses e
      cross join lateral (select public.dec_minor(e.amount_enc, k) as amt) x
      where e.group_id = p_group), '[]'::jsonb),
    'settlements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', st.id, 'group_id', st.group_id, 'from_member', st.from_member,
        'to_member', st.to_member, 'amount_minor', public.dec_minor(st.amount_enc, k),
        'currency', st.currency, 'note', public.dec_text(st.note_enc, k),
        'settled_at', st.settled_at, 'created_by', st.created_by, 'created_at', st.created_at
      ) order by st.settled_at desc, st.created_at desc)
      from public.settlements st where st.group_id = p_group), '[]'::jsonb));
end $$;

-- Audit log: the amount column keeps what was paid (original currency); the
-- summary adds what it counts for in the group ("… · 49.73 EUR at 1.1699").
create or replace function public.log_group_expense()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare actor text; gid uuid; verb text; amt bytea; cur char(3); descr text; k text;
        rate numeric; gcur text; conv text := '';
begin
  -- The group is gone (or going): the log dies with it, so there is nothing
  -- to write, and inserting would violate the group_id FK. Applies to every
  -- op: deleting an owner's account also SET NULLs group_expenses.created_by,
  -- an UPDATE whose queued trigger runs after the group row is deleted.
  select currency::text into gcur from public.groups where id = coalesce(NEW.group_id, OLD.group_id);
  if not found then return null; end if;
  k := public.app_enc_key();
  if TG_OP = 'DELETE' then
    gid := OLD.group_id; verb := 'deleted'; amt := OLD.amount_enc; cur := OLD.currency;
    rate := OLD.exchange_rate;
    descr := coalesce(public.dec_text(OLD.description_enc, k), 'an expense');
  else
    gid := NEW.group_id; amt := NEW.amount_enc; cur := NEW.currency; rate := NEW.exchange_rate;
    descr := coalesce(public.dec_text(NEW.description_enc, k), 'an expense');
    verb := case when TG_OP = 'INSERT' then 'added' else 'edited' end;
  end if;
  if upper(cur) <> upper(gcur) then
    conv := ' · ' || public.fmt_minor_plain(
              public.to_base_minor(public.dec_minor(amt, k), rate, cur, gcur), gcur)
            || ' at ' || trim(trailing '.' from trim(trailing '0' from rate::text));
  end if;
  select coalesce(display_name, 'Someone') into actor from public.profiles where id = auth.uid();
  insert into public.group_audit_log (group_id, actor_id, actor_name, action, summary_enc, amount_enc, currency)
  values (gid, auth.uid(), coalesce(actor, 'System'), 'expense_' || verb,
          public.enc_text(coalesce(actor, 'Someone') || ' ' || verb || ' “' || descr || '”' || conv, k),
          amt, cur);
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Mirrored personal shares: group currency + an ECB rate to the member's
--    base currency (or pending), never a blanket 1.
-- ---------------------------------------------------------------------------
create or replace function public.member_share_rate(p_user uuid, p_currency text, p_on date)
returns numeric
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare base text;
begin
  select coalesce(base_currency, 'EUR') into base from public.profiles where id = p_user;
  return public.fx_rate(p_currency, coalesce(base, 'EUR'), p_on);
end $$;
revoke execute on function public.member_share_rate(uuid, text, date) from public, anon, authenticated;

create or replace function public.sync_group_share()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid; v_exp record; v_rate numeric;
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
  select e.id, e.group_id, e.description_enc, e.spent_at, g.currency::text as gcur into v_exp
    from public.group_expenses e join public.groups g on g.id = e.group_id
   where e.id = NEW.expense_id;
  if v_user is not null and v_exp.id is not null then
    v_rate := public.member_share_rate(v_user, v_exp.gcur, v_exp.spent_at);
    if v_rate is null then perform public.fx_request(); end if;
    insert into public.transactions
      (user_id, kind, amount_enc, currency, exchange_rate, description_enc,
       spent_at, is_shared, group_id, group_expense_id)
    values
      (v_user, 'expense', NEW.share_enc, v_exp.gcur, v_rate, v_exp.description_enc,
       v_exp.spent_at, true, v_exp.group_id, NEW.expense_id)
    on conflict (user_id, group_expense_id) where group_expense_id is not null
    do update
      set amount_enc      = excluded.amount_enc,
          currency        = excluded.currency,
          exchange_rate   = excluded.exchange_rate,
          description_enc = excluded.description_enc,
          spent_at        = excluded.spent_at;
  end if;
  return NEW;
end $$;

-- Description/date edits flow to the mirrors. The mirror's currency is the
-- group's (never the expense's); a new date re-rates it.
create or replace function public.sync_group_expense_meta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.transactions t
    set description_enc = NEW.description_enc, spent_at = NEW.spent_at,
        exchange_rate = case when NEW.spent_at is distinct from OLD.spent_at
                             then public.member_share_rate(t.user_id, t.currency, NEW.spent_at)
                             else t.exchange_rate end
    where t.group_expense_id = NEW.id
      and exists (select 1 from public.group_members m
                  where m.group_id = NEW.group_id and m.user_id = t.user_id);
  return NEW;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Recurring rules in a foreign currency get the ECB rate of each run date.
-- ---------------------------------------------------------------------------
create or replace function public.materialize_recurring_rules()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r         record;
  run_date  date;
  inserted  int := 0;
  guard     int;
  v_rate    numeric;
  need_fx   boolean := false;
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
      v_rate := public.member_share_rate(r.user_id, r.currency, run_date);
      need_fx := need_fx or v_rate is null;
      insert into public.transactions
        (user_id, kind, category_id, account_id, amount_enc, currency, exchange_rate,
         description_enc, spent_at)
      values
        (r.user_id, r.kind, r.category_id, r.account_id, r.amount_enc, r.currency, v_rate,
         r.description_enc, run_date);
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

  if need_fx then perform public.fx_request(); end if;
  return inserted;
end;
$$;

-- The digest ranks categories by base value; a pending row (NULL) mustn't
-- sort first.
create or replace function public.send_weekly_digests()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
                                       t.currency, u.base)) desc nulls last
     limit 1;

    insert into public.notifications (user_id, type, title, body)
    values (u.user_id, 'digest', 'Your week in money',
      cnt || ' expense' || case when cnt = 1 then '' else 's' end
      || ' this week · top category: ' || top_name || '. Open Budgeer to see your totals.');
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Existing rows
-- ---------------------------------------------------------------------------
-- Mirrors: in the group currency; a foreign one booked at the old blanket 1
-- becomes pending and is rated from the cache.
update public.transactions t
   set currency = g.currency,
       exchange_rate = case when upper(g.currency) = upper(coalesce(p.base_currency, 'EUR')) then 1 end
  from public.group_expenses e, public.groups g, public.profiles p
 where t.group_expense_id = e.id and g.id = e.group_id and p.id = t.user_id
   and (t.currency <> g.currency
        or (upper(g.currency) <> upper(coalesce(p.base_currency, 'EUR')) and t.exchange_rate = 1));

-- Materialised recurring entries (no client_uuid, not a mirror) in a foreign
-- currency at exactly 1 were booked by the old materializer: re-rate them.
update public.transactions t
   set exchange_rate = null
  from public.profiles p
 where p.id = t.user_id and t.client_uuid is null and t.group_expense_id is null
   and upper(t.currency) <> upper(coalesce(p.base_currency, 'EUR')) and t.exchange_rate = 1;

-- Seed the cache (the first request covers any pending rows; the next cron
-- run fetches the last ~400 days).
select public.fx_request();
