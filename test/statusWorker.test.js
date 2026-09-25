// Status page end to end on an in-memory D1 (the real migration): the admin
// routes behind a real signed Access JWT, the 10-minute cron with stubbed
// probes, and the public page they produce.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fakeD1 } from './statusD1.js'
import { signingKey, signJwt } from './statusJwt.js'
import worker from '../status/src/index.js'
import { handleAdmin } from '../status/src/admin.js'
import { accessVerifier } from '../status/src/access.js'
import { runChecks } from '../status/src/cron.js'

const ORIGIN = 'https://status.example'
const AUD = 'e2e-aud'
let teams = 0

// Each setup is its own Access team (the Worker caches certs per team).
async function setup() {
  const TEAM = `budgeer-e2e-${++teams}.cloudflareaccess.com`
  const key = await signingKey('e2e')
  const certs = async () => new Response(JSON.stringify({ keys: [key.jwk] }))
  const env = {
    DB: fakeD1(), APP_URL: 'https://app.example', SUPABASE_URL: 'https://sb.example',
    ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD,
  }
  const token = await signJwt(key, { aud: [AUD], iss: `https://${TEAM}`, exp: Math.floor(Date.now() / 1000) + 600, email: 'owner@example.com' })
  const verify = accessVerifier(env, certs)
  const admin = (path, { method = 'GET', form, origin = ORIGIN, jwt = token } = {}) => {
    const headers = new Headers()
    if (jwt) headers.set('Cf-Access-Jwt-Assertion', jwt)
    if (origin) headers.set('origin', origin)
    const body = form ? new URLSearchParams(form) : undefined
    return handleAdmin(new Request(ORIGIN + path, { method, headers, body }), env, { verify })
  }
  const publicPage = async () => (await worker.fetch(new Request(`${ORIGIN}/`), env)).text()
  return { env, admin, publicPage, TEAM }
}

const probeFetch = (overrides = {}) => async (url, init = {}) => {
  const u = String(url)
  if (overrides.fail && u.includes(overrides.fail)) throw new TypeError('network down')
  if (u.includes('/rpc/status_snapshot')) {
    return new Response(JSON.stringify({
      db_time: '2026-09-25T12:00:00Z', fx_latest_date: overrides.fx || '2026-09-24',
      email_queue_overdue: 0, email_queue_retrying: 0,
    }), { status: 200 })
  }
  if (init.method === 'OPTIONS') return new Response('ok', { status: 200 })
  return new Response('ok', { status: 200 })
}

test('/admin is 403 without Access config, without a JWT, or with a forged one', async () => {
  const { env, admin, TEAM } = await setup()
  const bare = await handleAdmin(new Request(`${ORIGIN}/admin`), { ...env, ACCESS_TEAM_DOMAIN: '', ACCESS_AUD: '' })
  assert.equal(bare.status, 403)
  assert.equal((await worker.fetch(new Request(`${ORIGIN}/admin`), { ...env, ACCESS_TEAM_DOMAIN: '', ACCESS_AUD: '' })).status, 403)
  assert.equal((await admin('/admin', { jwt: null })).status, 403)
  assert.equal((await admin('/admin', { jwt: 'x.y.z' })).status, 403)
  const other = await signingKey('e2e')
  const forged = await signJwt(other, { aud: [AUD], iss: `https://${TEAM}`, exp: Math.floor(Date.now() / 1000) + 600 })
  assert.equal((await admin('/admin', { jwt: forged })).status, 403)
  const ok = await admin('/admin')
  assert.equal(ok.status, 200)
  assert.match(ok.headers.get('content-security-policy'), /script-src 'self'/)
  assert.equal(ok.headers.get('cache-control'), 'no-store')
  assert.match(await ok.text(), /Signed in as owner@example\.com via Cloudflare Access/)
})

test('POSTs need a same-origin Origin header and a form body', async () => {
  const { admin } = await setup()
  const form = { title: 'x', parts: 'app', impact: 'minor', stage: 'investigating', message: 'm' }
  assert.equal((await admin('/admin/incidents', { method: 'POST', form, origin: null })).status, 403)
  assert.equal((await admin('/admin/incidents', { method: 'POST', form, origin: 'https://evil.example' })).status, 403)
  const json = await handleAdmin(new Request(`${ORIGIN}/admin/incidents`, {
    method: 'POST', body: '{}', headers: { origin: ORIGIN, 'content-type': 'application/json' },
  }), {}, { verify: async () => ({ email: 'a' }) })
  assert.equal(json.status, 400)
})

