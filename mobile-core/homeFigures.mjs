// Home's figures as the web's Dashboard.jsx works them out, in one function,
// for the native app's parity fixture:
//   npm run ios:fixture   →  ios/Budgeer/BudgeerTests/Fixtures/home.json
// The fixture holds the inputs (transaction rows as my_transactions returns
// them, the profile, the savings categories, "now") and the figures the web's
// functions give for them, in English and in Greek. The Swift test
// (HomeParityTests) runs the same inputs through BudgeerCore and must get the
// same figures; test/iosHome.test.js keeps the committed fixture equal to
// what these functions give today.
//
// Every step below is the web's own module, called in Dashboard.jsx's order;
// the app's HomeFigures.swift makes the same calls through the core, one by
// one, and only carries the answers from one call to the next.
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { thisMonthPeriod } from '../src/shared/lib/periods.js'
import { salaryShiftOf, shiftFetchFrom } from '../src/shared/lib/salaryShift.js'
import { savingsIdsOf } from '../src/shared/lib/savings.js'
import { spendRows } from '../src/shared/lib/spread.js'
import { periodTotals, periodProjection, projectedTotals, savingsLine } from '../src/features/dashboard/dashboardMath.js'
import { categoryBars } from '../supabase/functions/_shared/breakdown.ts'
import { bucketLabel, bucketLabels } from '../src/shared/lib/txnRollup.js'
import { formatMoney, formatSigned } from '../src/shared/lib/currency.js'
import { signTone } from '../src/shared/ui/kit/kitMath.js'
import { isoDate } from '../src/shared/lib/dates.js'
import { setLanguage } from './index.js'

export const FIXTURE_FILE = 'ios/Budgeer/BudgeerTests/Fixtures/home.json'

// categoryBars takes `top` (the web passes Infinity: Home folds nothing); JSON
// can't carry Infinity, so the app and this fixture pass a number no list
// reaches. The same constant lives in HomeFigures.swift.
export const NO_FOLD = 1_000_000

// The figures for this month from the rows my_transactions returned for
// [fetchFrom, to] with p_spread (no recurring rules yet: the projection is
// empty, as on a web account with none).
export function homeFigures({ rows, profile, categories, now, lang = 'en' }) {
  setLanguage(lang)
  const date = new Date(now)
  const period = thisMonthPeriod(date)
  const baseCurrency = profile?.base_currency || 'EUR'
  const separateYearly = !!profile?.yearly_separate
  const salaryShift = salaryShiftOf(profile)
  const savingsIds = savingsIdsOf(categories)
  const spend = spendRows(rows, baseCurrency, period.from, period.to, { separateYearly, salaryShift })
  const totals = periodTotals(spend, baseCurrency, savingsIds)
  const proj = periodProjection([], { from: period.from, to: period.to }, isoDate(date), separateYearly, salaryShift, savingsIds)
  const figures = projectedTotals(totals, proj)
  const labels = bucketLabels([...totals.bucketRow.values()])
  const bars = categoryBars(totals.byCategory, NO_FOLD).map((c) => ({
    name: c.name, label: bucketLabel(c, labels), value: c.value, share: c.share, ratio: c.ratio,
    amount: formatMoney(c.value, baseCurrency),
  }))
  return {
    period: { value: period.value, from: period.from, to: period.to, label: period.label },
    fetchFrom: shiftFetchFrom(period.from, salaryShift) ?? period.from,
    spentTotal: figures.spentTotal,
    earnedTotal: figures.earnedTotal,
    netTotal: figures.netTotal,
    spent: formatMoney(figures.spentTotal, baseCurrency),
    income: formatMoney(figures.earnedTotal, baseCurrency),
    // The web's kitMath.signedAmount(net, formatMoney): a plus above zero, a
    // true minus below, and the tone that colours it.
    net: formatSigned(figures.netTotal, baseCurrency, { plus: true }),
    netTone: signTone(figures.netTotal),
    saved: savingsLine(totals.saved, figures.fromSavingsTotal, period, baseCurrency),
    bars,
  }
}

// The fixture's inputs: a September 2026 with a shifted salary from late
// August, a savings entry taken from income, an expense paid from savings, a
// mirrored group expense, a foreign-currency lunch and a yearly subscription
// paid in March (spread over the year). Fake data.
const SALARY = '11111111-1111-4111-8111-111111111111'
const SAVINGS = '22222222-2222-4222-8222-222222222222'
const cat = (id, name, kind = 'expense', extra = {}) => ({ id, name, kind, icon: null, color: null, ...extra })
const GROCERIES = cat('33333333-3333-4333-8333-333333333333', 'Groceries')
const EATING = cat('44444444-4444-4444-8444-444444444444', 'Eating out')
const TRANSPORT = cat('55555555-5555-4555-8555-555555555555', 'Transport')
const SUBS = cat('66666666-6666-4666-8666-666666666666', 'Subscriptions')
const txn = (id, spent_at, kind, amount_minor, categories, extra = {}) => ({
  id, spent_at, kind, amount_minor, currency: 'EUR', exchange_rate: 1, category_id: categories?.id ?? null,
  categories, description: null, notes: null, group_expense_id: null, group_expenses: null,
  paid_from_savings: false, paid_with_vouchers: false, savings_from_income: null, spread_months: null, ...extra,
})
export const FIXTURE_INPUT = {
  now: '2026-09-15T10:00:00.000Z',
  profile: { base_currency: 'EUR', yearly_separate: false, salary_shift_from_day: 25, salary_category_id: SALARY },
  categories: [
    { id: SAVINGS, kind: 'income', is_savings: true },
  ],
  rows: [
    txn('a1', '2026-09-14', 'expense', 4250, GROCERIES),
    txn('a2', '2026-09-12', 'expense', 1899, GROCERIES),
    txn('a3', '2026-09-10', 'expense', 3600, EATING),
    txn('a4', '2026-09-09', 'expense', 2500, EATING, { currency: 'USD', exchange_rate: 0.9123 }),
    txn('a5', '2026-09-05', 'expense', 4900, TRANSPORT),
    txn('a6', '2026-09-03', 'expense', 12000, null, { paid_from_savings: true }),
    txn('a7', '2026-09-02', 'income', 30000, cat(SAVINGS, 'Savings', 'income'), { savings_from_income: true }),
    txn('a8', '2026-09-01', 'income', 5000, cat('77777777-7777-4777-8777-777777777777', 'Refunds', 'income')),
    txn('a9', '2026-08-27', 'income', 250000, cat(SALARY, 'Salary', 'income')),
    txn('b1', '2026-09-08', 'expense', 2200, EATING, {
      group_expense_id: 'g1', group_expenses: { groups: { name: 'Lisbon trip' } },
    }),
    txn('b2', '2026-03-15', 'expense', 9600, SUBS, { spread_months: 12 }),
  ],
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const expected = { en: homeFigures(FIXTURE_INPUT), el: homeFigures({ ...FIXTURE_INPUT, lang: 'el' }) }
  const out = resolve(root, FIXTURE_FILE)
  await writeFile(out, JSON.stringify({ input: FIXTURE_INPUT, expected }, null, 2) + '\n')
  console.log(`home fixture: ${FIXTURE_FILE}`)
}
