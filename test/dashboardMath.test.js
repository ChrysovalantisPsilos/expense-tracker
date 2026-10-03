import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  periodTotals, periodProjection, projectedTotals, visibleBars, TOP_CATEGORIES, homeCards, homeStacks, homeLists, barLines, netSum,
  groupFlow, netSteps, paidRuleIds,
} from '../src/features/dashboard/dashboardMath.js'
import { expectedEnd, payCalendar, payMonthWindow } from '../src/shared/lib/payCalendar.js'
import { spendRows } from '../src/shared/lib/spread.js'

const rows = [
  { id: 1, kind: 'expense', amount_minor: 1000, currency: 'EUR', exchange_rate: 1, categories: { name: 'Food' } },
  { id: 2, kind: 'expense', amount_minor: 2000, currency: 'GBP', exchange_rate: 1.15, categories: { name: 'Travel' } },
  { id: 3, kind: 'income', amount_minor: 50000, currency: 'EUR', exchange_rate: 1, categories: { name: 'Salary' } },
  { id: 4, kind: 'expense', amount_minor: 500, currency: 'EUR', exchange_rate: 1, categories: { name: 'Food' } },
  { id: 5, kind: 'expense', amount_minor: 1200, currency: 'EUR', exchange_rate: 1, group_expense_id: 'g1',
    group_expenses: { groups: { name: 'Italy' } } },
]

test('periodTotals: base-currency spent/earned and a largest-first category breakdown; all zero without rows', () => {
  const t = periodTotals(rows, 'EUR')
  assert.equal(t.spent, 1000 + 2300 + 500 + 1200)
  assert.equal(t.earned, 50000)
  assert.deepEqual(t.byCategory, [
    { name: 'Travel', value: 2300 }, { name: 'Food', value: 1500 }, { name: 'Italy', value: 1200 },
  ])
  assert.equal(t.bucketRow.get('Food').id, 1) // the first row seen in a bucket
  assert.equal(t.bucketRow.get('Italy').id, 5) // group expenses bucket by group
  // No rows: all zero.
  const none = periodTotals([], 'EUR')
  assert.deepEqual([none.spent, none.earned, none.byCategory], [0, 0, []])
})

const rules = [
  { is_active: true, kind: 'expense', amount_minor: 999, frequency: 'monthly', interval_n: 1, next_run: '2026-09-25' },
  { is_active: true, kind: 'income', amount_minor: 10000, frequency: 'monthly', interval_n: 1, next_run: '2026-09-28' },
  { is_active: false, kind: 'expense', amount_minor: 5000, frequency: 'monthly', interval_n: 1, next_run: '2026-09-24' },
]

test('periodProjection: only ongoing periods fold in upcoming recurring', () => {
  assert.deepEqual(periodProjection(rules, { to: '2026-09-30' }, '2026-09-23'),
    { expense: 999, income: 10000, expenseFromSavings: 0, savedFromIncome: 0, net: 10000 - 999 })
  const none = { expense: 0, income: 0, expenseFromSavings: 0, savedFromIncome: 0, net: 0 }
  assert.deepEqual(periodProjection(rules, { to: '2026-08-31' }, '2026-09-23'), none) // past
  assert.deepEqual(periodProjection(rules, { to: null }, '2026-09-23'), none) // all time
})

test('projectedTotals adds the projection and nets income − spend', () => {
  const totals = { spent: 3000, spentFromSavings: 0, spentWithVouchers: 0, earned: 1000, savedFromIncome: 0, net: -2000 }
  const proj = { expense: 500, income: 200, expenseFromSavings: 0, savedFromIncome: 0, net: -300 }
  assert.deepEqual(projectedTotals(totals, proj),
    { spentTotal: 3500, earnedTotal: 1200, fromIncomeTotal: 0, fromSavingsTotal: 0, withVouchersTotal: 0,
      groupsFronted: 0, groupsCovered: 0, settledIn: 0, settledOut: 0, netTotal: -2300 })
})

