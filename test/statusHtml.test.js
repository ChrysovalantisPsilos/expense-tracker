// Status page: HTML escaping and UTC time wording.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escapeHtml, html, raw } from '../status/src/html.js'
import { clock, relDay, stamp, startedAt, duration, ago, windowText, windowDated, shortDay, fullDate } from '../status/src/time.js'

test('escapeHtml escapes the five characters and tolerates null', () => {
  assert.equal(escapeHtml(`<a href="x" onclick='y'>&</a>`), '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;')
  assert.equal(escapeHtml(null), '')
  assert.equal(escapeHtml(undefined), '')
  assert.equal(escapeHtml(0), '0')
})

test('html`` escapes every interpolation unless it is already html', () => {
  const evil = '<script>alert(1)</script>'
  const out = String(html`<p title="${evil}">${evil}</p>`)
  assert.ok(!out.includes('<script>'))
  assert.equal(out, '<p title="&lt;script&gt;alert(1)&lt;/script&gt;">&lt;script&gt;alert(1)&lt;/script&gt;</p>')
  assert.equal(String(html`<ul>${['<a>', html`<li>ok</li>`]}</ul>`), '<ul>&lt;a&gt;<li>ok</li></ul>')
  assert.equal(String(html`${null}${false}${undefined}${0}`), '0')
  assert.equal(String(html`${raw('<svg/>')}`), '<svg/>')
})

test('time wording is UTC', () => {
  const now = '2026-09-25T12:00:00Z'
  assert.equal(clock('2026-09-25T07:05:00Z'), '07:05')
  assert.equal(relDay('2026-09-25T00:10:00Z', now), 'Today')
  assert.equal(relDay('2026-09-24T23:59:00Z', now), 'Yesterday')
  assert.equal(relDay('2026-09-13T14:52:00Z', now), '13 Sep')
  assert.equal(stamp('2026-09-13T14:52:00Z', now), '13 Sep, 14:52')
  assert.equal(startedAt('2026-09-25T07:40:00Z', now), 'today at 07:40')
  assert.equal(fullDate('2026-09-13T14:52:00Z'), '13 Sep 2026')
  assert.equal(shortDay('2026-10-04T02:00:00Z'), 'Sun 4 Oct')
  assert.equal(duration(47 * 60000), '47 min')
  assert.equal(duration(125 * 60000), '2 h 5 min')
  assert.equal(duration(120 * 60000), '2 h')
  assert.equal(duration(5 * 86400000), '5 days')
  assert.equal(ago('2026-09-25T11:56:00Z', now), '4 minutes ago')
  assert.equal(ago('2026-09-25T11:59:30Z', now), 'just now')
  assert.equal(ago('2026-09-25T11:00:00Z', now), '1 hour ago')
  assert.equal(ago('2026-09-13T12:00:00Z', now), '12 days ago')
  assert.equal(windowText('2026-10-04T02:00:00Z', '2026-10-04T02:30:00Z'), 'Sunday, 02:00–02:30 UTC')
  assert.equal(windowText('2026-10-04T22:00:00Z', '2026-10-05T01:00:00Z'), 'Sun 4 Oct 22:00 – Mon 5 Oct 01:00 UTC')
  assert.equal(windowDated('2026-10-04T02:00:00Z', '2026-10-04T02:30:00Z'), 'Sun 4 Oct, 02:00–02:30 UTC')
  assert.equal(windowDated('2026-10-04T22:00:00Z', '2026-10-05T01:00:00Z'), 'Sun 4 Oct 22:00 – Mon 5 Oct 01:00 UTC')
})
