import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  merchantKey, merchantName, groupMerchants, rowMerchantName, isOwnTransfer, rowToDraft, previewDrafts, parseAmount,
  parseDate, deterministicUuid, normalizeCurrency, cleanHolderName, suggestedHolder, fileHolder,
  merchantGroups, groupIdOf, ruleCategory, descriptionParts, dropKnownRows, categoryMatcher,
} from '../src/features/import/importMath.js'
import { displayDescription, kbcLabel, titleCase } from '../src/features/import/kbcLabels.js'

// A key becomes a "description contains …" rule: it must be in the text.
const key = (description, opts) => {
  const k = merchantKey(description, opts)
  assert.ok(description.toUpperCase().includes(k), `${k} not in ${description}`)
  return k
}
// The keys a file's descriptions get on the "New merchants" step (one per
// description, in order), each checked to be inside its own description.
const fileKeys = (descriptions, opts) => {
  const names = descriptions.map((d) => merchantName(d, opts))
  const keys = groupMerchants(names)
  return descriptions.map((d, i) => {
    const k = names[i] ? keys.get(names[i]) : ''
    assert.ok(d.toUpperCase().includes(k), `${k} not in ${d}`)
    return k
  })
}

test('merchantKey: strips bank noise, numbers, dates, branches', () => {
  assert.equal(key('BANCONTACT LIDL 1234 BRUXELLES 19/07'), 'LIDL')
  assert.equal(key('LIDL 992 GENT'), 'LIDL')
  assert.equal(key('Netflix.com 12.99'), 'NETFLIX')
  assert.equal(key('CARD PAYMENT TO IKEA'), 'IKEA')
  assert.equal(key('ΣΟΥΠΕΡΜΑΡΚΕΤ ΑΛΦΑ 55'), 'ΣΟΥΠΕΡΜΑΡΚΕΤ ΑΛΦΑ')
  // A town right after the name is a branch, not part of the name.
  assert.equal(key('DELHAIZE LEUVEN 14/09 12:31 Kaart 1234'), 'DELHAIZE')
  assert.equal(key('ΑΓΟΡΑ ΣΚΛΑΒΕΝΙΤΗΣ ΑΘΗΝΑ'), 'ΣΚΛΑΒΕΝΙΤΗΣ')
})

test('merchantKey: Belgian card and app payment prefixes are noise', () => {
  assert.equal(key('MAESTRO LIDL 1234 BRUXELLES'), 'LIDL')
  assert.equal(key('PAYCONIQ BY BANCONTACT DELHAIZE 5678 GENT'), 'DELHAIZE')
  assert.equal(key('BETALING MET BANCONTACT COLRUYT 0412 ANTWERPEN'), 'COLRUYT')
})

// KBC description lines. EN card shapes are from a real English export, NL
// ones from public real KBC CSVs; FR wording is inferred from the other two.
// Names, card numbers and IBANs are made up.
const en = (m, place, who = 'DOE JANE') => `PAYMENT VIA DEBIT MASTERCARD 06-01-2026 AT 10.54 TIME ${m} ${place} WITH KBC DEBIT CARD 5127 88XX XXXX 1234 CARDHOLDER: ${who}`
const nl = (m, place, who = 'JANSSENS ELS') => `BETALING VIA BANCONTACT              31-12 31-12-2025 OM 13.55 UUR ${m} ${place} MET KBC-DEBETKAART 4972 55XX XXXX 3390 KAARTHOUDER: ${who}`
const fr = (m, place, who = 'DOE JANE') => `PAIEMENT VIA BANCONTACT 06-01-2026 À 10.54 HEURES ${m} ${place} AVEC CARTE DE DEBIT KBC 5127 88XX XXXX 1234 TITULAIRE DE LA CARTE: ${who}`

test('merchantKey (KBC EN): the card merchant sits between the time stamp and the postcode', () => {
  assert.equal(key('PAYMENT VIA DEBIT MASTERCARD 29-12-2025 AT 22.01 TIME MCDONALD S W.SALONICA GR54627 THESSALONIKI WITH APPLE PAY 5127 88XX XXXX 1234 VIRTUAL CARD NUMBER FOR CONTACTLESS: 5315 88XX XXXX 5678'), 'MCDONALD')
  assert.equal(key('PAYMENT VIA DEBIT MASTERCARD 06-01-2026 AT 21.34 TIME CASA VERDE ESTIASI C GR57002 LAGKADAS WITH APPLE PAY 5127 88XX XXXX 1234'), 'CASA VERDE')
  assert.equal(key('PAYMENT VIA BANCONTACT 06-01-2026 AT 10.54 TIME LIDL 1153 LEUVEN BE3000 LEUVEN WITH KBC DEBIT CARD 5127 88XX XXXX 1234 CARDHOLDER: DOE JANE'), 'LIDL')
  assert.equal(key('CASH WITHDRAWAL 18-01-2026 AT 14.02 TIME KBC LEUVEN BE3000 LEUVEN WITH KBC DEBIT CARD 5127 88XX XXXX 1234'), 'CASH WITHDRAWAL')
  assert.equal(key(en('ALBERT HEIJN 1234', 'NL1012 AMSTERDAM')), 'ALBERT HEIJN')
})

