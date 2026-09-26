// Statements made on the device (PDF/Excel), and the edge functions that stay
// one release as their fallback. Node strips the TypeScript types.
//
//  - The PDF toolkit (supabase/functions/_shared/pdf.ts) with pdf-lib and the
//    fonts injected: font roles, fallbacks, Unicode runs, the words object.
//  - deviceFirst: the device first, the server only when that throws.
//  - Parity: generate-report and group-report are run end to end here (their
//    esm.sh imports mapped to the npm builds, Deno.serve captured, a fake
//    Supabase client) and must produce byte-identical files to the app's
//    device path from the same data, making the same reads minus the quota.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'
import { PDFDocument } from 'pdf-lib'
import { FROM, TO, fakeSupabase } from './statementFixtures.js'
import { Statement } from '../supabase/functions/_shared/pdf.ts'
import { BRAND_FONTS, cdnFontUrl, fontPath } from '../supabase/functions/_shared/brandFonts.ts'
import { STATEMENT_TEXT } from '../supabase/functions/_shared/statementText.ts'
import { deviceFirst } from '../src/shared/lib/deviceFirst.js'
import { UserError } from '../src/shared/lib/errors.js'
import { statementOnDevice } from '../src/features/insights/deviceStatement.js'
import { groupStatementOnDevice } from '../src/features/groups/deviceGroupStatement.js'

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const pkg = JSON.parse(read('package.json'))

// ---- The edge functions, runnable under Node ------------------------------

// Their URL imports, mapped to the npm builds (the supabase-js one to a
// module handing out the fake client the test sets).
const EDGE_IMPORTS = {
  'https://esm.sh/pdf-lib@1.17.1': 'pdf-lib',
  'https://esm.sh/@pdf-lib/fontkit@1.1.1': '@pdf-lib/fontkit',
  'https://esm.sh/xlsx@0.18.5': 'xlsx',
  'https://esm.sh/@supabase/supabase-js@2':
    'data:text/javascript,export const createClient = () => globalThis.__edgeClient',
}
register(`data:text/javascript,${encodeURIComponent(`
  const MAP = ${JSON.stringify(EDGE_IMPORTS)}
  export async function resolve(spec, ctx, next) { return next(MAP[spec] ?? spec, ctx) }
`)}`, import.meta.url)

let served = null
globalThis.Deno = { serve: (handler) => { served = handler }, env: { get: () => undefined } }
async function edgeHandler(path) {
  served = null
  await import(path)
  return served
}
const generateReport = await edgeHandler('../supabase/functions/generate-report/index.ts')
const groupReport = await edgeHandler('../supabase/functions/group-report/index.ts')

// A fixed clock (pdf-lib stamps CreationDate/ModDate; the group statement
// prints "as of" today), so two runs can be compared byte for byte.
const RealDate = Date
const NOW = RealDate.parse('2026-09-26T10:00:00Z')
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [NOW])) }
  static now() { return NOW }
}

// Font fetches: jsDelivr (the edge functions) and the app's own origin (the
// device), both answered from node_modules, where package.json pins them.
const fetched = []
globalThis.fetch = async (url) => {
  const u = String(url)
  fetched.push(u)
  const m = /^(?:https:\/\/cdn\.jsdelivr\.net\/npm|\/statement-fonts)\/(.+)$/.exec(u)
  if (!m) throw new Error(`unexpected fetch ${u}`)
  const file = new URL(`../node_modules/${m[1].replace(/@\d[\w.-]*/, '')}`, import.meta.url)
  return new Response(readFileSync(file))
}

async function viaServer(handler, client, body) {
  globalThis.__edgeClient = client
  const res = await handler(new Request('https://project.test/functions/v1/x', {
    method: 'POST', headers: { Authorization: 'Bearer token' }, body: JSON.stringify(body),
  }))
  assert.equal(res.status, 200)
  return new Uint8Array(await res.arrayBuffer())
}

const reads = (calls) => calls.filter((c) => c.rpc !== 'consume_quota')
const same = (a, b) => assert.ok(Buffer.from(a).equals(Buffer.from(b)), 'the files differ')

// ---- Parity: the edge function vs the device -------------------------------

