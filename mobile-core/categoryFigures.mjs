// A category's page as the web's CategoryPage.jsx works it out, for the
// native app's parity fixture (as screenFigures.mjs is for the other screens):
//   npm run ios:fixture   →  ios/Budgeer/BudgeerTests/Fixtures/category.json
// The fixture holds the inputs (every category, the profile, the rows
// my_transactions returns for the category and the period, the month's
// budgets, "now", the category and the period picked) and what the web's
// functions give for them, in English and in Greek. The Swift test runs the
// same inputs through CategoryPageFigures.swift, every step a core call, and
// must get the same; test/iosCategory.test.js keeps the committed file equal
// to what the web gives today.
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMonthPeriod, periodFromValue, periodMonth, thisMonthPeriod } from '../src/shared/lib/periods.js'
import { isoDate } from '../src/shared/lib/dates.js'
import { payCalendar, salaryShiftOf } from '../src/shared/lib/payCalendar.js'
import { savingsIdsOf } from '../src/shared/lib/savings.js'
import { formatMoney, minorToInput } from '../src/shared/lib/currency.js'
import { categoryLook } from '../src/shared/lib/categoryStyle.js'
import { NO_CATEGORY } from '../src/shared/lib/categoryName.js'
import { categoryBudget, categoryPageHead, categoryPeriod } from '../src/features/categories/categoryMath.js'
import { listHeading } from '../src/features/transactions/listHeading.js'
import { listParts } from '../src/features/transactions/rowParts.js'
import { t } from '../src/shared/lib/i18n/i18n.js'
import { setLanguage } from './index.js'

export const FIXTURE_FILE = 'ios/Budgeer/BudgeerTests/Fixtures/category.json'

// The page for `categoryId` (a category's id or NO_CATEGORY) and a picker
// value (null: this month). `categories` are every category (archived
// included, as useAllCategories reads them); `budgets` my_budgets' rows for
// the month shown (this month for a longer period). `payDays` are
// my_pay_calendar's dates (pay months with the salary setting on).
export function categoryPageFigures({
  profile, categories, rows, budgets, categoryId, periodValue = null, payDays = [], now, lang = 'en',
}) {
  setLanguage(lang)
  const date = new Date(now)
  const cal = payCalendar(salaryShiftOf(profile), payDays, isoDate(date))
  const period = (periodValue && periodFromValue(periodValue, date, cal)) || thisMonthPeriod(date, cal)
  const uncategorised = categoryId === NO_CATEGORY
  const category = uncategorised ? null : categories.find((c) => c.id === categoryId) ?? null
  if (!uncategorised && !category) {
    return { found: false, title: t('categories:page.notFound'), text: t('categories:page.notFoundText') }
  }
  const baseCurrency = profile?.base_currency || 'EUR'
  const separateYearly = !!profile?.yearly_separate
  const head = categoryPageHead(category, uncategorised)
  const { listed, total } = categoryPeriod(rows, {
    categoryId, from: period.from, to: period.to, baseCurrency, separateYearly, cal,
  })
  const list = listHeading({
    kind: head.kind ?? 'expense', savings: !!category?.is_savings, periodLabel: period.label, count: listed.length,
  })
  // Budgets are monthly and expense-only, keyed by the month's label
  // (periodMonth); only this month's cap can change.
  const thisMonth = periodMonth(thisMonthPeriod(date, cal))
  const month = isMonthPeriod(period)
  const hasBudgets = !uncategorised && head.kind === 'expense'
  const budget = hasBudgets && month ? budgets.find((b) => b.category_id === categoryId) ?? null : null
  const canEditBudget = hasBudgets && periodMonth(period) === thisMonth
  const budgetMinor = budget?.amount_minor ?? null
  return {
    found: true,
    period: {
      value: period.value, key: period.key ?? null, from: period.from, to: period.to, label: period.label,
      range: period.range ?? null, open: period.open ?? null,
    },
    // The month whose budgets the page reads (this month for a longer period).
    budgetMonth: month ? periodMonth(period) : thisMonth,
    kind: head.kind,
    name: head.name,
    eyebrow: head.eyebrow,
    look: categoryLook(category ?? '', head.kind),
    editable: !!category,
    archived: !!category?.is_archived,
    totalLabel: head.totalLabel,
    total: formatMoney(total, baseCurrency),
    budget: hasBudgets ? categoryBudget({ budget, spent: total, month, canEdit: canEditBudget, period, baseCurrency }) : null,
    canEditBudget,
    budgetMinor,
    budgetInput: budgetMinor == null ? '' : minorToInput(budgetMinor, baseCurrency),
    budgetHelp: t(budgetMinor == null ? 'categories:page.budgetNew' : 'categories:page.budgetChange'),
    listTitle: list.title,
    listSubtitle: list.subtitle,
    rows: listParts(listed, { kind: head.kind, baseCurrency, savingsIds: savingsIdsOf(categories) }),
  }
}