test('incident lifecycle: create → update → resolve → edit → delete, escaped on the public page', async () => {
  const { env, admin, publicPage } = await setup()
  const evil = '<img src=x onerror=alert(1)>'
  const bad = await admin('/admin/incidents', { method: 'POST', form: { title: '', impact: 'minor', stage: 'investigating', message: '' } })
  assert.equal(bad.status, 400)
  assert.match(await bad.text(), /Add a title\./)

  const created = await admin('/admin/incidents', {
    method: 'POST',
    form: [['title', `Bank imports ${evil}`], ['parts', 'bank'], ['parts', 'app'], ['impact', 'partial'], ['stage', 'investigating'], ['message', `Looking into it ${evil}`]],
  })
  assert.equal(created.status, 303)
  assert.equal(created.headers.get('location'), '/admin?done=published')
  const { id } = await env.DB.prepare('select id from incidents').first()

  let html = await publicPage()
  assert.ok(!html.includes('<img src=x'), 'no raw HTML from the admin form')
  assert.match(html, /Bank imports &lt;img src=x onerror=alert\(1\)&gt;/)
  assert.match(html, /Ongoing/)
  assert.match(html, /App &amp; website, Bank imports/)

  assert.equal((await admin(`/admin/incidents/${id}/update`)).status, 200)
  const upd = await admin(`/admin/incidents/${id}/updates`, { method: 'POST', form: { stage: 'identified', message: 'Found it.' } })
  assert.equal(upd.headers.get('location'), '/admin?done=updated')
  const res = await admin(`/admin/incidents/${id}/updates`, { method: 'POST', form: { stage: 'resolved', message: 'All fixed.' } })
  assert.equal(res.headers.get('location'), '/admin?done=resolved')
  assert.ok((await env.DB.prepare('select resolved_at from incidents where id = ?1').bind(id).first()).resolved_at)
  html = await publicPage()
  assert.match(html, /Resolved/)
  assert.match(html, /See all 3 updates/)

  const ups = (await env.DB.prepare('select id from incident_updates order by id').all()).results.map((r) => r.id)
  const edit = await admin(`/admin/incidents/${id}`, {
    method: 'POST',
    form: [['title', 'Bank imports were slow'], ['parts', 'bank'], ['impact', 'minor'], ...ups.map((u) => [`msg-${u}`, `edited ${u}`])],
  })
  assert.equal(edit.headers.get('location'), '/admin?done=saved')
  assert.equal((await env.DB.prepare('select title from incidents').first()).title, 'Bank imports were slow')
  assert.equal((await env.DB.prepare('select message from incident_updates where id = ?1').bind(ups[0]).first()).message, `edited ${ups[0]}`)

  const confirm = await (await admin(`/admin?confirm=incident:${id}`)).text()
  assert.match(confirm, /Delete this incident\?/)
  const del = await admin(`/admin/incidents/${id}/delete`, { method: 'POST', form: {} })
  assert.equal(del.headers.get('location'), '/admin?done=deleted')
  assert.equal((await env.DB.prepare('select count(*) n from incident_updates').first()).n, 0)
  assert.match(await publicPage(), /No incidents in the last 90 days/)
  assert.equal((await admin('/admin/incidents/999/update')).status, 404)
  assert.equal((await admin('/admin/incidents/abc/update')).status, 404)
})

test('maintenance: schedule, edit, delete; shows under Coming up', async () => {
  const { env, admin, publicPage } = await setup()
  const start = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 13) + ':00'
  const end = start.slice(0, 11) + String(Number(start.slice(11, 13)) === 23 ? 23 : Number(start.slice(11, 13)) + 1).padStart(2, '0') + ':30'
  const form = { title: 'Database <upgrade>', parts: 'sync', starts: start, ends: end, message: 'Brief pause.' }
  assert.equal((await admin('/admin/maintenance', { method: 'POST', form: { ...form, ends: start } })).status, 400)
  assert.equal((await admin('/admin/maintenance', { method: 'POST', form })).headers.get('location'), '/admin?done=scheduled')
  const { id } = await env.DB.prepare('select id from maintenance').first()
  assert.match(await publicPage(), /Database &lt;upgrade&gt;/)
  assert.equal((await admin(`/admin/maintenance/${id}/edit`)).status, 200)
  await admin(`/admin/maintenance/${id}`, { method: 'POST', form: { ...form, title: 'DB upgrade' } })
  assert.equal((await env.DB.prepare('select title from maintenance').first()).title, 'DB upgrade')
  await admin(`/admin/maintenance/${id}/delete`, { method: 'POST', form: {} })
  assert.match(await publicPage(), /Nothing planned/)
})