// ---- Yearly subscriptions kept separate (0068) -------------------------------
const withYearly = [
  ...rules,
  { is_active: true, kind: 'expense', amount_minor: 12000, frequency: 'yearly', interval_n: 1, next_run: '2026-09-27' },
]

test('periodProjection: separateYearly leaves yearly rules out', () => {
  assert.deepEqual(periodProjection(withYearly, { to: '2026-09-30' }, '2026-09-23'),
    { expense: 999 + 1000, income: 10000, expenseFromSavings: 0, savedFromIncome: 0, net: 10000 - 999 - 1000 })
  assert.deepEqual(periodProjection(withYearly, { to: '2026-09-30' }, '2026-09-23', true),
    { expense: 999, income: 10000, expenseFromSavings: 0, savedFromIncome: 0, net: 10000 - 999 })
})

test('visibleBars: top 5 until "Show all", then every category', () => {
  const bars = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((name) => ({ name }))
  assert.equal(TOP_CATEGORIES, 5)
  assert.deepEqual(visibleBars(bars, false), { rows: bars.slice(0, 5), hidden: 2 })
  assert.deepEqual(visibleBars(bars, true), { rows: bars, hidden: 0 })
  assert.deepEqual(visibleBars(bars.slice(0, 5), false), { rows: bars.slice(0, 5), hidden: 0 })
  assert.deepEqual(visibleBars([], false), { rows: [], hidden: 0 })
})

test('Home sideways: a strip, then two stacks that hold every card once, in the reading order', () => {
  for (const firstRun of [false, true]) {
    const cards = homeCards({ firstRun })
    const { strip, left, right } = homeStacks({ firstRun })
    const all = [...strip, ...left, ...right]
    assert.equal(new Set(all).size, all.length, 'a card twice')
    assert.deepEqual([...all].sort(), [...cards].sort(), `firstRun ${firstRun}: the same cards as the phone`)
    assert.deepEqual(strip, ['overview'])
    // Each stack keeps the phone's order.
    for (const stack of [left, right]) {
      const at = stack.map((id) => cards.indexOf(id))
      assert.deepEqual(at, [...at].sort((a, b) => a - b), stack.join())
    }
  }
  assert.deepEqual(homeStacks({ firstRun: false }), {
    strip: ['overview'], left: ['vouchers', 'categories', 'budgets'], right: ['expenses', 'income', 'recurring'],
  })
  // Nothing logged: the way to start leads the right stack; no empty lists.
  assert.deepEqual(homeStacks({ firstRun: true }).right, ['firstEntry', 'recurring'])
  assert.deepEqual(homeCards({ firstRun: true }).slice(0, 2), ['overview', 'firstEntry'])
})

test('homeLists: the period’s expenses and income as paid in its window, no savings', () => {
  const r = (id, kind, spent_at, extra = {}) => ({ id, kind, spent_at, amount_minor: 100, currency: 'EUR', exchange_rate: 1,
    category_id: null, ...extra })
  const all = [
    r('e1', 'expense', '2026-09-10'), r('e0', 'expense', '2026-08-31'),
    r('i1', 'income', '2026-09-02'), r('s1', 'income', '2026-09-03', { category_id: 'sav' }),
    r('pay', 'income', '2026-08-27', { category_id: 'salary' }),
  ]
  // A calendar September: the 27 Aug salary and the 31 Aug expense are August's.
  const sep = homeLists(all, { from: '2026-09-01', to: '2026-09-30', savingsIds: new Set(['sav']) })
  assert.deepEqual(sep.expenses.map((x) => x.id), ['e1'])
  assert.deepEqual(sep.income.map((x) => x.id), ['i1'])
  // A pay month from the 27 Aug payday: both are September's.
  const { expenses, income } = homeLists(all, { from: '2026-08-27', to: '2026-09-30', savingsIds: new Set(['sav']) })
  assert.deepEqual(expenses.map((x) => x.id), ['e1', 'e0'])
  assert.deepEqual(income.map((x) => x.id).sort(), ['i1', 'pay'])
  // All time: everything but the savings entry.
  const always = homeLists(all, { savingsIds: new Set(['sav']) })
  assert.deepEqual(always.expenses.map((x) => x.id), ['e1', 'e0'])
  assert.deepEqual(always.income.map((x) => x.id), ['i1', 'pay'])
})

