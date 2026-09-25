-- Budge database test suite — safe to run against the live project.
-- Every test creates its own data inside a subtransaction and raises
-- ROLLBACK_OK at the end, so NOTHING is ever committed. Failures print
-- "FAIL: <name> — <reason>" and are counted; the suite ends by raising if
-- anything failed.
--
-- Run: paste into the Supabase SQL editor, or
--      psql "$DATABASE_URL" -f supabase/tests/db_tests.sql
--
-- Self-contained: every user a test needs is a throwaway auth.users row made
-- by pg_temp.zz_user() inside that test's rolled-back subtransaction. The
-- suite never reads an existing account, so it runs the same on a project
-- with zero users (PROD before launch, a fresh branch, CI). The only
-- auth.users reads are of rows the test itself just inserted.
--
-- The summary requires every test to have PASSED (EXPECTED_TESTS below): a
-- test that is skipped, or never reaches its PASS line, fails the suite.

drop table if exists _t;
create temp table _t (fails int not null default 0, passes int not null default 0);
insert into _t values (0, 0);

-- A throwaway signed-up user (the signup trigger gives it a profile). Only call
-- it as the table owner, i.e. before any `set local role`.
create or replace function pg_temp.zz_user(tag text) returns uuid language sql as $$
  insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
          'authenticated', 'zzt-' || tag || '-' || md5(random()::text) || '@example.com', now(), now())
  returning id;
$$;

-- ---------------------------------------------------------------------------
-- 1. Rejoin reclaims your old member slot (no duplicate members)
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; gid uuid; m2 uuid; m2_after uuid;
        tok text := 'zztest_' || md5(random()::text); cnt int; fuid uuid;
begin
  begin
    u1 := pg_temp.zz_user('a');
    u2 := pg_temp.zz_user('b');

    insert into public.groups (name, owner_id, currency) values ('ZZT rejoin', u1, 'EUR') returning id into gid;
    insert into public.group_members (group_id, user_id, display_name, role) values (gid, u1, 'Owner', 'owner');
    insert into public.group_members (group_id, user_id, display_name) values (gid, u2, 'Rejoiner') returning id into m2;
    -- Ledger money/text is encrypted at rest (0050): store it the way the RPCs do.
    insert into public.group_expenses (group_id, paid_by, amount_enc, currency, description_enc, spent_at)
    values (gid, m2, public.enc_minor(0), 'EUR', public.enc_text('zz footprint'), current_date);

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
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: rejoin reclaims member slot';
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
    u1 := pg_temp.zz_user('a');
    u2 := pg_temp.zz_user('b');

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
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: member_joined + silent/loud leave';
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
    u := pg_temp.zz_user('a');
    insert into public.categories (user_id, name, kind) values (u, 'ZZT cat', 'expense') returning id into cat;
    -- Budget caps are encrypted at rest (0047); store the cap the way save_budget does.
    insert into public.budgets (user_id, category_id, amount_enc, currency, period_start)
    values (u, cat, extensions.pgp_sym_encrypt('10000', public.app_enc_key()), 'EUR',
            date_trunc('month', current_date)::date);

    -- Spend goes through the encrypting write RPC (0050), so the trigger sums
    -- decrypted amounts.
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.save_transactions(jsonb_build_array(jsonb_build_object(
      'kind', 'expense', 'category_id', cat, 'amount_minor', 7900, 'currency', 'EUR', 'spent_at', current_date)));
    execute 'reset role';
    select count(*) into cnt from public.notifications where user_id = u and type = 'budget';
    if cnt <> 0 then raise exception 'alert fired below 80%%'; end if;

    execute 'set local role authenticated';
    perform public.save_transactions(jsonb_build_array(jsonb_build_object(
      'kind', 'expense', 'category_id', cat, 'amount_minor', 500, 'currency', 'EUR', 'spent_at', current_date)));
    execute 'reset role';
    select count(*) into cnt from public.notifications where user_id = u and type = 'budget' and title = 'Budget almost used';
    if cnt <> 1 then raise exception '80%% warning missing/duplicated (got %)', cnt; end if;

    execute 'set local role authenticated';
    perform public.save_transactions(jsonb_build_array(jsonb_build_object(
      'kind', 'expense', 'category_id', cat, 'amount_minor', 2000, 'currency', 'EUR', 'spent_at', current_date)));
    execute 'reset role';
    select count(*) into cnt from public.notifications where user_id = u and type = 'budget' and title = 'Budget exceeded';
    if cnt <> 1 then raise exception '100%% alert missing/duplicated (got %)', cnt; end if;

    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: budget threshold alerts (encrypted amounts)';
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
    u := pg_temp.zz_user('a');
    update public.profiles set notify_digest = true where id = u;  -- opt-in (0072)
    insert into public.transactions (user_id, kind, amount_enc, currency, spent_at)
    values (u, 'expense', public.enc_minor(1234), 'EUR', current_date);
    perform public.send_weekly_digests();
    select count(*) into cnt from public.notifications where user_id = u and type = 'digest';
    if cnt < 1 then raise exception 'digest not generated'; end if;
    -- The body must not re-leak encrypted amounts in plaintext.
    select count(*) into cnt from public.notifications
     where user_id = u and type = 'digest' and body ~ '[0-9]+[.,][0-9]{2}';
    if cnt <> 0 then raise exception 'digest body carries an amount'; end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: weekly digest';
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
    u1 := pg_temp.zz_user('a');
    u2 := pg_temp.zz_user('b');

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
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: nudge delivery + self-nudge guard';
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
    u1 := pg_temp.zz_user('a');
    u2 := pg_temp.zz_user('b');

    insert into public.transactions (user_id, kind, amount_enc, currency, spent_at)
    values (u2, 'expense', public.enc_minor(999), 'EUR', current_date) returning id into tid;

    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into cnt from public.transactions where id = tid;
    execute 'reset role';
    if cnt <> 0 then raise exception 'cross-user transaction visible'; end if;

    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: transactions RLS isolation';
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
    u1 := pg_temp.zz_user('a');
    u2 := pg_temp.zz_user('b');

    insert into public.groups (name, owner_id, currency) values ('ZZT guard', u1, 'EUR') returning id into gid;
    insert into public.group_members (group_id, user_id, display_name, role) values (gid, u1, 'Owner', 'owner') returning id into m1;
    insert into public.group_members (group_id, user_id, display_name) values (gid, u2, 'Debt') returning id into m2;

    -- u2 paid 10.00, split half-half -> u2 is owed 5.00 (net <> 0).
    insert into public.group_expenses (group_id, paid_by, amount_enc, currency, description_enc, spent_at)
    values (gid, m2, public.enc_minor(1000), 'EUR', public.enc_text('zz split'), current_date) returning id into eid;
    insert into public.expense_splits (expense_id, member_id, share_enc)
    values (eid, m1, public.enc_minor(500)), (eid, m2, public.enc_minor(500));

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
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: settled-up guard blocks unsettled leave';
    else update _t set fails = fails + 1; raise notice 'FAIL: settled-up guard blocks unsettled leave — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Settle-up payment info: encrypted at rest; co-members can read (decrypt),
--    outsiders cannot.
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; gid uuid; m2 uuid; res jsonb; raw bytea;
begin
  begin
    u1 := pg_temp.zz_user('a');
    u2 := pg_temp.zz_user('b');

    insert into public.groups (name, owner_id, currency) values ('ZZT pay', u1, 'EUR') returning id into gid;
    insert into public.group_members (group_id, user_id, display_name, role) values (gid, u1, 'Me', 'owner');
    insert into public.group_members (group_id, user_id, display_name) values (gid, u2, 'Payee') returning id into m2;

    -- Store via the write RPC as u2, then confirm the column holds CIPHERTEXT.
    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.set_payment_info('ZZ00TESTIBAN', 'zzpayee');
    select public.my_payment_info() into res;   -- owner decrypts their own
    execute 'reset role';
    if res->>'payment_iban' is distinct from 'ZZ00TESTIBAN' then
      raise exception 'owner cannot read their own payment info: %', res;
    end if;
    select payment_iban_enc into raw from public.profiles where id = u2;
    if raw is null or position('ZZ00TESTIBAN' in encode(raw, 'escape')) > 0 then
      raise exception 'payment IBAN not encrypted at rest';
    end if;

    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select public.member_payment_info(m2) into res;
    execute 'reset role';
    if res->>'payment_iban' is distinct from 'ZZ00TESTIBAN' then
      raise exception 'co-member cannot read payment info: %', res;
    end if;

    -- An account outside the group is rejected.
    perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      select public.member_payment_info(m2) into res;
      raise exception 'GUARD_MISSED';
    exception when others then
      if sqlerrm like '%not allowed%' then null; else raise; end if;
    end;
    execute 'reset role';

    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: payment info encrypted at rest + co-member access + outsider guard';
    else update _t set fails = fails + 1; raise notice 'FAIL: payment info co-member access + outsider guard — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Settlements (M1/L1): direct INSERT is closed to API roles (writes go
--    through add_settlement, which encrypts); created_by is forced to the
--    caller; a member cannot delete a settlement they didn't create (since
--    0078 no client can delete one at all — test 66).
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; gid uuid; m1 uuid; m2 uuid; sid uuid; cb uuid; still int;
begin
  begin
    u1 := pg_temp.zz_user('a');
    u2 := pg_temp.zz_user('b');

    insert into public.groups (name, owner_id, currency) values ('ZZT settle', u1, 'EUR') returning id into gid;
    insert into public.group_members (group_id, user_id, display_name, role)
      values (gid, u1, 'Owner', 'owner') returning id into m1;
    insert into public.group_members (group_id, user_id, display_name)
      values (gid, u2, 'Member') returning id into m2;

    -- (a) A member can't write the table directly (e.g. spoofing created_by
    -- or planting undecryptable bytes); through the RPC, created_by = caller.
    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      insert into public.settlements (group_id, from_member, to_member, amount_enc, currency, created_by)
        values (gid, m2, m1, '\x00'::bytea, 'EUR', u1);
      raise exception 'GUARD_MISSED: direct settlement insert allowed';
    exception when insufficient_privilege then null;
    end;
    sid := public.add_settlement(gid, m2, m1, 500, 'EUR');
    execute 'reset role';
    select created_by into cb from public.settlements where id = sid;
    if cb is distinct from u2 then raise exception 'created_by not forced to caller: %', cb; end if;

    -- (b) Owner creates a settlement; member u2 must not be able to delete it.
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    sid := public.add_settlement(gid, m1, m2, 300, 'EUR');
    execute 'reset role';

    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      delete from public.settlements where id = sid;
    exception when insufficient_privilege then null;  -- no DELETE grant (0078)
    end;
    execute 'reset role';
    select count(*) into still from public.settlements where id = sid;
    if still <> 1 then raise exception 'member deleted an owner-created settlement'; end if;

    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: settlement writes via RPC only + created_by forced + delete restricted';
    else update _t set fails = fails + 1; raise notice 'FAIL: settlement guard — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 10. expense_splits (M2): a member cannot inject a split row onto an expense
--     they didn't create (would inflate a co-member's owed share).
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; gid uuid; m1 uuid; m2 uuid; eid uuid; injected int;
begin
  begin
    u1 := pg_temp.zz_user('a');
    u2 := pg_temp.zz_user('b');

    insert into public.groups (name, owner_id, currency) values ('ZZT split', u1, 'EUR') returning id into gid;
    insert into public.group_members (group_id, user_id, display_name, role)
      values (gid, u1, 'Owner', 'owner') returning id into m1;
    insert into public.group_members (group_id, user_id, display_name)
      values (gid, u2, 'Member') returning id into m2;
    -- Owner owns this expense (created_by = u1).
    insert into public.group_expenses (group_id, paid_by, amount_enc, currency, description_enc, spent_at, created_by)
      values (gid, m1, public.enc_minor(1000), 'EUR', public.enc_text('zz owner expense'), current_date, u1)
      returning id into eid;

    -- Member u2 attempts to add a split onto the owner's expense.
    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      insert into public.expense_splits (expense_id, member_id, share_enc) values (eid, m2, public.enc_minor(1000));
    exception when others then null;  -- privilege / RLS violation expected
    end;
    execute 'reset role';

    select count(*) into injected from public.expense_splits where expense_id = eid and member_id = m2;
    if injected <> 0 then raise exception 'member injected a split onto an owner expense'; end if;

    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: expense_splits insert restricted to creator/owner';
    else update _t set fails = fails + 1; raise notice 'FAIL: expense_splits insert guard — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 11. Personal money fields (balances/budgets/goals) are encrypted at rest and
--     round-trip through the definer RPCs for the owner.
-- ---------------------------------------------------------------------------
do $$
declare u2 uuid; aid uuid; gid uuid; bal bigint; budcap bigint; gtar bigint;
        raw_a bytea; raw_b bytea; raw_g bytea; per date := date_trunc('month', current_date)::date;
begin
  begin
    u2 := pg_temp.zz_user('a');

    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    aid := public.save_account(null, 'ZZ acct', 'liability', 150000, 'EUR');
    perform public.save_budget(null, 50000, 'EUR', per);
    gid := public.save_goal(null, 'ZZ goal', 200000, 30000, 'EUR', null);
    bal    := (select balance_minor from public.my_accounts() where id = aid);
    budcap := (select amount_minor from public.my_budgets(per) where category_id is null order by period_start desc limit 1);
    gtar   := (select target_minor from public.my_goals() where id = gid);
    execute 'reset role';

    if bal <> 150000 then raise exception 'account balance decrypt = %', bal; end if;
    if budcap <> 50000 then raise exception 'budget cap decrypt = %', budcap; end if;
    if gtar <> 200000 then raise exception 'goal target decrypt = %', gtar; end if;

    -- Confirm the stored bytes are ciphertext, not plaintext.
    select balance_enc into raw_a from public.accounts where id = aid;
    select amount_enc  into raw_b from public.budgets where user_id = u2 and category_id is null and period_start = per order by created_at desc limit 1;
    select target_enc  into raw_g from public.savings_goals where id = gid;
    if raw_a is null or position('150000' in encode(raw_a, 'escape')) > 0 then raise exception 'balance stored plaintext'; end if;
    if raw_b is null or position('50000'  in encode(raw_b, 'escape')) > 0 then raise exception 'budget stored plaintext'; end if;
    if raw_g is null or position('200000' in encode(raw_g, 'escape')) > 0 then raise exception 'goal stored plaintext'; end if;

    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: balances/budgets/goals encrypted at rest + owner round-trip';
    else update _t set fails = fails + 1; raise notice 'FAIL: balances/budgets/goals encryption — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 12. Every function in public pins search_path (extension-owned ones aside),
--     so none can be hijacked by objects created earlier on the search path.
-- ---------------------------------------------------------------------------
do $$
declare unpinned text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into unpinned
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');
  if unpinned is null then update _t set passes = passes + 1; raise notice 'PASS: every public function pins search_path';
  else update _t set fails = fails + 1; raise notice 'FAIL: search_path not pinned on: %', unpinned; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 13. Receipts are no longer stored (0049): no bucket, no receipt_path
--     columns, no RPC parameter that carries one.
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  begin
    select count(*) into n from storage.buckets where id = 'receipts';
    if n <> 0 then raise exception 'receipts bucket still exists'; end if;
    select count(*) into n from storage.objects where bucket_id = 'receipts';
    if n <> 0 then raise exception 'receipt objects still stored'; end if;
    select count(*) into n from information_schema.columns
     where table_schema = 'public' and column_name = 'receipt_path';
    if n <> 0 then raise exception 'receipt_path column still exists'; end if;
    select count(*) into n from pg_proc p
     where p.pronamespace = 'public'::regnamespace and 'p_receipt_path' = any(p.proargnames);
    if n <> 0 then raise exception 'an RPC still takes p_receipt_path'; end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: receipts bucket + receipt_path columns gone';
    else update _t set fails = fails + 1; raise notice 'FAIL: receipts removal — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 14. Personal transactions (0050): ciphertext at rest; the owner round-trips
--     through save_transactions / my_transactions / update_transaction
--     (client_uuid idempotency kept); direct writes are closed; another user
--     can neither read nor edit the row.
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; cu uuid := gen_random_uuid(); tid uuid; r record; n int;
        raw_a bytea; raw_d bytea; raw_n bytea;
begin
  begin
    u1 := pg_temp.zz_user('a');
    u2 := pg_temp.zz_user('b');

    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    n := public.save_transactions(jsonb_build_array(jsonb_build_object(
      'client_uuid', cu, 'kind', 'expense', 'amount_minor', 424242, 'currency', 'EUR',
      'description', 'ZZ secret desc', 'notes', 'ZZ secret note', 'spent_at', current_date,
      'user_id', u2, 'group_id', gen_random_uuid())));
    if n <> 1 then raise exception 'insert returned %', n; end if;
    -- Retrying the same submit (same client_uuid) updates, never duplicates.
    n := public.save_transactions(jsonb_build_array(jsonb_build_object(
      'client_uuid', cu, 'kind', 'expense', 'amount_minor', 434343, 'currency', 'EUR',
      'description', 'ZZ secret desc', 'notes', 'ZZ secret note', 'spent_at', current_date)));
    if n <> 0 then raise exception 'retry inserted a duplicate'; end if;
    -- Import mode skips an existing client_uuid instead of overwriting it.
    n := public.save_transactions(jsonb_build_array(jsonb_build_object(
      'client_uuid', cu, 'amount_minor', 1, 'currency', 'EUR', 'spent_at', current_date)), true);
    if n <> 0 then raise exception 'ignore-duplicates inserted %', n; end if;

    select * into r from public.my_transactions() t where t.client_uuid = cu;
    if r.amount_minor is distinct from 434343 or r.description is distinct from 'ZZ secret desc'
       or r.notes is distinct from 'ZZ secret note' then
      raise exception 'owner round-trip mismatch: % / % / %', r.amount_minor, r.description, r.notes;
    end if;
    if r.user_id is distinct from u1 or r.group_id is not null then
      raise exception 'user_id/group_id not server-controlled';
    end if;
    tid := r.id;

    perform public.update_transaction(tid, '{"amount_minor": 987654, "notes": null}'::jsonb);
    select * into r from public.my_transactions() t where t.id = tid;
    if r.amount_minor <> 987654 or r.notes is not null or r.description <> 'ZZ secret desc' then
      raise exception 'patch semantics wrong: % / % / %', r.amount_minor, r.notes, r.description;
    end if;

    begin
      insert into public.transactions (user_id, kind, amount_enc, currency, spent_at)
        values (u1, 'expense', '\x00'::bytea, 'EUR', current_date);
      raise exception 'GUARD_MISSED: direct transaction insert allowed';
    exception when insufficient_privilege then null;
    end;
    execute 'reset role';

    select amount_enc, description_enc, notes_enc into raw_a, raw_d, raw_n
      from public.transactions where client_uuid = cu;
    if raw_a is null or position('987654' in encode(raw_a, 'escape')) > 0 then raise exception 'amount stored plaintext'; end if;
    if raw_d is null or position('ZZ secret' in encode(raw_d, 'escape')) > 0 then raise exception 'description stored plaintext'; end if;
    if raw_n is not null then raise exception 'cleared notes not null'; end if;

    -- Another user: no read, no edit.
    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from public.my_transactions() t where t.id = tid;
    if n <> 0 then raise exception 'outsider read the transaction'; end if;
    begin
      perform public.update_transaction(tid, '{"amount_minor": 1}'::jsonb);
      raise exception 'GUARD_MISSED: outsider edited';
    exception when others then
      if sqlerrm like '%not found%' then null; else raise; end if;
    end;
    execute 'reset role';

    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: transactions encrypted at rest + owner round-trip + outsider rejected';
    else update _t set fails = fails + 1; raise notice 'FAIL: transactions encryption — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 15. Group ledger (0050): expenses, splits, settlements, comments, the
--     audit log and the personal mirror are ciphertext at rest; members
--     round-trip through the RPCs; balances compute on decrypted amounts;
--     notifications don't quote the description; an outsider gets nothing
--     and can't write.
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; gid uuid; m1 uuid; m2 uuid; eid uuid; sid uuid; cid uuid;
        led jsonb; n int; b1 bigint; b2 bigint; r record; raw bytea; raw2 bytea;
begin
  begin
    u1 := pg_temp.zz_user('a');
    u2 := pg_temp.zz_user('b');

    insert into public.groups (name, owner_id, currency) values ('ZZT ledger', u1, 'EUR') returning id into gid;
    insert into public.group_members (group_id, user_id, display_name, role)
      values (gid, u1, 'Owner', 'owner') returning id into m1;
    insert into public.group_members (group_id, user_id, display_name)
      values (gid, u2, 'Member') returning id into m2;

    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    eid := public.create_group_expense_v2(gid, 'ZZ dinner secret', 1000, 'EUR', m1, current_date,
                                          array[m1, m2], null, 'equal');
    execute 'reset role';

    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    sid := public.add_settlement(gid, m2, m1, 200, 'EUR', null, 'ZZ paid back');
    cid := public.add_group_comment(gid, 'expense', eid, m2, 'ZZ comment secret');
    led := public.group_ledger(gid);
    select body into r from public.group_comments_for(gid, eid) limit 1;
    if r.body is distinct from 'ZZ comment secret' then raise exception 'comment round-trip: %', r.body; end if;
    select * into r from public.group_audit_entries(gid) a where a.action = 'expense_added';
    if r.summary not like '%ZZ dinner secret%' or r.amount_minor <> 1000 then
      raise exception 'audit round-trip: % / %', r.summary, r.amount_minor;
    end if;
    select net_minor into b1 from public.group_balances(gid) where member_id = m1;
    select net_minor into b2 from public.group_balances(gid) where member_id = m2;
    select * into r from public.my_transactions() t where t.group_expense_id = eid;
    begin
      insert into public.group_expenses (group_id, paid_by, amount_enc, currency, spent_at)
        values (gid, m2, '\x00'::bytea, 'EUR', current_date);
      raise exception 'GUARD_MISSED: direct group expense insert allowed';
    exception when insufficient_privilege then null;
    end;
    execute 'reset role';

    if led->'expenses'->0->>'description' is distinct from 'ZZ dinner secret'
       or (led->'expenses'->0->>'amount_minor')::bigint <> 1000 then
      raise exception 'expense round-trip: %', led->'expenses'->0;
    end if;
    select sum((s->>'share_minor')::bigint) into b1 from jsonb_array_elements(led->'expenses'->0->'expense_splits') s;
    if b1 <> 1000 then raise exception 'splits sum to %', b1; end if;
    if (led->'settlements'->0->>'amount_minor')::bigint <> 200
       or led->'settlements'->0->>'note' is distinct from 'ZZ paid back' then
      raise exception 'settlement round-trip: %', led->'settlements'->0;
    end if;
    select net_minor into b1 from public._group_net(gid) where member_id = m1;
    -- m1 paid 1000, owes 500, received 200 -> +300; m2 owes 500, paid back 200 -> -300.
    if b1 <> 300 or b2 <> -300 then raise exception 'balances wrong: % / %', b1, b2; end if;
    if r.amount_minor is distinct from 500 or r.description is distinct from 'ZZ dinner secret' then
      raise exception 'mirror round-trip: % / %', r.amount_minor, r.description;
    end if;

    -- Ciphertext at rest everywhere the plaintext used to live.
    select amount_enc, description_enc into raw, raw2 from public.group_expenses where id = eid;
    if position('1000' in encode(raw, 'escape')) > 0 or position('ZZ dinner' in encode(raw2, 'escape')) > 0 then
      raise exception 'group expense stored plaintext';
    end if;
    select share_enc into raw from public.expense_splits where expense_id = eid and member_id = m2;
    if raw is null or position('500' in encode(raw, 'escape')) > 0 then raise exception 'split stored plaintext'; end if;
    select amount_enc, note_enc into raw, raw2 from public.settlements where id = sid;
    if position('ZZ paid' in encode(raw2, 'escape')) > 0 then raise exception 'settlement note stored plaintext'; end if;
    select body_enc into raw from public.group_comments where id = cid;
    if raw is null or position('ZZ comment' in encode(raw, 'escape')) > 0 then raise exception 'comment stored plaintext'; end if;
    select count(*) into n from public.group_audit_log
     where group_id = gid and position('ZZ dinner' in encode(summary_enc, 'escape')) > 0;
    if n <> 0 then raise exception 'audit summary stored plaintext'; end if;
    select description_enc into raw from public.transactions where group_expense_id = eid and user_id = u2;
    if raw is null or position('ZZ dinner' in encode(raw, 'escape')) > 0 then raise exception 'mirror stored plaintext'; end if;
    select count(*) into n from public.notifications where group_id = gid and body like '%ZZ dinner%';
    if n <> 0 then raise exception 'notification body quotes the encrypted description'; end if;

    -- Outsider: reads come back empty, writes are refused.
    perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    if public.group_ledger(gid) is not null then raise exception 'outsider read the ledger'; end if;
    select count(*) into n from public.group_comments_for(gid, eid);
    if n <> 0 then raise exception 'outsider read comments'; end if;
    select count(*) into n from public.group_audit_entries(gid);
    if n <> 0 then raise exception 'outsider read the audit log'; end if;
    select count(*) into n from public.group_balances(gid);
    if n <> 0 then raise exception 'outsider read balances'; end if;
    begin
      perform public.add_settlement(gid, m2, m1, 100, 'EUR');
      raise exception 'GUARD_MISSED: outsider settlement';
    exception when others then
      if sqlerrm like '%not a member%' then null; else raise; end if;
    end;
    begin
      perform public.add_group_comment(gid, 'expense', eid, m2, 'spoof');
      raise exception 'GUARD_MISSED: outsider comment';
    exception when others then
      if sqlerrm like '%not allowed%' then null; else raise; end if;
    end;
    begin
      perform public.create_group_expense_v2(gid, 'x', 1, 'EUR', m1, current_date, array[m1], null, 'equal');
      raise exception 'GUARD_MISSED: outsider expense';
    exception when others then
      if sqlerrm like '%not a member%' then null; else raise; end if;
    end;
    execute 'reset role';

    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: group ledger encrypted at rest + member round-trip + balances + outsider rejected';
    else update _t set fails = fails + 1; raise notice 'FAIL: group ledger encryption — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 16. Recurring rules (0050): ciphertext at rest, owner round-trip + patch,
--     the materializer generates a correctly-decrypting transaction, and
--     another user can neither read nor edit the rule.
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; rid uuid; r record; n int; raw bytea;
begin
  begin
    u1 := pg_temp.zz_user('a');
    u2 := pg_temp.zz_user('b');

    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    rid := public.save_recurring_rule(null, jsonb_build_object(
      'kind', 'expense', 'amount_minor', 31337, 'currency', 'EUR', 'description', 'ZZ rent secret',
      'frequency', 'monthly', 'interval_n', 1, 'next_run', current_date - 1, 'user_id', u2));
    perform public.save_recurring_rule(rid, '{"is_active": false}'::jsonb);
    select * into r from public.my_recurring_rules() x where x.id = rid;
    if r.is_active or r.amount_minor <> 31337 or r.description <> 'ZZ rent secret' or r.user_id <> u1 then
      raise exception 'rule round-trip/patch wrong: % % % %', r.is_active, r.amount_minor, r.description, r.user_id;
    end if;
    perform public.save_recurring_rule(rid, '{"is_active": true}'::jsonb);
    execute 'reset role';

    select amount_enc into raw from public.recurring_rules where id = rid;
    if raw is null or position('31337' in encode(raw, 'escape')) > 0 then raise exception 'rule amount stored plaintext'; end if;

    perform public.materialize_recurring_rules();
    select count(*) into n from public.transactions
     where user_id = u1 and spent_at = current_date - 1
       and public.dec_minor(amount_enc) = 31337 and public.dec_text(description_enc) = 'ZZ rent secret';
    if n <> 1 then raise exception 'materializer produced % matching transactions', n; end if;

    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from public.my_recurring_rules() x where x.id = rid;
    if n <> 0 then raise exception 'outsider read the rule'; end if;
    begin
      perform public.save_recurring_rule(rid, '{"amount_minor": 1}'::jsonb);
      raise exception 'GUARD_MISSED: outsider edited rule';
    exception when others then
      if sqlerrm like '%not found%' then null; else raise; end if;
    end;
    execute 'reset role';

    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: recurring rules encrypted at rest + owner round-trip + materializer + outsider rejected';
    else update _t set fails = fails + 1; raise notice 'FAIL: recurring rules encryption — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 17. group_invites (0051): per-verb policies (no FOR ALL); created_by and
