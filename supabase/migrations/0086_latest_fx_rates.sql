-- 0086: the latest ECB rates, for the statement's recurring totals.
--
-- A recurring rule stores no exchange rate (each charge gets the rate of its
-- own date when it's made), so a total built from rules — the statement's
-- "Yearly subscriptions" cost — converts each foreign rule at the latest ECB
-- rate, as the app does with Frankfurter (the same ECB reference rates).
-- generate-report reads with the caller's JWT (no service-role key), and the
-- rate cache (fx_rates, fx_rate) is closed to clients (0062), so this is the
-- one narrow door: the rate into `p_base` today (fx_rate's rule: today's, else
-- the latest of the previous 10 days) for each asked currency that has one.
--
-- Read-only public reference data (ECB rates), nothing per user, so it's safe
-- to grant to authenticated. The list is capped (at most 40 currencies, only
-- well-formed codes), and nothing is written — a caller can't queue fetches.

create or replace function public.latest_fx_rates(p_currencies text[], p_base text)
returns table (currency text, rate numeric)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.code, r.rate
    from (select distinct upper(x) as code
            from unnest((coalesce(p_currencies, '{}'::text[]))[1:40]) as x
           where x ~ '^[A-Za-z]{3}$') c
   cross join lateral (select public.fx_rate(c.code, upper(p_base), current_date) as rate) r
   where p_base ~ '^[A-Za-z]{3}$'
     and r.rate is not null
$$;

revoke execute on function public.latest_fx_rates(text[], text) from public, anon;
grant execute on function public.latest_fx_rates(text[], text) to authenticated;