test('merchantKey (KBC NL): Bancontact, Debit Mastercard and Maestro card lines', () => {
  assert.equal(key(nl('DELHAIZE WATERSPORT NV', 'BE9000 GENT')), 'DELHAIZE WATERSPORT')
  assert.equal(key(nl('DELHAIZE GENT STER', 'BE9000 GENT')), 'DELHAIZE') // the card's town ends the name
  assert.equal(key(nl('7075 CRU GENT', 'BE9000 GENT')), 'CRU')
  assert.equal(key(nl('ST. PIERRE', 'BE9000 GENT')), 'ST. PIERRE')
  assert.equal(key(nl('BV XANTYP', 'BE9000 GENT') + ' INFO VAN DE HANDELAAR: GPVV9PQ BY MULTISAFEPAY'), 'XANTYP')
  assert.equal(key('BETALING VIA DEBIT MASTERCARD        31-12 30-12-2025 OM 12.08 UUR CAFE CHARLATAN BE9000 GENT MET KBC-DEBETKAART 4972 55XX XXXX 3390 KAARTHOUDER: JANSSENS ELS'), 'CAFE CHARLATAN')
  assert.equal(key('BETALING VIA MAESTRO 02-10-2023 OM 08.23 UUR STAD GENT PARKEREN BE GENT MET KBC-DEBETKAART 6703 42XX XXXX X201 0 KAARTHOUDER: JANSSENS ELS'), 'STAD GENT')
  assert.equal(key('BETALING VIA BANCONTACT 04-12-2025 OM 15.30 UUR AMZN MKTP BE LU1855 LUXEMBOURG MET KBC-DEBETKAART 4972 55XX XXXX 3390 KAARTHOUDER: JANSSENS ELS INFO VAN DE HANDELAAR: 75HL93I WWW.AMAZON.COM.BE'), 'AMZN MKTP')
})

test('merchantKey (KBC FR): paiement par carte', () => {
  assert.equal(key(fr('COLRUYT LOUVAIN', 'BE3000 LEUVEN')), 'COLRUYT')
  assert.equal(key('PAIEMENT VIA DEBIT MASTERCARD 06-01-2026 A 19.02 HEURES LE PAIN QUOTIDIEN BE1000 BRUXELLES AVEC APPLE PAY'), 'LE PAIN')
  assert.equal(key(fr('SUMUP *BOULANGERIE DUPONT', 'BE5000 NAMUR')), 'BOULANGERIE DUPONT')
})

test('merchantKey (KBC): direct debits key on the creditor', () => {
  assert.equal(key('EUROPESE DOMICILIERING SCHULDEISER : KBC VERZEKERINGEN REF. SCHULDEISER: 390666825141 MANDAATREFERTE : L00223506492V0001 EIGEN OMSCHR. : GEZINSPOLIS'), 'KBC VERZEKERINGEN')
  assert.equal(key('EUROPEAN DIRECT DEBIT CREDITOR : PROXIMUS CREDITOR REF.: 123456 MANDATE REFERENCE : 9988'), 'PROXIMUS')
  assert.equal(key('DOMICILIATION EUROPEENNE CREANCIER : ENGIE ELECTRABEL REF. CREANCIER : 998877'), 'ENGIE ELECTRABEL')
})

test('merchantKey (KBC): transfers key on the other party, never on the boilerplate', () => {
  assert.equal(key('INSTANTOVERSCHRIJVING NAAR           27-12 BE00 0000 0000 0001 BANKIER BEGUNSTIGDE: KREDBEBBXXX PIETERS TOM OM 17.11 UUR MET KBC MOBILE'), 'PIETERS TOM')
  assert.equal(key('OVERSCHRIJVING VAN                   22-12 BE00 0000 0000 0002 BANKIER OPDRACHTGEVER: BBRUBEBB UNIVERSITEIT GENT /FOR/-/A/ 20051664/202512 REFERENTIE: 1664000010'), 'UNIVERSITEIT')
  assert.equal(key('EUROPESE OVERSCHRIJVING VAN          04-01'), 'EUROPESE OVERSCHRIJVING') // nothing else to go on
  assert.equal(key("SENDING MONEY INSTANTLY TO BE00 0000 0000 0003 BENEFICIARY'S BANK: GEBABEBBXXX KUMAR RAVI DINNER AT 20.15 WITH KBC MOBILE"), 'KUMAR RAVI')
  assert.equal(key('VIREMENT EUROPEEN VERS BE00 0000 0000 0004 BANQUE DU BENEFICIAIRE: KREDBEBB IMMO PEETERS LOYER'), 'IMMO PEETERS')
})

test('merchantKey: the account holder is never the key; transfers to them have none', () => {
  const holder = 'DOE JANE'
  assert.equal(merchantKey("SENDING MONEY INSTANTLY TO BE00 0000 0000 0005 BENEFICIARY'S BANK: REVOBEB2XXX JANE DOE AT 17.05 WITH KBC MOBILE", { holder }), '')
  assert.equal(merchantKey('INSTANTOVERSCHRIJVING VAN BE00 0000 0000 0006 BANKIER OPDRACHTGEVER: KREDBEBBXXX DOE JANE SPAARGELD OM 00.24 UUR', { holder }), '')
  assert.equal(merchantKey('DOE J.', { holder }), '')
  // A relative sharing the surname is someone else, named in full.
  assert.equal(key('INSTANTOVERSCHRIJVING VAN BE00 0000 0000 0007 BANKIER OPDRACHTGEVER: KREDBEBBXXX DOE MARK VERJAARDAG OM 10.00 UUR', { holder }), 'DOE MARK')
})

test('merchantKey (KBC): bank-generated lines key on their own operation', () => {
  assert.equal(key('BIJDRAGE 01-02-2018 - 28-02-2018 28-02 KBC-PLUSREKENING'), 'KBC-PLUSREKENING')
  assert.equal(key('SETTLEMENT KBC CREDIT CARD 5127 88XX XXXX 9999'), 'SETTLEMENT KBC')
  assert.equal(key('DEPOSIT OF CASH 19-01-2026 KBC LEUVEN'), 'DEPOSIT OF CASH')
  assert.equal(key('STORTING CONTANTEN 19-01-2026 KBC LEUVEN'), 'STORTING')
})

