-- Budge database test suite — safe to run against the live project.
-- Every test creates its own data inside a subtransaction and raises
-- ROLLBACK_OK at the end, so NOTHING is ever committed. Failures print
-- "FAIL: <name> — <reason>" and are counted; the suite ends by raising if
-- anything failed.
--
-- Run: paste into the Supabase SQL editor, or
--      psql "$DATABASE_URL" -f supabase/tests/db_tests.sql
-- Needs at least two users in auth.users (any real project has them).

create temp table if not exists _t (fails int not null default 0);
insert into _t select 0 where not exists (select 1 from _t);

-- ---------------------------------------------------------------------------
-- 1. Rejoin reclaims your old member slot (no duplicate members)
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; gid uuid; m2 uuid; m2_after uuid;
        tok text := 'zztest_' || md5(random()::text); cnt int; fuid uuid;
begin
  begin
    select id into u1 from auth.users order by created_at limit 1;
    select id into u2 from auth.users where id <> u1 order by created_at limit 1;
    if u2 is null then raise exception 'SKIP: needs two users'; end if;

    insert into public.groups (name, owner_id, currency) values ('ZZT rejoin', u1, 'EUR') returning id into gid;
    insert into public.group_members (group_id, user_id, display_name, role) values (gid, u1, 'Owner', 'owner');
    insert into public.group_members (group_id, user_id, display_name) values (gid, u2, 'Rejoiner') returning id into m2;
    insert into public.group_expenses (group_id, paid_by, amount_minor, currency, description, spent_at)
    values (gid, m2, 0, 'EUR', 'zz footprint', current_date);

    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.remove_group_member(m2, true);
    execute 'reset role';

    select former_user_id into fuid from public.group_members where id = m2 and user_id is null;
    if fuid is distinct from u2 then raise exception 'former_user_id not stamped'; end if;

    insert into public.group_invites (group_id, token, created_by) values (gid, tok, u1);
    execute 'set local role authenticated';
    perform public.join_via_link(tok);
    execute 'reset role';

    select id into m2_after from public.group_members where group_id = gid and user_id = u2;
    if m2_after is distinct from m2 then raise exception 'rejoin created a new row'; end if;
    select count(*) into cnt from public.group_members where group_id = gid;
    if cnt <> 2 then raise exception 'expected 2 members, got %', cnt; end if;

    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then raise notice 'PASS: rejoin reclaims member slot';
    else update _t set fails = fails + 1; raise notice 'FAIL: rejoin reclaims member slot — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 2. member_joined notifications + silent vs loud leave
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; gid uuid; m2 uuid; cnt int;
begin
  begin
    select id into u1 from auth.users order by created_at limit 1;
    select id into u2 from auth.users where id <> u1 order by created_at limit 1;

    insert into public.groups (name, owner_id, currency) values ('ZZT notif', u1, 'EUR') returning id into gid;
    insert into public.group_members (group_id, user_id, display_name, role) values (gid, u1, 'Owner', 'owner');
    insert into public.group_members (group_id, user_id, display_name) values (gid, u2, 'Joiner') returning id into m2;

    select count(*) into cnt from public.notifications where group_id = gid and type = 'member_joined' and user_id = u1;
    if cnt <> 1 then raise exception 'owner not notified of join (got %)', cnt; end if;
    select count(*) into cnt from public.notifications where group_id = gid and type = 'member_joined' and user_id = u2;
    if cnt <> 0 then raise exception 'joiner notified of own join'; end if;

    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.remove_group_member(m2, true);  -- silent
    execute 'reset role';
    select count(*) into cnt from public.notifications where group_id = gid and type = 'member_left';
    if cnt <> 0 then raise exception 'silent leave notified'; end if;

    insert into public.group_members (group_id, user_id, display_name) values (gid, u2, 'Joiner') returning id into m2;
    execute 'set local role authenticated';
    perform public.remove_group_member(m2, false); -- loud
    execute 'reset role';
    select count(*) into cnt from public.notifications where group_id = gid and type = 'member_left' and user_id = u1;
    if cnt <> 1 then raise exception 'loud leave: expected 1 notification, got %', cnt; end if;

    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then raise notice 'PASS: member_joined + silent/loud leave';
    else update _t set fails = fails + 1; raise notice 'FAIL: member_joined + silent/loud leave — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Budget threshold alerts fire exactly at 80% and 100%
