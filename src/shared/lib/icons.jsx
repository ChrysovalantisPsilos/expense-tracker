// Central Lucide icon registry. Category rows store a stable icon *key*
// (e.g. "utensils") in categories.icon; we map that key to a Lucide component
// here. A missing or unknown key falls back to the icon the category's name
// suggests (categoryIconKey's name hints), then a generic tag — so
// user-created categories (or legacy emoji values) still render something
// sensible.

import {
  Utensils, ShoppingCart, Car, Fuel, Home, Lightbulb, ShoppingBag, HeartPulse,
  Clapperboard, Briefcase, Tag, Plane, Coffee, Dumbbell, GraduationCap,
  Gift, PiggyBank,
  KeyRound, Smartphone, Wifi, ShieldCheck, Landmark, Percent, Tv, Droplet, Zap,
  SquareParking, Bus, CarTaxiFront, Bike, PlaneTakeoff, BedDouble, Wine, Gamepad2, Music,
  BookOpen, Volleyball, Palette,
  Laptop, TrendingUp, Undo2, HandHeart, Banknote, ArrowRightLeft, BriefcaseBusiness, Headphones,
} from 'lucide-react'
import { categoryIconKey } from './categoryStyle.js'

const CATEGORY_ICONS = {
  utensils: Utensils,
  groceries: ShoppingCart,
  transport: Car,
  fuel: Fuel,
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
  rent: KeyRound,
  phone: Smartphone,
  internet: Wifi,
  insurance: ShieldCheck,
  taxes: Landmark,
  'bank-fees': Percent,
  streaming: Tv,
  water: Droplet,
  electricity: Zap,
  parking: SquareParking,
  bus: Bus,
  taxi: CarTaxiFront,
  bike: Bike,
  flights: PlaneTakeoff,
  hotel: BedDouble,
  bars: Wine,
  games: Gamepad2,
  music: Music,
  books: BookOpen,
  sports: Volleyball,
  hobbies: Palette,
  freelance: Laptop,
  investments: TrendingUp,
  refunds: Undo2,
  'gifts-received': HandHeart,
  cash: Banknote,
  transfer: ArrowRightLeft,
  business: BriefcaseBusiness,
  electronics: Headphones,
}

// Returns a Lucide component for a category row (or a plain name string).
export function categoryIcon(catOrName) {
  return CATEGORY_ICONS[categoryIconKey(catOrName)] ?? Tag
}
