// The native app's screen parity fixtures (mobile-core/screenFigures.mjs):
// each committed ios/Budgeer/BudgeerTests/Fixtures/<screen>.json holds what
// the web's functions give for its inputs, and the Swift parity tests must
// get the same through the core. This keeps the committed files equal to
// what the web gives today: after a change that moves a figure or a word,
// regenerate them (npm run ios:fixture).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  FIXTURES_DIR, budgetsFixture, insightsFixture, ledgerFixture, netWorthFixture, planFixture, recurringFixture,
  salaryFixture, savingsFixture, vouchersFixture,
} from '../mobile-core/screenFigures.mjs'

const committed = (name) => JSON.parse(readFileSync(resolve(FIXTURES_DIR, `${name}.json`), 'utf8'))
const fresh = (value) => JSON.parse(JSON.stringify(value))

test('ios ledger fixture: the committed file is what the web\'s functions give', () => {
  assert.deepEqual(committed('ledger'), fresh(ledgerFixture()))
})

test('ios ledger fixture: the list folds in the web\'s rules', () => {
  const { en } = committed('ledger').expected
  assert.equal(en.search.subtitle, '1 result · Net −€12.99')
  const all = Object.fromEntries(en.all.days.flatMap((d) => d.rows).map((r) => [r.id, r]))
  assert.equal(all.a4.approx, '≈ €22.81')
  assert.equal(all.a5.group, 'Lisbon trip')
  assert.equal(all.a6.repeats, 'Repeats every month')
  assert.equal(all.a9.spread, '€8.00/month over 12 months')
  assert.equal(all.b1.countsFor, 'Counts for September')
  assert.equal(all.b1.amount, '+€2,500.00')
  // By day, newest first: what each day spent (nothing on a day of income only).
  assert.deepEqual(en.all.days.slice(0, 2).map((d) => [d.title, d.spent]), [['Yesterday', '€42.50 spent'], ['12 Sep', '€18.99 spent']])
  assert.equal(en.all.days.find((d) => d.title === '2 Sep').spent, null)
})

test('ios budgets fixture: the committed file is what the web\'s functions give', () => {
  assert.deepEqual(committed('budgets'), fresh(budgetsFixture()))
})

test('ios budgets fixture: caps, spend, tones and the carried-over month', () => {
  const { own, carried } = committed('budgets').expected.en
  assert.equal(own.periodStart, '2020-09-01')
  assert.equal(own.subtitle, null)
  assert.equal(own.canCopy, true)
  const byName = Object.fromEntries(own.items.map((i) => [i.name, i]))
  assert.equal(byName.Groceries.meta, '€312.40 of €400.00')
  assert.equal(byName.Groceries.tone, null) // 78%: under the 80% warning
  // €22.81 abroad + €90.00 against a €100.00 cap: over.
  assert.equal(byName['Eating out'].over, true)
  // The yearly subscription counts its monthly share (€8.00).
  assert.equal(byName.Subscriptions.meta, '€8.00 of €20.00')
  assert.equal(carried.subtitle, 'Carried over from August')
  assert.equal(carried.canCopy, false)
})

test('ios recurring fixture: the committed file is what the web\'s functions give', () => {
  assert.deepEqual(committed('recurring'), fresh(recurringFixture()))
})

test('ios recurring fixture: groups, totals at today\'s rates, and the income tab', () => {
  const { groups, income } = committed('recurring').expected.en
  assert.deepEqual(groups.map((g) => g.key), ['weekly', 'monthly', 'yearly'])
  const monthly = groups.find((g) => g.key === 'monthly')
  assert.equal(monthly.total.converted, 'Other currencies converted at today’s rate.')
  assert.match(monthly.total.missing, /not included/)
  assert.equal(monthly.rows.find((r) => r.id === 'r3').hint, '≈ €8.99')
  assert.equal(groups.find((g) => g.key === 'weekly').rows[0].paused, 'Paused')
  // The savings rule is listed with the income but not summed as income.
  assert.equal(income.total.value, '≈ €2,500.00/month')
  assert.deepEqual(income.rows.map((r) => r.id), ['r7', 'r8'])
})

test('ios insights fixture: the committed file is what the web\'s functions give', () => {
  assert.deepEqual(committed('insights'), fresh(insightsFixture()))
})

