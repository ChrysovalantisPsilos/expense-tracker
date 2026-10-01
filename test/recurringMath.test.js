import { test } from 'node:test'
import assert from 'node:assert/strict'
import { monthlyMinor, frequencyLabel, expectedInWindow } from '../src/features/recurring/recurringMath.js'

test('monthlyMinor: monthly is itself, weekly scales by 52/12, every 2 months halves', () => {
  assert.equal(monthlyMinor({ amount_minor: 1000, frequency: 'monthly', interval_n: 1 }), 1000)
  assert.equal(monthlyMinor({ amount_minor: 1200, frequency: 'weekly', interval_n: 1 }), Math.round(1200 * 52 / 12))
  assert.equal(monthlyMinor({ amount_minor: 1000, frequency: 'monthly', interval_n: 2 }), 500)
})

test('frequencyLabel wording', () => {
  assert.equal(frequencyLabel({ frequency: 'monthly' }), 'every month')
  assert.equal(frequencyLabel({ frequency: 'weekly', interval_n: 2 }), 'every 2 weeks')
})

test('expectedInWindow: in-window charges only, no double count, end_date and inactive rules, income vs expense', () => {
  const cases = [
    // Window 2026-07-01..31 → 10, 17, 24, 31 = 4 charges.
    ['counts occurrences inside the window only', [
      { is_active: true, kind: 'expense', amount_minor: 500, frequency: 'weekly', interval_n: 1, next_run: '2026-07-10', end_date: null },
    ], '2026-07-01', '2026-07-31', { expense: 2000, income: 0 }],
    // next_run already advanced past the whole window → nothing projected.
    ['no double count for already-materialised charges', [
      { is_active: true, kind: 'expense', amount_minor: 500, frequency: 'monthly', interval_n: 1, next_run: '2026-08-01', end_date: null },
    ], '2026-07-01', '2026-07-31', { expense: 0, income: 0 }],
    // 3 charges (1st..3rd), inactive ignored.
    ['respects end_date and inactive rules', [
      { is_active: true, kind: 'expense', amount_minor: 100, frequency: 'daily', interval_n: 1, next_run: '2026-07-01', end_date: '2026-07-03' },
      { is_active: false, kind: 'expense', amount_minor: 999, frequency: 'daily', interval_n: 1, next_run: '2026-07-01', end_date: null },
    ], '2026-07-01', '2026-07-31', { expense: 300, income: 0 }],
    ['income vs expense split', [
      { is_active: true, kind: 'income', amount_minor: 200000, frequency: 'monthly', interval_n: 1, next_run: '2026-07-28', end_date: null },
      { is_active: true, kind: 'expense', amount_minor: 800, frequency: 'monthly', interval_n: 1, next_run: '2026-07-20', end_date: null },
    ], '2026-07-15', '2026-07-31', { expense: 800, income: 200000 }],
  ]
  for (const [name, rules, from, to, expected] of cases) {
    assert.deepEqual(expectedInWindow(rules, from, to), expected, name)
  }
})

// ---- Repeat from an entry: next charge one period after the transaction -----
import { nextRunAfter, ruleFromTransaction } from '../src/features/recurring/recurringMath.js'

test('nextRunAfter: one period later, as the SQL materializer steps; month ends clamp to the shorter month', () => {
  assert.equal(nextRunAfter('2026-09-01', 'monthly'), '2026-10-01') // rent on the 1st
  assert.equal(nextRunAfter('2026-09-01', 'weekly'), '2026-09-08')
  assert.equal(nextRunAfter('2026-12-28', 'weekly'), '2027-01-04') // across a year
  assert.equal(nextRunAfter('2026-09-30', 'daily'), '2026-10-01')
  assert.equal(nextRunAfter('2026-09-01', 'yearly'), '2027-09-01')
  assert.equal(nextRunAfter('2026-09-15', 'weekly', 2), '2026-09-29')
  assert.equal(nextRunAfter('2026-11-30', 'monthly', 3), '2027-02-28')
  // Month ends clamp to the shorter month (Postgres date + interval).
  assert.equal(nextRunAfter('2026-01-31', 'monthly'), '2026-02-28')
  assert.equal(nextRunAfter('2028-01-31', 'monthly'), '2028-02-29') // leap year
  assert.equal(nextRunAfter('2026-03-31', 'monthly'), '2026-04-30')
  assert.equal(nextRunAfter('2026-08-31', 'monthly'), '2026-09-30')
  assert.equal(nextRunAfter('2028-02-29', 'yearly'), '2029-02-28')
  assert.equal(nextRunAfter('2027-02-28', 'yearly'), '2028-02-28')
  assert.equal(nextRunAfter('2028-02-28', 'weekly'), '2028-03-06')
})

