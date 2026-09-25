// One anonymised fixture per supported bank export, hand-written from each
// bank's published layout (test/fixtures/banks/), read end-to-end: bytes →
// header row → preset → drafts. The Piraeus export is a real .xlsx, built
// here with SheetJS from the documented layout.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'
import { parseSheet, rowsToObjects } from '../src/features/import/sheetParse.js'
import { detectMapping, CONFIDENCE_THRESHOLD } from '../src/features/import/statementDetect.js'
import { rowToDraft, signedConvention, merchantKey, groupMerchants } from '../src/features/import/importMath.js'
import { PRESETS, matchPreset, normHeader } from '../src/features/import/bankPresets.js'

function read(buf) {
  const { headers, rows, lines } = parseSheet(XLSX, buf)
  const objs = rowsToObjects(headers, rows)
  const detection = detectMapping(headers, objs)
  const signed = signedConvention(objs, detection.mapping)
  const drafts = objs.map((r) => rowToDraft(r, detection.mapping, 'EUR', { signed }))
  return { lines, detection, drafts, booked: drafts.filter((d) => !d.skip && !d.error) }
}
const fixture = (name) => read(readFileSync(new URL(`./fixtures/banks/${name}`, import.meta.url)))
const brief = (d) => [d.spent_at, d.kind, d.amount_minor, d.currency]

function assertRecognised(r, id) {
  assert.equal(r.detection.preset?.id, id)
  assert.ok(r.detection.confidence >= CONFIDENCE_THRESHOLD, `confidence ${r.detection.confidence}`)
  assert.equal(r.drafts.filter((d) => d.error).length, 0, JSON.stringify(r.drafts))
}

test('BNP Paribas Fortis (NL, UTF-8 BOM): signed decimal commas, refused row skipped', () => {
  const r = fixture('bnp-fortis-nl.csv')
  assertRecognised(r, 'bnp-fortis')
  assert.deepEqual(r.booked.map(brief), [
    ['2026-09-03', 'expense', 2345, 'EUR'],
    ['2026-09-01', 'income', 215000, 'EUR'],
    ['2026-08-31', 'expense', 102050, 'EUR'],
  ])
  assert.deepEqual(r.drafts[3], { skip: 'pending or declined' })
  assert.match(r.booked[1].description, /^ACME BV · Loon augustus/)
  assert.equal(merchantKey(r.booked[0].description), 'COLRUYT')
})

test('BNP Paribas Fortis (FR, Windows-1252): accents decode, French headers map', () => {
  const r = fixture('bnp-fortis-fr.csv')
  assertRecognised(r, 'bnp-fortis')
  assert.equal(r.detection.mapping.date, 'Date d\'exécution')
  assert.match(r.booked[0].description, /^BOULANGERIE DUPRÉ/)
  assert.deepEqual(r.booked.map(brief), [
    ['2026-08-12', 'expense', 480, 'EUR'],
    ['2026-08-11', 'expense', 6210, 'EUR'],
    ['2026-08-10', 'income', 1500, 'EUR'],
  ])
})

test('ING Belgium: booking date, Munteenheid, description + details', () => {
  const r = fixture('ing-be.csv')
  assertRecognised(r, 'ing-be')
  assert.deepEqual(r.booked.map(brief), [
    ['2026-09-14', 'expense', 1299, 'EUR'],
    ['2026-09-13', 'income', 50000, 'EUR'],
    ['2026-09-12', 'expense', 950, 'EUR'],
  ])
  // Bank boilerplate is skipped for rules: the merchant is DELHAIZE.
  assert.equal(merchantKey(r.booked[0].description), 'DELHAIZE')
})

test('KBC: "Valuta" is the value date — currency comes from "Munt"', () => {
  const r = fixture('kbc.csv')
  assertRecognised(r, 'kbc')
  assert.equal(r.detection.mapping.currency, 'Munt')
  assert.equal(r.detection.mapping.date, 'Datum')
  assert.deepEqual(r.booked.map(brief), [
    ['2026-09-20', 'expense', 4520, 'EUR'],
    ['2026-09-18', 'income', 25000, 'EUR'],
  ])
  assert.match(r.booked[1].description, /^K\. DE SMET · EUROPESE OVERSCHRIJVING VAN · Verjaardag$/)
  assert.equal(r.detection.mapping.holder, 'Naam')
  assert.deepEqual(r.booked.map((d) => d.merchant), ['ALDI', 'DE SMET'])
})

