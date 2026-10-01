// i18n: the dictionaries (src/locales) and the engine (src/shared/lib/i18n).
// Every Greek namespace has exactly the English keys, with the same
// {{placeholders}} and rich-text tags, and every plural has the forms each
// language needs. Then the engine (lookup, fallback, plurals, rich text), the
// language preference, and locale-aware formatting (English output unchanged).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import en from '../src/locales/en/index.js'
import el from '../src/locales/el/index.js'
import {
  interpolate, lookup, parseRich, placeholders, pluralCategory, resolveIn, richTags, splitKey, translateIn,
} from '../src/shared/lib/i18n/translate.js'
import { getLanguage, intlLocale, loadLanguage, t, translate } from '../src/shared/lib/i18n/i18n.js'
import {
  LANGUAGES, deviceLanguage, normalisePref, prefFromProfile, profileValue, reconcileLanguage, resolveLanguage,
} from '../src/shared/lib/i18n/language.js'
import { formatMoney, formatRate } from '../src/shared/lib/currency.js'
import { lastMonths, monthName, monthTitle, shortDate, shortMonth } from '../src/shared/lib/dates.js'

const PACKS = { en, el }

// { 'a.b.c': 'string' } for every leaf of a namespace.
function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object') flatten(v, key, out)
    else out[key] = v
  }
  return out
}

const nsFiles = (lang) => readdirSync(new URL(`../src/locales/${lang}/`, import.meta.url))
  .filter((f) => f.endsWith('.js') && f !== 'index.js').map((f) => f.slice(0, -3)).sort()

test('every namespace file is registered, in both languages', () => {
  for (const lang of LANGUAGES) {
    assert.deepEqual(Object.keys(PACKS[lang]).sort(), nsFiles(lang), `${lang}/index.js vs its files`)
  }
  assert.deepEqual(nsFiles('el'), nsFiles('en'))
})

test('every value is a non-empty string', () => {
  for (const lang of LANGUAGES) {
    for (const [ns, dict] of Object.entries(PACKS[lang])) {
      for (const [key, v] of Object.entries(flatten(dict))) {
        assert.equal(typeof v, 'string', `${lang} ${ns}:${key} isn't a string`)
        assert.ok(v.trim(), `${lang} ${ns}:${key} is empty`)
      }
    }
  }
})

test('every el namespace has exactly the en keys', () => {
  for (const ns of Object.keys(en)) {
    const want = Object.keys(flatten(en[ns])).sort()
    const got = Object.keys(flatten(el[ns])).sort()
    const missing = want.filter((k) => !got.includes(k))
    const extra = got.filter((k) => !want.includes(k))
    assert.deepEqual({ missing, extra }, { missing: [], extra: [] }, `el ${ns}`)
  }
})

test('placeholders and rich-text tags match across languages', () => {
  for (const ns of Object.keys(en)) {
    const e = flatten(en[ns])
    const g = flatten(el[ns])
    for (const key of Object.keys(e)) {
      assert.deepEqual(placeholders(g[key]), placeholders(e[key]), `{{…}} differ in ${ns}:${key}`)
      assert.deepEqual(richTags(g[key]), richTags(e[key]), `<tags> differ in ${ns}:${key}`)
    }
  }
})

test('plurals have every form each language needs, and use {{count}}', () => {
  const SUFFIX = /_(zero|one|two|few|many|other)$/
  for (const lang of LANGUAGES) {
    const needed = new Intl.PluralRules(lang).resolvedOptions().pluralCategories
    for (const [ns, dict] of Object.entries(PACKS[lang])) {
      const flat = flatten(dict)
      const bases = new Set(Object.keys(flat).filter((k) => SUFFIX.test(k)).map((k) => k.replace(SUFFIX, '')))
      for (const base of bases) {
        for (const form of needed) {
          assert.ok(`${base}_${form}` in flat, `${lang} ${ns}:${base} lacks the "${form}" form`)
        }
        for (const [k, v] of Object.entries(flat)) {
          if (k.replace(SUFFIX, '') === base && k !== base) {
            assert.ok(placeholders(v).includes('count'), `${lang} ${ns}:${k} doesn't show {{count}}`)
          }
        }
      }
    }
  }
})

