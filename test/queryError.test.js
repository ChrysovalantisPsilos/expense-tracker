import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadLanguage, translate } from '../src/shared/lib/i18n/i18n.js'
import el from '../src/locales/el/index.js'

// QueryError's title is one frame, common:queryError.title, with the caller's
// `what` in it: "Couldn't load your transactions" / «Δεν μπορέσαμε να
// φορτώσουμε τις κινήσεις σου». In Greek every `what` is the frame's object,
// so it must be in the accusative with its article (or a demonstrative).
const SRC = fileURLToPath(new URL('../src', import.meta.url))
const jsxFiles = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f)
  return statSync(p).isDirectory() ? jsxFiles(p) : p.endsWith('.jsx') ? [p] : []
})

// Every <QueryError what={t('key')}> with the namespace of the file's useT.
function callers() {
  const out = []
  for (const file of jsxFiles(SRC)) {
    const src = readFileSync(file, 'utf8')
    if (!src.includes('<QueryError')) continue
    for (const m of src.matchAll(/<QueryError[^>]*?what=\{t\('([^']+)'\)\}/gs)) {
      // The nearest useT('ns') above the call.
      const before = src.slice(0, m.index)
      const ns = [...before.matchAll(/useT\('([a-z]+)'\)/g)].pop()?.[1]
      out.push({ file: file.slice(SRC.length + 1), key: m[1].includes(':') ? m[1] : `${ns}:${m[1]}` })
    }
  }
  return out
}

const lookup = (dict, key) => {
  const [ns, path] = key.split(':')
  return path.split('.').reduce((o, k) => o?.[k], dict[ns])
}

// Accusative articles / demonstratives: τον, την, τη, το, τους, τις, τα, αυτό(ν), αυτή(ν), αυτά, αυτές, αυτούς.
const ACCUSATIVE = /^(τον|την|τη|το|τους|τις|τα|αυτόν?|αυτήν?|αυτά|αυτές|αυτούς) /

test('QueryError: every caller\'s Greek `what` fits the frame (accusative, with its article)', () => {
  const list = callers()
  assert.ok(list.length >= 20, `found ${list.length} callers`)
  for (const { file, key } of list) {
    const what = lookup(el, key)
    assert.equal(typeof what, 'string', `${file}: ${key} missing in Greek`)
    assert.match(what, ACCUSATIVE, `${file}: ${key} = «${what}»`)
  }
  assert.match(el.common.queryError.this, ACCUSATIVE)
})

test('QueryError: the frame reads naturally in both languages', async () => {
  await loadLanguage('el')
  await loadLanguage('en')
  assert.equal(translate('common:queryError.title', { what: 'your transactions' }, { lang: 'en' }),
    'Couldn’t load your transactions')
  assert.equal(translate('common:queryError.title', { what: el.transactions.ledger.what }, { lang: 'el' }),
    'Δεν μπορέσαμε να φορτώσουμε τις κινήσεις σου')
})
