// The shared branded email layout (supabase/functions/_shared/email.ts).
// Node strips the TypeScript types.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { EMAIL_COLORS, brandEmail, esc } from '../supabase/functions/_shared/email.ts'
import { contrast } from './contrast.js'

const EVIL = '<script>alert("x")</script> & \'q\''
const sample = (over = {}) => brandEmail({
  origin: 'https://dev.budgeer.com/',
  heading: `${EVIL} invited you`,
  paragraphs: [`Hi ${EVIL}`, 'Second line'],
  cta: { label: 'Join the group', url: 'https://dev.budgeer.com/join/abc?x="><img src=x>' },
  showLink: true,
  footer: ['You can turn these emails off in Settings → Notifications.'],
  ...over,
})

test('esc escapes the five HTML specials', () => {
  assert.equal(esc(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;')
})

test('every interpolated value is escaped in the HTML', () => {
  const { html } = sample()
  assert.doesNotMatch(html, /<script>/)
  assert.doesNotMatch(html, /"><img src=x>/)
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; &#39;q&#39; invited you/)
  // The link is printed (escaped) under the button when asked.
  assert.equal(html.split('join/abc?x=&quot;&gt;&lt;img src=x&gt;').length - 1, 3) // href ×2 + text
  assert.doesNotMatch(sample({ showLink: false }).html, /paste this link/)
})

test('the plain-text alternative carries the same content, unescaped', () => {
  const { text } = sample()
  assert.equal(text, [
    `${EVIL} invited you`,
    `Hi ${EVIL}`,
    'Second line',
    'Join the group: https://dev.budgeer.com/join/abc?x="><img src=x>',
    '--\nBudgeer · your money, your friends, sorted\nYou can turn these emails off in Settings → Notifications.',
  ].join('\n\n'))
  assert.doesNotMatch(text, /&amp;|<br>/)
})

test('bulleted lists and labelled links are escaped too, and read as lines in the text', () => {
  const { html, text } = brandEmail({
    origin: 'https://dev.budgeer.com',
    heading: 'H',
    paragraphs: ['Intro', [`One ${EVIL}`, 'Two']],
    links: [{ label: `Doc ${EVIL}`, url: 'https://dev.budgeer.com/privacy?x="><b>' }],
  })
  assert.doesNotMatch(html, /<script>|"><b>/)
  assert.match(html, /<ul class="bb-body"[^>]*><li[^>]*>One &lt;script&gt;/)
  assert.match(html, /Doc &lt;script&gt;.*href="https:\/\/dev\.budgeer\.com\/privacy\?x=&quot;&gt;&lt;b&gt;"/)
  assert.ok(text.includes(`Intro\n\n- One ${EVIL}\n- Two\n\nDoc ${EVIL}: https://dev.budgeer.com/privacy?x="><b>`))
  // The inbox preview is the first paragraph, never a list.
  assert.match(html, /opacity:0;">Intro<\/div>/)
})

test('header mark comes from the app origin and exists in public/', () => {
  const { html } = sample()
  assert.match(html, /<img src="https:\/\/dev\.budgeer\.com\/email-mark\.png" width="32" height="32" alt=""/)
  assert.ok(existsSync(new URL('../public/email-mark.png', import.meta.url)))
})

test('light and dark palettes are declared', () => {
  const { html } = sample()
  assert.match(html, /<meta name="color-scheme" content="light dark">/)
  assert.match(html, /@media \(prefers-color-scheme: dark\)/)
  for (const [, dark] of Object.values(EMAIL_COLORS)) assert.ok(html.includes(dark))
})

test('text colours meet WCAG AA (4.5:1) on their surfaces in both modes', () => {
  const pairs = [
    ['heading', 'card'], ['body', 'card'], ['muted', 'card'], ['link', 'card'],
    ['muted', 'canvas'], ['heading', 'canvas'], ['buttonText', 'button'],
  ]
  for (const mode of [0, 1]) {
    for (const [fg, bg] of pairs) {
      const ratio = contrast(EMAIL_COLORS[fg][mode], EMAIL_COLORS[bg][mode])
      assert.ok(ratio >= 4.5, `${fg} on ${bg} (${mode ? 'dark' : 'light'}): ${ratio.toFixed(2)}`)
    }
  }
})
