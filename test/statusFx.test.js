// Status page: ECB exchange-rate staleness in TARGET business days.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { easterSunday, isBusinessDay, expectedLatest, missedPublications, fxState } from '../status/src/fxCalendar.js'

const at = (iso) => Date.parse(iso)
const day = (t) => new Date(t).toISOString().slice(0, 10)

test('Easter and the TARGET holidays', () => {
  assert.equal(day(easterSunday(2026)), '2026-04-05')
  assert.equal(day(easterSunday(2027)), '2027-03-28')
  assert.equal(day(easterSunday(2024)), '2024-03-31')
  for (const d of ['2026-01-01', '2026-04-03', '2026-04-06', '2026-05-01', '2026-12-25', '2026-12-26', '2026-09-26', '2026-09-27']) {
    assert.equal(isBusinessDay(at(`${d}T10:00:00Z`)), false, d)
  }
  for (const d of ['2026-04-02', '2026-04-07', '2026-09-25', '2026-12-24', '2026-12-28']) {
    assert.equal(isBusinessDay(at(`${d}T10:00:00Z`)), true, d)
  }
})

test('expectedLatest: today once published (16:00 UTC), else the previous business day', () => {
  assert.equal(day(expectedLatest(at('2026-09-25T15:59:00Z'))), '2026-09-24')
  assert.equal(day(expectedLatest(at('2026-09-25T16:00:00Z'))), '2026-09-25')
  assert.equal(day(expectedLatest(at('2026-09-27T12:00:00Z'))), '2026-09-25')   // Sunday → Friday
  assert.equal(day(expectedLatest(at('2026-09-28T09:00:00Z'))), '2026-09-25')   // Monday morning → Friday
  assert.equal(day(expectedLatest(at('2026-04-07T09:00:00Z'))), '2026-04-02')   // after Easter → Maundy Thursday
})

test('missedPublications skips weekends and holidays', () => {
  assert.equal(missedPublications('2026-09-25', at('2026-09-28T09:00:00Z')), 0)
  assert.equal(missedPublications('2026-09-24', at('2026-09-28T09:00:00Z')), 1)
  assert.equal(missedPublications('2026-09-24', at('2026-09-28T17:00:00Z')), 2)
  assert.equal(missedPublications('2026-04-02', at('2026-04-07T17:00:00Z')), 1)  // Good Friday + Easter Monday don't count
  assert.equal(missedPublications('2026-12-23', at('2026-12-28T10:00:00Z')), 1)  // 24 Dec only
  assert.equal(missedPublications('2026-09-30', at('2026-09-28T17:00:00Z')), 0)  // a date "ahead" never counts
})

test('fxState: slow from two missed publications, unknown without a date', () => {
  assert.equal(fxState('2026-09-25', new Date('2026-09-28T09:00:00Z')), 'working')
  assert.equal(fxState('2026-09-24', new Date('2026-09-28T09:00:00Z')), 'working')
  assert.equal(fxState('2026-09-24', new Date('2026-09-28T17:00:00Z')), 'slow')
  assert.equal(fxState('2026-08-01', at('2026-09-28T17:00:00Z')), 'slow')
  assert.equal(fxState(null, new Date()), 'unknown')
  assert.equal(fxState('25/09/2026', new Date()), 'unknown')
})