test('barLines: each bar’s line, with what its groups add', () => {
  const lines = barLines([{ name: 'Food', value: 1500 }, { name: 'Travel', value: 2300 }], rows, 'EUR')
  assert.deepEqual(lines, ['€15.00', '€23.00'])
  const shared = [{ kind: 'expense', amount_minor: 3140, currency: 'EUR', exchange_rate: 1, group_expense_id: 'g',
    group_expenses: { groups: { name: 'Lisbon trip' } }, categories: { name: 'Food' } }]
  assert.deepEqual(barLines([{ name: 'Food', value: 1500 }], shared, 'EUR'), ['€15.00 · +€31.40 in Lisbon trip = €46.40'])
})

test('netSum: How Net adds up, worded', () => {
  const sum = netSum({ earnedTotal: 343000, spentTotal: 320751, fromSavingsTotal: 89900, netTotal: 112149 }, 'EUR')
  assert.equal(sum.title, 'How Net adds up')
  assert.deepEqual(sum.steps.map((s) => s.key), ['income', 'spent', 'fromSavings'])
  assert.equal(sum.steps[0].value, '+€3,430.00')
  assert.equal(sum.steps[1].value, '−€3,207.51')
  assert.deepEqual(sum.total, { label: 'Net', value: '+€1,121.49', tone: 'positive' })
})

// ---- Groups: Net counts what really moved (0110) ------------------------------
// my_group_flow's rows: amounts in the group currency, the user's rate.
const move = (kind, spent_at, amount_minor, paid_by_me, extra = {}) => ({
  kind, spent_at, amount_minor, share_minor: kind === 'expense' ? 0 : null, currency: 'EUR', exchange_rate: 1,
  paid_by_me, ...extra,
})
// Brunch €30 I paid, split two ways (my €15 is a mirrored expense row);
// Sanex €7.49 the other member paid, €3.75 of it mine.
const brunch = move('expense', '2026-09-05', 3000, true, { share_minor: 1500 })
const sanex = move('expense', '2026-09-06', 749, false, { share_minor: 375 })
const shareRows = [
  { kind: 'expense', amount_minor: 1500, currency: 'EUR', exchange_rate: 1, spent_at: '2026-09-05', group_expense_id: 'e1',
    group_expenses: { groups: { name: 'Flat' } } },
  { kind: 'expense', amount_minor: 375, currency: 'EUR', exchange_rate: 1, spent_at: '2026-09-06', group_expense_id: 'e2',
    group_expenses: { groups: { name: 'Flat' } } },
]
const NOTHING = { expense: 0, income: 0, expenseFromSavings: 0, savedFromIncome: 0, net: 0 }
const homeNet = (rowsIn, moves, window = {}) =>
  projectedTotals(periodTotals(rowsIn, 'EUR'), NOTHING, groupFlow(moves, 'EUR', window))

test('groupFlow: an expense I paid lowers the net by all of it, one someone else paid leaves it alone', () => {
  assert.deepEqual(groupFlow([brunch], 'EUR'), { groupsFronted: 1500, groupsCovered: 0, settledIn: 0, settledOut: 0 })
  assert.deepEqual(groupFlow([sanex], 'EUR'), { groupsFronted: 0, groupsCovered: 375, settledIn: 0, settledOut: 0 })
  // Spent stays the share (€15); the net drops by the €30 paid.
  const paid = homeNet([shareRows[0]], [brunch])
  assert.equal(paid.spentTotal, 1500)
  assert.equal(paid.netTotal, -3000)
  // Sanex: €3.75 in Spent, but the net is unchanged until I pay.
  const owed = homeNet([shareRows[1]], [sanex])
  assert.equal(owed.spentTotal, 375)
  assert.equal(owed.netTotal, 0)
  // Paid wholly for others (no share of mine): all of it, nothing in Spent.
  assert.equal(groupFlow([move('expense', '2026-09-07', 500, true)], 'EUR').groupsFronted, 500)
})

