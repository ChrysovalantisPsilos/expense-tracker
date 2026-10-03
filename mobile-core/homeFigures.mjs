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
import { periodFromValue, thisMonthPeriod } from '../src/shared/lib/periods.js'
import { expectedEnd, payCalendar, paydayHints, payMonthWindow, salaryShiftOf } from '../src/shared/lib/payCalendar.js'
import { savingsIdsOf } from '../src/shared/lib/savings.js'
import { paidInWindow, spendRows } from '../src/shared/lib/spread.js'
import { rulesInBase } from '../src/shared/lib/ruleFx.js'
import {
  periodTotals, periodProjection, paidRuleIds, projectedTotals, groupFlow, savingsLine, barLines, homeLists, visibleBars, homeCards, netSum,
  overviewNotes,
} from '../src/features/dashboard/dashboardMath.js'
import { isFirstRun, listHeading } from '../src/features/transactions/listHeading.js'
import { listParts } from '../src/features/transactions/rowParts.js'
import { categoryBars } from '../supabase/functions/_shared/breakdown.ts'
import { bucketLabel, bucketLabels } from '../src/shared/lib/txnRollup.js'
import { formatMoney, formatSigned } from '../src/shared/lib/currency.js'
import { signTone } from '../src/shared/ui/kit/kitMath.js'
import { isoDate } from '../src/shared/lib/dates.js'
import { categoryLook } from '../src/shared/lib/categoryStyle.js'
import { linkBuckets } from '../src/shared/lib/categoryLinks.js'
import { t } from '../src/shared/lib/i18n/i18n.js'
import {
  chargeParts, chargedGroups, chargedHeadline, chargedWording, groupNote, groupTotalParts, nextChargeParts,
  showsUpcoming, subscriptionGroups, upcomingToggle,
} from '../src/features/recurring/recurringMath.js'
import { setLanguage } from './index.js'

export const FIXTURE_FILE = 'ios/Budgeer/BudgeerTests/Fixtures/home.json'

// categoryBars takes `top` (the web passes Infinity: Home folds nothing); JSON
// can't carry Infinity, so the app and this fixture pass a number no list
// reaches. The same constant lives in HomeFigures.swift.
export const NO_FOLD = 1_000_000
// The donut's legend on the native Home: the four biggest, then "Other".
export const LEGEND_TOP = 4

// The Recurring card (SubscriptionsCard) for `period`: today's rules by
// frequency (this month, and next month once its salary is in), or what a
// past period was charged, as the card shows them: each group's headline,
// its note, the rows (the next charges, or the charges) and the toggle.
export function recurringCard({ rules, rows, period, todayISO, baseCurrency, rates, separateYearly }) {
  if (showsUpcoming(period, todayISO)) {
    return {
      upcoming: true,
      subtitle: null,
      empty: t('recurring:card.empty'),
      groups: subscriptionGroups(rules, baseCurrency, { upcomingOnly: true, rates }).map((g) => ({
        key: g.key, label: g.label, headline: groupTotalParts(g, baseCurrency), note: groupNote(g.key, separateYearly),
        section: t('recurring:card.nextCharges'),
        rows: g.next.map((r) => nextChargeParts(r, baseCurrency, rates)),
        all: g.live.map((r) => nextChargeParts(r, baseCurrency, rates)),
        toggle: upcomingToggle(g),
      })),
    }
  }
  const wording = chargedWording(period)
  return {
    upcoming: false,
    subtitle: wording.subtitle,
    empty: wording.empty,
    groups: chargedGroups(paidInWindow(rows, period.from, period.to), baseCurrency).map((g) => ({
      key: g.key, label: g.label, headline: chargedHeadline(g, baseCurrency), note: groupNote(g.key, separateYearly),
      section: t('recurring:card.charges', { count: g.charges.length }),
      rows: g.charges.map(chargeParts),
      all: g.charges.map(chargeParts),
      toggle: null,
    })),
  }
}

// One of Home's lists (the Expenses or Income card): its heading, what it
// says when empty, and every row's words (rowParts.listParts); the card
// shows them ten at a time.
export function homeList(kind, items, { periodLabel, baseCurrency, savingsIds }) {
  const head = listHeading({ kind, periodLabel, count: items.length })
  return {
    title: head.title,
    subtitle: head.subtitle,
    empty: t(kind === 'income' ? 'dashboard:noIncome' : 'dashboard:noExpenses'),
    rows: listParts(items, { kind, baseCurrency, savingsIds }),
  }
}