test('merchantKey: a payment processor\'s prefix is skipped — the shop follows it', () => {
  for (const d of ['CM*KANELA', 'CM* KANELA', 'CM *KANELA', 'SQ *KANELA', 'SQ* KANELA', 'SUMUP *KANELA',
    'SUMUP  *KANELA', 'SUMUP*KANELA', 'IZ *KANELA', 'ZETTLE_*KANELA', 'PAYPAL *KANELA', 'PP*KANELA',
    'SP * KANELA', 'TST* KANELA', 'MOLLIE*KANELA', 'CCV*KANELA', 'MYPOS*KANELA', 'VIVA*KANELA', 'KANELA']) {
    assert.equal(key(d), 'KANELA', d)
    assert.equal(key(en(d, 'GR54625 THESSALONIKI')), 'KANELA', d)
  }
  assert.equal(key('PAYPAL *SPOTIFY 35314369001'), 'SPOTIFY')
  assert.equal(key('GOOGLE *YOUTUBE PREMIUM'), 'YOUTUBE PREMIUM')
  assert.equal(key(nl('SQ *COFFEE LAB', 'NL1012 AMSTERDAM')), 'COFFEE LAB')
  // A merchant whose own name merely ends in a processor's letters is untouched.
  assert.equal(key('BISQ *REF123'), 'BISQ')
})

test('merchantKey: after the merchant, "*" starts a reference that is dropped', () => {
  assert.equal(key('AMZN MKTP DE*AB12CD'), 'AMZN MKTP')
  assert.equal(key('AMZN Mktp DE*2K4HX0XY5'), 'AMZN MKTP')
  assert.equal(key('NETFLIX.COM*123'), 'NETFLIX')
  assert.equal(key('AMAZON.COM*RT4Y12 AMZN.COM/BILL'), 'AMAZON')
  assert.equal(key('UBER *TRIP HELP.UBER.COM'), 'UBER')
  assert.equal(key(en('AMZN MKTP DE*AB12CD', 'LU1855 LUXEMBOURG')), 'AMZN MKTP')
})

test('groupMerchants: one key per merchant across a file\'s branches, always inside each description', () => {
  // The owner's case: the same café with and without the CM.com prefix.
  assert.deepEqual(fileKeys([en('KANELA', 'GR54625 THESSALONIKI'), en('CM* KANELA', 'GR54625 THESSALONIKI'),
    en('CM*KANELA', 'GR54625 THESSALONIKI'), 'SQ *KANELA', 'SUMUP  *KANELA']), Array(5).fill('KANELA'))
  // Multi-word names keep every shared word...
  assert.deepEqual(fileKeys([en('ALBERT HEIJN AMSTERDAM', 'NL1012 AMSTERDAM'), en('ALBERT HEIJN UTRECHT', 'NL3511 UTRECHT'),
    en('ALBERT HEIJN 1432', 'NL2011 HAARLEM')]), Array(3).fill('ALBERT HEIJN'))
  // ...branches never split a merchant, in any of the three languages...
  assert.deepEqual(fileKeys([en('LIDL LEUVEN', 'BE3000 LEUVEN'), en('LIDL GENT', 'BE9000 GENT'),
    nl('LIDL 0412 ANTWERPEN', 'BE2000 ANTWERPEN'), fr('LIDL NAMUR', 'BE5000 NAMUR'), 'LIDL KESSEL-LO']), Array(5).fill('LIDL'))
  assert.deepEqual(fileKeys([en('MCDONALD S W.SALONICA', 'GR54627 THESSALONIKI'), en('MCDONALD S KALAMARIA', 'GR55132 KALAMARIA'),
    en('MCDONALD S TSIMISKI', 'GR54624 THESSALONIKI')]), Array(3).fill('MCDONALD'))
  // ...and names that differ after a broad first word stay apart.
  assert.deepEqual(fileKeys([en('CASA VERDE ESTIASI C', 'GR57002 LAGKADAS'), en('CASA VERDE ESTIASI C', 'GR57002 LAGKADAS'),
    en('CASA BLANCA', 'GR54625 THESSALONIKI')]), ['CASA VERDE', 'CASA VERDE', 'CASA BLANCA'])
  assert.deepEqual(fileKeys(['EUROPEAN DIRECT DEBIT CREDITOR : KBC INSURANCE CREDITOR REF.: 1',
    'EUROPEAN DIRECT DEBIT CREDITOR : KBC VERZEKERINGEN REF.: 2']), ['KBC INSURANCE', 'KBC VERZEKERINGEN'])
  // Merchant*reference lines group on the merchant.
  assert.deepEqual(fileKeys(['AMZN MKTP DE*AB12CD', 'AMZN MKTP DE*ZX98YU', en('AMZN MKTP BE', 'LU1855 LUXEMBOURG')]),
    Array(3).fill('AMZN MKTP'))
  // Bank labels are their own keys: withdrawals and deposits stay apart.
  assert.deepEqual(fileKeys(['CASH WITHDRAWAL 18-01-2026 KBC', 'CASH DEPOSIT 19-01-2026 KBC', 'SETTLEMENT KBC CREDIT CARD 5127']),
    ['CASH WITHDRAWAL', 'CASH DEPOSIT', 'SETTLEMENT KBC'])
})

