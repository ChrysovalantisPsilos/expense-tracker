-- 0067: a yearly subscription counts evenly across the months it covers.
--
-- A yearly (or every-N-years) recurring EXPENSE is paid once but budgeted
-- monthly: a €120 charge on 15 Mar counts €10 in each month from March to the
-- following February (12·N months for an every-N-years rule, at most 120).
-- Only monthly-spend maths spreads (budgets, budget alerts, the app's monthly
-- totals/charts). The ledger — the Transactions list, the PDF/Excel statement,
-- the backup — keeps the one real payment on its real date.
--
-- transactions.spread_months (null = not spread) says over how many months a
-- row counts. It is server-authoritative: no client can write transactions
-- (no INSERT/UPDATE grant), and a BEFORE trigger derives it from the row's
-- recurring rule at the moment the row is linked to it — the source row of
-- "Make recurring" (save_recurring_rule) and every row the materializer
-- creates — so neither function has to know about it. Storing it on the row
-- keeps history stable:
--   * a row keeps the spread it was charged under when its rule later changes
--     frequency (monthly charges don't turn into yearly ones retroactively);
--     the one exception is the row the rule was made from (it existed before
--     the rule): it follows the rule's frequency, so fixing a "Make recurring"
--     that picked the wrong frequency fixes that entry too;
--   * deleting the rule unlinks its rows (0065: SET NULL) but keeps the spread;
--   * a row whose kind becomes income stops being spread.
--
-- The split is one pair, kept in lockstep with src/shared/lib/spread.js:
--   spread_part(total, n, i)  — part i (0-based) of `total` minor units over n
--                               months: equal integer parts, the remainder one
--                               unit each to the EARLIEST months, so the parts
--                               always sum to the whole (zero-decimal
--                               currencies stay integral by construction);
--   month_share(base, spent_at, n, month) — what a row (already converted to
--                               the base currency with to_base_minor) counts
--                               in `month`.
-- Conversion happens once on the whole amount, then the base amount is split,
-- exactly like the client (toBaseMinor, then spreadPart).

alter table public.transactions
  add column if not exists spread_months smallint
  constraint transactions_spread_months_check check (spread_months between 2 and 120);

-- How many months a rule's charges spread over (null: they don't).
create or replace function public.recurring_spread_months(
  p_frequency public.recurrence_freq, p_interval int, p_kind public.txn_kind)
returns smallint
language sql immutable parallel safe
set search_path = public, pg_temp
as $$
  select case when p_frequency = 'yearly' and p_kind = 'expense'
              then least(12 * greatest(coalesce(p_interval, 1), 1), 120)::smallint end
$$;

create or replace function public.spread_part(p_total bigint, p_n int, p_idx int)
returns bigint
language sql immutable parallel safe
set search_path = public, pg_temp
as $$
  select case
    when p_total is null then null
    when p_idx < 0 or p_idx >= p_n then 0
    -- bigint division truncates toward zero; the remainder carries the sign.
    else p_total / p_n + case when p_idx < abs(p_total % p_n) then sign(p_total % p_n)::bigint else 0 end
  end
$$;

create or replace function public.month_share(p_base bigint, p_spent_at date, p_spread int, p_month date)
returns bigint
language sql immutable parallel safe
set search_path = public, pg_temp
as $$
  select case
    when p_spread is null then case when date_trunc('month', p_spent_at) = date_trunc('month', p_month)
                                    then p_base else 0 end
    else public.spread_part(p_base, p_spread,
           ((extract(year from p_month) - extract(year from p_spent_at)) * 12
            + extract(month from p_month) - extract(month from p_spent_at))::int)
  end
$$;

revoke execute on function public.recurring_spread_months(public.recurrence_freq, int, public.txn_kind) from public, anon, authenticated;
revoke execute on function public.spread_part(bigint, int, int) from public, anon, authenticated;
revoke execute on function public.month_share(bigint, date, int, date) from public, anon, authenticated;

