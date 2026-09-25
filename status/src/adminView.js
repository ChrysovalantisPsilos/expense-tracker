// The private admin page (/admin), server-rendered. Forms post back to the
// Worker; the only script (admin.js) refreshes the new-incident preview.
import { COMPONENTS, COMPONENT_IDS, componentNames } from './components.js'
import { impactState, stateWord } from './state.js'
import { IMPACTS, LIMITS, OVERRIDE_CHOICES, STAGES } from './validate.js'
import { html, icon } from './html.js'
import { page, brand, feed, incidentCard, STAGE_WORDS, TONE } from './views.js'
import { clock, dayMonth, duration, fullDate, stamp, startedAt, windowDated } from './time.js'

const IMPACT_INFO = {
  minor: { label: 'Minor slowdown', help: 'Things work, just slower' },
  partial: { label: 'Partial outage', help: 'Some things don’t work' },
  major: { label: 'Major outage', help: 'Budgeer can’t be used' },
}
const OVERRIDE_WORDS = { automatic: 'Automatic', working: 'Working', slow: 'Slow', down: 'Down' }
const FLASH = {
  published: 'Incident published.', updated: 'Update posted.', resolved: 'Incident resolved.',
  saved: 'Changes saved.', deleted: 'Deleted.', scheduled: 'Maintenance scheduled.', overrides: 'Overrides saved.',
}

const err = (errors, key) => (errors?.[key] ? html`<p class="err" role="alert">${errors[key]}</p>` : '')
const names = (ids) => componentNames(ids).join(', ')

function shell(email, body) {
  return page({
    title: 'Status Admin',
    css: ['/admin.css'],
    scripts: ['/admin.js'],
    body: html`<div class="wrap admin">
<header class="top">
  ${brand('/admin', 'Status admin')}
  <div class="who">
    <span class="signed">${icon('lock')}Signed in as ${email || 'owner'} via Cloudflare Access</span>
    <a class="btn btn-outline btn-sm" href="/" aria-label="View public page">${icon('external')}<span class="lbl">View public page</span></a>
  </div>
</header>
${body}
<footer class="admin-foot">Status admin · only visible to you. Times in UTC.</footer>
</div>`,
  })
}

const picks = (name, selected) => html`<div class="picks">${COMPONENTS.map((c) => html`<label class="pick"><input class="vh" type="checkbox" name="${name}" value="${c.id}"${selected.includes(c.id) ? html` checked` : ''}><span>${icon(c.icon, 'pic')}${icon('check', 'ck')}${c.name}</span></label>`)}</div>`

const stageSeg = (name, sel) => html`<div class="seg stages" role="radiogroup" aria-label="Stage">${STAGES.map((s) => html`<label><input class="vh" type="radio" name="${name}" value="${s}"${s === sel ? html` checked` : ''}><span><i class="sd sd-${s}"></i>${STAGE_WORDS[s]}</span></label>`)}</div>`

const impacts = (sel) => html`<div class="impacts">${IMPACTS.map((i) => html`<label class="impact"><input class="vh" type="radio" name="impact" value="${i}"${i === sel ? html` checked` : ''}><span><b><i class="im-${i}"></i>${IMPACT_INFO[i].label}</b><small>${IMPACT_INFO[i].help}</small></span></label>`)}</div>`

// The new-incident preview (also served alone to admin.js as it changes).
export function incidentPreview(form, now) {
  const clamp = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const parts = COMPONENT_IDS.filter((id) => [].concat(form.parts || []).includes(id))
  const impact = IMPACTS.includes(form.impact) ? form.impact : 'minor'
  const stage = STAGES.includes(form.stage) ? form.stage : 'investigating'
  const nowIso = now.toISOString()
  const done = stage === 'resolved'
  const inc = {
    title: clamp(form.title, LIMITS.title) || 'Your title', impact, components: parts,
    startedAt: nowIso, resolvedAt: done ? nowIso : null,
    updates: [{ stage, message: clamp(form.message, LIMITS.message) || 'Your message will appear here.', createdAt: nowIso }],
  }
  const tone = TONE[impactState(impact)]
  const shows = stateWord(impactState(impact), parts.length === 1 ? parts[0] : null)
  return html`${incidentCard(inc, now, {
    meta: `Started ${startedAt(nowIso, now)} · ${names(parts) || 'Pick the affected parts'}`,
    chip: done ? null : html`<span class="chip ${tone}"><span class="dot"></span>${IMPACT_INFO[impact].label}</span>`,
  })}
  <div class="also">${parts.length && !done ? html`${icon('arrowRight')} On the public page, ${names(parts)} will show <span class="chip ${tone}"><span class="dot"></span>${shows}</span>` : ''}</div>`
}