// The English KBC header as exported (with Heading), and as some exports
// write it (no Heading column). Lines end in a bare CR, as KBC's do.
const KBC_EN = 'Account number;Heading;Name;Currency;Statement number;Date;Description;Value date;Amount;Balance;credit;debit;counterparty\'s account number;Counterparty BIC;Counterparty name;Counterparty address;standard-format reference;Free-format reference'
const kbcEn = (header, cells) => read(new TextEncoder().encode([header, ...cells].join('\r') + '\r'))
const kbcRows = (heading) => [
  ['PAYMENT VIA BANCONTACT 06-01-2026 AT 10.54 TIME LIDL 1153 LEUVEN BE3000 LEUVEN WITH KBC DEBIT CARD 5127 88XX XXXX 1234 CARDHOLDER: DOE JANE', '-8,00', '', '', ''],
  ["SENDING MONEY INSTANTLY TO BE00 6500 0000 0002 BENEFICIARY'S BANK: REVOBEB2XXX JANE DOE AT 17.05 WITH KBC MOBILE", '-150,00', 'BE00 6500 0000 0002', 'REVOBEB2XXX', 'JANE DOE'],
  ['EUROPEAN TRANSFER FROM BE00 3100 0000 0003', '3233,60', 'BE00 3100 0000 0003', 'BBRUBEBB', 'ACME CLINICAL RESEARCH BV'],
].map(([desc, amount, acc, bic, name]) => ['BE00 7300 0000 0001', ...(heading ? [''] : []), 'DOE JANE', 'EUR', '2026001',
  '06/01/2026', desc, '06/01/2026', amount, '1000,00', '', '', acc, bic, name, '', '', ''].join(';'))

test('KBC (EN): "Name" is the account holder, "Counterparty name" the payee', () => {
  for (const heading of [true, false]) {
    const header = heading ? KBC_EN : KBC_EN.replace('Heading;', '')
    const r = kbcEn(header, kbcRows(heading))
    assertRecognised(r, 'kbc')
    assert.equal(r.detection.mapping.holder, 'Name')
    assert.equal(r.detection.mapping.counterparty, 'Counterparty name')
    // The transfer to the holder's own account is left out altogether.
    assert.deepEqual(r.booked.map(brief), [
      ['2026-01-06', 'expense', 800, 'EUR'],
      ['2026-01-06', 'income', 323360, 'EUR'],
    ])
    assert.equal(r.drafts.filter((d) => d.skip === 'own transfer').length, 1)
    // Card merchant; employer (merchant names, before the file's grouping).
    assert.deepEqual(r.booked.map((d) => d.merchant), ['LIDL', 'ACME CLINICAL RESEARCH'])
  }
})

test('Crelan: counterparty + message', () => {
  const r = fixture('crelan.csv')
  assertRecognised(r, 'crelan')
  assert.deepEqual(r.booked.map(brief), [
    ['2026-09-05', 'expense', 3500, 'EUR'],
    ['2026-09-04', 'expense', 740, 'EUR'],
    ['2026-09-02', 'income', 180000, 'EUR'],
  ])
  assert.match(r.booked[0].description, /^FLUVIUS · Voorschot energie/)
})

test('Alpha Bank (Windows-1253): preamble skipped, Χ/Π marker sets the kind', () => {
  const r = fixture('alpha.csv')
  assertRecognised(r, 'alpha')
  assert.equal(r.lines[0], 7) // below the title/date/balance lines, a blank one and the header
  assert.equal(r.detection.mapping.type, 'Πρόσημο ποσού')
  assert.deepEqual(r.booked.map(brief), [
    ['2026-09-13', 'expense', 4230, 'EUR'],
    ['2026-09-12', 'income', 135000, 'EUR'],
    ['2026-09-11', 'expense', 5897, 'EUR'], // dd.mm.yyyy too
  ])
  assert.equal(r.booked[0].description, 'ΑΓΟΡΑ ΣΚΛΑΒΕΝΙΤΗΣ ΑΘΗΝΑ')
  assert.equal(merchantKey(r.booked[0].description), 'ΣΚΛΑΒΕΝΙΤΗΣ')
})