-- Existing linked yearly expense rows (before the trigger exists; a direct
-- spread_months update never fires it anyway).
update public.transactions t
   set spread_months = public.recurring_spread_months(r.frequency, r.interval_n, r.kind)
  from public.recurring_rules r
 where r.id = t.recurring_rule_id and t.kind = 'expense'
   and t.spread_months is distinct from public.recurring_spread_months(r.frequency, r.interval_n, r.kind);

-- Server-authoritative spread: derived when a row is linked (insert with a
-- rule, or the link set by save_recurring_rule), null on any other insert,
-- kept when the link is cleared (rule deleted), dropped for non-expenses.
-- SECURITY INVOKER: only definer RPCs and the materializer write
-- transactions; clients have no write grant.
create or replace function public.transactions_spread()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' or new.recurring_rule_id is distinct from old.recurring_rule_id then
    if new.recurring_rule_id is not null then
      select public.recurring_spread_months(r.frequency, r.interval_n, r.kind)
        into new.spread_months
        from public.recurring_rules r where r.id = new.recurring_rule_id;
    elsif tg_op = 'INSERT' then
      new.spread_months := null;
    end if;
  end if;
  if new.kind <> 'expense' then new.spread_months := null; end if;
  return new;
end $$;
revoke execute on function public.transactions_spread() from public, anon, authenticated;

drop trigger if exists trg_txn_spread on public.transactions;
create trigger trg_txn_spread before insert or update of recurring_rule_id, kind on public.transactions
  for each row execute function public.transactions_spread();

-- A rule's frequency/interval/kind changed: the row it was made from (created
-- no later than the rule) follows; charges it already made keep their spread.
create or replace function public.recurring_rule_respread()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update public.transactions t
     set spread_months = case when t.kind = 'expense'
                              then public.recurring_spread_months(new.frequency, new.interval_n, new.kind) end
   where t.recurring_rule_id = new.id and t.user_id = new.user_id
     and t.created_at <= new.created_at
     and t.spread_months is distinct from
         case when t.kind = 'expense' then public.recurring_spread_months(new.frequency, new.interval_n, new.kind) end;
  return null;
end $$;
revoke execute on function public.recurring_rule_respread() from public, anon, authenticated;

drop trigger if exists trg_rule_respread on public.recurring_rules;
create trigger trg_rule_respread after update of frequency, interval_n, kind on public.recurring_rules
  for each row
  when (old.frequency is distinct from new.frequency or old.interval_n is distinct from new.interval_n
        or old.kind is distinct from new.kind)
  execute function public.recurring_rule_respread();

