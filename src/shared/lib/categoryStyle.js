// A category's look: which icon key and colour key it may store. Pure, and
// kept in lockstep with the CHECK constraints in
// supabase/migrations/0060_category_management.sql (colours) and
// 0071_more_category_icons.sql (icons) — test/categoryMath.test.js compares
// them. icons.jsx maps each icon key to its Lucide component.

export const CATEGORY_ICON_KEYS = [
  'utensils', 'groceries', 'transport', 'fuel', 'housing', 'utilities', 'shopping', 'health',
  'entertainment', 'salary', 'travel', 'coffee', 'fitness', 'education', 'gifts',
  'savings', 'other',
  'rent', 'phone', 'internet', 'insurance', 'taxes', 'bank-fees', 'streaming', 'water',
  'electricity',
  'parking', 'bus', 'taxi', 'bike', 'flights', 'hotel', 'bars', 'games', 'music', 'books',
  'sports', 'hobbies',
  'freelance', 'investments', 'refunds', 'gifts-received', 'cash', 'transfer', 'business',
  'electronics',
]

// Each icon's accessible name in the picker.
export const CATEGORY_ICON_LABELS = {
  utensils: 'Food & dining', groceries: 'Groceries', transport: 'Car', fuel: 'Fuel',
  housing: 'Housing', utilities: 'Utilities', shopping: 'Shopping', health: 'Health',
  entertainment: 'Entertainment', salary: 'Salary', travel: 'Travel', coffee: 'Coffee',
  fitness: 'Fitness', education: 'Education', gifts: 'Gifts', savings: 'Savings', other: 'Other',
  rent: 'Rent', phone: 'Phone', internet: 'Internet', insurance: 'Insurance', taxes: 'Taxes',
  'bank-fees': 'Bank fees', streaming: 'Subscriptions & streaming', water: 'Water',
  electricity: 'Electricity',
  parking: 'Parking', bus: 'Public transport', taxi: 'Taxi', bike: 'Bike', flights: 'Flights',
  hotel: 'Hotel', bars: 'Bars & drinks', games: 'Games', music: 'Music', books: 'Books',
  sports: 'Sports', hobbies: 'Hobbies',
  freelance: 'Freelance', investments: 'Investments', refunds: 'Refunds',
  'gifts-received': 'Gifts received', cash: 'Cash withdrawal', transfer: 'Savings transfer',
  business: 'Business expenses', electronics: 'Electronics',
}

// The icon picker's labelled sections; every key sits in exactly one.
export const CATEGORY_ICON_GROUPS = [
  {
    label: 'Everyday',
    keys: ['utensils', 'groceries', 'coffee', 'shopping', 'health', 'fitness', 'education',
      'gifts', 'entertainment', 'other'],
  },
  {
    label: 'Home & bills',
    keys: ['housing', 'rent', 'utilities', 'electricity', 'water', 'internet', 'phone',
      'streaming', 'insurance', 'taxes', 'bank-fees'],
  },
  {
    label: 'Getting around & leisure',
    keys: ['transport', 'fuel', 'parking', 'bus', 'taxi', 'bike', 'travel', 'flights', 'hotel',
      'bars', 'games', 'music', 'books', 'sports', 'hobbies'],
  },
  {
    label: 'Money & work',
    keys: ['salary', 'freelance', 'business', 'electronics', 'savings', 'transfer',
      'investments', 'refunds', 'gifts-received', 'cash'],
  },
]

// A category without a stored icon (or with a legacy value) shows the icon
// its name suggests. Most specific first: "Taxi" must not read as "Taxes",
// "Public transport" not as a car, "Gifts received" not as "Gifts".
const NAME_HINTS = [
  [/fuel|petrol|diesel|gas station/i, 'fuel'],
  [/parking/i, 'parking'],
  [/taxi|uber|lyft|bolt|\bcab\b/i, 'taxi'],
  [/\bbus\b|train|metro|tram|subway|public transport|transit/i, 'bus'],
  [/bike|bicycle|cycling|scooter/i, 'bike'],
  [/flight|airline/i, 'flights'],
  [/hotel|airbnb|hostel|accommodation|lodging/i, 'hotel'],
  [/food|dining|restaurant|eat/i, 'utensils'],
  [/\bbars?\b|\bpubs?\b|drinks|alcohol|wine|beer/i, 'bars'],
  [/grocery|groceries|market/i, 'groceries'],
  [/transport|\bcars?\b|\bgas\b/i, 'transport'],
  [/\brent\b/i, 'rent'],
  [/hous|mortgage/i, 'housing'],
  [/insurance/i, 'insurance'],
  [/\btax/i, 'taxes'],
  [/bank|\bfees?\b|charges/i, 'bank-fees'],
  [/music|concert|spotify/i, 'music'],
  [/stream|netflix|subscription|disney/i, 'streaming'],
  [/water/i, 'water'],
  [/electric|power/i, 'electricity'],
  [/internet|wifi|broadband/i, 'internet'],
  [/phone|mobile/i, 'phone'],
  [/util|bills?\b|heating/i, 'utilities'],
  [/electronic|gadget|computer|laptop/i, 'electronics'],
  [/shop/i, 'shopping'],
  [/health|medical|pharmacy|doctor/i, 'health'],
  [/game|gaming/i, 'games'],
  [/book|kindle/i, 'books'],
  [/sport|football|tennis|golf|\bski/i, 'sports'],
  [/hobb|craft|photograph/i, 'hobbies'],
  [/entertain|movie|cinema|film|theat/i, 'entertainment'],
  [/freelance|side gig/i, 'freelance'],
  [/business|office/i, 'business'],
  [/salary|income|wage|payroll|paycheck|payday|\bpay\b/i, 'salary'],
  [/travel|holiday|vacation|trip/i, 'travel'],
  [/coffee|cafe/i, 'coffee'],
  [/gym|fitness/i, 'fitness'],
  [/educat|school|course|tuition/i, 'education'],
  [/gifts? received|gift income/i, 'gifts-received'],
  [/gift|present/i, 'gifts'],
  [/refund|reimburs|cashback/i, 'refunds'],
  [/\bcash\b|\batm\b|withdraw/i, 'cash'],
  [/transfer/i, 'transfer'],
  [/invest|stock|crypto|dividend/i, 'investments'],
  [/saving/i, 'savings'],
]

// The icon key a category shows: its stored key when it's a known one, else
// the one its name suggests, else 'other'. Takes a row or a plain name.
export function categoryIconKey(catOrName) {
  const stored = typeof catOrName === 'string' ? null : catOrName?.icon
  if (stored && CATEGORY_ICON_KEYS.includes(stored)) return stored
  const name = typeof catOrName === 'string' ? catOrName : catOrName?.name ?? ''
  for (const [re, key] of NAME_HINTS) if (re.test(name)) return key
  return 'other'
}

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
