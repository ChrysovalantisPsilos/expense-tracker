// "What-if in your own words" in Plan mode (src/features/plan/whatIfMath.js):
// the server's proposals → preview rows → ordinary plan edits, and Undo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyWhatIf, editRow, rowReady, undoWhatIf, whatIfRows } from '../src/features/plan/whatIfMath.js'
import { buildItems, emptyPlan, setChange, upsertAdd } from '../src/features/plan/planMath.js'
import { whatIfLine } from '../src/features/plan/planText.js'
import { formatMoney } from '../src/shared/lib/currency.js'
import { t as tr } from '../src/shared/lib/i18n/i18n.js'

const NETFLIX = '00000000-0000-4000-8000-0000000000b1'
const DISNEY = '00000000-0000-4000-8000-0000000000b2'
const SPOTIFY = '00000000-0000-4000-8000-0000000000b3'
const PAY = '00000000-0000-4000-8000-0000000000b4'
const rule = (o) => ({
  kind: 'expense', amount_minor: 1599, currency: 'EUR', frequency: 'monthly', interval_n: 1, is_active: true,
  next_run: '2026-10-05', end_date: null, category_id: null, categories: null, ...o,
})
const rules = [
  rule({ id: NETFLIX, description: 'Netflix' }),
  rule({ id: DISNEY, description: 'Disney+', amount_minor: 899 }),
  rule({ id: SPOTIFY, description: 'Spotify', amount_minor: 1099 }),
  rule({ id: PAY, kind: 'income', description: 'Pay', amount_minor: 280000 }),
]
const itemsOf = (plan) => buildItems({ rules, plan, baseCurrency: 'EUR' })
const whatif = {
  changes: [
    { rule_id: NETFLIX, cancel: true },
    { rule_id: SPOTIFY, amount_minor: 1299 },
    { rule_id: DISNEY, repeat: 'yearly' },
    { rule_id: '00000000-0000-4000-8000-0000000000ff', cancel: true }, // gone since
  ],
  adds: [{ kind: 'expense', name: 'Gym', amount_minor: 4000, currency: 'EUR', repeat: 'quarterly' }],
  notFound: ['Hulu'],
}
let n = 0
const newId = () => `add-${++n}`
const t = (key, values) => tr(`plan:${key}`, values)
const eur = (minor) => formatMoney(minor, 'EUR')

test('proposals become preview rows, in order, each marked Suggested (not edited yet)', () => {
  const rows = whatIfRows(whatif, itemsOf(emptyPlan()))
  assert.deepEqual(rows.map((r) => [r.id, r.type, r.name]), [
    [`c:${NETFLIX}`, 'cancel', 'Netflix'],
    [`c:${SPOTIFY}`, 'change', 'Spotify'],
    [`c:${DISNEY}`, 'change', 'Disney+'],
    ['a:0', 'add', 'Gym'],
  ])
  assert.equal(rows[0].after, null)
  assert.deepEqual(rows[1].after, { amount_minor: 1299, currency: 'EUR', frequency: 'monthly', interval_n: 1 })
  assert.deepEqual(rows[2].after, { amount_minor: 899, currency: 'EUR', frequency: 'yearly', interval_n: 1 })
  assert.deepEqual(rows[3].after, { amount_minor: 4000, currency: 'EUR', frequency: 'monthly', interval_n: 3 })
  assert.ok(rows.every((r) => !r.edited && rowReady(r)))
  assert.deepEqual(whatIfRows(null, []), [])
})

test('a change to a row the plan already edits starts from the plan\'s version', () => {
  const plan = setChange(emptyPlan(), rules[2], { amount_minor: 1199 })
  const rows = whatIfRows({ changes: [{ rule_id: SPOTIFY, repeat: 'yearly' }], adds: [] }, itemsOf(plan))
  assert.deepEqual(rows[0].after, { amount_minor: 1199, currency: 'EUR', frequency: 'yearly', interval_n: 1 })
  assert.equal(rows[0].before.amount_minor, 1099)
})

test('each row reads as a line: cancel, change, add', () => {
  const rows = whatIfRows(whatif, itemsOf(emptyPlan()))
  assert.equal(whatIfLine(rows[0], t), `Cancel (−${eur(1599)} a month)`)
  assert.equal(whatIfLine(rows[1], t), `Change to ${eur(1299)} a month (now ${eur(1099)} a month)`)
  assert.equal(whatIfLine(rows[3], t), `Add ${eur(4000)} a quarter`)
  const stop = whatIfRows({ changes: [{ rule_id: PAY, cancel: true }], adds: [] }, itemsOf(emptyPlan()))[0]
  assert.equal(whatIfLine(stop, t), `Stop (−${eur(280000)} a month)`)
  assert.equal(whatIfLine({ type: 'add', kind: 'income', after: { amount_minor: 5000, currency: 'EUR', frequency: 'weekly', interval_n: 1 } }, t),
    `Add income of ${eur(5000)} a week`)
})

