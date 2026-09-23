-- 0071: more category icons — home & bills, getting around & leisure, money &
-- work. Widens the 0066 icon CHECK; kept in lockstep with CATEGORY_ICON_KEYS in
-- src/shared/lib/categoryStyle.js and the registry in src/shared/lib/icons.jsx
-- (test/categoryMath.test.js compares all three). Every existing row already
-- satisfies the narrower list, so the new constraint is validated straight away.

alter table public.categories drop constraint if exists categories_icon_check;
alter table public.categories
  add constraint categories_icon_check
  check (icon is null or icon in (
    'utensils', 'groceries', 'transport', 'fuel', 'housing', 'utilities', 'shopping', 'health',
    'entertainment', 'salary', 'travel', 'coffee', 'fitness', 'education', 'gifts',
    'savings', 'other',
    'rent', 'phone', 'internet', 'insurance', 'taxes', 'bank-fees', 'streaming', 'water',
    'electricity',
    'parking', 'bus', 'taxi', 'bike', 'flights', 'hotel', 'bars', 'games', 'music', 'books',
    'sports', 'hobbies',
    'freelance', 'investments', 'refunds', 'gifts-received', 'cash', 'transfer', 'business',
    'electronics'));