for (const yearlySeparate of [false, true]) {
  const mode = yearlySeparate ? 'yearly kept separate' : 'yearly spread'
  for (const format of ['pdf', 'xlsx']) {
    test(`personal statement (${format}, ${mode}): the device makes the server's file`, async () => {
      const server = fakeSupabase({ yearlySeparate })
      const device = fakeSupabase({ yearlySeparate })
      const a = await viaServer(generateReport, server, { from: FROM, to: TO, format })
      const b = await statementOnDevice(device, { from: FROM, to: TO, format })
      same(a, b)
      // The same reads, less the server's quota step.
      assert.ok(server.calls.some((c) => c.rpc === 'consume_quota'))
      assert.deepEqual(device.calls, reads(server.calls))
      if (yearlySeparate) assert.ok(device.calls.some((c) => c.rpc === 'latest_fx_rates'))
      assert.ok(device.calls.some((c) => c.rpc === 'my_transactions' && c.args.p_spread === true
        && c.args.p_from === '2026-08-25'))
    })
  }
}

test('group statement: the device makes the server\'s file', async () => {
  const server = fakeSupabase()
  const device = fakeSupabase()
  const a = await viaServer(groupReport, server, { group_id: 'g1' })
  const b = await groupStatementOnDevice(device, 'g1')
  same(a, b)
  assert.deepEqual(device.calls, reads(server.calls))
  assert.ok(device.calls.some((c) => c.rpc === 'group_audit_entries' && c.args.p_limit === null))
})

test('group statement: a group the user can\'t see is refused, not sent to the server', async () => {
  await assert.rejects(groupStatementOnDevice(fakeSupabase(), 'other'), UserError)
})

test('fonts: the device fetches them from its own origin, the server from jsDelivr', () => {
  for (const role of Object.keys(BRAND_FONTS)) {
    assert.ok(fetched.includes(`/statement-fonts/${fontPath(role)}`), role)
    assert.ok(fetched.includes(cdnFontUrl(role)), role)
  }
})

test('the files open: a multi-page PDF, and the workbook\'s sheets and cells', async () => {
  const pdf = await PDFDocument.load(await statementOnDevice(fakeSupabase({ yearlySeparate: true }),
    { from: FROM, to: TO, format: 'pdf' }))
  assert.ok(pdf.getPageCount() >= 2)
  const wb = XLSX.read(await statementOnDevice(fakeSupabase({ yearlySeparate: true }),
    { from: FROM, to: TO, format: 'xlsx' }), { type: 'array' })
  assert.deepEqual(wb.SheetNames, ['Summary', 'Transactions', 'Yearly subscriptions'])
  const rows = XLSX.utils.sheet_to_json(wb.Sheets.Transactions, { header: 1 })
  assert.equal(rows.find((r) => r[4] === 'GBP')[6], 'Rate pending')
  assert.equal(rows.find((r) => r[3] === 'Laptop repair')[1], 'expense (from savings)')
  assert.ok(rows.some((r) => r[1] === 'saved (from income)'))
  assert.ok(rows.some((r) => r[3] === '\'=HYPERLINK("http://evil.example")'))
})

// ---- The injected toolkit --------------------------------------------------

// A pdf-lib stand-in that logs what is drawn, and with which font.
function recordingLib(available) {
  const log = []
  const pages = []
  const font = (name) => ({ name, widthOfTextAtSize: (s, size) => [...s].length * size * 0.5 })
  const page = {
    drawText: (text, o) => log.push({ text, font: o.font.name }),
    drawSvgPath: () => {}, drawRectangle: () => {}, drawCircle: () => {},
  }
  const doc = {
    addPage: () => { pages.push(page); return page },
    getPages: () => pages,
    registerFontkit: (fk) => log.push({ fontkit: fk }),
    embedFont: async (f) => font(typeof f === 'string' ? f : new TextDecoder().decode(f)),
    save: async () => new Uint8Array([37, 80, 68, 70]),
  }
  const asked = []
  const lib = {
    create: async () => doc,
    fontkit: 'the fontkit',
    fontBytes: async (role) => {
      asked.push(role)
      if (available === 'throws') throw new Error('offline')
      return available.includes(role) ? new TextEncoder().encode(role) : null
    },
  }
  return { lib, log, asked }
}

