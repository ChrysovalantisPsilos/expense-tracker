import { test } from 'node:test'
import assert from 'node:assert/strict'
import { merchantKey, rowMerchant, isOwnTransfer, rowToDraft, previewDrafts, parseAmount, parseDate, deterministicUuid } from '../src/features/import/importMath.js'

test('merchantKey: strips bank noise, numbers, dates, branches', () => {
  assert.equal(merchantKey('BANCONTACT LIDL 1234 BRUXELLES 19/07'), 'LIDL')
  assert.equal(merchantKey('LIDL 992 GENT'), 'LIDL')
  assert.equal(merchantKey('Netflix.com 12.99'), 'NETFLIX')
  assert.equal(merchantKey('CARD PAYMENT TO IKEA'), 'IKEA')
  assert.equal(merchantKey('ΣΟΥΠΕΡΜΑΡΚΕΤ ΑΛΦΑ 55'), 'ΣΟΥΠΕΡΜΑΡΚΕΤ')
})

test('merchantKey: Belgian card and app payment prefixes are noise', () => {
  assert.equal(merchantKey('MAESTRO LIDL 1234 BRUXELLES'), 'LIDL')
  assert.equal(merchantKey('PAYCONIQ BY BANCONTACT DELHAIZE 5678 GENT'), 'DELHAIZE')
  assert.equal(merchantKey('BETALING MET BANCONTACT COLRUYT 0412 ANTWERPEN'), 'COLRUYT')
})

// KBC description lines. EN card shapes are from a real English export, NL
// ones from public real KBC CSVs; FR wording is inferred from the other two.
// Names, card numbers and IBANs are made up.
const key = (description, opts) => {
  const k = merchantKey(description, opts)
  // A key becomes a "description contains …" rule: it must be in the text.
  assert.ok(description.toUpperCase().includes(k), `${k} not in ${description}`)
  return k
}

test('merchantKey (KBC EN): the card merchant sits between the time stamp and the postcode', () => {
  assert.equal(key('PAYMENT VIA DEBIT MASTERCARD 29-12-2025 AT 22.01 TIME MCDONALD S W.SALONICA GR54627 THESSALONIKI WITH APPLE PAY 5127 88XX XXXX 1234 VIRTUAL CARD NUMBER FOR CONTACTLESS: 5315 88XX XXXX 5678'), 'MCDONALD')
  assert.equal(key('PAYMENT VIA DEBIT MASTERCARD 06-01-2026 AT 21.34 TIME CASA VERDE ESTIASI C GR57002 LAGKADAS WITH APPLE PAY 5127 88XX XXXX 1234'), 'CASA VERDE')
  assert.equal(key('PAYMENT VIA BANCONTACT 06-01-2026 AT 10.54 TIME LIDL 1153 LEUVEN BE3000 LEUVEN WITH KBC DEBIT CARD 5127 88XX XXXX 1234 CARDHOLDER: DOE JANE'), 'LIDL')
  assert.equal(key('CASH WITHDRAWAL 18-01-2026 AT 14.02 TIME KBC LEUVEN BE3000 LEUVEN WITH KBC DEBIT CARD 5127 88XX XXXX 1234'), 'CASH WITHDRAWAL')
})

