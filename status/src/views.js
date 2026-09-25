// View pieces shared by the public page and the admin page: the document
// shell, the brand, and the incident card (stage steps + update feed).
import { html, icon, MARK } from './html.js'
import { STAGES } from './validate.js'
import { impactState } from './state.js'
import { clock, stamp } from './time.js'

export const STAGE_WORDS = { investigating: 'Investigating', identified: 'Identified', monitoring: 'Monitoring', resolved: 'Resolved' }
// Chip tone for a state, as the design's CSS names them.
export const TONE = { working: 'up', slow: 'degraded', partial: 'partial', down: 'down', maint: 'maint', unknown: 'maint' }

export function page({ title, description, css, scripts = [], body }) {
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
${description ? html`<meta name="description" content="${description}">` : ''}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&amp;family=Nunito+Sans:wght@400;600;700;800&amp;display=swap" rel="stylesheet">
<link rel="stylesheet" href="/base.css">
${css.map((href) => html`<link rel="stylesheet" href="${href}">`)}
${scripts.map((src) => html`<script type="module" src="${src}"></script>`)}
</head>
<body>
${body}
</body>
</html>`
}

export const brand = (href, tag) => html`<a class="brand" href="${href}">${MARK}<b>budgeer</b>${tag ? html`<em>${tag}</em>` : ''}</a>`

// Four stages; each reached stage shows the time it was first reached.
function steps(inc) {
  const reached = new Map()
  for (const u of [...inc.updates].reverse()) if (!reached.has(u.stage)) reached.set(u.stage, clock(u.createdAt))
  const curIdx = STAGES.indexOf(inc.updates[0]?.stage)
  return html`<ol class="steps">${STAGES.map((s, i) => {
    const state = inc.resolvedAt || i < curIdx ? 'done' : i === curIdx ? 'cur' : ''
    return html`<li class="${state}"><span class="n">${state === 'done' ? icon('check') : ''}</span>${STAGE_WORDS[s]}<small>${reached.get(s) || (state ? '' : '—')}</small></li>`
  })}</ol>`
}

const feedItems = (updates, now) => updates.map((u) => html`<li class="st-${u.stage}"><div class="h"><span class="stage ${u.stage}">${STAGE_WORDS[u.stage]}</span><span class="t">${stamp(u.createdAt, now)}</span></div><p>${u.message}</p></li>`)

export const feed = (updates, now) => html`<ul class="feed">${feedItems(updates, now)}</ul>`

// The public incident card. `chip` overrides the default Ongoing / Resolved
// chip (the admin preview shows the impact instead).
export function incidentCard(inc, now, { meta, chip, show = inc.resolvedAt ? 1 : 2 }) {
  const tone = TONE[impactState(inc.impact)]
  const rest = inc.updates.slice(show)
  return html`<article class="panel inc${inc.resolvedAt ? '' : ` live live-${tone}`}">
    <div class="inc-top"><div><h3>${inc.title}</h3><div class="meta">${meta}</div></div>${chip || (inc.resolvedAt
      ? html`<span class="chip resolved">${icon('check')}Resolved</span>`
      : html`<span class="chip ${tone}"><span class="dot"></span>Ongoing</span>`)}</div>
    ${steps(inc)}
    <ul class="feed">${feedItems(inc.updates.slice(0, show), now)}</ul>
    ${rest.length ? html`<details class="all"><summary class="more">See all ${inc.updates.length} updates ${icon('chevron')}</summary><ul class="feed">${feedItems(rest, now)}</ul></details>` : ''}
  </article>`
}