--     expires_at (<= 24h) are forced server-side on insert AND update; only
--     the creator or owner can delete.
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; gid uuid; iid uuid; iid2 uuid; cb uuid; ab uuid; exp timestamptz; n int;
begin
  begin
    u1 := pg_temp.zz_user('a');
    u2 := pg_temp.zz_user('b');

    select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'group_invites' and cmd = 'ALL';
    if n <> 0 then raise exception 'blanket FOR ALL policy still present'; end if;
    select count(distinct cmd) into n from pg_policies
     where schemaname = 'public' and tablename = 'group_invites' and cmd in ('SELECT', 'INSERT', 'UPDATE', 'DELETE');
    if n <> 4 then raise exception 'expected 4 per-verb policies, got %', n; end if;

    insert into public.groups (name, owner_id, currency) values ('ZZT invites', u1, 'EUR') returning id into gid;
    insert into public.group_members (group_id, user_id, display_name, role) values (gid, u1, 'Owner', 'owner');
    insert into public.group_members (group_id, user_id, display_name) values (gid, u2, 'Member');

    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    -- Spoofed creator, a 100-year link and pre-filled acceptance.
    insert into public.group_invites (group_id, created_by, expires_at, accepted_by, accepted_at)
      values (gid, u1, now() + interval '100 years', u1, now())
      returning id, created_by, expires_at, accepted_by into iid, cb, exp, ab;
    if cb is distinct from u2 then raise exception 'created_by not forced: %', cb; end if;
    if exp > now() + interval '24 hours' then raise exception 'expires_at not clamped: %', exp; end if;
    if ab is not null then raise exception 'accepted_by accepted from client'; end if;
    -- A never-expiring link (null) is clamped too; an omitted created_by is filled in
    -- (that's how the client inserts).
    insert into public.group_invites (group_id, expires_at) values (gid, null)
      returning created_by, expires_at into cb, exp;
    if cb is distinct from u2 then raise exception 'omitted created_by not filled: %', cb; end if;
    if exp is null or exp > now() + interval '24 hours' then raise exception 'null expires_at not clamped'; end if;
    -- Updates can't extend the link or reassign it.
    update public.group_invites set expires_at = now() + interval '10 years', created_by = u1 where id = iid;
    select created_by, expires_at into cb, exp from public.group_invites where id = iid;
    if cb is distinct from u2 or exp > now() + interval '24 hours' then
      raise exception 'update bypassed the guard: % %', cb, exp;
    end if;
    execute 'reset role';

    -- The owner's link can't be deleted by a plain member.
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into public.group_invites (group_id, created_by) values (gid, u1) returning id into iid2;
    execute 'reset role';
    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    delete from public.group_invites where id = iid2;
    execute 'reset role';
    select count(*) into n from public.group_invites where id = iid2;
    if n <> 1 then raise exception 'member deleted the owner''s invite'; end if;

    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: invite policies per-verb + created_by/expires_at forced';
    else update _t set fails = fails + 1; raise notice 'FAIL: invite policies — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 18. group_preview (anon, 0051) returns only name / picture / member count /
--     inviter / expiry — no member names or avatars, expenses or balances.
--     preview_link_invite (signed-in) lists members but carries no money.
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; gid uuid; m1 uuid; tok text := 'zztest_' || md5(random()::text); res jsonb;
begin
  begin
    u1 := pg_temp.zz_user('a');
    u2 := pg_temp.zz_user('b');

    insert into public.groups (name, owner_id, currency) values ('ZZT preview', u1, 'EUR') returning id into gid;
    insert into public.group_members (group_id, user_id, display_name, role)
      values (gid, u1, 'ZZT-hidden-owner', 'owner') returning id into m1;
    insert into public.group_members (group_id, user_id, display_name) values (gid, u2, 'ZZT-hidden-member');
    insert into public.group_expenses (group_id, paid_by, amount_enc, currency, description_enc, spent_at)
      values (gid, m1, public.enc_minor(777001), 'EUR', public.enc_text('ZZT-hidden-expense'), current_date);
    insert into public.group_invites (group_id, token, created_by) values (gid, tok, u1);

    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    execute 'set local role anon';
    res := public.group_preview(tok);
    execute 'reset role';
    if res is null then raise exception 'anon preview returned null'; end if;
    if res->'group'->>'name' is distinct from 'ZZT preview' then raise exception 'group name missing'; end if;
    if (res->>'member_count')::int <> 2 then raise exception 'member_count = %', res->>'member_count'; end if;
    if res->>'invited_by' is null or res->>'expires_at' is null then raise exception 'inviter/expiry missing'; end if;
    if res ?| array['members', 'expenses', 'settlements'] then raise exception 'anon preview carries lists: %', res; end if;
    if res::text ~ 'ZZT-hidden|777001|net_minor|amount_minor|avatar_url' then
      raise exception 'anon preview leaks: %', res;
    end if;

    perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    res := public.preview_link_invite(tok);
    execute 'reset role';
    if res->>'status' <> 'joinable' or jsonb_array_length(res->'preview'->'members') <> 2 then
      raise exception 'signed-in preview wrong: %', res;
    end if;
    if res::text ~ 'ZZT-hidden-expense|777001|net_minor|amount_minor' then
      raise exception 'signed-in preview carries money: %', res;
    end if;

    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: anon group_preview is minimal (no members/expenses/balances)';
    else update _t set fails = fails + 1; raise notice 'FAIL: group_preview minimal — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 19. Grants: the crypto helpers are never callable by an API role, and the
--     new decrypting/encrypting RPCs are closed to anon.
-- ---------------------------------------------------------------------------
do $$
declare bad text;
begin
  select string_agg(p.oid::regprocedure::text || ' -> ' || r.rolname, ', ') into bad
  from pg_proc p
  cross join (values ('anon'), ('authenticated')) as r(rolname)
  where p.pronamespace = 'public'::regnamespace
    and (p.proname in ('enc_text', 'dec_text', 'enc_minor', 'dec_minor', 'app_enc_key', 'group_invite_guard')
         or (r.rolname = 'anon' and p.proname in (
               'my_transactions', 'save_transactions', 'update_transaction', 'my_recurring_rules',
               'save_recurring_rule', 'group_ledger', 'group_audit_entries', 'group_comments_for',
               'add_settlement', 'add_group_comment', 'create_group_expense', 'create_group_expense_v2',
               'update_group_expense', 'update_group_expense_v2', 'preview_link_invite',
               'consume_quota')))
    and has_function_privilege(r.rolname, p.oid, 'execute');
  if bad is null then update _t set passes = passes + 1; raise notice 'PASS: crypto helpers + new RPCs not executable by anon';
  else update _t set fails = fails + 1; raise notice 'FAIL: over-granted functions: %', bad; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 20. rate_limit() is closed to API roles (0052): a user can't spend someone
--     else's bucket; consume_quota only spends the caller's own allow-listed
--     scopes; the definer callers (e.g. nudge_member) still work.
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; gid uuid; m2 uuid; ok boolean; n int;
begin
  begin
    u1 := pg_temp.zz_user('a');
    u2 := pg_temp.zz_user('b');
    if has_function_privilege('authenticated', 'public.rate_limit(text,integer,integer)', 'execute')
       or has_function_privilege('anon', 'public.rate_limit(text,integer,integer)', 'execute') then
      raise exception 'rate_limit still executable by an API role';
    end if;

    insert into public.groups (name, owner_id, currency) values ('ZZT quota', u1, 'EUR') returning id into gid;
    insert into public.group_members (group_id, user_id, display_name, role) values (gid, u1, 'Owner', 'owner');
    insert into public.group_members (group_id, user_id, display_name) values (gid, u2, 'Member') returning id into m2;

    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.rate_limit('gexp:' || u2, 1, 3600);
      raise exception 'GUARD_MISSED: rate_limit callable';
    exception when insufficient_privilege then null;
    end;
    ok := public.consume_quota('report');
    if ok is distinct from true then raise exception 'consume_quota(report) = %', ok; end if;
    begin
      perform public.consume_quota('gexp');
      raise exception 'GUARD_MISSED: arbitrary scope accepted';
    exception when others then
      if sqlerrm like '%unknown quota scope%' then null; else raise; end if;
    end;
    perform public.nudge_member(gid, m2);   -- definer caller of rate_limit still works
    execute 'reset role';

    select count(*) into n from public.rate_limits where key = 'report:' || u1;
    if n <> 1 then raise exception 'quota not keyed on the caller'; end if;

    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: rate_limit closed to API roles + consume_quota scoped to caller';
    else update _t set fails = fails + 1; raise notice 'FAIL: rate_limit lock-down — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 21. M4 (0058): invite_user_to_group answers with a status instead of raising
--     on a miss, so every lookup — hit or miss — spends the inviter's quota
--     (20/h). Before 0058 a miss raised, rolling its own increment back.
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; u3 uuid; em2 text; em3 text; gid uuid; n int; r jsonb; i int;
begin
  begin
    u1 := pg_temp.zz_user('a');
    u2 := pg_temp.zz_user('b');
    u3 := pg_temp.zz_user('c');
    select email into em2 from auth.users where id = u2;   -- rows this test just made
    select email into em3 from auth.users where id = u3;
    insert into public.groups (name, owner_id, currency) values ('ZZT invite limit', u1, 'EUR') returning id into gid;
    insert into public.group_members (group_id, user_id, display_name, role) values (gid, u1, 'Owner', 'owner');
    insert into public.group_members (group_id, user_id, display_name) values (gid, u2, 'Member');

    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    r := public.invite_user_to_group(gid, upper(em3));
    if r->>'status' is distinct from 'invited' or r->>'invite_id' is null then raise exception 'invite: %', r; end if;
    r := public.invite_user_to_group(gid, em3);
    if r->>'status' is distinct from 'already_invited' then raise exception 'repeat invite: %', r; end if;
    r := public.invite_user_to_group(gid, em2);
    if r->>'status' is distinct from 'already_member' then raise exception 'member invite: %', r; end if;
    -- 17 misses, each its own sub-block (= its own REST call): 20 lookups in all.
    for i in 1..17 loop
      begin
        r := public.invite_user_to_group(gid, 'zzt-nobody-' || i || '-' || md5(random()::text) || '@example.com');
        if r->>'status' is distinct from 'no_account' then raise exception 'miss %: %', i, r; end if;
      end;
    end loop;
    begin
      r := public.invite_user_to_group(gid, 'zzt-nobody-21@example.com');
      raise exception 'GUARD_MISSED: 21st lookup allowed';
    exception when others then
      if sqlerrm not like '%Too many invites%' then raise; end if;
    end;
    execute 'reset role';

    select count into n from public.rate_limits where key = 'invite:' || u1;
    if n is distinct from 20 then raise exception 'lookups not all counted: %', n; end if;
    select count(*) into n from public.notifications where user_id = u3 and group_id = gid and type = 'invite';
    if n <> 1 then raise exception 'invite not delivered (got %)', n; end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: invite_user_to_group returns a status and every lookup is rate-limited';
    else update _t set fails = fails + 1; raise notice 'FAIL: invite status / rate limit — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 22. No blanket FOR ALL policy left in public or storage (0050–0052); the
--     split policies keep the same own-row / own-folder semantics.
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; bad text; n int; cid uuid;
begin
  begin
    u1 := pg_temp.zz_user('a');
    u2 := pg_temp.zz_user('b');

    select string_agg(schemaname || '.' || tablename || '.' || policyname, ', ') into bad
      from pg_policies where schemaname in ('public', 'storage') and cmd = 'ALL';
    if bad is not null then raise exception 'FOR ALL policies remain: %', bad; end if;
    -- Tables the client still writes directly keep all four verbs; the rest keep
    -- only the verbs a client uses (their writes go through definer RPCs, 0053).
    -- notifications: no client INSERT since 0057.
    select string_agg(t, ', ') into bad from (
      select tablename as t from pg_policies
       where schemaname = 'public' and tablename in ('categories', 'category_rules')
       group by tablename having count(distinct cmd) <> 4) x;
    if bad is not null then raise exception 'not split into 4 verbs: %', bad; end if;
    select string_agg(cmd, ',' order by cmd) into bad from pg_policies
     where schemaname = 'public' and tablename = 'notifications';
    if bad is distinct from 'DELETE,SELECT,UPDATE' then raise exception 'notifications policies: %', bad; end if;
    select count(distinct cmd) into n from pg_policies
     where schemaname = 'storage' and tablename = 'objects' and policyname like 'avatars\_%';
    if n <> 4 then raise exception 'avatars policies not per-verb (%)', n; end if;

    -- Own rows: owner can write/read; someone else can neither see nor touch them.
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into public.categories (user_id, name, kind) values (u1, 'ZZT own cat', 'expense') returning id into cid;
    -- A row "for another user" is stamped with the caller instead (0060
    -- categories_guard); it never lands in u2's account.
    insert into public.categories (user_id, name, kind) values (u2, 'ZZT spoof', 'expense');
    execute 'reset role';
    select count(*) into n from public.categories where user_id = u2 and name = 'ZZT spoof';
    if n <> 0 then raise exception 'GUARD_MISSED: inserted a row for another user'; end if;
    execute 'set local role authenticated';
    insert into storage.objects (bucket_id, name) values ('avatars', u1 || '/zzt.png');
    begin
      insert into storage.objects (bucket_id, name) values ('avatars', u2 || '/zzt.png');
      raise exception 'GUARD_MISSED: wrote into another user''s avatar folder';
    exception when insufficient_privilege then null;
    end;
    execute 'reset role';

    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from public.categories where id = cid;
    if n <> 0 then raise exception 'other user sees the category'; end if;
    update public.categories set name = 'hijack' where id = cid;
    select count(*) into n from storage.objects where bucket_id = 'avatars' and name = u1 || '/zzt.png';
    if n <> 0 then raise exception 'other user lists my avatar folder'; end if;
    execute 'reset role';
    select count(*) into n from public.categories where id = cid and name = 'ZZT own cat';
    if n <> 1 then raise exception 'other user updated my category'; end if;

    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: no FOR ALL policies left + own-row/own-folder semantics kept';
    else update _t set fails = fails + 1; raise notice 'FAIL: per-verb policies — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 23. H1 (0053): no decryption oracle. Ciphertext columns can't be written
--     directly (so foreign ciphertext can't be planted into your own row and
--     read back), a failed decrypt-to-number doesn't echo the plaintext, and
--     the write RPCs ignore client-supplied *_enc keys.
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; aid uuid; gid uuid; planted bytea; cu uuid := gen_random_uuid(); r record; bad text;
begin
  begin
    u1 := pg_temp.zz_user('a');
    select string_agg(t || ':' || v, ', ') into bad
      from (values ('budgets'), ('accounts'), ('savings_goals'), ('group_audit_log'), ('profiles')) x(t)
      cross join (values ('INSERT'), ('UPDATE')) y(v)
     where has_table_privilege('authenticated', 'public.' || t, v)
        or has_table_privilege('anon', 'public.' || t, v);
    if bad is not null then raise exception 'table-level writes still granted: %', bad; end if;
    if has_column_privilege('authenticated', 'public.profiles', 'payment_iban_enc', 'UPDATE')
       or has_column_privilege('authenticated', 'public.profiles', 'payment_revolut_enc', 'UPDATE') then
      raise exception 'payment ciphertext columns still updatable';
    end if;

    planted := public.enc_text('ZZ leaked secret');   -- stands in for ciphertext from a dump
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    aid := public.save_account(null, 'ZZ acct', 'asset', 100, 'EUR');
    gid := public.save_goal(null, 'ZZ goal', 100, 0, 'EUR', null);
    perform public.save_budget(null, 100, 'EUR', date_trunc('month', current_date)::date);
    begin
      update public.accounts set balance_enc = planted where id = aid;
      raise exception 'GUARD_MISSED: planted into accounts';
    exception when insufficient_privilege then null; end;
    begin
      update public.savings_goals set target_enc = planted where id = gid;
      raise exception 'GUARD_MISSED: planted into savings_goals';
    exception when insufficient_privilege then null; end;
    begin
      update public.budgets set amount_enc = planted where user_id = u1;
      raise exception 'GUARD_MISSED: planted into budgets';
    exception when insufficient_privilege then null; end;
    begin
      insert into public.budgets (user_id, amount_enc, currency, period_start) values (u1, planted, 'EUR', current_date);
      raise exception 'GUARD_MISSED: inserted into budgets';
    exception when insufficient_privilege then null; end;
    begin
      update public.profiles set payment_iban_enc = planted where id = u1;
      raise exception 'GUARD_MISSED: planted into profiles';
    exception when insufficient_privilege then null; end;
    update public.profiles set display_name = display_name where id = u1;   -- editable fields still work
    -- *_enc keys in the payload are ignored; only the plaintext amount counts.
    perform public.save_transactions(jsonb_build_array(jsonb_build_object(
      'client_uuid', cu, 'amount_minor', 4321, 'currency', 'EUR', 'spent_at', current_date,
      'amount_enc', encode(planted, 'hex'), 'description_enc', encode(planted, 'hex'))));
    select * into r from public.my_transactions() t where t.client_uuid = cu;
    execute 'reset role';
    if r.amount_minor is distinct from 4321 or r.description is not null then
      raise exception 'client *_enc keys were honoured: % / %', r.amount_minor, r.description;
    end if;

    begin
      perform public.dec_minor(planted);
      raise exception 'GUARD_MISSED: text decrypted as a number';
    exception when others then
      if position('ZZ leaked secret' in sqlerrm) > 0 then raise exception 'dec_minor echoed the plaintext'; end if;
      if sqlerrm not like '%not an amount%' then raise; end if;
    end;

    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: no decryption oracle (direct ciphertext writes closed, dec_minor silent, *_enc keys ignored)';
    else update _t set fails = fails + 1; raise notice 'FAIL: decryption oracle — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 24. M1 (0053): a 500-row import into a budgeted category stays fast (the
--     budget alert runs once per statement, not once per row) and alerts once.
-- ---------------------------------------------------------------------------
do $$
declare u uuid; cat uuid; t0 timestamptz; ms int := -1; n int;
begin
  begin
    u := pg_temp.zz_user('a');
    insert into public.categories (user_id, name, kind) values (u, 'ZZT bulk cat', 'expense') returning id into cat;
    insert into public.budgets (user_id, category_id, amount_enc, currency, period_start)
      values (u, cat, public.enc_minor(40000), 'EUR', date_trunc('month', current_date)::date);
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    t0 := clock_timestamp();
    n := public.save_transactions((select jsonb_agg(jsonb_build_object(
      'kind', 'expense', 'category_id', cat, 'amount_minor', 100, 'currency', 'EUR', 'spent_at', current_date))
      from generate_series(1, 500)));
    ms := (extract(epoch from clock_timestamp() - t0) * 1000)::int;
    execute 'reset role';
    if n <> 500 then raise exception 'inserted % rows', n; end if;
    select count(*) into n from public.notifications where user_id = u and type = 'budget' and title = 'Budget exceeded';
    if n <> 1 then raise exception 'expected 1 exceeded alert, got %', n; end if;
    select count(*) into n from public.notifications where user_id = u and type = 'budget' and title = 'Budget almost used';
    if n <> 0 then raise exception 'duplicate 80%% alert in the same statement'; end if;
    if ms > 4000 then raise exception '500-row import took % ms', ms; end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: 500-row import into a budgeted category in % ms, one alert', ms;
    else update _t set fails = fails + 1; raise notice 'FAIL: bulk import / budget alert — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 25. M2 (0053): recurring next_run is clamped to 1 year back; ≤ 200 rules.
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; rid uuid; nr date; have int;
begin
  begin
    u1 := pg_temp.zz_user('a');
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    rid := public.save_recurring_rule(null, jsonb_build_object(
      'amount_minor', 1, 'currency', 'EUR', 'next_run', current_date - interval '5 years'));
    execute 'reset role';
    select next_run into nr from public.recurring_rules where id = rid;
    if nr <> (current_date - interval '1 year')::date then raise exception 'insert not clamped: %', nr; end if;
    execute 'set local role authenticated';
    perform public.save_recurring_rule(rid, '{"next_run": "2000-01-01"}'::jsonb);
    execute 'reset role';
    select next_run into nr from public.recurring_rules where id = rid;
    if nr <> (current_date - interval '1 year')::date then raise exception 'update not clamped: %', nr; end if;

    select count(*) into have from public.recurring_rules where user_id = u1;
    insert into public.recurring_rules (user_id, amount_enc, next_run, is_active)
      select u1, public.enc_minor(1), current_date + 30, false from generate_series(1, 200 - have);
    execute 'set local role authenticated';
    begin
      perform public.save_recurring_rule(null, '{"amount_minor": 1}'::jsonb);
      raise exception 'GUARD_MISSED: 201st rule accepted';
    exception when others then
      if sqlerrm like '%at most 200%' then null; else raise; end if;
    end;
    execute 'reset role';
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: recurring next_run clamped + 200-rule cap';
    else update _t set fails = fails + 1; raise notice 'FAIL: recurring limits — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 26. L1 (0053): editing an expense after a member left doesn't rewrite that
--     former member's personal copy; current members' copies still follow.
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; gid uuid; m1 uuid; m2 uuid; eid uuid; d1 text; d2 text;
begin
  begin
    u1 := pg_temp.zz_user('a');
    u2 := pg_temp.zz_user('b');
    insert into public.groups (name, owner_id, currency) values ('ZZT leave-edit', u1, 'EUR') returning id into gid;
    insert into public.group_members (group_id, user_id, display_name, role) values (gid, u1, 'Owner', 'owner') returning id into m1;
    insert into public.group_members (group_id, user_id, display_name) values (gid, u2, 'Leaver') returning id into m2;

    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    eid := public.create_group_expense_v2(gid, 'ZZ old desc', 1000, 'EUR', m1, current_date, array[m1, m2], null, 'equal');
    execute 'reset role';
    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.add_settlement(gid, m2, m1, 500, 'EUR');
    perform public.remove_group_member(m2, true);
    execute 'reset role';
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.update_group_expense_v2(eid, 'ZZ new desc', 1000, 'EUR', m1, current_date, array[m1, m2], null, 'equal');
    execute 'reset role';

    select public.dec_text(description_enc) into d2 from public.transactions where user_id = u2 and group_expense_id = eid;
    select public.dec_text(description_enc) into d1 from public.transactions where user_id = u1 and group_expense_id = eid;
    if d2 is null then raise exception 'former member copy missing (scenario invalid)'; end if;
    if d2 <> 'ZZ old desc' then raise exception 'former member copy rewritten to %', d2; end if;
    if d1 is distinct from 'ZZ new desc' then raise exception 'current member copy not updated: %', d1; end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: expense edit leaves former members'' copies alone';
    else update _t set fails = fails + 1; raise notice 'FAIL: former member copy — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 27. L2 (0053): write RPCs reject someone else's category, and the category
--     name lookups (budget alert, digest, my_budgets) never resolve it.
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; vcat uuid; tid uuid; n int;
begin
  begin
    u1 := pg_temp.zz_user('a');
    u2 := pg_temp.zz_user('b');
    insert into public.categories (user_id, name, kind) values (u2, 'ZZT victim secret', 'expense') returning id into vcat;

    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.save_transactions(jsonb_build_array(jsonb_build_object('amount_minor', 1, 'category_id', vcat)));
      raise exception 'GUARD_MISSED: save_transactions';
    exception when others then if sqlerrm not like '%not found%' then raise; end if; end;
    begin
      perform public.save_recurring_rule(null, jsonb_build_object('amount_minor', 1, 'category_id', vcat));
      raise exception 'GUARD_MISSED: save_recurring_rule';
    exception when others then if sqlerrm not like '%not found%' then raise; end if; end;
    begin
      perform public.save_budget(vcat, 1, 'EUR', null);
      raise exception 'GUARD_MISSED: save_budget';
    exception when others then if sqlerrm not like '%not found%' then raise; end if; end;
    perform public.save_transactions(jsonb_build_array(jsonb_build_object('amount_minor', 1)));
    select id into tid from public.my_transactions() limit 1;
    begin
      perform public.update_transaction(tid, jsonb_build_object('category_id', vcat));
      raise exception 'GUARD_MISSED: update_transaction';
    exception when others then if sqlerrm not like '%not found%' then raise; end if; end;
    execute 'reset role';

    -- Rows that reference a foreign category anyway (legacy data) don't leak its name.
    insert into public.budgets (user_id, category_id, amount_enc, currency, period_start)
      values (u1, vcat, public.enc_minor(100), 'EUR', date_trunc('month', current_date)::date);
    insert into public.transactions (user_id, kind, category_id, amount_enc, currency, spent_at)
      values (u1, 'expense', vcat, public.enc_minor(200), 'EUR', current_date);
    update public.profiles set notify_digest = true where id = u1;  -- opt-in (0072)
    perform public.send_weekly_digests();
    select count(*) into n from public.notifications where user_id = u1 and body like '%victim secret%';
    if n <> 0 then raise exception 'foreign category name leaked into % notification(s)', n; end if;
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from public.my_budgets(date_trunc('month', current_date)::date) b
     where b.category_id = vcat and b.categories is not null;
    execute 'reset role';
    if n <> 0 then raise exception 'my_budgets embedded a foreign category'; end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: foreign category/account ids rejected + names not leaked';
    else update _t set fails = fails + 1; raise notice 'FAIL: foreign category refs — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 28. L3 (0053): an API caller can't choose the invite token.
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; gid uuid; tok text;
begin
  begin
    u1 := pg_temp.zz_user('a');
    insert into public.groups (name, owner_id, currency) values ('ZZT token', u1, 'EUR') returning id into gid;
    insert into public.group_members (group_id, user_id, display_name, role) values (gid, u1, 'Owner', 'owner');
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into public.group_invites (group_id, token) values (gid, 'x') returning token into tok;
    execute 'reset role';
    if tok = 'x' or length(tok) < 32 then raise exception 'client-chosen token accepted: %', tok; end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: invite token is server-generated';
    else update _t set fails = fails + 1; raise notice 'FAIL: invite token — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 29. Deleting a group that has expenses works (the audit trigger must not
--     log into a group that is being deleted), via delete_group.
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; gid uuid; m1 uuid; eid uuid; left_rows int; logged int;
begin
  begin
    u1 := pg_temp.zz_user('a');
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    gid := public.create_group('ZZT delete', 'EUR');
    execute 'reset role';
    select id into m1 from public.group_members where group_id = gid and user_id = u1;
    execute 'set local role authenticated';
    perform public.create_group_expense_v2(gid, 'zz lunch', 1000, 'EUR', m1, current_date, array[m1], null, 'equal');
    perform public.create_group_expense_v2(gid, 'zz dinner', 2000, 'EUR', m1, current_date, array[m1], null, 'equal');
    execute 'reset role';
    -- A single expense delete is still audited...
    select id into eid from public.group_expenses where group_id = gid order by created_at limit 1;
    execute 'set local role authenticated';
    delete from public.group_expenses where id = eid;
    execute 'reset role';
    select count(*) into logged from public.group_audit_log where group_id = gid and action = 'expense_deleted';
    if logged <> 1 then raise exception 'single delete not audited (got %)', logged; end if;
    -- ...and deleting the whole group (cascade) no longer trips the audit FK.
    execute 'set local role authenticated';
    perform public.delete_group(gid);
    execute 'reset role';
    select count(*) into left_rows from public.groups where id = gid;
    if left_rows <> 0 then raise exception 'group not deleted'; end if;

    -- Deleting the account of a sole owner of a group with expenses also works
    -- (its cascade SET NULLs created_by: an UPDATE that runs after the group
    -- row is gone).
    u1 := pg_temp.zz_user('owner');
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    gid := public.create_group('ZZT owner delete', 'EUR');
    execute 'reset role';
    select id into m1 from public.group_members where group_id = gid and user_id = u1;
    execute 'set local role authenticated';
    perform public.create_group_expense_v2(gid, 'zz taxi', 1500, 'EUR', m1, current_date, array[m1], null, 'equal');
    execute 'reset role';
    delete from auth.users where id = u1;
    select count(*) into left_rows from public.groups where id = gid;
    if left_rows <> 0 then raise exception 'owner deletion left the group behind'; end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: groups with expenses can be deleted (delete_group + owner account deletion)';
    else update _t set fails = fails + 1; raise notice 'FAIL: delete_group with expenses — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 30. passkey_reminder_off: the owner can set it; another user cannot touch it.
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; v boolean; n int;
begin
  begin
    u1 := pg_temp.zz_user('a');
    u2 := pg_temp.zz_user('pk');
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.profiles set passkey_reminder_off = true where id = u1;
    update public.profiles set passkey_reminder_off = true where id = u2;  -- RLS: 0 rows
    get diagnostics n = row_count;
    execute 'reset role';
    if n <> 0 then raise exception 'updated another user''s profile'; end if;
    select passkey_reminder_off into v from public.profiles where id = u1;
    if v is distinct from true then raise exception 'owner could not set the flag'; end if;
    select passkey_reminder_off into v from public.profiles where id = u2;
    if v then raise exception 'flag leaked onto another user'; end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: passkey_reminder_off owner-only';
    else update _t set fails = fails + 1; raise notice 'FAIL: passkey_reminder_off — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 31. Clients cannot create notifications (each one fans out to push/email),
