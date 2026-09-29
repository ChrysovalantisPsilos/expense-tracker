-- 0106: the AI helpers on the shared demo login (dev only, 0090), so people
-- trying the demo see them working. Until now the demo was locked out
-- (profiles_ai_demo_guard, the is_demo checks in ai_helper_start and
-- my_month_summary). Now:
--
--   1. The demo can switch the helpers on and off like any account: the guard
--      trigger and its function are dropped.
--   2. ai_helper_start no longer refuses the demo. On top of the per-user
--      limits and the overall 5,000 a day, the demo accounts share one cap of
--      100 calls a day (rate_limit key 'ai:demo'); past it they get the usual
--      "Too many requests" answer. my_month_summary answers the demo too.
--   3. The nightly reset turns all four on again: demo_wipe switches them off
--      (the consent rows that writes go with the rest of the history) and
--      demo_seed switches them on for the main login, so its consent history
--      holds one "on" row per helper. The stored month summaries were
--      already cleared by demo_wipe (0103).
--   4. The current demo login gets them on now.
-- What a demo visitor types is sent to Anthropic like anyone's; the app says
-- so on the demo (Settings → AI helpers, and the typing boxes).
--
-- 0101 closed new functions by default: every function here pins
-- search_path = public, pg_temp; ai_helper_start and my_month_summary are
-- granted to authenticated again, demo_wipe and demo_seed to nobody.

-- 1 ---------------------------------------------------------------------------
drop trigger if exists trg_profiles_ai_demo_guard on public.profiles;
drop function if exists public.profiles_ai_demo_guard();

