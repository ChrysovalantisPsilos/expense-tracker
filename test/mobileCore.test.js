// The mobile core (mobile-core/, ios/README.md): the web app's pure maths
// bundled for JavaScriptCore. Three proofs, all on the bundle esbuild makes
// here (the same build as `npm run core:build`):
//   1. its module graph reaches nothing forbidden (React, Supabase, browser
//      APIs), and it evaluates in a bare context with only the language's
//      own globals, as JavaScriptCore gives it;
//   2. every namespace in mobile-core/modules.js is there, and setLanguage
//      changes the wording;
//   3. every recorded vector (npm run core:vectors) replays to the recorded
//      result, so bundle = source. The Swift tests replay the same file
//      through JavaScriptCore.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import { buildCore, ROOT, forbiddenInputs } from '../mobile-core/build.mjs'
import { CORE_MODULES, CORE_PACKAGES, VECTORS_FILE } from '../mobile-core/modules.js'
import { NotEncodable, decode, encode } from '../mobile-core/vectorCodec.js'

const built = buildCore()

// A context with the engine's own globals only: no process, require, console,
// timers, fetch or DOM — what a JSContext offers.
async function loadCore() {
  const { code } = await built
  const context = vm.createContext(Object.create(null))
  vm.runInContext(code, context, { filename: 'core.js' })
  return context.BudgeerCore
}

test('mobile core: the bundle reaches no forbidden module and no browser API', async () => {
  const { code, metafile } = await built
  assert.deepEqual(forbiddenInputs(metafile), [])
  const inputs = Object.keys(metafile.inputs)
  const packages = inputs.filter((p) => p.startsWith('node_modules/') && !CORE_PACKAGES.some((pkg) => p.startsWith(`node_modules/${pkg}/`)))
  assert.deepEqual(packages, [], 'bundles a package that isn\'t one of CORE_PACKAGES')
  assert.ok(existsSync(resolve(ROOT, 'ios/BudgeerCore/Sources/BudgeerCore/Resources/SHEETJS-LICENSE.txt')), 'SheetJS\'s licence ships beside the bundle')
  for (const path of Object.values(CORE_MODULES)) assert.ok(inputs.includes(path), `${path} is not in the bundle`)
  // A property access on a browser global (prose in a dictionary string says
  // "document. The…" with a space, never "document.cookie"). In our own code
  // only: SheetJS's file-saving paths name document and navigator behind
  // typeof checks, and the core never saves a file (it only reads one).
  const own = code.split(/^ {2}\/\/ (?=\S+$)/m)
    .filter((part) => !CORE_PACKAGES.some((pkg) => part.startsWith(`node_modules/${pkg}/`))).join('')
  const source = own.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const browser = source.match(/\b(window|document|localStorage|sessionStorage|indexedDB|navigator|XMLHttpRequest)[.[][A-Za-z_$'"]/g)
  assert.equal(browser, null, `the core touches a browser API: ${browser}`)
  assert.equal(source.match(/(?<!define:)import\.meta\b/), null, 'import.meta survives the build (only esbuild\'s define label may name it)')
})

test('mobile core: loads in a bare context with every namespace, and switches language', async () => {
  const core = await loadCore()
  assert.deepEqual(Object.keys(core.modules).sort(), Object.keys(CORE_MODULES).sort())
  assert.deepEqual(JSON.parse(JSON.stringify(core.sources)), CORE_MODULES) // across realms: by value
  assert.equal(core.getLanguage(), 'en')
  assert.equal(core.modules.splitMath.splitEqually(1000, 3).join(','), '334,333,333')
  assert.equal(core.modules.currency.formatMoney(123456, 'EUR', 'en-US'), '€1,234.56')
  assert.equal(core.modules.i18n.t('recurring:choices.monthly'), 'Monthly')
  assert.equal(core.setLanguage('el'), 'el')
  assert.equal(core.modules.i18n.t('recurring:choices.monthly'), 'Μηνιαία')
  assert.equal(core.modules.currency.formatMoney(123456, 'EUR'), '1.234,56 €') // Intl's no-break space
  assert.equal(core.setLanguage('fr'), 'en', 'an unknown language falls back to English')
  assert.equal(core.vectors.call('splitMath', 'splitEqually', '[1000,3]'), '[334,333,333]')
  assert.throws(() => core.vectors.call('splitMath', 'nope', '[]'), /no function "splitMath.nope"/)
  // A constant answers its value when asked with no arguments (never with some).
  assert.equal(core.vectors.call('statementDetect', 'CONFIDENCE_THRESHOLD', '[]'), '0.8')
  assert.equal(JSON.parse(core.vectors.call('statementDetect', 'DATE_ORDERS', '[]')).join(','), 'dmy,mdy,ymd')
  assert.throws(() => core.vectors.call('statementDetect', 'DATE_ORDERS', '[1]'), /no function "statementDetect.DATE_ORDERS"/)
})

// A statement's bytes go in as a Uint8Array (vectors.callBytes, as the app
// hands a file over), never as JSON; the engine has no TextDecoder, so the
// core's own decodes the text files. Each must read as the web's worker
// reads it in the browser.
test('mobile core: reads statement files from their bytes as the web does (CSV in any code page, .xlsx, .xls)', async () => {
  const core = await loadCore()
  const { code } = await built
  const context = vm.createContext(Object.create(null))
  vm.runInContext(code, context)
  const Bytes = vm.runInContext('Uint8Array', context)
  const { readStatement } = await import('../src/features/import/sheetRead.js')
  const XLSX = await import('xlsx')
  const book = (type) => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Statement for Jane Doe'], [], ['Date', 'Amount', 'Description'],
      [new Date(2026, 8, 1), -12.5, 'Καφές'], [new Date(2026, 8, 2), 2500, 'ACME'],
    ]), 'S')
    return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: type }))
  }
  const greek = [0x44, 0x61, 0x74, 0x65, 0x3b, 0xd0, 0xe5, 0xf1, 0xe9, 0xe3, 0xf1, 0xe1, 0xf6, 0xde, 0x0a, // Date;Περιγραφή (cp1253)
    0x30, 0x31, 0x2f, 0x30, 0x39, 0x2f, 0x32, 0x30, 0x32, 0x36, 0x3b, 0xc1, 0xe8, 0xde, 0xed, 0xe1, 0x0a, // 01/09/2026;Αθήνα
    0x30, 0x31, 0x2f, 0x30, 0x39, 0x2f, 0x32, 0x30, 0x32, 0x36, 0x3b, 0xca, 0xe1, 0xf6, 0xdd, 0xf2, 0x0a] // 01/09/2026;Καφές
  const files = [
    new TextEncoder().encode('﻿Date,Amount,Description\n2026-09-01,"-1,50",Café\n'),
    Uint8Array.from(greek),
    Uint8Array.from([0xff, 0xfe, ...[...'Date\tAmount\n1/9/2026\t5\n'].flatMap((c) => [c.charCodeAt(0), 0])]),
    book('xlsx'), book('biff8'),
    Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]),
  ]
  for (const bytes of files) {
    const got = JSON.parse(core.vectors.callBytes('sheetRead', 'readStatement', new Bytes(bytes), '[]'))
    assert.deepEqual(got, JSON.parse(JSON.stringify(readStatement(bytes))))
  }
  assert.equal(JSON.parse(core.vectors.callBytes('sheetRead', 'readStatement', new Bytes(Uint8Array.from(greek)), '[]')).headers[1], 'Περιγραφή')
  assert.throws(() => core.vectors.callBytes('sheetRead', 'nope', new Bytes(1), '[]'), /no function "sheetRead.nope"/)
})