test('engine: keys, lookup, interpolation', () => {
  assert.deepEqual(splitKey('settings:appearance.title', 'common'), ['settings', 'appearance.title'])
  assert.deepEqual(splitKey('appearance.title', 'settings'), ['settings', 'appearance.title'])
  assert.equal(lookup({ a: { b: 'x' } }, 'a.b'), 'x')
  assert.equal(lookup({ a: { b: 'x' } }, 'a'), undefined)
  assert.equal(lookup({ a: 'x' }, 'a.b'), undefined)
  assert.equal(interpolate('Hi {{name}}, {{ n }}!', { name: 'Anna', n: 2 }), 'Hi Anna, 2!')
  assert.equal(interpolate('Hi {{name}}', {}), 'Hi {{name}}')
  assert.equal(interpolate('50% of {{x}}', { x: '<b>' }), '50% of <b>')
  assert.deepEqual(placeholders('{{b}} of {{a}} and {{b}}'), ['a', 'b'])
})

test('engine: plurals via Intl.PluralRules', () => {
  assert.equal(pluralCategory('el', 1), 'one')
  assert.equal(pluralCategory('el', 0), 'other')
  assert.equal(pluralCategory('el', 2), 'other')
  const dicts = { x: { n_one: '{{count}} item', n_other: '{{count}} items', bare: 'no forms' } }
  assert.equal(resolveIn(dicts, 'en', 'x', 'n', 1), '{{count}} item')
  assert.equal(resolveIn(dicts, 'en', 'x', 'n', 5), '{{count}} items')
  assert.equal(resolveIn(dicts, 'en', 'x', 'bare', 5), 'no forms')
  assert.equal(translate('landing:how.settle.payments', { count: 1 }), '1 payment settles everyone')
  assert.equal(translate('landing:how.settle.payments', { count: 3 }), '3 payments settle everyone')
})

test('engine: rich text parses to a tree, never HTML', () => {
  assert.deepEqual(parseRich('Read the <link>Terms</link> now.'),
    ['Read the ', { tag: 'link', children: ['Terms'] }, ' now.'])
  assert.deepEqual(parseRich('one<br/>two'), ['one', { tag: 'br', children: [] }, 'two'])
  assert.deepEqual(parseRich('<a><b>x</b></a>'), [{ tag: 'a', children: [{ tag: 'b', children: ['x'] }] }])
  // Not a tag: kept as text. A stray closing tag stays text; an open one closes at the end.
  assert.deepEqual(parseRich('1 < 2 and <3'), ['1 < 2 and <3'])
  assert.deepEqual(parseRich('a</b>c'), ['a', '</b>', 'c'])
  assert.deepEqual(parseRich('<b>open'), [{ tag: 'b', children: ['open'] }])
  assert.deepEqual(richTags('<accent>x</accent><br/>'), ['accent', 'br'])
})

test('translate: English by default; a missing Greek key falls back to English', async () => {
  assert.equal(getLanguage(), 'en')
  assert.equal(t('settings:title'), 'Settings')
  assert.equal(translate('title', null, { defaultNs: 'settings' }), 'Settings')
  assert.equal(translate('nope:missing.key'), 'nope:missing.key')
  assert.equal(await loadLanguage('el'), 'el')
  try {
    assert.equal(t('settings:title'), 'Ρυθμίσεις')
    assert.equal(translate('landing:how.settle.payments', { count: 1 }), '1 πληρωμή τα κλείνει όλα')
    assert.equal(translate('settings:title', null, { lang: 'en' }), 'Settings')
  } finally {
    await loadLanguage('en')
  }
})

test('translateIn: a key Greek lacks shows in English, and says so', () => {
  const packs = { en: { x: { only: 'English only', both: 'Both', n_one: 'one', n_other: 'many' } }, el: { x: { both: 'Και τα δύο' } } }
  const heard = []
  const opts = { defaultNs: 'x', onMissing: (m) => heard.push(m) }
  assert.equal(translateIn(packs, 'el', 'both', null, opts), 'Και τα δύο')
  assert.equal(translateIn(packs, 'el', 'only', null, opts), 'English only')
  assert.equal(translateIn(packs, 'el', 'n', { count: 2 }, opts), 'many')
  assert.equal(translateIn(packs, 'el', 'x:gone', null, opts), 'x:gone')
  assert.deepEqual(heard, [
    'el has no "x:only"; showing en', 'el has no "x:n"; showing en',
    'el has no "x:gone"; showing en', 'missing key "x:gone"',
  ])
})

