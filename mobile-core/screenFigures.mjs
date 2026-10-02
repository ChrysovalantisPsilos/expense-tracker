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
import { savingsIdsOf, savingsPotMinor, savingsTotal } from '../src/shared/lib/savings.js'
import { goalParts, savingsHistory, savingsMoves, savingsPage } from '../src/features/savings/savingsMath.js'
import { daysFor, nextTopUp, setupDraft, voucherHistory, voucherSummary } from '../src/features/vouchers/voucherMath.js'
import {
  countryOptions, daysFixParts, nextTopUpText, voucherHistoryParts, voucherPageParts,
} from '../src/features/vouchers/voucherText.js'
import { EMPTY_FILTERS, isFiltering, ledgerShown, netBaseMinor } from '../src/features/transactions/txnFilter.js'
import { isFirstRun, ledgerSummary, listHeading } from '../src/features/transactions/listHeading.js'
import { dayGroups, monthPulse } from '../src/features/transactions/rowParts.js'
import { isMonthPeriod, isPastPeriod, periodFromValue, thisMonthPeriod } from '../src/shared/lib/periods.js'
import { isoDate, lastMonths, monthTitle } from '../src/shared/lib/dates.js'
import { spendRows } from '../src/shared/lib/spread.js'
import {
  budgetRowParts, budgetWindow, canCopyBudgets, capsInMonth, carriedFrom, carriedLabel, monthSets, periodBudgets,
  previousPeriod, budgetSubtitle, budgetsEmpty, heldNote,
} from '../src/features/budgets/budgetMath.js'
import {
  groupTotalParts, incomePerMonth, incomeRules, incomeTotalParts, ruleRowParts, subscriptionGroups,
} from '../src/features/recurring/recurringMath.js'
import {
  buildTrend, hasTrendData, incomeFigures, pickedMonthLabel, spendingBars, spendingShares, foreignSpending, abroadCard,
  accountDraft, accountTypes, netWorthParts,
} from '../src/features/insights/insightsMath.js'
import { setPeriods } from '../src/features/budgets/budgetMath.js'
import {
  derivedSalary, derivedSavings, normalisePlan, rateNeeds, salaryCategoryId, setChange, upsertAdd, emptyPlan,
} from '../src/features/plan/planMath.js'
import {
  addDraft, addFormParts, applySheetParts, editorParts, pickParts, planPageParts, planReads, planState, whatIfParts,
} from '../src/features/plan/planPage.js'
import { whatIfRows } from '../src/features/plan/whatIfMath.js'
import { foreignCurrencies } from '../src/shared/lib/ruleFx.js'
import {
  bonusCategoryId, defaultCountry, monthOf, normaliseNotes, salaryReport,
} from '../src/features/salary/salaryMath.js'
import {
  bonusChoices, extrasParts, inflationParts, payChartParts, payHeadline, projectionParts, raisesParts, salaryCardParts,
  yearsParts,
} from '../src/features/salary/salaryText.js'
import { linkBuckets } from '../src/shared/lib/categoryLinks.js'
import { setLanguage } from './index.js'

export const FIXTURES_DIR = 'ios/Budgeer/BudgeerTests/Fixtures'