function incidentForm({ draft = {}, errors = {} }, now) {
  return html`<section class="panel card">
  <div class="card-h"><div><h2>New incident</h2><p>Tell people what’s wrong in plain words. You can add updates later.</p></div></div>
  <div class="compose">
    <form id="f" method="post" action="/admin/incidents">
      <div class="field"><label for="title">Title</label><input class="txt" id="title" name="title" maxlength="${LIMITS.title}" required value="${draft.title || ''}" placeholder="e.g. Bank imports are slow">${err(errors, 'title')}</div>
      <div class="field"><span class="lbl">Affected parts</span>${picks('parts', draft.parts || [])}${err(errors, 'parts')}</div>
      <div class="field"><span class="lbl">How bad is it?</span>${impacts(draft.impact || 'minor')}${err(errors, 'impact')}</div>
      <div class="field"><span class="lbl">Where are we?</span>${stageSeg('stage', draft.stage || 'investigating')}${err(errors, 'stage')}</div>
      <div class="field"><label for="msg">Message</label><textarea class="txt" id="msg" name="message" maxlength="${LIMITS.message}" required placeholder="What are people noticing, and what are you doing about it?">${draft.message || ''}</textarea>${err(errors, 'message')}</div>
    </form>
    <div class="preview"><div class="eyebrow">${icon('app')}Preview on the public page</div><div id="pv">${incidentPreview(draft, now)}</div></div>
    <div class="form-acts pub"><button class="btn btn-solid" form="f">Publish incident</button><button class="btn btn-ghost" type="reset" form="f">Discard</button><span class="note">It shows on the public page as soon as you publish.</span></div>
  </div>
</section>`
}

function maintenanceFields(m = {}, errors = {}) {
  return html`<div class="mgrid"><div>
    <div class="field"><label for="mt">Title</label><input class="txt" id="mt" name="title" maxlength="${LIMITS.title}" required value="${m.title || ''}" placeholder="e.g. Database upgrade">${err(errors, 'title')}</div>
    <div class="field"><span class="lbl">Affected parts</span>${picks('parts', m.parts || [])}${err(errors, 'parts')}</div>
    </div><div>
    <div class="two">
      <div class="field"><label for="ms">Starts <span class="hint">UTC</span></label><input class="txt" id="ms" name="starts" type="datetime-local" required value="${m.starts || ''}">${err(errors, 'starts')}</div>
      <div class="field"><label for="me">Ends <span class="hint">UTC</span></label><input class="txt" id="me" name="ends" type="datetime-local" required value="${m.ends || ''}">${err(errors, 'ends')}</div>
    </div>
    <div class="field"><label for="mm">Message</label><textarea class="txt" id="mm" name="message" maxlength="${LIMITS.message}" required placeholder="What will people notice, and what can they still do?">${m.message || ''}</textarea>${err(errors, 'message')}</div>
    </div></div>`
}

const confirmBox = (what, action) => html`<div class="confirm"><p><b>Delete this ${what}?</b> It will disappear from the public page${what === 'incident' ? ' and its history' : ''}. This can’t be undone.</p>
  <form class="form-acts" method="post" action="${action}"><button class="btn btn-danger btn-sm">Yes, delete it</button><a class="btn btn-outline btn-sm" href="/admin">Keep it</a></form></div>`

