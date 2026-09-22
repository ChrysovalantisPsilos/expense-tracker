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
    if sqlerrm = 'ROLLBACK_OK' then raise notice 'PASS: budget threshold alerts (encrypted amounts)';
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

    insert into public.transactions (user_id, kind, amount_enc, currency, spent_at)
    values (u2, 'expense', public.enc_minor(999), 'EUR', current_date) returning id into tid;

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
    if sqlerrm = 'ROLLBACK_OK' then raise notice 'PASS: settled-up guard blocks unsettled leave';
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
    select id into u1 from auth.users order by created_at limit 1;
    select id into u2 from auth.users where id <> u1 order by created_at limit 1;

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
    if sqlerrm = 'ROLLBACK_OK' then raise notice 'PASS: payment info encrypted at rest + co-member access + outsider guard';
    else update _t set fails = fails + 1; raise notice 'FAIL: payment info co-member access + outsider guard — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Settlements (M1/L1): direct INSERT is closed to API roles (writes go
--    through add_settlement, which encrypts); created_by is forced to the
--    caller; a member cannot delete a settlement they didn't create.
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; gid uuid; m1 uuid; m2 uuid; sid uuid; cb uuid; still int;
begin
  begin
    select id into u1 from auth.users order by created_at limit 1;
    select id into u2 from auth.users where id <> u1 order by created_at limit 1;
    if u2 is null then raise exception 'SKIP: needs two users'; end if;

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
    delete from public.settlements where id = sid;  -- RLS filters the row out silently
    execute 'reset role';
    select count(*) into still from public.settlements where id = sid;
    if still <> 1 then raise exception 'member deleted an owner-created settlement'; end if;

    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then raise notice 'PASS: settlement writes via RPC only + created_by forced + delete restricted';
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
    select id into u1 from auth.users order by created_at limit 1;
    select id into u2 from auth.users where id <> u1 order by created_at limit 1;
    if u2 is null then raise exception 'SKIP: needs two users'; end if;

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
    if sqlerrm = 'ROLLBACK_OK' then raise notice 'PASS: expense_splits insert restricted to creator/owner';
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
    select id into u2 from auth.users order by created_at limit 1;

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
    if sqlerrm = 'ROLLBACK_OK' then raise notice 'PASS: balances/budgets/goals encrypted at rest + owner round-trip';
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
  if unpinned is null then raise notice 'PASS: every public function pins search_path';
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
    if sqlerrm = 'ROLLBACK_OK' then raise notice 'PASS: receipts bucket + receipt_path columns gone';
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
    select id into u1 from auth.users order by created_at limit 1;
    select id into u2 from auth.users where id <> u1 order by created_at limit 1;
    if u2 is null then raise exception 'SKIP: needs two users'; end if;

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
    if sqlerrm = 'ROLLBACK_OK' then raise notice 'PASS: transactions encrypted at rest + owner round-trip + outsider rejected';
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
    select id into u1 from auth.users order by created_at limit 1;
    select id into u2 from auth.users where id <> u1 order by created_at limit 1;
    if u2 is null then raise exception 'SKIP: needs two users'; end if;

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
    if sqlerrm = 'ROLLBACK_OK' then raise notice 'PASS: group ledger encrypted at rest + member round-trip + balances + outsider rejected';
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
    select id into u1 from auth.users order by created_at limit 1;
    select id into u2 from auth.users where id <> u1 order by created_at limit 1;
    if u2 is null then raise exception 'SKIP: needs two users'; end if;

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
    if sqlerrm = 'ROLLBACK_OK' then raise notice 'PASS: recurring rules encrypted at rest + owner round-trip + materializer + outsider rejected';
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
    select id into u1 from auth.users order by created_at limit 1;
    select id into u2 from auth.users where id <> u1 order by created_at limit 1;
    if u2 is null then raise exception 'SKIP: needs two users'; end if;

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
    if sqlerrm = 'ROLLBACK_OK' then raise notice 'PASS: invite policies per-verb + created_by/expires_at forced';
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
    select id into u1 from auth.users order by created_at limit 1;
    select id into u2 from auth.users where id <> u1 order by created_at limit 1;
    if u2 is null then raise exception 'SKIP: needs two users'; end if;

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
    if sqlerrm = 'ROLLBACK_OK' then raise notice 'PASS: anon group_preview is minimal (no members/expenses/balances)';
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
  if bad is null then raise notice 'PASS: crypto helpers + new RPCs not executable by anon';
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
    select id into u1 from auth.users order by created_at limit 1;
    select id into u2 from auth.users where id <> u1 order by created_at limit 1;
    if u2 is null then raise exception 'SKIP: needs two users'; end if;
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
    if sqlerrm = 'ROLLBACK_OK' then raise notice 'PASS: rate_limit closed to API roles + consume_quota scoped to caller';
    else update _t set fails = fails + 1; raise notice 'FAIL: rate_limit lock-down — %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 21. invite_user_to_group is rate-limited (0052): it fans out a notification.
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid; u2 uuid; em text; gid uuid; n int;
begin
  begin
    select id into u1 from auth.users order by created_at limit 1;
    select id, email into u2, em from auth.users where id <> u1 order by created_at limit 1;
    if u2 is null then raise exception 'SKIP: needs two users'; end if;
    insert into public.groups (name, owner_id, currency) values ('ZZT invite limit', u1, 'EUR') returning id into gid;
    insert into public.group_members (group_id, user_id, display_name, role) values (gid, u1, 'Owner', 'owner');
    delete from public.rate_limits where key = 'invite:' || u1;

    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.invite_user_to_group(gid, em);   -- under the limit: works
    execute 'reset role';
    select count(*) into n from public.notifications where user_id = u2 and group_id = gid and type = 'invite';
    if n <> 1 then raise exception 'invite not delivered (got %)', n; end if;

    update public.rate_limits set count = 30, window_start = now() where key = 'invite:' || u1;
    execute 'set local role authenticated';
    begin
      perform public.invite_user_to_group(gid, em);
      raise exception 'GUARD_MISSED: invite not rate-limited';
    exception when others then
      if sqlerrm like '%Too many invites%' then null; else raise; end if;
    end;
    execute 'reset role';

    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then raise notice 'PASS: invite_user_to_group rate-limited';
    else update _t set fails = fails + 1; raise notice 'FAIL: invite rate limit — %', sqlerrm; end if;
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
    select id into u1 from auth.users order by created_at limit 1;
    select id into u2 from auth.users where id <> u1 order by created_at limit 1;
    if u2 is null then raise exception 'SKIP: needs two users'; end if;

    select string_agg(schemaname || '.' || tablename || '.' || policyname, ', ') into bad
      from pg_policies where schemaname in ('public', 'storage') and cmd = 'ALL';
    if bad is not null then raise exception 'FOR ALL policies remain: %', bad; end if;
    -- Tables the client still writes directly keep all four verbs; the rest keep
    -- only select/delete policies (their writes go through definer RPCs, 0053).
    select string_agg(t, ', ') into bad from (
      select tablename as t from pg_policies
       where schemaname = 'public' and tablename in ('categories', 'notifications')
       group by tablename having count(distinct cmd) <> 4) x;
    if bad is not null then raise exception 'not split into 4 verbs: %', bad; end if;
    select count(distinct cmd) into n from pg_policies
     where schemaname = 'storage' and tablename = 'objects' and policyname like 'avatars\_%';
    if n <> 4 then raise exception 'avatars policies not per-verb (%)', n; end if;

    -- Own rows: owner can write/read; someone else can neither see nor touch them.
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into public.categories (user_id, name, kind) values (u1, 'ZZT own cat', 'expense') returning id into cid;
    begin
      insert into public.categories (user_id, name, kind) values (u2, 'ZZT spoof', 'expense');
      raise exception 'GUARD_MISSED: inserted a row for another user';
    exception when insufficient_privilege then null;
    end;
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
    if sqlerrm = 'ROLLBACK_OK' then raise notice 'PASS: no FOR ALL policies left + own-row/own-folder semantics kept';
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
    select id into u1 from auth.users order by created_at limit 1;
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
    if sqlerrm = 'ROLLBACK_OK' then raise notice 'PASS: no decryption oracle (direct ciphertext writes closed, dec_minor silent, *_enc keys ignored)';
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
    select id into u from auth.users order by created_at limit 1;
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
    if sqlerrm = 'ROLLBACK_OK' then raise notice 'PASS: 500-row import into a budgeted category in % ms, one alert', ms;
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
    select id into u1 from auth.users order by created_at limit 1;
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
    if sqlerrm = 'ROLLBACK_OK' then raise notice 'PASS: recurring next_run clamped + 200-rule cap';
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
    select id into u1 from auth.users order by created_at limit 1;
    select id into u2 from auth.users where id <> u1 order by created_at limit 1;
    if u2 is null then raise exception 'SKIP: needs two users'; end if;
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
    if sqlerrm = 'ROLLBACK_OK' then raise notice 'PASS: expense edit leaves former members'' copies alone';
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
    select id into u1 from auth.users order by created_at limit 1;
    select id into u2 from auth.users where id <> u1 order by created_at limit 1;
    if u2 is null then raise exception 'SKIP: needs two users'; end if;
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
    if sqlerrm = 'ROLLBACK_OK' then raise notice 'PASS: foreign category/account ids rejected + names not leaked';
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
    select id into u1 from auth.users order by created_at limit 1;
    insert into public.groups (name, owner_id, currency) values ('ZZT token', u1, 'EUR') returning id into gid;
    insert into public.group_members (group_id, user_id, display_name, role) values (gid, u1, 'Owner', 'owner');
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into public.group_invites (group_id, token) values (gid, 'x') returning token into tok;
    execute 'reset role';
    if tok = 'x' or length(tok) < 32 then raise exception 'client-chosen token accepted: %', tok; end if;
    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm = 'ROLLBACK_OK' then raise notice 'PASS: invite token is server-generated';
    else update _t set fails = fails + 1; raise notice 'FAIL: invite token — %', sqlerrm; end if;
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