// Rows a page of the app's Transactions list (LedgerFigures.pageSize), with
// the web's Paginator ("2 of 5") under it.
// Activity (the web's LedgerPage + TransactionList) for `kind`
// ('expense' | 'income' | null for all), a period from the picker, and the
// search text: its heading, its line, whether it's the first run, and the
// rows by day as the native app lists them (dayGroups, as of `now`), and the
// month's header (monthPulse).
export function ledgerFigures({ rows, profile, categories, kind = null, period, text = '', oldest = null, now, lang = 'en' }) {
  setLanguage(lang)
  const baseCurrency = profile?.base_currency || 'EUR'
  const salaryShift = salaryShiftOf(profile)
  const savingsIds = savingsIdsOf(categories)
  const searching = isFiltering(text, EMPTY_FILTERS)
  const month = searching ? null : { from: period.from, to: period.to }
  const shown = ledgerShown(rows, { text, searching, month, salaryShift }, baseCurrency)
  const net = netBaseMinor(shown, baseCurrency, savingsIds)
  const head = listHeading({ kind, periodLabel: period.label, count: shown.length, searching })
  return {
    title: head.title,
    subtitle: ledgerSummary(head.subtitle, { searching, count: shown.length, net, baseCurrency }),
    firstRun: isFirstRun({ loading: false, failed: false, count: shown.length, oldest, searching }),
    days: dayGroups(shown, { kind, baseCurrency, salaryShift, savingsIds }, isoDate(new Date(now))),
    // The month's header: the picked month's days, none for a search.
    pulse: monthPulse(shown, { kind, baseCurrency, savingsIds, salaryShift }, month, isoDate(new Date(now))),
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

// Home's Budgets card (BudgetsCard + useBudgetProgress) for a period from
// the picker: its subtitle (the month's carried caps, or how many months a
// longer period had caps in), the empty state (Set a budget only while the
// period hasn't ended) and each budget's row.
//   sets  useBudgetSets' answer: monthSets(my_budgets(month)) for a month,
//         else { period, rows } for each month setPeriods names
//   rows  my_transactions(expense, the window, p_spread)
export function budgetCard({ profile, sets, rows, periodValue, now, lang = 'en' }) {
  setLanguage(lang)
  const date = new Date(now)
  const todayISO = isoDate(date)
  const period = (periodValue && periodFromValue(periodValue, date)) || thisMonthPeriod(date)
  const baseCurrency = profile?.base_currency || 'EUR'
  const span = budgetWindow(period, todayISO)
  const spend = spendRows(rows, baseCurrency, span.from, span.to, { separateYearly: !!profile?.yearly_separate })
  const { items, months } = periodBudgets({ sets, span, spend, baseCurrency })
  const carried = isMonthPeriod(period) ? carriedFrom(capsInMonth(sets, span.first), span.first) : null
  const empty = budgetsEmpty(period, !isPastPeriod(period, todayISO))
  const parts = items.map((item) => budgetRowParts(item, baseCurrency))
  return {
    subtitle: budgetSubtitle(period, { months, carried, periodStart: span.last }),
    empty: empty.text,
    canSet: empty.canSet,
    items: parts,
    held: heldNote(parts, period, todayISO),
  }
}

// The Recurring page (Recurring.jsx): the subscriptions by frequency, each
// group's headline and rules, and the Income tab's headline and rules.
// `rates` are today's rates of the rules' foreign currencies.
export function recurringFigures({ profile, categories, rules, rates, lang = 'en' }) {
  setLanguage(lang)
  const baseCurrency = profile?.base_currency || 'EUR'
  const options = { baseCurrency, rates, separateYearly: !!profile?.yearly_separate }
  const income = incomePerMonth(rules, savingsIdsOf(categories), baseCurrency, rates)
  return {
    groups: subscriptionGroups(rules, baseCurrency, { rates }).map((g) => ({
      key: g.key, label: g.label, total: groupTotalParts(g, baseCurrency),
      rows: g.rules.map((r) => ruleRowParts(r, options)),
    })),
    income: {
      total: incomeTotalParts(income, baseCurrency),
      rows: incomeRules(rules).map((r) => ruleRowParts(r, options)),
    },
  }
}

// The Insights page (Insights.jsx): the last six months' rows (with yearly
// payments spread and a late salary shifted), "Where your money went" for
// the picked month (this one by default), the six-month bars and "Income
// vs expenses" for this month.
export function insightsFigures({ profile, categories, rows, now, picked = null, lang = 'en' }) {
  setLanguage(lang)
  const date = new Date(now)
  const baseCurrency = profile?.base_currency || 'EUR'
  const months = lastMonths(6, date)
  const from = months[0].from
  const to = months[months.length - 1].to
  const spend = spendRows(rows, baseCurrency, from, to,
    { separateYearly: !!profile?.yearly_separate, salaryShift: salaryShiftOf(profile) })
  const trend = buildTrend(spend, months, baseCurrency, savingsIdsOf(categories))
  const index = picked ?? months.length - 1
  const monthLabel = pickedMonthLabel(months, index, date)
  return {
    fetchFrom: from,
    fetchTo: to,
    picked: index,
    monthLabel,
    // Each legend entry drills down to the month's expenses in it (linkBuckets), as Insights.jsx.
    shares: linkBuckets(spendingShares(spend, months[index].key, baseCurrency), spend,
      { ...months[index], label: monthLabel }),
    hasTrend: hasTrendData(trend),
    bars: spendingBars(trend, index, baseCurrency),
    income: incomeFigures(trend, baseCurrency),
    chart: trend.map((m) => ({ label: m.label, income: m.income, expense: m.expense })),
    // "Spending abroad": this month's foreign payments (the actual rows, not shares).
    abroad: ((a) => (a.items.length ? abroadCard(a, baseCurrency) : null))(
      foreignSpending(rows, months[months.length - 1].key, baseCurrency)),
  }
}

// The Savings page (Savings.jsx, SavingsHistory, GoalsCard) as savings.js
// reads it: every income entry and every expense paid from savings, the
// net-worth accounts (savings accounts are the total when there are any),
// the recurring rules and the goals; the history for a filter.
export function savingsFigures({ profile, categories, income, fromSavings, accounts, rules, goals, filter = 'all', now, lang = 'en' }) {
  setLanguage(lang)
  const date = new Date(now)
  const baseCurrency = profile?.base_currency || 'EUR'
  const savingsIds = savingsIdsOf(categories)
  const moves = savingsMoves([...income, ...fromSavings], savingsIds)
  const total = savingsTotal(accounts, savingsPotMinor(moves, savingsIds, baseCurrency))
  return {
    ...savingsPage({ moves, total, savingsIds, baseCurrency, rules, now: date }),
    history: savingsHistory(moves, savingsIds, baseCurrency, filter, date),
    goals: goals.map((g) => goalParts(g, date)),
  }
}

// The Meal vouchers page (Vouchers.jsx) and its setup (VoucherSetup.jsx)
// for a setup and the expenses paid with vouchers: the card, the next
// top-up, Edit days for the month it pays for, the history, and the form.
export function voucherFigures({ settings, spends, profile, now, lang = 'en' }) {
  setLanguage(lang)
  const date = new Date(now)
  const day = isoDate(date)
  const summary = voucherSummary(settings, spends, day)
  const next = nextTopUp(settings, day)
  const days = daysFor(settings, next.month).days
  return {
    card: voucherPageParts(settings, summary),
    next: { ...nextTopUpText(settings, next), month: next.month },
    fix: { days, ...daysFixParts(settings, next.month, days) },
    history: voucherHistoryParts(settings, voucherHistory(settings, spends, day), date),
    setup: setupDraft(settings, summary.balance, profile?.base_currency || 'EUR', day),
    countries: countryOptions(),
  }
}

// Plan mode (Plan.jsx with plan.js's reads) for a plan and the Month/Year
// view: what it reads (planReads), the page's parts, and the Apply sheet with
// every change ticked. `budgets` are my_budgets per month ('YYYY-MM-01'),
// `rates` today's rate of each foreign currency (fx.js useLatestRates), only
// those the rules and the plan need.
export function planFigures({
  profile, rules, plan, undo = null, categories, savingsCategories, income, charges, budgets, rates, view = 'month', now,
  lang = 'en',
}) {
  setLanguage(lang)
  const date = new Date(now)
  const base = profile?.base_currency || 'EUR'
  const todayISO = isoDate(date)
  const shift = salaryShiftOf(profile)
  const reads = planReads(todayISO, shift)
  const savingsIds = savingsIdsOf(savingsCategories)
  const salary = derivedSalary({
    rules, savingsIds, categoryId: salaryCategoryId(profile, categories), entries: income, todayISO, baseCurrency: base,
    salaryShift: shift,
  })
  const savings = derivedSavings({ rules, savingsIds, entries: income, todayISO, baseCurrency: base, salaryShift: shift })
  const doc = normalisePlan(plan)
  const needed = foreignCurrencies(rateNeeds(rules, doc), base)
  const budgetSets = setPeriods(Object.keys(budgets).sort(), reads.budgetMonths[0], reads.budgetMonths.at(-1))
    .map((period) => ({ period, rows: budgets[period] }))
  const state = planState({
    rules, plan: doc, savingsIds, baseCurrency: base,
    rates: Object.fromEntries(needed.filter((c) => rates[c]).map((c) => [c, rates[c]])),
    categories, salary, savings, charges, budgetSets, budgetMonths: reads.budgetMonths,
    separateYearly: !!profile?.yearly_separate,
  })
  return {
    reads,
    parts: planPageParts(state, { view, currency: base, undo, categories, now: date }),
    apply: applySheetParts(state.sum, base, [], date),
    state,
  }
}

// The salary page (SalaryPage.jsx with salary.js's reads) and Insights'
// card: the categories it uses, the country prices are compared with, and
// every card's parts (the projection five years ahead at 2% a year, prices
// from the first year offered), or only the card's when there's no pay yet.
export function salaryFigures({ profile, categories, income, notes, vouchers = null, now, lang = 'en' }) {
  setLanguage(lang)
  const date = new Date(now)
  const base = profile?.base_currency || 'EUR'
  const nowKey = monthOf(isoDate(date))
  const kept = normaliseNotes(notes)
  const salaryId = salaryCategoryId(profile, categories)
  const bonusId = bonusCategoryId(categories, kept)
  const country = defaultCountry({ picked: kept.country, voucherCountry: vouchers?.country, language: lang })
  const report = salaryReport(income, { salaryId, bonusId, currency: base, notes: kept, shift: salaryShiftOf(profile), nowKey })
  return {
    salaryId,
    bonusId,
    country,
    nowKey,
    bonus: bonusChoices(categories, salaryId),
    card: salaryCardParts(report, base),
    page: report && {
      headline: payHeadline(report, base),
      chart: payChartParts(report, base),
      raises: raisesParts(report, base, country),
      years: yearsParts(report, base, nowKey),
      extras: extrasParts(report, base, date),
      projection: projectionParts(report, { country, years: 5, whatIf: 2, nowKey, currency: base }),
      inflation: inflationParts(report, country, null, base),
      paidMonths: report.paidMonths,
    },
  }
}

// Insights' net worth (NetWorthCard with useSavingsMoves): the savings pot
// from every income entry and every expense paid from savings, then the
// card's parts for the accounts; and an account's page as it opens.
export function netWorthFigures({ profile, categories, income, fromSavings, accounts, lang = 'en' }) {
  setLanguage(lang)
  const base = profile?.base_currency || 'EUR'
  const ids = savingsIdsOf(categories)
  const pot = savingsPotMinor(savingsMoves([...income, ...fromSavings], ids), ids, base)
  return {
    pot,
    card: netWorthParts(accounts, pot, base),
    types: accountTypes(),
    draft: accountDraft(accounts[0] ?? null, base),
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
  // Home's card: this month (its own caps, then August's carried), a past
  // month without budgets, and this year (two months of caps).
  cards: [
    { name: 'own', view: 'own', periodValue: null },
    { name: 'carried', view: 'carried', periodValue: null },
    { name: 'pastEmpty', view: 'own', periodValue: 'm:2020-5', sets: [] },
    {
      name: 'year', view: 'own', periodValue: 'y:2020',
      sets: [
        { period: '2020-08-01', rows: [budget(GROCERIES, 35000, '2020-08-01')] },
        { period: '2020-09-01', rows: [budget(GROCERIES, 40000, '2020-09-01'), budget(EATING, 10000, '2020-09-01')] },
      ],
    },
  ],
}

const rule = (id, kind, amount_minor, frequency, next_run, categories, extra = {}) => ({
  id, kind, amount_minor, currency: 'EUR', frequency, interval_n: 1, next_run, end_date: null, is_active: true,
  remind_days_before: null, description: null, category_id: categories?.id ?? null, categories,
  savings_from_income: false, paid_from_savings: false, ...extra,
})
export const RECURRING_INPUT = {
  profile: PROFILE,
  categories: SAVINGS_CATEGORIES,
  rates: { USD: 0.9, GBP: 1.17 },
  rules: [
    rule('r1', 'expense', 1299, 'monthly', '2020-10-05', SUBS, { description: 'Music', remind_days_before: 3 }),
    rule('r2', 'expense', 90000, 'monthly', '2020-10-01', null, { description: 'Rent' }),
    rule('r3', 'expense', 999, 'monthly', '2020-10-12', SUBS, { currency: 'USD', description: 'Cloud' }),
    rule('r4', 'expense', 9600, 'yearly', '2021-03-15', SUBS, { description: 'Antivirus' }),
    rule('r5', 'expense', 1500, 'weekly', '2020-09-21', EATING, { description: 'Lunch club', is_active: false }),
    rule('r6', 'expense', 2999, 'monthly', '2020-10-20', SUBS, { currency: 'PLN', description: 'Gym' }),
    rule('r7', 'income', 250000, 'monthly', '2020-09-28', PAY),
    rule('r8', 'income', 30000, 'monthly', '2020-10-01', cat(SAVINGS, 'Savings', 'income'), { savings_from_income: true }),
  ],
}

export function recurringFixture() {
  const expected = { en: recurringFigures(RECURRING_INPUT), el: recurringFigures({ ...RECURRING_INPUT, lang: 'el' }) }
  setLanguage('en')
  return { input: RECURRING_INPUT, expected }
}

const INSIGHT_ROWS = [
  ...LEDGER_ROWS,
  txn('d1', '2020-08-20', 'expense', 64000, GROCERIES),
  txn('d2', '2020-08-11', 'expense', 90000, null, { description: 'Rent' }),
  txn('d3', '2020-07-28', 'income', 250000, PAY),
  txn('d4', '2020-07-11', 'expense', 90000, null, { description: 'Rent' }),
  txn('d5', '2020-07-02', 'expense', 15500, EATING),
  txn('d6', '2020-06-11', 'expense', 90000, null, { description: 'Rent' }),
  txn('d7', '2020-05-11', 'expense', 90000, null, { description: 'Rent' }),
  txn('d8', '2020-05-05', 'income', 240000, PAY),
  txn('d9', '2020-04-15', 'expense', 3000, EATING, { currency: 'GBP', exchange_rate: 1.1 }),
]
export const INSIGHTS_INPUT = {
  now: '2020-09-15T10:00:00.000Z',
  profile: PROFILE,
  categories: SAVINGS_CATEGORIES,
  rows: INSIGHT_ROWS,
  views: [{ name: 'thisMonth', picked: null }, { name: 'august', picked: 4 }],
}

export function insightsFixture() {
  const expected = {}
  for (const lang of ['en', 'el']) {
    expected[lang] = {}
    for (const view of INSIGHTS_INPUT.views) expected[lang][view.name] = insightsFigures({ ...INSIGHTS_INPUT, ...view, lang })
  }
  setLanguage('en')
  return { input: INSIGHTS_INPUT, expected }
}

export function budgetsFixture() {
  const expected = {}
  const cards = {}
  for (const lang of ['en', 'el']) {
    expected[lang] = {}
    for (const view of BUDGETS_INPUT.views) expected[lang][view.name] = budgetFigures({ ...BUDGETS_INPUT, ...view, lang })
    cards[lang] = {}
    for (const card of BUDGETS_INPUT.cards) {
      const view = BUDGETS_INPUT.views.find((v) => v.name === card.view)
      cards[lang][card.name] = budgetCard({ ...BUDGETS_INPUT, sets: card.sets ?? monthSets(view.budgets), periodValue: card.periodValue, lang })
    }
  }
  setLanguage('en')
  return { input: BUDGETS_INPUT, expected, cards }
}

const income = (id, spent_at, amount_minor, extra = {}) =>
  txn(id, spent_at, 'income', amount_minor, cat(SAVINGS, 'Savings', 'income', { is_savings: true }), extra)
export const SAVINGS_INPUT = {
  now: '2020-09-15T10:00:00.000Z',
  profile: PROFILE,
  categories: SAVINGS_CATEGORIES,
  // my_transactions(kind income): the savings ones and the salary (which never moves the pot).
  income: [
    income('s1', '2020-09-02', 30000, { savings_from_income: true, recurring_rule_id: 'r8', created_at: '2020-09-02T08:00:00Z' }),
    txn('s2', '2020-08-27', 'income', 250000, PAY),
    income('s3', '2020-08-20', 4500, { description: 'Interest', currency: 'GBP', exchange_rate: 1.1 }),
    income('s4', '2020-08-02', 30000, { savings_from_income: true, recurring_rule_id: 'r8' }),
    income('s5', '2020-06-02', 30000, { savings_from_income: true }),
    income('s6', '2020-05-14', 20000, { description: 'Birthday gift' }),
  ],
  // my_transactions(kind expense, p_paid_from_savings).
  fromSavings: [txn('s7', '2020-09-03', 'expense', 12000, null, { paid_from_savings: true, description: 'New bike' })],
  rules: RECURRING_INPUT.rules,
  goals: [
    { id: 'g1', name: 'Summer trip', saved_minor: 115000, target_minor: 300000, currency: 'EUR', target_date: '2021-06-30' },
    { id: 'g2', name: 'Emergency fund', saved_minor: 600000, target_minor: 600000, currency: 'EUR', target_date: null },
    { id: 'g3', name: 'New laptop', saved_minor: 0, target_minor: 150000, currency: 'EUR', target_date: null },
  ],
  views: [
    { name: 'entries', accounts: [], filter: 'all' },
    { name: 'out', accounts: [], filter: 'out' },
    { name: 'accounts', filter: 'all', accounts: [
      { id: 'a1', name: 'Bank savings', type: 'savings', balance_minor: 420000, currency: 'EUR' },
      { id: 'a2', name: 'Current', type: 'checking', balance_minor: 90000, currency: 'EUR' },
    ] },
    { name: 'first', filter: 'all', accounts: [], empty: true },
  ],
}

export function savingsFixture() {
  const expected = {}
  for (const lang of ['en', 'el']) {
    expected[lang] = {}
    for (const view of SAVINGS_INPUT.views) {
      const reads = view.empty ? { income: [], fromSavings: [] } : {}
      expected[lang][view.name] = savingsFigures({ ...SAVINGS_INPUT, ...reads, ...view, lang })
    }
  }
  setLanguage('en')
  return { input: SAVINGS_INPUT, expected }
}

const VOUCHER_SETTINGS = {
  v: 1, country: 'BE', per_day_minor: 800, currency: 'EUR', topup_day: 5, start_on: '2020-07-20',
  start_balance_minor: 3450, days: { '2020-09': 20 },
}
export const VOUCHERS_INPUT = {
  now: '2020-09-15T10:00:00.000Z',
  profile: PROFILE,
  settings: VOUCHER_SETTINGS,
  // my_transactions(kind expense, p_paid_with_vouchers).
  spends: [
    txn('v1', '2020-09-11', 'expense', 2340, GROCERIES, { paid_with_vouchers: true, description: 'Market' }),
    txn('v2', '2020-09-08', 'expense', 1450, EATING, { paid_with_vouchers: true }),
    txn('v3', '2020-08-21', 'expense', 3120, GROCERIES, { paid_with_vouchers: true }),
    txn('v4', '2020-07-10', 'expense', 999, EATING, { paid_with_vouchers: true }),
  ],
}

export function vouchersFixture() {
  const expected = { en: voucherFigures(VOUCHERS_INPUT), el: voucherFigures({ ...VOUCHERS_INPUT, lang: 'el' }) }
  setLanguage('en')
  return { input: VOUCHERS_INPUT, expected }
}

// ---- Plan -------------------------------------------------------------------
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ENT = cat(uuid(901), 'Entertainment', 'expense', { default_key: 'entertainment' })
const HOUSING = cat(uuid(902), 'Housing', 'expense', { default_key: 'housing' })
const POT = cat(SAVINGS, 'Savings', 'income', { default_key: 'savings', is_savings: true })
const planRule = (n, description, amount_minor, categories, extra = {}) => ({
  id: uuid(n), kind: 'expense', description, amount_minor, currency: 'EUR', frequency: 'monthly', interval_n: 1,
  next_run: '2020-10-01', end_date: null, is_active: true, category_id: categories?.id ?? null, categories,
  savings_from_income: false, paid_from_savings: false, remind_days_before: null, ...extra,
})
const PLAN_SALARY = planRule(1, 'Salary', 280000, PAY, { kind: 'income', next_run: '2020-09-28' })
const PLAN_RULES = [
  planRule(2, 'Rent', 95000, HOUSING),
  planRule(3, 'Netflix', 1399, ENT),
  planRule(4, 'Spotify', 1099, ENT, { next_run: '2020-09-20' }),
  planRule(5, 'Apple Music', 1099, ENT),
  planRule(6, 'Cloud', 999, SUBS, { currency: 'USD' }),
  planRule(7, 'Car insurance', 48000, null, { frequency: 'yearly', next_run: '2021-03-01' }),
  planRule(8, 'Monthly savings', 20000, POT, { kind: 'income', savings_from_income: true }),
]
const PLAN_CATEGORIES = [ENT, HOUSING, SUBS, PAY, POT, GROCERIES]
const charge = (n, ruleN, spent_at, amount_minor) => txn(`p${n}`, spent_at, 'expense', amount_minor, ENT, { recurring_rule_id: uuid(ruleN) })
// Netflix went up from €12.99 in July.
const PLAN_CHARGES = [charge(1, 3, '2020-05-03', 1299), charge(2, 3, '2020-06-03', 1299), charge(3, 3, '2020-07-03', 1399),
  charge(4, 3, '2020-08-03', 1399), charge(5, 3, '2020-09-03', 1399)]
const CHANGED_PLAN = (() => {
  let plan = setChange(emptyPlan(), PLAN_RULES[1], { cancel: true })
  plan = setChange(plan, PLAN_RULES[2], { amount_minor: 899 })
  return upsertAdd(plan, {
    id: 'add-gym', kind: 'expense', name: 'Gym', amount_minor: 3990, currency: 'EUR', frequency: 'monthly', interval_n: 1,
    start: '2020-10-01', category_id: null,
  })
})()
export const PLAN_INPUT = {
  now: '2020-09-15T10:00:00.000Z',
  profile: PROFILE,
  categories: PLAN_CATEGORIES,
  savingsCategories: SAVINGS_CATEGORIES,
  income: [],
  charges: PLAN_CHARGES,
  budgets: {},
  rates: { USD: 0.9 },
  views: [
    { name: 'start', rules: [PLAN_SALARY, ...PLAN_RULES], plan: null, view: 'month' },
    { name: 'changes', rules: [PLAN_SALARY, ...PLAN_RULES], plan: CHANGED_PLAN, view: 'year' },
    // No recurring salary: the Salary row from the entries, with a plan-only edit.
    { name: 'derived', rules: PLAN_RULES, plan: { v: 1, changes: [], adds: [], dismissed: [], salary: { amount_minor: 290000 } },
      view: 'month', income: [
        txn('i1', '2020-06-26', 'income', 270000, PAY), txn('i2', '2020-07-27', 'income', 270000, PAY),
        txn('i3', '2020-08-26', 'income', 280000, PAY),
      ] },
    // No income at all: the payments.
    { name: 'payments', rules: PLAN_RULES.slice(0, 4), plan: null, view: 'month' },
  ],
}

// The plan fixture: each view in both languages; for 'start' also a row's
// editor, the overlap picker with one ticked and a savings item's form; for
// 'changes' the what-if preview of a typed line.
export function planFixture() {
  const expected = {}
  for (const lang of ['en', 'el']) {
    expected[lang] = {}
    for (const view of PLAN_INPUT.views) {
      const { state, ...figures } = planFigures({ ...PLAN_INPUT, ...view, lang })
      const date = new Date(PLAN_INPUT.now)
      if (view.name === 'start') {
        const spotify = state.items.find((i) => i.name === 'Spotify')
        const overlap = state.ideas.find((i) => i.kind === 'overlap')
        const draft = { ...addDraft(null, 'EUR', '2020-09-15'), kind: 'savings', name: 'Holiday', text: '50', categoryId: SAVINGS }
        figures.editor = editorParts(spotify, state.signals.get(spotify.id) ?? null, 'EUR', date)
        figures.pick = pickParts(state.items, overlap, [overlap.ruleIds.at(-1)], 'EUR')
        figures.add = addFormParts(draft, { categories: PLAN_CATEGORIES, currency: 'EUR', rates: PLAN_INPUT.rates })
      }
      if (view.name === 'changes') {
        const rows = whatIfRows(PLAN_WHATIF, state.items, SAVINGS)
        figures.whatIf = whatIfParts(rows, rows.map((r) => r.id), PLAN_WHATIF.notFound)
      }
      expected[lang][view.name] = figures
    }
  }
  setLanguage('en')
  return { input: { ...PLAN_INPUT, whatif: PLAN_WHATIF }, expected }
}
const PLAN_WHATIF = {
  changes: [{ rule_id: uuid(5), cancel: true }],
  adds: [{ kind: 'expense', name: 'Gym', amount_minor: 4000, currency: 'EUR', repeat: 'monthly' }],
  notFound: ['Hulu'],
}

// ---- Your salary ------------------------------------------------------------
const BONUS = cat('77777777-7777-4777-8777-777777777777', 'Bonus', 'income', { default_key: 'bonus' })
const SIDE = cat('88888888-8888-4888-8888-888888888888', 'Side job', 'income')
const payslip = (n, spent_at, amount_minor, extra = {}) =>
  txn(`00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, spent_at, 'income', amount_minor, PAY, { description: 'Salary', ...extra })
const SALARY_INCOME = (() => {
  const rows = []
  let n = 100
  for (let i = 0; i < 24; i++) {
    const d = new Date(Date.UTC(2018, 9 + i, 20))
    const key = d.toISOString().slice(0, 10)
    rows.push(payslip(n++, key, key >= '2020-01-01' ? 260000 : 250000))
  }
  rows.push(payslip(n++, '2019-06-10', 180000, { description: 'Holiday pay' }))
  rows.push(txn(`00000000-0000-4000-8000-${String(n++).padStart(12, '0')}`, '2019-12-15', 'income', 50000, BONUS,
    { description: 'Year-end bonus' }))
  return rows
})()
export const SALARY_INPUT = {
  now: '2020-09-15T10:00:00.000Z',
  profile: { base_currency: 'EUR', yearly_separate: false, salary_shift_from_day: null, salary_category_id: SALARY },
  categories: [PAY, BONUS, SIDE, POT],
  income: SALARY_INCOME,
  notes: null,
  vouchers: null,
}

export function salaryFixture() {
  const expected = {}
  for (const lang of ['en', 'el']) {
    expected[lang] = {
      page: salaryFigures({ ...SALARY_INPUT, lang }),
      // Before any pay, with the vouchers' country.
      empty: salaryFigures({ ...SALARY_INPUT, income: [], vouchers: { country: 'GR' }, lang }),
    }
  }
  setLanguage('en')
  return { input: SALARY_INPUT, expected }
}

// ---- Net worth --------------------------------------------------------------
export const NETWORTH_INPUT = {
  profile: PROFILE,
  categories: SAVINGS_CATEGORIES,
  income: SAVINGS_INPUT.income,
  fromSavings: SAVINGS_INPUT.fromSavings,
  views: [
    { name: 'accounts', accounts: [
      { id: 'n1', name: 'Current', type: 'asset', balance_minor: 245000, currency: 'EUR' },
      { id: 'n2', name: 'Visa', type: 'liability', balance_minor: 32050, currency: 'EUR' },
      { id: 'n3', name: 'Dollar account', type: 'asset', balance_minor: 50000, currency: 'USD' },
    ] },
    { name: 'savings', accounts: [
      { id: 'n4', name: 'Bank savings', type: 'savings', balance_minor: 420000, currency: 'EUR' },
      { id: 'n2', name: 'Visa', type: 'liability', balance_minor: 32050, currency: 'EUR' },
    ] },
    { name: 'empty', accounts: [], empty: true },
  ],
}

export function netWorthFixture() {
  const expected = {}
  for (const lang of ['en', 'el']) {
    expected[lang] = {}
    for (const view of NETWORTH_INPUT.views) {
      const reads = view.empty ? { income: [], fromSavings: [] } : {}
      expected[lang][view.name] = netWorthFigures({ ...NETWORTH_INPUT, ...reads, ...view, lang })
    }
  }
  setLanguage('en')
  return { input: NETWORTH_INPUT, expected }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const out = resolve(root, FIXTURES_DIR, 'ledger.json')
  await writeFile(out, JSON.stringify(ledgerFixture(), null, 2) + '\n')
  console.log(`ledger fixture: ${FIXTURES_DIR}/ledger.json`)
  await writeFile(resolve(root, FIXTURES_DIR, 'budgets.json'), JSON.stringify(budgetsFixture(), null, 2) + '\n')
  console.log(`budgets fixture: ${FIXTURES_DIR}/budgets.json`)
  await writeFile(resolve(root, FIXTURES_DIR, 'recurring.json'), JSON.stringify(recurringFixture(), null, 2) + '\n')
  console.log(`recurring fixture: ${FIXTURES_DIR}/recurring.json`)
  await writeFile(resolve(root, FIXTURES_DIR, 'insights.json'), JSON.stringify(insightsFixture(), null, 2) + '\n')
  console.log(`insights fixture: ${FIXTURES_DIR}/insights.json`)
  await writeFile(resolve(root, FIXTURES_DIR, 'savings.json'), JSON.stringify(savingsFixture(), null, 2) + '\n')
  console.log(`savings fixture: ${FIXTURES_DIR}/savings.json`)
  await writeFile(resolve(root, FIXTURES_DIR, 'vouchers.json'), JSON.stringify(vouchersFixture(), null, 2) + '\n')
  console.log(`vouchers fixture: ${FIXTURES_DIR}/vouchers.json`)
  for (const [name, make] of [['plan', planFixture], ['salary', salaryFixture], ['networth', netWorthFixture]]) {
    await writeFile(resolve(root, FIXTURES_DIR, `${name}.json`), JSON.stringify(make(), null, 2) + '\n')
    console.log(`${name} fixture: ${FIXTURES_DIR}/${name}.json`)
  }
}
