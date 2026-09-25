// Pure state logic: what a check's response means, how the nine components
// are derived from the four probes, how overrides / incidents / maintenance
// change what's shown, and the headline for the whole page.
//
// States: working | slow | partial | down | maint | unknown. The checks only
// ever produce working / slow / down / unknown; "partial" comes from an
// incident's impact and "maint" from planned maintenance.
import { COMPONENTS, componentById } from './components.js'
import { fxState } from './fxCalendar.js'

// A response slower than SLOW_MS counts as slow. Every probe is a tiny request
// (a health endpoint, a CORS preflight, one cheap RPC, the app's HTML), which
// normally answers in well under a second from Cloudflare's edge, so 3 s means
// people are waiting noticeably. A probe that hasn't answered after TIMEOUT_MS
// counts as down.
export const SLOW_MS = 3000
export const TIMEOUT_MS = 8000

// Worst first when combining; also the order for a day's "worst" bar.
const SEVERITY = { unknown: 0, working: 1, maint: 2, slow: 3, partial: 4, down: 5 }
export const worse = (a, b) => ((SEVERITY[b] ?? 0) > (SEVERITY[a] ?? 0) ? b : a)

// One HTTP probe → state. `probe` is { skipped } (no key to call it with),
// { error } (timeout / network failure) or { status, latencyMs }.
export function httpState(probe, expect = [200]) {
  if (!probe || probe.skipped) return 'unknown'
  if (probe.error) return 'down'
  // A refused key is a configuration problem on our side, not an outage.
  if (probe.status === 401 || probe.status === 403) return 'unknown'
  if (probe.status === 429) return 'slow'
  if (!expect.includes(probe.status)) return 'down'
  return probe.latencyMs > SLOW_MS ? 'slow' : 'working'
}

// The email signal from status_snapshot(): rows in the privacy email queue
// that are overdue (the 5-minute sweep isn't sending) or retrying after a
// failed send. Many overdue rows means sending has stopped.
export function emailState(snapshot) {
  if (!snapshot) return 'unknown'
  const overdue = Number(snapshot.email_queue_overdue) || 0
  const retrying = Number(snapshot.email_queue_retrying) || 0
  if (overdue >= 10) return 'down'
  if (overdue > 0 || retrying >= 3) return 'slow'
  return 'working'
}

// Two things a feature needs both of: the worse of them, except that "can't
// tell" wins over "fine".
function both(a, b) {
  if (a === 'down' || b === 'down') return 'down'
  if (a === 'slow' || b === 'slow') return 'slow'
  if (a === 'unknown' || b === 'unknown') return 'unknown'
  return 'working'
}

// The four probes → the nine components' automatic states.
//   app      GET APP_URL
//   auth     GET /auth/v1/health
//   db       POST /rest/v1/rpc/status_snapshot (body: the snapshot)
//   reports  OPTIONS /functions/v1/generate-report (CORS preflight)
// Derived: sync, groups and push ride on the database (realtime has no
// key-free health endpoint and its changes come from the same database; the
// group logic is SQL; push fan-out is a database trigger); email and exchange
// rates read the snapshot; bank imports run in the browser, so they need the
// app and the database.
export function deriveStates(probes, now) {
  const app = httpState(probes.app)
  const auth = httpState(probes.auth)
  const db = httpState(probes.db)
  const reports = httpState(probes.reports, [200, 204])
  const snapshot = db === 'working' || db === 'slow' ? probes.db.body : null
  const lat = (p) => (p && Number.isFinite(p.latencyMs) ? Math.round(p.latencyMs) : null)
  return {
    app: { state: app, latencyMs: lat(probes.app) },
    auth: { state: auth, latencyMs: lat(probes.auth) },
    sync: { state: db, latencyMs: lat(probes.db) },
    groups: { state: db, latencyMs: null },
    email: { state: emailState(snapshot), latencyMs: null },
    push: { state: db, latencyMs: null },
    reports: { state: reports, latencyMs: lat(probes.reports) },
    fx: { state: snapshot ? fxState(snapshot.fx_latest_date, now) : 'unknown', latencyMs: null },
    bank: { state: both(app, db), latencyMs: null },
  }
}

