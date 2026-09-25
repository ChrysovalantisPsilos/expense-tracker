// The public status page (design "B"), rendered on the server from D1.
import { COMPONENTS, componentNames } from './components.js'
import { effectiveStates, overall, stateWord } from './state.js'
import { dayKey, dayBars, uptimePct, formatPct } from './uptime.js'
import { html, icon } from './html.js'
import { page, brand, incidentCard, TONE } from './views.js'
import { ago, dayMonth, dayOfMonth, duration, fullDate, monthShort, relDay, shortDay, startedAt, windowText } from './time.js'

const TILE_DAYS = 30
const RING_R = 70, RING_GAP = 6
const RING_CLASS = { working: 'r-up', slow: 'r-slow', partial: 'r-partial', down: 'r-down', maint: 'r-maint', unknown: 'r-none' }

// The page model, kept apart from the markup so the numbers are easy to follow.
function pageModel(data, now) {
  const auto = Object.fromEntries(data.latest.map((r) => [r.component, r.state]))
  const states = effectiveStates(auto, data)
  const today = dayKey(now.getTime())
  const since30 = dayKey(now.getTime() - (TILE_DAYS - 1) * 86400000)
  const tiles = COMPONENTS.map((c) => {
    const rows = data.daily.filter((r) => r.component === c.id)
    return {
      c, state: states[c.id],
      bars: dayBars(rows, today, TILE_DAYS),
      uptime: formatPct(uptimePct(rows.filter((r) => r.day >= since30))),
    }
  })
  return {
    states, tiles,
    hero: overall(states, data),
    uptime90: formatPct(uptimePct(data.daily)),
    checkedAt: data.latest[0]?.checkedAt || null,
  }
}

function ring(tiles) {
  const circ = 2 * Math.PI * RING_R
  const seg = circ / tiles.length
  return tiles.map((t, k) => html`<circle class="${RING_CLASS[t.state]}" cx="84" cy="84" r="${RING_R}" fill="none" stroke-width="18" stroke-dasharray="${(seg - RING_GAP).toFixed(2)} ${(circ - seg + RING_GAP).toFixed(2)}" stroke-dashoffset="${(-k * seg).toFixed(2)}"/>`)
}

function tile(t) {
  const tone = TONE[t.state]
  return html`<div class="panel tile ${tone}">
    <div class="ic">${icon(t.c.icon)}</div><span class="chip ${tone}">${t.state === 'working' ? icon('check') : html`<span class="dot"></span>`}${stateWord(t.state, t.c.id)}</span>
    <div class="txt"><h3>${t.c.name}</h3><p>${t.c.desc}</p></div>
    <div class="bars" role="img" aria-label="${t.c.name}: ${TILE_DAYS}-day history, ${t.uptime} uptime">${t.bars.map((b) => html`<i${b.cls ? html` class="${b.cls}"` : ''} title="${dayMonth(b.day)}: ${b.words}"></i>`)}</div>
    <div class="tile-foot"><span>${TILE_DAYS} days</span><span><b>${t.uptime}</b> uptime</span></div>
  </div>`
}

function lastIncident(data, now) {
  if (data.incidents.length) return 'Now'
  if (!data.lastIncidentAt) return 'None yet'
  const r = relDay(data.lastIncidentAt, now)
  return r === 'Today' || r === 'Yesterday' ? r : ago(data.lastIncidentAt, now)
}

function maintenancePanel(m, now) {
  const on = Date.parse(m.startsAt) <= now.getTime()
  return html`<div class="panel">
    <div class="mt-top"><h3>${m.title}</h3>${on ? html`<span class="chip maint"><span class="dot"></span>Happening now</span>` : ''}</div>
    <div class="cal"><div class="date"><span>${monthShort(m.startsAt)}</span><b>${dayOfMonth(m.startsAt)}</b></div><div><div class="when">${windowText(m.startsAt, m.endsAt)}</div><p>${m.message}</p></div></div>
    <div class="tags">${componentNames(m.components).map((n) => html`<span class="tag">${n}</span>`)}</div>
  </div>`
}