test('ruleFromTransaction: carries the entry over; next charge after its date', () => {
  const t = {
    id: 't1', kind: 'expense', amount_minor: 85000, currency: 'EUR', exchange_rate: 1,
    category_id: 'c1', account_id: null, description: 'Rent', spent_at: '2026-09-01', notes: 'x',
  }
  assert.deepEqual(ruleFromTransaction(t, { frequency: 'monthly', interval_n: 1 }), {
    kind: 'expense', amount_minor: 85000, currency: 'EUR', category_id: 'c1', account_id: null,
    description: 'Rent', savings_from_income: false, paid_from_savings: false, frequency: 'monthly', interval_n: 1, next_run: '2026-10-01',
    source_transaction_id: 't1',
  })
  // A foreign-currency entry keeps its currency; no rate is stored on the rule.
  const gbp = ruleFromTransaction({ ...t, currency: 'GBP', exchange_rate: 1.17, spent_at: '2026-01-31' })
  assert.equal(gbp.currency, 'GBP')
  assert.equal(gbp.next_run, '2026-02-28')
  assert.ok(!('exchange_rate' in gbp))
  // A just-saved entry (no id on the client yet) links through its client_uuid.
  const fresh = ruleFromTransaction({ ...t, id: undefined, client_uuid: 'cu1' })
  assert.equal(fresh.source_client_uuid, 'cu1')
  assert.ok(!('source_transaction_id' in fresh))
  assert.ok(!('source_client_uuid' in ruleFromTransaction({ ...t, id: undefined })))
})

test('stepping chains from the clamped date like the materializer: 31 Mar is not restored', () => {
  const chain = (iso, f, k) => Array.from({ length: k }).reduce((acc) => [...acc, nextRunAfter(acc.at(-1), f)], [iso])
  assert.deepEqual(chain('2026-01-31', 'monthly', 3), ['2026-01-31', '2026-02-28', '2026-03-28', '2026-04-28'])
  assert.deepEqual(chain('2028-01-31', 'monthly', 2), ['2028-01-31', '2028-02-29', '2028-03-29'])
  assert.deepEqual(chain('2024-02-29', 'yearly', 2), ['2024-02-29', '2025-02-28', '2026-02-28'])
})

test('expectedInWindow: month-end rules follow the same clamped chain', () => {
  const rule = { is_active: true, kind: 'expense', amount_minor: 100, frequency: 'monthly', interval_n: 1, next_run: '2026-01-31' }
  // Charges on 31 Jan, 28 Feb, 28 Mar: 28 Mar is in March's window, 31 Mar is not a charge.
  assert.deepEqual(expectedInWindow([rule], '2026-03-01', '2026-03-31'), { expense: 100, income: 0 })
  assert.deepEqual(expectedInWindow([rule], '2026-03-29', '2026-03-31'), { expense: 0, income: 0 })
  assert.deepEqual(expectedInWindow([rule], '2026-02-01', '2026-02-28'), { expense: 100, income: 0 })
})

// ---- Yearly expenses spread over the months they cover (0067) ---------------
import { monthlyBudgetShare } from '../src/features/recurring/recurringMath.js'

test('expectedInWindow: an upcoming yearly expense counts only its parts in the window', () => {
  const rules = [
    { is_active: true, kind: 'expense', amount_minor: 12005, frequency: 'yearly', interval_n: 1, next_run: '2026-07-20', end_date: null },
    { is_active: true, kind: 'income', amount_minor: 60000, frequency: 'yearly', interval_n: 1, next_run: '2026-07-20', end_date: null },
  ]
  // 12005 / 12 = 1000 r 5: July (the first part) gets 1001. Income isn't spread.
  assert.deepEqual(expectedInWindow(rules, '2026-07-15', '2026-07-31'), { expense: 1001, income: 60000 })
  // Jul..Dec: 5 parts of 1001 + 1 of 1000.
  assert.deepEqual(expectedInWindow(rules, '2026-07-15', '2026-12-31'), { expense: 5 * 1001 + 1000, income: 60000 })
  // A charge next month adds nothing to this month.
  assert.deepEqual(expectedInWindow([{ ...rules[0], next_run: '2026-08-02' }], '2026-07-15', '2026-07-31'),
    { expense: 0, income: 0 })
})

