-- 0061: budgets roll forward, can be deleted, and can be copied from last month.
--
-- Budgets are stored per month (period_start = the 1st). Until now a month
-- without rows simply had no budgets, so every cap vanished on the 1st.
--
-- Rollover rule (one rule, used by my_budgets AND the alert trigger):
--   A month's caps are the rows of the most recent month <= it that has ANY
--   budget row for the user (its "source" month). A month with its own rows
--   uses them; a month without uses the latest earlier month's — the app shows
--   "Carried over from August".
--
-- Month-level (not per-category) on purpose: it keeps "what August had" as one
-- set, so editing or deleting one cap in a carried month can't resurrect a cap
-- from a much older month. To make that work:
--   * removed: a tombstone. Deleting a cap marks its row removed instead of
--     deleting it, so the month still "has its own budgets" (possibly none)
--     and doesn't fall back to an earlier month's caps.
--   * edit_budget / delete_budget first copy the carried set into the month
--     (materialise), then apply the one change — so explicit edits create that
--     month's own rows and the other caps stay as they were.
--   * copy_previous_budgets(month): replace the month's rows with last month's
--     effective caps (the explicit "Copy last month's budgets" action).
-- save_budget keeps its raw upsert semantics (backup restore writes exact
-- month rows with it) but now also clears a tombstone.
-- Budget alerts (notify_budget_threshold) look caps up with the same rule.

alter table public.budgets add column if not exists removed boolean not null default false;

-- The month whose rows are p_month's budgets for p_user (null: none yet).
create or replace function public.budget_source_period(p_user uuid, p_month date)
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select max(b.period_start) from public.budgets b
   where b.user_id = p_user and b.period_start <= public.budget_period_key(p_month)
$$;

revoke execute on function public.budget_source_period(uuid, date) from public, anon, authenticated;

create or replace function public.my_budgets(p_period date)
returns table(id uuid, category_id uuid, amount_minor bigint, currency text,
  period_start date, categories jsonb)
language sql
stable security definer
set search_path = public
as $$
  select b.id, b.category_id, public.dec_minor(b.amount_enc, k.k),
         b.currency::text, b.period_start,
         case when c.id is not null then jsonb_build_object('name', c.name, 'icon', c.icon, 'color', c.color) end
  from public.budgets b
  cross join (select public.app_enc_key() as k) k
  left join public.categories c on c.id = b.category_id and c.user_id = b.user_id
  where b.user_id = auth.uid() and not b.removed
    and b.period_start = public.budget_source_period(auth.uid(), p_period)
$$;

-- Raw upsert of one month's cap (restore, and the building block below).
create or replace function public.save_budget(p_category uuid, p_amount bigint, p_currency text, p_period date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid := auth.uid(); k text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not public.owns_refs(uid, p_category, null) then raise exception 'category not found'; end if;
  if p_amount is not null and p_amount < 0 then raise exception 'amount must be zero or more'; end if;
  k := public.app_enc_key();
  insert into public.budgets (user_id, category_id, currency, period_start, amount_enc, removed)
    values (uid, p_category, coalesce(p_currency, 'EUR'),
            coalesce(p_period, date_trunc('month', current_date)::date),
            public.enc_minor(coalesce(p_amount, 0), k), false)
  on conflict (user_id, category_id, period_start)
    do update set amount_enc = excluded.amount_enc, currency = excluded.currency, removed = false;
end $$;

-- Give p_month its own rows (a copy of its carried caps) if it has none yet.
create or replace function public.materialise_budgets(p_user uuid, p_month date)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare m date := public.budget_period_key(p_month); src date;
begin
  src := public.budget_source_period(p_user, m);
  if src is null or src = m then return; end if;
  insert into public.budgets (user_id, category_id, currency, period_start, amount_enc, removed)
    select b.user_id, b.category_id, b.currency, m, b.amount_enc, false
      from public.budgets b
     where b.user_id = p_user and b.period_start = src and not b.removed
  on conflict (user_id, category_id, period_start) do nothing;
end $$;

revoke execute on function public.materialise_budgets(uuid, date) from public, anon, authenticated;

-- The Budgets page's "set a cap": this month's own row, keeping the others.
create or replace function public.edit_budget(p_category uuid, p_amount bigint, p_currency text, p_period date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not public.owns_refs(uid, p_category, null) then raise exception 'category not found'; end if;
  perform public.materialise_budgets(uid, coalesce(p_period, current_date));
  perform public.save_budget(p_category, p_amount, p_currency,
                             public.budget_period_key(coalesce(p_period, current_date)));
end $$;

-- Remove one category's cap from a month (and, by rollover, from later months
-- that carry this one).
create or replace function public.delete_budget(p_category uuid, p_period date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid := auth.uid(); m date := public.budget_period_key(coalesce(p_period, current_date));
begin
  if uid is null then raise exception 'not authenticated'; end if;
  perform public.materialise_budgets(uid, m);
  update public.budgets set removed = true
   where user_id = uid and category_id = p_category and period_start = m;
end $$;

-- "Copy last month's budgets": p_month's rows become last month's effective
-- caps. Returns how many caps were copied.
create or replace function public.copy_previous_budgets(p_period date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid := auth.uid(); m date := public.budget_period_key(coalesce(p_period, current_date));
        src date; n int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  src := public.budget_source_period(uid, (m - interval '1 month')::date);
  if src is null or not exists (select 1 from public.budgets
                                 where user_id = uid and period_start = src and not removed) then
    raise exception 'Last month has no budgets to copy.';
  end if;
  delete from public.budgets where user_id = uid and period_start = m;
  insert into public.budgets (user_id, category_id, currency, period_start, amount_enc, removed)
    select b.user_id, b.category_id, b.currency, m, b.amount_enc, false
      from public.budgets b
     where b.user_id = uid and b.period_start = src and not b.removed;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.edit_budget(uuid, bigint, text, date) from public, anon;
revoke execute on function public.delete_budget(uuid, date) from public, anon;
revoke execute on function public.copy_previous_budgets(date) from public, anon;
grant execute on function public.edit_budget(uuid, bigint, text, date) to authenticated;
grant execute on function public.delete_budget(uuid, date) to authenticated;
grant execute on function public.copy_previous_budgets(date) to authenticated;

-- Alerts: the cap for a spend month comes from its source month (rollover).
-- Spend is still summed over the spend month itself.
create or replace function public.notify_budget_threshold()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare g record; k text; cap bigint; spent_after bigint; spent_new bigint; spent_before bigint;
begin
  for g in
    select n.user_id, n.category_id, date_trunc('month', n.spent_at)::date as month,
           b.amount_enc as cap_enc,
           coalesce(c.name, 'A category') as cat_name,
           coalesce(p.base_currency, 'EUR') as base, array_agg(n.id) as new_ids
    from new_rows n
    join public.budgets b
      on b.user_id = n.user_id and b.category_id = n.category_id and not b.removed
     and b.period_start = public.budget_source_period(n.user_id, date_trunc('month', n.spent_at)::date)
    left join public.categories c on c.id = n.category_id and c.user_id = n.user_id
    left join public.profiles p on p.id = n.user_id
    where n.kind = 'expense' and n.category_id is not null
    group by n.user_id, n.category_id, date_trunc('month', n.spent_at)::date, b.amount_enc,
             c.name, p.base_currency
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
               and t.spent_at >= g.month
               and t.spent_at < (g.month + interval '1 month')::date) s;
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