test('cron: checks recorded, rollups merged, overrides applied, old rows pruned', async () => {
  const { env, admin, publicPage } = await setup()
  // Without the anon key the key-based checks are unknown, and nothing throws.
  let auto = await runChecks(env, new Date('2026-09-25T12:00:00Z'), probeFetch())
  assert.equal(auto.app.state, 'working')
  assert.equal(auto.auth.state, 'unknown')
  assert.equal(auto.fx.state, 'unknown')

  env.SUPABASE_ANON_KEY = 'test-key'
  env.DB.raw.exec(`insert into checks (component, checked_at, state) values ('app', '2026-09-22T00:00:00.000Z', 'working')`)
  env.DB.raw.exec(`insert into daily (day, component, ok, total, worst) values ('2026-06-01', 'app', 1, 1, 'working')`)
  auto = await runChecks(env, new Date('2026-09-25T12:10:00Z'), probeFetch({ fx: '2026-09-18', fail: '/auth/v1/health' }))
  assert.equal(auto.auth.state, 'down')
  assert.equal(auto.fx.state, 'slow')
  assert.equal(auto.sync.state, 'working')

  const app = await env.DB.prepare(`select * from daily where day = '2026-09-25' and component = 'app'`).first()
  assert.deepEqual([app.ok, app.total, app.worst], [2, 2, 'working'])
  const authRow = await env.DB.prepare(`select * from daily where day = '2026-09-25' and component = 'auth'`).first()
  assert.deepEqual([authRow.ok, authRow.total, authRow.worst], [0, 1, 'down'])
  assert.equal((await env.DB.prepare(`select count(*) n from checks where checked_at < '2026-09-23'`).first()).n, 0, '48h pruning')
  assert.equal((await env.DB.prepare(`select count(*) n from daily where day = '2026-06-01'`).first()).n, 0, '90-day pruning')

  // An override replaces the automatic state on the page straight away…
  await admin('/admin/overrides', { method: 'POST', form: { 'ov-auth': 'working', 'ov-fx': 'automatic' } })
  const html = await publicPage()
  assert.match(html, /Exchange rates are running late/)
  assert.match(html, /Running late/)
  assert.match((await (await admin('/admin')).text()), /Set by you at/)
  // …and in the next rollup.
  await runChecks(env, new Date('2026-09-25T12:20:00Z'), probeFetch({ fail: '/auth/v1/health' }))
  const after = await env.DB.prepare(`select * from daily where day = '2026-09-25' and component = 'auth'`).first()
  assert.deepEqual([after.ok, after.total], [1, 2])
  await admin('/admin/overrides', { method: 'POST', form: { 'ov-auth': 'automatic' } })
  assert.equal((await env.DB.prepare('select count(*) n from overrides').first()).n, 0)
})

test('public page: headers, routes and the admin preview', async () => {
  const { env, admin } = await setup()
  const res = await worker.fetch(new Request(`${ORIGIN}/`), env)
  assert.equal(res.status, 200)
  const csp = res.headers.get('content-security-policy')
  assert.match(csp, /script-src 'none'/)
  assert.ok(!/unsafe-inline/.test(csp))
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(res.headers.get('referrer-policy'), 'same-origin')
  assert.equal(res.headers.get('cache-control'), 'public, max-age=60')
  const html = await res.text()
  assert.ok(!/<script/i.test(html), 'no scripts on the public page')
  assert.ok(!/style="/.test(html), 'no inline styles (CSP)')
  assert.match(html, /Checking Budgeer…/)
  assert.equal((await worker.fetch(new Request(`${ORIGIN}/nope`), env)).status, 404)
  assert.equal((await worker.fetch(new Request(`${ORIGIN}/`, { method: 'POST' }), env)).status, 405)

  const pv = await admin('/admin/preview', { method: 'POST', form: [['title', '<b>x</b>'], ['parts', 'fx'], ['impact', 'minor'], ['stage', 'investigating'], ['message', 'm']] })
  const frag = await pv.text()
  assert.match(frag, /&lt;b&gt;x&lt;\/b&gt;/)
  assert.match(frag, /Exchange rates will show/)
  assert.ok(!/style="/.test(await (await admin('/admin')).text()), 'no inline styles on admin either')
})