test('groupMerchants: a lone name keeps at most two words', () => {
  const keys = groupMerchants(['ALBERT HEIJN AMSTERDAM', 'JUMBO SUPERMARKTEN ZUID', 'MCDONALD S W.SALONICA', 'LE PAIN QUOTIDIEN',
    'CASA VERDE ESTIASI', 'KBC INSURANCE', 'ST. PIERRE', 'NETFLIX', ''])
  assert.deepEqual(Object.fromEntries(keys), {
    'ALBERT HEIJN AMSTERDAM': 'ALBERT HEIJN', 'JUMBO SUPERMARKTEN ZUID': 'JUMBO SUPERMARKTEN',
    'MCDONALD S W.SALONICA': 'MCDONALD', 'LE PAIN QUOTIDIEN': 'LE PAIN', 'CASA VERDE ESTIASI': 'CASA VERDE',
    'KBC INSURANCE': 'KBC INSURANCE', 'ST. PIERRE': 'ST. PIERRE', NETFLIX: 'NETFLIX',
  })
  // The same name on many rows is still one name.
  assert.deepEqual(Object.fromEntries(groupMerchants(['ALBERT HEIJN AMSTERDAM', 'ALBERT HEIJN AMSTERDAM'])),
    { 'ALBERT HEIJN AMSTERDAM': 'ALBERT HEIJN' })
  // A shorter name in the group bounds the key.
  assert.deepEqual(Object.fromEntries(groupMerchants(['ALBERT', 'ALBERT HEIJN AMSTERDAM'])),
    { ALBERT: 'ALBERT', 'ALBERT HEIJN AMSTERDAM': 'ALBERT' })
})

test('merchantName: up to three words, cut before anything branch-specific', () => {
  assert.equal(merchantName(en('ALBERT HEIJN AMSTERDAM', 'NL1012 AMSTERDAM')), 'ALBERT HEIJN')
  assert.equal(merchantName(en('ALBERT HEIJN ZUIDAS', 'NL1082 AMSTERDAM')), 'ALBERT HEIJN ZUIDAS')
  assert.equal(merchantName(en('CASA VERDE ESTIASI C', 'GR57002 LAGKADAS')), 'CASA VERDE ESTIASI')
  assert.equal(merchantName(en('LIDL 1153 LEUVEN', 'BE3000 LEUVEN')), 'LIDL')
  assert.equal(merchantName(en('JUMBO SUPERMARKTEN BV', 'NL5000 TILBURG')), 'JUMBO SUPERMARKTEN')
  assert.equal(merchantName('ACME CLINICAL RESEARCH BV'), 'ACME CLINICAL RESEARCH')
})

test('rowMerchantName: counterparty first, the holder column marks own transfers', () => {
  const mapping = { counterparty: 'Counterparty name', holder: 'Name', description: 'Description', details: 'Free-format reference' }
  const row = (cp, description, free = '') => ({ Name: 'DOE JANE', 'Counterparty name': cp, Description: description, 'Free-format reference': free })
  // Salary: the employer, not "EUROPEAN".
  assert.equal(rowMerchantName(row('ACME CLINICAL RESEARCH BV', 'EUROPEAN TRANSFER FROM BE00 0000 0000 0008', 'SALARY JANUARY'), mapping), 'ACME CLINICAL RESEARCH')
  // Own account, either word order.
  assert.equal(rowMerchantName(row('JANE DOE', "SENDING MONEY INSTANTLY TO BE00 0000 0000 0005 BENEFICIARY'S BANK: REVOBEB2XXX JANE DOE AT 17.05 WITH KBC MOBILE"), mapping), '')
  assert.equal(rowMerchantName(row('Doe Jane', 'RECEIVING MONEY INSTANTLY FROM BE00 0000 0000 0005'), mapping), '')
  // Card rows leave the counterparty empty: the description decides.
  assert.equal(rowMerchantName(row('', 'PAYMENT VIA BANCONTACT 06-01-2026 AT 10.54 TIME LIDL 1153 LEUVEN BE3000 LEUVEN WITH KBC DEBIT CARD 5127 88XX XXXX 1234 CARDHOLDER: DOE JANE'), mapping), 'LIDL')
  // Without a holder column a person's counterparty is still a name.
  assert.equal(rowMerchantName({ cp: 'KUMAR RAVI', d: 'x' }, { counterparty: 'cp', description: 'd' }), 'KUMAR RAVI')
})

