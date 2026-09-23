import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sniffContainer, decodeText, sniffDelimiter, parseDelimited } from '../src/features/import/statementText.js'

const utf8 = (s) => new TextEncoder().encode(s)
// Single-byte encodings, spelled out byte by byte (node has no encoder).
const cp1252 = (s) => Uint8Array.from([...s].map((ch) => ({ é: 0xe9, è: 0xe8, û: 0xfb, ë: 0xeb }[ch] ?? ch.charCodeAt(0))))
const cp1253 = (s) => Uint8Array.from([...s].map((ch) => {
  const c = ch.charCodeAt(0)
  if (c >= 0x391 && c <= 0x3ce) return c - 0x391 + 0xc1 // Greek block maps linearly
  return c
}))

test('decodeText: BOMs, strict UTF-8, then Windows-1252 or Greek Windows-1253', () => {
  assert.deepEqual(decodeText(Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8('Date;Montant')])),
    { text: 'Date;Montant', encoding: 'utf-8-bom' })
  assert.equal(decodeText(Uint8Array.from([0xff, 0xfe, 0x41, 0, 0x3b, 0])).text, 'A;')
  assert.deepEqual(decodeText(utf8('Ημερομηνία;Ποσό')), { text: 'Ημερομηνία;Ποσό', encoding: 'utf-8' })
  assert.deepEqual(decodeText(cp1252("Date d'exécution;Détails")),
    { text: "Date d'exécution;Détails", encoding: 'windows-1252' })
  const greek = decodeText(cp1253('Ημερομηνία;Αιτιολογία;Ποσό'))
  assert.equal(greek.encoding, 'windows-1253')
  assert.equal(greek.text, 'Ημερομηνία;Αιτιολογία;Ποσό')
})

test('sniffContainer: zip, OLE, HTML-as-xls and text', () => {
  assert.equal(sniffContainer(Uint8Array.from([0x50, 0x4b, 3, 4, 0])), 'zip')
  assert.equal(sniffContainer(Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0])), 'ole')
  assert.equal(sniffContainer(utf8('  <html><table><tr><td>1</td></tr></table>')), 'html')
  assert.equal(sniffContainer(utf8('Date,Amount\n')), 'text')
})

test('sniffDelimiter: consistent counts beat decimal commas and preamble lines', () => {
  assert.equal(sniffDelimiter('Date;Bedrag;Omschrijving\n01/09/2026;-12,50;A, B\n02/09/2026;3,00;C\n'), ';')
  assert.equal(sniffDelimiter('Date,Amount,Description\n2026-09-01,-12.50,"A; B"\n2026-09-02,3,C\n'), ',')
  assert.equal(sniffDelimiter('Date\tAmount\tText\n1\t2\t3\n'), '\t')
  assert.equal(sniffDelimiter('Account: BE00, J. Doe\nPeriod: 1/9 - 30/9\nDate;Amount;Text\n1;2;3\n4;5;6\n'), ';')
  assert.equal(sniffDelimiter('sep=|\nA|B\n'), '|')
})

test('parseDelimited: quotes, escaped quotes, embedded newlines, CRLF, blank lines', () => {
  const text = 'Date;Text;Amount\r\n01/09/2026;"Say ""hi""; now";-1,00\r\n\r\n02/09/2026;"two\nlines";2\n'
  assert.deepEqual(parseDelimited(text), [
    ['Date', 'Text', 'Amount'],
    ['01/09/2026', 'Say "hi"; now', '-1,00'],
    ['02/09/2026', 'two\nlines', '2'],
  ])
  assert.deepEqual(parseDelimited('sep=;\nA;B\n1;2'), [['A', 'B'], ['1', '2']])
  assert.deepEqual(parseDelimited('A,B,\n1,,3'), [['A', 'B', ''], ['1', '', '3']])
})