test('vector codec: undefined, Date, Set and Map round-trip; the rest is refused', () => {
  const value = { a: undefined, d: new Date('2026-09-30T10:00:00.000Z'), s: new Set([1, 'x']), m: new Map([['k', [undefined]]]), n: null }
  const json = JSON.stringify(encode(value))
  assert.equal(json, '{"a":{"$":"u"},"d":{"$":"date","v":"2026-09-30T10:00:00.000Z"},"s":{"$":"set","v":[1,"x"]},"m":{"$":"map","v":[["k",[{"$":"u"}]]]},"n":null}')
  const back = decode(JSON.parse(json))
  assert.ok('a' in back && back.a === undefined)
  assert.equal(back.d.getTime(), value.d.getTime())
  assert.deepEqual([...back.s], [1, 'x'])
  assert.deepEqual([...back.m.get('k')], [undefined])
  for (const bad of [NaN, Infinity, () => 1, new Date('nope'), Symbol('s'), 10n, new (class X {})(), { $: 1 }]) {
    assert.throws(() => encode(bad), NotEncodable)
  }
})

test('mobile core: every recorded vector replays to the same result in the bundle', async () => {
  const file = resolve(ROOT, VECTORS_FILE)
  assert.ok(existsSync(file), `${VECTORS_FILE} is missing: run npm run core:vectors`)
  const { vectors } = JSON.parse(readFileSync(file, 'utf8'))
  assert.ok(vectors.length > 1000, `only ${vectors.length} vectors`)
  const core = await loadCore()
  // The vectors were recorded in UTC (core:vectors); replay them there too.
  const tz = process.env.TZ
  process.env.TZ = 'UTC'
  const failures = []
  try {
    let lang = core.setLanguage('en')
    for (const v of vectors) {
      const want = v.l ?? 'en'
      if (want !== lang) lang = core.setLanguage(want)
      const got = JSON.parse(core.vectors.call(v.m, v.f, v.a))
      try { assert.deepEqual(got, v.r) } catch { failures.push(`${v.m}.${v.f}(${v.a.slice(0, 120)}) → ${JSON.stringify(got).slice(0, 120)}, recorded ${JSON.stringify(v.r).slice(0, 120)}`) }
    }
  } finally {
    if (tz === undefined) delete process.env.TZ
    else process.env.TZ = tz
  }
  assert.deepEqual(failures.slice(0, 10), [], `${failures.length} of ${vectors.length} vectors differ`)
})