// Home for a period from the picker (`periodValue`, this month by default)
// from the rows my_transactions returned for [from, to] with p_spread, the
// recurring rules (the projection of what's still to come, and the
// Recurring card) and today's rates for the foreign ones. `oldest` is the
// first transaction's date (null: none at all), for the first-run cards.
// `groupMoves` are my_group_flow's rows for the period (the money groups
// really moved, which the Net counts). `payDays` are my_pay_calendar's
// dates: with the salary setting on, the months are pay months
// (payCalendar), and this month's projection ends the day before the next
// salary is expected.
export function homeFigures({
  rows, profile, categories, rules = [], rates = {}, groupMoves = [], payDays = [], now, periodValue = null, oldest,
  lang = 'en',
}) {
  setLanguage(lang)
  const date = new Date(now)
  const todayISO = isoDate(date)
  const shift = salaryShiftOf(profile)
  const cal = payCalendar(shift, payDays, todayISO)
  const period = (periodValue && periodFromValue(periodValue, date, cal)) || thisMonthPeriod(date, cal)
  const baseCurrency = profile?.base_currency || 'EUR'
  const separateYearly = !!profile?.yearly_separate
  const savingsIds = savingsIdsOf(categories)
  const spend = spendRows(rows, baseCurrency, period.from, period.to, { separateYearly, cal })
  const totals = periodTotals(spend, baseCurrency, savingsIds)
  const end = cal && period.open
    ? expectedEnd(payMonthWindow(period.key, cal), cal, paydayHints(rules, shift, payDays.at(-1) ?? null)) : period.to
  const proj = periodProjection(rulesInBase(rules, baseCurrency, rates).rules, { from: period.from, to: end },
    todayISO, separateYearly, savingsIds,
    cal ? { cal, paidRules: paidRuleIds(rows, { from: period.from, to: period.to }) } : undefined)
  const figures = projectedTotals(totals, proj, groupFlow(groupMoves, baseCurrency, { from: period.from, to: period.to }))
  const labels = bucketLabels([...totals.bucketRow.values()])
  // Each bar's badge as Dashboard's BucketIcon draws it: a group's share
  // wears the people icon, anything else its category's look.
  // Each bar's drill-down (linkBuckets): its category's page for the period,
  // or its group's; the folded "Other" has none.
  const shape = (ranked) => {
    const lines = barLines(ranked, spend, baseCurrency)
    const linked = linkBuckets(ranked, spend, period)
    return ranked.map((c, i) => {
      const row = totals.bucketRow.get(c.name)
      return {
        name: c.name, label: bucketLabel(c, labels), value: c.value, share: c.share, ratio: c.ratio,
        amount: formatMoney(c.value, baseCurrency), meta: lines[i],
        group: !!row?.group_expense_id, look: categoryLook(row?.categories),
        to: linked[i].to ?? null, linkLabel: linked[i].linkLabel ?? null,
      }
    })
  }
  const bars = shape(categoryBars(totals.byCategory, NO_FOLD))
  // The native app's donut: the top four and the rest folded into "Other".
  const legend = shape(categoryBars(totals.byCategory, LEGEND_TOP))
  // "Show all": the top rows first (visibleBars), the button's two words.
  const folded = visibleBars(bars, false)
  const fold = {
    top: folded.rows.length, hidden: folded.hidden,
    showAll: t('dashboard:categories.showAll', { n: bars.length }),
    showTop: t('dashboard:categories.showTop', { n: folded.rows.length }),
  }
  const lists = homeLists(rows, { from: period.from, to: period.to, savingsIds })
  const listOptions = { periodLabel: period.label, baseCurrency, savingsIds }
  const firstRun = isFirstRun({ loading: false, failed: false, count: rows.length, oldest })
  return {
    period: {
      value: period.value, key: period.key ?? null, from: period.from, to: period.to, label: period.label,
      range: period.range ?? null, open: period.open ?? null,
    },
    projectionEnd: end,
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
    // The overview's ⓘ: How Net adds up, and what's still to come.
    sum: netSum(figures, baseCurrency),
    notes: overviewNotes({ proj }, baseCurrency),
    bars,
    legend,
    fold,
    cards: homeCards({ firstRun }),
    expenseList: homeList('expense', lists.expenses, listOptions),
    incomeList: homeList('income', lists.income, listOptions),
    recurring: recurringCard({ rules, rows, period, todayISO, baseCurrency, rates, separateYearly }),
  }
}