test('monthlyBudgetShare: yearly expense rules only, first part and whether it is even', () => {
  assert.deepEqual(monthlyBudgetShare({ kind: 'expense', frequency: 'yearly', interval_n: 1, amount_minor: 12000 }),
    { perMonth: 1000, months: 12, exact: true })
  assert.deepEqual(monthlyBudgetShare({ kind: 'expense', frequency: 'yearly', interval_n: 2, amount_minor: 10000 }),
    { perMonth: 417, months: 24, exact: false })
  assert.equal(monthlyBudgetShare({ kind: 'income', frequency: 'yearly', interval_n: 1, amount_minor: 12000 }), null)
  assert.equal(monthlyBudgetShare({ kind: 'expense', frequency: 'monthly', interval_n: 12, amount_minor: 12000 }), null)
})

// ---- Subscriptions by frequency (Home card, Recurring page) ------------------
import {
  subscriptionGroups, subscriptionGroup, periodMinor, incomePerMonth,
} from '../src/features/recurring/recurringMath.js'

const mix = [
  { id: 'm', is_active: true, kind: 'expense', amount_minor: 999, currency: 'EUR', frequency: 'monthly', interval_n: 1, next_run: '2026-10-01' },
  { id: 'i', is_active: true, kind: 'income', amount_minor: 60000, currency: 'EUR', frequency: 'yearly', interval_n: 1, next_run: '2026-12-01' },
  { id: 'y1', is_active: true, kind: 'expense', amount_minor: 12000, currency: 'EUR', frequency: 'yearly', interval_n: 1, next_run: '2027-03-15' },
  { id: 'y2', is_active: true, kind: 'expense', amount_minor: 10000, currency: 'EUR', frequency: 'yearly', interval_n: 2, next_run: '2026-11-02' },
  { id: 'y3', is_active: true, kind: 'expense', amount_minor: 5999, currency: 'EUR', frequency: 'yearly', interval_n: 1, next_run: '2026-10-20' },
  { id: 'y4', is_active: true, kind: 'expense', amount_minor: 2400, currency: 'EUR', frequency: 'yearly', interval_n: 1, next_run: '2027-01-05' },
  { id: 'off', is_active: false, kind: 'expense', amount_minor: 99999, currency: 'EUR', frequency: 'yearly', interval_n: 1, next_run: '2026-10-01' },
  { id: 'ended', is_active: true, kind: 'expense', amount_minor: 77777, currency: 'EUR', frequency: 'yearly', interval_n: 1, next_run: '2027-01-01', end_date: '2026-12-31' },
]

const rule = (o) => ({ is_active: true, kind: 'expense', currency: 'EUR', interval_n: 1, next_run: '2026-10-01', ...o })

test('subscriptionGroup: other intervals fold into their unit; daily is Weekly; monthly ×3 is Quarterly', () => {
  assert.equal(subscriptionGroup(rule({ frequency: 'daily' })), 'weekly')
  assert.equal(subscriptionGroup(rule({ frequency: 'weekly', interval_n: 2 })), 'weekly')
  assert.equal(subscriptionGroup(rule({ frequency: 'monthly' })), 'monthly')
  assert.equal(subscriptionGroup(rule({ frequency: 'monthly', interval_n: 2 })), 'monthly')
  assert.equal(subscriptionGroup(rule({ frequency: 'monthly', interval_n: 3 })), 'quarterly')
  assert.equal(subscriptionGroup(rule({ frequency: 'monthly', interval_n: 6 })), 'monthly')
  assert.equal(subscriptionGroup(rule({ frequency: 'yearly', interval_n: 2 })), 'yearly')
})

test('periodMinor: cost per period of the group', () => {
  assert.equal(periodMinor(rule({ frequency: 'weekly', interval_n: 2, amount_minor: 2000 })), 1000)
  assert.equal(periodMinor(rule({ frequency: 'daily', amount_minor: 100 })), 700)
  assert.equal(periodMinor(rule({ frequency: 'daily', interval_n: 2, amount_minor: 101 })), 354) // 353.5 → 354
  assert.equal(periodMinor(rule({ frequency: 'monthly', interval_n: 2, amount_minor: 999 })), 500)
  assert.equal(periodMinor(rule({ frequency: 'monthly', interval_n: 3, amount_minor: 4500 })), 4500)
  assert.equal(periodMinor(rule({ frequency: 'yearly', interval_n: 2, amount_minor: 10000 })), 5000)
})