test('groupFlow: money paid back to me raises the net, money I pay back lowers it', () => {
  assert.deepEqual(groupFlow([move('settlement', '2026-09-10', 1500, false)], 'EUR'),
    { groupsFronted: 0, groupsCovered: 0, settledIn: 1500, settledOut: 0 })
  assert.deepEqual(groupFlow([move('settlement', '2026-09-11', 375, true)], 'EUR'),
    { groupsFronted: 0, groupsCovered: 0, settledIn: 0, settledOut: 375 })
})

test('groupFlow: once everything is settled the adjustments cancel out', () => {
  const settled = [brunch, sanex, move('settlement', '2026-09-10', 1500, false), move('settlement', '2026-09-11', 375, true)]
  const f = groupFlow(settled, 'EUR')
  assert.equal(f.groupsCovered + f.settledIn - f.groupsFronted - f.settledOut, 0)
  // The net is then just the shares spent: −€18.75.
  assert.equal(homeNet(shareRows, settled).netTotal, -1875)
})

test('groupFlow: each move counts in the period of its date', () => {
  const late = move('settlement', '2026-10-02', 1500, false)
  const sept = { from: '2026-09-01', to: '2026-09-30' }
  const oct = { from: '2026-10-01', to: '2026-10-31' }
  assert.deepEqual(groupFlow([brunch, late], 'EUR', sept), { groupsFronted: 1500, groupsCovered: 0, settledIn: 0, settledOut: 0 })
  assert.deepEqual(groupFlow([brunch, late], 'EUR', oct), { groupsFronted: 0, groupsCovered: 0, settledIn: 1500, settledOut: 0 })
  // All time (no ends) takes everything.
  assert.equal(groupFlow([brunch, late], 'EUR').settledIn, 1500)
  assert.deepEqual(groupFlow(undefined, 'EUR'), { groupsFronted: 0, groupsCovered: 0, settledIn: 0, settledOut: 0 })
})

test('groupFlow: a group in another currency converts at the user\'s rate, the share exactly as in Spent', () => {
  // A GBP group: £40 paid by me, £20 mine at 1.15; £10 back to me at 1.17;
  // a JPY group's ¥1,000 share others paid at 0.0062 (zero-decimal).
  const moves = [
    move('expense', '2026-09-05', 4000, true, { share_minor: 2000, currency: 'GBP', exchange_rate: 1.15 }),
    move('settlement', '2026-09-08', 1000, false, { currency: 'GBP', exchange_rate: 1.17 }),
    move('expense', '2026-09-09', 1000, false, { share_minor: 1000, currency: 'JPY', exchange_rate: 0.0062 }),
  ]
  assert.deepEqual(groupFlow(moves, 'EUR'), { groupsFronted: 4600 - 2300, groupsCovered: 620, settledIn: 1170, settledOut: 0 })
  // My share in Spent (£20 → €23.00) plus the rest makes the full €46.00.
  const spent = [{ kind: 'expense', amount_minor: 2000, currency: 'GBP', exchange_rate: 1.15, group_expense_id: 'e' }]
  assert.equal(homeNet(spent, moves.slice(0, 1)).netTotal, -4600)
})

test('netSteps: the group steps show only when they happened and add up to the Net', () => {
  const settled = [brunch, sanex, move('settlement', '2026-09-10', 1500, false), move('settlement', '2026-09-11', 375, true)]
  const income = { kind: 'income', amount_minor: 200000, currency: 'EUR', exchange_rate: 1 }
  for (const moves of [[], [brunch], [sanex], settled]) {
    const figures = homeNet([income, ...shareRows], moves)
    const steps = netSteps(figures)
    assert.equal(steps.reduce((s, x) => s + x.minor, 0), figures.netTotal)
    assert.ok(steps.slice(2).every((x) => x.minor !== 0))
  }
  assert.deepEqual(netSteps(homeNet(shareRows, settled)).map((s) => [s.key, s.minor]), [
    ['income', 0], ['spent', -1875], ['groupsFronted', -1500], ['groupsCovered', 375], ['settledIn', 1500], ['settledOut', -375],
  ])
  const sum = netSum(homeNet(shareRows, [brunch, sanex]), 'EUR')
  assert.deepEqual(sum.steps.map((s) => [s.label, s.value]), [
    ['Income', '€0.00'], ['Spent', '−€18.75'], ['Paid for others in groups', '−€15.00'], ['Paid for you in groups', '+€3.75'],
  ])
  assert.equal(sum.total.value, '−€30.00')
})