test('merchantKey: empty inputs', () => {
  assert.equal(merchantKey(''), '')
  assert.equal(merchantKey(null), '')
  assert.equal(merchantKey('12/07/2026 99.50'), '')
  assert.deepEqual(groupMerchants([]), new Map())
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

test('isOwnTransfer: a card top-up of the holder\'s own Revolut account is left out', () => {
  const mapping = {
    date: 'Date', amount: 'Amount', counterparty: 'Counterparty name', holder: 'Name',
    description: 'Description', details: 'Free-format reference',
  }
  const row = (description, amount = '-100,00') => ({
    Name: 'DOE JANE', Date: '06/01/2026', Amount: amount, 'Counterparty name': '', Description: description,
  })
  const topUps = [
    en('REVOLUT**1234* DUBLIN', 'IE'),
    en('REVOLUT', 'IE D02 DUBLIN', 'JANE DOE'),
    en('REVOLUT LTD', 'IE'),
    en('REVOLUT*', 'LT01103 VILNIUS'),
    nl('REVOLUT**1234* DUBLIN', 'IE', 'DOE JANE'),
    fr('REVOLUT**1234* DUBLIN', 'IE', 'Jane Doe'),
  ].map((d) => row(d))
  for (const r of topUps) {
    assert.equal(isOwnTransfer(r, mapping), true, r.Description)
    assert.deepEqual(rowToDraft(r, mapping, 'EUR'), { skip: 'own transfer' })
  }
  // A joint-account partner's card topping up their own Revolut: an expense.
  const partner = row(en('REVOLUT**5678* DUBLIN', 'IE', 'DOE MARK'))
  assert.equal(isOwnTransfer(partner, mapping), false)
  assert.equal(rowToDraft(partner, mapping, 'EUR').merchant, 'REVOLUT')
  // Ordinary card payments are unaffected, even with the holder's card.
  const lidl = row(en('LIDL 1153 LEUVEN', 'BE3000 LEUVEN'), '-12,78')
  assert.equal(isOwnTransfer(lidl, mapping), false)
  // Without a holder column nothing counts as own.
  assert.equal(isOwnTransfer(topUps[0], { ...mapping, holder: undefined }), false)

  const preview = previewDrafts([...topUps, partner, lidl], mapping, 'EUR')
  assert.equal(preview.ownTransfers, topUps.length)
  assert.equal(preview.ready, 2)
  assert.equal(preview.skipped, 0)
})

test('parseAmount / normalizeCurrency: money cells carrying their currency (Revolut)', () => {
  assert.equal(parseAmount('€4.40'), 4.4)
  assert.equal(parseAmount('-€4.40'), -4.4)
  assert.equal(parseAmount('€1,234.56', '.'), 1234.56)
  assert.equal(parseAmount('-¥9'), -9)
  assert.equal(parseAmount('-4.50 CHF'), -4.5)
  assert.equal(parseAmount('-1,098.67 AED', '.'), -1098.67) // a code the locale parser doesn't know
  assert.equal(parseAmount('$20.00 (77.97 PLN)', '.'), 20) // the bracketed equivalent isn't the amount
  assert.equal(parseAmount('(12.50)'), -12.5) // accounting negatives still work
  assert.ok(Number.isNaN(parseAmount('ATM 1234'))) // text isn't an amount
  assert.equal(normalizeCurrency('-€4.40'), 'EUR')
  assert.equal(normalizeCurrency('£3.00'), 'GBP')
  assert.equal(normalizeCurrency('-¥9'), 'JPY')
  assert.equal(normalizeCurrency('0.00 CHF'), 'CHF')
  assert.equal(normalizeCurrency('-1,098.67 aed'), 'AED')
  assert.equal(normalizeCurrency('$20.00 (77.97 PLN)'), 'USD')
  assert.equal(normalizeCurrency('4.40'), '') // no currency written: the base one
  assert.equal(normalizeCurrency(' eur '), 'EUR') // plain currency cells as before
  assert.equal(normalizeCurrency('€'), 'EUR')
})

test('isOwnTransfer: Revolut\'s moves between the holder\'s own balances, with or without a holder', () => {
  const mapping = { date: 'Date', amount: 'Amount', description: 'Description' }
  const row = (description) => ({ Date: 'Jun 4, 2022', Amount: '-€1.00', Description: description })
  for (const d of ['Apple Pay deposit by *1111', 'Apple Pay deposit by *****', 'Google Pay deposit by *1234',
    'Top-Up by *1234', 'Apple Pay Top-Up by *1234', 'To pocket EUR Holidays from EUR', 'To pocket PLN Music from PLN',
    'Pocket Withdrawal', 'Exchanged to USD', 'To EUR', 'To EUR Savings', 'From EUR Savings', 'From Savings',
    'To investment account', 'To Robo portfolio', 'To Bold Stack portfolio', 'Revpoints Spare change',
    'Transfer to Revolut Digital Assets Europe Ltd', 'Transfer from Revolut Digital Assets Europe Ltd']) {
    assert.equal(isOwnTransfer(row(d), mapping), true, d)
  }
  // Real spending and income: payments to companies (also from a pocket named
  // after them), people, a phone top-up, Revolut's own charity.
  for (const d of ['To ENGIE', 'To Cambio - Car Sharing n.v.', 'To Meli Delicatessen', 'To KBC', 'Transfer to ALEX MORGAN',
    'Transfer from SAM TAYLOR', 'Payment from TELCO BV', 'Vodafone top-up', 'Metal plan fee',
    'Transfer to Revolut Donations', 'Cash withdrawal at Main Street ATM']) {
    assert.equal(isOwnTransfer(row(d), mapping), false, d)
  }
  // The holder's name as typed on the mapping step: either word order, titles ignored.
  const named = { ...mapping, holderName: '  Jane   Doe ' }
  for (const d of ['To Jane Doe', 'To DOE JANE', 'Payment from MR JANE DOE', 'Transfer to Jane Doe', 'Transfer from DOE JANE']) {
    assert.equal(isOwnTransfer(row(d), named), true, d)
    assert.equal(isOwnTransfer(row(d), mapping), false, d)
  }
  assert.equal(isOwnTransfer(row('To Jane Smith'), named), false)
  assert.equal(isOwnTransfer(row('To Mark Doe'), named), false)
})

test('rowToDraft: the statement\'s own conversion becomes the row\'s rate', () => {
  const mapping = { date: 'Date', amount: 'A', currency: 'A', baseAmount: 'B', dateOrder: 'mdy', decimal: '.' }
  const draft = (a, b, base = 'EUR') => rowToDraft({ Date: 'Jun 20, 2022', A: a, B: b }, mapping, base)
  assert.equal(draft('-$10.00', '-€9.20').rate, 0.92)
  assert.equal(draft('-¥9', '-€0.06').rate, 0.00666667)
  assert.equal(draft('-¥9', '-€0.06').amount_minor, 9)
  assert.equal(draft('-€4.40', null).rate, null) // already the base currency
  assert.equal(draft('-$10.00', '€0.00').rate, null) // nothing to divide: the ECB rate
  assert.equal(draft('-$10.00', '-€9.20', 'GBP').rate, null) // the equivalent isn't in the base currency
  assert.equal(draft('-$10.00', '').rate, null)
  assert.equal(rowToDraft({ Date: 'Jun 20, 2022', A: '-€1.00' }, { date: 'Date', amount: 'A' }, 'EUR').rate, null)
})

test('holder name helpers: clean, suggest, read from a holder column', () => {
  assert.equal(cleanHolderName('  Jane \n  Doe '), 'Jane Doe')
  assert.equal(cleanHolderName(null), '')
  assert.equal(cleanHolderName('x'.repeat(300)).length, 100)
  assert.equal(suggestedHolder('DOE JANE', 'Jane Doe'), 'DOE JANE') // remembered wins
  assert.equal(suggestedHolder('', 'Jane Doe'), 'Jane Doe')
  assert.equal(suggestedHolder(null, 'jane'), '') // a single word isn't a full name
  assert.equal(suggestedHolder(undefined, undefined), '')
  const rows = [{ Name: ' ' }, { Name: 'DOE  JANE' }]
  assert.equal(fileHolder(rows, { holder: 'Name' }), 'DOE JANE')
  assert.equal(fileHolder(rows, {}), '')
})

test('merchantGroups: money in and money out never share a group', () => {
  const merchants = new Map([['a', 'ACME'], ['b', 'ACME'], ['c', 'LIDL'], ['d', 'LIDL'], ['e', 'ACME'], ['f', '']])
  const valid = [
    { client_uuid: 'a', kind: 'income', description: 'ACME SALARY' },
    { client_uuid: 'b', kind: 'income', description: 'ACME SALARY' },
    { client_uuid: 'e', kind: 'expense', description: 'ACME SHOP' },
    { client_uuid: 'c', kind: 'expense', description: 'LIDL' },
    { client_uuid: 'd', kind: 'expense', description: 'LIDL', category_id: 'cat' }, // already categorized
    { client_uuid: 'f', kind: 'expense', description: 'x' }, // no key
  ]
  assert.deepEqual(merchantGroups(valid, merchants), [
    { id: 'income|ACME', pattern: 'ACME', kind: 'income', count: 2 },
    { id: 'expense|ACME', pattern: 'ACME', kind: 'expense', count: 1 },
    { id: 'expense|LIDL', pattern: 'LIDL', kind: 'expense', count: 1 },
  ])
  assert.equal(groupIdOf(valid[0], merchants), 'income|ACME')
})

test('ruleCategory: a rule only files rows of its category\'s kind', () => {
  const kindOf = new Map([['salary', 'income'], ['shop', 'expense'], ['food', 'expense']])
  const rules = [
    { pattern: 'ACME CLINICAL', category_id: 'salary' },
    { pattern: 'ACME', category_id: 'shop' },
    { pattern: 'LIDL', category_id: 'food' },
  ]
  assert.equal(ruleCategory(rules, kindOf, 'ACME CLINICAL RESEARCH SALARY', 'income'), 'salary')
  // The longer income rule is passed over for an expense row.
  assert.equal(ruleCategory(rules, kindOf, 'ACME CLINICAL RESEARCH REFUND', 'expense'), 'shop')
  assert.equal(ruleCategory(rules, kindOf, 'lidl leuven', 'expense'), 'food')
  assert.equal(ruleCategory(rules, kindOf, 'LIDL RETURN', 'income'), null)
  assert.equal(ruleCategory(rules, kindOf, '', 'expense'), null)
})

test('categoryMatcher: the file\'s category column first, else the longest matching rule of the row\'s kind', () => {
  const categories = [
    { id: 'food', name: 'Food', kind: 'expense' }, { id: 'shop', name: 'Shopping', kind: 'expense' },
    { id: 'salary', name: 'Salary', kind: 'income' },
  ]
  const rules = [{ pattern: 'LIDL', category_id: 'food' }, { pattern: 'ACME', category_id: 'salary' }]
  const of = categoryMatcher(categories, rules)
  const withColumn = { date: 'Date', amount: 'Amount', description: 'Text', category: 'Cat' }
  const noColumn = { date: 'Date', amount: 'Amount', description: 'Text' }
  const draft = (description, kind = 'expense') => ({ description, kind })
  assert.equal(of(draft('LIDL LEUVEN'), { Cat: 'shopping' }, withColumn), 'shop') // the file names it
  assert.equal(of(draft('LIDL LEUVEN'), { Cat: 'Unknown' }, withColumn), 'food') // not one of yours → rule
  assert.equal(of(draft('LIDL LEUVEN'), {}, noColumn), 'food')
  assert.equal(of(draft('ACME PAYROLL', 'income'), {}, noColumn), 'salary')
  assert.equal(of(draft('ACME REFUND'), {}, noColumn), null) // an income rule never files an expense
  assert.equal(of(draft('BAKERY'), {}, noColumn), null)
  assert.equal(categoryMatcher(null, null)(draft('LIDL'), {}, noColumn), null)
})

test('previewDrafts: with a matcher, each shown row carries the category the import will give it', () => {
  const mapping = { date: 'Date', amount: 'Amount', description: 'Text' }
  const rows = [
    { Date: '2026-09-01', Amount: '-12.50', Text: 'LIDL LEUVEN' },
    { Date: '2026-09-02', Amount: '-4.00', Text: 'BAKERY' },
  ]
  const categoryOf = categoryMatcher([{ id: 'food', name: 'Food', kind: 'expense' }], [{ pattern: 'lidl', category_id: 'food' }])
  const preview = previewDrafts(rows, mapping, 'EUR', { categoryOf })
  assert.deepEqual(preview.rows.map((d) => d.category_id), ['food', null])
  // Without one the rows are left as rowToDraft made them.
  assert.equal('category_id' in previewDrafts(rows, mapping, 'EUR').rows[0], false)
})

// ── KBC's shorter saved descriptions (kbcLabels.js) ─────────────────────────
// Made-up merchants, names, card numbers and IBANs.
const label = (description, o = {}) => kbcLabel({ cells: { description, ...o.cells }, kind: o.kind ?? 'expense' })

test('kbcLabel: card payments keep the merchant and the town, never the card or its holder', () => {
  assert.equal(label(en('LIDL 1153 LEUVEN', 'BE3000 LEUVEN')), 'Lidl · Leuven')
  assert.equal(label(nl('DELHAIZE WATERSPORT NV', 'BE9000 GENT')), 'Delhaize Watersport · Gent')
  assert.equal(label(nl('ST. PIERRE', 'BE9000 GENT')), 'St. Pierre · Gent')
  assert.equal(label(fr('SUMUP *BOULANGERIE DUPONT', 'BE5000 NAMUR')), 'Boulangerie Dupont · Namur')
  assert.equal(label(en('AMZN MKTP DE*AB12CD', 'LU1855 LUXEMBOURG')), 'Amzn MKTP De · Luxembourg')
  assert.equal(label('PAYMENT VIA DEBIT MASTERCARD 29-12-2025 AT 22.01 TIME MCDONALD S W.SALONICA GR54627 THESSALONIKI WITH APPLE PAY 5127 88XX XXXX 1234 VIRTUAL CARD NUMBER FOR CONTACTLESS: 5315 88XX XXXX 5678'),
    'Mcdonald S W.Salonica · Thessaloniki')
  // No postcode + town on the line: the merchant alone.
  assert.equal(label('BETALING VIA MAESTRO 02-10-2023 OM 08.23 UUR STAD GENT PARKEREN BE GENT MET KBC-DEBETKAART 6703 42XX XXXX X201 0 KAARTHOUDER: JANSSENS ELS'),
    'Stad Gent Parkeren')
  // No time stamp: the counterparty column names the shop.
  assert.equal(label('BETALING VIA BANCONTACT', { cells: { counterparty: 'ZZMART GENT' } }), 'Zzmart Gent')
  for (const d of [en('LIDL 1153 LEUVEN', 'BE3000 LEUVEN'), nl('CAFE ZZ', 'BE9000 GENT'), fr('ZZ PAIN', 'BE1000 BRUXELLES')]) {
    const l = label(d)
    assert.ok(!/\d{4}|XX|DOE|JANSSENS|KAARTHOUDER|CARDHOLDER|TITULAIRE/i.test(l), l)
  }
})

test('kbcLabel: cash withdrawals and deposits say so, with the town', () => {
  assert.equal(label('CASH WITHDRAWAL 18-01-2026 AT 14.02 TIME KBC LEUVEN BE3000 LEUVEN WITH KBC DEBIT CARD 5127 88XX XXXX 1234'),
    'Cash withdrawal · Leuven')
  assert.equal(label('GELDOPNEMING 18-01-2026 OM 14.02 UUR KBC GENT BE9000 GENT MET KBC-DEBETKAART 4972 55XX XXXX 3390'),
    'Cash withdrawal · Gent')
  assert.equal(label('DEPOSIT OF CASH 19-01-2026 KBC LEUVEN', { kind: 'income' }), 'Cash deposit · Leuven')
  assert.equal(label('STORTING CONTANTEN 19-01-2026 KBC LEUVEN', { kind: 'income' }), 'Cash deposit · Leuven')
  assert.equal(label('CASH DEPOSIT', { kind: 'income' }), 'Cash deposit')
})

test('kbcLabel: transfers name the other party and keep the free message', () => {
  assert.equal(label('EUROPESE OVERSCHRIJVING VAN', { kind: 'income', cells: { counterparty: 'K. DE SMET', details: 'Verjaardag' } }),
    'Transfer from K. De Smet · Verjaardag')
  assert.equal(label("SENDING MONEY INSTANTLY TO BE00 0000 0000 0003 BENEFICIARY'S BANK: GEBABEBBXXX KUMAR RAVI DINNER AT 20.15 WITH KBC MOBILE"),
    'Transfer to Kumar Ravi Dinner')
  assert.equal(label('INSTANTOVERSCHRIJVING NAAR 27-12 BE00 0000 0000 0001 BANKIER BEGUNSTIGDE: KREDBEBBXXX PIETERS TOM OM 17.11 UUR MET KBC MOBILE',
    { cells: { counterparty: 'PIETERS TOM', details: 'Huur oktober' } }), 'Transfer to Pieters Tom · Huur oktober')
  assert.equal(label('VIREMENT EUROPEEN VERS BE00 0000 0000 0004 BANQUE DU BENEFICIAIRE: KREDBEBB IMMO ZZ LOYER'),
    'Transfer to Immo ZZ Loyer')
  // Nobody named anywhere: the raw text is kept.
  assert.equal(label('EUROPESE OVERSCHRIJVING VAN 04-01', { kind: 'income' }), null)
})

test('kbcLabel: direct debits name the creditor; the bank\'s fees and settlements are named plainly', () => {
  assert.equal(label('EUROPEAN DIRECT DEBIT CREDITOR : ZZTEL CREDITOR REF.: 123456 MANDATE REFERENCE : 9988'), 'Zztel · Direct debit')
  assert.equal(label('EUROPESE DOMICILIERING SCHULDEISER : KBC VERZEKERINGEN REF. SCHULDEISER: 390666825141 MANDAATREFERTE : L00223506492V0001 EIGEN OMSCHR. : GEZINSPOLIS'),
    'KBC Verzekeringen · Direct debit')
  assert.equal(label('DOMICILIATION EUROPEENNE CREANCIER : ZZ ENERGIE REF. CREANCIER : 998877'), 'ZZ Energie · Direct debit')
  assert.equal(label('BIJDRAGE 01-02-2018 - 28-02-2018 28-02 KBC-PLUSREKENING'), 'Account fee · KBC-Plusrekening')
  assert.equal(label('SETTLEMENT KBC CREDIT CARD 5127 88XX XXXX 9999'), 'Credit card settlement')
  assert.equal(label('KOSTEN KBC-PLUSREKENING'), 'Bank fees')
  // Fee words without the bank's name aren't KBC's: kept as they are.
  assert.equal(label('FEES FOR FOREIGN PAYMENT'), null)
})

test('kbcLabel: other banks\' lines are left alone; the raw text is what matches', () => {
  for (const d of ['NETFLIX.COM', 'Transfer to Jane Doe', 'Top-Up by *1234', 'PAYCONIQ BY BANCONTACT DELHAIZE 5678 GENT', '']) {
    assert.equal(label(d), null, d)
  }
  assert.equal(displayDescription({ cells: { description: 'NETFLIX.COM' }, description: 'NETFLIX.COM' }), 'NETFLIX.COM')
  assert.equal(displayDescription({ cells: {}, description: null }), null)
  // A KBC row: the draft keeps the raw description (duplicate key, rules,
  // merchant key) and only the saved text is short.
  const mapping = { date: 'Datum', amount: 'Bedrag', description: 'Omschrijving', counterparty: 'Naam tegenpartij', details: 'Vrije mededeling', decimal: ',' }
  const raw = en('ZZMART 0412 LEUVEN', 'BE3000 LEUVEN')
  const draft = rowToDraft({ Datum: '06/01/2026', Bedrag: '-8,00', Omschrijving: raw, 'Naam tegenpartij': '', 'Vrije mededeling': '' }, mapping, 'EUR')
  assert.equal(draft.description, raw)
  assert.equal(draft.merchant, 'ZZMART')
  assert.equal(displayDescription(draft), 'Zzmart · Leuven')
  const rules = [{ pattern: 'ZZMART', category_id: 'food' }]
  assert.equal(ruleCategory(rules, new Map([['food', 'expense']]), draft.description, 'expense'), 'food')
  assert.equal(label(titleCase('')), null)
  assert.equal(titleCase('KBC-PLUSREKENING K. DE SMET'), 'KBC-Plusrekening K. De Smet')
})

test('descriptionParts: what the labels are built from', () => {
  assert.deepEqual(descriptionParts(en('LIDL 1153 LEUVEN', 'BE3000 LEUVEN')),
    { cash: null, card: { name: 'LIDL', segment: 'LIDL 1153 LEUVEN', town: 'LEUVEN' }, creditor: null, party: null })
  assert.equal(descriptionParts('EUROPEAN DIRECT DEBIT CREDITOR : ZZTEL CREDITOR REF.: 1').creditor, 'ZZTEL')
  assert.equal(descriptionParts('DEPOSIT OF CASH 19-01-2026 KBC LEUVEN').cash, 'DEPOSIT OF CASH')
  assert.deepEqual(descriptionParts(null), { cash: null, card: null, creditor: null, party: null })
})

test('importedRange: the first and last day of the imported entries, or null', async () => {
  const { importedRange } = await import('../src/features/import/importMath.js')
  assert.deepEqual(importedRange([
    { spent_at: '2026-03-14' }, { spent_at: '2026-01-02' }, { spent_at: '2026-07-25' }, {},
  ]), { from: '2026-01-02', to: '2026-07-25' })
  assert.equal(importedRange([]), null)
  assert.equal(importedRange(undefined), null)
})

test('dropKnownRows: a row the ledger already holds is left out, whatever its text', () => {
  const row = (spent_at, amount_minor, extra = {}) =>
    ({ kind: 'expense', spent_at, amount_minor, currency: 'EUR', description: 'x', ...extra })
  // Saved on an earlier import with the full bank text; the file now reads shorter.
  const existing = [
    row('2026-05-14', 3100, { description: 'PAYMENT VIA BANCONTACT … LIDL 1153 LEUVEN …' }),
    row('2026-05-14', 3200, { kind: 'income' }), row('2026-05-14', 3200, { kind: 'income' }),
    row('2026-05-20', 900, { group_expense_id: 'g1' }), // a group share isn't a bank line
  ]
  const file = [
    row('2026-05-14', 3100, { description: 'Lidl · Leuven' }),
    row('2026-05-14', 3200, { kind: 'income' }), row('2026-05-14', 3200, { kind: 'income' }),
    row('2026-05-14', 3200, { kind: 'income' }), // a third one is new
    row('2026-05-20', 900),
    row('2026-05-14', 3100, { currency: 'USD' }),
  ]
  const { rows, known } = dropKnownRows(file, existing)
  assert.equal(known, 3)
  assert.deepEqual(rows.map((r) => `${r.kind} ${r.amount_minor} ${r.currency}`),
    ['income 3200 EUR', 'expense 900 EUR', 'expense 3100 USD'])
  assert.deepEqual(dropKnownRows(file, []).rows, file)
})
