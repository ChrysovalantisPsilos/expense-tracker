// The native app's screens as the web's functions work them out, for its
// parity fixtures (as homeFigures.mjs is for Home):
//   npm run ios:fixture   →  ios/Budgeer/BudgeerTests/Fixtures/<screen>.json
// Each fixture holds a screen's inputs (rows as the RPCs return them, the
// profile, the categories, "now", the screen's choices) and what the web's
// functions give for them, in English and in Greek. The Swift tests run the
// same inputs through the app's figures (LedgerFigures.swift, …), every
// step a core call, and must get the same; test/iosScreens.test.js keeps the
// committed files equal to what the web gives today.
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { salaryShiftOf } from '../src/shared/lib/salaryShift.js'
import { savingsIdsOf } from '../src/shared/lib/savings.js'
import { EMPTY_FILTERS, filterTransactions, isFiltering, netBaseMinor } from '../src/features/transactions/txnFilter.js'
import { isFirstRun, ledgerSummary, listHeading } from '../src/features/transactions/listHeading.js'
import { listParts } from '../src/features/transactions/rowParts.js'
import { pageCount, pageSlice } from '../src/shared/lib/paginate.js'
import { t } from '../src/shared/lib/i18n/i18n.js'
import { thisMonthPeriod } from '../src/shared/lib/periods.js'
import { isoDate, monthTitle } from '../src/shared/lib/dates.js'
import { spendRows } from '../src/shared/lib/spread.js'
import {
  budgetRowParts, budgetWindow, canCopyBudgets, capsInMonth, carriedFrom, carriedLabel, monthSets, periodBudgets,
  previousPeriod,
} from '../src/features/budgets/budgetMath.js'
import { setLanguage } from './index.js'

export const FIXTURES_DIR = 'ios/Budgeer/BudgeerTests/Fixtures'

// Rows a page of the app's Transactions list (LedgerFigures.pageSize), with
// the web's Paginator ("2 of 5") under it.
export const LEDGER_PAGE = 20

// The Transactions page (LedgerPage + TransactionList) for `kind`
// ('expense' | 'income' | null for all), a period from the picker, and the
// search text: its heading, its line, whether it's the first run, and page
// `page` of the rows as the list shows them.
export function ledgerFigures({ rows, profile, categories, kind = null, period, text = '', oldest = null, page = 1, lang = 'en' }) {
  setLanguage(lang)
  const baseCurrency = profile?.base_currency || 'EUR'
  const salaryShift = salaryShiftOf(profile)
  const savingsIds = savingsIdsOf(categories)
  const searching = isFiltering(text, EMPTY_FILTERS)
  const shown = searching ? filterTransactions(rows, { text, ...EMPTY_FILTERS }, baseCurrency) : rows
  const net = netBaseMinor(shown, baseCurrency, savingsIds)
  const head = listHeading({ kind, periodLabel: period.label, count: shown.length, searching })
  const pages = pageCount(shown.length, LEDGER_PAGE)
  return {
    title: head.title,
    subtitle: ledgerSummary(head.subtitle, { searching, count: shown.length, net, baseCurrency }),
    firstRun: isFirstRun({ loading: false, failed: false, count: shown.length, oldest, searching }),
    pages,
    position: t('common:paginator.position', { page, pages }),
    rows: listParts(pageSlice(shown, page, LEDGER_PAGE), { kind, baseCurrency, salaryShift, savingsIds }),
  }
}

// The Budgets page (Budgets.jsx + useBudgetProgress) for this month: the
// month it sets caps for, its heading, where its caps were carried over
// from, whether "Copy last month's" is offered, and each budget's row.
//   budgets   my_budgets(this month)       previous  my_budgets(last month)
//   rows      my_transactions(expense, the month, p_spread)
export function budgetFigures({ profile, budgets, previous, rows, now, lang = 'en' }) {
  setLanguage(lang)
  const date = new Date(now)
  const baseCurrency = profile?.base_currency || 'EUR'
  const span = budgetWindow(thisMonthPeriod(date), isoDate(date))
  const sets = monthSets(budgets)
  const spend = spendRows(rows, baseCurrency, span.from, span.to, { separateYearly: !!profile?.yearly_separate })
  const { items } = periodBudgets({ sets, span, spend, baseCurrency })
  const carried = carriedFrom(capsInMonth(sets, span.first), span.first)
  return {
    periodStart: span.last,
    previousPeriod: previousPeriod(span.last),
    fetchFrom: span.from,
    fetchTo: span.to,
    heading: monthTitle(date),
    subtitle: carried ? carriedLabel(carried, span.last) : null,
    canCopy: canCopyBudgets(carried, previous.length),
    items: items.map((item) => budgetRowParts(item, baseCurrency)),
  }
}

// ---- The fixtures' inputs (fake data) ---------------------------------------
const SALARY = '11111111-1111-4111-8111-111111111111'
const SAVINGS = '22222222-2222-4222-8222-222222222222'
const cat = (id, name, kind = 'expense', extra = {}) => ({ id, name, kind, icon: null, color: null, ...extra })
const GROCERIES = cat('33333333-3333-4333-8333-333333333333', 'Groceries', 'expense', { default_key: 'groceries' })
const EATING = cat('44444444-4444-4444-8444-444444444444', 'Eating out', 'expense', { color: 'teal' })
const SUBS = cat('66666666-6666-4666-8666-666666666666', 'Subscriptions')
const PAY = cat(SALARY, 'Salary', 'income', { default_key: 'salary' })
const txn = (id, spent_at, kind, amount_minor, categories, extra = {}) => ({
  id, spent_at, kind, amount_minor, currency: 'EUR', exchange_rate: 1, category_id: categories?.id ?? null,
  categories, description: null, notes: null, group_expense_id: null, group_expenses: null, recurring: null,
  paid_from_savings: false, paid_with_vouchers: false, savings_from_income: null, spread_months: null, ...extra,
})