// The fixture's inputs: a September 2020 that is a pay month (the salary
// setting on from the 25th: August's 28th payday opens September, and an
// expense on 30 August is September's), a savings entry taken from income,
// an expense paid from savings, a mirrored group expense, a foreign-currency
// lunch and a yearly subscription paid in March (spread over the year), and
// the same month with the setting off. Fake data.
const SALARY = '11111111-1111-4111-8111-111111111111'
const SAVINGS = '22222222-2222-4222-8222-222222222222'
const cat = (id, name, kind = 'expense', extra = {}) => ({ id, name, kind, icon: null, color: null, ...extra })
const GROCERIES = cat('33333333-3333-4333-8333-333333333333', 'Groceries')
const EATING = cat('44444444-4444-4444-8444-444444444444', 'Eating out', 'expense', { color: 'teal' })
const TRANSPORT = cat('55555555-5555-4555-8555-555555555555', 'Transport')
const SUBS = cat('66666666-6666-4666-8666-666666666666', 'Subscriptions')
const txn = (id, spent_at, kind, amount_minor, categories, extra = {}) => ({
  id, spent_at, kind, amount_minor, currency: 'EUR', exchange_rate: 1, category_id: categories?.id ?? null,
  categories, description: null, notes: null, group_expense_id: null, group_expenses: null,
  paid_from_savings: false, paid_with_vouchers: false, savings_from_income: null, spread_months: null, ...extra,
})
const rule = (id, amount_minor, frequency, next_run, categories, extra = {}) => ({
  id, kind: 'expense', amount_minor, currency: 'EUR', frequency, interval_n: 1, next_run, end_date: null,
  is_active: true, remind_days_before: null, description: null, category_id: categories?.id ?? null, categories,
  savings_from_income: false, paid_from_savings: false, ...extra,
})
export const FIXTURE_INPUT = {
  now: '2020-09-15T10:00:00.000Z',
  oldest: '2020-03-15',
  profile: { base_currency: 'EUR', yearly_separate: false, salary_shift_from_day: 25, salary_category_id: SALARY },
  categories: [
    { id: SAVINGS, kind: 'income', is_savings: true },
  ],
  rows: [
    txn('a1', '2020-09-14', 'expense', 4250, GROCERIES),
    txn('a2', '2020-09-12', 'expense', 1899, GROCERIES),
    txn('a3', '2020-09-10', 'expense', 3600, EATING),
    txn('a4', '2020-09-09', 'expense', 2500, EATING, { currency: 'USD', exchange_rate: 0.9123 }),
    txn('a5', '2020-09-05', 'expense', 4900, TRANSPORT),
    txn('a6', '2020-09-03', 'expense', 12000, null, { paid_from_savings: true }),
    txn('a7', '2020-09-02', 'income', 30000, cat(SAVINGS, 'Savings', 'income'), { savings_from_income: true }),
    txn('a8', '2020-09-01', 'income', 5000, cat('77777777-7777-4777-8777-777777777777', 'Refunds', 'income')),
    txn('a9', '2020-08-28', 'income', 250000, cat(SALARY, 'Salary', 'income')),
    txn('a0', '2020-08-30', 'expense', 1500, GROCERIES),
    txn('b1', '2020-09-08', 'expense', 2200, EATING, {
      group_expense_id: 'g1', group_expenses: { groups: { name: 'Lisbon trip' } },
    }),
    txn('b2', '2020-03-15', 'expense', 9600, SUBS, { spread_months: 12 }),
    txn('c1', '2020-08-05', 'expense', 1299, SUBS, {
      description: 'Music', recurring_rule_id: 'r1', recurring: { frequency: 'monthly', interval_n: 1, is_active: true },
    }),
  ],
  // Two monthly payments still to come this month (one in dollars), a yearly
  // one, and a weekly one that is paused.
  rules: [
    rule('r1', 1299, 'monthly', '2020-09-20', SUBS, { description: 'Music' }),
    rule('r2', 999, 'monthly', '2020-09-25', SUBS, { description: 'Cloud', currency: 'USD' }),
    rule('r3', 3900, 'monthly', '2020-10-02', TRANSPORT, { description: 'Bus pass' }),
    rule('r4', 9600, 'yearly', '2021-03-15', SUBS, { description: 'Antivirus' }),
    rule('r5', 1500, 'weekly', '2020-09-21', EATING, { description: 'Lunch club', is_active: false }),
  ],
  rates: { USD: 0.9 },
  // my_pay_calendar's dates: July's and August's salaries.
  payDays: ['2020-07-28', '2020-08-28'],
  // The group money behind the Net (my_group_flow): the Lisbon trip's €66
  // dinner I paid (€22 of it mine, b1), €10 I paid back on the 12th, and €15
  // paid back to me in August.
  groupMoves: [
    { kind: 'expense', spent_at: '2020-09-08', amount_minor: 6600, share_minor: 2200, currency: 'EUR', exchange_rate: 1, paid_by_me: true },
    { kind: 'settlement', spent_at: '2020-09-12', amount_minor: 1000, share_minor: null, currency: 'EUR', exchange_rate: 1, paid_by_me: true },
    { kind: 'settlement', spent_at: '2020-08-20', amount_minor: 1500, share_minor: null, currency: 'EUR', exchange_rate: 1, paid_by_me: false },
  ],
  views: [
    { name: 'thisMonth', periodValue: null }, { name: 'august', periodValue: 'm:2020-8' },
    // The salary setting off: calendar months, exactly as before pay months.
    { name: 'calendar', periodValue: null, profile: { base_currency: 'EUR', yearly_separate: false } },
  ],
}

// Every view in both languages: { en: { thisMonth, august }, el: … }.
export function homeFixtureExpected() {
  const expected = {}
  for (const lang of ['en', 'el']) {
    expected[lang] = {}
    for (const view of FIXTURE_INPUT.views) expected[lang][view.name] = homeFigures({ ...FIXTURE_INPUT, ...view, lang })
  }
  setLanguage('en')
  return expected
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const expected = homeFixtureExpected()
  const out = resolve(root, FIXTURE_FILE)
  await writeFile(out, JSON.stringify({ input: FIXTURE_INPUT, expected }, null, 2) + '\n')
  console.log(`home fixture: ${FIXTURE_FILE}`)
}