test('subscriptionGroups: only the groups present, in order; income never counts', () => {
  const groups = subscriptionGroups(mix, 'EUR')
  assert.deepEqual(groups.map((g) => g.key), ['monthly', 'yearly'])
  const quarterly = rule({ id: 'q', frequency: 'monthly', interval_n: 3, amount_minor: 3000, next_run: '2026-11-01' })
  const weekly = rule({ id: 'w', frequency: 'weekly', amount_minor: 500, next_run: '2026-09-28' })
  const all = subscriptionGroups([...mix, quarterly, weekly], 'EUR')
  assert.deepEqual(all.map((g) => [g.key, g.label, g.unit]),
    [['weekly', 'Weekly', 'week'], ['monthly', 'Monthly', 'month'], ['quarterly', 'Quarterly', 'quarter'], ['yearly', 'Yearly', 'year']])
  const q = all.find((g) => g.key === 'quarterly')
  assert.equal(q.total, 3000)
  assert.equal(q.perMonth, 1000)
  // Only income rules: no subscriptions at all.
  assert.deepEqual(subscriptionGroups([mix[1]], 'EUR'), [])
})

test('subscriptionGroups: yearly totals per year and per month, soonest next three, active and not ended', () => {
  const y = subscriptionGroups(mix, 'EUR').find((g) => g.key === 'yearly')
  assert.equal(y.count, 4)
  assert.equal(y.total, 12000 + 5000 + 5999 + 2400) // every 2 years counts half a year
  // y2 = 10000/2/12 = 416.67 → 417; y3 = 499.92 → 500.
  assert.equal(y.perMonth, 1000 + 417 + 500 + 200)
  assert.deepEqual(y.next.map((r) => r.id), ['y3', 'y2', 'y4'])
  assert.equal(y.converted, false)
  assert.deepEqual(y.missing, [])
  // The list keeps paused and ended rules (to resume or edit them); totals don't.
  assert.deepEqual(y.rules.map((r) => r.id), ['y1', 'y2', 'y3', 'y4', 'off', 'ended'])
  const more = subscriptionGroups(mix, 'EUR', { limit: 10 }).find((g) => g.key === 'yearly')
  assert.deepEqual(more.next.map((r) => r.id), ['y3', 'y2', 'y4', 'y1'])
})

test('subscriptionGroups: upcomingOnly hides a group whose rules are all paused or ended', () => {
  const paused = [mix[0], mix[6], mix[7]]
  assert.deepEqual(subscriptionGroups(paused, 'EUR').map((g) => g.key), ['monthly', 'yearly'])
  assert.deepEqual(subscriptionGroups(paused, 'EUR', { upcomingOnly: true }).map((g) => g.key), ['monthly'])
})