// ---- The fixture's inputs (fake data) ---------------------------------------
const GROCERIES = '33333333-3333-4333-8333-333333333333'
const PAY = '11111111-1111-4111-8111-111111111111'
const POT = '22222222-2222-4222-8222-222222222222'
const OLD = '77777777-7777-4777-8777-777777777777'
const cat = (id, name, kind, extra = {}) => ({
  id, name, kind, icon: null, color: null, is_archived: false, is_savings: false, default_key: null, ...extra,
})
const CATEGORIES = [
  cat(GROCERIES, 'Groceries', 'expense', { default_key: 'groceries', color: 'teal' }),
  cat(PAY, 'Salary', 'income', { default_key: 'salary' }),
  cat(POT, 'Savings', 'income', { default_key: 'savings', is_savings: true }),
  cat(OLD, 'Gym', 'expense', { is_archived: true }),
]
const byId = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]))
const txn = (id, spent_at, kind, amount_minor, categoryId, extra = {}) => ({
  id, spent_at, kind, amount_minor, currency: 'EUR', exchange_rate: 1, category_id: categoryId,
  categories: categoryId ? byId[categoryId] : null, description: null, notes: null, group_expense_id: null,
  group_expenses: null, recurring: null, paid_from_savings: false, paid_with_vouchers: false,
  savings_from_income: null, spread_months: null, ...extra,
})
export const CATEGORY_INPUT = {
  now: '2020-09-15T10:00:00.000Z',
  profile: { base_currency: 'EUR', yearly_separate: false, salary_shift_from_day: 25, salary_category_id: PAY },
  categories: CATEGORIES,
  // my_pay_calendar's dates: September runs from 28 August.
  payDays: ['2020-07-28', '2020-08-28'],
  views: [
    {
      // This month, a cap carried over from August.
      name: 'groceries', categoryId: GROCERIES, periodValue: null,
      rows: [
        txn('g1', '2020-09-14', 'expense', 4250, GROCERIES, { description: 'Market', notes: 'weekly shop' }),
        txn('g0', '2020-08-30', 'expense', 1500, GROCERIES, { description: 'After payday' }),
        txn('g2', '2020-09-10', 'expense', 1899, GROCERIES),
        txn('g3', '2020-09-02', 'expense', 2500, GROCERIES, { currency: 'USD', exchange_rate: 0.9123 }),
      ],
      budgets: [{ category_id: GROCERIES, amount_minor: 10000, currency: 'EUR', period_start: '2020-08-01' }],
    },
    {
      // A past month without a cap: nothing to set there.
      name: 'pastMonth', categoryId: GROCERIES, periodValue: 'm:2020-8',
      rows: [txn('g4', '2020-08-20', 'expense', 6400, GROCERIES)],
      budgets: [],
    },
    {
      // This year: budgets are monthly.
      name: 'year', categoryId: GROCERIES, periodValue: 'y:2020',
      rows: [txn('g1', '2020-09-14', 'expense', 4250, GROCERIES), txn('g4', '2020-08-20', 'expense', 6400, GROCERIES)],
      budgets: [],
    },
    {
      // An income category: its pay, no budget line.
      name: 'salary', categoryId: PAY, periodValue: null,
      rows: [txn('p1', '2020-09-01', 'income', 250000, PAY)],
      budgets: [],
    },
    {
      // A savings category: what was saved.
      name: 'savings', categoryId: POT, periodValue: null,
      rows: [txn('s1', '2020-09-02', 'income', 30000, POT, { savings_from_income: true })],
      budgets: [],
    },
    {
      // The uncategorised bucket: personal entries without a category.
      name: 'none', categoryId: NO_CATEGORY, periodValue: null,
      rows: [
        txn('n1', '2020-09-11', 'expense', 90000, null, { description: 'Rent' }),
        txn('n2', '2020-09-08', 'expense', 2200, null, { group_expense_id: 'ge1', group_expenses: { groups: { name: 'Lisbon trip' } } }),
      ],
      budgets: [],
    },
    { name: 'archived', categoryId: OLD, periodValue: null, rows: [], budgets: [] },
    { name: 'missing', categoryId: '99999999-9999-4999-8999-999999999999', periodValue: null, rows: [], budgets: [] },
  ],
}

export function categoryFixture() {
  const expected = {}
  for (const lang of ['en', 'el']) {
    expected[lang] = {}
    for (const view of CATEGORY_INPUT.views) {
      expected[lang][view.name] = categoryPageFigures({ ...CATEGORY_INPUT, ...view, lang })
    }
  }
  setLanguage('en')
  return { input: CATEGORY_INPUT, expected }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const root = fileURLToPath(new URL('..', import.meta.url))
  await writeFile(resolve(root, FIXTURE_FILE), JSON.stringify(categoryFixture(), null, 2) + '\n')
  console.log(`category fixture: ${FIXTURE_FILE}`)
}