test('merchantKey (KBC NL): Bancontact, Debit Mastercard and Maestro card lines', () => {
  const nl = (m, place) => `BETALING VIA BANCONTACT              31-12 31-12-2025 OM 13.55 UUR ${m} ${place} MET KBC-DEBETKAART 4972 55XX XXXX 3390 KAARTHOUDER: JANSSENS ELS`
  assert.equal(key(nl('DELHAIZE WATERSPORT NV', 'BE9000 GENT')), 'DELHAIZE')
  assert.equal(key(nl('7075 CRU GENT', 'BE9000 GENT')), 'CRU')
  assert.equal(key(nl('ST. PIERRE', 'BE9000 GENT')), 'ST. PIERRE')
  assert.equal(key(nl('BV XANTYP', 'BE9000 GENT') + ' INFO VAN DE HANDELAAR: GPVV9PQ BY MULTISAFEPAY'), 'XANTYP')
  assert.equal(key('BETALING VIA DEBIT MASTERCARD        31-12 30-12-2025 OM 12.08 UUR CAFE CHARLATAN BE9000 GENT MET KBC-DEBETKAART 4972 55XX XXXX 3390 KAARTHOUDER: JANSSENS ELS'), 'CAFE')
  assert.equal(key('BETALING VIA MAESTRO 02-10-2023 OM 08.23 UUR STAD GENT PARKEREN BE GENT MET KBC-DEBETKAART 6703 42XX XXXX X201 0 KAARTHOUDER: JANSSENS ELS'), 'STAD GENT')
  assert.equal(key('BETALING VIA BANCONTACT 04-12-2025 OM 15.30 UUR AMZN MKTP BE LU1855 LUXEMBOURG MET KBC-DEBETKAART 4972 55XX XXXX 3390 KAARTHOUDER: JANSSENS ELS INFO VAN DE HANDELAAR: 75HL93I WWW.AMAZON.COM.BE'), 'AMZN')
})

test('merchantKey (KBC FR): paiement par carte', () => {
  assert.equal(key('PAIEMENT VIA BANCONTACT 06-01-2026 À 10.54 HEURES COLRUYT LOUVAIN BE3000 LEUVEN AVEC CARTE DE DEBIT KBC 5127 88XX XXXX 1234 TITULAIRE DE LA CARTE: DOE JANE'), 'COLRUYT')
  assert.equal(key('PAIEMENT VIA DEBIT MASTERCARD 06-01-2026 A 19.02 HEURES LE PAIN QUOTIDIEN BE1000 BRUXELLES AVEC APPLE PAY'), 'LE PAIN')
})

test('merchantKey (KBC): direct debits key on the creditor', () => {
  assert.equal(key('EUROPESE DOMICILIERING SCHULDEISER : KBC VERZEKERINGEN REF. SCHULDEISER: 390666825141 MANDAATREFERTE : L00223506492V0001 EIGEN OMSCHR. : GEZINSPOLIS'), 'KBC VERZEKERINGEN')
  assert.equal(key('EUROPEAN DIRECT DEBIT CREDITOR : PROXIMUS CREDITOR REF.: 123456 MANDATE REFERENCE : 9988'), 'PROXIMUS')
  assert.equal(key('DOMICILIATION EUROPEENNE CREANCIER : ENGIE ELECTRABEL REF. CREANCIER : 998877'), 'ENGIE')
})

test('merchantKey (KBC): transfers key on the other party, never on the boilerplate', () => {
  assert.equal(key('INSTANTOVERSCHRIJVING NAAR           27-12 BE00 0000 0000 0001 BANKIER BEGUNSTIGDE: KREDBEBBXXX PIETERS TOM OM 17.11 UUR MET KBC MOBILE'), 'PIETERS')
  assert.equal(key('OVERSCHRIJVING VAN                   22-12 BE00 0000 0000 0002 BANKIER OPDRACHTGEVER: BBRUBEBB UNIVERSITEIT GENT /FOR/-/A/ 20051664/202512 REFERENTIE: 1664000010'), 'UNIVERSITEIT')
  assert.equal(key('EUROPESE OVERSCHRIJVING VAN          04-01'), 'EUROPESE OVERSCHRIJVING') // nothing else to go on
  assert.equal(key("SENDING MONEY INSTANTLY TO BE00 0000 0000 0003 BENEFICIARY'S BANK: GEBABEBBXXX KUMAR RAVI DINNER AT 20.15 WITH KBC MOBILE"), 'KUMAR')
  assert.equal(key('VIREMENT EUROPEEN VERS BE00 0000 0000 0004 BANQUE DU BENEFICIAIRE: KREDBEBB IMMO PEETERS LOYER'), 'IMMO')
})