test('toolkit: the injected pdf-lib gets fontkit and every brand font, the Unicode face first', async () => {
  const { lib, log, asked } = recordingLib(Object.keys(BRAND_FONTS))
  const doc = await Statement.create(lib)
  assert.deepEqual(log[0], { fontkit: 'the fontkit' })
  assert.deepEqual(asked, ['uni', 'head', 'headBold', 'body', 'bodyBold'])
  // Latin in the brand face, Greek and arrows in DejaVu.
  doc.text('Trip → Λισαβόνα', 0, 0)
  assert.deepEqual(log.slice(-4), [
    { text: 'Trip ', font: 'body' }, { text: '→', font: 'uni' }, { text: ' ', font: 'body' }, { text: 'Λισαβόνα', font: 'uni' },
  ])
})

test('toolkit: with no fonts to be had it falls back to Helvetica, as before', async () => {
  for (const available of [[], 'throws']) {
    const { lib, log } = recordingLib(available)
    const doc = await Statement.create(lib)
    doc.text('Hello', 0, 0)
    doc.header('Title', 'meta')
    assert.deepEqual(log.find((l) => l.text === 'Hello'), { text: 'Hello', font: 'Helvetica' })
    assert.deepEqual(log.find((l) => l.text === 'Title'), { text: 'Title', font: 'Helvetica-Bold' })
  }
})

test('toolkit: the words come from the text object passed in', async () => {
  const { lib, log } = recordingLib(['body'])
  const doc = await Statement.create(lib)
  await doc.save('FOOTER-X')
  assert.ok(log.some((l) => l.text === 'FOOTER-X'))
  const d2 = await Statement.create(lib)
  await d2.save()
  assert.ok(log.some((l) => l.text === STATEMENT_TEXT.footer))
})

// ---- Device first, server as the fallback ----------------------------------

function quietLog() {
  const warned = []
  return { warned, warn: (...a) => warned.push(a) }
}

test('deviceFirst: the device\'s file when it works; the server is never asked', async () => {
  const log = quietLog()
  let asked = false
  const out = await deviceFirst('statement', async () => 'device', async () => { asked = true; return 'server' }, log)
  assert.equal(out, 'device')
  assert.equal(asked, false)
  assert.deepEqual(log.warned, [])
})

test('deviceFirst: when the device throws, the server\'s file, and the console says so', async () => {
  const log = quietLog()
  const boom = new TypeError('no WebAssembly')
  const out = await deviceFirst('statement', async () => { throw boom }, async () => 'server', log)
  assert.equal(out, 'server')
  assert.equal(log.warned.length, 1)
  assert.match(log.warned[0][0], /\[statement\].*server fallback/)
  assert.equal(log.warned[0][1], boom)
})

test('deviceFirst: an error for the user is an answer, not retried on the server', async () => {
  const log = quietLog()
  let asked = false
  await assert.rejects(
    deviceFirst('group statement', async () => { throw new UserError('Not allowed.') }, async () => { asked = true }, log),
    UserError,
  )
  assert.equal(asked, false)
})

test('deviceFirst: the server\'s error when both fail', async () => {
  const log = quietLog()
  await assert.rejects(
    deviceFirst('statement', async () => { throw new Error('device') }, async () => { throw new Error('server') }, log),
    /server/,
  )
})

// ---- Versions kept in lockstep ----------------------------------------------

test('pins: the fonts and pdf-lib are the same versions on the device and on the server', () => {
  for (const { pkg: spec } of Object.values(BRAND_FONTS)) {
    const [, name, version] = /^(.+)@([^@]+)$/.exec(spec)
    assert.equal(pkg.devDependencies[name], version, spec)
  }
  const deno = read('supabase/functions/_shared/pdfDeno.ts')
  assert.match(deno, new RegExp(`esm\\.sh/pdf-lib@${pkg.dependencies['pdf-lib']}'`))
  assert.match(deno, new RegExp(`esm\\.sh/@pdf-lib/fontkit@${pkg.dependencies['@pdf-lib/fontkit']}'`))
})