--     for themselves or anyone else, and can only change read_at on their own.
-- ---------------------------------------------------------------------------
do $$
declare u uuid; u2 uuid; nid uuid; nid2 uuid; blocked_insert boolean := false; blocked_other boolean := false;
        blocked_title boolean := false; n int; n2 int;
begin
  begin
    u := pg_temp.zz_user('notif');
    u2 := pg_temp.zz_user('notif2');
    insert into public.notifications (user_id, type, title, body)
      values (u, 'digest', 'zz title', 'zz body') returning id into nid;
    insert into public.notifications (user_id, type, title, body)
      values (u2, 'digest', 'zz title', 'zz body') returning id into nid2;
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      insert into public.notifications (user_id, type, title, body) values (u, 'member_joined', 'x', 'y');
    exception when insufficient_privilege then blocked_insert := true;
    end;
    begin
      insert into public.notifications (user_id, type, title, body) values (u2, 'member_joined', 'x', 'y');
    exception when insufficient_privilege then blocked_other := true;
    end;
    update public.notifications set read_at = now() where id = nid2;   -- RLS: 0 rows
    get diagnostics n2 = row_count;
    begin
      update public.notifications set title = 'changed' where id = nid;
    exception when insufficient_privilege then blocked_title := true;
    end;
    update public.notifications set read_at = now() where id = nid;
    get diagnostics n = row_count;
    execute 'reset role';
    if not blocked_insert then raise exception 'client could insert a notification'; end if;
    if not blocked_other then raise exception 'client could insert a notification for another user'; end if;
    if n2 <> 0 then raise exception 'client marked another user''s notification read'; end if;
    if not blocked_title then raise exception 'client could change a notification title'; end if;
    if n <> 1 then raise exception 'client could not mark its notification read'; end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: notifications insert blocked, only read_at updatable';
    else update _t set fails = fails + 1; raise notice 'FAIL: notifications lockdown — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 32. M3/F1 (0058): a group owner can't rewrite membership or ownership
--     directly (no member UPDATE/INSERT/DELETE, groups only name/image_url),
--     the guards pin identity columns even if a grant comes back, and the
--     definer RPCs still move ownership.
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; u3 uuid; gid uuid; gid2 uuid; m1 uuid; m2 uuid; n int; blocked int := 0; r record;
begin
  begin
    u1 := pg_temp.zz_user('m3o');
    u2 := pg_temp.zz_user('m3m');
    u3 := pg_temp.zz_user('m3s');
    insert into public.groups (name, owner_id, currency) values ('ZZT m3', u1, 'EUR') returning id into gid;
    insert into public.groups (name, owner_id, currency) values ('ZZT m3 other', u1, 'EUR') returning id into gid2;
    insert into public.group_members (group_id, user_id, display_name, role) values (gid, u1, 'Owner', 'owner') returning id into m1;
    insert into public.group_members (group_id, user_id, display_name, role) values (gid2, u1, 'Owner', 'owner');
    insert into public.group_members (group_id, user_id, display_name) values (gid, u2, 'Member') returning id into m2;

    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin update public.group_members set user_id = u3 where id = m2;
    exception when insufficient_privilege then blocked := blocked + 1; end;
    begin update public.group_members set group_id = gid2 where id = m2;
    exception when insufficient_privilege then blocked := blocked + 1; end;
    begin delete from public.group_members where id = m2;
    exception when insufficient_privilege then blocked := blocked + 1; end;
    begin insert into public.group_members (group_id, user_id, display_name) values (gid, u1, 'Dup');
    exception when insufficient_privilege then blocked := blocked + 1; end;
    begin update public.groups set owner_id = u3 where id = gid;
    exception when insufficient_privilege then blocked := blocked + 1; end;
    begin update public.groups set currency = 'USD' where id = gid;
    exception when insufficient_privilege then blocked := blocked + 1; end;
    begin insert into public.groups (name, owner_id, currency) values ('ZZT forged', u1, 'EUR');
    exception when insufficient_privilege then blocked := blocked + 1; end;
    begin delete from public.groups where id = gid;   -- bypassed delete_group's settled-up check
    exception when insufficient_privilege then blocked := blocked + 1; end;
    update public.groups set name = 'ZZT m3 renamed' where id = gid;
    get diagnostics n = row_count;
    execute 'reset role';
    if blocked <> 8 then raise exception 'only % of 8 direct writes refused', blocked; end if;
    if n <> 1 then raise exception 'owner could not rename the group'; end if;
    select user_id, group_id into r from public.group_members where id = m2;
    if r.user_id is distinct from u2 or r.group_id is distinct from gid then raise exception 'member row changed'; end if;

    -- Defence in depth: with the grant and a permissive policy back (both
    -- rolled back), the triggers still pin identity for API roles.
    grant update on public.group_members, public.groups to authenticated;
    create policy zzt_tmp_gm_update on public.group_members for update to authenticated using (true);
    execute 'set local role authenticated';
    begin
      update public.group_members set user_id = u3 where id = m2;
      raise exception 'GUARD_MISSED: member guard';
    exception when insufficient_privilege then null;
    end;
    update public.groups set owner_id = u3, currency = 'USD', name = 'ZZT m3 again' where id = gid;
    execute 'reset role';
    select owner_id, currency, name into r from public.groups where id = gid;
    if r.owner_id is distinct from u1 or r.currency <> 'EUR' or r.name <> 'ZZT m3 again' then
      raise exception 'groups guard: % % %', r.owner_id, r.currency, r.name;
    end if;
    revoke update on public.group_members from authenticated;
    drop policy zzt_tmp_gm_update on public.group_members;

    -- The RPC path is unaffected: the owner leaves, ownership moves to u2.
    execute 'set local role authenticated';
    perform public.remove_group_member(m1, true);
    execute 'reset role';
    select owner_id into r from public.groups where id = gid;
    if r.owner_id is distinct from u2 then raise exception 'ownership not transferred by the RPC'; end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: owners can''t rewrite members/ownership; guards pin identity; RPCs still work';
    else update _t set fails = fails + 1; raise notice 'FAIL: group owner lockdown — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 33. M1 (0058): push subscriptions — push-service allowlist, 10 per user, no
--     re-binding another account's endpoint without its keys.
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; n int; i int; ep text; p text; a text; owner uuid; bad text;
begin
  begin
    u1 := pg_temp.zz_user('push1');
    u2 := pg_temp.zz_user('push2');
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    foreach bad in array array['http://fcm.googleapis.com/fcm/send/x', 'https://attacker.invalid/p/1',
                               'https://fcm.googleapis.com.attacker.invalid/x', 'http://169.254.169.254/latest/meta-data'] loop
      begin
        perform public.save_push_subscription(bad, 'k', 'a');
        raise exception 'GUARD_MISSED: accepted %', bad;
      exception when others then
        if sqlerrm not like '%unsupported push endpoint%' then raise; end if;
      end;
    end loop;
    begin
      insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (u1, 'https://x.invalid/', 'k', 'a');
      raise exception 'GUARD_MISSED: direct insert';
    exception when insufficient_privilege then null;
    end;
    for i in 1..11 loop
      perform public.save_push_subscription('https://fcm.googleapis.com/fcm/send/zzt-' || u1 || '-' || i, 'p' || i, 'a' || i);
    end loop;
    perform public.save_push_subscription('https://web.push.apple.com/zzt-' || u1, 'pa', 'aa');
    execute 'reset role';
    select count(*) into n from public.push_subscriptions where user_id = u1;
    if n <> 10 then raise exception 'expected 10 subscriptions, got %', n; end if;

    select endpoint, p256dh, auth into ep, p, a from public.push_subscriptions where user_id = u1 limit 1;
    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.save_push_subscription(ep, 'attacker-key', 'attacker-auth');
    execute 'reset role';
    select user_id into owner from public.push_subscriptions where endpoint = ep;
    if owner is distinct from u1 then raise exception 'endpoint taken over without its keys'; end if;
    execute 'set local role authenticated';
    perform public.save_push_subscription(ep, p, a);   -- same browser after a sign-in switch
    execute 'reset role';
    select user_id into owner from public.push_subscriptions where endpoint = ep;
    if owner is distinct from u2 then raise exception 'key holder could not re-bind the endpoint'; end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: push endpoint allowlist + 10-device cap + no re-binding without keys';
    else update _t set fails = fails + 1; raise notice 'FAIL: push subscriptions — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 34. M2 (0058): joining is rate-limited, and a join/leave loop notifies the
--     group once, not every cycle.
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; gid uuid; mid uuid; tok text := 'zztest_' || md5(random()::text); n int; i int;
begin
  begin
    u1 := pg_temp.zz_user('jl1');
    u2 := pg_temp.zz_user('jl2');
    insert into public.groups (name, owner_id, currency) values ('ZZT join loop', u1, 'EUR') returning id into gid;
    insert into public.group_members (group_id, user_id, display_name, role) values (gid, u1, 'Owner', 'owner');
    insert into public.group_invites (group_id, token, created_by) values (gid, tok, u1);

    insert into public.rate_limits (key, count, window_start) values ('join:' || u2, 10, now());
    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.join_via_link(tok);
      raise exception 'GUARD_MISSED: 11th join allowed';
    exception when others then
      if sqlerrm not like '%Too many groups joined%' then raise; end if;
    end;
    execute 'reset role';
    delete from public.rate_limits where key = 'join:' || u2;

    for i in 1..3 loop
      execute 'set local role authenticated';
      perform public.join_via_link(tok);
      execute 'reset role';
      select id into mid from public.group_members where group_id = gid and user_id = u2;
      execute 'set local role authenticated';
      perform public.remove_group_member(mid, false);   -- loud leave
      execute 'reset role';
    end loop;
    select count(*) into n from public.notifications where user_id = u1 and group_id = gid and type = 'member_joined';
    if n <> 1 then raise exception 'expected 1 join notification over 3 cycles, got %', n; end if;
    select count(*) into n from public.notifications where user_id = u1 and group_id = gid and type = 'member_left';
    if n <> 1 then raise exception 'expected 1 leave notification over 3 cycles, got %', n; end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: join rate limit + join/leave loop notifies once';
    else update _t set fails = fails + 1; raise notice 'FAIL: join/leave throttling — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 35. L7 (0058): a member records settlements only when they're a party; the
--     owner may record any pair (incl. unlinked members).
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; u3 uuid; gid uuid; m1 uuid; m2 uuid; m3 uuid; mp uuid;
begin
  begin
    u1 := pg_temp.zz_user('st1');
    u2 := pg_temp.zz_user('st2');
    u3 := pg_temp.zz_user('st3');
    insert into public.groups (name, owner_id, currency) values ('ZZT settle party', u1, 'EUR') returning id into gid;
    insert into public.group_members (group_id, user_id, display_name, role) values (gid, u1, 'Owner', 'owner') returning id into m1;
    insert into public.group_members (group_id, user_id, display_name) values (gid, u2, 'B') returning id into m2;
    insert into public.group_members (group_id, user_id, display_name) values (gid, u3, 'C') returning id into m3;
    insert into public.group_members (group_id, user_id, display_name) values (gid, null, 'Phantom') returning id into mp;

    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.add_settlement(gid, m3, m1, 100, 'EUR');
      raise exception 'GUARD_MISSED: third-party settlement';
    exception when others then
      if sqlerrm not like '%settlements you are part of%' then raise; end if;
    end;
    perform public.add_settlement(gid, m2, m3, 100, 'EUR');
    perform public.add_settlement(gid, m3, m2, 50, 'EUR');
    execute 'reset role';

    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.add_settlement(gid, m2, m3, 100, 'EUR');
    perform public.add_settlement(gid, mp, m3, 100, 'EUR');
    execute 'reset role';
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: settlements need the caller as a party (or the owner)';
    else update _t set fails = fails + 1; raise notice 'FAIL: settlement party check — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 36. L3 (0058/0058b) + 0052 gap: storage limits, group_images per-verb
--     policies, no anonymous listing; a client-set avatar must be in the
--     caller's own folder of this project's bucket or a Google avatar over
--     https; a group cover must be in the group's own folder.
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; gid uuid; n int; bad text; base text;
begin
  begin
    u1 := pg_temp.zz_user('img1');
    u2 := pg_temp.zz_user('img2');
    select string_agg(id, ', ') into bad from storage.buckets
     where id in ('avatars', 'group-images')
       and (file_size_limit is null or file_size_limit > 5 * 1024 * 1024
            or allowed_mime_types is null or 'text/html' = any(allowed_mime_types)
            or exists (select 1 from unnest(allowed_mime_types) m where m not like 'image/%'));
    if bad is not null then raise exception 'bucket without size/MIME limits: %', bad; end if;
    select count(distinct cmd) into n from pg_policies
     where schemaname = 'storage' and tablename = 'objects' and policyname like 'group\_images\_%';
    if n <> 4 then raise exception 'group_images policies not per-verb (%)', n; end if;
    select string_agg(policyname, ', ') into bad from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and (roles && array['public', 'anon']::name[]);
    if bad is not null then raise exception 'storage policies open to anon/public: %', bad; end if;

    insert into public.groups (name, owner_id, currency) values ('ZZT images', u1, 'EUR') returning id into gid;
    insert into public.group_members (group_id, user_id, display_name, role) values (gid, u1, 'Owner', 'owner');
    insert into public.group_members (group_id, user_id, display_name) values (gid, u2, 'Member');
    insert into storage.objects (bucket_id, name) values ('group-images', gid || '/zzt.png');

    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    execute 'set local role anon';
    select count(*) into n from storage.objects where bucket_id = 'group-images';
    execute 'reset role';
    if n <> 0 then raise exception 'anon can list group-images (% rows)', n; end if;

    -- A member (not the owner) can't write the group's folder.
    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      insert into storage.objects (bucket_id, name) values ('group-images', gid || '/zzt2.png');
      raise exception 'GUARD_MISSED: member wrote the group folder';
    exception when insufficient_privilege then null;
    end;
    execute 'reset role';

    base := public.storage_public_base();
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    foreach bad in array array['https://example.com/x.png',
                               base || 'avatars/' || u2 || '/avatar.png',
                               base || 'avatars/' || u1 || '/../' || u2 || '/avatar.png',
                               'http://lh3.googleusercontent.com/a/zzt',
                               'https://lh3.googleusercontent.com.evil.example/a/zzt',
                               'https://evil.example/lh3.googleusercontent.com/a/zzt',
                               'https://x@lh3.googleusercontent.com/a/zzt'] loop
      begin
        update public.profiles set avatar_url = bad where id = u1;
        raise exception 'GUARD_MISSED: avatar %', bad;
      exception when check_violation then null;
      end;
    end loop;
    update public.profiles set avatar_url = base || 'avatars/' || u1 || '/avatar.png?t=1' where id = u1;
    update public.profiles set avatar_url = 'https://lh3.googleusercontent.com/a/zzt=s96-c' where id = u1;
    update public.profiles set avatar_url = null where id = u1;
    foreach bad in array array['https://example.com/x.png',
                               'https://lh3.googleusercontent.com/a/zzt',
                               base || 'avatars/' || u1 || '/avatar.png'] loop
      begin
        update public.groups set image_url = bad where id = gid;
        raise exception 'GUARD_MISSED: cover %', bad;
      exception when check_violation then null;
      end;
    end loop;
    update public.groups set image_url = base || 'group-images/' || gid || '/cover.png?t=1' where id = gid;
    get diagnostics n = row_count;
    execute 'reset role';
    if n <> 1 then raise exception 'owner could not set an own-storage cover'; end if;
    -- Server-side writers (the signup trigger, the service role) are unaffected.
    update public.profiles set avatar_url = 'https://example.com/legacy.png' where id = u1;
    -- An existing value that no longer qualifies stays valid while other fields change.
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.profiles set display_name = 'ZZT still fine' where id = u1;
    get diagnostics n = row_count;
    execute 'reset role';
    if n <> 1 then raise exception 'unchanged legacy avatar blocked a profile edit'; end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: storage limits + group_images policies + own-storage image URLs';
    else update _t set fails = fails + 1; raise notice 'FAIL: storage / image URLs — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 37. L6 (0058): name limits, signup trims long provider names, and the
--     send-invite quotas (10/h per sender, 3/day per recipient).
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; gid uuid; n int; nm text; i int; ok boolean;
begin
  begin
    u1 := pg_temp.zz_user('nm');
    insert into public.groups (name, owner_id, currency) values ('ZZT names', u1, 'EUR') returning id into gid;
    begin
      update public.profiles set display_name = repeat('x', 61) where id = u1;
      raise exception 'GUARD_MISSED: 61-char display name';
    exception when check_violation then null;
    end;
    begin
      update public.profiles set display_name = 'Your account' || chr(10) || 'is locked' where id = u1;
      raise exception 'GUARD_MISSED: newline in display name';
    exception when check_violation then null;
    end;
    begin
      update public.groups set name = repeat('g', 61) where id = gid;
      raise exception 'GUARD_MISSED: 61-char group name';
    exception when check_violation then null;
    end;
    update public.profiles set display_name = repeat('x', 60) where id = u1;

    insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
            'zzt-longname-' || md5(random()::text) || '@example.com',
            jsonb_build_object('full_name', repeat('y', 80)), now(), now())
    returning id into u2;
    select display_name into nm from public.profiles where id = u2;
    if char_length(nm) <> 60 then raise exception 'signup name not trimmed: %', char_length(nm); end if;

    -- The per-address quota is server-only since 0078 (test 67): called here
    -- the way send-invite's service-role client does, with no signed-in user.
    for i in 1..3 loop
      if not public.consume_invite_recipient_quota('ZZT-Friend@Example.com') then raise exception 'recipient quota % refused', i; end if;
    end loop;
    ok := public.consume_invite_recipient_quota(' zzt-friend@example.com ');
    if ok then raise exception 'recipient quota not capped at 3/day'; end if;
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    for i in 1..10 loop
      if not public.consume_quota('send-invite') then raise exception 'send-invite quota % refused', i; end if;
    end loop;
    ok := public.consume_quota('send-invite');
    if ok then raise exception 'send-invite quota not capped at 10/h'; end if;
    execute 'reset role';
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: name limits + signup trim + invite email quotas';
    else update _t set fails = fails + 1; raise notice 'FAIL: names / invite quotas — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 38. Zero-decimal currencies (0058): budget alerts and the weekly digest
--     convert with the minor-unit factor. ¥13,000 at 0.0062 is €80.60 — 80.6%
--     of a €100 budget (it used to count as €0.81) — and outranks a €10
--     category in the digest.
-- ---------------------------------------------------------------------------
do $$
declare u uuid; yen uuid; eur uuid; n int; body text;
begin
  begin
    if public.to_base_minor(1800, 0.0062, 'JPY', 'EUR') <> 1116 then raise exception 'JPY->EUR'; end if;
    if public.to_base_minor(1000, 160, 'EUR', 'JPY') <> 1600 then raise exception 'EUR->JPY'; end if;
    if public.to_base_minor(1234, 1, 'EUR', 'EUR') <> 1234 then raise exception 'EUR->EUR'; end if;
    u := pg_temp.zz_user('yen');
    update public.profiles set base_currency = 'EUR', notify_digest = true where id = u;
    insert into public.categories (user_id, name, kind) values (u, 'ZZT yen cat', 'expense') returning id into yen;
    insert into public.categories (user_id, name, kind) values (u, 'ZZT euro cat', 'expense') returning id into eur;
    insert into public.budgets (user_id, category_id, amount_enc, currency, period_start)
      values (u, yen, public.enc_minor(10000), 'EUR', date_trunc('month', current_date)::date);

    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.save_transactions(jsonb_build_array(
      jsonb_build_object('kind', 'expense', 'category_id', yen, 'amount_minor', 13000, 'currency', 'JPY',
                         'exchange_rate', 0.0062, 'spent_at', current_date),
      jsonb_build_object('kind', 'expense', 'category_id', eur, 'amount_minor', 1000, 'currency', 'EUR',
                         'exchange_rate', 1, 'spent_at', current_date)));
    execute 'reset role';
    select count(*) into n from public.notifications where user_id = u and type = 'budget' and title = 'Budget almost used';
    if n <> 1 then raise exception '¥ spend at 80.6%% of budget: % warnings', n; end if;
    select count(*) into n from public.notifications where user_id = u and type = 'budget' and title = 'Budget exceeded';
    if n <> 0 then raise exception '¥ spend reported as over budget'; end if;

    perform public.send_weekly_digests();
    select string_agg(n2.body, ' | ') into body from public.notifications n2 where n2.user_id = u and n2.type = 'digest';
    if body is null or body not like '%top category: ZZT yen cat%' then raise exception 'digest top category: %', body; end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: zero-decimal (¥) spend converts correctly in budget alerts + digest';
    else update _t set fails = fails + 1; raise notice 'FAIL: zero-decimal conversion — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 39. Grants, dead RPCs, indexes and policy hygiene (0058: F9–F11), plus
--     profile columns that have no client grant.
-- ---------------------------------------------------------------------------
do $$
declare u uuid; bad text; n int;
begin
  begin
    select string_agg(c.relname, ', ') into bad from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm', 'p')
       and (has_table_privilege('anon', c.oid, 'SELECT') or has_table_privilege('anon', c.oid, 'INSERT')
            or has_table_privilege('anon', c.oid, 'UPDATE') or has_table_privilege('anon', c.oid, 'DELETE')
            or has_table_privilege('anon', c.oid, 'TRUNCATE'));
    if bad is not null then raise exception 'anon has table privileges on: %', bad; end if;
    select string_agg(c.relname, ', ') into bad from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
       and (has_table_privilege('authenticated', c.oid, 'TRUNCATE')
            or has_table_privilege('authenticated', c.oid, 'TRIGGER')
            or has_table_privilege('authenticated', c.oid, 'REFERENCES'));
    if bad is not null then raise exception 'authenticated has TRUNCATE/TRIGGER/REFERENCES on: %', bad; end if;
    if has_table_privilege('authenticated', 'public.rate_limits', 'SELECT')
       or has_table_privilege('authenticated', 'public.push_subscriptions', 'INSERT')
       or has_table_privilege('authenticated', 'public.push_subscriptions', 'UPDATE') then
      raise exception 'rate_limits / push_subscriptions writable by clients';
    end if;

    if to_regprocedure('public.shares_group(uuid)') is not null
       or to_regprocedure('public.create_group_expense(uuid,text,bigint,character,uuid,date,uuid[])') is not null
       or to_regprocedure('public.update_group_expense(uuid,text,bigint,character,uuid,date,uuid[])') is not null then
      raise exception 'dead RPCs still present';
    end if;
    if has_function_privilege('authenticated', 'public.member_name_for(uuid)', 'execute')
       or has_function_privilege('anon', 'public.member_name_for(uuid)', 'execute') then
      raise exception 'member_name_for callable by clients';
    end if;

    -- Every FK in public has an index leading with its columns.
    select string_agg(c.conrelid::regclass || '.' || c.conname, ', ') into bad
      from pg_constraint c
     where c.contype = 'f' and c.connamespace = 'public'::regnamespace
       and not exists (
         select 1 from pg_index i
          where i.indrelid = c.conrelid
            and (select array_agg(k order by o) from unnest(i.indkey::int2[]) with ordinality x(k, o)
                  where o <= array_length(c.conkey, 1)) = c.conkey::int2[]);
    if bad is not null then raise exception 'unindexed foreign keys: %', bad; end if;
    if to_regclass('public.categories_user_idx') is not null or to_regclass('public.expense_splits_expense_idx') is not null then
      raise exception 'redundant indexes still present';
    end if;
    -- auth.uid() in a policy is wrapped in a scalar subquery (once per statement).
    select string_agg(tablename || '.' || policyname, ', ') into bad from pg_policies
     where schemaname = 'public'
       and replace(coalesce(qual, '') || coalesce(with_check, ''), '( SELECT auth.uid() AS uid)', '') like '%auth.uid()%';
    if bad is not null then raise exception 'policies re-evaluating auth.uid() per row: %', bad; end if;

    -- Profile columns without a client grant can't be changed.
    u := pg_temp.zz_user('cols');
    if has_column_privilege('authenticated', 'public.profiles', 'id', 'UPDATE')
       or has_column_privilege('authenticated', 'public.profiles', 'created_at', 'UPDATE')
       or has_column_privilege('authenticated', 'public.profiles', 'updated_at', 'UPDATE') then
      raise exception 'profile identity columns granted';
    end if;
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      update public.profiles set created_at = now() - interval '1 year' where id = u;
      raise exception 'GUARD_MISSED: created_at updatable';
    exception when insufficient_privilege then null;
    end;
    begin
      update public.profiles set id = gen_random_uuid() where id = u;
      raise exception 'GUARD_MISSED: id updatable';
    exception when insufficient_privilege then null;
    end;
    execute 'reset role';
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: grants, dead RPCs, FK indexes, per-statement auth.uid(), profile column grants';
    else update _t set fails = fails + 1; raise notice 'FAIL: grants / hygiene — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 40. Comment notifications (0050) never quote the encrypted comment text.
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; gid uuid; m1 uuid; m2 uuid; eid uuid; n int;
begin
  begin
    u1 := pg_temp.zz_user('cm1');
    u2 := pg_temp.zz_user('cm2');
    insert into public.groups (name, owner_id, currency) values ('ZZT comments', u1, 'EUR') returning id into gid;
    insert into public.group_members (group_id, user_id, display_name, role) values (gid, u1, 'Owner', 'owner') returning id into m1;
    insert into public.group_members (group_id, user_id, display_name) values (gid, u2, 'Member') returning id into m2;
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    eid := public.create_group_expense_v2(gid, 'ZZ expense', 1000, 'EUR', m1, current_date, array[m1, m2], null, 'equal');
    execute 'reset role';
    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.add_group_comment(gid, 'expense', eid, m2, 'ZZ very secret comment text');
    execute 'reset role';
    select count(*) into n from public.notifications where user_id = u1 and group_id = gid and type = 'comment';
    if n <> 1 then raise exception 'comment notification missing (%)', n; end if;
    select count(*) into n from public.notifications
     where group_id = gid and (title || coalesce(body, '')) like '%secret comment%';
    if n <> 0 then raise exception 'notification quotes the comment text'; end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: comment notifications carry no comment text';
    else update _t set fails = fails + 1; raise notice 'FAIL: comment notification plaintext — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 41. F14 (0058): stale rate_limits rows are purged nightly; live ones stay.
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  begin
    insert into public.rate_limits (key, count, window_start) values
      ('zzt-stale-' || md5(random()::text), 1, now() - interval '3 days'),
      ('zzt-fresh', 1, now());
    perform public.purge_stale_rate_limits();
    select count(*) into n from public.rate_limits where key like 'zzt-stale-%';
    if n <> 0 then raise exception 'stale row kept'; end if;
    select count(*) into n from public.rate_limits where key = 'zzt-fresh';
    if n <> 1 then raise exception 'fresh row purged'; end if;
    select count(*) into n from cron.job where jobname = 'purge-rate-limits' and active;
    if n <> 1 then raise exception 'purge job not scheduled'; end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: rate_limits retention';
    else update _t set fails = fails + 1; raise notice 'FAIL: rate_limits retention — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 42. 0058c: a foreign-currency transaction needs a positive rate (a missing