// Pay months: October runs from the 29 Sep payday.
const PAY = { fromDay: 25, categoryId: 'salary' }
const CAL = payCalendar(PAY, ['2026-08-28', '2026-09-29'], '2026-10-03')
const OCT = payMonthWindow('2026-10', CAL)

test('pay months: October counts what was paid from its payday, as a calendar month never could', () => {
  const r = (id, kind, spent_at, amount_minor, extra = {}) => ({ id, kind, spent_at, amount_minor, currency: 'EUR',
    exchange_rate: 1, category_id: null, ...extra })
  const rows = [
    r('sep-pay', 'income', '2026-09-29', 250000, { category_id: 'salary' }),
    r('rent', 'expense', '2026-09-30', 95000),
    r('food', 'expense', '2026-10-02', 7875),
    r('aug-pay', 'income', '2026-08-28', 250000, { category_id: 'salary' }),
    r('sep-food', 'expense', '2026-09-27', 4000),
  ]
  const t = periodTotals(spendRows(rows, 'EUR', OCT.from, OCT.to, { cal: CAL }), 'EUR')
  assert.deepEqual([t.earned, t.spent, t.net], [250000, 102875, 147125])
  // The setting off: October's calendar month holds only the 2 Oct expense.
  const cal = periodTotals(spendRows(rows, 'EUR', '2026-10-01', '2026-10-31'), 'EUR')
  assert.deepEqual([cal.earned, cal.spent], [0, 7875])
})

test('pay months: the projection ends the day before the next salary, and a charge paid this pay month is not due again', () => {
  const rule = (id, next_run, amount_minor, extra = {}) => ({ id, kind: 'expense', frequency: 'monthly', interval_n: 1,
    is_active: true, next_run, amount_minor, currency: 'EUR', ...extra })
  const rules = [
    rule('rent', '2026-10-30', 95000), // paid 30 Sep, in October already
    rule('phone', '2026-10-12', 2000),
    rule('gym', '2026-10-29', 3000), // due on payday: November's
    rule('salary', '2026-10-29', 250000, { kind: 'income', category_id: 'salary' }),
  ]
  const end = expectedEnd(OCT, CAL, { ruleNextRun: '2026-10-29' })
  assert.equal(end, '2026-10-28')
  const paid = paidRuleIds([{ spent_at: '2026-09-30', recurring_rule_id: 'rent' }, { spent_at: '2026-09-20', recurring_rule_id: 'phone' }],
    OCT)
  assert.deepEqual([...paid], ['rent'])
  const proj = periodProjection(rules, { from: OCT.from, to: end }, '2026-10-03', false, undefined, { cal: CAL, paidRules: paid })
  assert.equal(proj.expense, 2000)
  assert.equal(proj.income, 0)
  // Without the paid rules (the setting off), the rent would count twice.
  assert.equal(periodProjection(rules, { from: OCT.from, to: '2026-10-31' }, '2026-10-03').expense, 95000 + 2000 + 3000)
})

test('pay months: groupFlow over the pay window', () => {
  const moves = [
    { kind: 'settlement', spent_at: '2026-09-30', amount_minor: 1500, currency: 'EUR', exchange_rate: 1, paid_by_me: false },
    { kind: 'settlement', spent_at: '2026-09-27', amount_minor: 900, currency: 'EUR', exchange_rate: 1, paid_by_me: false },
  ]
  assert.equal(groupFlow(moves, 'EUR', OCT).settledIn, 1500)
})