test('subscriptionGroups: other currencies count at the latest rate; one with no rate is left out and named', () => {
  // YouTube Premium PLN 29.99 at 0.2327 = €6.98, not €29.99.
  const yt = rule({ id: 'yt', frequency: 'monthly', amount_minor: 2999, currency: 'PLN' })
  const usd = rule({ id: 'usd', frequency: 'monthly', amount_minor: 1000, currency: 'USD' })
  const yen = rule({ id: 'yen', frequency: 'monthly', amount_minor: 1500, currency: 'JPY' })
  const rates = { PLN: 0.2327, USD: 0.9, JPY: 0.0062 }
  const [m] = subscriptionGroups([mix[0], yt, usd, yen], 'EUR', { rates })
  assert.equal(m.total, 999 + 698 + 900 + 930) // ¥1500 × 0.0062 = €9.30
  assert.equal(m.perMonth, m.total)
  assert.equal(m.converted, true)
  assert.deepEqual(m.missing, [])
  // Rows stay as they are, in their own currency.
  assert.deepEqual(m.next.map((r) => [r.id, r.currency, r.amount_minor]).slice(0, 2), [['m', 'EUR', 999], ['yt', 'PLN', 2999]])
  // No PLN rate (offline): never at face value — left out and reported.
  const [off] = subscriptionGroups([mix[0], yt, usd], 'EUR', { rates: { USD: 0.9 } })
  assert.equal(off.total, 999 + 900)
  assert.deepEqual(off.missing.map((r) => r.id), ['yt'])
  assert.equal(off.count, 3)
  // Nothing foreign: unchanged.
  const [eur] = subscriptionGroups([mix[0]], 'EUR')
  assert.equal(eur.total, 999)
  assert.equal(eur.converted, false)
  // Converted before the per-period split: every 2 years $100 at 0.9 = €90 → €45/year.
  const [y] = subscriptionGroups([{ ...mix[3], currency: 'USD' }, mix[2]], 'EUR', { rates })
  assert.equal(y.total, 12000 + 4500)
  // Zero-decimal base: whole yen, rounded half away from zero ($9.99 at 150.5 = ¥1503.495 → ¥1503).
  const [jp] = subscriptionGroups([rule({ frequency: 'monthly', amount_minor: 999, currency: 'USD' })], 'JPY',
    { rates: { USD: 150.5 } })
  assert.equal(jp.total, 1503)
  const [yearlyYen] = subscriptionGroups([{ ...mix[2], currency: 'JPY', amount_minor: 10001, interval_n: 2 }], 'JPY')
  assert.ok(Number.isInteger(yearlyYen.total) && Number.isInteger(yearlyYen.perMonth))
})

test('incomePerMonth: active income rules only, foreign ones at the latest rate', () => {
  const salary = rule({ kind: 'income', frequency: 'monthly', amount_minor: 250000 })
  assert.deepEqual(incomePerMonth([...mix, salary, { ...salary, is_active: false }]),
    { perMonth: 5000 + 250000, converted: false, missing: [] })
  const gbp = rule({ id: 'gbp', kind: 'income', frequency: 'monthly', amount_minor: 10000, currency: 'GBP' })
  assert.equal(incomePerMonth([salary, gbp], undefined, 'EUR', { GBP: 1.15 }).perMonth, 250000 + 11500)
  const off = incomePerMonth([salary, gbp], undefined, 'EUR', {})
  assert.equal(off.perMonth, 250000)
  assert.deepEqual(off.missing.map((r) => r.id), ['gbp'])
})

// ---- Repeat choices and the Repeat section -----------------------------------
import {
  REPEAT_CHOICES, choiceToRule, ruleToChoice, frequencyLabel as label, repeatDraft, editRepeat,
  repeatRuleFields, planRepeat,
} from '../src/features/recurring/recurringMath.js'