function openNow(data, now, confirm) {
  const rows = [
    ...data.incidents.map((inc) => {
      const last = inc.updates[0]
      const confirming = confirm === `incident:${inc.id}`
      return html`<div class="row${confirming ? ' confirming' : ''}">
        <span class="ic warn">${icon('clock')}</span>
        <div class="main"><h3>${inc.title}</h3><div class="meta"><span class="stage ${last?.stage}">${STAGE_WORDS[last?.stage] || ''}</span> · last update ${last ? stamp(last.createdAt, now).toLowerCase() : '—'} · ${names(inc.components)}</div>
        ${confirming ? confirmBox('incident', `/admin/incidents/${inc.id}/delete`) : ''}</div>
        ${confirming ? '' : html`<div class="acts"><a class="btn btn-outline btn-sm" href="/admin/incidents/${inc.id}/edit">Edit</a><a class="btn btn-solid btn-sm" href="/admin/incidents/${inc.id}/update">Post update</a></div>`}
      </div>`
    }),
    ...data.upcoming.map((m) => {
      const confirming = confirm === `maintenance:${m.id}`
      return html`<div class="row${confirming ? ' confirming' : ''}">
        <span class="ic">${icon('wrench')}</span>
        <div class="main"><h3>${m.title}</h3><div class="meta"><b class="ink">${Date.parse(m.startsAt) <= now.getTime() ? 'Happening now' : 'Planned'}</b> · ${windowDated(m.startsAt, m.endsAt)} · ${names(m.components)}</div>
        ${confirming ? confirmBox('maintenance', `/admin/maintenance/${m.id}/delete`) : ''}</div>
        ${confirming ? '' : html`<div class="acts"><a class="btn btn-outline btn-sm" href="/admin/maintenance/${m.id}/edit">Edit</a><a class="btn btn-danger-ghost btn-sm" href="/admin?confirm=maintenance:${m.id}">Delete</a></div>`}
      </div>`
    }),
  ]
  return html`<section class="panel card">
  <div class="card-h"><div><h2>Open now</h2><p>Incidents that aren’t resolved yet, and upcoming maintenance.</p></div></div>
  ${rows.length ? rows : html`<p class="muted">Nothing open right now.</p>`}
</section>`
}

function overridesCard(data, now) {
  const auto = Object.fromEntries(data.latest.map((r) => [r.component, r.state]))
  return html`<section class="panel card">
    <div class="card-h"><div><h2>Manual override</h2><p>Set a part’s status yourself.</p></div></div>
    <div class="callout">${icon('alert')}<span>Only use this when the checks can’t see a problem. Set it back to <b>Automatic</b> and the checks take over again.</span></div>
    <form method="post" action="/admin/overrides">
    <div class="ovgrid">${COMPONENTS.map((c) => {
      const o = data.overrides.find((x) => x.component === c.id)
      const sel = o ? o.state : 'automatic'
      return html`<div class="ov${o ? ' on' : ''}"><span class="ic">${icon(c.icon)}</span><div class="nm"><b>${c.name}</b>${o ? html`<small class="set">Set by you at ${clock(o.setAt)}${dayMonth(o.setAt) === dayMonth(now) ? '' : `, ${dayMonth(o.setAt)}`}</small>` : html`<small>Checks say: ${stateWord(auto[c.id] || 'unknown', c.id)}</small>`}</div>
      <div class="seg sm" role="radiogroup" aria-label="${c.name}">${OVERRIDE_CHOICES.map((v) => html`<label><input class="vh" type="radio" name="ov-${c.id}" value="${v}"${v === sel ? html` checked` : ''}><span>${OVERRIDE_WORDS[v]}</span></label>`)}</div></div>`
    })}</div>
    <div class="form-acts ov-acts"><button class="btn btn-solid">Save overrides</button></div>
    </form>
  </section>`
}

function resolvedCard(data, confirm) {
  return html`<section class="panel card">
  <div class="card-h"><div><h2>Resolved incidents</h2><p>Fix a typo, or remove one that was posted by mistake.</p></div></div>
  ${data.resolved.length ? data.resolved.map((r) => {
    const confirming = confirm === `incident:${r.id}`
    return html`<div class="row${confirming ? ' confirming' : ''}">
      <span class="ic">${icon('check')}</span>
      <div class="main"><h3>${r.title}</h3><div class="meta">${fullDate(r.startedAt)} · lasted ${duration(Date.parse(r.resolvedAt) - Date.parse(r.startedAt))} · ${names(r.components)}</div>
      ${confirming ? confirmBox('incident', `/admin/incidents/${r.id}/delete`) : ''}</div>
      ${confirming ? '' : html`<div class="acts"><a class="btn btn-outline btn-sm" href="/admin/incidents/${r.id}/edit">Edit</a><a class="btn btn-danger-ghost btn-sm" href="/admin?confirm=incident:${r.id}">Delete</a></div>`}
    </div>`
  }) : html`<p class="muted">No resolved incidents in the last 90 days.</p>`}
</section>`
}

