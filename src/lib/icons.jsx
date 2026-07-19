// Central Lucide icon registry. Category rows store a stable icon *key*
// (e.g. "utensils") in categories.icon; we map that key to a Lucide component
// here. Falls back to a name heuristic, then a generic icon — so user-created
// categories (or legacy emoji values) still render something sensible.

import {
  Utensils, ShoppingCart, Car, Home, Lightbulb, ShoppingBag, HeartPulse,
  Clapperboard, Briefcase, Tag, Plane, Coffee, Dumbbell, GraduationCap,
  Gift, PiggyBank, Wallet, Receipt, CircleDollarSign,
} from 'lucide-react'

export const CATEGORY_ICONS = {
  utensils: Utensils,
  groceries: ShoppingCart,
  transport: Car,
  housing: Home,
  utilities: Lightbulb,
  shopping: ShoppingBag,
  health: HeartPulse,
  entertainment: Clapperboard,
  salary: Briefcase,
  travel: Plane,
  coffee: Coffee,
  fitness: Dumbbell,
  education: GraduationCap,
  gifts: Gift,
  savings: PiggyBank,
  other: Tag,
}

const NAME_HINTS = [
  [/food|dining|restaurant|eat/i, Utensils],
  [/grocery|groceries|market/i, ShoppingCart],
  [/transport|car|fuel|gas|uber|taxi/i, Car],
  [/hous|rent|mortgage/i, Home],
  [/util|electric|water|internet|phone/i, Lightbulb],
  [/shop/i, ShoppingBag],
  [/health|medical|pharmacy|doctor/i, HeartPulse],
  [/entertain|movie|game|music/i, Clapperboard],
  [/salary|income|pay|wage/i, Briefcase],
  [/travel|flight|hotel/i, Plane],
  [/coffee|cafe/i, Coffee],
  [/gym|fitness|sport/i, Dumbbell],
  [/educat|school|course|book/i, GraduationCap],
  [/gift|present/i, Gift],
  [/saving|invest/i, PiggyBank],
]

// Returns a Lucide component for a category row (or a plain name string).
export function categoryIcon(catOrName) {
  const key = typeof catOrName === 'string' ? null : catOrName?.icon
  const name = typeof catOrName === 'string' ? catOrName : catOrName?.name ?? ''
  if (key && CATEGORY_ICONS[key]) return CATEGORY_ICONS[key]
  for (const [re, Icon] of NAME_HINTS) if (re.test(name)) return Icon
  return Tag
}

export { Wallet, Receipt, CircleDollarSign }
