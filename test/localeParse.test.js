import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseLocaleAmount, monthNumber, foldText, ymd, parseDateText, findDates,
} from '../src/shared/lib/localeParse.js'

test('parseLocaleAmount: European and English separators', () => {
  assert.equal(parseLocaleAmount('1.234,56'), 1234.56)
  assert.equal(parseLocaleAmount('1,234.56'), 1234.56)
  assert.equal(parseLocaleAmount('12,50'), 12.5)
  assert.equal(parseLocaleAmount('12.50'), 12.5)
  assert.equal(parseLocaleAmount('1 234,56'), 1234.56)
  assert.equal(parseLocaleAmount('1 234,56'), 1234.56)
  assert.equal(parseLocaleAmount("1'234.56"), 1234.56)
  assert.equal(parseLocaleAmount('1.234.567'), 1234567)
})

test('parseLocaleAmount: signs — leading, trailing, parentheses, DR/CR, Χ/Π', () => {
  assert.equal(parseLocaleAmount('-12,50'), -12.5)
  assert.equal(parseLocaleAmount('12,50-'), -12.5)
  assert.equal(parseLocaleAmount('(12.50)'), -12.5)
  assert.equal(parseLocaleAmount('+3.00'), 3)
  assert.equal(parseLocaleAmount('−7,10'), -7.1) // U+2212 minus
  assert.equal(parseLocaleAmount('12.50 DR'), -12.5)
  assert.equal(parseLocaleAmount('12.50 CR'), 12.5)
  assert.equal(parseLocaleAmount('1.240,69 Π'), 1240.69)
  assert.equal(parseLocaleAmount('42,30 Χ'), -42.3)
})

test('parseLocaleAmount: currency symbols and codes around the number', () => {
  assert.equal(parseLocaleAmount('€ 1.234,56'), 1234.56)
  assert.equal(parseLocaleAmount('-€12.00'), -12)
  assert.equal(parseLocaleAmount('12,00 EUR'), 12)
  assert.equal(parseLocaleAmount('GBP 7.5'), 7.5)
  assert.equal(parseLocaleAmount('3 euros'), 3)
})

test('parseLocaleAmount: the column decimal wins; a lone 1–2 digit tail stays decimal', () => {
  assert.equal(parseLocaleAmount('1.234', ','), 1234)
  assert.equal(parseLocaleAmount('1,234', '.'), 1234)
  assert.equal(parseLocaleAmount('12.50', ','), 12.5)
  assert.equal(parseLocaleAmount('12,5', '.'), 12.5)
  assert.equal(parseLocaleAmount('1.234,5', ','), 1234.5)
})

test('parseLocaleAmount: anything that is not clearly a number is NaN', () => {
  for (const s of ['', null, undefined, 'abc', 'GR0000000000000000000000000', '21/07/2026',
    '12.34.56,78,9', 'Balance', 'BE00 0000 0000 0000', 'N/A']) {
    assert.ok(Number.isNaN(parseLocaleAmount(s)), String(s))
  }
})

test('monthNumber: EN / FR / NL / EL names, accents and tonos ignored', () => {
  assert.equal(monthNumber('Jul'), 7)
  assert.equal(monthNumber('juillet'), 7)
  assert.equal(monthNumber('juli'), 7)
  assert.equal(monthNumber('Ιουλ.'), 7)
  assert.equal(monthNumber('Ιουλίου'), 7)
  assert.equal(monthNumber('août'), 8)
  assert.equal(monthNumber('Μαΐου'), 5)
  assert.equal(monthNumber('mrt'), 3)
  assert.equal(monthNumber('Δεκεμβρίου'), 12)
  assert.equal(monthNumber('Total'), null)
})

test('parseDateText: ISO, compact, numeric orders, named months, trailing time', () => {
  assert.equal(parseDateText('2026-09-01T23:30:00'), '2026-09-01')
  assert.equal(parseDateText('20260901'), '2026-09-01')
  assert.equal(parseDateText('03/04/2026'), '2026-04-03')
  assert.equal(parseDateText('03/04/2026', 'mdy'), '2026-03-04')
  assert.equal(parseDateText('13/04/2026', 'mdy'), '2026-04-13') // can only be day-first
  assert.equal(parseDateText('1.9.26 08:00'), '2026-09-01')
  assert.equal(parseDateText('21-JUL-26'), '2026-07-21')
  assert.equal(parseDateText('Jul 21, 2026'), '2026-07-21')
  assert.equal(parseDateText('May 25, 2022'), '2022-05-25') // Revolut's consolidated statement
  assert.equal(parseDateText('Jun 4, 2022', 'mdy'), '2022-06-04')
  assert.equal(parseDateText('21 Ιουλ 2026'), '2026-07-21')
  assert.equal(parseDateText('31/02/2026'), null)
  assert.equal(parseDateText('12,50'), null)
  assert.equal(parseDateText(''), null)
})

test('findDates: dates inside free text, in order', () => {
  assert.deepEqual(findDates('Ticket 0045 le 03 août 2026 à 09:14, due 2026-09-01'), ['2026-08-03', '2026-09-01'])
  assert.deepEqual(findDates('TOTAL 12.50 EUR 2026'), [])
  assert.deepEqual(findDates('ref 123/45/67890'), [])
})

test('foldText and ymd', () => {
  assert.equal(foldText('Ημ/νία Αξίας'), 'ημ/νια αξιασ')
  assert.equal(foldText('Date d’exécution'), 'date d’execution')
  assert.equal(ymd(2026, 2, 29), null)
  assert.equal(ymd(2028, 2, 29), '2028-02-29')
  assert.equal(ymd(26, 9, 1), '2026-09-01')
  assert.equal(ymd(2026, 13, 1), null)
})