export function mainView(data, now, { email, flash, confirm, incident = {}, maintenance = {} }) {
  return shell(email, html`
<div class="intro"><h1>What’s happening?</h1><p>Anything you post here shows on the public status page straight away.</p></div>
${FLASH[flash] ? html`<p class="flash" role="status">${icon('check')}${FLASH[flash]}</p>` : ''}
${openNow(data, now, confirm)}
${incidentForm(incident, now)}
<section class="panel card">
  <div class="card-h"><div><h2>Schedule maintenance</h2><p>Let people know about planned work ahead of time.</p></div></div>
  <form method="post" action="/admin/maintenance">
    ${maintenanceFields(maintenance.draft, maintenance.errors)}
    <div class="form-acts"><button class="btn btn-solid">${icon('calendar')}Schedule</button></div>
  </form>
</section>
${overridesCard(data, now)}
${resolvedCard(data, confirm)}`)
}

const back = html`<a class="back" href="/admin">${icon('arrowLeft')}Back to admin</a>`

export function updateView(inc, now, { email, draft = {}, errors = {} }) {
  return shell(email, html`<div class="update">
  ${back}
  <section class="panel card">
    <div class="card-h"><div><h2>Post an update</h2><p>${inc.title} · ${IMPACT_INFO[inc.impact].label} · ${names(inc.components)}</p></div></div>
    <div class="sofar"><div class="eyebrow">So far</div>${feed(inc.updates, now)}</div>
    <form method="post" action="/admin/incidents/${inc.id}/updates">
      <div class="field"><span class="lbl">Where are we now?</span>${stageSeg('stage', draft.stage || inc.updates[0]?.stage || 'investigating')}${err(errors, 'stage')}</div>
      <div class="field"><label for="umsg">Message</label><textarea class="txt" id="umsg" name="message" maxlength="${LIMITS.message}" required>${draft.message || ''}</textarea>${err(errors, 'message')}</div>
      <div class="form-acts"><button class="btn btn-solid">Post update</button><a class="btn btn-ghost" href="/admin">Cancel</a><span class="note">Choosing Resolved closes the incident.</span></div>
    </form>
  </section>
</div>`)
}

export function editIncidentView(inc, now, { email, draft, errors = {} }) {
  const v = draft || { title: inc.title, parts: inc.components, impact: inc.impact }
  const msg = (u) => (draft ? draft[`msg-${u.id}`] : u.message)
  return shell(email, html`<div class="update">
  ${back}
  <section class="panel card">
    <div class="card-h"><div><h2>Edit incident</h2><p>Started ${fullDate(inc.startedAt)}. Changes show on the public page straight away.</p></div></div>
    <form method="post" action="/admin/incidents/${inc.id}">
      <div class="field"><label for="title">Title</label><input class="txt" id="title" name="title" maxlength="${LIMITS.title}" required value="${v.title || ''}">${err(errors, 'title')}</div>
      <div class="field"><span class="lbl">Affected parts</span>${picks('parts', [].concat(v.parts || []))}${err(errors, 'parts')}</div>
      <div class="field"><span class="lbl">How bad is it?</span>${impacts(v.impact)}${err(errors, 'impact')}</div>
      ${inc.updates.map((u) => html`<div class="field"><label for="msg-${u.id}"><span class="stage ${u.stage}">${STAGE_WORDS[u.stage]}</span> <span class="hint">${stamp(u.createdAt, now)}</span></label><textarea class="txt" id="msg-${u.id}" name="msg-${u.id}" maxlength="${LIMITS.message}" required>${msg(u) || ''}</textarea>${err(errors, `msg-${u.id}`)}</div>`)}
      <div class="form-acts"><button class="btn btn-solid">Save changes</button><a class="btn btn-ghost" href="/admin">Cancel</a><a class="btn btn-danger-ghost" href="/admin?confirm=incident:${inc.id}">Delete…</a></div>
    </form>
  </section>
</div>`)
}

export function editMaintenanceView(m, { email, draft, errors = {} }) {
  const v = draft || { title: m.title, parts: m.components, message: m.message, starts: m.startsAt.slice(0, 16), ends: m.endsAt.slice(0, 16) }
  return shell(email, html`<div class="update wide">
  ${back}
  <section class="panel card">
    <div class="card-h"><div><h2>Edit maintenance</h2><p>Times are UTC.</p></div></div>
    <form method="post" action="/admin/maintenance/${m.id}">
      ${maintenanceFields({ ...v, parts: [].concat(v.parts || []) }, errors)}
      <div class="form-acts"><button class="btn btn-solid">Save changes</button><a class="btn btn-ghost" href="/admin">Cancel</a><a class="btn btn-danger-ghost" href="/admin?confirm=maintenance:${m.id}">Delete…</a></div>
    </form>
  </section>
</div>`)
}