test('Quarterly is monthly every 3 months, both ways, and reads "every quarter"', () => {
  assert.deepEqual(REPEAT_CHOICES.map(([v]) => v), ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'])
  assert.deepEqual(choiceToRule('quarterly', 5), { frequency: 'monthly', interval_n: 3 })
  assert.deepEqual(choiceToRule('weekly', '2'), { frequency: 'weekly', interval_n: 2 })
  assert.deepEqual(choiceToRule('monthly', ''), { frequency: 'monthly', interval_n: 1 })
  assert.deepEqual(ruleToChoice({ frequency: 'monthly', interval_n: 3 }), { choice: 'quarterly', n: 1 })
  assert.deepEqual(ruleToChoice({ frequency: 'monthly', interval_n: 6 }), { choice: 'monthly', n: 6 })
  assert.equal(label({ frequency: 'monthly', interval_n: 3 }), 'every quarter')
  assert.equal(label({ frequency: 'monthly', interval_n: 6 }), 'every 6 months')
})

test('repeatDraft: a new rule from an entry follows its date; an existing rule round-trips', () => {
  const d = repeatDraft(null, { fromDate: '2026-01-31' })
  assert.equal(d.nextRun, '2026-02-28')
  assert.equal(d.follows, true)
  // Changing frequency or the entry's date moves the next charge…
  assert.equal(editRepeat(d, { choice: 'quarterly' }, '2026-01-31').nextRun, '2026-04-30')
  assert.equal(editRepeat(d, { choice: 'weekly', n: '2' }, '2026-01-31').nextRun, '2026-02-14')
  assert.equal(editRepeat(d, {}, '2026-03-10').nextRun, '2026-04-10')
  // …until the user picks a date.
  const picked = editRepeat(d, { nextRun: '2026-05-01' }, '2026-01-31')
  assert.equal(picked.follows, false)
  assert.equal(editRepeat(picked, { choice: 'yearly' }, '2026-01-31').nextRun, '2026-05-01')
  const stored = {
    frequency: 'monthly', interval_n: 3, next_run: '2026-12-01', end_date: null, remind_days_before: 2, is_active: false,
  }
  assert.deepEqual(repeatRuleFields(repeatDraft(stored)), stored)
  assert.equal(repeatDraft(stored).follows, false)
})

test('repeatRuleFields: reminders are clamped to 1–60 days, off is null', () => {
  const d = repeatDraft(null, { fromDate: '2026-09-23' })
  assert.equal(repeatRuleFields({ ...d, remind: true, remindDays: '90' }).remind_days_before, 60)
  assert.equal(repeatRuleFields({ ...d, remind: true, remindDays: '' }).remind_days_before, 3)
  assert.equal(repeatRuleFields({ ...d, remind: false, remindDays: '5' }).remind_days_before, null)
  assert.equal(repeatRuleFields({ ...d, endDate: '' }).end_date, null)
})

const entry = {
  id: 't1', kind: 'expense', amount_minor: 1299, currency: 'EUR', category_id: 'c1',
  account_id: null, description: 'Netflix', notes: null, spent_at: '2026-09-10',
}
const linked = {
  id: 'r1', kind: 'expense', amount_minor: 1499, currency: 'EUR', category_id: 'c1', description: 'Netflix',
  frequency: 'monthly', interval_n: 1, next_run: '2026-10-10', end_date: null, remind_days_before: null, is_active: true,
}

test('planRepeat: nothing on, nothing to do; switching Repeat on makes a rule from the entry', () => {
  const draft = repeatDraft(null, { fromDate: entry.spent_at })
  assert.deepEqual(planRepeat({ rule: null, repeat: false, draft, before: entry, entry }), { action: 'none' })
  const made = planRepeat({ rule: null, repeat: true, draft: editRepeat(draft, { remind: true, remindDays: '2' }), before: entry, entry })
  assert.equal(made.action, 'create')
  assert.deepEqual(made.fields, {
    kind: 'expense', amount_minor: 1299, currency: 'EUR', category_id: 'c1', account_id: null,
    description: 'Netflix', savings_from_income: false, paid_from_savings: false, frequency: 'monthly', interval_n: 1, next_run: '2026-10-10',
    end_date: null, remind_days_before: 2, is_active: true, source_transaction_id: 't1',
  })
  // A new entry links through its client_uuid.
  const fresh = planRepeat({ rule: null, repeat: true, draft, before: null, entry: { ...entry, id: undefined, client_uuid: 'cu' } })
  assert.equal(fresh.fields.source_client_uuid, 'cu')
})

test('planRepeat: a linked rule gets only what changed, is paused, or removed', () => {
  const draft = repeatDraft(linked)
  // Saved as loaded (an old charge's note fixed): the rule is left alone —
  // even though this charge's amount differs from the rule's current price.
  assert.deepEqual(planRepeat({ rule: linked, repeat: true, draft, before: entry, entry: { ...entry, notes: 'x' } }),
    { action: 'none' })
  // A new price on the entry reaches the rule; so does a new schedule.
  assert.deepEqual(planRepeat({ rule: linked, repeat: true, draft, before: entry, entry: { ...entry, amount_minor: 1599 } }),
    { action: 'update', id: 'r1', fields: { amount_minor: 1599 } })
  assert.deepEqual(planRepeat({
    rule: linked, repeat: true, draft: editRepeat(draft, { choice: 'quarterly', active: false }), before: entry, entry,
  }), { action: 'update', id: 'r1', fields: { interval_n: 3, is_active: false } })
  assert.deepEqual(planRepeat({ rule: linked, repeat: false, draft, before: entry, entry }), { action: 'delete', id: 'r1' })
})

// ---- What subscriptions charged in a period ----------------------------------
import { chargedGroups, chargedWording } from '../src/features/recurring/recurringMath.js'
import { periodFromValue } from '../src/shared/lib/periods.js'

const charge = (id, spent_at, amount_minor, recurring, extra = {}) => ({
  id, kind: 'expense', spent_at, amount_minor, currency: 'EUR', exchange_rate: 1,
  recurring_rule_id: recurring ? `rule-${id}` : null, recurring, ...extra,
})

test('chargedGroups: linked expense rows by their rule frequency, newest first, totals in base', () => {
  const rows = [
    charge('n1', '2025-03-03', 999, { frequency: 'monthly', interval_n: 1 }),
    charge('n2', '2025-04-03', 999, { frequency: 'monthly', interval_n: 1 }),
    charge('g', '2025-03-10', 500, { frequency: 'weekly', interval_n: 1 }),
    charge('d', '2025-03-11', 100, { frequency: 'daily', interval_n: 1 }),
    charge('q', '2025-02-01', 3000, { frequency: 'monthly', interval_n: 3 }),
    charge('y', '2025-05-15', 12000, { frequency: 'yearly', interval_n: 1 }, { spread_months: 12 }),
    charge('usd', '2025-06-03', 1000, { frequency: 'monthly', interval_n: 1 }, { currency: 'USD', exchange_rate: 0.9 }),
    charge('plain', '2025-03-04', 4000, null), // not a subscription charge
    charge('inc', '2025-03-05', 250000, { frequency: 'monthly', interval_n: 1 }, { kind: 'income' }),
  ]
  const groups = chargedGroups(rows, 'EUR')
  assert.deepEqual(groups.map((g) => [g.key, g.label]),
    [['weekly', 'Weekly'], ['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['yearly', 'Yearly']])
  const monthly = groups.find((g) => g.key === 'monthly')
  assert.deepEqual(monthly.charges.map((r) => r.id), ['usd', 'n2', 'n1'])
  assert.equal(monthly.total, 999 + 999 + 900)
  assert.equal(groups.find((g) => g.key === 'weekly').total, 600)
  // A yearly charge counts once, in full, on its date (not spread).
  assert.equal(groups.find((g) => g.key === 'yearly').total, 12000)
  assert.deepEqual(chargedGroups([rows[7], rows[8]], 'EUR'), [])
})

test('chargedGroups: a zero-decimal base stays whole', () => {
  const [g] = chargedGroups([
    charge('a', '2025-03-03', 980, { frequency: 'monthly', interval_n: 1 }, { currency: 'JPY' }),
    charge('b', '2025-04-03', 999, { frequency: 'monthly', interval_n: 1 }, { currency: 'EUR', exchange_rate: 161.5 }),
  ], 'JPY')
  assert.ok(Number.isInteger(g.total))
  assert.equal(g.total, 980 + 1613) // €9.99 × 161.5 = ¥1613.4 → ¥1613
})

test('chargedWording: subtitle and empty line per period', () => {
  const d = new Date(2026, 8, 25)
  assert.deepEqual(chargedWording(periodFromValue('m:2025-3', d)),
    { subtitle: 'Charged in March 2025', empty: 'No recurring charges in March 2025.' })
  assert.deepEqual(chargedWording(periodFromValue('y:2025', d)),
    { subtitle: 'Charged in 2025', empty: 'No recurring charges in 2025.' })
  assert.deepEqual(chargedWording(periodFromValue('y:2026', d)),
    { subtitle: 'Charged this year', empty: 'No recurring charges this year.' })
  assert.deepEqual(chargedWording(periodFromValue('all', d)),
    { subtitle: 'Charged so far', empty: 'No recurring charges yet.' })
})

import {
  baseHint, groupTotalParts, incomeRules, incomeTotalParts, ratesNotes, ruleRowParts,
} from '../src/features/recurring/recurringMath.js'

const ruleOf = (extra = {}) => ({
  id: 'r1', kind: 'expense', amount_minor: 1299, currency: 'EUR', frequency: 'monthly', interval_n: 1,
  next_run: '2020-10-03', end_date: null, is_active: true, remind_days_before: null, description: 'Music',
  categories: { name: 'Subscriptions', icon: null, color: null }, ...extra,
})

test('ruleRowParts: name, how often, next charge, tags, amount and hint', () => {
  assert.deepEqual(ruleRowParts(ruleOf(), { baseCurrency: 'EUR' }), {
    id: 'r1', title: 'Music', look: { key: 'streaming', tone: 'accent', tint: null }, active: true,
    meta: ['every month', 'next 3 Oct 2020'], remind: null, paused: null, amount: '€12.99', hint: null, tone: 'default',
  })
  const yearly = ruleRowParts(ruleOf({ frequency: 'yearly', amount_minor: 9600, remind_days_before: 3, is_active: false }),
    { baseCurrency: 'EUR' })
  assert.deepEqual(yearly.meta, ['every year', 'next 3 Oct 2020', '€8.00/mo in budgets'])
  assert.equal(yearly.remind, '3d')
  assert.equal(yearly.paused, 'Paused')
  assert.deepEqual(ruleRowParts(ruleOf({ frequency: 'yearly', amount_minor: 9600 }), { baseCurrency: 'EUR', separateYearly: true }).meta,
    ['every year', 'next 3 Oct 2020'])
  const usd = ruleRowParts(ruleOf({ currency: 'USD', kind: 'income', description: null, categories: null }),
    { baseCurrency: 'EUR', rates: { USD: 0.9 } })
  assert.equal(usd.title, 'Income')
  assert.equal(usd.hint, '≈ €11.69')
  assert.equal(usd.tone, 'positive')
  assert.equal(baseHint(ruleOf({ currency: 'PLN' }), 'EUR', {}), null)
})

test('groupTotalParts and ratesNotes: the headline and its notes', () => {
  assert.deepEqual(groupTotalParts({ key: 'monthly', unit: 'month', total: 2997, perMonth: 2997, converted: false, missing: [] }, 'EUR'),
    { label: 'Monthly total', value: '€29.97/month', perMonth: null, converted: null, missing: null })
  const yearly = groupTotalParts({ key: 'yearly', unit: 'year', total: 9600, perMonth: 800, converted: true,
    missing: [{ amount_minor: 2999, currency: 'PLN' }] }, 'EUR')
  assert.equal(yearly.value, '€96.00/year')
  assert.equal(yearly.perMonth, '≈ €8.00/month')
  assert.equal(yearly.converted, 'Other currencies converted at today’s rate.')
  assert.match(yearly.missing, /PLN.*29\.99 not included/)
  assert.deepEqual(ratesNotes(false, []), { converted: null, missing: null })
  assert.deepEqual(incomeRules([ruleOf(), ruleOf({ id: 'r2', kind: 'income' })]).map((r) => r.id), ['r2'])
  assert.deepEqual(incomeTotalParts({ perMonth: 250000, converted: false, missing: [] }, 'EUR'),
    { value: '≈ €2,500.00/month', converted: null, missing: null })
})

import {
  chargeParts, chargedHeadline, groupNote, nextChargeParts, showsUpcoming, upcomingToggle,
} from '../src/features/recurring/recurringMath.js'

test('Home\'s Recurring card: upcoming or charged, its rows, notes and toggle', () => {
  const d = new Date(2020, 8, 15)
  assert.equal(showsUpcoming(periodFromValue('m:2020-9', d), '2020-09-15'), true)
  assert.equal(showsUpcoming(periodFromValue('m:2020-10', d), '2020-09-15'), true)
  assert.equal(showsUpcoming(periodFromValue('m:2020-8', d), '2020-09-15'), false)
  assert.equal(showsUpcoming(periodFromValue('y:2020', d), '2020-09-15'), false)
  assert.equal(showsUpcoming(null, '2020-09-15'), true)
  assert.deepEqual(nextChargeParts(ruleOf({ currency: 'USD' }), 'EUR', { USD: 0.9 }), {
    id: 'r1', title: 'Music', look: { key: 'streaming', tone: 'accent', tint: null },
    meta: '3 Oct 2020 · every month', amount: '$12.99', hint: '≈ €11.69',
  })
  assert.equal(chargeParts({ id: 't1', kind: 'expense', spent_at: '2020-09-03', amount_minor: 1299, currency: 'EUR',
    description: null, categories: null, recurring: { frequency: 'yearly', interval_n: 1 } }).meta, '3 Sep 2020 · every year')
  assert.deepEqual(chargedHeadline({ key: 'monthly', total: 4200 }, 'EUR'), { label: 'Monthly charged', value: '€42.00' })
  assert.equal(groupNote('monthly', false), null)
  assert.equal(groupNote('yearly', false), 'Each counts in your monthly spending a twelfth at a time.')
  assert.match(groupNote('yearly', true), /Kept out/)
  assert.equal(upcomingToggle({ count: 3, next: [1, 2, 3] }), null)
  assert.deepEqual(upcomingToggle({ count: 5, next: [1, 2, 3] }), { showAll: 'Show all 5 charges', showNext: 'Show the next 3' })
})