-- ---------------------------------------------------------------------------
do $$
declare u uuid; cat uuid; cnt int;
begin
  begin
    select id into u from auth.users order by created_at limit 1;
    insert into public.categories (user_id, name, kind) values (u, 'ZZT cat', 'expense') returning id into cat;
    insert into public.budgets (user_id, category_id, amount_minor, currency, period_start)
    values (u, cat, 10000, 'EUR', date_trunc('month', current_date)::date);

    insert into public.transactions (user_id, kind, category_id, amount_minor, currency, spent_at)
    values (u, 'expense', cat, 7900, 'EUR', current_date);
    select count(*) into cnt from public.notifications where user_id = u and type = 'budget';
    if cnt <> 0 then raise exception 'alert fired below 80%%'; end if;

    insert into public.transactions (user_id, kind, category_id, amount_minor, currency, spent_at)
    values (u, 'expense', cat, 500, 'EUR', current_date);
    select count(*) into cnt from public.notifications where user_id = u and type = 'budget' and title = 'Budget almost used';
    if cnt <> 1 then raise exception '80%% warning missing/duplicated (got %)', cnt; end if;

    insert into public.transactions (user_id, kind, category_id, amount_minor, currency, spent_at)
    values (u, 'expense', cat, 2000, 'EUR', current_date);
    select count(*) into cnt from public.notifications where user_id = u and type = 'budget' and title = 'Budget exceeded';
    if cnt <> 1 then raise exception '100%% alert missing/duplicated (got %)', cnt; end if;

    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then raise notice 'PASS: budget threshold alerts';
    else update _t set fails = fails + 1; raise notice 'FAIL: budget threshold alerts — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Weekly digest generates for users with spending this week
-- ---------------------------------------------------------------------------
do $$
declare u uuid; cnt int;
begin
  begin
    select id into u from auth.users order by created_at limit 1;
    insert into public.transactions (user_id, kind, amount_minor, currency, spent_at)
    values (u, 'expense', 1234, 'EUR', current_date);
    perform public.send_weekly_digests();
    select count(*) into cnt from public.notifications where user_id = u and type = 'digest';
    if cnt < 1 then raise exception 'digest not generated'; end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then raise notice 'PASS: weekly digest';
    else update _t set fails = fails + 1; raise notice 'FAIL: weekly digest — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Nudge: delivered to the target, self-nudge rejected
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; gid uuid; m1 uuid; m2 uuid; cnt int;
begin
  begin
    select id into u1 from auth.users order by created_at limit 1;
    select id into u2 from auth.users where id <> u1 order by created_at limit 1;

    insert into public.groups (name, owner_id, currency) values ('ZZT nudge', u1, 'EUR') returning id into gid;
    insert into public.group_members (group_id, user_id, display_name, role) values (gid, u1, 'Me', 'owner') returning id into m1;
    insert into public.group_members (group_id, user_id, display_name) values (gid, u2, 'Them') returning id into m2;

    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.nudge_member(gid, m2);
    begin
      perform public.nudge_member(gid, m1); -- self-nudge must fail
      raise exception 'GUARD_MISSED';
    exception when others then
      if sqlerrm like '%cannot nudge yourself%' then null; else raise; end if;
    end;
    execute 'reset role';

    select count(*) into cnt from public.notifications where user_id = u2 and type = 'nudge' and group_id = gid;
    if cnt <> 1 then raise exception 'nudge not delivered (got %)', cnt; end if;

    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then raise notice 'PASS: nudge delivery + self-nudge guard';
    else update _t set fails = fails + 1; raise notice 'FAIL: nudge delivery + self-nudge guard — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 6. RLS: a user cannot read someone else's transactions
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; tid uuid; cnt int;
begin
  begin
    select id into u1 from auth.users order by created_at limit 1;
    select id into u2 from auth.users where id <> u1 order by created_at limit 1;

    insert into public.transactions (user_id, kind, amount_minor, currency, spent_at)
    values (u2, 'expense', 999, 'EUR', current_date) returning id into tid;

    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into cnt from public.transactions where id = tid;
    execute 'reset role';
    if cnt <> 0 then raise exception 'cross-user transaction visible'; end if;

    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then raise notice 'PASS: transactions RLS isolation';
    else update _t set fails = fails + 1; raise notice 'FAIL: transactions RLS isolation — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Leaving is blocked while the member has an outstanding balance
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; gid uuid; m1 uuid; m2 uuid; eid uuid;
begin
  begin
    select id into u1 from auth.users order by created_at limit 1;
    select id into u2 from auth.users where id <> u1 order by created_at limit 1;

    insert into public.groups (name, owner_id, currency) values ('ZZT guard', u1, 'EUR') returning id into gid;
    insert into public.group_members (group_id, user_id, display_name, role) values (gid, u1, 'Owner', 'owner') returning id into m1;
    insert into public.group_members (group_id, user_id, display_name) values (gid, u2, 'Debt') returning id into m2;

    -- u2 paid 10.00, split half-half -> u2 is owed 5.00 (net <> 0).
    insert into public.group_expenses (group_id, paid_by, amount_minor, currency, description, spent_at)
    values (gid, m2, 1000, 'EUR', 'zz split', current_date) returning id into eid;
    insert into public.expense_splits (expense_id, member_id, share_minor) values (eid, m1, 500), (eid, m2, 500);

    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.remove_group_member(m2, true);
      raise exception 'GUARD_MISSED';
    exception when others then
      if sqlerrm like '%outstanding balance%' then null; else raise; end if;
    end;
    execute 'reset role';

    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then raise notice 'PASS: settled-up guard blocks unsettled leave';
    else update _t set fails = fails + 1; raise notice 'FAIL: settled-up guard blocks unsettled leave — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Summary — raises if anything failed (so CI/psql exit non-zero).
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  select fails into n from _t;
  if n > 0 then raise exception '% test(s) FAILED', n; end if;
  raise notice 'ALL DATABASE TESTS PASSED';
end $$;
drop table _t;
