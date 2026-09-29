// Plan mode's wording (src/features/plan/planText.js): payments per period,
// row lines, ideas and changes, in English.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  freqLabel, perUnit, serviceCount, itemName, monthList, rowMeta, ideaText, changeLine,
} from '../src/features/plan/planText.js'
import { formatMoney } from '../src/shared/lib/currency.js'
import { shortDate } from '../src/shared/lib/dates.js'
import { t as tr } from '../src/shared/lib/i18n/i18n.js'

const t = (key, values) => tr(`plan:${key}`, values)
const eur = (minor) => formatMoney(minor, 'EUR')
const rule = (o) => ({ amount_minor: 1399, currency: 'EUR', frequency: 'monthly', interval_n: 1, ...o })

test('freqLabel: a plain choice, or "every N …" for an interval', () => {
  assert.equal(freqLabel(rule()), 'Monthly')
  assert.equal(freqLabel(rule({ frequency: 'monthly', interval_n: 3 })), 'Quarterly')
  assert.equal(freqLabel(rule({ frequency: 'weekly', interval_n: 2 })), 'every 2 weeks')
})

test('perUnit: a charge in its own currency per the period it repeats', () => {
  assert.equal(perUnit(rule()), `${eur(1399)} a month`)
  assert.equal(perUnit(rule({ frequency: 'yearly', amount_minor: 48000 })), `${eur(48000)} a year`)
  assert.equal(perUnit(rule({ frequency: 'weekly', interval_n: 2, amount_minor: 1000 })), `${eur(1000)} every 2 weeks`)
  assert.equal(perUnit(rule({ currency: 'JPY', amount_minor: 500 })), `${formatMoney(500, 'JPY')} a month`)
})

test('serviceCount and monthList', () => {
  assert.equal(serviceCount('music', 2, t), '2 music services')
  assert.equal(serviceCount('vpn', 3, t), '3 VPNs')
  assert.equal(monthList(['2026-07-01', '2026-08-01', '2026-09-01']), 'Jul, Aug and Sep')
  assert.equal(monthList(['2026-01-01']), 'Jan')
})

test('itemName: its own name, else its kind; the derived salary row is "Salary"', () => {
  assert.equal(itemName({ name: 'Netflix', kind: 'expense' }), 'Netflix')
  assert.equal(itemName({ name: '', kind: 'expense' }), 'Expense')
  assert.equal(itemName({ name: '', kind: 'income' }), 'Income')
  assert.equal(itemName({ salary: true, name: 'Pay', kind: 'income' }), 'Salary')
})

test('rowMeta: salary, added, a yearly charge seen per month, else next date', () => {
  const next = '2026-10-05'
  assert.equal(rowMeta({ salary: true, before: rule() }, 'month', t), 'Average of the last 3 months · from your entries')
  assert.equal(rowMeta({ added: true, after: rule(), next }, 'month', t), `Monthly · from ${shortDate(next)}`)
  const yearly = rule({ frequency: 'yearly', amount_minor: 12000 })
  assert.equal(rowMeta({ before: yearly, next }, 'month', t), `${eur(12000)} a year ÷ 12`)
  assert.equal(rowMeta({ before: yearly, next }, 'year', t), `Yearly · next ${shortDate(next)}`)
  assert.equal(rowMeta({ before: yearly, after: rule(), changed: true, next }, 'month', t), `Monthly · next ${shortDate(next)}`)
})

test('ideaText: each kind of idea reads as a headline and a short line', () => {
  const rise = { from: 999, to: 1299, currency: 'EUR', pct: 30, since: '2026-06-01' }
  const overlap = ideaText({ kind: 'overlap', year: 24000, type: 'music', ruleIds: ['a', 'b'], names: ['Spotify', ''] }, 'EUR', t)
  assert.deepEqual(overlap, {
    name: '2 music services',
    title: `2 music services · ${eur(24000)}/yr`,
    body: 'Spotify and … do the same job. Pick the ones you could live without.',
  })
  assert.equal(ideaText({ kind: 'priceUp', year: 3600, name: 'Netflix', rise }, 'EUR', t).body,
    `${eur(999)} → ${eur(1299)} since ${shortDate('2026-06-01')}.`)
  assert.equal(ideaText({ kind: 'compare', year: 3600, name: 'Insurance', rise }, 'EUR', t).title,
    'Insurance went up 30% · worth comparing offers')
  assert.equal(ideaText({
    kind: 'overBudget', year: 6000, name: 'Gym', category: { name: 'Fitness' }, months: ['2026-07-01', '2026-08-01'],
  }, 'EUR', t).body, 'Fitness went over its budget in Jul and Aug.')
  assert.deepEqual(ideaText({ kind: 'biggest', year: 9000, name: 'Car' }, 'EUR', t), {
    title: `Car · ${eur(9000)}/yr`, body: 'Your biggest recurring cost you could cut.',
  })
})

test('changeLine: added, cancelled or stopped, and edited changes in words', () => {
  const was = rule(); const now = rule({ amount_minor: 999 })
  assert.equal(changeLine({ added: true, kind: 'expense', after: now }, t), `New payment · ${perUnit(now)}`)
  assert.equal(changeLine({ added: true, kind: 'income', after: now }, t), `New income · ${perUnit(now)}`)
  assert.equal(changeLine({ cancelled: true, kind: 'expense', before: was }, t), `${perUnit(was)} → cancelled`)
  assert.equal(changeLine({ cancelled: true, kind: 'income', before: was }, t), `${perUnit(was)} → stopped`)
  assert.equal(changeLine({ kind: 'expense', before: was, after: now }, t), `${perUnit(was)} → ${perUnit(now)}`)
})