const PROFILE = { base_currency: 'EUR', yearly_separate: false, salary_shift_from_day: 25, salary_category_id: SALARY }
const SAVINGS_CATEGORIES = [{ id: SAVINGS, kind: 'income', is_savings: true }]
// A period as the picker gives it; its label per language (the picker's own
// words come from periods.js, checked by its own tests).
const SEPTEMBER = {
  value: 'm:2020-9', from: '2020-09-01', to: '2020-09-30', labels: { en: 'September 2020', el: 'Σεπτέμβριος 2020' },
}
const LEDGER_ROWS = [
  txn('a1', '2020-09-14', 'expense', 4250, GROCERIES, { description: 'Market', notes: 'weekly shop' }),
  txn('a2', '2020-09-12', 'expense', 1899, GROCERIES),
  txn('a3', '2020-09-10', 'expense', 3600, EATING),
  txn('a4', '2020-09-09', 'expense', 2500, EATING, { currency: 'USD', exchange_rate: 0.9123, description: 'Diner' }),
  txn('a5', '2020-09-08', 'expense', 2200, EATING, { group_expense_id: 'g1', group_expenses: { groups: { name: 'Lisbon trip' } } }),
  txn('a6', '2020-09-05', 'expense', 1299, SUBS, { description: 'Music', recurring: { frequency: 'monthly', interval_n: 1, is_active: true } }),
  txn('a7', '2020-09-03', 'expense', 12000, null, { paid_from_savings: true, description: 'New bike' }),
  txn('a8', '2020-09-02', 'income', 30000, cat(SAVINGS, 'Savings', 'income'), { savings_from_income: true }),
  txn('a9', '2020-09-01', 'expense', 9600, SUBS, { description: 'Cloud storage', spread_months: 12 }),
  txn('b1', '2020-08-27', 'income', 250000, PAY),
]

export const LEDGER_INPUT = {
  now: '2020-09-15T10:00:00.000Z',
  profile: PROFILE,
  categories: SAVINGS_CATEGORIES,
  rows: LEDGER_ROWS,
  oldest: '2020-03-15',
  views: [
    { name: 'all', kind: null, period: SEPTEMBER, text: '' },
    { name: 'expenses', kind: 'expense', period: SEPTEMBER, text: '' },
    { name: 'search', kind: null, period: SEPTEMBER, text: 'music' },
  ],
}

// The ledger fixture: each view in both languages, as my_transactions would
// answer it (a kind filtered on the server).
export function ledgerFixture() {
  const expected = {}
  for (const lang of ['en', 'el']) {
    expected[lang] = {}
    for (const view of LEDGER_INPUT.views) {
      const period = { ...view.period, label: view.period.labels[lang] }
      // The server filters by kind (my_transactions' p_kind).
      const rows = view.kind ? LEDGER_INPUT.rows.filter((r) => r.kind === view.kind) : LEDGER_INPUT.rows
      expected[lang][view.name] = ledgerFigures({ ...LEDGER_INPUT, ...view, rows, period, lang })
    }
  }
  setLanguage('en')
  return { input: LEDGER_INPUT, expected }
}

const budget = (category, amount_minor, period_start) => ({
  category_id: category.id, amount_minor, currency: 'EUR', period_start, categories: category,
})
const BUDGET_ROWS = [
  txn('c1', '2020-09-14', 'expense', 31240, GROCERIES),
  txn('c2', '2020-09-10', 'expense', 2500, EATING, { currency: 'USD', exchange_rate: 0.9123 }),
  txn('c3', '2020-09-09', 'expense', 9000, EATING),
  txn('c4', '2020-03-15', 'expense', 9600, SUBS, { spread_months: 12 }),
]
export const BUDGETS_INPUT = {
  now: '2020-09-15T10:00:00.000Z',
  profile: PROFILE,
  rows: BUDGET_ROWS,
  views: [
    {
      name: 'own',
      budgets: [budget(GROCERIES, 40000, '2020-09-01'), budget(EATING, 10000, '2020-09-01'), budget(SUBS, 2000, '2020-09-01')],
      previous: [budget(GROCERIES, 35000, '2020-08-01')],
    },
    {
      name: 'carried',
      budgets: [budget(GROCERIES, 35000, '2020-08-01'), budget(EATING, 12000, '2020-08-01')],
      previous: [budget(GROCERIES, 35000, '2020-08-01'), budget(EATING, 12000, '2020-08-01')],
    },
  ],
}

export function budgetsFixture() {
  const expected = {}
  for (const lang of ['en', 'el']) {
    expected[lang] = {}
    for (const view of BUDGETS_INPUT.views) expected[lang][view.name] = budgetFigures({ ...BUDGETS_INPUT, ...view, lang })
  }
  setLanguage('en')
  return { input: BUDGETS_INPUT, expected }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const out = resolve(root, FIXTURES_DIR, 'ledger.json')
  await writeFile(out, JSON.stringify(ledgerFixture(), null, 2) + '\n')
  console.log(`ledger fixture: ${FIXTURES_DIR}/ledger.json`)
  await writeFile(resolve(root, FIXTURES_DIR, 'budgets.json'), JSON.stringify(budgetsFixture(), null, 2) + '\n')
  console.log(`budgets fixture: ${FIXTURES_DIR}/budgets.json`)
}