test('merchantKey: the account holder is never the key; transfers to them have none', () => {
  const holder = 'DOE JANE'
  assert.equal(merchantKey("SENDING MONEY INSTANTLY TO BE00 0000 0000 0005 BENEFICIARY'S BANK: REVOBEB2XXX JANE DOE AT 17.05 WITH KBC MOBILE", { holder }), '')
  assert.equal(merchantKey('INSTANTOVERSCHRIJVING VAN BE00 0000 0000 0006 BANKIER OPDRACHTGEVER: KREDBEBBXXX DOE JANE SPAARGELD OM 00.24 UUR', { holder }), '')
  assert.equal(merchantKey('DOE J.', { holder }), '')
  // A relative sharing the surname is someone else.
  assert.equal(merchantKey('INSTANTOVERSCHRIJVING VAN BE00 0000 0000 0007 BANKIER OPDRACHTGEVER: KREDBEBBXXX DOE MARK VERJAARDAG OM 10.00 UUR', { holder }), 'MARK')
})

test('merchantKey (KBC): bank-generated lines key on their own operation', () => {
  assert.equal(key('BIJDRAGE 01-02-2018 - 28-02-2018 28-02 KBC-PLUSREKENING'), 'KBC-PLUSREKENING')
  assert.equal(key('SETTLEMENT KBC CREDIT CARD 5127 88XX XXXX 9999'), 'SETTLEMENT KBC')
  assert.equal(key('DEPOSIT OF CASH 19-01-2026 KBC LEUVEN'), 'DEPOSIT OF CASH')
  assert.equal(key('STORTING CONTANTEN 19-01-2026 KBC LEUVEN'), 'STORTING')
})

test('rowMerchant: counterparty first, the holder column marks own transfers', () => {
  const mapping = { counterparty: 'Counterparty name', holder: 'Name', description: 'Description', details: 'Free-format reference' }
  const row = (cp, description, free = '') => ({ Name: 'DOE JANE', 'Counterparty name': cp, Description: description, 'Free-format reference': free })
  // Salary: the employer, not "EUROPEAN".
  assert.equal(rowMerchant(row('ACME CLINICAL RESEARCH BV', 'EUROPEAN TRANSFER FROM BE00 0000 0000 0008', 'SALARY JANUARY'), mapping), 'ACME')
  // Own account, either word order.
  assert.equal(rowMerchant(row('JANE DOE', "SENDING MONEY INSTANTLY TO BE00 0000 0000 0005 BENEFICIARY'S BANK: REVOBEB2XXX JANE DOE AT 17.05 WITH KBC MOBILE"), mapping), '')
  assert.equal(rowMerchant(row('Doe Jane', 'RECEIVING MONEY INSTANTLY FROM BE00 0000 0000 0005'), mapping), '')
  // Card rows leave the counterparty empty: the description decides.
  assert.equal(rowMerchant(row('', 'PAYMENT VIA BANCONTACT 06-01-2026 AT 10.54 TIME LIDL 1153 LEUVEN BE3000 LEUVEN WITH KBC DEBIT CARD 5127 88XX XXXX 1234 CARDHOLDER: DOE JANE'), mapping), 'LIDL')
  // Without a holder column a person's counterparty is still a key.
  assert.equal(rowMerchant({ cp: 'KUMAR RAVI', d: 'x' }, { counterparty: 'cp', description: 'd' }), 'KUMAR')
})

test('merchantKey: empty inputs', () => {
  assert.equal(merchantKey(''), '')
  assert.equal(merchantKey(null), '')
  assert.equal(merchantKey('12/07/2026 99.50'), '')
})

test('parseAmount: plain, comma-decimal, mixed separators, junk', () => {
  assert.equal(parseAmount('12.34'), 12.34)
  assert.equal(parseAmount('12,34'), 12.34)
  assert.equal(parseAmount('1,234.56'), 1234.56)
  assert.equal(parseAmount('-45.00'), -45)
  assert.equal(parseAmount(7), 7)
  assert.ok(Number.isNaN(parseAmount('')))
  assert.ok(Number.isNaN(parseAmount(null)))
})

