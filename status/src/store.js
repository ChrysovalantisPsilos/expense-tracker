// All D1 access for the status page. Views and handlers get plain objects.
import { COMPONENT_IDS } from './components.js'
import { dayKey, addDays, mergeDay } from './uptime.js'

const DAY = 86400000
const CHECKS_KEEP_MS = 48 * 60 * 60 * 1000
const DAILY_KEEP_DAYS = 90
const MAINT_KEEP_DAYS = 90

const ids = (json) => {
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? COMPONENT_IDS.filter((id) => v.includes(id)) : []
  } catch {
    return []
  }
}

const incidentRow = (r) => ({
  id: r.id, title: r.title, impact: r.impact, components: ids(r.components),
  startedAt: r.started_at, resolvedAt: r.resolved_at, updates: [],
})
const updateRow = (r) => ({ id: r.id, stage: r.stage, message: r.message, createdAt: r.created_at })
const maintRow = (r) => ({
  id: r.id, title: r.title, message: r.message, components: ids(r.components),
  startsAt: r.starts_at, endsAt: r.ends_at,
})

function attachUpdates(incidents, updates) {
  const byId = new Map(incidents.map((i) => [i.id, i]))
  for (const u of updates) byId.get(u.incident_id)?.updates.push(updateRow(u))
  for (const i of incidents) i.latest = i.updates[0]?.message || ''
  return incidents
}

// Open incidents, active maintenance and overrides: what changes the shown
// state of a component.
function contextStatements(db, nowIso) {
  return [
    db.prepare('select * from incidents where resolved_at is null order by started_at desc'),
    db.prepare(`select u.* from incident_updates u join incidents i on i.id = u.incident_id
                where i.resolved_at is null order by u.created_at desc, u.id desc`),
    db.prepare('select * from maintenance where starts_at <= ?1 and ends_at > ?1 order by starts_at').bind(nowIso),
    db.prepare('select component, state, set_at from overrides'),
  ]
}
const contextFrom = ([open, openUpdates, active, overrides]) => ({
  incidents: attachUpdates(open.results.map(incidentRow), openUpdates.results),
  maintenance: active.results.map(maintRow),
  overrides: overrides.results.map((o) => ({ component: o.component, state: o.state, setAt: o.set_at })),
})

export async function loadContext(db, nowIso) {
  return contextFrom(await db.batch(contextStatements(db, nowIso)))
}

// Everything the public page and the admin page show.
export async function loadPage(db, nowIso) {
  const since = addDays(dayKey(Date.parse(nowIso)), -(DAILY_KEEP_DAYS - 1))
  const recentFrom = new Date(Date.parse(nowIso) - DAILY_KEEP_DAYS * DAY).toISOString()
  const res = await db.batch([
    ...contextStatements(db, nowIso),
    db.prepare(`select component, state, latency_ms, checked_at from checks
                where checked_at = (select max(checked_at) from checks)`),
    db.prepare('select day, component, ok, total, worst from daily where day >= ?1').bind(since),
    db.prepare(`select * from incidents where resolved_at is not null and resolved_at >= ?1
                order by started_at desc limit 20`).bind(recentFrom),
    db.prepare(`select u.* from incident_updates u join incidents i on i.id = u.incident_id
                where i.resolved_at is not null and i.resolved_at >= ?1
                order by u.created_at desc, u.id desc`).bind(recentFrom),
    db.prepare('select started_at from incidents order by started_at desc limit 1'),
    db.prepare('select * from maintenance where ends_at > ?1 order by starts_at limit 10').bind(nowIso),
  ])
  const [latest, daily, resolved, resolvedUpdates, last, upcoming] = res.slice(4)
  return {
    ...contextFrom(res.slice(0, 4)),
    latest: latest.results.map((r) => ({ component: r.component, state: r.state, latencyMs: r.latency_ms, checkedAt: r.checked_at })),
    daily: daily.results,
    resolved: attachUpdates(resolved.results.map(incidentRow), resolvedUpdates.results),
    lastIncidentAt: last.results[0]?.started_at || null,
    upcoming: upcoming.results.map(maintRow),
  }
}

