// Pure, deterministic demo data for the marketing landing page.
// Computed with the app's real math (splitMath, currency) so the showcase can
// never drift from what the product actually does. All money is integer minor
// units; no clocks, no randomness, no network (fixed captured FX rates).
import { distributeByWeights, simplifyDebts, splitEqually } from '../groups/splitMath.js'
import { toBaseMinor, toMinor } from '../../shared/lib/currency.js'
import { budgetTone } from '../budgets/budgetMath.js'

export const DEMO_CURRENCY = 'EUR'

const MEMBERS = [
  { id: 'you', name: 'You' },
  { id: 'anna', name: 'Anna' },
  { id: 'marco', name: 'Marco' },
  { id: 'sofia', name: 'Sofia' },
]

const TRIP_EXPENSES = [
  { id: 'e1', label: 'Airbnb', paidBy: 'you', amount: 240 },
  { id: 'e2', label: 'Dinner at Time Out', paidBy: 'anna', amount: 86.4 },
  { id: 'e3', label: 'Taxi to Belém', paidBy: 'marco', amount: 18.6 },
  { id: 'e4', label: 'Pastéis de nata', paidBy: 'you', amount: 12 },
]

// Integer percent of `part` over `whole` (0 when whole is 0).
const percent = (part, whole) => (whole > 0 ? Math.round((part * 100) / whole) : 0)

// Group split for the hero card: steps[k] is the state after k+1 expenses,
// every expense split equally among all members.
export function buildTripDemo() {
  const nameOf = new Map(MEMBERS.map((m) => [m.id, m.name]))
  const expenses = TRIP_EXPENSES.map(({ amount, ...e }) => ({
    ...e,
    amountMinor: toMinor(amount, DEMO_CURRENCY),
  }))

  const net = new Map(MEMBERS.map((m) => [m.id, 0]))
  let totalMinor = 0
  const steps = expenses.map((e, k) => {
    totalMinor += e.amountMinor
    net.set(e.paidBy, net.get(e.paidBy) + e.amountMinor)
    splitEqually(e.amountMinor, MEMBERS.length).forEach((share, i) => {
      net.set(MEMBERS[i].id, net.get(MEMBERS[i].id) - share)
    })
    return {
      expenses: expenses.slice(0, k + 1),
      totalMinor,
      balances: MEMBERS.map((m) => ({ id: m.id, name: m.name, netMinor: net.get(m.id) })),
      settlements: simplifyDebts(net).map(({ from, to, amount }) => ({
        from,
        to,
        fromName: nameOf.get(from),
        toName: nameOf.get(to),
        amountMinor: amount,
      })),
    }
  })

  return {
    groupName: 'Lisbon weekend',
    currency: DEMO_CURRENCY,
    members: MEMBERS.map((m) => ({ ...m })),
    expenses,
    steps,
  }
}

// Monthly budgets vs. spend, in the app's order (most used first) and with the
// app's bar colours (budgetTone): Food & Dining is over its cap (red) and
// Groceries past 80% of it (amber).
export function budgetsDemo() {
  return [
    { category: 'Groceries', spent: 352, cap: 400 },
    { category: 'Food & Dining', spent: 186.9, cap: 150 },
    { category: 'Transport', spent: 64.2, cap: 120 },
    { category: 'Entertainment', spent: 48, cap: 80 },
  ].map(({ category, spent, cap }) => {
    const spentMinor = toMinor(spent, DEMO_CURRENCY)
    const capMinor = toMinor(cap, DEMO_CURRENCY)
    return {
      category, spentMinor, capMinor, pct: percent(spentMinor, capMinor), tone: budgetTone(spentMinor, capMinor),
    }
  }).sort((a, b) => b.spentMinor / b.capMinor - a.spentMinor / a.capMinor)
}

// One month by category (shares apportioned to sum to exactly 100) plus a
// 6-month spending trend.
export function insightsDemo() {
  const cats = [
    { category: 'Housing', amount: 950 },
    { category: 'Groceries', amount: 312.4 },
    { category: 'Food & Dining', amount: 186.9 },
    { category: 'Transport', amount: 64.2 },
    { category: 'Other', amount: 121.5 },
  ].map(({ category, amount }) => ({ category, minor: toMinor(amount, DEMO_CURRENCY) }))
  const shares = distributeByWeights(100, cats.map((c) => c.minor))

  const trend = [
    ['Apr', 1580.2], ['May', 1712.75], ['Jun', 1655.3],
    ['Jul', 1890.1], ['Aug', 1742.6], ['Sep', 1635],
  ].map(([month, amount]) => ({ month, minor: toMinor(amount, DEMO_CURRENCY) }))

  return {
    byCategory: cats.map((c, i) => ({ ...c, share: shares[i] })),
    trend,
  }
}

// Foreign-currency spend converted to EUR at the rate captured at entry time.
export function currencyDemo() {
  const rows = [
    { label: 'Train to London', currency: 'GBP', amount: 42.5, rate: 1.17 },
    { label: 'NYC hotel night', currency: 'USD', amount: 189, rate: 0.92 },
    { label: 'Ramen in Tokyo', currency: 'JPY', amount: 1800, rate: 0.0062 },
  ].map(({ label, currency, amount, rate }) => {
    const minor = toMinor(amount, currency)
    return { label, currency, minor, rate, baseMinor: toBaseMinor(minor, rate, currency, DEMO_CURRENCY) }
  })
  return {
    base: DEMO_CURRENCY,
    rows,
    totalBaseMinor: rows.reduce((sum, r) => sum + r.baseMinor, 0),
  }
}