-- Budget alerts with spread rows. A new row is checked in the month it was
-- paid (as before) and, when it's spread, in each later month it covers up to
-- the current one (a back-dated yearly charge also weighs on this month's
-- budget). Future months aren't alerted: nothing has been spent there yet.
-- Each month's spend is month_share of every row covering it.
create or replace function public.notify_budget_threshold()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare g record; k text; cap bigint; spent_after bigint; spent_new bigint; spent_before bigint;
begin
  for g in
    select n.user_id, n.category_id, m.month,
           b.amount_enc as cap_enc,
           coalesce(c.name, 'A category') as cat_name,
           coalesce(p.base_currency, 'EUR') as base, array_agg(n.id) as new_ids
    from new_rows n
    cross join lateral (
      select (date_trunc('month', n.spent_at) + make_interval(months => i))::date as month
        from generate_series(0, coalesce(n.spread_months, 1) - 1) i
       where i = 0
          or date_trunc('month', n.spent_at) + make_interval(months => i) <= date_trunc('month', current_date)
    ) m
    join public.budgets b
      on b.user_id = n.user_id and b.category_id = n.category_id and not b.removed
     and b.period_start = public.budget_source_period(n.user_id, m.month)
    left join public.categories c on c.id = n.category_id and c.user_id = n.user_id
    left join public.profiles p on p.id = n.user_id
    where n.kind = 'expense' and n.category_id is not null
    group by n.user_id, n.category_id, m.month, b.amount_enc, c.name, p.base_currency
  loop
    k := coalesce(k, public.app_enc_key());
    cap := public.dec_minor(g.cap_enc, k);
    continue when cap is null or cap <= 0;

    -- Rows paid in the month, plus spread rows paid up to 119 months earlier;
    -- each decrypted once, converted to base minor units (the cap's unit),
    -- then reduced to its share of the month.
    select coalesce(sum(s.v), 0), coalesce(sum(s.v) filter (where s.id = any(g.new_ids)), 0)
      into spent_after, spent_new
      from (select t.id, public.month_share(
                     public.to_base_minor(public.dec_minor(t.amount_enc, k), t.exchange_rate, t.currency, g.base),
                     t.spent_at, t.spread_months, g.month) as v
              from public.transactions t
             where t.user_id = g.user_id and t.category_id = g.category_id and t.kind = 'expense'
               and t.spent_at < (g.month + interval '1 month')::date
               and t.spent_at >= (g.month - interval '119 months')::date
               and (t.spent_at >= g.month or t.spread_months is not null)) s;
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

-- my_transactions returns spread_months, and with p_spread also returns the
-- spread expense rows paid BEFORE p_from that still count in the window (so a
-- month view can add their share). The rows' own dates are unchanged — the
-- client keeps them out of lists and uses them only for totals.
drop function if exists public.my_transactions(text, date, date, uuid, integer);
create function public.my_transactions(
  p_kind text default null, p_from date default null, p_to date default null,
  p_category uuid default null, p_limit integer default null, p_spread boolean default false)
returns table(id uuid, user_id uuid, kind text, category_id uuid, account_id uuid,
  amount_minor bigint, currency text, exchange_rate numeric, description text, notes text,
  spent_at date, group_id uuid, is_shared boolean, client_uuid uuid,
  created_at timestamptz, updated_at timestamptz, group_expense_id uuid,
  categories jsonb, group_expenses jsonb, recurring_rule_id uuid, recurring jsonb,
  spread_months smallint)
language sql
stable security definer
set search_path = public, pg_temp
as $$
  select t.id, t.user_id, t.kind::text, t.category_id, t.account_id,
         public.dec_minor(t.amount_enc, k.k), t.currency::text, t.exchange_rate,
         public.dec_text(t.description_enc, k.k), public.dec_text(t.notes_enc, k.k),
         t.spent_at, t.group_id, t.is_shared, t.client_uuid, t.created_at,
         t.updated_at, t.group_expense_id,
         case when c.id is not null then jsonb_build_object('name', c.name, 'icon', c.icon, 'color', c.color) end,
         case when g.id is not null then jsonb_build_object('groups', jsonb_build_object('name', g.name)) end,
         t.recurring_rule_id,
         case when rr.id is not null then jsonb_build_object(
           'frequency', rr.frequency, 'interval_n', rr.interval_n, 'is_active', rr.is_active) end,
         t.spread_months
  from public.transactions t
  cross join (select public.app_enc_key() as k) k
  left join public.categories c on c.id = t.category_id and c.user_id = t.user_id
  left join public.group_expenses ge on ge.id = t.group_expense_id
  left join public.groups g on g.id = ge.group_id and public.is_group_member(ge.group_id)
  left join public.recurring_rules rr on rr.id = t.recurring_rule_id and rr.user_id = t.user_id
  where t.user_id = auth.uid()
    and (p_kind is null or t.kind::text = p_kind)
    and (p_from is null or t.spent_at >= p_from
         or (p_spread and t.kind = 'expense' and t.spread_months is not null
             and t.spent_at >= (p_from - interval '119 months')::date
             and date_trunc('month', t.spent_at) + make_interval(months => t.spread_months) > p_from))
    and (p_to is null or t.spent_at <= p_to)
    and (p_category is null or t.category_id = p_category)
  order by t.spent_at desc, t.created_at desc
  limit p_limit
$$;
revoke execute on function public.my_transactions(text, date, date, uuid, integer, boolean) from public, anon;
grant execute on function public.my_transactions(text, date, date, uuid, integer, boolean) to authenticated;