--     one used to default to 1, storing ¥1,800 as €1,800); base-currency rows
--     still default to 1; ISK is zero-decimal, HUF/IDR are not.
-- ---------------------------------------------------------------------------
do $$
declare u uuid; tid uuid; r record; bad jsonb; n int;
begin
  begin
    if public.minor_factor('ISK') <> 1 or public.minor_factor('JPY') <> 1
       or public.minor_factor('HUF') <> 100 or public.minor_factor('IDR') <> 100 then
      raise exception 'minor_factor zero-decimal set wrong';
    end if;
    u := pg_temp.zz_user('fx');
    update public.profiles set base_currency = 'EUR' where id = u;
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    foreach bad in array array[
      '{"amount_minor": 1800, "currency": "JPY"}'::jsonb,
      '{"amount_minor": 1800, "currency": "JPY", "exchange_rate": 0}'::jsonb,
      '{"amount_minor": 1800, "currency": "JPY", "exchange_rate": -0.0062}'::jsonb,
      '{"amount_minor": 100, "currency": "EUR", "exchange_rate": 0}'::jsonb] loop
      begin
        perform public.save_transactions(jsonb_build_array(bad));
        raise exception 'GUARD_MISSED: saved %', bad;
      exception when others then
        if sqlerrm not like '%needs a positive exchange rate%' then raise; end if;
      end;
    end loop;
    n := public.save_transactions(jsonb_build_array(
      jsonb_build_object('amount_minor', 1800, 'currency', 'JPY', 'exchange_rate', 0.0062),
      jsonb_build_object('amount_minor', 500, 'currency', 'EUR')));
    if n <> 2 then raise exception 'valid rows not saved (%)', n; end if;
    select * into r from public.my_transactions() t where t.currency = 'EUR' limit 1;
    if r.exchange_rate <> 1 then raise exception 'base-currency row rate = %', r.exchange_rate; end if;
    tid := r.id;
    begin
      perform public.update_transaction(tid, '{"currency": "USD"}'::jsonb);
      raise exception 'GUARD_MISSED: currency change without a rate';
    exception when others then
      if sqlerrm not like '%needs a positive exchange rate%' then raise; end if;
    end;
    begin
      perform public.update_transaction(tid, '{"exchange_rate": 0}'::jsonb);
      raise exception 'GUARD_MISSED: zero rate on update';
    exception when others then
      if sqlerrm not like '%needs a positive exchange rate%' then raise; end if;
    end;
    perform public.update_transaction(tid, '{"currency": "USD", "exchange_rate": 0.92}'::jsonb);
    perform public.update_transaction(tid, '{"description": "ZZ edit keeps the rate"}'::jsonb);
    select * into r from public.my_transactions() t where t.id = tid;
    if r.currency <> 'USD' or r.exchange_rate <> 0.92 then
      raise exception 'update result % @ %', r.currency, r.exchange_rate;
    end if;
    execute 'reset role';
    -- A JPY-based user may omit the rate for JPY. A second account: this one
    -- has entries now, so its base currency is fixed (0078).
    u := pg_temp.zz_user('fx-jpy');
    update public.profiles set base_currency = 'JPY' where id = u;
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    n := public.save_transactions('[{"amount_minor": 1800, "currency": "JPY"}]'::jsonb);
    execute 'reset role';
    if n <> 1 then raise exception 'base-currency JPY row refused'; end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: foreign-currency rows need a positive rate; ISK zero-decimal';
    else update _t set fails = fails + 1; raise notice 'FAIL: exchange rate required — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- B-0059. Budget period keys (0059): a key saved a day early east of UTC
--     (last day of the previous month) is repaired to the right month, merging
--     with an existing row for that month (newest created wins); new writes,
--     including save_budget from an API caller, are normalised to the 1st.
-- ---------------------------------------------------------------------------
do $$
declare u uuid; c1 uuid; c2 uuid; c3 uuid; keep_id uuid; drop_id uuid; untouched uuid;
        n int; d date; ids uuid[];
begin
  begin
    u := pg_temp.zz_user('bperiod');
    insert into public.categories (user_id, name, kind) values (u, 'ZZT b1', 'expense') returning id into c1;
    insert into public.categories (user_id, name, kind) values (u, 'ZZT b2', 'expense') returning id into c2;
    insert into public.categories (user_id, name, kind) values (u, 'ZZT b3', 'expense') returning id into c3;

    -- The key function itself.
    if public.budget_period_key('2026-08-31') <> '2026-09-01'
       or public.budget_period_key('2026-02-28') <> '2026-03-01'
       or public.budget_period_key('2028-02-29') <> '2028-03-01'
       or public.budget_period_key('2026-12-31') <> '2027-01-01'
       or public.budget_period_key('2026-09-01') <> '2026-09-01'
       or public.budget_period_key('2026-06-15') <> '2026-06-01' then
      raise exception 'budget_period_key maps a date wrongly';
    end if;

    -- Legacy rows as the buggy client wrote them (bypass the new guards; this
    -- whole block is rolled back).
    alter table public.budgets disable trigger budgets_normalise_period;
    alter table public.budgets drop constraint budgets_period_is_month_start;
    -- c1: mis-keyed Sept row (newer) + a correct Sept row (older) → merge.
    insert into public.budgets (user_id, category_id, currency, period_start, amount_enc, created_at)
      values (u, c1, 'EUR', '2026-09-01', public.enc_minor(100), now() - interval '2 days') returning id into drop_id;
    insert into public.budgets (user_id, category_id, currency, period_start, amount_enc, created_at)
      values (u, c1, 'EUR', '2026-08-31', public.enc_minor(200), now() - interval '1 hour') returning id into keep_id;
    -- c2: lone mis-keyed March row and a mid-month June row.
    insert into public.budgets (user_id, category_id, currency, period_start, amount_enc)
      values (u, c2, 'EUR', '2026-02-28', public.enc_minor(300));
    insert into public.budgets (user_id, category_id, currency, period_start, amount_enc)
      values (u, c2, 'EUR', '2026-06-15', public.enc_minor(400));
    -- c3: already correct → untouched.
    insert into public.budgets (user_id, category_id, currency, period_start, amount_enc)
      values (u, c3, 'EUR', '2026-09-01', public.enc_minor(500)) returning id into untouched;

    perform public.repair_budget_periods();
    alter table public.budgets enable trigger budgets_normalise_period;

    select array_agg(id) into ids from public.budgets where user_id = u and category_id = c1;
    if ids is distinct from array[keep_id] then raise exception 'c1 not merged to the newest row: %', ids; end if;
    select period_start into d from public.budgets where id = keep_id;
    if d <> '2026-09-01' then raise exception 'c1 moved to % not 2026-09-01', d; end if;
    if public.dec_minor((select amount_enc from public.budgets where id = keep_id)) <> 200 then
      raise exception 'c1 kept the wrong amount';
    end if;
    select count(*) into n from public.budgets
      where user_id = u and category_id = c2 and period_start in ('2026-03-01', '2026-06-01');
    if n <> 2 then raise exception 'c2 rows not moved to their month starts'; end if;
    select period_start into d from public.budgets where id = untouched;
    if d <> '2026-09-01' then raise exception 'a correct row was changed'; end if;
    select count(*) into n from public.budgets where user_id = u and extract(day from period_start) <> 1;
    if n <> 0 then raise exception '% rows still off the 1st', n; end if;

    -- New writes: an API caller on an old cached client sends the bad key.
    alter table public.budgets add constraint budgets_period_is_month_start check (extract(day from period_start) = 1);
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.save_budget(c3, 900, 'EUR', '2026-09-30');   -- = October, a day early
    execute 'reset role';
    select count(*) into n from public.budgets where user_id = u and category_id = c3 and period_start = '2026-10-01';
    if n <> 1 then raise exception 'save_budget did not normalise to 2026-10-01'; end if;
    update public.budgets set period_start = '2026-11-17' where id = untouched;
    select period_start into d from public.budgets where id = untouched;
    if d <> '2026-11-01' then raise exception 'update not normalised (%)', d; end if;

    -- The maintenance function is not an API.
    if has_function_privilege('authenticated', 'public.repair_budget_periods()', 'execute')
       or has_function_privilege('anon', 'public.repair_budget_periods()', 'execute') then
      raise exception 'repair_budget_periods is callable by an API role';
    end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: budget period keys repaired, merged and normalised';
    else update _t set fails = fails + 1; raise notice 'FAIL: budget period keys — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 43. 0060: category management. Server-authoritative ownership (an insert is
--     stamped with the caller, an update can't move or re-kind a row), the
--     name/icon/colour rules the client mirrors, and delete_category moving a
--     category's entries to another of the same kind.
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; c1 uuid; c2 uuid; cinc uuid; cother uuid; owner uuid; n int; nm text;
        rid uuid;
begin
  begin
    u1 := pg_temp.zz_user('cat1');
    u2 := pg_temp.zz_user('cat2');
    insert into public.categories (user_id, name, kind) values (u2, 'ZZ theirs', 'expense') returning id into cother;
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    -- A client can't create a row for someone else: the guard stamps the caller.
    insert into public.categories (user_id, name, kind, icon, color)
      values (u2, '  ZZ Travel  ', 'expense', 'travel', 'teal') returning id, user_id, name into c1, owner, nm;
    if owner <> u1 then raise exception 'insert kept a foreign user_id'; end if;
    if nm <> 'ZZ Travel' then raise exception 'name not trimmed (%)', nm; end if;
    insert into public.categories (name, kind) values ('ZZ Trips', 'expense') returning id into c2;
    insert into public.categories (name, kind) values ('ZZ Refunds', 'income') returning id into cinc;
    begin
      insert into public.categories (name, kind) values (repeat('x', 61), 'expense');
      raise exception 'GUARD_MISSED: 61-char name';
    exception when check_violation then null; end;
    begin
      insert into public.categories (name, kind) values (E'ZZ bad\nname', 'expense');
      raise exception 'GUARD_MISSED: control character';
    exception when check_violation then null; end;
    begin
      insert into public.categories (name, kind) values ('   ', 'expense');
      raise exception 'GUARD_MISSED: blank name';
    exception when check_violation then null; end;
    begin
      update public.categories set icon = 'rocket' where id = c1;
      raise exception 'GUARD_MISSED: unknown icon';
    exception when check_violation then null; end;
    update public.categories set icon = 'fuel' where id = c2;   -- 0066's new key is accepted
    update public.categories set icon = 'gifts-received' where id = c2;   -- and 0071's
    begin
      update public.categories set color = '#ff0000' where id = c1;
      raise exception 'GUARD_MISSED: free-form colour';
    exception when check_violation then null; end;
    begin
      update public.categories set kind = 'income' where id = c1;
      raise exception 'GUARD_MISSED: kind flipped';
    exception when others then if sqlerrm not like '%can''t change%' then raise; end if; end;
    begin
      update public.categories set user_id = u2 where id = c1;
      raise exception 'GUARD_MISSED: moved to another account';
    exception when others then if sqlerrm like 'GUARD_MISSED%' then raise; end if; end;
    update public.categories set name = 'ZZ Travel & trips', icon = 'gifts', color = 'pink', is_archived = true where id = c1;
    -- Another user's category: invisible, so not renameable or deletable.
    update public.categories set name = 'ZZ hijack' where id = cother;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'renamed another user''s category'; end if;

    -- delete_category: entries, recurring rules and auto-rules move first.
    perform public.save_transactions(jsonb_build_array(
      jsonb_build_object('amount_minor', 100, 'currency', 'EUR', 'category_id', c1),
      jsonb_build_object('amount_minor', 200, 'currency', 'EUR', 'category_id', c1)));
    rid := public.save_recurring_rule(null, jsonb_build_object('amount_minor', 300, 'currency', 'EUR',
             'category_id', c1, 'next_run', current_date + 30));
    insert into public.category_rules (user_id, pattern, category_id) values (u1, 'zzmerchant', c1);
    begin
      perform public.delete_category(c1, cinc);
      raise exception 'GUARD_MISSED: moved into an income category';
    exception when others then if sqlerrm not like '%not found%' then raise; end if; end;
    begin
      perform public.delete_category(c1, cother);
      raise exception 'GUARD_MISSED: moved into another user''s category';
    exception when others then if sqlerrm not like '%not found%' then raise; end if; end;
    begin
      perform public.delete_category(cother, null);
      raise exception 'GUARD_MISSED: deleted another user''s category';
    exception when others then if sqlerrm not like '%not found%' then raise; end if; end;
    n := public.delete_category(c1, c2);
    if n <> 2 then raise exception 'moved % entries, expected 2', n; end if;
    select count(*) into n from public.my_transactions() where category_id = c2;
    if n <> 2 then raise exception 'entries not in the target (%)', n; end if;
    select count(*) into n from public.recurring_rules where id = rid and category_id = c2;
    if n <> 1 then raise exception 'recurring rule not moved'; end if;
    select count(*) into n from public.category_rules where pattern = 'zzmerchant' and category_id = c2;
    if n <> 1 then raise exception 'auto-category rule not moved'; end if;
    select count(*) into n from public.categories where id = c1;
    if n <> 0 then raise exception 'category not deleted'; end if;
    -- Without a target the entries become uncategorised (never deleted).
    perform public.delete_category(c2, null);
    select count(*) into n from public.my_transactions() where category_id is null and amount_minor in (100, 200);
    if n <> 2 then raise exception 'entries lost with the category (%)', n; end if;
    execute 'reset role';
    select count(*) into n from public.categories where id = cother;
    if n <> 1 then raise exception 'other user''s category gone'; end if;
    if has_function_privilege('anon', 'public.delete_category(uuid, uuid)', 'execute')
       or has_function_privilege('authenticated', 'public.categories_guard()', 'execute') then
      raise exception 'category functions over-granted';
    end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: category management (guard, rules, delete with move)';
    else update _t set fails = fails + 1; raise notice 'FAIL: category management — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 44. 0061: budgets roll forward month by month, an edit/delete in a carried
--     month materialises that month's own rows, a deleted cap stays deleted,
--     "copy last month" copies the effective caps, and the alert trigger uses
--     the same rollover rule.
-- ---------------------------------------------------------------------------
do $$
declare u uuid; food uuid; fun uuid; n int; per date; amt bigint;
        m0 date := date_trunc('month', current_date)::date;
        m1 date := (date_trunc('month', current_date) - interval '1 month')::date;
        m2 date := (date_trunc('month', current_date) - interval '2 month')::date;
begin
  begin
    u := pg_temp.zz_user('roll');
    insert into public.categories (user_id, name, kind) values (u, 'ZZ Food', 'expense') returning id into food;
    insert into public.categories (user_id, name, kind) values (u, 'ZZ Fun', 'expense') returning id into fun;
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.save_budget(food, 40000, 'EUR', m2);
    perform public.save_budget(fun, 10000, 'EUR', m2);

    -- Two months later, with no rows of its own: m2's caps, labelled as m2's.
    select count(*), min(period_start) into n, per from public.my_budgets(m0);
    if n <> 2 or per <> m2 then raise exception 'rollover: % rows from %', n, per; end if;

    -- Editing one cap in the carried month gives it its own rows (both caps).
    perform public.edit_budget(food, 45000, 'EUR', m0);
    select count(*) into n from public.my_budgets(m0) where period_start = m0;
    if n <> 2 then raise exception 'edit did not materialise the month (% own rows)', n; end if;
    select amount_minor into amt from public.my_budgets(m0) where category_id = food;
    if amt <> 45000 then raise exception 'edited cap = %', amt; end if;
    select amount_minor into amt from public.my_budgets(m1) where category_id = food;
    if amt <> 40000 then raise exception 'edit leaked into last month (%)', amt; end if;

    -- Deleting both caps leaves the month empty — it doesn't fall back to m2.
    perform public.delete_budget(food, m0);
    perform public.delete_budget(fun, m0);
    select count(*) into n from public.my_budgets(m0);
    if n <> 0 then raise exception 'deleted caps came back (%)', n; end if;
    select count(*) into n from public.my_budgets(m1);
    if n <> 2 then raise exception 'deleting this month touched last month'; end if;

    -- Copy last month's budgets restores m1's effective (carried) caps.
    n := public.copy_previous_budgets(m0);
    if n <> 2 then raise exception 'copied % caps', n; end if;
    select count(*) into n from public.my_budgets(m0) where period_start = m0;
    if n <> 2 then raise exception 'copy did not create own rows'; end if;
    begin
      perform public.copy_previous_budgets(m2);
      raise exception 'GUARD_MISSED: copied from an empty month';
    exception when others then if sqlerrm not like '%no budgets to copy%' then raise; end if; end;

    -- Alerts use the rollover rule: m1 has no rows, so Fun's m2 cap (€100)
    -- applies to an m1 expense of €120.
    perform public.save_transactions(jsonb_build_array(jsonb_build_object(
      'amount_minor', 12000, 'currency', 'EUR', 'category_id', fun, 'spent_at', m1 + 3)));
    execute 'reset role';
    select count(*) into n from public.notifications
     where user_id = u and type = 'budget' and title = 'Budget exceeded' and body like 'ZZ Fun%';
    if n <> 1 then raise exception 'carried cap did not alert (%)', n; end if;
    -- A removed cap never alerts.
    update public.budgets set removed = true where user_id = u and category_id = food and period_start = m0;
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.save_transactions(jsonb_build_array(jsonb_build_object(
      'amount_minor', 99900, 'currency', 'EUR', 'category_id', food, 'spent_at', m0)));
    execute 'reset role';
    select count(*) into n from public.notifications where user_id = u and body like 'ZZ Food%';
    if n <> 0 then raise exception 'removed cap alerted'; end if;

    if has_function_privilege('authenticated', 'public.budget_source_period(uuid, date)', 'execute')
       or has_function_privilege('authenticated', 'public.materialise_budgets(uuid, date)', 'execute')
       or has_function_privilege('anon', 'public.edit_budget(uuid, bigint, text, date)', 'execute')
       or has_function_privilege('anon', 'public.delete_budget(uuid, date)', 'execute')
       or has_function_privilege('anon', 'public.copy_previous_budgets(date)', 'execute') then
      raise exception 'budget functions over-granted';
    end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: budgets roll forward (+edit/delete/copy, alerts use rollover)';
    else update _t set fails = fails + 1; raise notice 'FAIL: budget rollover — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 45. 0062/0064: a GBP expense in a EUR group. The split is in the group currency
--     (the same exact rounding as the client's toBaseMinor: £42.50 @ 1.1699 =
--     €49.72; ¥275 @ 0.0062 = €1.705 → €1.71, where float maths said €1.70),
--     balances
--     credit the payer with the group amount and net to zero, the audit
--     summary names the conversion, and each member's mirrored share is in
--     the group currency at the ECB rate to THEIR base currency (pending,
--     never 1, when the cache has no rate).
-- ---------------------------------------------------------------------------
do $$
declare ua uuid; ub uuid; uc uuid; gid uuid; ma uuid; mb uuid; mc uuid; eid uuid; n bigint;
        r record; d date := date '2001-02-05'; summ text; led jsonb;
begin
  begin
    -- JS↔SQL lockstep vectors (test/currency.test.js uses the same ones).
    if public.to_base_minor(4250, 1.1699, 'GBP', 'EUR') <> 4972
       or public.to_base_minor(275, 0.0062, 'JPY', 'EUR') <> 171
       or public.to_base_minor(50, 1.15, 'USD', 'EUR') <> 58
       or public.to_base_minor(1800, 0.0062, 'JPY', 'EUR') <> 1116
       or public.to_base_minor(1005, 1.005, 'USD', 'EUR') <> 1010
       or public.to_base_minor(12345, 0.85725, 'EUR', 'GBP') <> 10583
       or public.to_base_minor(10000, 162.35, 'EUR', 'JPY') <> 16235 then
      raise exception 'to_base_minor lockstep vectors differ';
    end if;
    if public.to_base_minor(500, null, 'GBP', 'EUR') is not null
       or public.to_base_minor(500, null, 'EUR', 'EUR') <> 500 then
      raise exception 'pending rate handling wrong';
    end if;

    -- Cached ECB rates for the expense day (a Monday: the Friday before).
    insert into public.fx_rates (rate_date, currency, per_eur) values
      (date '2001-02-02', 'EUR', 1), (date '2001-02-02', 'GBP', 0.6), (date '2001-02-02', 'USD', 0.9)
    on conflict (rate_date, currency) do update set per_eur = excluded.per_eur;
    delete from public.fx_rates where rate_date between date '2001-01-20' and date '2001-02-05' and currency = 'CHF';

    ua := pg_temp.zz_user('gfa'); ub := pg_temp.zz_user('gfb'); uc := pg_temp.zz_user('gfc');
    update public.profiles set base_currency = 'EUR', display_name = 'ZZ Ann' where id = ua;
    update public.profiles set base_currency = 'USD' where id = ub;
    update public.profiles set base_currency = 'CHF' where id = uc;
    insert into public.groups (name, owner_id, currency) values ('ZZT trip', ua, 'EUR') returning id into gid;
    insert into public.group_members (group_id, user_id, display_name, role) values (gid, ua, 'A', 'owner') returning id into ma;
    insert into public.group_members (group_id, user_id, display_name) values (gid, ub, 'B') returning id into mb;
    insert into public.group_members (group_id, user_id, display_name) values (gid, uc, 'C') returning id into mc;

    perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.create_group_expense_v2(gid, 'ZZ no rate', 4250, 'GBP', ma, d, array[ma, mb, mc], null, 'equal');
      raise exception 'GUARD_MISSED: foreign expense without a rate';
    exception when others then if sqlerrm not like '%needs a positive exchange rate%' then raise; end if; end;
    begin
      perform public.create_group_expense_v2(gid, 'ZZ bad split', 4250, 'GBP', ma, d, array[ma, mb],
                                             array[2125, 2125]::bigint[], 'exact', 1.1699);
      raise exception 'GUARD_MISSED: shares in the expense currency accepted';
    exception when others then if sqlerrm not like '%add up to the total%' then raise; end if; end;
    eid := public.create_group_expense_v2(gid, 'ZZ dinner', 4250, 'GBP', ma, d, array[ma, mb, mc],
                                          null, 'equal', 1.1699);
    select coalesce(sum(net_minor), 0) into n from public.group_balances(gid);
    execute 'reset role';
    if n <> 0 then raise exception 'balances don''t net to zero (%)', n; end if;
    select count(*) into n from public.expense_splits where expense_id = eid;
    if n <> 3 then raise exception 'splits missing'; end if;
    select sum(public.dec_minor(share_enc)) into n from public.expense_splits where expense_id = eid;
    if n <> 4972 then raise exception 'splits sum to %, expected the group amount 4972', n; end if;
    select net_minor into n from public._group_net(gid) where member_id = ma;
    if n <> 4972 - 1658 then raise exception 'payer net %', n; end if;

    -- The ledger shows both amounts; the audit log names the conversion.
    perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    led := public.group_ledger(gid) -> 'expenses' -> 0;
    select summary into summ from public.group_audit_entries(gid) where action = 'expense_added' limit 1;
    execute 'reset role';
    if (led ->> 'amount_minor')::bigint <> 4250 or led ->> 'currency' <> 'GBP'
       or (led ->> 'group_amount_minor')::bigint <> 4972 or (led ->> 'exchange_rate')::numeric <> 1.1699 then
      raise exception 'ledger row %', led;
    end if;
    if summ not like '%“ZZ dinner” · 49.72 EUR at 1.1699' then raise exception 'audit summary: %', summ; end if;

    -- Mirrors: group currency; the rate is to each member's base currency.
    select currency, exchange_rate into r from public.transactions where user_id = ua and group_expense_id = eid;
    if r.currency <> 'EUR' or r.exchange_rate <> 1 then raise exception 'EUR member mirror % @ %', r.currency, r.exchange_rate; end if;
    select currency, exchange_rate into r from public.transactions where user_id = ub and group_expense_id = eid;
    if r.currency <> 'EUR' or r.exchange_rate <> 0.9 then raise exception 'USD member mirror % @ %', r.currency, r.exchange_rate; end if;
    select currency, exchange_rate into r from public.transactions where user_id = uc and group_expense_id = eid;
    if r.currency <> 'EUR' or r.exchange_rate is not null then
      raise exception 'CHF member mirror should be pending, got % @ %', r.currency, r.exchange_rate;
    end if;
    -- Once the cache has the rate, the pending share is rated.
    insert into public.fx_rates (rate_date, currency, per_eur) values (date '2001-02-02', 'CHF', 1.5);
    perform public.fx_apply_pending();
    select exchange_rate into r from public.transactions where user_id = uc and group_expense_id = eid;
    if r.exchange_rate <> 1.5 then raise exception 'pending share not rated (%)', r.exchange_rate; end if;

    -- A share the cache can't cover queues a fetch at once (0064: after the
    -- pending row exists). Nothing may be in flight for this to be observable.
    update public.fx_fetches set ingested_at = coalesce(ingested_at, now());
    delete from public.fx_rates where rate_date between date '2002-06-01' and date '2002-06-12';
    select count(*) into n from public.fx_fetches;
    perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.create_group_expense_v2(gid, 'ZZ old', 1000, 'EUR', ma, date '2002-06-12', array[ma, mb], null, 'equal');
    execute 'reset role';
    if (select count(*) from public.fx_fetches) <> n + 1 then raise exception 'no ECB fetch queued for a pending share'; end if;

    -- Editing the date re-rates the mirrors; the currency stays the group's.
    insert into public.fx_rates (rate_date, currency, per_eur) values
      (date '2001-03-01', 'EUR', 1), (date '2001-03-01', 'USD', 0.95)
    on conflict (rate_date, currency) do update set per_eur = excluded.per_eur;
    perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.update_group_expense_v2(eid, 'ZZ dinner', 1800, 'JPY', ma, date '2001-03-01',
                                           array[ma, mb], array[600, 516]::bigint[], 'exact', 0.0062);
    execute 'reset role';
    select currency, exchange_rate into r from public.transactions where user_id = ub and group_expense_id = eid;
    if r.currency <> 'EUR' or r.exchange_rate <> 0.95 then raise exception 'edited mirror % @ %', r.currency, r.exchange_rate; end if;
    select count(*) into n from public.transactions where user_id = uc and group_expense_id = eid;
    if n <> 0 then raise exception 'dropped member kept a mirror'; end if;

    -- The cache and its plumbing aren't client-facing.
    if has_table_privilege('authenticated', 'public.fx_rates', 'SELECT')
       or has_table_privilege('authenticated', 'public.fx_rates', 'INSERT')
       or has_table_privilege('authenticated', 'public.fx_fetches', 'SELECT')
       or has_function_privilege('authenticated', 'public.fx_sync()', 'execute')
       or has_function_privilege('authenticated', 'public.fx_request()', 'execute')
       or has_function_privilege('authenticated', 'public.fx_rate(text, text, date)', 'execute')
       or has_function_privilege('authenticated', 'public.fx_store_rates(jsonb)', 'execute')
       or has_function_privilege('authenticated', 'public.group_expense_amount(uuid, bigint, text, numeric)', 'execute')
       or has_function_privilege('anon', 'public.create_group_expense_v2(uuid, text, bigint, character, uuid, date, uuid[], bigint[], text, numeric)', 'execute') then
      raise exception 'fx / group-expense functions over-granted';
    end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: foreign-currency group expense (split, balances, audit, mirrors at member rates)';
    else update _t set fails = fails + 1; raise notice 'FAIL: group expense currency — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 46. 0062: the ECB cache parser keeps only well-formed positive rates, and a
--     foreign-currency recurring rule materialises at the cached ECB rate of
--     each run date (it stored 1 before), or pending when there is none.
-- ---------------------------------------------------------------------------
do $$
declare u uuid; n int; r record;
begin
  begin
    n := public.fx_store_rates('{"rates": {"2001-04-02": {"GBP": 0.62, "USD": "1.1", "XX": 2, "SEK": -3, "NOK": 0},
                                             "not-a-day": {"GBP": 0.7}, "2001-04-03": "junk"}}'::jsonb);
    if n <> 2 then raise exception 'stored % rows, expected GBP + EUR', n; end if;
    if public.fx_rate('GBP', 'EUR', date '2001-04-04') <> round(1 / 0.62, 8) then
      raise exception 'fx_rate % (the day before, weekend-style)', public.fx_rate('GBP', 'EUR', date '2001-04-04');
    end if;
    if public.fx_rate('GBP', 'EUR', date '2001-04-20') is not null then
      raise exception 'rate older than 10 days used';
    end if;
    if public.fx_store_rates('{"nope": 1}'::jsonb) <> 0 then raise exception 'garbage stored'; end if;

    u := pg_temp.zz_user('recfx');
    update public.profiles set base_currency = 'EUR' where id = u;
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.save_recurring_rule(null, jsonb_build_object('amount_minor', 999, 'currency', 'GBP',
      'frequency', 'daily', 'next_run', current_date, 'end_date', current_date,
      'description', 'ZZ sub'));
    execute 'reset role';
    -- Today's rate: make sure the cache has one for today.
    insert into public.fx_rates (rate_date, currency, per_eur) values
      (current_date, 'EUR', 1), (current_date, 'GBP', 0.8)
    on conflict (rate_date, currency) do update set per_eur = excluded.per_eur;
    perform public.materialize_recurring_rules();
    select currency, exchange_rate into r from public.transactions where user_id = u;
    if r.currency <> 'GBP' or r.exchange_rate <> 1.25 then
      raise exception 'materialised % @ %', r.currency, r.exchange_rate;
    end if;
    -- No cached rate for the user's base currency → pending, not 1. A second
    -- account: this one has entries now, so its base currency is fixed (0078).
    u := pg_temp.zz_user('recfx-zzz');
    update public.profiles set base_currency = 'ZZZ' where id = u;
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.save_recurring_rule(null, jsonb_build_object('amount_minor', 500, 'currency', 'GBP',
      'frequency', 'daily', 'next_run', current_date, 'end_date', current_date, 'description', 'ZZ sub 2'));
    execute 'reset role';
    perform public.materialize_recurring_rules();
    select count(*) into n from public.transactions where user_id = u and exchange_rate is null;
    if n <> 1 then raise exception 'pending recurring row missing (%)', n; end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: ECB cache parser + foreign recurring rules at the cached rate';
    else update _t set fails = fails + 1; raise notice 'FAIL: fx cache / recurring — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 47. 0063: the PayPal.me handle is encrypted, readable by the owner and