test('Eurobank: d/m/yyyy without padding; account footer lines are left out', () => {
  const r = fixture('eurobank.csv')
  assertRecognised(r, 'eurobank')
  assert.deepEqual(r.booked.map(brief), [
    ['2026-09-01', 'expense', 22687, 'EUR'],
    ['2026-08-31', 'income', 22760, 'EUR'],
    ['2026-08-30', 'expense', 1840, 'EUR'],
  ])
  // The IBAN in the footer's amount column never becomes an amount.
  assert.deepEqual(r.drafts.slice(3), [{ skip: 'not a transaction' }, { skip: 'not a transaction' }])
})

test('Piraeus Bank (.xlsx): preamble, Greek headers, numeric cells, update-time footer', () => {
  const aoa = [
    ['Τράπεζα Πειραιώς'],
    ['Κινήσεις Λογαριασμών'],
    [],
    ['ΟΨΕΩΣ ΕΤΑΙΡΙΩΝ Κ:  GR00 0000 0000 0000 0000 0000 000'],
    ['Επιλεγμένη Περίοδος: 11/07/2026 - 24/07/2026'],
    [],
    ['Κατηγορία', 'Περιγραφή Συναλλαγής', 'Ημ/νία Συναλλαγής', 'Ημ/νία Αξίας',
      'Σχόλια / Κωδικός Αναφοράς', 'Ποσό', 'Νόμισμα', 'Προοδευτικό Λογιστικό Υπόλοιπο', 'Νόμισμα'],
    ['Χωρίς Κατηγορία', 'ΕΞΟΦΛΗΣΗ ΛΟΓΑΡΙΑΣΜΟΥ', '21/07/2026', '21/07/2026', 'IRIS Payment', -149.9, 'EUR', 3708.09, 'EUR'],
    ['Χωρίς Κατηγορία', 'ΠΡΟΜΗΘΕΙΑ ΕΜΒΑΣΜΑΤΟΣ', '21/07/2026', '21/07/2026', 'WINBREM00000', -2.9, 'EUR', 3857.99, 'EUR'],
    ['Χωρίς Κατηγορία', 'ΜΕΤΑΦΟΡΑ ΑΠΟ ΛΟΓ.ΤΡΙΤΟΥ', '13/07/2026', '13/07/2026', 'user test', 297.61, 'EUR', 3860.89, 'EUR'],
    [],
    ['Ημερομηνία Ενημέρωσης:', '24/07/2026 13:46:41'],
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Κινήσεις')
  const r = read(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
  assertRecognised(r, 'piraeus')
  assert.deepEqual(r.lines, [8, 9, 10, 12]) // file lines: blank rows are left out, not renumbered
  assert.equal(r.detection.mapping.currency, 'Νόμισμα')
  assert.deepEqual(r.booked.map(brief), [
    ['2026-07-21', 'expense', 14990, 'EUR'],
    ['2026-07-21', 'expense', 290, 'EUR'],
    ['2026-07-13', 'income', 29761, 'EUR'],
  ])
  assert.equal(r.booked[0].description, 'ΕΞΟΦΛΗΣΗ ΛΟΓΑΡΙΑΣΜΟΥ · IRIS Payment')
  assert.deepEqual(r.drafts.at(-1), { skip: 'not a transaction' })
})

test('Revolut: fees deducted, foreign currency kept, pending/declined/reverted left out', () => {
  const r = fixture('revolut.csv')
  assertRecognised(r, 'revolut')
  assert.deepEqual(r.booked.map(brief), [
    ['2026-09-01', 'expense', 450, 'EUR'],
    ['2026-09-03', 'expense', 1230, 'GBP'],
    ['2026-09-05', 'expense', 10150, 'EUR'], // −100.00 and a 1.50 fee
  ])
  assert.equal(r.drafts.filter((d) => d.skip === 'pending or declined').length, 3)
  // "Top-Up by *1234": the holder topping up from their own card.
  assert.deepEqual(r.drafts[1], { skip: 'own transfer' })
})

// Revolut's consolidated statement, anonymised, with the real export's shape:
// account summaries first, then a "Transaction statement" per account (euro,
// a dollar account with doubled money columns, a franc account whose Balance
// isn't doubled, a pocket), each closed by "Total", then savings-interest and
// crypto tables that aren't money movements. Lines padded to 16 columns.
const CONSOLIDATED = readFileSync(new URL('./fixtures/banks/revolut-consolidated.csv', import.meta.url))
const consolidated = (buf, holderName = '') => {
  const { headers, rows, lines } = parseSheet(XLSX, buf)
  const objs = rowsToObjects(headers, rows)
  const detection = detectMapping(headers, objs)
  const mapping = { ...detection.mapping, holderName }
  const signed = signedConvention(objs, mapping)
  const drafts = objs.map((r) => rowToDraft(r, mapping, 'EUR', { signed }))
  return { headers, objs, lines, detection, drafts, booked: drafts.filter((d) => !d.skip && !d.error) }
}

test('Revolut consolidated statement: every account table, nothing else', () => {
  const r = consolidated(CONSOLIDATED)
  assertRecognised(r, 'revolut-consolidated')
  assert.equal(r.detection.mapping.amount, 'Money in/out')
  assert.equal(r.detection.mapping.currency, 'Money in/out') // "-€4.40": the currency is in the cell
  assert.equal(r.detection.mapping.baseAmount, 'Money in/out (2)') // the euro column of other currencies
  assert.equal(r.detection.mapping.fee, undefined) // Money in/out already includes it
  assert.equal(r.detection.mapping.category, undefined) // Revolut's operation type, not a category
  assert.equal(r.detection.mapping.dateOrder, 'mdy')
  // 14 euro + 3 dollar + 1 franc + 3 pocket rows; titles, repeated headers,
  // Total rows, summaries, savings interest and crypto sales are left out.
  assert.equal(r.objs.length, 21)
  assert.deepEqual(r.lines.slice(0, 2), [31, 32])
  assert.deepEqual(r.objs.map((o) => o.Description).filter((d) => /Interest|BTC|Total/.test(d ?? '')), [])
  assert.deepEqual(r.drafts.filter((d) => d.error), [])
})

test('Revolut consolidated statement: amounts, currencies and the statement\'s own rates', () => {
  const r = consolidated(CONSOLIDATED)
  const booked = r.booked.map((d) => [...brief(d), d.rate, d.merchant])
  assert.deepEqual(booked, [
    ['2022-05-28', 'expense', 440, 'EUR', null, 'ALEX MORGAN'],
    ['2022-06-04', 'income', 900, 'EUR', null, 'SAM TAYLOR'],
    ['2022-06-04', 'expense', 799, 'EUR', null, 'METAL PLAN'],
    ['2022-06-06', 'expense', 232, 'EUR', null, 'JUST EAT TAKEAWAY'], // its €0.35 fee is inside the −€2.32
    ['2022-06-10', 'expense', 500, 'EUR', null, 'JANE DOE'], // to the holder: own only once the name is known
    ['2022-06-11', 'income', 123456, 'EUR', null, 'DOE JANE'],
    ['2022-06-12', 'income', 1200, 'EUR', null, 'TELCO'], // a "Deposit" from a company is real income
    ['2022-06-15', 'expense', 2200, 'EUR', null, 'CASH WITHDRAWAL'],
    ['2022-06-20', 'expense', 1000, 'USD', 0.92, 'CLOUD HOSTING'],
    ['2022-07-01', 'expense', 450, 'CHF', 1.02222222, 'CORNER BAKERY'],
    ['2022-06-16', 'expense', 300, 'EUR', null, 'SUNNY TRAVEL'], // a pocket paying a company
  ])
  // Top-up, pocket both ways (in the account and in the pocket), exchange
  // both ways (in both currencies), savings: own transfers.
  assert.equal(r.drafts.filter((d) => d.skip === 'own transfer').length, 10)
  assert.deepEqual(r.drafts.filter((d) => d.skip && d.skip !== 'own transfer'), [])
  // Merchant keys as the New merchants step shows them.
  const keys = groupMerchants(r.booked.map((d) => d.merchant))
  assert.equal(keys.get('JUST EAT TAKEAWAY'), 'JUST EAT')
  assert.equal(keys.get('ALEX MORGAN'), 'ALEX MORGAN')
})

test('Revolut consolidated statement: with the holder\'s name, transfers to and from them are own', () => {
  for (const name of ['Jane Doe', 'DOE JANE']) {
    const r = consolidated(CONSOLIDATED, name)
    assert.equal(r.drafts.filter((d) => d.skip === 'own transfer').length, 12)
    assert.deepEqual(r.booked.map((d) => d.merchant).filter((m) => /JANE/.test(m)), [])
  }
})

test('Revolut consolidated statement (.xlsx): title and header below a preamble, real dates, two sheets', () => {
  // As the owner's Excel export shows it: preamble rows, "Transaction
  // statement" in row 4, the header in row 5 — here with real Excel dates —
  // then a second sheet holding the dollar account.
  const eur = [
    ['Account statement'], ['Jane Doe'], [],
    ['Transaction statement'],
    ['Date', 'Description', 'Category', 'Money in/out', 'Balance', 'Tax withheld', 'Other taxes', 'Fees'],
    [new Date(2022, 4, 25), 'Apple Pay deposit by *1111', 'Deposit', '€4.40', '€4.40', '€0.00', '€0.00', '€0.00'],
    [new Date(2022, 4, 28), 'Transfer to ALEX MORGAN', 'Others', '-€4.40', '€0.00', '€0.00', '€0.00', '€0.00'],
    ['Jun 6, 2022', 'Just Eat Takeaway', 'Merchant', '€1,234.56', '€1,234.56', '€0.00', '€0.00', '€0.00'],
    ['Total', null, null, '€1,234.56'],
  ]
  const usd = [
    ['Personal Account (USD)'], ['Transaction statement'],
    ['Date', 'Description', 'Category', 'Money in/out', 'Money in/out', 'Balance', 'Balance',
      'Tax withheld', 'Tax withheld', 'Other taxes', 'Other taxes', 'Fees', 'Fees'],
    ['Jun 20, 2022', 'Cloud Hosting', 'Merchant', '-$10.00', '-€9.20', '$0.00', '€0.00'],
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(eur), 'EUR')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(usd), 'USD')
  const r = consolidated(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
  assertRecognised(r, 'revolut-consolidated')
  assert.deepEqual(r.lines, [6, 7, 8, 4])
  assert.deepEqual(r.drafts[0], { skip: 'own transfer' })
  assert.deepEqual(r.booked.map(brief), [
    ['2022-05-28', 'expense', 440, 'EUR'],
    ['2022-06-06', 'income', 123456, 'EUR'],
    ['2022-06-20', 'expense', 1000, 'USD'],
  ])
})

test('Revolut Business: Total amount (fees included) in the payment currency', () => {
  const r = fixture('revolut-business.csv')
  assertRecognised(r, 'revolut-business')
  assert.deepEqual(r.booked.map(brief), [
    ['2026-08-25', 'expense', 1048, 'EUR'],
    ['2026-08-23', 'expense', 3594, 'EUR'],
  ])
  assert.deepEqual(r.drafts[2], { skip: 'pending or declined' })
})

test('every preset has a unique id and resolves date + amount from its own signature', () => {
  assert.equal(new Set(PRESETS.map((p) => p.id)).size, PRESETS.length)
  for (const p of PRESETS) {
    // The first alias of each column, as a header row.
    const headers = [...new Set([...p.signature.map((g) => g[0]), ...Object.values(p.columns).map((a) => a[0])])]
    const hit = matchPreset(headers)
    assert.equal(hit?.preset.id, p.id, p.id)
    for (const alias of Object.values(p.columns).flat()) assert.equal(alias, normHeader(alias), alias)
  }
})

test('matchPreset: an unrelated header row matches nothing', () => {
  assert.equal(matchPreset(['Date', 'Description', 'Amount']), null)
})