test('editing a row: amount, how often, cancel and back, a new item\'s name; the mark goes', () => {
  const rows = whatIfRows(whatif, itemsOf(emptyPlan()))
  const amount = editRow(rows[1], { amount_minor: 1399 })
  assert.equal(amount.after.amount_minor, 1399)
  assert.equal(amount.edited, true)
  const back = editRow(editRow(rows[1], { cancel: true }), { cancel: false })
  assert.deepEqual([back.type, back.after.amount_minor], ['change', 1299])
  // A proposed cancel turned into a change starts from today's payment.
  const unCancel = editRow(rows[0], { cancel: false })
  assert.deepEqual([unCancel.type, unCancel.after.amount_minor], ['change', 1599])
  const often = editRow(rows[3], { frequency: 'monthly', interval_n: 1, name: ' Gym plus ' })
  assert.deepEqual([often.after.interval_n, often.name, often.type], [1, ' Gym plus ', 'add'])
  assert.equal(rowReady(editRow(rows[3], { name: '  ' })), false)
  // An add can't be "cancelled": untick it instead.
  assert.equal(editRow(rows[3], { cancel: true }).type, 'add')
})

test('"Add to plan" makes the ticked rows ordinary plan edits; Undo takes exactly those back out', () => {
  n = 0
  const start = setChange(emptyPlan(), rules[0], { amount_minor: 1499 }) // Netflix already edited
  const rows = whatIfRows(whatif, itemsOf(start))
  const picked = new Set(rows.map((r) => r.id).filter((id) => id !== `c:${DISNEY}`))
  const { plan, added } = applyWhatIf(start, rows, picked, { rules, todayISO: '2026-09-29', newId })
  assert.deepEqual(plan.changes.map((c) => [c.rule_id, !!c.cancel, c.amount_minor ?? null]), [
    [NETFLIX, true, 1499],
    [SPOTIFY, false, 1299],
  ])
  assert.deepEqual(plan.adds, [{
    id: 'add-1', kind: 'expense', name: 'Gym', amount_minor: 4000, currency: 'EUR', frequency: 'monthly',
    interval_n: 3, start: '2026-09-29', category_id: null,
  }])
  assert.deepEqual(added.ruleIds, [NETFLIX, SPOTIFY])
  assert.deepEqual(added.addIds, ['add-1'])

  // Another edit made since stays through Undo.
  const later = upsertAdd(plan, { id: 'mine', kind: 'expense', name: 'Mine', amount_minor: 100, currency: 'EUR',
    frequency: 'monthly', interval_n: 1, start: '2026-10-01', category_id: null })
  const undone = undoWhatIf(later, added)
  assert.deepEqual(undone.changes, start.changes)
  assert.deepEqual(undone.adds.map((a) => a.id), ['mine'])
})

test('rows that aren\'t ready, or whose payment is gone, are skipped', () => {
  const rows = whatIfRows(whatif, itemsOf(emptyPlan()))
  const noName = rows.map((r) => (r.type === 'add' ? editRow(r, { name: '' }) : r))
  const { plan, added } = applyWhatIf(emptyPlan(), noName, new Set(rows.map((r) => r.id)),
    { rules: rules.filter((r) => r.id !== SPOTIFY), todayISO: '2026-09-29', newId })
  assert.deepEqual(plan.changes.map((c) => c.rule_id), [NETFLIX, DISNEY])
  assert.deepEqual(plan.adds, [])
  assert.deepEqual(added.addIds, [])
})

test('savings: a proposal to save more changes the savings rule; a new savings item goes to the savings category', () => {
  const POT = '00000000-0000-4000-8000-0000000000c1'
  const SAVE = '00000000-0000-4000-8000-0000000000b5'
  const withSaving = [...rules, rule({ id: SAVE, kind: 'income', description: 'Savings', amount_minor: 30000,
    category_id: POT, savings_from_income: true })]
  const items = buildItems({ rules: withSaving, plan: emptyPlan(), savingsIds: new Set([POT]), baseCurrency: 'EUR' })
  const proposal = {
    changes: [{ rule_id: SAVE, amount_minor: 35000 }],
    adds: [{ kind: 'savings', name: 'Holiday fund', amount_minor: 5000, currency: 'EUR', repeat: 'monthly' }],
  }
  const rows = whatIfRows(proposal, items, POT)
  assert.deepEqual(rows.map((r) => [r.type, r.kind]), [['change', 'savings'], ['add', 'savings']])
  assert.equal(whatIfLine(rows[1], t), `Save ${eur(5000)} a month`)
  assert.equal(whatIfLine({ ...rows[0], type: 'cancel', after: null }, t), `Stop (−${eur(30000)} a month)`)
  const { plan } = applyWhatIf(emptyPlan(), rows, new Set(rows.map((r) => r.id)),
    { rules: withSaving, todayISO: '2026-09-29', newId, savingsCategoryId: POT })
  assert.deepEqual(plan.changes.map((c) => [c.rule_id, c.amount_minor]), [[SAVE, 35000]])
  assert.deepEqual(plan.adds.map((a) => [a.kind, a.category_id]), [['savings', POT]])
  // No savings category: a new savings item can't go anywhere, so it isn't offered.
  assert.deepEqual(whatIfRows(proposal, items).map((r) => r.type), ['change'])
})