--     co-members only, validated, and an old 2-argument save keeps it.
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; u3 uuid; gid uuid; m1 uuid; j jsonb; raw bytea;
begin
  begin
    u1 := pg_temp.zz_user('pp1'); u2 := pg_temp.zz_user('pp2'); u3 := pg_temp.zz_user('pp3');
    insert into public.groups (name, owner_id, currency) values ('ZZT pay', u1, 'EUR') returning id into gid;
    insert into public.group_members (group_id, user_id, display_name, role) values (gid, u1, 'P1', 'owner') returning id into m1;
    insert into public.group_members (group_id, user_id, display_name) values (gid, u2, 'P2');
    if has_column_privilege('authenticated', 'public.profiles', 'payment_paypal_enc', 'UPDATE') then
      raise exception 'paypal ciphertext column updatable';
    end if;
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.set_payment_info(null, null, 'not a handle!');
      raise exception 'GUARD_MISSED: invalid PayPal handle';
    exception when others then if sqlerrm not like '%PayPal.me%' then raise; end if; end;
    perform public.set_payment_info('CY17002001280000001200527600', 'zzrev', 'ZzPay123');
    perform public.set_payment_info('CY17002001280000001200527600', 'zzrev');   -- an old client
    j := public.my_payment_info();
    if j ->> 'payment_paypal' is distinct from 'ZzPay123' then raise exception 'own paypal = %', j; end if;
    execute 'reset role';
    select payment_paypal_enc into raw from public.profiles where id = u1;
    if raw is null or position('ZzPay123' in encode(raw, 'escape')) > 0 then raise exception 'paypal not encrypted'; end if;
    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    j := public.member_payment_info(m1);
    if j ->> 'payment_paypal' is distinct from 'ZzPay123' then raise exception 'co-member sees %', j; end if;
    execute 'reset role';
    perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      j := public.member_payment_info(m1);
      raise exception 'GUARD_MISSED: outsider read payment info';
    exception when others then if sqlerrm not like '%not allowed%' then raise; end if; end;
    execute 'reset role';
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.set_payment_info(null, null, '');
    j := public.my_payment_info();
    execute 'reset role';
    if j ->> 'payment_paypal' is not null then raise exception 'empty string did not clear paypal'; end if;
    if to_regprocedure('public.set_payment_info(text, text)') is not null then
      raise exception 'old 2-argument set_payment_info still present';
    end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: PayPal.me handle encrypted, co-member only, validated';
    else update _t set fails = fails + 1; raise notice 'FAIL: PayPal handle — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 48. 0065: "Make recurring". A rule made from a transaction links that row
--     (only the caller's own personal row, once, atomically with the rule);
--     materialised rows carry their rule; my_transactions reports it; deleting
--     the rule unlinks the rows but keeps them.
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; gid uuid; m1 uuid; m2 uuid; t1 uuid; t2 uuid; tmirror uuid; rid uuid; rid2 uuid;
        n int; r record; cu uuid := gen_random_uuid(); cu2 uuid := gen_random_uuid(); cu3 uuid := gen_random_uuid();
begin
  begin
    u1 := pg_temp.zz_user('mr1');
    u2 := pg_temp.zz_user('mr2');
    insert into public.groups (name, owner_id, currency) values ('ZZT mr', u1, 'EUR') returning id into gid;
    insert into public.group_members (group_id, user_id, display_name, role) values (gid, u1, 'A', 'owner') returning id into m1;
    insert into public.group_members (group_id, user_id, display_name) values (gid, u2, 'B') returning id into m2;
    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.save_transactions(jsonb_build_array(jsonb_build_object(
      'client_uuid', cu2, 'amount_minor', 700, 'currency', 'EUR', 'spent_at', current_date - 3)));
    execute 'reset role';
    select id into t2 from public.transactions where client_uuid = cu2;
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.save_transactions(jsonb_build_array(jsonb_build_object(
      'client_uuid', cu, 'amount_minor', 85000, 'currency', 'EUR', 'description', 'ZZ rent',
      'spent_at', current_date - 40),
      jsonb_build_object('client_uuid', cu3, 'amount_minor', 999, 'currency', 'EUR', 'spent_at', current_date)));
    perform public.create_group_expense_v2(gid, 'ZZ shared', 1000, 'EUR', m1, current_date, array[m1, m2], null, 'equal');
    execute 'reset role';
    select id into t1 from public.transactions where client_uuid = cu;
    select id into tmirror from public.transactions where user_id = u1 and group_expense_id is not null;
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    rid := public.save_recurring_rule(null, jsonb_build_object('amount_minor', 85000, 'currency', 'EUR',
      'description', 'ZZ rent', 'frequency', 'monthly', 'next_run', current_date - 10,
      'source_transaction_id', t1));
    -- The form's Repeat switch links by client_uuid (save_transactions returns a count).
    rid2 := public.save_recurring_rule(null, jsonb_build_object('amount_minor', 999, 'currency', 'EUR',
      'frequency', 'weekly', 'next_run', current_date + 7, 'source_client_uuid', cu3));
    begin
      perform public.save_recurring_rule(null, jsonb_build_object('amount_minor', 1, 'currency', 'EUR',
        'next_run', current_date + 30, 'source_client_uuid', cu2));
      raise exception 'GUARD_MISSED: linked another user''s client_uuid';
    exception when others then if sqlerrm not like '%can''t be made recurring%' then raise; end if; end;
    foreach rid2 in array array[t1, t2, tmirror] loop
      begin
        perform public.save_recurring_rule(null, jsonb_build_object('amount_minor', 1, 'currency', 'EUR',
          'next_run', current_date + 30, 'source_transaction_id', rid2));
        raise exception 'GUARD_MISSED: linked %', rid2;
      exception when others then if sqlerrm not like '%can''t be made recurring%' then raise; end if; end;
    end loop;
    execute 'reset role';
    select count(*) into n from public.recurring_rules where user_id = u1;
    if n <> 2 then raise exception 'a refused link left a rule behind (% rules)', n; end if;
    select count(*) into n from public.transactions where client_uuid = cu3 and recurring_rule_id is not null;
    if n <> 1 then raise exception 'client_uuid source not linked'; end if;
    select recurring_rule_id into r from public.transactions where id = t1;
    if r.recurring_rule_id is distinct from rid then raise exception 'source not linked'; end if;
    select count(*) into n from public.transactions where id in (t2, tmirror) and recurring_rule_id is not null;
    if n <> 0 then raise exception 'another user''s row or a group share got linked'; end if;
    perform public.materialize_recurring_rules();
    select count(*) into n from public.transactions where user_id = u1 and recurring_rule_id = rid and id <> t1;
    if n <> 1 then raise exception 'materialised rows not stamped with their rule (%)', n; end if;
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select * into r from public.my_transactions() t where t.id = t1;
    if r.recurring_rule_id is distinct from rid or r.recurring ->> 'frequency' <> 'monthly' then
      raise exception 'my_transactions recurring = %', r.recurring;
    end if;
    delete from public.recurring_rules where id = rid;
    execute 'reset role';
    select count(*) into n from public.transactions where user_id = u1 and group_expense_id is null;
    if n <> 3 then raise exception 'rule delete removed rows (% left)', n; end if;
    select count(*) into n from public.transactions where recurring_rule_id = rid;
    if n <> 0 then raise exception 'rows still linked to a deleted rule'; end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: make recurring links the source row; materialised rows carry their rule';
    else update _t set fails = fails + 1; raise notice 'FAIL: make recurring — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 49. 0067: a yearly subscription is spread over the months it covers. The
--     source row of a yearly "Make recurring" and every materialised yearly
--     row get spread_months (12·N); monthly rules' rows don't; the split is
--     exact (remainder to the earliest months); a budget alert counts the
--     month's share to the cent; my_transactions(p_spread) returns the earlier
--     spread row for a month window; the source row follows a frequency edit,
--     already-charged rows don't; unlinking keeps it; clients can't write it.
-- ---------------------------------------------------------------------------
do $$
declare u uuid; cat uuid; cat2 uuid; t1 uuid; tp uuid; rid uuid; rb uuid; rc uuid; n int; v bigint;
        m0 date := date_trunc('month', current_date)::date;
        cu1 uuid := gen_random_uuid(); cu2 uuid := gen_random_uuid();
begin
  begin
    -- The split itself (JS twin: test/spread.test.js).
    select sum(public.spread_part(120005, 12, i)) into v from generate_series(0, 11) i;
    if v <> 120005 then raise exception 'parts sum to %', v; end if;
    if public.spread_part(120005, 12, 0) <> 10001 or public.spread_part(120005, 12, 4) <> 10001
       or public.spread_part(120005, 12, 5) <> 10000 or public.spread_part(120005, 12, 12) <> 0 then
      raise exception 'remainder not on the earliest months';
    end if;
    select sum(public.spread_part(10000, 24, i)) into v from generate_series(0, 23) i;
    if v <> 10000 or public.spread_part(10000, 24, 15) <> 417 or public.spread_part(10000, 24, 16) <> 416 then
      raise exception '24-month split';
    end if;
    if public.month_share(120005, date '2026-03-15', 12, date '2027-02-01') <> 10000
       or public.month_share(120005, date '2026-03-15', 12, date '2027-03-01') <> 0
       or public.month_share(120005, date '2026-03-15', 12, date '2026-02-01') <> 0
       or public.month_share(500, date '2026-03-15', null, date '2026-03-01') <> 500
       or public.month_share(500, date '2026-03-15', null, date '2026-04-01') <> 0 then
      raise exception 'month_share window';
    end if;

    u := pg_temp.zz_user('spread');
    update public.profiles set base_currency = 'EUR' where id = u;
    insert into public.categories (user_id, name, kind) values (u, 'ZZT insurance', 'expense') returning id into cat;
    insert into public.categories (user_id, name, kind) values (u, 'ZZT subs', 'expense') returning id into cat2;
    insert into public.budgets (user_id, category_id, amount_enc, currency, period_start)
      values (u, cat, public.enc_minor(20000), 'EUR', m0);

    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    -- €1,200.05 paid on the 15th two months ago; spread_months in the payload is ignored.
    perform public.save_transactions(jsonb_build_array(jsonb_build_object(
      'client_uuid', cu1, 'category_id', cat, 'amount_minor', 120005, 'currency', 'EUR',
      'spent_at', (m0 - interval '2 months' + interval '14 days')::date, 'spread_months', 24)));
    select id into t1 from public.transactions where client_uuid = cu1;
    rid := public.save_recurring_rule(null, jsonb_build_object('amount_minor', 120005, 'currency', 'EUR',
      'category_id', cat, 'frequency', 'yearly', 'next_run', (m0 + interval '10 months' + interval '14 days')::date,
      'source_transaction_id', t1));
    -- Clients can't write the column.
    begin
      update public.transactions set spread_months = 2 where id = t1;
      raise exception 'GUARD_MISSED: spread_months writable';
    exception when insufficient_privilege then null;
    end;
    execute 'reset role';
    if has_column_privilege('authenticated', 'public.transactions', 'spread_months', 'UPDATE')
       or has_column_privilege('authenticated', 'public.transactions', 'spread_months', 'INSERT') then
      raise exception 'spread_months granted to clients';
    end if;
    select spread_months into n from public.transactions where id = t1;
    if n is distinct from 12 then raise exception 'source row spread_months = %', n; end if;

    -- This month's share of it is 10001 (index 2 of 12, remainder 5): with a
    -- €59.99 expense that's exactly 80% of €200 → one "almost used" alert.
    execute 'set local role authenticated';
    perform public.save_transactions(jsonb_build_array(jsonb_build_object(
      'client_uuid', cu2, 'category_id', cat, 'amount_minor', 5999, 'currency', 'EUR', 'spent_at', m0)));
    execute 'reset role';
    select count(*) into n from public.notifications where user_id = u and type = 'budget' and title = 'Budget almost used';
    if n <> 1 then raise exception 'spread spend 16000/20000: % warnings', n; end if;
    select count(*) into n from public.notifications where user_id = u and type = 'budget' and title = 'Budget exceeded';
    if n <> 0 then raise exception 'spread spend counted in full'; end if;
    select id into tp from public.transactions where client_uuid = cu2;
    if (select spread_months from public.transactions where id = tp) is not null then
      raise exception 'a plain row got spread';
    end if;

    -- my_transactions: spread_months out; p_spread brings the earlier row in.
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from public.my_transactions('expense', m0, (m0 + interval '1 month - 1 day')::date);
    if n <> 1 then raise exception 'month window without spread: % rows', n; end if;
    select count(*) into n from public.my_transactions('expense', m0, (m0 + interval '1 month - 1 day')::date,
                                                        null, null, true) t where t.spread_months = 12;
    if n <> 1 then raise exception 'p_spread did not return the earlier yearly row'; end if;
    select count(*) into n from public.my_transactions('expense', (m0 + interval '10 months')::date, null, null, null, true);
    if n <> 0 then raise exception 'p_spread returned a row past its 12 months'; end if;

    -- The source row follows a frequency edit (it predates the rule).
    perform public.save_recurring_rule(rid, jsonb_build_object('frequency', 'monthly'));
    execute 'reset role';
    if (select spread_months from public.transactions where id = t1) is not null then
      raise exception 'source row kept its spread after the rule went monthly';
    end if;
    execute 'set local role authenticated';
    perform public.save_recurring_rule(rid, jsonb_build_object('frequency', 'yearly', 'interval_n', 2));
    execute 'reset role';
    if (select spread_months from public.transactions where id = t1) is distinct from 24 then
      raise exception 'source row did not follow every 2 years';
    end if;

    -- Materialised rows: yearly → 12, monthly → not spread; charged rows keep
    -- their spread when their rule changes later.
    execute 'set local role authenticated';
    rb := public.save_recurring_rule(null, jsonb_build_object('amount_minor', 6000, 'currency', 'EUR',
      'category_id', cat2, 'frequency', 'yearly', 'next_run', current_date - 1));
    rc := public.save_recurring_rule(null, jsonb_build_object('amount_minor', 999, 'currency', 'EUR',
      'category_id', cat2, 'frequency', 'monthly', 'next_run', current_date - 1));
    execute 'reset role';
    perform public.materialize_recurring_rules();
    select count(*) into n from public.transactions where recurring_rule_id = rb and spread_months = 12;
    if n <> 1 then raise exception 'materialised yearly row not spread (%)', n; end if;
    select count(*) into n from public.transactions where recurring_rule_id = rc and spread_months is null;
    if n <> 1 then raise exception 'materialised monthly row spread or missing (%)', n; end if;
    update public.recurring_rules set created_at = now() - interval '1 day' where id in (rb, rc);
    execute 'set local role authenticated';
    perform public.save_recurring_rule(rc, jsonb_build_object('frequency', 'yearly'));
    perform public.save_recurring_rule(rb, jsonb_build_object('frequency', 'monthly'));
    execute 'reset role';
    select count(*) into n from public.transactions
     where (recurring_rule_id = rc and spread_months is not null) or (recurring_rule_id = rb and spread_months is null);
    if n <> 0 then raise exception 'already-charged rows changed spread with their rule'; end if;

    -- Deleting the rule unlinks but keeps the spread; income is never spread.
    execute 'set local role authenticated';
    delete from public.recurring_rules where id = rid;
    execute 'reset role';
    select spread_months into n from public.transactions where id = t1 and recurring_rule_id is null;
    if n is distinct from 24 then raise exception 'unlinked row lost its spread (%)', n; end if;
    -- An entry's kind is fixed once saved (0077), so check income directly: a
    -- yearly INCOME rule's charge is never spread.
    execute 'set local role authenticated';
    rc := public.save_recurring_rule(null, jsonb_build_object('kind', 'income', 'amount_minor', 120000,
      'currency', 'EUR', 'frequency', 'yearly', 'next_run', current_date - 1));
    execute 'reset role';
    perform public.materialize_recurring_rules();
    select count(*) into n from public.transactions where recurring_rule_id = rc and spread_months is null;
    if n <> 1 then raise exception 'yearly income row missing or spread (%)', n; end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: yearly subscriptions spread over their months (rows, split, alerts, reads)';
    else update _t set fails = fails + 1; raise notice 'FAIL: yearly spread — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 50. 0068: "Count yearly subscriptions in monthly spending". Only the owner
--     can set profiles.yearly_separate. With it off (the default) a yearly
--     charge's monthly share counts toward a budget alert; with it on the
--     spread row is skipped (new or earlier) while plain rows still count.
--     counts_in_month (JS twin: countsMonthly, test/spread.test.js) is
--     internal.
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; u uuid; cat uuid; r uuid; n int; v boolean;
        m0 date := date_trunc('month', current_date)::date;
begin
  begin
    if not public.counts_in_month(null, true) or not public.counts_in_month(null, false)
       or not public.counts_in_month(12, false) or not public.counts_in_month(12, null)
       or public.counts_in_month(12, true) then
      raise exception 'counts_in_month truth table';
    end if;
    if has_function_privilege('authenticated', 'public.counts_in_month(int, boolean)', 'execute')
       or has_function_privilege('anon', 'public.counts_in_month(int, boolean)', 'execute') then
      raise exception 'counts_in_month callable by clients';
    end if;

    u1 := pg_temp.zz_user('ysoff');
    u2 := pg_temp.zz_user('yson');
    if (select yearly_separate from public.profiles where id = u2) then
      raise exception 'yearly_separate defaults to on';
    end if;
    -- The owner sets it; another user can't (RLS: 0 rows).
    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.profiles set yearly_separate = true where id = u2;
    update public.profiles set yearly_separate = true where id = u1;
    get diagnostics n = row_count;
    execute 'reset role';
    if n <> 0 then raise exception 'set another user''s yearly_separate'; end if;
    select yearly_separate into v from public.profiles where id = u1;
    if v then raise exception 'yearly_separate leaked onto another user'; end if;
    select yearly_separate into v from public.profiles where id = u2;
    if v is distinct from true then raise exception 'owner could not set yearly_separate'; end if;

    -- Same data for both: a €200 budget this month, a €2,400 yearly rule
    -- charged yesterday (€200 a month, spread), then €160 of plain spending.
    foreach u in array array[u1, u2] loop
      -- Claims first: category inserts take their owner from them (0060).
      perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
      update public.profiles set base_currency = 'EUR' where id = u;
      insert into public.categories (user_id, name, kind) values (u, 'ZZT yearly', 'expense') returning id into cat;
      insert into public.budgets (user_id, category_id, amount_enc, currency, period_start)
        values (u, cat, public.enc_minor(20000), 'EUR', m0);
      execute 'set local role authenticated';
      r := public.save_recurring_rule(null, jsonb_build_object('amount_minor', 240000, 'currency', 'EUR',
        'category_id', cat, 'frequency', 'yearly', 'next_run', current_date - 1));
      execute 'reset role';
      perform public.materialize_recurring_rules();
      if not exists (select 1 from public.transactions where recurring_rule_id = r and spread_months = 12) then
        raise exception 'yearly row not materialised';
      end if;
      execute 'set local role authenticated';
      perform public.save_transactions(jsonb_build_array(jsonb_build_object(
        'client_uuid', gen_random_uuid(), 'category_id', cat, 'amount_minor', 16000, 'currency', 'EUR',
        'spent_at', current_date)));
      execute 'reset role';
    end loop;

    -- Off: the yearly share (€200) hits the cap → "exceeded"; the €160 after
    -- it crosses nothing new.
    select count(*) into n from public.notifications where user_id = u1 and type = 'budget' and title = 'Budget exceeded';
    if n <> 1 then raise exception 'pref off: % exceeded alerts (want 1)', n; end if;
    select count(*) into n from public.notifications where user_id = u1 and type = 'budget' and title = 'Budget almost used';
    if n <> 0 then raise exception 'pref off: % almost-used alerts (want 0)', n; end if;
    -- On: the yearly row counts nowhere; the €160 alone is 80% → "almost used".
    select count(*) into n from public.notifications where user_id = u2 and type = 'budget' and title = 'Budget exceeded';
    if n <> 0 then raise exception 'pref on: the yearly row still counted (% exceeded)', n; end if;
    select count(*) into n from public.notifications where user_id = u2 and type = 'budget' and title = 'Budget almost used';
    if n <> 1 then raise exception 'pref on: % almost-used alerts (want 1)', n; end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: yearly_separate owner-only; budget alerts skip yearly rows when kept separate';
    else update _t set fails = fails + 1; raise notice 'FAIL: yearly_separate — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 51. 0069: profiles.tour_done (the app tour finished/skipped). A new account
--     starts unseen; only the owner can set it (another user: RLS 0 rows;
--     anon: no column grant). Backfill: every profile that had finished
--     onboarding before 0069 (cut-off 2026-09-23, before it reached either
--     project) is marked seen — an aggregate over whatever exists, so it
--     holds on an empty database too.
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; v boolean; n int;
begin
  begin
    select count(*) into n from public.profiles
     where onboarded_at < timestamptz '2026-09-23 00:00+00' and not tour_done;
    if n <> 0 then raise exception 'backfill: % already-onboarded profile(s) not marked seen', n; end if;

    u1 := pg_temp.zz_user('tour');
    u2 := pg_temp.zz_user('tourx');
    if (select tour_done from public.profiles where id = u1) then
      raise exception 'tour_done defaults to seen';
    end if;

    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.profiles set tour_done = true where id = u1;
    update public.profiles set tour_done = true where id = u2;  -- RLS: 0 rows
    get diagnostics n = row_count;
    execute 'reset role';
    if n <> 0 then raise exception 'set another user''s tour_done'; end if;
    select tour_done into v from public.profiles where id = u1;
    if v is distinct from true then raise exception 'owner could not set tour_done'; end if;
    select tour_done into v from public.profiles where id = u2;
    if v then raise exception 'tour_done leaked onto another user'; end if;

    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    begin
      execute 'set local role anon';
      update public.profiles set tour_done = true where id = u2;
      execute 'reset role';
      raise exception 'anon could update tour_done';
    exception when insufficient_privilege then
      execute 'reset role';
    end;
    if (select tour_done from public.profiles where id = u2) then raise exception 'anon set tour_done'; end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: tour_done owner-only (not other users, not anon); onboarded accounts backfilled as seen';
    else update _t set fails = fails + 1; raise notice 'FAIL: tour_done — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 52. 0070: the weekly digest follows the yearly-subscription setting. With
--     it on (the default) a yearly row counts its part dated this week — here
--     a €2,400 charge paid two months ago counts €200, outranking €50 of food
--     — and a part dated before the week doesn't count; kept separate, yearly
--     rows count nowhere (a user with only those gets no digest).
--     spread_part_date (JS twin: spreadDates) clamps from the payment's day.
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; u3 uuid; u uuid; gym uuid; food uuid; old uuid; body text; n int;
        paid date := ((current_date - 3) - interval '2 months')::date;
        paid_old date := ((current_date - 7) - interval '1 month')::date;
begin
  begin
    if public.spread_part_date('2026-01-31', 0) <> '2026-01-31'
       or public.spread_part_date('2026-01-31', 1) <> '2026-02-28'
       or public.spread_part_date('2024-01-31', 1) <> '2024-02-29'
       or public.spread_part_date('2026-01-31', 2) <> '2026-03-31'
       or public.spread_part_date('2026-11-15', 3) <> '2027-02-15' then
      raise exception 'spread_part_date dates';
    end if;
    if has_function_privilege('authenticated', 'public.spread_part_date(date, int)', 'execute')
       or has_function_privilege('anon', 'public.spread_part_date(date, int)', 'execute')
       or has_function_privilege('authenticated', 'public.send_weekly_digests()', 'execute') then
      raise exception 'digest helpers callable by clients';
    end if;

    u1 := pg_temp.zz_user('dgon');
    u2 := pg_temp.zz_user('dgsep');
    u3 := pg_temp.zz_user('dgonly');
    update public.profiles set yearly_separate = true where id in (u2, u3);
    -- The digest is opt-in (0072): these accounts opted in.
    update public.profiles set notify_digest = true where id in (u1, u2, u3);
    foreach u in array array[u1, u2, u3] loop
      perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
      update public.profiles set base_currency = 'EUR' where id = u;
      insert into public.categories (user_id, name, kind) values (u, 'ZZT gym', 'expense') returning id into gym;
      insert into public.categories (user_id, name, kind) values (u, 'ZZT food', 'expense') returning id into food;
      insert into public.categories (user_id, name, kind) values (u, 'ZZT old', 'expense') returning id into old;
      execute 'set local role authenticated';
      -- €2,400 a year, paid two months ago: its part 2 (€200) is dated this week.
      perform public.save_recurring_rule(null, jsonb_build_object('amount_minor', 240000, 'currency', 'EUR',
        'category_id', gym, 'frequency', 'yearly', 'next_run', paid));
      -- €12,000 a year whose part 1 is dated just before the week.
      perform public.save_recurring_rule(null, jsonb_build_object('amount_minor', 1200000, 'currency', 'EUR',
        'category_id', old, 'frequency', 'yearly', 'next_run', paid_old));
      if u <> u3 then
        perform public.save_transactions(jsonb_build_array(jsonb_build_object(
          'client_uuid', gen_random_uuid(), 'category_id', food, 'amount_minor', 5000, 'currency', 'EUR',
          'spent_at', current_date)));
      end if;
      execute 'reset role';
    end loop;
    perform public.materialize_recurring_rules();
    select count(*) into n from public.transactions
     where user_id in (u1, u2, u3) and spread_months = 12 and spent_at in (paid, paid_old);
    if n <> 6 then raise exception 'yearly rows not materialised (% of 6)', n; end if;

    perform public.send_weekly_digests();
    select string_agg(x.body, ' | ') into body from public.notifications x where x.user_id = u1 and x.type = 'digest';
    if body is distinct from '2 expenses this week · top category: ZZT gym. Open Budgeer to see your totals.' then
      raise exception 'setting on: %', body;
    end if;
    select string_agg(x.body, ' | ') into body from public.notifications x where x.user_id = u2 and x.type = 'digest';
    if body is distinct from '1 expense this week · top category: ZZT food. Open Budgeer to see your totals.' then
      raise exception 'kept separate: %', body;
    end if;
    select count(*) into n from public.notifications where user_id = u3 and type = 'digest';
    if n <> 0 then raise exception 'kept separate, yearly only: % digest(s)', n; end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: weekly digest counts yearly parts dated this week, or none when kept separate';
    else update _t set fails = fails + 1; raise notice 'FAIL: digest yearly — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 53. 0072 consents: sign-up records acceptance only for the versions in
--     force; clients can read only their own rows and can't insert, update or
--     delete any (so they can't forge the owner or the time); accepting goes
--     through accept_legal_documents(), which records the SERVER's versions
--     once; the server clock stamps every row.
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; n int; st jsonb; v jsonb := public.current_legal_versions(); cid uuid; ts timestamptz;
begin
  begin
    insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
            'zzt-cons1-' || md5(random()::text) || '@example.com',
            jsonb_build_object('accepted_privacy', v->>'privacy', 'accepted_terms', v->>'terms'), now(), now())
    returning id into u1;
    insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
            'zzt-cons2-' || md5(random()::text) || '@example.com',
            jsonb_build_object('accepted_privacy', '1999-01-01', 'accepted_terms', v->>'terms'), now(), now())
    returning id into u2;
    select count(*) into n from public.consents
     where user_id = u1 and source = 'signup' and granted
       and ((purpose = 'privacy_notice' and version = v->>'privacy') or (purpose = 'terms' and version = v->>'terms'));
    if n <> 2 then raise exception 'sign-up acceptance not recorded (% of 2)', n; end if;
    select count(*) into n from public.consents where user_id = u2;
    if n <> 0 then raise exception 'a stale version was recorded at sign-up'; end if;

    if has_function_privilege('anon', 'public.accept_legal_documents()', 'execute')
       or has_function_privilege('anon', 'public.my_legal_status()', 'execute')
       or has_function_privilege('authenticated', 'public.record_signup_consent()', 'execute')
       or has_function_privilege('authenticated', 'public.log_preference_consent()', 'execute')
       or has_function_privilege('authenticated', 'public.anonymise_departing_user()', 'execute')
       or not has_function_privilege('authenticated', 'public.accept_legal_documents()', 'execute') then
      raise exception 'consent function privileges wrong';
    end if;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'consents' and cmd <> 'SELECT') then
      raise exception 'consents has a write policy';
    end if;

    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    st := public.my_legal_status();
    if not (st->>'needs_acceptance')::boolean then raise exception 'u2 should need to accept: %', st; end if;
    begin
      insert into public.consents (user_id, purpose, version, granted, source, created_at)
      values (u2, 'terms', v->>'terms', true, 'prompt', '2000-01-01');
      raise exception 'GUARD_MISSED: client inserted a consent row';
    exception when insufficient_privilege then null;
    end;
    begin
      update public.consents set granted = false where user_id = u1;
      raise exception 'GUARD_MISSED: client updated consents';
    exception when insufficient_privilege then null;
    end;
    begin
      delete from public.consents where user_id = u2;
      raise exception 'GUARD_MISSED: client deleted consents';
    exception when insufficient_privilege then null;
    end;
    select count(*) into n from public.consents where user_id = u1;
    if n <> 0 then raise exception 'read another user''s consents'; end if;
    st := public.accept_legal_documents();
    st := public.accept_legal_documents();   -- idempotent per version
    if (st->>'needs_acceptance')::boolean or st->>'privacy_accepted' is distinct from v->>'privacy' then
      raise exception 'accept did not take: %', st;
    end if;
    select count(*) into n from public.consents where user_id = u2;
    if n <> 2 then raise exception 'accept recorded % rows, expected 2', n; end if;
    execute 'reset role';

    -- Even a privileged insert gets the server clock.
    insert into public.consents (user_id, purpose, granted, source, created_at)
    values (u2, 'weekly_digest', true, 'settings', '2000-01-01') returning id, created_at into cid, ts;
    if ts <> now() then raise exception 'created_at not forced to now(): %', ts; end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: consents — sign-up/accept paths only, own rows only, server clock';
    else update _t set fails = fails + 1; raise notice 'FAIL: consents — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 54. 0072: the weekly digest is opt-in — off for a new profile (column
