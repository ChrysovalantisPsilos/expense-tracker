// Recurring rules in the base currency at the latest ECB rate
// (supabase/functions/_shared/ruleFx.ts, re-exported by src/shared/lib/ruleFx.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  foreignCurrencies, ruleInBase, rulesInBase, missingRatesNote,
} from '../src/shared/lib/ruleFx.js'
import { CONVERTED_NOTE } from '../supabase/functions/_shared/ruleFx.ts'
import { formatMoney } from '../src/shared/lib/currency.js'
import { fmtMinor } from '../supabase/functions/_shared/money.ts'
import { periodProjection } from '../src/features/dashboard/dashboardMath.js'

const rule = (o) => ({
  id: o.currency, is_active: true, kind: 'expense', frequency: 'monthly', interval_n: 1, next_run: '2026-10-01', ...o,
})
const pln = rule({ amount_minor: 2999, currency: 'PLN' })
const usd = rule({ amount_minor: 1000, currency: 'USD' })
const jpy = rule({ amount_minor: 1500, currency: 'JPY' })
const eur = rule({ amount_minor: 999, currency: 'EUR' })
const RATES = { PLN: 0.2327, USD: 0.9, JPY: 0.0062 }

test('foreignCurrencies: the rates to fetch, sorted and unique', () => {
  assert.deepEqual(foreignCurrencies([pln, usd, eur, { ...pln, id: 'x' }], 'EUR'), ['PLN', 'USD'])
  assert.deepEqual(foreignCurrencies([eur], 'EUR'), [])
  assert.deepEqual(foreignCurrencies(null, 'EUR'), [])
})

test('ruleInBase: EUR base with PLN, USD and JPY rules', () => {
  assert.equal(ruleInBase(eur, 'EUR', RATES), eur) // same currency: itself
  assert.deepEqual(ruleInBase(pln, 'EUR', RATES),
    { ...pln, amount_minor: 698, currency: 'EUR', exchange_rate: 0.2327 }) // 697.87 → 698
  assert.equal(ruleInBase(usd, 'EUR', RATES).amount_minor, 900)
  assert.equal(ruleInBase(jpy, 'EUR', RATES).amount_minor, 930) // ¥1500 (no decimals) × 0.0062 = €9.30
  // No rate, a zero or garbage rate: null, never 1.
  assert.equal(ruleInBase(pln, 'EUR', {}), null)
  assert.equal(ruleInBase(pln, 'EUR', { PLN: 0 }), null)
  assert.equal(ruleInBase(pln, 'EUR', { PLN: 'x' }), null)
  assert.equal(ruleInBase(pln, 'EUR', null), null)
})

test('ruleInBase: a zero-decimal base, rounding half away from zero', () => {
  // $9.99 at 150.5 = ¥1503.495 → ¥1503; €0.05 at 163.9 = ¥8.195 → ¥8.
  assert.equal(ruleInBase(rule({ amount_minor: 999, currency: 'USD' }), 'JPY', { USD: 150.5 }).amount_minor, 1503)
  assert.equal(ruleInBase(rule({ amount_minor: 5, currency: 'EUR' }), 'JPY', { EUR: 163.9 }).amount_minor, 8)
  // A tie: ¥275 at 0.0062 = €1.705 → €1.71 (as SQL to_base_minor).
  assert.equal(ruleInBase(rule({ amount_minor: 275, currency: 'JPY' }), 'EUR', { JPY: 0.0062 }).amount_minor, 171)
})

test('rulesInBase: converted, missing and the notes', () => {
  const all = rulesInBase([eur, pln, usd, jpy], 'EUR', { USD: 0.9, JPY: 0.0062 })
  assert.deepEqual(all.rules.map((r) => [r.id, r.currency, r.amount_minor]),
    [['EUR', 'EUR', 999], ['USD', 'EUR', 900], ['JPY', 'EUR', 930]])
  assert.deepEqual(all.missing, [pln])
  assert.equal(all.converted, true)
  assert.equal(missingRatesNote(all.missing, formatMoney),
    `${formatMoney(2999, 'PLN')} not included — no exchange rate right now.`) // "PLN 29.99"
  assert.equal(missingRatesNote([pln, jpy], fmtMinor),
    '29.99 PLN, 1500 JPY not included — no exchange rate right now.')
  assert.equal(missingRatesNote([], formatMoney), null)
  // The app words it in its own language.
  assert.equal(missingRatesNote([pln], fmtMinor, (amounts) => `${amounts}: χωρίς ισοτιμία`),
    `${fmtMinor(Number(pln.amount_minor), pln.currency)}: χωρίς ισοτιμία`)
  assert.equal(CONVERTED_NOTE, 'Other currencies converted at today’s rate.')
  // All in the base currency: unchanged, nothing converted.
  const same = rulesInBase([eur], 'EUR', {})
  assert.deepEqual(same, { rules: [eur], missing: [], converted: false })
})

test('the Overview projection counts foreign rules at the latest rate, not face value', () => {
  const income = rule({ id: 'pay', kind: 'income', amount_minor: 100000, currency: 'GBP', next_run: '2026-09-28' })
  const rules = [{ ...pln, next_run: '2026-09-27' }, income]
  const at = (rates) => periodProjection(rulesInBase(rules, 'EUR', rates).rules, '2026-09-30', '2026-09-25')
  const pick = ({ expense, income, net }) => ({ expense, income, net })
  assert.deepEqual(pick(at({ PLN: 0.2327, GBP: 1.15 })), { expense: 698, income: 115000, net: 115000 - 698 })
  // Offline: nothing foreign counts rather than PLN 29.99 as €29.99.
  assert.deepEqual(pick(at({})), { expense: 0, income: 0, net: 0 })
})