test('ios insights fixture: the six months, the picked month\'s shares, this month\'s income', () => {
  const { thisMonth, august } = committed('insights').expected.en
  assert.equal(thisMonth.fetchFrom, '2020-04-01')
  assert.deepEqual(thisMonth.chart.map((m) => m.label), ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'])
  assert.equal(thisMonth.monthLabel, 'This month')
  assert.equal(august.monthLabel, 'August')
  assert.equal(august.bars.aside, 'Aug: €1,540.00')
  assert.equal(thisMonth.shares.reduce((s, c) => s + c.share, 0), 100)
  // The late-August salary counts in September.
  assert.equal(thisMonth.income.income, '€2,500.00')
})

test('ios savings fixture: the committed file is what the web\'s functions give', () => {
  assert.deepEqual(committed('savings'), fresh(savingsFixture()))
})

test('ios savings fixture: the pot from the entries or the savings accounts, the history, the goals', () => {
  const { entries, out, accounts, first } = committed('savings').expected.en
  assert.equal(first.first, true)
  assert.equal(entries.first, false)
  assert.equal(entries.pot.note, 'From your savings entries')
  assert.equal(accounts.pot.total, '€4,200.00')
  assert.equal(accounts.pot.points.at(-1).value, 4200)
  // The salary never moves the pot; the bike paid from savings does.
  assert.deepEqual(entries.history.groups[0].rows.map((r) => r.id), ['s7', 's1'])
  assert.deepEqual(out.history.groups.map((g) => g.rows.map((r) => r.id)), [['s7']])
  assert.deepEqual(entries.month.repeating.map((r) => r.id), ['r8'])
  assert.deepEqual(entries.goals.map((g) => g.pct), [38, 100, 0])
})

test('ios vouchers fixture: the committed file is what the web\'s functions give', () => {
  assert.deepEqual(committed('vouchers'), fresh(vouchersFixture()))
})

test('ios vouchers fixture: the card, the fixed days, the history and the form', () => {
  const { en } = committed('vouchers').expected
  assert.match(en.next.amount, /^\+€160\.00 on 5 Oct/)
  assert.match(en.next.why, /your days$/)
  assert.equal(en.fix.days, 20)
  assert.equal(en.history.at(-1).items.at(-1).type, 'start')
  assert.equal(en.setup.topUpOn, '2020-10-05')
})

test('ios plan fixture: the committed file is what the web\'s functions give', () => {
  assert.deepEqual(committed('plan'), fresh(planFixture()))
})

test('ios plan fixture: the reads, the header, the rows, the changes, the derived salary, the payments', () => {
  const { start, changes, derived, payments } = committed('plan').expected.en
  assert.deepEqual(start.reads, {
    // The salary shift (from the 25th) reaches back for June's salary.
    income: { from: '2020-05-25', to: '2020-08-31' }, charges: { from: '2020-04-01', to: '2020-09-30' },
    budgetMonths: ['2020-07-01', '2020-08-01', '2020-09-01'],
  })
  assert.deepEqual(start.parts.ideas.cards.map((c) => c.kind), ['overlap', 'priceUp', 'biggest'])
  assert.equal(start.parts.header.delta.text, 'No changes yet')
  assert.equal(changes.parts.changes.rows.length, 3)
  assert.equal(changes.apply.submit, 'Apply 3 changes')
  assert.equal(derived.parts.groups[0].rows[0].name, 'Salary')
  assert.equal(derived.parts.changes.rows[0].note, 'Only in your plan')
  assert.equal(derived.parts.changes.canApply, false)
  assert.equal(payments.parts.header.incomeHint, true)
  assert.equal(start.pick.summary.label, 'Cancel 1 of 2')
  assert.equal(start.add.ready, true)
  assert.deepEqual(changes.whatIf.rows.map((r) => r.name), ['Apple Music', 'Gym'])
})

test('ios salary fixture: the committed file is what the web\'s functions give', () => {
  assert.deepEqual(committed('salary'), fresh(salaryFixture()))
})

test('ios salary fixture: the pay, the raise, the extras, the country by language, no pay yet', () => {
  const { en, el } = committed('salary').expected
  assert.deepEqual(en.page.page.headline, { level: '€2,600.00', raise: '+4.0% in Jan 2020' })
  assert.deepEqual([en.page.country, el.page.country], ['BE', 'GR'])
  assert.deepEqual(en.page.page.extras.map((y) => y.year), [2019])
  assert.deepEqual(en.page.bonus.map((b) => b.label), ['Bonus', 'Side job', 'Savings'])
  assert.deepEqual([en.empty.page, en.empty.card, en.empty.country], [null, null, 'GR'])
})

test('ios net worth fixture: the committed file is what the web\'s functions give', () => {
  assert.deepEqual(committed('networth'), fresh(netWorthFixture()))
})

test('ios net worth fixture: the pot line, the savings accounts instead, nothing yet', () => {
  const { accounts, savings, empty } = committed('networth').expected.en
  assert.equal(accounts.card.pot.amount, '€1,029.50')
  assert.equal(savings.card.pot, null)
  assert.deepEqual(savings.card.savings.map((r) => r.title), ['Bank savings'])
  assert.equal(empty.card.empty, true)
  assert.equal(accounts.draft.name, 'Current')
})