--     default false), not sent until the owner opts in; every switch change is
--     recorded in the owner's consent history, and nobody else can flip it.
-- ---------------------------------------------------------------------------
do $$
declare u uuid; u2 uuid; cat uuid; b boolean; n int; def text;
begin
  begin
    select column_default into def from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles' and column_name = 'notify_digest';
    if def is distinct from 'false' then raise exception 'notify_digest default is %', def; end if;
    u := pg_temp.zz_user('dig');
    u2 := pg_temp.zz_user('dig2');
    select notify_digest into b from public.profiles where id = u;
    if b then raise exception 'digest on for a new profile'; end if;

    insert into public.categories (user_id, name, kind) values (u, 'ZZT dig', 'expense') returning id into cat;
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.save_transactions(jsonb_build_array(jsonb_build_object(
      'client_uuid', gen_random_uuid(), 'category_id', cat, 'amount_minor', 1234, 'currency', 'EUR',
      'spent_at', current_date)));
    execute 'reset role';
    perform public.send_weekly_digests();
    select count(*) into n from public.notifications where user_id = u and type = 'digest';
    if n <> 0 then raise exception 'digest sent without opt-in'; end if;

    -- Another user can't opt u in (RLS: no row).
    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.profiles set notify_digest = true where id = u;
    execute 'reset role';
    if (select notify_digest from public.profiles where id = u) then raise exception 'another user opted u in'; end if;

    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.profiles set notify_digest = true where id = u;
    update public.profiles set notify_email = false where id = u;
    update public.profiles set display_name = 'ZZ Dig' where id = u;   -- not a consent change
    select count(*) into n from public.consents where user_id = u and source = 'settings'
       and ((purpose = 'weekly_digest' and granted) or (purpose = 'email_notifications' and not granted));
    execute 'reset role';
    if n <> 2 then raise exception 'switch changes recorded % of 2', n; end if;
    select count(*) into n from public.consents where user_id = u;
    if n <> 2 then raise exception 'unexpected extra consent rows (%)', n; end if;

    perform public.send_weekly_digests();
    select count(*) into n from public.notifications where user_id = u and type = 'digest';
    if n <> 1 then raise exception 'opted-in digest not sent (%)', n; end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: weekly digest opt-in (off by default) + switch changes logged';
    else update _t set fails = fails + 1; raise notice 'FAIL: digest opt-in — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 55. 0074 export_my_data(): the caller's own data, decrypted — and nothing of
--     another user's beyond what the caller already sees (no other user's
--     personal records, id or email). Signed-in callers only.
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; gid uuid; m1 uuid; m2 uuid; c1 uuid; c2 uuid; doc jsonb; txt text; e2 text;
begin
  begin
    u1 := pg_temp.zz_user('exp1');
    u2 := pg_temp.zz_user('exp2');
    select email into e2 from auth.users where id = u2;
    insert into public.categories (user_id, name, kind) values (u1, 'ZZT e1', 'expense') returning id into c1;
    insert into public.categories (user_id, name, kind) values (u2, 'ZZT e2', 'expense') returning id into c2;
    insert into public.groups (name, owner_id, currency) values ('ZZT export', u1, 'EUR') returning id into gid;
    insert into public.group_members (group_id, user_id, display_name, role) values (gid, u1, 'ZZ One', 'owner') returning id into m1;
    insert into public.group_members (group_id, user_id, display_name) values (gid, u2, 'ZZ Two') returning id into m2;

    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.save_transactions(jsonb_build_array(jsonb_build_object(
      'client_uuid', gen_random_uuid(), 'category_id', c2, 'amount_minor', 777, 'currency', 'EUR',
      'description', 'zz-theirs-secret')));
    perform public.create_group_expense_v2(gid, 'zz-shared-dinner', 3000, 'EUR', m2, current_date,
                                           array[m1, m2], null, 'equal');
    perform public.create_group_expense_v2(gid, 'zz-not-mine', 500, 'EUR', m2, current_date,
                                           array[m2], null, 'equal');
    execute 'reset role';

    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.save_transactions(jsonb_build_array(jsonb_build_object(
      'client_uuid', gen_random_uuid(), 'category_id', c1, 'amount_minor', 4242, 'currency', 'EUR',
      'description', 'zz-mine-secret', 'notes', 'zz-mine-note')));
    doc := public.export_my_data();
    execute 'reset role';
    txt := doc::text;

    if doc->'account'->>'id' is distinct from u1::text then raise exception 'wrong account'; end if;
    if position('zz-mine-secret' in txt) = 0 or position('zz-mine-note' in txt) = 0 then
      raise exception 'own transaction missing or not decrypted';
    end if;
    if not exists (select 1 from jsonb_array_elements(doc->'transactions') t
                    where t->>'description' = 'zz-mine-secret' and (t->>'amount_minor')::bigint = 4242) then
      raise exception 'own amount not decrypted';
    end if;
    if jsonb_array_length(doc->'groups') <> 1
       or jsonb_array_length(doc->'groups'->0->'expenses_you_are_part_of') <> 1
       or doc->'groups'->0->'expenses_you_are_part_of'->0->>'description' <> 'zz-shared-dinner'
       or (doc->'groups'->0->'expenses_you_are_part_of'->0->>'your_share_minor')::bigint <> 1500 then
      raise exception 'group part wrong: %', doc->'groups';
    end if;
    if position('zz-theirs-secret' in txt) > 0 then raise exception 'leaked another user''s transaction'; end if;
    if position('zz-not-mine' in txt) > 0 then raise exception 'leaked a group expense the caller isn''t part of'; end if;
    if position(u2::text in txt) > 0 then raise exception 'leaked another user''s id'; end if;
    if position(e2 in txt) > 0 then raise exception 'leaked another user''s email'; end if;
    if position('_enc' in txt) > 0 then raise exception 'ciphertext column in export'; end if;

    if has_function_privilege('anon', 'public.export_my_data()', 'execute') then
      raise exception 'anon can export';
    end if;
    perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
    begin
      execute 'set local role authenticated';
      perform public.export_my_data();
      raise exception 'GUARD_MISSED: export without a user';
    exception when others then
      if sqlerrm like 'GUARD_MISSED%' then raise; end if;
    end;
    execute 'reset role';
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: export_my_data returns only the caller''s data, decrypted';
    else update _t set fails = fails + 1; raise notice 'FAIL: export_my_data — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 56. 0073 purge_expired_personal_data(): deletes exactly what is past each
--     threshold (time-shifted rows either side of it), drops inactivity
--     warnings the owner answered by coming back, and is cron/postgres-only.
-- ---------------------------------------------------------------------------
do $$
declare u uuid; u3 uuid; gid uuid; n int; res jsonb; tag text := 'zzt-' || md5(random()::text);
begin
  begin
    u := pg_temp.zz_user('ret');
    u3 := pg_temp.zz_user('ret3');
    insert into public.groups (name, owner_id, currency) values ('ZZT retention', u, 'EUR') returning id into gid;
    insert into public.notifications (user_id, type, title, created_at) values
      (u, 'digest', tag || ' old', now() - interval '90 days' - interval '1 minute'),
      (u, 'digest', tag || ' keep', now() - interval '90 days' + interval '1 minute');
    insert into public.group_audit_log (group_id, actor_id, actor_name, action, summary_enc, created_at) values
      (gid, u, tag || ' old', 'expense_added', public.enc_text('zz'), now() - interval '2 years' - interval '1 minute'),
      (gid, u, tag || ' keep', 'expense_added', public.enc_text('zz'), now() - interval '2 years' + interval '1 minute');
    insert into public.rate_limits (key, count, window_start) values
      (tag || ':old', 1, now() - interval '30 days' - interval '1 minute'),
      (tag || ':keep', 1, now() - interval '30 days' + interval '1 minute');
    if to_regclass('auth.audit_log_entries') is not null then
      execute format($q$insert into auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) values
        (null, gen_random_uuid(), '{"t":"%1$s old"}', now() - interval '30 days' - interval '1 minute', ''),
        (null, gen_random_uuid(), '{"t":"%1$s keep"}', now() - interval '30 days' + interval '1 minute', '')$q$, tag);
    end if;
    -- u came back after its warning (created now); u3 has been idle since.
    update auth.users set created_at = now() - interval '25 months', last_sign_in_at = null where id = u3;
    insert into public.inactivity_notices (user_id, warned_at) values
      (u, now() - interval '10 days'), (u3, now() - interval '5 days');

    res := public.purge_expired_personal_data();

    select count(*) into n from public.notifications where title like tag || '%';
    if n <> 1 or not exists (select 1 from public.notifications where title = tag || ' keep') then
      raise exception 'notifications: % left', n;
    end if;
    select count(*) into n from public.group_audit_log where actor_name like tag || '%';
    if n <> 1 or not exists (select 1 from public.group_audit_log where actor_name = tag || ' keep') then
      raise exception 'audit log: % left', n;
    end if;
    select count(*) into n from public.rate_limits where key like tag || '%';
    if n <> 1 or not exists (select 1 from public.rate_limits where key = tag || ':keep') then
      raise exception 'rate limits: % left', n;
    end if;
    if to_regclass('auth.audit_log_entries') is not null then
      execute format($q$select count(*) from auth.audit_log_entries where payload::text like '%%%s%%'$q$, tag) into n;
      if n <> 1 then raise exception 'auth audit log: % left', n; end if;
    end if;
    if exists (select 1 from public.inactivity_notices where user_id = u) then
      raise exception 'answered warning not dropped';
    end if;
    if not exists (select 1 from public.inactivity_notices where user_id = u3) then
      raise exception 'live warning dropped';
    end if;
    if not (res ? 'notifications' and res ? 'group_audit_log') then raise exception 'result: %', res; end if;

    if has_function_privilege('authenticated', 'public.purge_expired_personal_data()', 'execute')
       or has_function_privilege('anon', 'public.purge_expired_personal_data()', 'execute') then
      raise exception 'purge callable by clients';
    end if;
    select count(*) into n from cron.job
     where (jobname = 'gdpr-retention' and command like '%purge_expired_personal_data%')
        or (jobname = 'inactive-accounts' and command like '%run_inactivity_sweep%');
    if n <> 2 then raise exception 'retention cron jobs missing (% of 2)', n; end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: retention purge deletes exactly what is past each threshold';
    else update _t set fails = fails + 1; raise notice 'FAIL: retention purge — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 57. 0073 inactive_accounts(): warn at 23 months idle (once per stretch),
--     delete at 24 months only after a warning at least 28 days old; a
--     session refresh or a sign-in counts as use. Service-role only.
-- ---------------------------------------------------------------------------
do $$
declare a uuid; b uuid; c uuid; d uuid; e uuid; f uuid; h uuid; act text; n int;
begin
  begin
    a := pg_temp.zz_user('ia-active');
    b := pg_temp.zz_user('ia-warn');
    c := pg_temp.zz_user('ia-del');
    d := pg_temp.zz_user('ia-early');
    e := pg_temp.zz_user('ia-session');
    f := pg_temp.zz_user('ia-back');
    h := pg_temp.zz_user('ia-rewarn');
    update auth.users set created_at = now() - interval '23 months' - interval '1 day', last_sign_in_at = null where id = b;
    update auth.users set created_at = now() - interval '40 months', last_sign_in_at = now() - interval '24 months' - interval '1 day' where id = c;
    update auth.users set created_at = now() - interval '40 months', last_sign_in_at = now() - interval '25 months' where id = d;
    update auth.users set created_at = now() - interval '30 months', last_sign_in_at = now() - interval '30 months' where id = e;
    insert into auth.sessions (id, user_id, created_at, updated_at, refreshed_at)
      values (gen_random_uuid(), e, now() - interval '30 months', now() - interval '30 months',
              (now() - interval '1 day') at time zone 'UTC');
    update auth.users set created_at = now() - interval '40 months', last_sign_in_at = now() - interval '5 days' where id = f;
    update auth.users set created_at = now() - interval '60 months', last_sign_in_at = now() - interval '25 months' where id = h;
    insert into public.inactivity_notices (user_id, warned_at) values
      (c, now() - interval '28 days' - interval '1 minute'),
      (d, now() - interval '10 days'),
      (f, now() - interval '40 days'),
      (h, now() - interval '26 months');   -- a warning from an earlier idle stretch

    select string_agg(x.user_id::text || '=' || x.action, ',') into act
      from public.inactive_accounts() x where x.user_id in (a, b, c, d, e, f, h);
    select count(*) into n from public.inactive_accounts() x where x.user_id in (a, d, e, f);
    if n <> 0 then raise exception 'selected an account it must not: %', act; end if;
    if not exists (select 1 from public.inactive_accounts() x where x.user_id = b and x.action = 'warn') then
      raise exception '23 months idle not warned: %', act;
    end if;
    if not exists (select 1 from public.inactive_accounts() x where x.user_id = c and x.action = 'delete') then
      raise exception '24 months idle + old warning not deleted: %', act;
    end if;
    if not exists (select 1 from public.inactive_accounts() x where x.user_id = h and x.action = 'warn') then
      raise exception 'new idle stretch not re-warned: %', act;
    end if;

    perform public.mark_inactivity_warned(b);
    if exists (select 1 from public.inactive_accounts() x where x.user_id = b) then
      raise exception 'warned account selected again';
    end if;

    if has_function_privilege('authenticated', 'public.inactive_accounts()', 'execute')
       or has_function_privilege('authenticated', 'public.mark_inactivity_warned(uuid)', 'execute')
       or has_function_privilege('authenticated', 'public.run_inactivity_sweep()', 'execute')
       or has_function_privilege('anon', 'public.inactive_accounts()', 'execute')
       or not has_function_privilege('service_role', 'public.inactive_accounts()', 'execute') then
      raise exception 'inactivity function privileges wrong';
    end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: inactive-account selection (warn at 23 months, delete at 24 after notice)';
    else update _t set fails = fails + 1; raise notice 'FAIL: inactive accounts — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 58. 0072: deleting an account anonymises what stays for the group — its
--     member rows become "Former member" with no link back (a current one,
--     and an earlier-left one kept for its history; a leaver without history
--     has no row to keep), as does its name on the change log; the shared
--     expense stays. 0078: the names are also gone from the (encrypted)
--     change-log texts, whole words only. 0080: other people's notifications
--     about what the user did are deleted — including from a group they left
--     without a trace, which nothing links them to any more.
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; u3 uuid; u4 uuid; gid uuid; m1 uuid; m2 uuid; m3 uuid; m4 uuid; eid uuid;
        r record; n int;