test('parseDate: Date objects keep the local day', () => {
  assert.equal(parseDate(new Date(2026, 6, 21)), '2026-07-21')
})

test('parseDate: strings and invalids', () => {
  assert.equal(parseDate('2026-07-21'), '2026-07-21')
  assert.equal(parseDate('2026-07-21T00:30:00'), '2026-07-21')
  assert.equal(parseDate('2026-02-30'), null)
  assert.equal(parseDate(''), null)
  assert.equal(parseDate('not a date'), null)
})

test('parseDate: the calendar day never shifts with the timezone', () => {
  // new Date('2026-09-01') is UTC midnight = 31 Aug west of UTC; toISOString
  // of a local midnight is the previous day east of UTC. Both must be 1 Sep.
  assert.equal(parseDate('2026-09-01'), '2026-09-01')
  assert.equal(parseDate('09/01/2026', 'mdy'), '2026-09-01') // US-style text → local day
  assert.equal(parseDate('01/09/2026'), '2026-09-01') // day-first by default
  assert.equal(parseDate(new Date(2026, 8, 1, 0, 0)), '2026-09-01')
  assert.equal(parseDate(new Date(2026, 8, 30, 23, 59)), '2026-09-30')
})

test('deterministicUuid: stable, distinct, uuid-shaped', async () => {
  const a1 = await deterministicUuid(['import', 'u1', 'k', 0])
  const a2 = await deterministicUuid(['import', 'u1', 'k', 0])
  const b = await deterministicUuid(['import', 'u1', 'k', 1])
  assert.equal(a1, a2)
  assert.notEqual(a1, b)
  assert.match(a1, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})

test('isOwnTransfer: transfers between the holder\'s own accounts are left out of the import', () => {
  const mapping = {
    date: 'Date', amount: 'Amount', counterparty: 'Counterparty name', holder: 'Name',
    description: 'Description', details: 'Free-format reference',
  }
  const row = (cp, description, amount = '-100,00') => ({
    Name: 'DOE JANE', Date: '06/01/2026', Amount: amount, 'Counterparty name': cp, Description: description,
  })
  const own = row('JANE DOE', "SENDING MONEY INSTANTLY TO BE00 0000 0000 0005 BENEFICIARY'S BANK: REVOBEB2XXX JANE DOE AT 17.05 WITH KBC MOBILE")
  const back = row('Doe Jane', 'RECEIVING MONEY INSTANTLY FROM BE00 0000 0000 0005', '50,00')
  const card = row('', 'PAYMENT VIA BANCONTACT 06-01-2026 AT 10.54 TIME LIDL 1153 LEUVEN BE3000 LEUVEN WITH KBC DEBIT CARD 5127 88XX XXXX 1234 CARDHOLDER: DOE JANE', '-12,78')
  const relative = row('DOE MARK', 'EUROPEAN TRANSFER TO BE00 0000 0000 0009')
  assert.equal(isOwnTransfer(own, mapping), true)
  assert.equal(isOwnTransfer(back, mapping), true)
  assert.equal(isOwnTransfer(card, mapping), false) // the holder only as cardholder
  assert.equal(isOwnTransfer(relative, mapping), false) // same surname, someone else
  // No counterparty column: the party named in the description decides.
  const noCp = { date: 'Date', amount: 'Amount', holder: 'Name', description: 'Description' }
  assert.equal(isOwnTransfer({ ...own, 'Counterparty name': '' }, noCp), true)
  // Without a holder column nothing counts as own.
  assert.equal(isOwnTransfer(own, { ...mapping, holder: undefined }), false)

  assert.deepEqual(rowToDraft(own, mapping, 'EUR'), { skip: 'own transfer' })
  const preview = previewDrafts([own, back, card, relative], mapping, 'EUR')
  assert.equal(preview.ownTransfers, 2)
  assert.equal(preview.skipped, 0)
  assert.equal(preview.ready, 2)
})
