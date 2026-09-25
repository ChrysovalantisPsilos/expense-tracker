// Status page: response → state, the nine derived components, overrides /
// incidents / maintenance, and the headline.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SLOW_MS, httpState, emailState, deriveStates, effectiveStates, overall, stateWord, worse,
} from '../status/src/state.js'
import { COMPONENT_IDS } from '../status/src/components.js'

const now = new Date('2026-09-25T12:00:00Z')   // a Friday, before the ECB publishes
const ok = (latencyMs = 120, body = null) => ({ status: 200, latencyMs, body })
const snap = (o = {}) => ({ db_time: now.toISOString(), fx_latest_date: '2026-09-24', email_queue_overdue: 0, email_queue_retrying: 0, ...o })

test('httpState: status and latency → working / slow / down / unknown', () => {
  assert.equal(httpState(ok()), 'working')
  assert.equal(httpState(ok(SLOW_MS)), 'working')
  assert.equal(httpState(ok(SLOW_MS + 1)), 'slow')
  assert.equal(httpState({ status: 500, latencyMs: 50 }), 'down')
  assert.equal(httpState({ status: 404, latencyMs: 50 }), 'down')
  assert.equal(httpState({ status: 204, latencyMs: 50 }), 'down')
  assert.equal(httpState({ status: 204, latencyMs: 50 }, [200, 204]), 'working')
  assert.equal(httpState({ status: 429, latencyMs: 50 }), 'slow')
  assert.equal(httpState({ error: 'timeout', latencyMs: 8000 }), 'down')
  assert.equal(httpState({ error: 'network', latencyMs: 3 }), 'down')
  // A refused or missing key is our configuration, not an outage.
  assert.equal(httpState({ status: 401, latencyMs: 50 }), 'unknown')
  assert.equal(httpState({ skipped: true }), 'unknown')
  assert.equal(httpState(undefined), 'unknown')
})

test('emailState: overdue / retrying queue rows', () => {
  assert.equal(emailState(null), 'unknown')
  assert.equal(emailState(snap()), 'working')
  assert.equal(emailState(snap({ email_queue_retrying: 2 })), 'working')
  assert.equal(emailState(snap({ email_queue_retrying: 3 })), 'slow')
  assert.equal(emailState(snap({ email_queue_overdue: 1 })), 'slow')
  assert.equal(emailState(snap({ email_queue_overdue: 10 })), 'down')
})

test('deriveStates: all nine components from four probes', () => {
  const all = deriveStates({ app: ok(80), auth: ok(90), db: ok(200, snap()), reports: { status: 200, latencyMs: 60 } }, now)
  assert.deepEqual(Object.keys(all), COMPONENT_IDS)
  for (const id of COMPONENT_IDS) assert.equal(all[id].state, 'working', id)
  assert.equal(all.sync.latencyMs, 200)
  assert.equal(all.groups.latencyMs, null)

  // Database down: everything riding on it follows; the snapshot signals are unknown.
  const dbDown = deriveStates({ app: ok(), auth: ok(), db: { status: 503, latencyMs: 40 }, reports: ok() }, now)
  assert.deepEqual([dbDown.sync.state, dbDown.groups.state, dbDown.push.state, dbDown.bank.state], ['down', 'down', 'down', 'down'])
  assert.deepEqual([dbDown.email.state, dbDown.fx.state], ['unknown', 'unknown'])
  assert.equal(dbDown.app.state, 'working')

  // No anon key: the key-based probes are skipped → unknown, nothing crashes.
  const noKey = deriveStates({ app: ok(), auth: { skipped: true }, db: { skipped: true }, reports: ok() }, now)
  assert.deepEqual(['auth', 'sync', 'groups', 'email', 'push', 'fx', 'bank'].map((id) => noKey[id].state), Array(7).fill('unknown'))
  assert.deepEqual([noKey.app.state, noKey.reports.state], ['working', 'working'])

  // App slow → bank imports slow; stale rates → exchange rates slow.
  const mixed = deriveStates({ app: ok(SLOW_MS + 500), auth: ok(), db: ok(100, snap({ fx_latest_date: '2026-09-21' })), reports: ok() }, now)
  assert.equal(mixed.bank.state, 'slow')
  assert.equal(mixed.fx.state, 'slow')
})

test('effectiveStates: override > incident impact > maintenance > checks', () => {
  const auto = Object.fromEntries(COMPONENT_IDS.map((id) => [id, 'working']))
  auto.fx = 'down'
  const out = effectiveStates(auto, {
    overrides: [{ component: 'fx', state: 'working' }, { component: 'push', state: 'slow' }],
    incidents: [{ impact: 'partial', components: ['sync', 'groups'] }, { impact: 'major', components: ['groups'] }],
    maintenance: [{ components: ['sync', 'email'] }],
  })
  assert.equal(out.fx, 'working')      // override wins over a failing check
  assert.equal(out.push, 'slow')
  assert.equal(out.sync, 'partial')    // incident worse than maintenance
  assert.equal(out.groups, 'down')     // worst of two incidents
  assert.equal(out.email, 'maint')
  assert.equal(out.app, 'working')
  assert.equal(effectiveStates({}, {}).app, 'unknown')
  assert.equal(effectiveStates({ bank: 'unknown' }, { incidents: [{ impact: 'minor', components: ['bank'] }] }).bank, 'slow')
})

test('overall: headline from the states and open incidents', () => {
  const working = Object.fromEntries(COMPONENT_IDS.map((id) => [id, 'working']))
  const up = overall(working)
  assert.deepEqual([up.tone, up.title, up.working], ['up', 'All systems working', 9])

  const fx = overall({ ...working, fx: 'slow' })
  assert.equal(fx.tone, 'degraded')
  assert.equal(fx.chip, 'Minor issue')
  assert.equal(fx.title, 'Exchange rates are running late')
  assert.match(fx.sub, /latest rate we have.*Everything else is working normally\.$/)
  assert.equal(fx.working, 8)

  assert.equal(overall({ ...working, email: 'down' }).title, 'Email is not working right now')
  const two = overall({ ...working, email: 'slow', reports: 'down' })
  assert.deepEqual([two.tone, two.title], ['down', 'Some parts of Budgeer are having trouble'])
  assert.match(two.sub, /^Email, Reports\./)

  const inc = overall({ ...working, bank: 'slow' }, { incidents: [{ title: 'Bank imports are slow', latest: 'Looking into it.' }] })
  assert.deepEqual([inc.title, inc.sub, inc.tone], ['Bank imports are slow', 'Looking into it.', 'degraded'])

  assert.equal(overall({ ...working, sync: 'maint' }, { maintenance: [{ message: 'Upgrading.' }] }).tone, 'maint')
  assert.equal(overall({}).tone, 'none')
  assert.equal(overall({ ...working, auth: 'unknown' }).title, 'Budgeer is working')
})

test('stateWord and worse', () => {
  assert.equal(stateWord('slow', 'fx'), 'Running late')
  assert.equal(stateWord('slow', 'email'), 'Slow')
  assert.equal(stateWord('working', 'app'), 'Working')
  assert.equal(stateWord('unknown', 'app'), 'No data')
  assert.equal(stateWord('bogus', 'app'), 'No data')
  assert.equal(worse('working', 'down'), 'down')
  assert.equal(worse('slow', 'maint'), 'slow')
  assert.equal(worse('unknown', 'working'), 'working')
})