begin
  begin
    -- The redaction helper: whole words, longest name first, metacharacters literal.
    if public.redact_names('Ann paid for the Annual trip', array['Ann']) <> 'Former member paid for the Annual trip'
       or public.redact_names('Ann Lee → Ann', array['Ann', 'Ann Lee']) <> 'Former member → Former member'
       or public.redact_names('axb and a.b (x)', array['a.b', '(x)']) <> 'axb and Former member Former member'
       or public.redact_names('nobody here', array['Ann']) <> 'nobody here'
       or public.redact_names(null, array['Ann']) is not null then
      raise exception 'redact_names: %', public.redact_names('axb and a.b (x)', array['a.b', '(x)']);
    end if;
    if has_function_privilege('authenticated', 'public.redact_names(text,text[])', 'execute')
       or has_function_privilege('anon', 'public.redact_names(text,text[])', 'execute') then
      raise exception 'redact_names callable by clients';
    end if;

    u1 := pg_temp.zz_user('an1');
    u2 := pg_temp.zz_user('an2');
    u3 := pg_temp.zz_user('an3');
    u4 := pg_temp.zz_user('an4');
    update public.profiles set display_name = 'ZZ Owner' where id = u1;
    update public.profiles set display_name = 'ZZ Bobby' where id = u2;
    update public.profiles set display_name = 'ZZ Past' where id = u4;
    insert into public.groups (name, owner_id, currency) values ('ZZT anon', u1, 'EUR') returning id into gid;
    insert into public.group_members (group_id, user_id, display_name, role) values (gid, u1, 'ZZ Owner', 'owner') returning id into m1;
    insert into public.group_members (group_id, user_id, display_name) values (gid, u2, 'ZZ Bobby') returning id into m2;
    insert into public.group_members (group_id, user_id, display_name) values (gid, u3, 'ZZ Leaver') returning id into m3;
    insert into public.group_members (group_id, user_id, display_name) values (gid, u4, 'ZZ Past') returning id into m4;

    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    eid := public.create_group_expense_v2(gid, 'zz anon dinner', 900, 'EUR', m2, current_date,
                                          array[m1, m2, m4], null, 'equal');
    execute 'reset role';
    -- The owner records Bobby paying them back: the summary names Bobby
    -- though the actor is the owner.
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.add_settlement(gid, m2, m1, 450, 'EUR');
    execute 'reset role';
    -- ZZ Past settles their 300 share and leaves: their row stays (history)
    -- with former_user_id set.
    perform set_config('request.jwt.claims', json_build_object('sub', u4, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.add_settlement(gid, m4, m2, 300, 'EUR');
    perform public.remove_group_member(m4, true);
    execute 'reset role';
    -- ZZ Leaver leaves without a trace: the row is deleted, nothing links
    -- them to the group, but "ZZ Leaver joined …" is in the others' inboxes.
    perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.remove_group_member(m3, true);
    execute 'reset role';
    if exists (select 1 from public.group_members where id = m3) then
      raise exception 'setup: a leaver without history kept a row';
    end if;
    select * into r from public.group_members where id = m4;
    if not found or r.user_id is not null or r.former_user_id is distinct from u4 then
      raise exception 'setup: the leaver with history wasn''t kept as a former member';
    end if;
    if not exists (select 1 from public.group_audit_log where group_id = gid and actor_name = 'ZZ Bobby') then
      raise exception 'setup: no audit row under the name';
    end if;
    select count(*) into n from public.group_audit_log
     where group_id = gid and public.dec_text(summary_enc) like '%ZZ Bobby%';
    if n < 2 then raise exception 'setup: summaries don''t name Bobby (%)', n; end if;
    select count(*) into n from public.notifications
     where group_id = gid and user_id = u1 and body like 'ZZ Leaver joined%';
    if n = 0 then raise exception 'setup: no notification names the traceless leaver'; end if;
    select count(*) into n from public.notifications
     where group_id = gid and user_id = u1 and (body like '%ZZ Bobby%' or body like '%ZZ Past%');
    if n = 0 then raise exception 'setup: no notification names the others'; end if;

    perform set_config('request.jwt.claims', '', true);   -- as the service would
    delete from auth.users where id in (u2, u3, u4);

    select * into r from public.group_members where id = m2;
    if not found or r.user_id is not null or r.former_user_id is not null or r.display_name <> 'Former member' then
      raise exception 'member row not anonymised: %', row_to_json(r);
    end if;
    select * into r from public.group_members where id = m4;
    if not found or r.user_id is not null or r.former_user_id is not null or r.display_name <> 'Former member' then
      raise exception 'earlier-left row not anonymised: %', row_to_json(r);
    end if;
    select count(*) into n from public.group_members where group_id = gid;
    if n <> 3 then raise exception 'member rows: % (expected owner + two former members)', n; end if;
    select count(*) into n from public.group_audit_log where group_id = gid and actor_name in ('ZZ Bobby', 'ZZ Past');
    if n <> 0 then raise exception 'change log still names the deleted users'; end if;
    select count(*) into n from public.group_audit_log where group_id = gid and actor_name = 'Former member' and actor_id is null;
    if n < 2 then raise exception 'change log entries lost instead of anonymised (%)', n; end if;
    if not exists (select 1 from public.group_expenses where id = eid and paid_by = m2) then
      raise exception 'shared expense removed';
    end if;
    select display_name into r from public.group_members where id = m1;
    if r.display_name <> 'ZZ Owner' then raise exception 'other member renamed'; end if;

    -- 0078: the change-log texts.
    select count(*) into n from public.group_audit_log
     where group_id = gid and public.dec_text(summary_enc) similar to '%(ZZ Bobby|ZZ Leaver|ZZ Past)%';
    if n <> 0 then raise exception 'change-log texts still name the deleted users (%)', n; end if;
    if not exists (select 1 from public.group_audit_log
                    where group_id = gid and public.dec_text(summary_enc) = 'Former member added “zz anon dinner”') then
      raise exception 'expense summary not rewritten';
    end if;
    if not exists (select 1 from public.group_audit_log
                    where group_id = gid and public.dec_text(summary_enc) = 'ZZ Owner recorded a payment: Former member → ZZ Owner') then
      raise exception 'settlement summary not rewritten (other names must stay)';
    end if;
    if not exists (select 1 from public.group_audit_log
                    where group_id = gid and public.dec_text(summary_enc) = 'Former member recorded a payment: Former member → Former member') then
      raise exception 'the earlier leaver''s settlement summary not rewritten';
    end if;
    -- 0080: notifications. Nothing anywhere names them, and none of the
    -- deleted users' actions is left in anyone's inbox.
    select count(*) into n from public.notifications
     where (group_id = gid or user_id = u1)
       and (title || coalesce(body, '')) similar to '%(ZZ Bobby|ZZ Leaver|ZZ Past)%';
    if n <> 0 then raise exception 'notifications still name the deleted users (%)', n; end if;
    select count(*) into n from public.notifications where group_id = gid and user_id = u1 and actor_id is null;
    if n <> 0 then raise exception 'notifications about them kept with the link cut (%)', n; end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: account deletion anonymises the group history left behind';
    else update _t set fails = fails + 1; raise notice 'FAIL: deletion anonymisation — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 59. 0075: profiles.is_developer (unlocks the live/test site switch). A new
--     profile starts false; no client can set it — not the owner (no column
--     grant), not on anyone else's row, not anon — while the owner can still
--     read it and update their granted columns.
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; v boolean; n int;
begin
  begin
    u1 := pg_temp.zz_user('dev');
    u2 := pg_temp.zz_user('devx');
    if (select is_developer from public.profiles where id = u1) then
      raise exception 'is_developer defaults to true';
    end if;

    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select is_developer into v from public.profiles where id = u1;
    if v is distinct from false then raise exception 'owner cannot read is_developer (got %)', v; end if;
    begin
      update public.profiles set is_developer = true where id = u1;
      raise exception 'owner could update is_developer';
    exception when insufficient_privilege then null;
    end;
    begin
      update public.profiles set is_developer = true where id = u2;
      raise exception 'could update another user''s is_developer';
    exception when insufficient_privilege then null;
    end;
    update public.profiles set tour_done = true where id = u1;  -- granted columns still work
    get diagnostics n = row_count;
    execute 'reset role';
    if n <> 1 then raise exception 'owner lost their granted profile updates'; end if;

    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    begin
      execute 'set local role anon';
      update public.profiles set is_developer = true where id = u2;
      execute 'reset role';
      raise exception 'anon could update is_developer';
    exception when insufficient_privilege then
      execute 'reset role';
    end;
    if exists (select 1 from public.profiles where id in (u1, u2) and is_developer) then
      raise exception 'is_developer was set by a client';
    end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: is_developer defaults false, owner-readable, not client-writable (own row, other rows, anon)';
    else update _t set fails = fails + 1; raise notice 'FAIL: is_developer — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 60. 0076: consent-switch changes queue ONE coalesced email per user — due 15
--     minutes after the first change, carrying the switches' final state;
--     legal acceptance and other profile edits don't count. Claiming leases the
--     row; finishing clears it, or re-arms it after the window when a newer
--     change came in meanwhile; failures back off and give up after 5.
-- ---------------------------------------------------------------------------
do $$
declare u uuid; r record; q record; n int;
begin
  begin
    u := pg_temp.zz_user('pe-consent');
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.profiles set notify_digest = true where id = u;
    update public.profiles set notify_push = false where id = u;
    update public.profiles set notify_digest = false where id = u;
    update public.profiles set display_name = 'ZZ PE' where id = u;   -- not a switch
    perform public.accept_legal_documents();                           -- not a switch
    execute 'reset role';

    select count(*) into n from public.privacy_email_queue where user_id = u;
    if n <> 1 then raise exception 'expected one coalesced row, got %', n; end if;
    select * into q from public.privacy_email_queue where user_id = u;
    if q.kind <> 'consent_change' or q.due_at <> now() + interval '15 minutes' or q.pending_events <> 3 then
      raise exception 'queue row wrong: %', row_to_json(q);
    end if;
    if exists (select 1 from public.claim_privacy_emails(100000) c where c.user_id = u) then
      raise exception 'claimed before the 15 minutes were up';
    end if;

    update public.privacy_email_queue set due_at = now() - interval '1 second' where user_id = u;
    select * into r from public.claim_privacy_emails(100000) c where c.user_id = u;
    if r.user_id is null then raise exception 'due row not claimed'; end if;
    if r.email is null or r.notify_digest or r.notify_push or not r.notify_email then
      raise exception 'claim did not carry the final state: %', row_to_json(r);
    end if;
    if (select due_at from public.privacy_email_queue where user_id = u) <> now() + interval '10 minutes' then
      raise exception 'claimed row not leased';
    end if;

    -- A newer change arrived while the email was out → due again, after the window.
    perform public.finish_privacy_email(u, 'consent_change', now() - interval '1 minute', 3, true);
    select * into q from public.privacy_email_queue where user_id = u;
    if q.due_at <> now() + interval '15 minutes' or q.last_sent_at <> now() or q.pending_events <> 0 then
      raise exception 'newer change not re-armed: %', row_to_json(q);
    end if;
    -- Nothing newer → cleared.
    perform public.finish_privacy_email(u, 'consent_change', q.last_event_at, 0, true);
    if (select due_at from public.privacy_email_queue where user_id = u) is not null then
      raise exception 'sent row still due';
    end if;

    -- Failures back off, then give up after 5.
    perform public.enqueue_privacy_email(u, 'consent_change');
    for i in 1..4 loop
      perform public.finish_privacy_email(u, 'consent_change', now(), 1, false);
    end loop;
    select * into q from public.privacy_email_queue where user_id = u;
    if q.attempts <> 4 or q.due_at <> now() + interval '120 minutes' then
      raise exception 'back-off wrong: %', row_to_json(q);
    end if;
    perform public.finish_privacy_email(u, 'consent_change', now(), 1, false);
    if (select due_at from public.privacy_email_queue where user_id = u) is not null then
      raise exception 'did not give up after 5 failures';
    end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: consent-switch changes queue one coalesced email (15 min), lease/finish/back-off';
    else update _t set fails = fails + 1; raise notice 'FAIL: consent email queue — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 61. 0076: every export_my_data() queues the "data downloaded" email in the
--     same transaction — due at once, coalesced (the count covers repeats), and
--     never sooner than an hour after the previous one. The export lists the
--     user's own queue rows.
-- ---------------------------------------------------------------------------
do $$
declare u uuid; q record; doc jsonb;
begin
  begin
    u := pg_temp.zz_user('pe-export');
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.export_my_data();
    doc := public.export_my_data();
    execute 'reset role';

    select * into q from public.privacy_email_queue where user_id = u and kind = 'data_export';
    if q.user_id is null then raise exception 'export not queued'; end if;
    if q.due_at <> now() or q.pending_events <> 2 then raise exception 'export row wrong: %', row_to_json(q); end if;
    if (select count(*) from public.privacy_email_queue where user_id = u) <> 1 then
      raise exception 'exports not coalesced into one row';
    end if;
    if not (doc ? 'privacy_emails' and doc ? 'legal_update_emails' and doc ? 'transactions') then
      raise exception 'export document incomplete';
    end if;
    if jsonb_array_length(doc->'privacy_emails') <> 1 then raise exception 'own queue row not exported'; end if;

    perform public.finish_privacy_email(u, 'data_export', q.last_event_at, 2, true);
    update public.privacy_email_queue set last_sent_at = now() - interval '20 minutes' where user_id = u;
    execute 'set local role authenticated';
    perform public.export_my_data();
    execute 'reset role';
    select * into q from public.privacy_email_queue where user_id = u;
    if q.due_at <> now() + interval '40 minutes' or q.pending_events <> 1 then
      raise exception 'hourly window not respected: %', row_to_json(q);
    end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: data export queues a coalesced security email (at most hourly)';
    else update _t set fails = fails + 1; raise notice 'FAIL: export email queue — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 62. 0076 legal_update_recipients(): only accounts created before the
--     versions in force that haven't accepted them and haven't been emailed
--     about them; says which documents are unaccepted; once stamped, never
--     selected again for the same versions.
-- ---------------------------------------------------------------------------
do $$
declare a uuid; b uuid; c uuid; d uuid; e uuid; f uuid; v jsonb := public.current_legal_versions();
        r record; sel text;
begin
  begin
    a := pg_temp.zz_user('lg-none');      -- old, nothing accepted        → selected
    b := pg_temp.zz_user('lg-acc');       -- old, accepted both           → not
    c := pg_temp.zz_user('lg-new');       -- signed up after the versions → not
    d := pg_temp.zz_user('lg-mailed');    -- old, emailed for these       → not
    e := pg_temp.zz_user('lg-half');      -- old, privacy accepted, emailed for an older version → terms only
    f := pg_temp.zz_user('lg-oldacc');    -- old, accepted older versions → selected
    update auth.users set created_at = now() - interval '2 years' where id in (a, b, d, e, f);
    update auth.users set created_at = greatest(v->>'privacy', v->>'terms')::date + interval '1 hour' where id = c;
    insert into public.consents (user_id, purpose, version, granted, source) values
      (b, 'privacy_notice', v->>'privacy', true, 'prompt'), (b, 'terms', v->>'terms', true, 'prompt'),
      (e, 'privacy_notice', v->>'privacy', true, 'prompt'),
      (f, 'privacy_notice', '2000-01-01', true, 'signup'), (f, 'terms', '2000-01-01', true, 'signup');
    insert into public.legal_update_notices (user_id, privacy_version, terms_version) values
      (d, v->>'privacy', v->>'terms'), (e, '2000-01-01', '2000-01-01');

    select string_agg(x.email, ',') into sel from public.legal_update_recipients(1000000) x
     where x.user_id in (a, b, c, d, e, f);
    if exists (select 1 from public.legal_update_recipients(1000000) x where x.user_id in (b, c, d)) then
      raise exception 'selected an account it must not: %', sel;
    end if;
    select * into r from public.legal_update_recipients(1000000) x where x.user_id = a;
    if r.user_id is null or not r.privacy_changed or not r.terms_changed
       or r.privacy_version is distinct from v->>'privacy' or r.terms_version is distinct from v->>'terms' then
      raise exception 'never-accepted account wrong: %', row_to_json(r);
    end if;
    select * into r from public.legal_update_recipients(1000000) x where x.user_id = e;
    if r.user_id is null or r.privacy_changed or not r.terms_changed then
      raise exception 'half-accepted account wrong: %', row_to_json(r);
    end if;
    if not exists (select 1 from public.legal_update_recipients(1000000) x where x.user_id = f) then
      raise exception 'account on older versions not selected';
    end if;

    perform public.mark_legal_update_emailed(a, v->>'privacy', v->>'terms');
    perform public.mark_legal_update_emailed(e, v->>'privacy', v->>'terms');
    if exists (select 1 from public.legal_update_recipients(1000000) x where x.user_id in (a, e)) then
      raise exception 'stamped account selected again';
    end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: legal update sweep selects only users not yet emailed for the versions in force';
    else update _t set fails = fails + 1; raise notice 'FAIL: legal update selection — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 63. 0076: the email queue and the legal-notice stamps are server-only (RLS
--     on, no policies, no client grants — clients can neither read nor write
--     them), the sweep functions are service_role/cron only, and the cron jobs
--     are scheduled.
-- ---------------------------------------------------------------------------
do $$
declare u uuid; n int; t text; fn text;
begin
  begin
    u := pg_temp.zz_user('pe-sec');
    perform public.enqueue_privacy_email(u, 'data_export');
    insert into public.legal_update_notices (user_id, privacy_version, terms_version) values (u, 'x', 'x');
    foreach t in array array['public.privacy_email_queue', 'public.legal_update_notices'] loop
      if not (select relrowsecurity from pg_class where oid = t::regclass) then raise exception 'RLS off on %', t; end if;
      select count(*) into n from pg_policies where schemaname = 'public' and tablename = split_part(t, '.', 2);
      if n <> 0 then raise exception '% has client policies', t; end if;
      if has_table_privilege('authenticated', t, 'select') or has_table_privilege('authenticated', t, 'insert')
         or has_table_privilege('authenticated', t, 'update') or has_table_privilege('authenticated', t, 'delete')
         or has_table_privilege('anon', t, 'select') or has_table_privilege('anon', t, 'insert') then
        raise exception 'clients have privileges on %', t;
      end if;
    end loop;

    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    begin
      execute 'set local role authenticated';
      select count(*) into n from public.privacy_email_queue;
      raise exception 'GUARD_MISSED: owner read the queue';
    exception when insufficient_privilege then null; end;
    execute 'reset role';
    begin
      execute 'set local role authenticated';
      insert into public.privacy_email_queue (user_id, kind, last_event_at) values (u, 'consent_change', now());
      raise exception 'GUARD_MISSED: owner wrote the queue';
    exception when insufficient_privilege then null; end;
    execute 'reset role';
    begin
      execute 'set local role authenticated';
      delete from public.legal_update_notices where user_id = u;
      raise exception 'GUARD_MISSED: owner deleted a legal stamp';
    exception when insufficient_privilege then null; end;
    execute 'reset role';

    foreach fn in array array['public.enqueue_privacy_email(uuid,text)', 'public.claim_privacy_emails(integer)',
        'public.finish_privacy_email(uuid,text,timestamptz,integer,boolean)', 'public.legal_update_recipients(integer)',
        'public.mark_legal_update_emailed(uuid,text,text)', 'public.call_privacy_emails(text)',
        'public.run_privacy_email_queue()', 'public.run_legal_update_sweep()', 'public.build_my_data_export()',
        'public.enqueue_consent_email()'] loop
      if has_function_privilege('authenticated', fn, 'execute') or has_function_privilege('anon', fn, 'execute') then
        raise exception '% callable by clients', fn;
      end if;
    end loop;
    if not (has_function_privilege('service_role', 'public.claim_privacy_emails(integer)', 'execute')
            and has_function_privilege('service_role', 'public.legal_update_recipients(integer)', 'execute')
            and has_function_privilege('authenticated', 'public.export_my_data()', 'execute')) then
      raise exception 'deliberate grants missing';
    end if;
    select count(*) into n from cron.job
     where (jobname = 'privacy-email-queue' and command like '%run_privacy_email_queue%')
        or (jobname = 'legal-update-emails' and command like '%run_legal_update_sweep%');
    if n <> 2 then raise exception 'privacy email cron jobs missing (% of 2)', n; end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: privacy email queue and legal stamps are server-only; sweep functions not client-callable';
    else update _t set fails = fails + 1; raise notice 'FAIL: privacy email lockdown — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 64. 0077: a saved entry's kind is fixed. update_transaction refuses a kind
--     change (and a same-kind patch still edits), a retried save_transactions
--     upsert can't flip it, nor can a definer-side UPDATE; new rows of either
--     kind still save.
-- ---------------------------------------------------------------------------
do $$
declare u uuid; tid uuid; cu uuid := gen_random_uuid(); r record; n int;
begin
  begin
    u := pg_temp.zz_user('kind');
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    n := public.save_transactions(jsonb_build_array(
      jsonb_build_object('client_uuid', cu, 'kind', 'expense', 'amount_minor', 1250, 'currency', 'EUR'),
      jsonb_build_object('kind', 'income', 'amount_minor', 300000, 'currency', 'EUR')));
    if n <> 2 then raise exception 'new rows of both kinds not saved (%)', n; end if;
    select t.id into tid from public.my_transactions() t where t.kind = 'expense';
    begin
      perform public.update_transaction(tid, '{"kind": "income"}'::jsonb);
      raise exception 'GUARD_MISSED: update_transaction changed the kind';
    exception when others then
      if sqlerrm not like '%type can’t be changed%' then raise; end if;
    end;
    begin
      perform public.save_transactions(jsonb_build_array(
        jsonb_build_object('client_uuid', cu, 'kind', 'income', 'amount_minor', 1250, 'currency', 'EUR')));
      raise exception 'GUARD_MISSED: upsert changed the kind';
    exception when others then
      if sqlerrm not like '%type can’t be changed%' then raise; end if;
    end;
    -- Other edits still work, with or without the (unchanged) kind in the patch.
    perform public.update_transaction(tid, '{"amount_minor": 1999, "description": "ZZ kind edit"}'::jsonb);
    perform public.update_transaction(tid, '{"kind": "expense", "notes": "ZZ same kind"}'::jsonb);
    select * into r from public.my_transactions() t where t.id = tid;
    execute 'reset role';
    if r.kind <> 'expense' or r.amount_minor <> 1999 or r.description <> 'ZZ kind edit'
       or r.notes <> 'ZZ same kind' then
      raise exception 'edit result: % % % %', r.kind, r.amount_minor, r.description, r.notes;
    end if;
    -- Server-side writers can't flip it either.
    begin
      update public.transactions set kind = 'income' where id = tid;
      raise exception 'GUARD_MISSED: table owner changed the kind';
    exception when others then
      if sqlerrm not like '%type can’t be changed%' then raise; end if;
    end;
    if has_function_privilege('authenticated', 'public.transactions_kind_fixed()', 'execute')
       or has_function_privilege('anon', 'public.transactions_kind_fixed()', 'execute') then
      raise exception 'trigger function callable by clients';
    end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: a saved entry keeps its kind; other edits still work';
    else update _t set fails = fails + 1; raise notice 'FAIL: transaction kind fixed — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 65. 0078: splits change only through the expense RPCs or the expense's own
--     delete. Neither the expense's creator nor the group owner can delete a
--     split over REST (no grant, no policy); the ledger still nets to zero and
--     the mirror stays; editing re-splits and deleting the expense cascades.
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; gid uuid; m1 uuid; m2 uuid; eid uuid; n bigint;
begin
  begin
    u1 := pg_temp.zz_user('sp1');
    u2 := pg_temp.zz_user('sp2');
    insert into public.groups (name, owner_id, currency) values ('ZZT splits', u1, 'EUR') returning id into gid;
    insert into public.group_members (group_id, user_id, display_name, role) values (gid, u1, 'Owner', 'owner') returning id into m1;
    insert into public.group_members (group_id, user_id, display_name) values (gid, u2, 'Creator') returning id into m2;

    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    eid := public.create_group_expense_v2(gid, 'zz split guard', 1000, 'EUR', m2, current_date,
                                          array[m1, m2], null, 'equal');
    begin
      delete from public.expense_splits where expense_id = eid and member_id = m1;
      raise exception 'GUARD_MISSED: the creator deleted a split';
    exception when insufficient_privilege then null;
    end;
    execute 'reset role';

    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      delete from public.expense_splits where expense_id = eid;
      raise exception 'GUARD_MISSED: the group owner deleted splits';
    exception when insufficient_privilege then null;
    end;
    select coalesce(sum(net_minor), 0) into n from public.group_balances(gid);
    execute 'reset role';
    if n <> 0 then raise exception 'balances don''t net to zero (%)', n; end if;
    select count(*) into n from public.expense_splits where expense_id = eid;
    if n <> 2 then raise exception 'splits changed (% left)', n; end if;
    select count(*) into n from public.transactions where user_id = u1 and group_expense_id = eid;
    if n <> 1 then raise exception 'the owner''s mirrored share is gone'; end if;
    if has_table_privilege('authenticated', 'public.expense_splits', 'DELETE')
       or has_table_privilege('anon', 'public.expense_splits', 'DELETE')
       or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'expense_splits' and cmd in ('DELETE', 'ALL')) then
      raise exception 'expense_splits still deletable by clients';
    end if;

    -- The legitimate paths still work: an edit re-splits, a delete cascades.
    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.update_group_expense_v2(eid, 'zz split guard', 1000, 'EUR', m2, current_date,
                                           array[m2], null, 'equal');
    select coalesce(sum(net_minor), 0) into n from public.group_balances(gid);
    if n <> 0 then raise exception 'balances don''t net to zero after the edit (%)', n; end if;
    delete from public.group_expenses where id = eid;
    execute 'reset role';
    select count(*) into n from public.expense_splits where expense_id = eid;
    if n <> 0 then raise exception 'deleting the expense left % split(s)', n; end if;
    if not exists (select 1 from public.group_audit_log where group_id = gid and action = 'expense_deleted') then
      raise exception 'the expense delete wasn''t logged';
    end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: splits can''t be deleted over REST; RPC edits and expense deletes still work';
    else update _t set fails = fails + 1; raise notice 'FAIL: split delete lockdown — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 66. 0078: settlements can't be deleted over REST either — not by whoever
--     recorded one, not by the group owner — so the change log (which only
--     records additions) always matches the ledger.
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; gid uuid; m1 uuid; m2 uuid; sid uuid; n bigint;
begin
  begin
    u1 := pg_temp.zz_user('st1');
    u2 := pg_temp.zz_user('st2');
    insert into public.groups (name, owner_id, currency) values ('ZZT settle del', u1, 'EUR') returning id into gid;
    insert into public.group_members (group_id, user_id, display_name, role) values (gid, u1, 'Owner', 'owner') returning id into m1;
    insert into public.group_members (group_id, user_id, display_name) values (gid, u2, 'Payer') returning id into m2;

    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    sid := public.add_settlement(gid, m2, m1, 700, 'EUR');
    begin
      delete from public.settlements where id = sid;
      raise exception 'GUARD_MISSED: the recorder deleted a settlement';
    exception when insufficient_privilege then null;
    end;
    execute 'reset role';

    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      delete from public.settlements where group_id = gid;
      raise exception 'GUARD_MISSED: the group owner deleted a settlement';
    exception when insufficient_privilege then null;
    end;
    select coalesce(sum(net_minor), 0) into n from public.group_balances(gid);
    execute 'reset role';
    if n <> 0 then raise exception 'balances don''t net to zero (%)', n; end if;
    select count(*) into n from public.settlements where id = sid;
    if n <> 1 then raise exception 'settlement gone'; end if;
    if has_table_privilege('authenticated', 'public.settlements', 'DELETE')
       or has_table_privilege('anon', 'public.settlements', 'DELETE')
       or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'settlements' and cmd in ('DELETE', 'ALL')) then
      raise exception 'settlements still deletable by clients';
    end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: settlements can''t be deleted over REST';
    else update _t set fails = fails + 1; raise notice 'FAIL: settlement delete lockdown — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 67. 0078: the per-address invite quota is server-only. A signed-in user
--     can't spend another address's 3-a-day allowance (or grow rate_limits);
--     the service role (send-invite, after its own checks) still can, with no
--     signed-in user.
-- ---------------------------------------------------------------------------
do $$
declare u uuid; addr text := 'zzt-victim-' || md5(random()::text) || '@example.com'; i int; n int;
begin
  begin
    u := pg_temp.zz_user('iq');
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.consume_invite_recipient_quota(addr);
      raise exception 'GUARD_MISSED: a client spent an address''s invite quota';
    exception when insufficient_privilege then null;
    end;
    execute 'reset role';
    select count(*) into n from public.rate_limits where key = 'invite-to:' || md5(addr);
    if n <> 0 then raise exception 'a refused call still wrote rate_limits'; end if;
    if has_function_privilege('authenticated', 'public.consume_invite_recipient_quota(text)', 'execute')
       or has_function_privilege('anon', 'public.consume_invite_recipient_quota(text)', 'execute')
       or not has_function_privilege('service_role', 'public.consume_invite_recipient_quota(text)', 'execute') then
      raise exception 'wrong grants on consume_invite_recipient_quota';
    end if;

    perform set_config('request.jwt.claims', '', true);   -- as the service would
    for i in 1..3 loop
      if not public.consume_invite_recipient_quota(upper(addr)) then raise exception 'service call % refused', i; end if;
    end loop;
    if public.consume_invite_recipient_quota(addr) then raise exception 'not capped at 3/day'; end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: invite recipient quota is server-only';
    else update _t set fails = fails + 1; raise notice 'FAIL: invite recipient quota — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 68. 0078: the base currency is fixed once the account has entries. A new
--     account can change it; with a transaction (or an account, a budget, a
--     goal, a recurring entry) the change is refused — for the client and for
--     server-side writers — while the same value and other fields still save;
--     base_currency_locked() reports it; removing the entries frees it again.
-- ---------------------------------------------------------------------------
do $$
declare u uuid; n int; cur text;
begin
  begin
    u := pg_temp.zz_user('cur');
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    if public.base_currency_locked() then raise exception 'a new account is locked'; end if;
    update public.profiles set base_currency = 'USD' where id = u;
    n := public.save_transactions(jsonb_build_array(
      jsonb_build_object('kind', 'expense', 'amount_minor', 500, 'currency', 'USD')));
    if n <> 1 then raise exception 'setup: entry not saved'; end if;
    if not public.base_currency_locked() then raise exception 'lock flag not set'; end if;
    begin
      update public.profiles set base_currency = 'EUR' where id = u;
      raise exception 'GUARD_MISSED: base currency changed with entries';
    exception when others then
      if sqlerrm not like 'Your base currency is fixed%' then raise; end if;
    end;
    update public.profiles set base_currency = 'USD', display_name = 'ZZ Cur' where id = u;
    execute 'reset role';
    select base_currency into cur from public.profiles where id = u;
    if cur <> 'USD' then raise exception 'base currency is %', cur; end if;
    begin
      update public.profiles set base_currency = 'GBP' where id = u;
      raise exception 'GUARD_MISSED: a server-side write changed it';
    exception when others then
      if sqlerrm not like 'Your base currency is fixed%' then raise; end if;
    end;

    -- No entries left → free again; an account alone locks it too.
    delete from public.transactions where user_id = u;
    execute 'set local role authenticated';
    if public.base_currency_locked() then raise exception 'still locked with no entries'; end if;
    update public.profiles set base_currency = 'CHF' where id = u;
    perform public.save_account(null, 'ZZ cur acct', 'asset', 100, 'CHF');
    begin
      update public.profiles set base_currency = 'EUR' where id = u;
      raise exception 'GUARD_MISSED: changed with an account';
    exception when others then
      if sqlerrm not like 'Your base currency is fixed%' then raise; end if;
    end;
    execute 'reset role';

    if has_function_privilege('authenticated', 'public.base_currency_in_use(uuid)', 'execute')
       or has_function_privilege('anon', 'public.base_currency_in_use(uuid)', 'execute')
       or has_function_privilege('authenticated', 'public.profiles_base_currency_lock()', 'execute')
       or has_function_privilege('anon', 'public.base_currency_locked()', 'execute')
       or not has_function_privilege('authenticated', 'public.base_currency_locked()', 'execute') then
      raise exception 'wrong grants on the base-currency functions';
    end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: base currency fixed once there are entries';
    else update _t set fails = fails + 1; raise notice 'FAIL: base currency lock — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 69. 0079: the operator's sign-up digest. signup_digest() counts yesterday's
--     (UTC) accounts and the total at the end of that day — not today's, not
--     soft-deleted ones; a day is claimed once in operator_digest_log (a second
--     claim is refused, a release frees it); the log is server-only and the
--     functions are service_role/cron only; the cron job is scheduled.
-- ---------------------------------------------------------------------------
do $$
declare y date := (now() at time zone 'utc')::date - 1; before jsonb; after jsonb;
        a uuid; b uuid; c uuid; n int; fn text;
begin
  begin
    before := public.signup_digest();
    if (before->>'day')::date <> y then raise exception 'default day is %, not yesterday (UTC)', before->>'day'; end if;
    a := pg_temp.zz_user('dg-y');       -- signed up yesterday: counted
    b := pg_temp.zz_user('dg-today');   -- signed up today: not in yesterday's digest
    c := pg_temp.zz_user('dg-del');     -- yesterday, but soft-deleted: not counted
    update auth.users set created_at = (y::timestamp at time zone 'utc') + interval '12 hours' where id in (a, c);
    update auth.users set deleted_at = now() where id = c;
    after := public.signup_digest();
    if (after->>'new_count')::int <> (before->>'new_count')::int + 1 then
      raise exception 'new_count % → % (expected +1)', before->>'new_count', after->>'new_count';
    end if;
    if (after->>'total')::int <> (before->>'total')::int + 1 then
      raise exception 'total % → % (expected +1)', before->>'total', after->>'total';
    end if;
    if (public.signup_digest(y - 1)->>'total')::int >= (after->>'total')::int then
      raise exception 'the day before counted yesterday''s account';
    end if;

    -- Once per day.
    delete from public.operator_digest_log where day = y;
    if not public.claim_operator_digest(y) then raise exception 'first claim refused'; end if;
    if public.claim_operator_digest(y) then raise exception 'second claim for the same day accepted'; end if;
    if not (public.signup_digest()->>'sent')::boolean then raise exception 'claimed day not reported as sent'; end if;
    perform public.release_operator_digest(y);
    if (public.signup_digest()->>'sent')::boolean then raise exception 'released day still sent'; end if;
    if not public.claim_operator_digest(y) then raise exception 'released day could not be claimed again'; end if;

    -- Server-only log, service-only functions.
    if not (select relrowsecurity from pg_class where oid = 'public.operator_digest_log'::regclass) then
      raise exception 'RLS off on operator_digest_log';
    end if;
    select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'operator_digest_log';
    if n <> 0 then raise exception 'operator_digest_log has client policies'; end if;
    if has_table_privilege('authenticated', 'public.operator_digest_log', 'select')
       or has_table_privilege('authenticated', 'public.operator_digest_log', 'insert')
       or has_table_privilege('authenticated', 'public.operator_digest_log', 'delete')
       or has_table_privilege('anon', 'public.operator_digest_log', 'select') then
      raise exception 'clients have privileges on operator_digest_log';
    end if;
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    begin
      execute 'set local role authenticated';
      perform public.signup_digest();
      raise exception 'GUARD_MISSED: a user read the sign-up counts';
    exception when insufficient_privilege then null; end;
    execute 'reset role';
    begin
      execute 'set local role anon';
      perform public.operator_signup_email();
      raise exception 'GUARD_MISSED: anon read the operator address';
    exception when insufficient_privilege then null; end;
    execute 'reset role';
    foreach fn in array array['public.signup_digest(date)', 'public.claim_operator_digest(date)',
        'public.release_operator_digest(date)', 'public.operator_signup_email()', 'public.run_operator_digest()'] loop
      if has_function_privilege('authenticated', fn, 'execute') or has_function_privilege('anon', fn, 'execute') then
        raise exception '% callable by clients', fn;
      end if;
    end loop;
    if not (has_function_privilege('service_role', 'public.signup_digest(date)', 'execute')
            and has_function_privilege('service_role', 'public.claim_operator_digest(date)', 'execute')
            and has_function_privilege('service_role', 'public.operator_signup_email()', 'execute')) then
      raise exception 'service_role grants missing';
    end if;
    select count(*) into n from cron.job
     where jobname = 'operator-signup-digest' and schedule = '0 6 * * *' and command like '%run_operator_digest%';
    if n <> 1 then raise exception 'operator-signup-digest cron job missing'; end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: operator sign-up digest counts, once per day, service-only';
    else update _t set fails = fails + 1; raise notice 'FAIL: operator sign-up digest — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 70. 0081: the salary shift (profiles.salary_shift_from_day +
--     salary_category_id). Both default to null (off). The owner sets them;
--     another user can't (RLS: 0 rows). The day is 1–31 (check); the category
--     must be one of the row owner's own INCOME categories — another user's
--     income category and the owner's own expense category are refused by
--     profiles_salary_category_guard (not client-callable). Deleting the
--     category clears the setting (on delete set null).
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; inc1 uuid; inc2 uuid; exp2 uuid; n int; d smallint; c uuid;
begin
  begin
    u1 := pg_temp.zz_user('ss-other');
    u2 := pg_temp.zz_user('ss-owner');
    -- Claims first: category inserts take their owner from them (0060).
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    insert into public.categories (user_id, name, kind) values (u1, 'ZZT other salary', 'income') returning id into inc1;
    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    insert into public.categories (user_id, name, kind) values (u2, 'ZZT salary', 'income') returning id into inc2;
    insert into public.categories (user_id, name, kind) values (u2, 'ZZT rent', 'expense') returning id into exp2;

    select salary_shift_from_day, salary_category_id into d, c from public.profiles where id = u2;
    if d is not null or c is not null then raise exception 'salary shift not off by default'; end if;

    execute 'set local role authenticated';
    -- Another user's income category.
    begin
      update public.profiles set salary_category_id = inc1 where id = u2;
      raise exception 'GUARD_MISSED: another user''s category';
    exception when others then
      if sqlerrm not like 'Choose one of your own income categories%' then raise; end if;
    end;
    -- The owner's own expense category.
    begin
      update public.profiles set salary_category_id = exp2 where id = u2;
      raise exception 'GUARD_MISSED: an expense category';
    exception when others then
      if sqlerrm not like 'Choose one of your own income categories%' then raise; end if;
    end;
    -- The day range.
    begin
      update public.profiles set salary_shift_from_day = 0 where id = u2;
      raise exception 'GUARD_MISSED: day 0';
    exception when check_violation then null;
    end;
    begin
      update public.profiles set salary_shift_from_day = 32 where id = u2;
      raise exception 'GUARD_MISSED: day 32';
    exception when check_violation then null;
    end;
    -- The owner sets it (both ends of the range work).
    update public.profiles set salary_shift_from_day = 1 where id = u2;
    update public.profiles set salary_shift_from_day = 31 where id = u2;
    update public.profiles set salary_shift_from_day = 25, salary_category_id = inc2 where id = u2;
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'owner could not set the salary shift'; end if;
    -- Nobody else's row (RLS: 0 rows), even with their own category.
    update public.profiles set salary_shift_from_day = 25, salary_category_id = inc2 where id = u1;
    get diagnostics n = row_count;
    execute 'reset role';
    if n <> 0 then raise exception 'set another user''s salary shift'; end if;
    select salary_shift_from_day, salary_category_id into d, c from public.profiles where id = u1;
    if d is not null or c is not null then raise exception 'salary shift leaked onto another user'; end if;
    select salary_shift_from_day, salary_category_id into d, c from public.profiles where id = u2;
    if d is distinct from 25 or c is distinct from inc2 then raise exception 'salary shift not stored (%, %)', d, c; end if;

    -- Deleting the category clears it; the day stays (the app reads that as off).
    delete from public.categories where id = inc2;
    select salary_category_id into c from public.profiles where id = u2;
    if c is not null then raise exception 'deleted category still set as the salary'; end if;

    if has_function_privilege('authenticated', 'public.profiles_salary_category_guard()', 'execute')
       or has_function_privilege('anon', 'public.profiles_salary_category_guard()', 'execute') then
      raise exception 'profiles_salary_category_guard callable by clients';
    end if;
    if not (has_column_privilege('authenticated', 'public.profiles', 'salary_shift_from_day', 'UPDATE')
            and has_column_privilege('authenticated', 'public.profiles', 'salary_category_id', 'UPDATE')) then
      raise exception 'salary shift columns not updatable by their owner';
    end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: salary shift owner-only, own income category, day 1–31';
    else update _t set fails = fails + 1; raise notice 'FAIL: salary shift — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 71. 0081: seed_default_categories() gives a new account the income