// One cron run: the checks, today's rollups (merged in JS) and pruning, in one
// batch (a transaction).
export async function recordRun(db, nowIso, auto, effective) {
  const now = Date.parse(nowIso)
  const today = dayKey(now)
  const { results } = await db.prepare('select component, ok, total, worst from daily where day = ?1').bind(today).all()
  const prev = new Map(results.map((r) => [r.component, r]))
  const stmts = []
  for (const id of COMPONENT_IDS) {
    stmts.push(db.prepare('insert into checks (component, checked_at, state, latency_ms) values (?1, ?2, ?3, ?4)')
      .bind(id, nowIso, auto[id].state, auto[id].latencyMs))
    const row = mergeDay(prev.get(id), effective[id])
    stmts.push(db.prepare(`insert into daily (day, component, ok, total, worst) values (?1, ?2, ?3, ?4, ?5)
                           on conflict (day, component) do update set ok = excluded.ok, total = excluded.total, worst = excluded.worst`)
      .bind(today, id, row.ok, row.total, row.worst))
  }
  stmts.push(db.prepare('delete from checks where checked_at < ?1').bind(new Date(now - CHECKS_KEEP_MS).toISOString()))
  stmts.push(db.prepare('delete from daily where day < ?1').bind(addDays(today, -(DAILY_KEEP_DAYS - 1))))
  stmts.push(db.prepare('delete from maintenance where ends_at < ?1').bind(new Date(now - MAINT_KEEP_DAYS * DAY).toISOString()))
  await db.batch(stmts)
}

// ---- admin reads -----------------------------------------------------------

export async function getIncident(db, id) {
  const [inc, ups] = await db.batch([
    db.prepare('select * from incidents where id = ?1').bind(id),
    db.prepare('select * from incident_updates where incident_id = ?1 order by created_at desc, id desc').bind(id),
  ])
  if (!inc.results[0]) return null
  return attachUpdates([incidentRow(inc.results[0])], ups.results)[0]
}

export async function getMaintenance(db, id) {
  const r = await db.prepare('select * from maintenance where id = ?1').bind(id).first()
  return r ? maintRow(r) : null
}

// ---- admin writes ----------------------------------------------------------

export async function createIncident(db, v, nowIso) {
  await db.batch([
    db.prepare('insert into incidents (title, impact, components, started_at, resolved_at) values (?1, ?2, ?3, ?4, ?5)')
      .bind(v.title, v.impact, JSON.stringify(v.components), nowIso, v.stage === 'resolved' ? nowIso : null),
    db.prepare('insert into incident_updates (incident_id, stage, message, created_at) values (last_insert_rowid(), ?1, ?2, ?3)')
      .bind(v.stage, v.message, nowIso),
  ])
}

// A "Resolved" update closes the incident; any other stage (re)opens it.
export async function addUpdate(db, id, v, nowIso) {
  await db.batch([
    db.prepare('insert into incident_updates (incident_id, stage, message, created_at) values (?1, ?2, ?3, ?4)')
      .bind(id, v.stage, v.message, nowIso),
    db.prepare('update incidents set resolved_at = ?2 where id = ?1')
      .bind(id, v.stage === 'resolved' ? nowIso : null),
  ])
}

export async function editIncident(db, id, v) {
  await db.batch([
    db.prepare('update incidents set title = ?2, impact = ?3, components = ?4 where id = ?1')
      .bind(id, v.title, v.impact, JSON.stringify(v.components)),
    ...v.messages.map((m) => db.prepare('update incident_updates set message = ?3 where id = ?2 and incident_id = ?1')
      .bind(id, m.id, m.message)),
  ])
}

export async function deleteIncident(db, id) {
  await db.batch([
    db.prepare('delete from incident_updates where incident_id = ?1').bind(id),
    db.prepare('delete from incidents where id = ?1').bind(id),
  ])
}

export async function saveMaintenance(db, id, v) {
  const args = [v.title, v.message, JSON.stringify(v.components), v.startsAt, v.endsAt]
  if (id) {
    await db.prepare('update maintenance set title = ?2, message = ?3, components = ?4, starts_at = ?5, ends_at = ?6 where id = ?1')
      .bind(id, ...args).run()
  } else {
    await db.prepare('insert into maintenance (title, message, components, starts_at, ends_at) values (?1, ?2, ?3, ?4, ?5)')
      .bind(...args).run()
  }
}

export async function deleteMaintenance(db, id) {
  await db.prepare('delete from maintenance where id = ?1').bind(id).run()
}

// Only changed components are touched, so "Set by you at …" keeps its time.
export async function saveOverrides(db, choices, nowIso) {
  const current = new Map((await db.prepare('select component, state from overrides').all()).results
    .map((r) => [r.component, r.state]))
  const stmts = []
  for (const [id, choice] of Object.entries(choices)) {
    const was = current.get(id) || 'automatic'
    if (choice === was) continue
    stmts.push(choice === 'automatic'
      ? db.prepare('delete from overrides where component = ?1').bind(id)
      : db.prepare(`insert into overrides (component, state, set_at) values (?1, ?2, ?3)
                    on conflict (component) do update set state = excluded.state, set_at = excluded.set_at`).bind(id, choice, nowIso))
  }
  if (stmts.length) await db.batch(stmts)
}