test('language preference: device detection, resolution, profile sync', () => {
  assert.equal(deviceLanguage(['en-US', 'el-GR']), 'el')
  assert.equal(deviceLanguage(['el']), 'el')
  assert.equal(deviceLanguage(['EL-cy']), 'el')
  assert.equal(deviceLanguage(['en-GB', 'fr']), 'en')
  assert.equal(deviceLanguage(['elx', 'eng']), 'en')
  assert.equal(deviceLanguage([]), 'en')
  assert.equal(deviceLanguage(undefined), 'en')
  assert.equal(normalisePref('fr'), 'system')
  assert.equal(normalisePref(null), 'system')
  assert.equal(resolveLanguage('system', ['el-GR']), 'el')
  assert.equal(resolveLanguage('en', ['el-GR']), 'en')
  assert.equal(resolveLanguage('el', ['en-US']), 'el')
  assert.equal(resolveLanguage('bogus', ['en-US']), 'en')
  assert.equal(profileValue('system'), null)
  assert.equal(profileValue('el'), 'el')
  assert.equal(prefFromProfile(null), 'system')
  assert.equal(prefFromProfile('en'), 'en')
  // The profile wins when it holds a language…
  assert.deepEqual(reconcileLanguage('el', 'en'), { local: 'el', push: undefined })
  assert.deepEqual(reconcileLanguage('en', 'system'), { local: 'en', push: undefined })
  // …and a choice made here signed out is saved to a profile without one.
  assert.deepEqual(reconcileLanguage(null, 'el'), { local: 'el', push: 'el' })
  assert.deepEqual(reconcileLanguage(null, 'system'), { local: 'system', push: undefined })
  assert.deepEqual(reconcileLanguage(undefined, 'junk'), { local: 'system', push: undefined })
})

const nbsp = (s) => s.replace(/[\u00a0\u202f]/g, ' ')

test('formatting: English output is what it was', () => {
  assert.equal(getLanguage(), 'en')
  assert.equal(intlLocale(), undefined)
  assert.equal(intlLocale('en-US'), 'en-US')
  assert.equal(formatMoney(123456, 'EUR'), new Intl.NumberFormat(undefined, {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(1234.56))
  assert.equal(formatRate(1.169912), '1.1699')
  const now = new Date(2026, 8, 26)
  assert.equal(shortDate('2026-09-26', now), '26 Sep')
  assert.equal(shortDate('2025-09-26', now), '26 Sep 2025')
  assert.equal(monthTitle(now), 'September 2026')
  assert.equal(monthName(now), 'September')
  assert.equal(shortMonth(8), 'Sep')
  assert.equal(lastMonths(1, now)[0].label, 'Sep')
})

test('formatting: Greek reads 1.234,56 € and 26 Σεπ 2026', async () => {
  await loadLanguage('el')
  try {
    assert.equal(intlLocale('en-US'), 'el-GR')
    assert.equal(nbsp(formatMoney(123456, 'EUR')), '1.234,56 €')
    assert.equal(nbsp(formatMoney(1800, 'JPY')), '1.800 JP¥')
    assert.equal(formatRate(1.169912), '1,1699')
    const now = new Date(2026, 8, 26)
    assert.equal(shortDate('2026-09-26', new Date(2025, 0, 1)), '26 Σεπ 2026')
    assert.equal(shortDate('2026-05-03', now), '3 Μαΐ')
    assert.equal(monthTitle(now), 'Σεπτέμβριος 2026')
    assert.equal(monthName(now), 'Σεπτέμβριος')
    assert.equal(lastMonths(1, now)[0].label, 'Σεπ')
    // The fixed abbreviations every engine shows alike (Intl's May varies: Μαΐ, Μάι).
    assert.deepEqual(lastMonths(5, now).map((m) => m.label), ['Μαΐ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ'])
  } finally {
    await loadLanguage('en')
  }
})
