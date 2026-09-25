-- 0082: every existing account gets the two income categories new accounts
-- are seeded with since 0081 — "Friend Transfer" and "Bonus" — so existing
-- and future accounts have the same defaults. Only these two rows are added,
-- once per account that doesn't have them already (names are unique per user
-- and kind, so re-running this is a no-op and a user's own category of that
-- name is left alone). The app tags them "New" for two days after they were
-- added (NEW_DEFAULT_CATEGORIES / isNewCategory in
-- src/features/categories/categoryMath.js, kept in lockstep with this list
-- and the seed by test/categoryMath.test.js).

insert into public.categories (user_id, name, icon, kind)
select p.id, d.name, d.icon, 'income'::public.txn_kind
  from public.profiles p
 cross join (values
   ('Friend Transfer', 'transfer'),
   ('Bonus',           'salary')
 ) as d(name, icon)
on conflict (user_id, name, kind) do nothing;