export function renderPublic(data, env, now) {
  const m = pageModel(data, now)
  const app = env.APP_URL
  const total = COMPONENTS.length
  const next = data.upcoming[0]
  const names = (inc) => componentNames(inc.components).join(', ')
  const body = html`<div class="wrap">
<header class="top">
  ${brand('/', 'Status')}
  <nav class="links">
    <a class="nl" href="#incidents">Incidents</a>
    <a class="nl" href="#maintenance">Maintenance</a>
    <a class="btn btn-solid" href="${app}">Open Budgeer ${icon('arrowRight')}</a>
  </nav>
</header>

<section class="hero ${m.hero.tone}">
  <div class="ring" role="img" aria-label="${m.hero.working} of ${total} parts of Budgeer working normally">
    <svg viewBox="0 0 168 168">${ring(m.tiles)}</svg>
    <div class="c"><b>${m.hero.working}/${total}</b><span>working</span></div>
  </div>
  <div class="hero-body">
    <span class="chip ${m.hero.tone === 'none' ? 'maint' : m.hero.tone}"><span class="dot"></span>${m.hero.chip}</span>
    <h1>${m.hero.title}</h1>
    ${m.hero.sub ? html`<p class="sub">${m.hero.sub}</p>` : ''}
    <div class="stats">
      <div class="stat"><small>90-day uptime</small><b>${m.uptime90}</b></div>
      <div class="stat"><small>Last incident</small><b>${lastIncident(data, now)}</b></div>
      <div class="stat"><small>Maintenance</small><b>${next ? shortDay(next.startsAt) : 'None planned'}</b></div>
    </div>
  </div>
</section>

<h2 class="sec">Everything in Budgeer <small>${m.checkedAt ? `Last checked ${ago(m.checkedAt, now)}` : 'Not checked yet'}</small></h2>
<div class="grid">
  ${m.tiles.map(tile)}
</div>

<div class="lower">
  <div id="incidents">
    <h2 class="sec">Incidents</h2>
    ${data.incidents.map((inc) => incidentCard(inc, now, { meta: `Started ${startedAt(inc.startedAt, now)} · ${names(inc)}` }))}
    ${data.resolved.map((inc) => incidentCard(inc, now, {
      meta: `${fullDate(inc.startedAt)} · Lasted ${duration(Date.parse(inc.resolvedAt) - Date.parse(inc.startedAt))} · ${names(inc)}`,
    }))}
    ${data.incidents.length || data.resolved.length ? '' : html`<div class="panel empty"><span class="ic">${icon('check')}</span><p>No incidents in the last 90 days.</p></div>`}
  </div>
  <aside class="side">
    <h2 class="sec flush" id="maintenance">Coming up</h2>
    ${data.upcoming.length
      ? data.upcoming.slice(0, 3).map((x) => maintenancePanel(x, now))
      : html`<div class="panel"><h3>Nothing planned</h3><p class="muted note">We’ll post planned work here ahead of time.</p></div>`}
    <div class="panel about">
      <div class="about-top"><span class="ic">${icon('clock')}</span><h3>About this page</h3></div>
      <p>Checked every 10 minutes from outside Budgeer&nbsp;· times in UTC.</p>
      <p>If something looks wrong in the app but everything here says it’s working, let us know from <b>Help</b> in Budgeer.</p>
    </div>
  </aside>
</div>

<footer>
  ${brand(app)}
  <span>Checked every 10 minutes · times in UTC · <a href="${app}">Back to Budgeer</a> · <a href="${app}/help">Help</a></span>
</footer>
</div>`
  return page({
    title: 'Budgeer Status',
    description: 'Is Budgeer working? Live status of the app, sign-in, syncing, groups, email and more.',
    css: ['/status.css'], body,
  })
}
