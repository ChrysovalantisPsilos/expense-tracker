// Status page: admin input validation and length limits.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  LIMITS, validateIncident, validateUpdate, validateIncidentEdit, validateMaintenance,
  validateOverrides, parseUtcLocal, parseId, formObject,
} from '../status/src/validate.js'

const good = { title: '  Bank imports are slow ', parts: ['bank', 'app'], impact: 'minor', stage: 'investigating', message: 'Looking\r\ninto it.' }

test('validateIncident: trims, orders parts, normalises line breaks', () => {
  const v = validateIncident(good)
  assert.equal(v.ok, true)
  assert.deepEqual(v.value, { title: 'Bank imports are slow', components: ['app', 'bank'], impact: 'minor', stage: 'investigating', message: 'Looking\ninto it.' })
  assert.deepEqual(validateIncident({ ...good, parts: 'fx' }).value.components, ['fx'])
})

test('validateIncident: refuses empty, too long, unknown and control characters', () => {
  const bad = validateIncident({ title: '', parts: [], impact: 'apocalypse', stage: 'x', message: '' })
  assert.equal(bad.ok, false)
  assert.deepEqual(Object.keys(bad.errors).sort(), ['impact', 'message', 'parts', 'stage', 'title'])
  assert.ok(validateIncident({ ...good, title: 'x'.repeat(LIMITS.title + 1) }).errors.title)
  assert.equal(validateIncident({ ...good, title: 'x'.repeat(LIMITS.title) }).ok, true)
  assert.ok(validateIncident({ ...good, message: 'y'.repeat(LIMITS.message + 1) }).errors.message)
  assert.ok(validateIncident({ ...good, parts: ['bank', 'admin'] }).errors.parts)
  assert.ok(validateIncident({ ...good, title: 'two\nlines' }).errors.title)
  assert.ok(validateIncident({ ...good, message: 'bell\u0007' }).errors.message)
  assert.ok(validateIncident({ ...good, title: ['a', 'b'] }).ok, 'first of repeated values is used')
  assert.ok(validateIncident({ ...good, title: undefined }).errors.title)
  // HTML is allowed as text (it's escaped on output), not stripped.
  assert.equal(validateIncident({ ...good, title: '<b>hi</b>' }).value.title, '<b>hi</b>')
})

test('validateUpdate and validateIncidentEdit', () => {
  assert.equal(validateUpdate({ stage: 'resolved', message: 'Fixed.' }).ok, true)
  assert.ok(validateUpdate({ stage: 'done', message: 'Fixed.' }).errors.stage)
  const e = validateIncidentEdit({ ...good, 'msg-3': 'First', 'msg-9': 'Second', 'msg-99': 'not ours' }, [3, 9])
  assert.equal(e.ok, true)
  assert.deepEqual(e.value.messages, [{ id: 3, message: 'First' }, { id: 9, message: 'Second' }])
  assert.ok(validateIncidentEdit({ ...good, 'msg-3': '' }, [3]).errors['msg-3'])
})

test('parseUtcLocal / validateMaintenance', () => {
  assert.equal(parseUtcLocal('2026-10-04T02:00'), '2026-10-04T02:00:00.000Z')
  for (const bad of ['2026-02-30T02:00', '2026-10-04T24:00', '2026-10-04 02:00', '', 'x']) assert.equal(parseUtcLocal(bad), null, bad)
  const m = { title: 'Database upgrade', parts: ['sync', 'groups'], starts: '2026-10-04T02:00', ends: '2026-10-04T02:30', message: 'Brief pause.' }
  const v = validateMaintenance(m)
  assert.equal(v.ok, true)
  assert.equal(v.value.endsAt, '2026-10-04T02:30:00.000Z')
  assert.ok(validateMaintenance({ ...m, ends: '2026-10-04T01:00' }).errors.ends)
  assert.ok(validateMaintenance({ ...m, ends: '2026-10-12T02:00' }).errors.ends, 'over 7 days')
  assert.ok(validateMaintenance({ ...m, starts: 'soon' }).errors.starts)
})

test('validateOverrides: every component, default automatic, fixed choices', () => {
  const v = validateOverrides({ 'ov-push': 'slow', 'ov-fx': 'automatic' })
  assert.equal(v.ok, true)
  assert.equal(v.value.push, 'slow')
  assert.equal(v.value.app, 'automatic')
  assert.equal(Object.keys(v.value).length, 9)
  assert.ok(validateOverrides({ 'ov-push': 'maint' }).errors['ov-push'])
})

test('parseId and formObject', () => {
  assert.equal(parseId('42'), 42)
  for (const bad of ['0', '-1', '1e3', '01', 'abc', '12345678901', '']) assert.equal(parseId(bad), null, bad)
  const fd = new FormData()
  fd.append('parts', 'app'); fd.append('parts', 'fx'); fd.append('title', 'T')
  fd.append('file', new Blob(['x']))
  assert.deepEqual(formObject(fd), { parts: ['app', 'fx'], title: 'T' })
})