--     categories Salary, Friends & family and Bonus (with the expense
--     defaults and 0084's Savings, 13 in all), only for the caller, and is
--     safe to run twice.
--     Clients may call it (authenticated), anon may not.
-- ---------------------------------------------------------------------------
do $$
declare u uuid; other uuid; n int;
begin
  begin
    u := pg_temp.zz_user('seed');
    other := pg_temp.zz_user('seed-other');
    delete from public.categories where user_id in (u, other);
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.seed_default_categories();
    perform public.seed_default_categories();
    execute 'reset role';
    select count(*) into n from public.categories where user_id = u;
    if n <> 13 then raise exception 'seeded % categories (want 13)', n; end if;
    select count(*) into n from public.categories
     where user_id = u and kind = 'income'
       and (name, icon) in (('Salary', 'salary'), ('Friends & family', 'transfer'), ('Bonus', 'salary'));
    if n <> 3 then raise exception 'income defaults: % of 3', n; end if;
    select count(*) into n from public.categories where user_id = other;
    if n <> 0 then raise exception 'seeded another account'; end if;
    if has_function_privilege('anon', 'public.seed_default_categories()', 'execute')
       or not has_function_privilege('authenticated', 'public.seed_default_categories()', 'execute') then
      raise exception 'wrong grants on seed_default_categories';
    end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: default categories include Friends & family and Bonus';
    else update _t set fails = fails + 1; raise notice 'FAIL: default categories — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 72. 0084: is_savings is for income categories only. An expense category
--     can't be inserted or updated to is_savings = true (CHECK), and a
--     savings category can't become an expense one (categories_guard keeps
--     kind fixed). New categories are not savings by default.
-- ---------------------------------------------------------------------------
do $$
declare u uuid; e uuid; i uuid; flag boolean;
begin
  begin
    u := pg_temp.zz_user('sav-check');
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into public.categories (name, kind) values ('ZZT rent', 'expense') returning id into e;
    insert into public.categories (name, kind) values ('ZZT pot', 'income') returning id into i;
    select is_savings into flag from public.categories where id = i;
    if flag is distinct from false then raise exception 'is_savings not false by default'; end if;
    begin
      insert into public.categories (name, kind, is_savings) values ('ZZT bad', 'expense', true);
      raise exception 'GUARD_MISSED: savings expense inserted';
    exception when check_violation then null; end;
    begin
      update public.categories set is_savings = true where id = e;
      raise exception 'GUARD_MISSED: expense marked as savings';
    exception when check_violation then null; end;
    update public.categories set is_savings = true where id = i;
    begin
      update public.categories set kind = 'expense' where id = i;
      raise exception 'GUARD_MISSED: savings category became an expense';
    exception when others then if sqlerrm like 'GUARD_MISSED%' then raise; end if; end;
    execute 'reset role';
    select is_savings into flag from public.categories where id = e;
    if flag then raise exception 'expense category is savings'; end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: is_savings only on income categories';
    else update _t set fails = fails + 1; raise notice 'FAIL: is_savings income only — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 73. 0084: seed_default_categories() gives a new account the income
--     category "Savings" (icon 'savings') marked as savings — the only
--     default that is.
-- ---------------------------------------------------------------------------
do $$
declare u uuid; n int;
begin
  begin
    u := pg_temp.zz_user('sav-seed');
    delete from public.categories where user_id = u;
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.seed_default_categories();
    execute 'reset role';
    select count(*) into n from public.categories
     where user_id = u and name = 'Savings' and kind = 'income' and icon = 'savings' and is_savings;
    if n <> 1 then raise exception 'seeded Savings (savings, income): % of 1', n; end if;
    select count(*) into n from public.categories where user_id = u and is_savings;
    if n <> 1 then raise exception '% seeded categories are savings (want 1)', n; end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: seed gives Savings marked as savings';
    else update _t set fails = fails + 1; raise notice 'FAIL: seed Savings — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 74. 0084: only the owner can toggle is_savings. Another user's update
--     matches no rows (RLS) and leaves the flag as it was; the owner's own
--     update turns it on and off.
-- ---------------------------------------------------------------------------
do $$
declare u_own uuid; u_other uuid; c uuid; n int; flag boolean;
begin
  begin
    u_own := pg_temp.zz_user('sav-owner');
    u_other := pg_temp.zz_user('sav-other');
    perform set_config('request.jwt.claims', json_build_object('sub', u_own, 'role', 'authenticated')::text, true);
    insert into public.categories (user_id, name, kind) values (u_own, 'ZZT interest', 'income') returning id into c;

    perform set_config('request.jwt.claims', json_build_object('sub', u_other, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.categories set is_savings = true where id = c;
    get diagnostics n = row_count;
    execute 'reset role';
    if n <> 0 then raise exception 'another user flipped is_savings'; end if;
    select is_savings into flag from public.categories where id = c;
    if flag then raise exception 'is_savings changed by another user'; end if;

    perform set_config('request.jwt.claims', json_build_object('sub', u_own, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.categories set is_savings = true where id = c;
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'the owner could not mark it as savings'; end if;
    select is_savings into flag from public.categories where id = c;
    if not flag then raise exception 'is_savings not stored'; end if;
    update public.categories set is_savings = false where id = c;
    select is_savings into flag from public.categories where id = c;
    execute 'reset role';
    if flag then raise exception 'the owner could not turn it off'; end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: is_savings owner-only (RLS)';
    else update _t set fails = fails + 1; raise notice 'FAIL: is_savings owner-only — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 75. 0084: "Taken from my income" (transactions.savings_from_income) round-
--     trips through save_transactions (insert and a retried submit),
--     update_transaction and my_transactions for the owner; it defaults to
--     false (an import, an older client) and is dropped on an expense; the
--     CHECK keeps it off expenses; another user can neither read nor change
--     it (RPC: not found; direct UPDATE: no privilege).
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; sav uuid; cu uuid := gen_random_uuid(); cu2 uuid := gen_random_uuid();
        cu3 uuid := gen_random_uuid(); tid uuid; eid uuid; flag boolean; n int;
begin
  begin
    u1 := pg_temp.zz_user('sfi-owner');
    u2 := pg_temp.zz_user('sfi-other');
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    insert into public.categories (user_id, name, kind, is_savings) values (u1, 'ZZT pot', 'income', true) returning id into sav;

    execute 'set local role authenticated';
    perform public.save_transactions(jsonb_build_array(
      jsonb_build_object('client_uuid', cu, 'kind', 'income', 'category_id', sav, 'amount_minor', 30000,
                         'currency', 'EUR', 'spent_at', current_date, 'savings_from_income', true),
      -- No flag (an import, an older client): received.
      jsonb_build_object('client_uuid', cu2, 'kind', 'income', 'category_id', sav, 'amount_minor', 500,
                         'currency', 'EUR', 'spent_at', current_date),
      -- An expense can't carry it: dropped, not refused.
      jsonb_build_object('client_uuid', cu3, 'kind', 'expense', 'amount_minor', 700,
                         'currency', 'EUR', 'spent_at', current_date, 'savings_from_income', true)));
    select t.id, t.savings_from_income into tid, flag from public.my_transactions() t where t.client_uuid = cu;
    if flag is distinct from true then raise exception 'flag not stored/read (%)', flag; end if;
    select t.savings_from_income into flag from public.my_transactions() t where t.client_uuid = cu2;
    if flag is distinct from false then raise exception 'missing flag not false (%)', flag; end if;
    select t.id, t.savings_from_income into eid, flag from public.my_transactions() t where t.client_uuid = cu3;
    if flag is distinct from false then raise exception 'expense kept the flag'; end if;

    -- A retried submit (same client_uuid) carries it too.
    perform public.save_transactions(jsonb_build_array(
      jsonb_build_object('client_uuid', cu, 'kind', 'income', 'category_id', sav, 'amount_minor', 30000,
                         'currency', 'EUR', 'spent_at', current_date, 'savings_from_income', false)));
    select t.savings_from_income into flag from public.my_transactions() t where t.id = tid;
    if flag then raise exception 'retried submit did not update the flag'; end if;

    -- update_transaction: set, keep when absent from the patch, clear.
    perform public.update_transaction(tid, '{"savings_from_income": true}'::jsonb);
    perform public.update_transaction(tid, '{"notes": "zz"}'::jsonb);
    select t.savings_from_income into flag from public.my_transactions() t where t.id = tid;
    if flag is distinct from true then raise exception 'update did not set / patch cleared it'; end if;
    perform public.update_transaction(eid, '{"savings_from_income": true}'::jsonb);
    select t.savings_from_income into flag from public.my_transactions() t where t.id = eid;
    if flag then raise exception 'expense flagged through update_transaction'; end if;

    -- Another user.
    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    select count(*) into n from public.my_transactions() t where t.id = tid;
    if n <> 0 then raise exception 'outsider read the entry'; end if;
    begin
      perform public.update_transaction(tid, '{"savings_from_income": false}'::jsonb);
      raise exception 'GUARD_MISSED: outsider changed the flag';
    exception when others then
      if sqlerrm like '%not found%' then null; else raise; end if;
    end;
    begin
      update public.transactions set savings_from_income = false where id = tid;
      raise exception 'GUARD_MISSED: direct update allowed';
    exception when insufficient_privilege then null;
    end;
    execute 'reset role';
    select savings_from_income into flag from public.transactions where id = tid;
    if flag is distinct from true then raise exception 'flag changed by another user'; end if;

    -- The CHECK: never on an expense, whoever writes.
    begin
      update public.transactions set savings_from_income = true where id = eid;
      raise exception 'GUARD_MISSED: expense flagged';
    exception when check_violation then null;
    end;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: savings_from_income round-trips, owner-only, income-only';
    else update _t set fails = fails + 1; raise notice 'FAIL: savings_from_income — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 76. 0084: recurring savings carry "Taken from my income": save_recurring_rule
--     stores it, my_recurring_rules returns it, the materializer copies it
--     onto each entry, a rule switched to expense drops it, and another user
--     can't change it.
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; sav uuid; rid uuid; flag boolean; n int;
begin
  begin
    u1 := pg_temp.zz_user('rsfi-owner');
    u2 := pg_temp.zz_user('rsfi-other');
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    insert into public.categories (user_id, name, kind, is_savings) values (u1, 'ZZT pot', 'income', true) returning id into sav;

    execute 'set local role authenticated';
    rid := public.save_recurring_rule(null, jsonb_build_object(
      'kind', 'income', 'category_id', sav, 'amount_minor', 30000, 'currency', 'EUR', 'description', 'ZZ set aside',
      'frequency', 'monthly', 'interval_n', 1, 'next_run', current_date - 1, 'savings_from_income', true));
    select x.savings_from_income into flag from public.my_recurring_rules() x where x.id = rid;
    if flag is distinct from true then raise exception 'rule flag not stored/read (%)', flag; end if;
    execute 'reset role';

    perform public.materialize_recurring_rules();
    select count(*) into n from public.transactions
     where user_id = u1 and recurring_rule_id = rid and savings_from_income and kind = 'income';
    if n <> 1 then raise exception 'materializer made % flagged entries (want 1)', n; end if;

    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.save_recurring_rule(rid, '{"savings_from_income": false}'::jsonb);
      raise exception 'GUARD_MISSED: outsider changed the rule';
    exception when others then
      if sqlerrm like '%not found%' then null; else raise; end if;
    end;
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    select x.savings_from_income into flag from public.my_recurring_rules() x where x.id = rid;
    if flag is distinct from true then raise exception 'rule flag changed by another user'; end if;
    -- Switched to an expense (uncategorised), the flag goes.
    perform public.save_recurring_rule(rid, '{"kind": "expense", "category_id": null}'::jsonb);
    select x.savings_from_income into flag from public.my_recurring_rules() x where x.id = rid;
    execute 'reset role';
    if flag then raise exception 'expense rule kept the flag'; end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: recurring savings_from_income stored, materialized, owner-only';
    else update _t set fails = fails + 1; raise notice 'FAIL: recurring savings_from_income — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 77. 0085: "Paid from savings" (transactions.paid_from_savings) round-trips
--     through save_transactions (insert and a retried submit),
--     update_transaction and my_transactions for the owner; it defaults to
--     false (a CSV import, an older client) and is dropped on income; the
--     CHECK keeps it off income; my_transactions(p_paid_from_savings) returns
--     only the flagged expenses; another user can neither read nor change it
--     (RPC: not found; direct UPDATE: no privilege).
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; cu uuid := gen_random_uuid(); cu2 uuid := gen_random_uuid();
        cu3 uuid := gen_random_uuid(); tid uuid; iid uuid; flag boolean; n int;
begin
  begin
    u1 := pg_temp.zz_user('pfs-owner');
    u2 := pg_temp.zz_user('pfs-other');
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);

    execute 'set local role authenticated';
    perform public.save_transactions(jsonb_build_array(
      jsonb_build_object('client_uuid', cu, 'kind', 'expense', 'amount_minor', 90000,
                         'currency', 'EUR', 'spent_at', current_date, 'paid_from_savings', true),
      -- No flag (an import, an older client): paid from income.
      jsonb_build_object('client_uuid', cu2, 'kind', 'expense', 'amount_minor', 500,
                         'currency', 'EUR', 'spent_at', current_date),
      -- Income can't carry it: dropped, not refused.
      jsonb_build_object('client_uuid', cu3, 'kind', 'income', 'amount_minor', 700,
                         'currency', 'EUR', 'spent_at', current_date, 'paid_from_savings', true)));
    select t.id, t.paid_from_savings into tid, flag from public.my_transactions() t where t.client_uuid = cu;
    if flag is distinct from true then raise exception 'flag not stored/read (%)', flag; end if;
    select t.paid_from_savings into flag from public.my_transactions() t where t.client_uuid = cu2;
    if flag is distinct from false then raise exception 'missing flag not false (%)', flag; end if;
    select t.id, t.paid_from_savings into iid, flag from public.my_transactions() t where t.client_uuid = cu3;
    if flag is distinct from false then raise exception 'income kept the flag'; end if;

    -- The filter: only the flagged expense.
    select count(*) into n from public.my_transactions(p_kind => 'expense', p_paid_from_savings => true) t;
    if n <> 1 then raise exception 'p_paid_from_savings returned % rows (want 1)', n; end if;
    select count(*) into n from public.my_transactions() t;
    if n <> 3 then raise exception 'unfiltered read returned % rows (want 3)', n; end if;

    -- A retried submit (same client_uuid) carries it too.
    perform public.save_transactions(jsonb_build_array(
      jsonb_build_object('client_uuid', cu, 'kind', 'expense', 'amount_minor', 90000,
                         'currency', 'EUR', 'spent_at', current_date, 'paid_from_savings', false)));
    select t.paid_from_savings into flag from public.my_transactions() t where t.id = tid;
    if flag then raise exception 'retried submit did not update the flag'; end if;

    -- update_transaction: set, keep when absent from the patch, clear.
    perform public.update_transaction(tid, '{"paid_from_savings": true}'::jsonb);
    perform public.update_transaction(tid, '{"notes": "zz"}'::jsonb);
    select t.paid_from_savings into flag from public.my_transactions() t where t.id = tid;
    if flag is distinct from true then raise exception 'update did not set / patch cleared it'; end if;
    perform public.update_transaction(iid, '{"paid_from_savings": true}'::jsonb);
    select t.paid_from_savings into flag from public.my_transactions() t where t.id = iid;
    if flag then raise exception 'income flagged through update_transaction'; end if;

    -- Another user.
    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    select count(*) into n from public.my_transactions(p_paid_from_savings => true) t;
    if n <> 0 then raise exception 'outsider read the flagged entry'; end if;
    begin
      perform public.update_transaction(tid, '{"paid_from_savings": false}'::jsonb);
      raise exception 'GUARD_MISSED: outsider changed the flag';
    exception when others then
      if sqlerrm like '%not found%' then null; else raise; end if;
    end;
    begin
      update public.transactions set paid_from_savings = false where id = tid;
      raise exception 'GUARD_MISSED: direct update allowed';
    exception when insufficient_privilege then null;
    end;
    execute 'reset role';
    select paid_from_savings into flag from public.transactions where id = tid;
    if flag is distinct from true then raise exception 'flag changed by another user'; end if;

    -- The CHECK: never on income, whoever writes.
    begin
      update public.transactions set paid_from_savings = true where id = iid;
      raise exception 'GUARD_MISSED: income flagged';
    exception when check_violation then null;
    end;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: paid_from_savings round-trips, owner-only, expense-only';
    else update _t set fails = fails + 1; raise notice 'FAIL: paid_from_savings — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 78. 0085: recurring expenses carry "Paid from savings": save_recurring_rule
--     stores it, my_recurring_rules returns it, the materializer copies it
--     onto each entry, a rule switched to income drops it, another user
--     can't change it, and the CHECK keeps it off income rules.
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; inc uuid; rid uuid; flag boolean; n int;
begin
  begin
    u1 := pg_temp.zz_user('rpfs-owner');
    u2 := pg_temp.zz_user('rpfs-other');
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    insert into public.categories (user_id, name, kind) values (u1, 'ZZT wages', 'income') returning id into inc;

    execute 'set local role authenticated';
    rid := public.save_recurring_rule(null, jsonb_build_object(
      'kind', 'expense', 'amount_minor', 5000, 'currency', 'EUR', 'description', 'ZZ gym',
      'frequency', 'monthly', 'interval_n', 1, 'next_run', current_date - 1, 'paid_from_savings', true));
    select x.paid_from_savings into flag from public.my_recurring_rules() x where x.id = rid;
    if flag is distinct from true then raise exception 'rule flag not stored/read (%)', flag; end if;
    execute 'reset role';

    perform public.materialize_recurring_rules();
    select count(*) into n from public.transactions
     where user_id = u1 and recurring_rule_id = rid and paid_from_savings and kind = 'expense';
    if n <> 1 then raise exception 'materializer made % flagged entries (want 1)', n; end if;

    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.save_recurring_rule(rid, '{"paid_from_savings": false}'::jsonb);
      raise exception 'GUARD_MISSED: outsider changed the rule';
    exception when others then
      if sqlerrm like '%not found%' then null; else raise; end if;
    end;
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    select x.paid_from_savings into flag from public.my_recurring_rules() x where x.id = rid;
    if flag is distinct from true then raise exception 'rule flag changed by another user'; end if;
    -- Switched to income, the flag goes (even when the patch asks to keep it).
    perform public.save_recurring_rule(rid, jsonb_build_object('kind', 'income', 'category_id', inc,
      'paid_from_savings', true));
    select x.paid_from_savings into flag from public.my_recurring_rules() x where x.id = rid;
    execute 'reset role';
    if flag then raise exception 'income rule kept the flag'; end if;

    -- The CHECK: never on an income rule, whoever writes.
    begin
      update public.recurring_rules set paid_from_savings = true where id = rid;
      raise exception 'GUARD_MISSED: income rule flagged';
    exception when check_violation then null;
    end;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: recurring paid_from_savings stored, materialized, owner-only';
    else update _t set fails = fails + 1; raise notice 'FAIL: recurring paid_from_savings — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 79. 0086: latest_fx_rates gives a signed-in caller today's ECB rate into
--     their base per asked currency (for the statement's recurring totals):
--     only well-formed codes, only those with a rate, read-only; anon can't
--     call it and the cache itself stays closed.
-- ---------------------------------------------------------------------------
do $$
declare u uuid; got jsonb; n int;
begin
  begin
    insert into public.fx_rates (rate_date, currency, per_eur) values (current_date, 'EUR', 1)
    on conflict (rate_date, currency) do nothing;
    insert into public.fx_rates (rate_date, currency, per_eur) values (current_date, 'ZZQ', 4)
    on conflict (rate_date, currency) do update set per_eur = excluded.per_eur;
    delete from public.fx_rates where currency = 'ZZW';
    u := pg_temp.zz_user('lfx');
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select jsonb_object_agg(currency, rate) into got
      from public.latest_fx_rates(array['zzq', 'EUR', 'ZZW', 'bad!', 'ZZQ'], 'eur');
    select count(*) into n from public.latest_fx_rates(array['ZZQ'], 'nope');
    execute 'reset role';
    if got is distinct from '{"ZZQ": 0.25, "EUR": 1}'::jsonb then raise exception 'rates %', got; end if;
    if n <> 0 then raise exception 'bad base answered % rows', n; end if;
    if has_function_privilege('anon', 'public.latest_fx_rates(text[], text)', 'execute')
       or not has_function_privilege('authenticated', 'public.latest_fx_rates(text[], text)', 'execute')
       or has_table_privilege('authenticated', 'public.fx_rates', 'SELECT') then
      raise exception 'latest_fx_rates grants wrong';
    end if;
    if not exists (select 1 from pg_proc where proname = 'latest_fx_rates'
                   and prosecdef and 'search_path=public, pg_temp' = any(proconfig)) then
      raise exception 'latest_fx_rates not a definer with a pinned search_path';
    end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: latest_fx_rates (today''s ECB rates, well-formed codes only, authenticated only)';
    else update _t set fails = fails + 1; raise notice 'FAIL: latest_fx_rates — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 80. 0087: profiles.whats_new_seen (the newest "What's new" release the
--     account has seen). Starts null; the owner sets it and reads it back;
--     another user can't change it (RLS: 0 rows), nor can anon (no column
--     grant); only a release id ('YYYY-MM-DD') is accepted.
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; v text; n int;
begin
  begin
    u1 := pg_temp.zz_user('wn');
    u2 := pg_temp.zz_user('wnx');
    if (select whats_new_seen from public.profiles where id = u1) is not null then
      raise exception 'whats_new_seen starts set';
    end if;

    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.profiles set whats_new_seen = '2026-09-26' where id = u1;
    select whats_new_seen into v from public.profiles where id = u1;
    if v is distinct from '2026-09-26' then execute 'reset role'; raise exception 'owner read back %', v; end if;
    update public.profiles set whats_new_seen = '2026-09-26' where id = u2;  -- RLS: 0 rows
    get diagnostics n = row_count;
    if n <> 0 then execute 'reset role'; raise exception 'set another user''s whats_new_seen'; end if;
    foreach v in array array['2026-9-26', '2026-13-01', '2026-09-32', 'latest', '2026-09-26x', ''] loop
      begin
        update public.profiles set whats_new_seen = v where id = u1;
        execute 'reset role';
        raise exception 'GUARD_MISSED: stored %', v;
      exception when check_violation then null;
      end;
    end loop;
    execute 'reset role';
    if (select whats_new_seen from public.profiles where id = u2) is not null then
      raise exception 'whats_new_seen leaked onto another user';
    end if;

    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    begin
      execute 'set local role anon';
      update public.profiles set whats_new_seen = '2026-09-26' where id = u2;
      execute 'reset role';
      raise exception 'anon could update whats_new_seen';
    exception when insufficient_privilege then
      execute 'reset role';
    end;
    if (select whats_new_seen from public.profiles where id = u2) is not null then raise exception 'anon set whats_new_seen'; end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: whats_new_seen owner-only (not other users, not anon), release ids only';
    else update _t set fails = fails + 1; raise notice 'FAIL: whats_new_seen — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 81. 0088: a group can't be deleted while other people are still in it.
--     The owner is refused while another joined member is in; a non-owner is
--     refused outright; someone who left with history (detached row) or whose
--     account was deleted ("Former member") doesn't hold it up; once alone the
--     owner deletes it and its pending invites go with it. The server-side
--     account-deletion path (accountDeletion.ts: hand the group to the next
--     linked member, then delete the auth user; sole-owner groups cascade)
--     still works, and a direct DELETE stays closed.
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; u3 uuid; u4 uuid; gid uuid; g2 uuid; m1 uuid; m2 uuid; m4 uuid;
        n int; tok text := 'zztest_' || md5(random()::text);
begin
  begin
    u1 := pg_temp.zz_user('gdo');
    u2 := pg_temp.zz_user('gdm');
    u3 := pg_temp.zz_user('gdx');
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    gid := public.create_group('ZZT delete needs empty', 'EUR');
    execute 'reset role';
    select id into m1 from public.group_members where group_id = gid and user_id = u1;
    insert into public.group_members (group_id, user_id, display_name) values (gid, u2, 'Joined') returning id into m2;
    -- m2 has history (a zero-net footprint), so leaving keeps a detached row.
    insert into public.group_expenses (group_id, paid_by, amount_enc, currency, description_enc, spent_at)
    values (gid, m2, public.enc_minor(0), 'EUR', public.enc_text('zz footprint'), current_date);
    insert into public.group_invites (group_id, token, created_by) values (gid, tok, u1);

    -- (a) Owner, with a joined member still in: refused with the user copy.
    begin
      execute 'set local role authenticated';
      perform public.delete_group(gid);
      raise exception 'GUARD_MISSED: deleted with a joined member in';
    exception when others then
      if sqlerrm <> 'Remove the other members before deleting this group.' then
        raise exception 'owner refusal was: %', sqlerrm;
      end if;
    end;
    execute 'reset role';

    -- (b) A non-owner member: refused outright.
    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    begin
      execute 'set local role authenticated';
      perform public.delete_group(gid);
      raise exception 'GUARD_MISSED: a non-owner deleted the group';
    exception when others then
      if sqlerrm <> 'only the owner can delete this group' then raise exception 'non-owner refusal was: %', sqlerrm; end if;
    end;
    execute 'reset role';

    -- (c) A direct DELETE is still closed to API roles (0058).
    begin
      execute 'set local role authenticated';
      delete from public.groups where id = gid;
      raise exception 'GUARD_MISSED: direct delete';
    exception when insufficient_privilege then null;
    end;
    execute 'reset role';
    if not exists (select 1 from public.groups where id = gid) then raise exception 'group gone after refusals'; end if;

    -- (d) The member leaves (history keeps a detached row): no longer in the
    --     way, and neither is a deleted account's "Former member" row.
    execute 'set local role authenticated';
    perform public.remove_group_member(m2, true);
    execute 'reset role';
    if not exists (select 1 from public.group_members where id = m2 and user_id is null and former_user_id = u2) then
      raise exception 'leaving with history did not detach the row';
    end if;
    insert into public.group_members (group_id, user_id, display_name) values (gid, u3, 'Deleter');
    delete from auth.users where id = u3;   -- anonymises the row, user_id → null
    if not exists (select 1 from public.group_members where group_id = gid and display_name = 'Former member' and user_id is null) then
      raise exception 'account deletion did not leave a Former member row';
    end if;

    -- (e) Alone, the owner deletes it; the pending invite goes with it.
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.delete_group(gid);
    execute 'reset role';
    if exists (select 1 from public.groups where id = gid) then raise exception 'owner alone could not delete'; end if;
    select count(*) into n from public.group_invites where group_id = gid;
    if n <> 0 then raise exception 'pending invite survived the delete'; end if;

    -- (f) Server path: the owner deletes their account while a joined member
    --     is in. accountDeletion.ts hands the group over first (done here as
    --     the service role does), then the auth user goes: the group survives
    --     with the new owner. The owner's other, sole-member group cascades.
    u4 := pg_temp.zz_user('gdn');
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    gid := public.create_group('ZZT handed over', 'EUR');
    g2  := public.create_group('ZZT sole owner', 'EUR');
    execute 'reset role';
    insert into public.group_members (group_id, user_id, display_name) values (gid, u4, 'Heir') returning id into m4;
    update public.groups set owner_id = u4 where id = gid;
    update public.group_members set role = 'owner' where id = m4;
    delete from auth.users where id = u1;
    if not exists (select 1 from public.groups where id = gid and owner_id = u4) then
      raise exception 'handed-over group did not survive its old owner''s deletion';
    end if;
    if exists (select 1 from public.groups where id = g2) then raise exception 'sole-owner group survived account deletion'; end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then update _t set passes = passes + 1; raise notice 'PASS: delete_group refused while others are in (owner/non-owner), works alone; account deletion unaffected';
    else update _t set fails = fails + 1; raise notice 'FAIL: delete_group needs an empty group — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Summary — raises if anything failed or any test didn't reach PASS (so a
-- skipped test can never count as a pass; CI/psql exit non-zero).
-- ---------------------------------------------------------------------------
do $$
declare expected_tests constant int := 82; f int; p int;  -- tests 1–81 + B-0059
begin
  select fails, passes into f, p from _t;
  if f > 0 then raise exception '% test(s) FAILED', f; end if;
  if p <> expected_tests then raise exception 'only % of % tests passed', p, expected_tests; end if;
  raise notice 'ALL DATABASE TESTS PASSED (% tests)', p;
end $$;
drop table _t;