const IMPACT_STATE = { minor: 'slow', partial: 'partial', major: 'down' }
export const impactState = (impact) => IMPACT_STATE[impact] || 'slow'

// What each component shows: an override wins outright; otherwise planned
// maintenance shows as "maint", and an open incident makes it at least as bad
// as its impact.
//   auto        { [id]: state }
//   overrides   [{ component, state }]
//   incidents   open incidents [{ impact, components: [ids] }]
//   maintenance active windows [{ components: [ids] }]
export function effectiveStates(auto, { overrides = [], incidents = [], maintenance = [] }) {
  const out = {}
  for (const { id } of COMPONENTS) {
    const override = overrides.find((o) => o.component === id)
    if (override) { out[id] = override.state; continue }
    let s = auto[id] || 'unknown'
    if (maintenance.some((m) => m.components.includes(id))) s = 'maint'
    for (const inc of incidents) {
      if (inc.components.includes(id)) s = worse(s, impactState(inc.impact))
    }
    out[id] = s
  }
  return out
}

const SLOW_TEXT = 'Things may take longer than usual.'
const DOWN_TEXT = 'You may not be able to use it for now.'

// The hero: tone (up | degraded | down | maint | none), chip, title, sub.
// An open incident's own words lead; otherwise the headline is built from the
// component states.
export function overall(states, { incidents = [], maintenance = [] } = {}) {
  const list = COMPONENTS.map((c) => ({ c, s: states[c.id] || 'unknown' }))
  const bad = list.filter((x) => x.s === 'down' || x.s === 'partial')
  const slow = list.filter((x) => x.s === 'slow')
  const unknown = list.filter((x) => x.s === 'unknown')
  const working = list.filter((x) => x.s === 'working').length
  const affected = list.filter((x) => x.s === 'down' || x.s === 'partial' || x.s === 'slow')
  const tone = bad.length ? 'down' : slow.length ? 'degraded' : null
  const others = affected.length && affected.length + unknown.length < list.length
    ? ' Everything else is working normally.' : ''

  if (incidents.length) {
    const inc = incidents[0]
    const t = tone || (maintenance.length ? 'maint' : 'degraded')
    return { tone: t, chip: CHIP[t], title: inc.title, sub: inc.latest || '', working }
  }
  if (affected.length === 1) {
    const { c, s } = affected[0]
    const what = s === 'slow' ? (c.slowWord || 'running slow') : s === 'partial' ? 'partly down' : 'not working right now'
    const note = c.note || (s === 'slow' ? SLOW_TEXT : DOWN_TEXT)
    return { tone, chip: CHIP[tone], title: `${c.name} ${c.verb} ${what}`, sub: note + others, working }
  }
  if (affected.length > 1) {
    return {
      tone, chip: CHIP[tone],
      title: bad.length >= 5 ? 'Budgeer is having trouble' : 'Some parts of Budgeer are having trouble',
      sub: `${affected.map((x) => x.c.name).join(', ')}.${others}`, working,
    }
  }
  if (maintenance.length) {
    return { tone: 'maint', chip: CHIP.maint, title: 'Planned maintenance in progress', sub: maintenance[0].message || '', working }
  }
  if (unknown.length === list.length) {
    return { tone: 'none', chip: CHIP.none, title: 'Checking Budgeer…', sub: 'The first checks haven’t finished yet.', working }
  }
  if (unknown.length) {
    return { tone: 'up', chip: CHIP.up, title: 'Budgeer is working', sub: 'Some parts couldn’t be checked just now; everything we could check is running normally.', working }
  }
  return { tone: 'up', chip: CHIP.up, title: 'All systems working', sub: 'Everything in Budgeer is running normally.', working }
}

const CHIP = { up: 'All good', degraded: 'Minor issue', down: 'Outage', maint: 'Maintenance', none: 'Checking' }

// Chip words per state, as in the design ("Running late" only for exchange
// rates, whose slowness is lateness).
export function stateWord(state, id) {
  if (state === 'slow') return componentById(id)?.slowWord ? 'Running late' : 'Slow'
  return STATE_WORDS[state] || STATE_WORDS.unknown
}
const STATE_WORDS = { working: 'Working', partial: 'Partly down', down: 'Not working', maint: 'Maintenance', unknown: 'No data' }
