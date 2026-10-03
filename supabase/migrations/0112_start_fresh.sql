-- 0112: Start fresh (Settings › Your data): wipe your own data, keep the account.
--
-- A user right next to deleting the account (GDPR Art. 17, erasure of the
-- personal records while the account stays): everything the user keeps for
-- themselves goes, the account and the groups stay, and the categories are
-- back to the defaults a new account gets. The apps first offer a backup,
-- then ask for START FRESH typed and a fresh sign-in (the password again for
-- a password account, which signs in anew), as Delete account does.
--
-- start_fresh() wipes, for the caller only (auth.uid()):
--   transactions        the personal entries; NOT a group expense's mirrored
--                       share (group_expense_id set: the groups stay, and
--                       sync_group_share owns those rows)
--   recurring_rules, budgets, category_rules (import rules),
--   accounts (net-worth/savings accounts), savings_goals,
--   recurring_plans, recurring_plan_undo (Plan), salary_history,
--   meal_vouchers, ai_month_summaries, notifications (the caller's own inbox)
--   categories          deleted, then re-seeded by seed_default_categories();
--                       a kept mirrored share whose category was a default
--                       moves to the new default of the same key, any other
--                       is left uncategorised (its category is gone)
--   profiles.salary_category_id is cleared (it pointed at a deleted category)
-- and keeps: the auth user and sign-in methods, the profile (name, picture,
-- payment details, currency, language, switches), consents, push devices
-- (push_subscriptions, apns_devices), groups and everything in them, the
-- rate limits and the privacy/legal notice queues. No storage objects: the
-- receipts bucket was removed in 0049 (scans keep only total and date).
--
-- Guards, in order: signed in; not the shared demo login (refuse_if_demo,
-- 0090: anyone holding it could wipe the next visitor's demo); a sign-in in
-- the last ten minutes (signed_in_recently, the SQL twin of
-- _shared/reauth.ts isRecentClaims: the newest amr timestamp, else iat,
-- REAUTH_WINDOW_SECONDS = 600, a minute of clock skew); three runs a day
-- (rate_limit 'start_fresh:<uid>': only a run that commits counts, since a
-- refusal rolls the count back). One function call is one transaction:
-- everything goes or nothing does.
--
-- Both functions are SECURITY DEFINER with search_path pinned to
-- public, pg_temp; start_fresh is EXECUTE for authenticated only,
-- signed_in_recently for nobody but the definer paths.

create or replace function public.signed_in_recently(p_claims jsonb, p_window_seconds integer default 600)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  with stamps as (
    select (a->>'timestamp')::numeric as at_
      from jsonb_array_elements(case when jsonb_typeof(p_claims->'amr') = 'array'
                                     then p_claims->'amr' else '[]'::jsonb end) a
     where jsonb_typeof(a) = 'object'
       and (a->>'timestamp') ~ '^[0-9]+(\.[0-9]+)?$'
       and (a->>'timestamp')::numeric > 0
  ), signed as (
    select coalesce(
      (select max(at_) from stamps),
      case when (p_claims->>'iat') ~ '^[0-9]+(\.[0-9]+)?$' and (p_claims->>'iat')::numeric > 0
           then (p_claims->>'iat')::numeric end) as at_
  )
  select coalesce(extract(epoch from now()) - at_ between -60 and p_window_seconds, false) from signed
$$;
revoke execute on function public.signed_in_recently(jsonb, integer) from public, anon, authenticated;

create or replace function public.start_fresh()
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); kept jsonb;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  perform public.refuse_if_demo(uid);
  if not public.signed_in_recently(auth.jwt()) then
    raise exception 'For your security, please sign in again to start fresh.';
  end if;
  if not public.rate_limit('start_fresh:' || uid, 3, 86400) then
    raise exception 'Too many fresh starts — please try again tomorrow.';
  end if;

  -- The kept group shares in a default category: { transaction id: key }.
  select coalesce(jsonb_object_agg(t.id, c.default_key), '{}'::jsonb) into kept
    from public.transactions t join public.categories c on c.id = t.category_id
   where t.user_id = uid and t.group_expense_id is not null and c.default_key is not null;

  update public.profiles set salary_category_id = null where id = uid;
  delete from public.notifications where user_id = uid;
  delete from public.recurring_plans where user_id = uid;
  delete from public.recurring_plan_undo where user_id = uid;
  delete from public.meal_vouchers where user_id = uid;
  delete from public.salary_history where user_id = uid;
  delete from public.ai_month_summaries where user_id = uid;
  delete from public.transactions where user_id = uid and group_expense_id is null;
  delete from public.recurring_rules where user_id = uid;
  delete from public.budgets where user_id = uid;
  delete from public.category_rules where user_id = uid;
  delete from public.accounts where user_id = uid;
  delete from public.savings_goals where user_id = uid;
  delete from public.categories where user_id = uid;

  perform public.seed_default_categories();
  update public.transactions t
     set category_id = c.id
    from public.categories c
   where t.user_id = uid and kept ? t.id::text
     and c.user_id = uid and c.default_key = kept->>t.id::text;
end $$;
revoke execute on function public.start_fresh() from public, anon;
grant execute on function public.start_fresh() to authenticated;
