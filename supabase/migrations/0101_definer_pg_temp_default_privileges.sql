-- 0101: hardening, no function bodies changed.
--
-- 1. Every SECURITY DEFINER function in public names pg_temp in its
--    search_path. These 51 were pinned to `public` only (0002/0048 style
--    pins from before the rule): with pg_temp left out it is searched FIRST
--    for tables and views, so a caller's temporary table could stand in for
--    a real one inside the definer's rights. `public, pg_temp` puts it last.
--    db_tests.sql test 12 now requires pg_temp on every definer function.
--
-- 2. New functions start closed. Postgres grants EXECUTE on every new
--    function to PUBLIC, and Supabase's per-schema defaults add anon and
--    authenticated, so a function a migration forgets to revoke was callable
--    by anyone. Revoking PUBLIC only works as a global default (a per-schema
--    default can't take away a global one), so it is revoked globally for
--    functions postgres creates, and given back in the extensions schema,
--    where extension installs and updates rely on it. anon and authenticated
--    come from the public schema's own defaults and are revoked there.
--    service_role keeps its default. Existing functions keep their grants;
--    every RPC the app calls already has an explicit GRANT in its migration,
--    as every new one must now (db_tests.sql test 103).

alter function public._group_net(uuid) set search_path = public, pg_temp;
alter function public.add_group_comment(uuid, text, uuid, uuid, text) set search_path = public, pg_temp;
alter function public.app_enc_key() set search_path = public, pg_temp;
alter function public.assert_expense_paid_by_in_group() set search_path = public, pg_temp;
alter function public.assert_settlement_members_in_group() set search_path = public, pg_temp;
alter function public.assert_split_member_in_group() set search_path = public, pg_temp;
alter function public.claim_or_insert_member(uuid, uuid, text) set search_path = public, pg_temp;
alter function public.copy_previous_budgets(date) set search_path = public, pg_temp;
alter function public.create_group_expense_v2(uuid, text, bigint, character, uuid, date, uuid[], bigint[], text, numeric) set search_path = public, pg_temp;
alter function public.create_group(text, character) set search_path = public, pg_temp;
alter function public.delete_budget(uuid, date) set search_path = public, pg_temp;
alter function public.edit_budget(uuid, bigint, text, date) set search_path = public, pg_temp;
alter function public.group_audit_entries(uuid, integer) set search_path = public, pg_temp;
alter function public.group_balances(uuid) set search_path = public, pg_temp;
alter function public.group_comment_counts(uuid) set search_path = public, pg_temp;
alter function public.group_comments_for(uuid, uuid) set search_path = public, pg_temp;
alter function public.group_ledger(uuid) set search_path = public, pg_temp;
alter function public.group_member_avatars(uuid) set search_path = public, pg_temp;
alter function public.group_member_net(uuid, uuid) set search_path = public, pg_temp;
alter function public.group_preview(text) set search_path = public, pg_temp;
alter function public.is_group_member(uuid) set search_path = public, pg_temp;
alter function public.is_group_owner(uuid) set search_path = public, pg_temp;
alter function public.list_my_group_invites() set search_path = public, pg_temp;
alter function public.log_group_expense() set search_path = public, pg_temp;
alter function public.log_settlement() set search_path = public, pg_temp;
alter function public.member_has_footprint(uuid, uuid) set search_path = public, pg_temp;
alter function public.member_name_for(uuid) set search_path = public, pg_temp;
alter function public.member_payment_info(uuid) set search_path = public, pg_temp;
alter function public.my_accounts() set search_path = public, pg_temp;
alter function public.my_goals() set search_path = public, pg_temp;
alter function public.my_payment_info() set search_path = public, pg_temp;
alter function public.notify_fanout() set search_path = public, pg_temp;
alter function public.notify_group_comment() set search_path = public, pg_temp;
alter function public.notify_group_expense() set search_path = public, pg_temp;
alter function public.notify_invite() set search_path = public, pg_temp;
alter function public.notify_settlement() set search_path = public, pg_temp;
alter function public.payment_enc_key() set search_path = public, pg_temp;
alter function public.preview_link_invite(text) set search_path = public, pg_temp;
alter function public.purge_expired_invites() set search_path = public, pg_temp;
alter function public.purge_item_comments() set search_path = public, pg_temp;
alter function public.rate_limit(text, integer, integer) set search_path = public, pg_temp;
alter function public.reminder_secrets() set search_path = public, pg_temp;
alter function public.save_budget(uuid, bigint, text, date) set search_path = public, pg_temp;
alter function public.save_goal(uuid, text, bigint, bigint, text, date) set search_path = public, pg_temp;
alter function public.send_payment_reminders() set search_path = public, pg_temp;
alter function public.set_payment_info(text, text, text) set search_path = public, pg_temp;
alter function public.settlement_guard() set search_path = public, pg_temp;
alter function public.sync_group_expense_meta() set search_path = public, pg_temp;
alter function public.sync_group_share() set search_path = public, pg_temp;
alter function public.sync_member_display_name() set search_path = public, pg_temp;
alter function public.update_group_expense_v2(uuid, text, bigint, character, uuid, date, uuid[], bigint[], text, numeric) set search_path = public, pg_temp;

alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema extensions grant execute on functions to public;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
