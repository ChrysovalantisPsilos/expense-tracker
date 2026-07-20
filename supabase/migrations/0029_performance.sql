-- Performance pass (from Supabase advisors).
--
-- 1. RLS initplan: wrap auth.uid() in (select …) so Postgres evaluates it ONCE
--    per query (an InitPlan) instead of once per row. ALTER POLICY keeps the
--    existing roles/commands.
alter policy "own rows" on public.accounts        using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own rows" on public.budgets         using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own rows" on public.categories      using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own rows" on public.recurring_rules using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own rows" on public.transactions    using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own profile" on public.profiles     using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
alter policy notif_own on public.notifications    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy groups_select on public.groups       using (public.is_group_member(id) or (owner_id = (select auth.uid())));
alter policy groups_insert on public.groups       with check (owner_id = (select auth.uid()));
alter policy gm_insert on public.group_members    with check ((user_id = (select auth.uid())) and (public.is_group_member(group_id) or public.is_group_owner(group_id)));
alter policy gi_all on public.group_invites       using (public.is_group_member(group_id)) with check (public.is_group_member(group_id) and (created_by = (select auth.uid())) and (invited_user_id is null));
alter policy ge_update on public.group_expenses   using ((created_by = (select auth.uid())) or public.is_group_owner(group_id)) with check ((created_by = (select auth.uid())) or public.is_group_owner(group_id));
alter policy ge_delete on public.group_expenses   using ((created_by = (select auth.uid())) or public.is_group_owner(group_id));
alter policy es_update on public.expense_splits   using (exists (select 1 from public.group_expenses e where e.id = expense_splits.expense_id and ((e.created_by = (select auth.uid())) or public.is_group_owner(e.group_id))));
alter policy es_delete on public.expense_splits   using (exists (select 1 from public.group_expenses e where e.id = expense_splits.expense_id and ((e.created_by = (select auth.uid())) or public.is_group_owner(e.group_id))));

-- 2. Covering indexes for foreign keys (speeds FK joins + cascade/set-null).
create index if not exists budgets_category_idx           on public.budgets(category_id);
create index if not exists expense_splits_member_idx       on public.expense_splits(member_id);
create index if not exists group_audit_log_actor_idx       on public.group_audit_log(actor_id);
create index if not exists group_expenses_created_by_idx   on public.group_expenses(created_by);
create index if not exists group_expenses_paid_by_idx      on public.group_expenses(paid_by);
create index if not exists group_invites_accepted_by_idx   on public.group_invites(accepted_by);
create index if not exists group_invites_created_by_idx    on public.group_invites(created_by);
create index if not exists group_invites_invited_user_idx  on public.group_invites(invited_user_id);
create index if not exists groups_owner_idx                on public.groups(owner_id);
create index if not exists notifications_actor_idx         on public.notifications(actor_id);
create index if not exists notifications_group_idx         on public.notifications(group_id);
create index if not exists notifications_invite_idx        on public.notifications(invite_id);
create index if not exists recurring_rules_account_idx     on public.recurring_rules(account_id);
create index if not exists recurring_rules_category_idx    on public.recurring_rules(category_id);
create index if not exists settlements_created_by_idx      on public.settlements(created_by);
create index if not exists settlements_from_member_idx     on public.settlements(from_member);
create index if not exists settlements_to_member_idx       on public.settlements(to_member);
create index if not exists transactions_account_idx        on public.transactions(account_id);
create index if not exists transactions_group_expense_idx  on public.transactions(group_expense_id);
create index if not exists transactions_group_idx          on public.transactions(group_id);

-- Note: transactions_category_idx (on category_id) reads as "unused" for
-- queries — category grouping is client-side — but it covers the category_id
-- FK, so a category delete (ON DELETE SET NULL) doesn't full-scan transactions.
-- Kept for that reason. The freshly-created FK indexes above will similarly
-- show as "unused" until the app exercises them.
