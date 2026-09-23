// A category's look: which icon key and colour key it may store. Pure, and
// kept in lockstep with the CHECK constraints in
// supabase/migrations/0060_category_management.sql (test/categoryStyle.test.js
// compares the two). icons.jsx maps each icon key to its Lucide component.

export const CATEGORY_ICON_KEYS = [
  'utensils', 'groceries', 'transport', 'housing', 'utilities', 'shopping', 'health',
  'entertainment', 'salary', 'travel', 'coffee', 'fitness', 'education', 'gifts',
  'savings', 'other',
]

// Mid-tone hues that read on both the light and the dark surface (icon on a
// tinted tile, ≥3:1 for a non-text graphic). Keys are stored; hex never is.
export const CATEGORY_COLORS = {
  coral: '#E4572E',
  amber: '#C98A0B',
  green: '#2E9B62',
  teal: '#16939A',
  blue: '#3A78D4',
  purple: '#8558D0',
  pink: '#D24D8A',
  slate: '#6B7280',
}

export const CATEGORY_COLOR_KEYS = Object.keys(CATEGORY_COLORS)

// The tile colours for a stored colour key: { fg, bg } (bg is the hue at 16%
// alpha, so it tints either theme's surface), or null for no/unknown colour —
// the badge then keeps the default sand tile.
export function categoryTile(colorKey) {
  const hex = CATEGORY_COLORS[colorKey]
  return hex ? { fg: hex, bg: `${hex}29` } : null
}