-- 2 ---------------------------------------------------------------------------
create or replace function public.ai_helper_start(p_helper text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare uid uuid := auth.uid(); p record; on_ boolean; lim int; win int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select pr.base_currency, pr.is_demo, pr.ai_quick_entry, pr.ai_import_categories, pr.ai_month_summary,
         pr.ai_plan_whatif
    into p from public.profiles pr where pr.id = uid;
  on_ := case p_helper
           when 'parse_entry' then p.ai_quick_entry
           when 'suggest_categories' then p.ai_import_categories
           when 'month_summary' then p.ai_month_summary
           when 'plan_whatif' then p.ai_plan_whatif
         end;
  if not coalesce(on_, false) then
    raise exception 'AI helper is off';
  end if;
  lim := case p_helper when 'parse_entry' then 60 when 'suggest_categories' then 20
                       when 'plan_whatif' then 30 else 10 end;
  win := case p_helper when 'month_summary' then 86400 else 3600 end;
  if not public.rate_limit('ai:' || p_helper || ':' || uid, lim, win)
     or (coalesce(p.is_demo, false) and not public.rate_limit('ai:demo', 100, 86400))
     or not public.rate_limit('ai:all', 5000, 86400) then
    raise exception 'Too many requests — please try again later.';
  end if;
  return jsonb_build_object('base_currency', coalesce(p.base_currency, 'EUR'));
end $$;
revoke execute on function public.ai_helper_start(text) from public, anon;
grant execute on function public.ai_helper_start(text) to authenticated;

-- As 0103, without the demo exception.
create or replace function public.my_month_summary(p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare uid uuid := auth.uid(); m0 date := date_trunc('month', p_month)::date;
        totals jsonb; fp text; s record;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not coalesce((select p.ai_month_summary from public.profiles p where p.id = uid), false) then
    return null;
  end if;
  if m0 is null or abs((extract(year from m0) * 12 + extract(month from m0))
                       - (extract(year from current_date) * 12 + extract(month from current_date))) > 1 then
    raise exception 'bad month';
  end if;
  totals := public.ai_month_totals(uid, m0);
  fp := md5(totals::text);
  select a.payload_enc, a.fingerprint, a.created_at into s
    from public.ai_month_summaries a where a.user_id = uid and a.month = m0;
  return jsonb_build_object(
    'month', to_char(m0, 'YYYY-MM'),
    'empty', not exists (select 1 from jsonb_array_elements(totals->'categories') c
                          where c->>'kind' = 'expense' and (c->'totals'->>0)::bigint > 0),
    'summary', case when s.payload_enc is not null then
                 public.dec_text(s.payload_enc, public.app_enc_key())::jsonb
                   || jsonb_build_object('written_at', s.created_at) end,
    'stale', s.payload_enc is not null and s.fingerprint is distinct from fp,
    'totals', totals,
    'fingerprint', fp);
end $$;
revoke execute on function public.my_month_summary(date) from public, anon;
grant execute on function public.my_month_summary(date) to authenticated;

-- 3 ---------------------------------------------------------------------------
-- As 0103, plus the AI switches off.
create or replace function public.demo_wipe(p_ids uuid[])
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  delete from public.notifications where user_id = any(p_ids);
  delete from public.groups where owner_id = any(p_ids);
  delete from public.group_invites where created_by = any(p_ids) or invited_user_id = any(p_ids);
  update public.profiles set salary_category_id = null where id = any(p_ids);
  -- The AI helpers off (their consent rows go below); demo_seed turns them
  -- back on for the main login (0106).
  update public.profiles
     set ai_quick_entry = false, ai_import_categories = false, ai_month_summary = false, ai_plan_whatif = false
   where id = any(p_ids);
  delete from public.recurring_plans where user_id = any(p_ids);
  delete from public.recurring_plan_undo where user_id = any(p_ids);
  delete from public.meal_vouchers where user_id = any(p_ids);
  delete from public.salary_history where user_id = any(p_ids);
  delete from public.ai_month_summaries where user_id = any(p_ids);
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

-- As 0090, plus the AI switches on at the end.
create or replace function public.demo_seed(p_user uuid, p_friends uuid[])
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  m0 date := date_trunc('month', current_date)::date;
  today int := extract(day from current_date)::int;
  cat jsonb; batch jsonb; yearly_uuid uuid := gen_random_uuid(); yearly_on date;
  gid uuid; me uuid; f1 uuid; f2 uuid; f3 uuid; members uuid[];
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);

  perform public.accept_legal_documents();
  perform public.seed_default_categories();
  select jsonb_object_agg(name || ':' || kind::text, id) into cat
    from public.categories where user_id = p_user;

  -- Monthly spending, this month and the three before. Amounts that vary in
  -- real life move a little from month to month.
  select jsonb_agg(jsonb_build_object(
           'kind', 'expense', 'category_id', cat->>(t.c || ':expense'), 'currency', 'EUR',
           'amount_minor', case when t.vary then t.amt * (90 + (i * 7 + t.d * 3) % 21) / 100 else t.amt end,
           'description', t.descr, 'spent_at', public.demo_day(i, t.d)))
    into batch
    from generate_series(0, 3) i
    cross join (values
      ('Housing', 'Rent', 1, 115000, false),
      ('Transport', 'Monthly transit pass', 2, 4900, false),
      ('Groceries', 'Lidl', 3, 5840, true),
      ('Health', 'Gym membership', 4, 3990, false),
      ('Utilities', 'Electricity', 5, 6480, true),
      ('Food & Dining', 'Lunch with colleagues', 6, 1850, true),
      ('Utilities', 'Internet & phone', 8, 3999, false),
      ('Entertainment', 'Spotify', 9, 1099, false),
      ('Groceries', 'Farmers'' market', 10, 3215, true),
      ('Shopping', 'Books', 11, 2450, true),
      ('Food & Dining', 'Pizza night', 13, 3200, true),
      ('Transport', 'Fuel', 15, 5520, true),
      ('Groceries', 'Albert Heijn', 17, 7390, true),
      ('Health', 'Pharmacy', 19, 1275, true),
      ('Food & Dining', 'Coffee & pastry', 21, 640, true),
      ('Entertainment', 'Cinema', 22, 2400, true),
      ('Groceries', 'Lidl', 24, 6625, true),
      ('Food & Dining', 'Sushi dinner', 26, 4760, true)
    ) as t(c, descr, d, amt, vary);
  perform public.save_transactions(batch);

  -- One-offs: a laptop paid from savings, a course paid in dollars, a bonus,
  -- a friend paying back, savings set aside every month, and interest.
  perform public.save_transactions(jsonb_build_array(
    jsonb_build_object('kind', 'expense', 'category_id', cat->>'Shopping:expense', 'amount_minor', 119900,
      'currency', 'EUR', 'description', 'New laptop', 'spent_at', public.demo_day(2, 14),
      'paid_from_savings', true),
    jsonb_build_object('kind', 'expense', 'category_id', cat->>'Shopping:expense', 'amount_minor', 8999,
      'currency', 'EUR', 'description', 'Running shoes', 'spent_at', public.demo_day(1, 12)),
    jsonb_build_object('kind', 'expense', 'category_id', cat->>'Health:expense', 'amount_minor', 6500,
      'currency', 'EUR', 'description', 'Dentist', 'spent_at', public.demo_day(3, 16)),
    jsonb_build_object('kind', 'expense', 'category_id', cat->>'Other:expense', 'amount_minor', 4900,
      'currency', 'USD', 'exchange_rate', 0.92, 'description', 'Online photography course',
      'spent_at', public.demo_day(1, 7)),
    jsonb_build_object('kind', 'expense', 'category_id', cat->>'Entertainment:expense', 'amount_minor', 5500,
      'currency', 'EUR', 'description', 'Concert tickets', 'spent_at', public.demo_day(0, 3)),
    jsonb_build_object('kind', 'income', 'category_id', cat->>'Bonus:income', 'amount_minor', 50000,
      'currency', 'EUR', 'description', 'Quarterly bonus', 'spent_at', public.demo_day(2, 15)),
    jsonb_build_object('kind', 'income', 'category_id', cat->>'Friends & family:income', 'amount_minor', 4000,
      'currency', 'EUR', 'description', 'Sam paid me back for the concert', 'spent_at', public.demo_day(1, 20)),
    jsonb_build_object('kind', 'income', 'category_id', cat->>'Savings:income', 'amount_minor', 1245,
      'currency', 'EUR', 'description', 'Savings interest', 'spent_at', public.demo_day(1, 27))));

  -- Salary on the 28th (counted toward the next month: the salary shift is
  -- on from the 25th) and a monthly transfer to savings on the 1st.
  select jsonb_agg(x) into batch from (
    select jsonb_build_object('kind', 'income', 'category_id', cat->>'Salary:income', 'amount_minor', 325000,
             'currency', 'EUR', 'description', 'Salary', 'spent_at', (m0 - make_interval(months => i))::date + 27) as x
      from generate_series(0, 3) i where i > 0 or today >= 28
    union all
    select jsonb_build_object('kind', 'income', 'category_id', cat->>'Savings:income', 'amount_minor', 30000,
             'currency', 'EUR', 'description', 'Monthly transfer to savings', 'savings_from_income', true,
             'spent_at', (m0 - make_interval(months => i))::date)
      from generate_series(0, 3) i) s;
  perform public.save_transactions(batch);

  update public.profiles set salary_shift_from_day = 25, salary_category_id = (cat->>'Salary:income')::uuid
   where id = p_user;

  -- Recurring entries, including a yearly plan made from one of its entries
  -- (so the entry is spread over the year like the app does it).
  yearly_on := public.demo_day(2, 18);
  perform public.save_transactions(jsonb_build_array(jsonb_build_object(
    'client_uuid', yearly_uuid, 'kind', 'expense', 'category_id', cat->>'Utilities:expense',
    'amount_minor', 9999, 'currency', 'EUR', 'description', 'Cloud storage (yearly plan)',
    'spent_at', yearly_on)));
  perform public.save_recurring_rule(null, jsonb_build_object(
    'kind', 'expense', 'category_id', cat->>'Utilities:expense', 'amount_minor', 9999, 'currency', 'EUR',
    'description', 'Cloud storage (yearly plan)', 'frequency', 'yearly', 'interval_n', 1,
    'next_run', (yearly_on + interval '1 year')::date, 'remind_days_before', 7,
    'source_client_uuid', yearly_uuid));
  perform public.save_recurring_rule(null, jsonb_build_object(
    'kind', 'expense', 'category_id', cat->>'Housing:expense', 'amount_minor', 115000, 'currency', 'EUR',
    'description', 'Rent', 'frequency', 'monthly', 'next_run', public.demo_next_run(1)));
  perform public.save_recurring_rule(null, jsonb_build_object(
    'kind', 'expense', 'category_id', cat->>'Entertainment:expense', 'amount_minor', 1099, 'currency', 'EUR',
    'description', 'Spotify', 'frequency', 'monthly', 'next_run', public.demo_next_run(9)));
  perform public.save_recurring_rule(null, jsonb_build_object(
    'kind', 'expense', 'category_id', cat->>'Health:expense', 'amount_minor', 3990, 'currency', 'EUR',
    'description', 'Gym membership', 'frequency', 'monthly', 'next_run', public.demo_next_run(4)));
  perform public.save_recurring_rule(null, jsonb_build_object(
    'kind', 'income', 'category_id', cat->>'Salary:income', 'amount_minor', 325000, 'currency', 'EUR',
    'description', 'Salary', 'frequency', 'monthly', 'next_run', public.demo_next_run(28)));
  perform public.save_recurring_rule(null, jsonb_build_object(
    'kind', 'income', 'category_id', cat->>'Savings:income', 'amount_minor', 30000, 'currency', 'EUR',
    'description', 'Monthly transfer to savings', 'frequency', 'monthly', 'savings_from_income', true,
    'next_run', public.demo_next_run(1)));

  -- This month's budgets, partly used by the entries above.
  perform public.save_budget((cat->>'Groceries:expense')::uuid, 30000, 'EUR', m0);
  perform public.save_budget((cat->>'Food & Dining:expense')::uuid, 18000, 'EUR', m0);
  perform public.save_budget((cat->>'Transport:expense')::uuid, 12000, 'EUR', m0);
  perform public.save_budget((cat->>'Entertainment:expense')::uuid, 6000, 'EUR', m0);
  perform public.save_budget((cat->>'Shopping:expense')::uuid, 15000, 'EUR', m0);

  -- Net worth and goals.
  perform public.save_account(null, 'Checking account', 'asset', 248000, 'EUR');
  perform public.save_account(null, 'Savings account', 'asset', 820000, 'EUR');
  perform public.save_account(null, 'Credit card', 'liability', 34000, 'EUR');
  perform public.save_goal(null, 'Summer trip to Japan', 300000, 115000, 'EUR',
    (m0 + interval '8 months')::date);
  perform public.save_goal(null, 'Emergency fund', 600000, 420000, 'EUR', null);

  -- Import rules (the import wizard saves them by direct insert, own rows).
  insert into public.category_rules (user_id, pattern, category_id) values
    (p_user, 'lidl', (cat->>'Groceries:expense')::uuid),
    (p_user, 'albert heijn', (cat->>'Groceries:expense')::uuid),
    (p_user, 'spotify', (cat->>'Entertainment:expense')::uuid),
    (p_user, 'shell', (cat->>'Transport:expense')::uuid);

  -- A group trip with the friend accounts: a few expenses (one in pounds),
  -- one settlement, and balances still open.
  if coalesce(array_length(p_friends, 1), 0) >= 3 then
    gid := public.create_group('Lisbon trip', 'EUR');
    for i in 1 .. array_length(p_friends, 1) loop
      perform public.claim_or_insert_member(gid, p_friends[i], public.member_name_for(p_friends[i]));
    end loop;
    select id into me from public.group_members where group_id = gid and user_id = p_user;
    select id into f1 from public.group_members where group_id = gid and user_id = p_friends[1];
    select id into f2 from public.group_members where group_id = gid and user_id = p_friends[2];
    select id into f3 from public.group_members where group_id = gid and user_id = p_friends[3];
    members := array[me, f1, f2, f3];
    perform public.create_group_expense_v2(gid, 'Flights', 36000, 'GBP', f2, current_date - 30,
      members, null, 'equal', 1.17);
    perform public.create_group_expense_v2(gid, 'Airbnb in Alfama', 48000, 'EUR', me, current_date - 24,
      members, null);
    perform public.create_group_expense_v2(gid, 'Dinner at Time Out Market', 9600, 'EUR', f1, current_date - 23,
      members, null);
    perform public.create_group_expense_v2(gid, 'Tram 28 & castle tickets', 5200, 'EUR', f3, current_date - 22,
      members, null);
    perform public.create_group_expense_v2(gid, 'Pastéis de Belém', 1680, 'EUR', me, current_date - 22,
      array[me, f1, f2], null);
    perform public.create_group_expense_v2(gid, 'Sunset boat tour', 14000, 'EUR', f1, current_date - 21,
      members, null);
    perform public.add_settlement(gid, f3, me, 5000, 'EUR', current_date - 10, 'For the Airbnb');
  end if;

  -- The four AI helpers, on (0106): visitors see them working. demo_wipe
  -- turned them off, so each is one "on" row in the consent history.
  update public.profiles
     set ai_quick_entry = true, ai_import_categories = true, ai_month_summary = true, ai_plan_whatif = true
   where id = p_user;
end $$;
revoke execute on function public.demo_seed(uuid, uuid[]) from public, anon, authenticated;

-- 4 ---------------------------------------------------------------------------
update public.profiles p
   set ai_quick_entry = true, ai_import_categories = true, ai_month_summary = true, ai_plan_whatif = true
 where p.is_demo
   and exists (select 1 from public.demo_accounts d where d.user_id = p.id and d.role = 'main');
