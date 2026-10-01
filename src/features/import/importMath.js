// Pure statement-import helpers (no xlsx/supabase — unit-testable): turning
// one raw statement row + a column mapping into a transaction draft.
import { toMinor, CURRENCIES } from '../../shared/lib/currency.js'
import { isoDate } from '../../shared/lib/dates.js'
import { parseLocaleAmount, parseDateText, ymd, foldText } from '../../shared/lib/localeParse.js'
import { sha256 } from '../../shared/lib/sha256.js'

// ------------------------------------------------------------ merchant keys
//
// A merchant key groups a statement's rows for the "New merchants" step and
// becomes a saved "description contains → category" rule, so it must (a) name
// the business or person, never the bank's boilerplate or the account holder,
// and (b) be a piece of every grouped row's own description text, or the rule
// would never match again. It is found in two steps:
//
// 1. Per row, merchantName / rowMerchantName pick the merchant's name out of
//    the text: up to three words, cut before anything branch-specific (a
//    store number, a postcode, the card's town), a "*reference", a company
//    form or the bank's tail. Card-acquirer prefixes ("CM* KANELA",
//    "SUMUP *KANELA") are skipped, so both are "KANELA".
// 2. Per file, groupMerchants turns those names into keys: names sharing a
//    first word get their longest common word-prefix ("LIDL LEUVEN" + "LIDL
//    GENT" → "LIDL"; "ALBERT HEIJN AMSTERDAM" + "ALBERT HEIJN UTRECHT" →
//    "ALBERT HEIJN"); a name on its own keeps at most two words.
//
// Each key is a word-prefix of its names, and each name a slice of its row's
// description, so the key is in every description of its group.

// Words that never name a merchant: payment-method, operation and
// connective words banks write around it (EN/FR/NL/EL, compared unaccented),
// plus titles and company-form suffixes.
const BANK_NOISE = new Set([
  'POS', 'CARD', 'PAYMENT', 'PURCHASE', 'VISA', 'MASTERCARD', 'DEBIT', 'CREDIT', 'TRANSFER', 'TO',
  'FROM', 'THE', 'BY', 'VIA', 'WITH', 'AT', 'OF', 'TIME', 'EUROPEAN', 'INSTANT', 'INSTANTLY', 'SENDING',
  'RECEIVING', 'MONEY', 'SETTLEMENT', 'CHARGE', 'CHARGES', 'FEE', 'FEES', 'DEPOSIT', 'CASH', 'WITHDRAWAL',
  'ATM', 'STANDING', 'ORDER', 'DIRECT', 'CREDITOR', 'CONTACTLESS', 'APPLE', 'GOOGLE', 'PAY', 'MOBILE',
  'ONLINE', 'ACCOUNT', 'REFUND', 'REPAYMENT', 'BANCONTACT', 'MAESTRO', 'PAYCONIQ',
  // Dutch
  'BETALING', 'MET', 'DEBETKAART', 'BANKKAART', 'KAART', 'OVERSCHRIJVING', 'INSTANTOVERSCHRIJVING', 'NAAR',
  'VAN', 'AANKOOP', 'EUROPESE', 'DOORLOPENDE', 'BETALINGSOPDRACHT', 'DOMICILIERING', 'STORTING', 'OPNAME',
  'GELDOPNAME', 'GELDOPNEMING', 'AFREKENING', 'KOSTEN', 'BIJDRAGE', 'OM', 'UUR', 'SCHULDEISER',
  'TERUGBETALING', 'CONTACTLOOS', 'REKENING',
  // French
  'PAIEMENT', 'AVEC', 'CARTE', 'VIREMENT', 'VERS', 'ACHAT', 'EUROPEEN', 'EUROPEENNE', 'INSTANTANE',
  'DOMICILIATION', 'ORDRE', 'PERMANENT', 'RETRAIT', 'ESPECES', 'DEPOT', 'VERSEMENT', 'FRAIS', 'DECOMPTE',
  'HEURES', 'CREANCIER', 'REMBOURSEMENT', 'COMPTE', 'SANS', 'CONTACT',
  // Greek
  'ΑΓΟΡΑ', 'ΚΑΡΤΑ', 'ΜΕ', 'ΣΕ', 'ΑΠΟ', 'ΠΛΗΡΩΜΗ', 'ΜΕΤΑΦΟΡΑ',
  // titles and company forms
  'MR', 'MRS', 'MS', 'MISS', 'MEJ', 'MEVR', 'MEVROUW', 'DHR', 'MME', 'MLLE', 'BV', 'NV', 'BVBA', 'VZW',
  'SA', 'SRL', 'SPRL', 'ASBL', 'LTD', 'LIMITED', 'PLC', 'LLC', 'INC', 'GMBH', 'AG', 'SARL',
  'ΑΕ', 'ΕΠΕ', 'ΙΚΕ', 'ΟΕ', 'ΕΕ',
])
// Words too broad to be a key alone — the bank's own name is in every card
// line ("WITH KBC DEBIT CARD"), and "CASA"/"SINT" start many names — so the
// next word joins them: "KBC INSURANCE", "CASA VERDE", "SINT PIETER".
const LEAD = new Set(['KBC', 'CBC', 'CASA', 'CHEZ', 'SINT', 'SAINT', 'SANTA', 'SAN', 'STAD', 'VILLE'])

// Towns banks print right after a shop's name ("DELHAIZE LEUVEN", "COLRUYT
// HALLE", "ΣΚΛΑΒΕΝΙΤΗΣ ΑΘΗΝΑ"): after the first word they end the name, so
// branches don't become merchants of their own. Card lines also name their
// town after the postcode, which is used the same way; this list covers the
// lines that don't (Belgium, the Netherlands, Greece, and the cities online
// merchants bill from). Names often built on a city ("PIZZA ROMA", "CAFE
// PARIS") are deliberately left out.
const PLACES = new Set([
  // Belgium (NL/FR)
  'ANTWERPEN', 'ANVERS', 'GENT', 'GAND', 'BRUGGE', 'BRUGES', 'BRUSSEL', 'BRUXELLES', 'BRUSSELS', 'LEUVEN',
  'LOUVAIN', 'HEVERLEE', 'KESSELLO', 'WILSELE', 'MECHELEN', 'MALINES', 'HASSELT', 'GENK', 'KORTRIJK',
  'COURTRAI', 'OOSTENDE', 'OSTENDE', 'AALST', 'ALOST', 'ROESELARE', 'ROULERS', 'TURNHOUT', 'HALLE',
  'VILVOORDE', 'DENDERMONDE', 'LIER', 'BEVEREN', 'LOKEREN', 'EEKLO', 'NINOVE', 'WAREGEM', 'IEPER', 'YPRES',
  'TIENEN', 'TIRLEMONT', 'DIEST', 'AARSCHOT', 'HERENTALS', 'KNOKKE', 'ZAVENTEM', 'TERVUREN', 'OVERIJSE',
  'NAMUR', 'NAMEN', 'LIEGE', 'LUIK', 'CHARLEROI', 'MONS', 'TOURNAI', 'DOORNIK', 'WAVRE', 'WAVER', 'NIVELLES',
  'ARLON', 'VERVIERS', 'SERAING', 'EUPEN', 'IXELLES', 'ELSENE', 'ETTERBEEK', 'SCHAERBEEK', 'SCHAARBEEK',
  'UCCLE', 'UKKEL', 'ANDERLECHT', 'WOLUWE', 'JETTE', 'FOREST', 'VORST',
  // the Netherlands
  'AMSTERDAM', 'ROTTERDAM', 'UTRECHT', 'EINDHOVEN', 'GRONINGEN', 'TILBURG', 'ALMERE', 'BREDA', 'NIJMEGEN',
  'ARNHEM', 'HAARLEM', 'MAASTRICHT', 'LEIDEN', 'DELFT', 'ZWOLLE', 'AMERSFOORT', 'APELDOORN', 'ENSCHEDE',
  'DORDRECHT', 'SCHIPHOL', 'SHERTOGENBOSCH', 'SGRAVENHAGE',
  // Greece (Latin and Greek script, unaccented)
  'ATHENS', 'ATHINA', 'ATHINAI', 'ΑΘΗΝΑ', 'THESSALONIKI', 'ΘΕΣΣΑΛΟΝΙΚΗ', 'PIRAEUS', 'PEIRAIAS', 'ΠΕΙΡΑΙΑΣ',
  'PATRA', 'PATRAS', 'ΠΑΤΡΑ', 'HERAKLION', 'IRAKLIO', 'ΗΡΑΚΛΕΙΟ', 'LARISA', 'LARISSA', 'ΛΑΡΙΣΑ', 'VOLOS',
  'ΒΟΛΟΣ', 'IOANNINA', 'ΙΩΑΝΝΙΝΑ', 'KALAMARIA', 'ΚΑΛΑΜΑΡΙΑ', 'CHANIA', 'ΧΑΝΙΑ', 'KAVALA', 'ΚΑΒΑΛΑ',
  'GLYFADA', 'ΓΛΥΦΑΔΑ', 'MAROUSI', 'ΜΑΡΟΥΣΙ', 'KIFISIA', 'ΚΗΦΙΣΙΑ', 'CHALANDRI', 'ΧΑΛΑΝΔΡΙ',
  // where online merchants bill from
  'LUXEMBOURG', 'LUXEMBURG', 'DUBLIN', 'BERLIN', 'MUNCHEN', 'MUNICH', 'HAMBURG', 'FRANKFURT', 'KOLN',
  'KOELN', 'AACHEN', 'DUSSELDORF', 'MADRID', 'BARCELONA', 'LISBOA', 'LISBON', 'WIEN', 'VIENNA', 'ZURICH',
  'GENEVE', 'GENEVA', 'STOCKHOLM', 'LILLE',
])

// Card acquirers and payment facilitators that write their own tag, then
// "*", before the shop's name: "CM* KANELA", "SQ *KANELA", "SUMUP  *KANELA",
// "ZETTLE_*KANELA". The shop is what follows. (Square, Toast, SumUp, Zettle,
// PayPal/Braintree, Shopify, Stripe, Paddle, Checkout.com, Worldpay, Mollie,
// CM.com, CCV, Viva Wallet, myPOS, Worldline, Adyen, Dojo, Klarna, Google.)
const PROCESSORS = ['SQ', 'SQU', 'TST', 'SUMUP', 'IZ', 'IZETTLE', 'ZETTLE', 'PAYPAL', 'PP', 'BT', 'SP',
  'SHOPIFY', 'STRIPE', 'STRP', 'PADDLE', 'PADDLE.NET', 'CKO', 'WP', 'WORLDPAY', 'MOLLIE', 'CM', 'CM.COM',
  'CCV', 'VIVA', 'VIVAWALLET', 'MYPOS', 'WORLDLINE', 'ADYEN', 'DOJO', 'KLARNA', 'GOOGLE']
const PROCESSOR_PREFIX = new RegExp(
  `(?<![\\p{L}\\p{N}.])(?:${PROCESSORS.map((p) => p.replace('.', '\\.')).join('|')})[\\s_]*\\*+\\s*`, 'gu')
// A web address as a name: "NETFLIX.COM" is NETFLIX.
const DOMAIN = /^(WWW\.)?([\p{L}\d&-]+)\.(?:COM|NET|ORG|EU|BE|NL|DE|FR|GR|LU|CO|IO|UK|APP)\b/u

// Where the useful part of a description ends: card numbers, the
// cardholder's name, the bank's merchant-info block.
const TAIL = /\s*\b(?:CARDHOLDER|KAARTHOUDER|TITULAIRE|MERCHANT INFO|INFO VAN DE HANDELAAR|INFO DU COMMER[CÇ]ANT|(?:VIRTUAL |BANK )?CARD NUMBER|BANKKAARTNUMMER|KAARTNUMMER|NUM[EÉ]RO DE (?:LA )?CARTE)\b.*$/
// A card payment's time stamp — "AT 22.01 TIME", "OM 13.55 UUR",
// "À 13.55 HEURES" — the merchant follows it...
const CARD_TIME = /(?:^|\s)(?:AT|OM|[AÀ])\s+\d{1,2}[.:H]\d{2}\s+(?:TIME|UUR|HEURES?|H)\b/
// ...up to the country+postcode ("BE3000", "GR54627") and town, or
// "WITH/MET/AVEC …".
const CARD_END = /\s+(?:[A-Z]{2}\d{3,6}\b|(?:WITH|MET|AVEC)\b).*$/
const CARD_TOWN = /\s[A-Z]{2}\d{3,6}\s+(.*?)(?=\s+(?:WITH|MET|AVEC)\b|$)/
// The card's holder, as the bank prints it after the merchant.
const CARDHOLDER = /\b(?:CARDHOLDER|KAARTHOUDER|TITULAIRE(?: DE LA CARTE)?)\s*:\s*(.+?)(?=\s+(?:MERCHANT INFO|INFO VAN|INFO DU)\b|$)/
// A direct debit's creditor: "CREDITOR : PROXIMUS CREDITOR REF.: …".
const CREDITOR = /\b(?:CREDITOR|SCHULDEISER|CR[EÉ]ANCIER)\s*:\s*(.+?)(?=\s+(?:CREDITOR|SCHULDEISER|CR[EÉ]ANCIER|REF\b|MANDA)|$)/
// A transfer's other party, after the bank label and its BIC:
// "BENEFICIARY'S BANK: REVOBEB2XXX JANE DOE …", "BANKIER OPDRACHTGEVER: KREDBEBB …".
const PARTY = /\b(?:BANKIER (?:BEGUNSTIGDE|OPDRACHTGEVER)|(?:BENEFICIARY|ORDERING PARTY|PAYER|PAYEE)['’]?S BANK|BANQUE (?:DU |DE LA )?(?:B[EÉ]N[EÉ]FICIAIRE|DONNEUR D['’]ORDRE))\s*:\s*[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\s+(.+)$/
const PARTY_END = /\s+(?:(?:AT|OM|[AÀ])\s+\d{1,2}[.:]\d{2}|REFERENTIE|REFERENCE|R[EÉ]F[EÉ]RENCE|MEDEDELING|COMMUNICATION|(?:WITH|MET|AVEC)\b).*$/
// Cash in or out has no third party: the operation itself is the key.
const CASH = /^(?:CASH (?:WITHDRAWAL|DEPOSIT)|WITHDRAWAL|DEPOSIT(?: OF CASH)?|GELDOPNEMING|GELDOPNAME|OPNAME|STORTING|RETRAIT|VERSEMENT|D[EÉ]P[OÔ]T)\b/
// Card "purchases" that only move the holder's money to their own account
// elsewhere: a top-up of their Revolut account with their own card.
const OWN_TOPUP_MERCHANTS = new Set(['REVOLUT'])
// Revolut's descriptions of money moving between the holder's own balances:
// a top-up from their own card ("Apple Pay deposit by *1234", "Top-Up by
// *1234"), a pocket ("To pocket EUR Holidays from EUR", "Pocket
// Withdrawal"), a currency exchange — listed in both currencies' tables, as
// "Exchanged to USD" and "To EUR" — a savings, investment or crypto account
// ("To EUR Savings", "From Savings", "To investment account", "To Robo
// portfolio", "Transfer to Revolut Digital Assets Europe Ltd") and Revpoints
// round-ups ("Revpoints Spare change"). A payment from a pocket to a company
// ("To ENGIE", "To Cambio - …") is real spending and isn't matched.
const OWN_MOVE = new RegExp([
  '^(?:(?:apple|google) pay )?(?:deposit|top-?up) by\\b',
  '^to pocket [a-z]{3}\\b', '^pocket withdrawal$',
  '^exchanged to [a-z]{3}$', `^to (?:${CURRENCIES.join('|')})$`,
  '^(?:to|from) (?:[a-z]{3} )?savings$',
  '^to (?:investment account|.+ portfolio)$',
  '^transfer (?:to|from) revolut (?:digital assets|securities)\\b',
  '^revpoints\\b',
].join('|'), 'i')
// The other party of a transfer named in the description: "To Jane Doe",
// "Transfer from JANE DOE", "Payment from MR DOE JANE".
const DESCRIBED_PARTY = /^(?:(?:TRANSFER|PAYMENT)\s+)?(?:TO|FROM)\s+(.+)$/

// A word's letters, unaccented and upper-cased: "St." → "ST", "Café" → "CAFE".
const lettersOf = (word) => foldText(word).toUpperCase().replace(/[^\p{L}]/gu, '')

function tokens(text) {
  return [...text.matchAll(/\p{L}+/gu)]
    .map((m) => ({ w: foldText(m[0]).toUpperCase(), start: m.index, end: m.index + m[0].length }))
    .filter((t) => t.w.length >= 2 && !/^X+$/.test(t.w)) // "55XX XXXX": masked card digits
}
// A person's name as a set of words, for comparing "DOE JANE" with "Jane Doe".
function nameWords(name) {
  return new Set(tokens(String(name ?? '').toUpperCase()).map((t) => t.w).filter((w) => !BANK_NOISE.has(w)))
}
function sameWords(a, b) {
  return a.size > 0 && a.size === b.size && [...a].every((w) => b.has(w))
}

// The merchant's name inside `text` (upper-cased), '' when there is none.
// Leading boilerplate, numbers and initials are skipped; the name then runs
// for up to three words and stops at a word with a digit ("1153",
// "BE3000"), a noise or company-form word, punctuation ("·", "/FOR/"), a
// town after the first word (the card line's `town` or one of PLACES), a
// "*" (what follows is a reference: "AMZN MKTP DE*AB12CD") or a web address
// ("NETFLIX.COM").
// Sliced from the text itself so the saved rule still matches it
// ("ST. PIERRE"). Only the holder's own name, or a lone broad word ("KBC"),
// is no name.
function nameIn(text, holder, town = new Set()) {
  // Blank a processor's prefix (same length, so offsets hold): the shop follows.
  const plain = text.replace(PROCESSOR_PREFIX, (m) => ' '.repeat(m.length))
  const words = []
  for (const m of plain.matchAll(/\S+/g)) {
    let start = m.index
    let word = m[0].replace(/[,;:]+$/, '')
    const star = word.indexOf('*')
    if (star >= 0) word = word.slice(0, star)
    const domain = DOMAIN.exec(word)
    if (domain) {
      start += domain[1]?.length ?? 0
      word = domain[2]
    }
    const letters = lettersOf(word)
    const stop = star >= 0 || !!domain
    const usable = /^\p{L}/u.test(word) && !/\d/.test(word) && !BANK_NOISE.has(letters)
    if (!words.length) {
      if (usable && letters.length >= 2) words.push({ start, end: start + word.length, letters })
      if (stop && words.length) break
      continue
    }
    const prev = words[words.length - 1]
    if (!usable || start !== prev.end + 1 || ((town.has(letters) || PLACES.has(letters)) && !LEAD.has(prev.letters))) break
    words.push({ start, end: start + word.length, letters })
    if (stop || words.length === 3) break
  }
  const named = words.filter((w) => w.letters.length >= 2)
  if (!named.length || named.every((w) => holder.has(w.letters))) return ''
  if (words.length === 1 && LEAD.has(words[0].letters)) return ''
  return text.slice(words[0].start, words[words.length - 1].end)
}

const plainText = (description) =>
  String(description).toUpperCase().replace(/\s+/g, ' ').replace(TAIL, '').trim()

// A card payment's merchant part (after the time stamp, before the
// postcode) and the words of its town, or null for other lines.
function cardMerchant(text) {
  const time = CARD_TIME.exec(text)
  if (!time) return null
  const rest = text.slice(time.index + time[0].length)
  const town = CARD_TOWN.exec(rest)?.[1] ?? ''
  return { segment: rest.replace(CARD_END, ''), town: new Set(tokens(town).map((t) => t.w)), townText: town }
}

// What merchantName reads out of a description, for the import's short
// display labels (kbcLabels.js), upper-cased: `cash` (the cash operation's
// words), `card` ({ name, segment, town }: a card line's merchant name, the
// text it came from, and its town), `creditor` (a direct debit's) and `party`
// (a transfer's other party, as the description names it). Each null when
// absent.
export function descriptionParts(description) {
  const text = plainText(description ?? '')
  const card = cardMerchant(text)
  const creditor = CREDITOR.exec(text)?.[1]?.trim()
  const party = PARTY.exec(text)?.[1]?.replace(PARTY_END, '').trim()
  return {
    cash: CASH.exec(text)?.[0] ?? null,
    card: card ? { name: nameIn(card.segment, new Set(), card.town), segment: card.segment.trim(), town: card.townText.trim() } : null,
    creditor: creditor || null,
    party: party || null,
  }
}

// Is the transfer's other party (the name after the bank label and BIC, when
// the statement has no counterparty column) the holder `own` themselves?
function partyIsHolder(party, own) {
  const words = tokens(party).map((t) => t.w).filter((w) => !BANK_NOISE.has(w))
  return own.size > 0 && sameWords(new Set(words.slice(0, own.size)), own)
}

// The merchant's name in a description (see nameIn). `holder` is the account
// holder's name (when the statement has it): a transfer whose other party is
// the holder (between their own accounts) has none. Cash and bank-generated
// lines are named by the operation ("CASH WITHDRAWAL", "SETTLEMENT KBC"),
// which groupMerchants keeps whole.
export function merchantName(description, { holder = '' } = {}) {
  if (!description) return ''
  const own = nameWords(holder)
  const text = plainText(description)
  const cash = CASH.exec(text)
  if (cash) return cash[0]
  const card = cardMerchant(text)
  if (card) {
    const name = nameIn(card.segment, own, card.town)
    if (name) return name
  }
  const creditor = CREDITOR.exec(text)
  if (creditor) {
    const name = nameIn(creditor[1], own)
    if (name) return name
  }
  const party = PARTY.exec(text)
  if (party) {
    if (partyIsHolder(party[1], own)) return ''
    const name = nameIn(party[1].replace(PARTY_END, ''), own)
    if (name) return name
  }
  const name = nameIn(text, own)
  if (name) return name
  // Nothing but boilerplate ("SETTLEMENT KBC CREDIT CARD"): the operation's
  // own words group these bank-generated lines.
  const label = tokens(text).filter((t) => !own.has(t.w)).slice(0, 2)
  return label.length ? text.slice(label[0].start, label[label.length - 1].end) : ''
}

// The key a description gets on its own (a one-row file).
export function merchantKey(description, opts) {
  const name = merchantName(description, opts)
  return name ? groupMerchants([name]).get(name) : ''
}

// How many leading words group a name: one, or two when the first is short
// or too broad on its own ("LE PAIN", "CASA VERDE", "KBC INSURANCE").
function headSize(words) {
  const first = lettersOf(words[0])
  return words.length > 1 && (first.length < 3 || LEAD.has(first)) ? 2 : 1
}

// A file's merchant names → their keys (a Map from each name). Names are
// grouped by their first word (two for a short/broad one). A group of
// different names keys on their longest common word-prefix; a lone name keys
// on its first two words. A trailing one- or two-letter word is dropped
// ("MCDONALD S" → "MCDONALD"). A bank label (a name that starts with a bank
// word: "CASH WITHDRAWAL", "SETTLEMENT KBC") is its own key.
// The "New merchants" list: uncategorized rows grouped by merchant key AND
// kind, so a payer (salary from an employer) is never offered alongside
// shops, nor given an expense category. `merchants` maps client_uuid → key.
// Returns [{ id, pattern, kind, count }], most rows first; `id` is what
// groupIdOf gives each row of the group.
export const groupIdOf = (t, merchants) => `${t.kind}|${merchants.get(t.client_uuid) ?? ''}`
export function merchantGroups(valid, merchants) {
  const byId = new Map()
  for (const t of valid) {
    if (t.category_id || !t.description) continue
    const pattern = merchants.get(t.client_uuid)
    if (!pattern) continue
    const id = groupIdOf(t, merchants)
    const g = byId.get(id) ?? { id, pattern, kind: t.kind, count: 0 }
    g.count++
    byId.set(id, g)
  }
  return [...byId.values()].sort((a, b) => b.count - a.count)
}

// The saved rule that categorizes a row: the longest "description contains
// pattern" whose category is of the row's kind — a rule made for income
// never files an expense (and vice versa). `rules` sorted longest first;
// `kindOf` maps category id → kind.
export function ruleCategory(rules, kindOf, description, kind) {
  if (!description) return null
  const upper = description.toUpperCase()
  return rules.find((r) => kindOf.get(r.category_id) === kind && upper.includes(r.pattern.toUpperCase()))
    ?.category_id ?? null
}

// The category a statement row gets on import: the file's own category
// column when it names one of the user's categories, else the saved rule
// that matches its description (ruleCategory). One matcher per import, built
// from `categories` (all kinds) and `rules`; call it with (draft, row,
// mapping) → category id or null. The live preview and the import share it.
export function categoryMatcher(categories, rules) {
  const byName = new Map((categories || []).map((c) => [c.name.toLowerCase(), c.id]))
  const kindOf = new Map((categories || []).map((c) => [c.id, c.kind]))
  const sorted = [...(rules || [])].sort((a, b) => b.pattern.length - a.pattern.length)
  return (draft, row, mapping) => {
    const named = mapping.category ? String(row[mapping.category] ?? '').toLowerCase().trim() : ''
    return (named ? (byName.get(named) ?? null) : null) ?? ruleCategory(sorted, kindOf, draft.description, draft.kind)
  }
}

export function groupMerchants(names) {
  const keys = new Map()
  const groups = new Map() // head -> [words of each distinct name]
  for (const name of new Set(names)) {
    if (!name) continue
    const words = name.split(' ')
    if (BANK_NOISE.has(lettersOf(words[0]))) { keys.set(name, name); continue }
    const head = words.slice(0, headSize(words)).join(' ')
    if (groups.has(head)) groups.get(head).push(words)
    else groups.set(head, [words])
  }
  for (const [head, members] of groups) {
    const min = head.split(' ').length
    let n = Math.min(2, members[0].length)
    if (members.length > 1) {
      n = min
      while (members.every((w) => n < w.length && w[n] === members[0][n])) n++
    }
    while (n > min && lettersOf(members[0][n - 1]).length <= 2) n--
    const key = members[0].slice(0, n).join(' ')
    for (const words of members) keys.set(words.join(' '), key)
  }
  return keys
}

// A statement row's cells, whitespace-collapsed.
const cellOf = (row, mapping) => (k) =>
  (mapping[k] ? String(row[mapping[k]] ?? '').replace(/\s+/g, ' ').trim() : '')

// A card "purchase" at a top-up merchant (Revolut) with the holder's own
// card: money moving to their own account there.
function isOwnTopUp(description, own) {
  const upper = String(description).toUpperCase().replace(/\s+/g, ' ')
  const cardholder = CARDHOLDER.exec(upper)
  if (!cardholder || !sameWords(nameWords(cardholder[1]), own)) return false
  const card = cardMerchant(plainText(upper))
  const name = card ? nameIn(card.segment, new Set()) : ''
  return OWN_TOPUP_MERCHANTS.has(lettersOf(name.split(' ')[0]))
}

// The account holder's name: the file's holder column, else the name the
// user typed (mapping.holderName) for files that have none (Revolut's).
const holderOf = (row, mapping) => cellOf(row, mapping)('holder') || cleanHolderName(mapping.holderName)

// A typed or stored holder name, whitespace-collapsed and capped.
export function cleanHolderName(name) {
  return String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 100)
}

// The holder's name to offer on the mapping step when the file has no holder
// column: the one remembered from an earlier import, else the profile's
// display name when it looks like a full name (two words or more).
export function suggestedHolder(remembered, displayName) {
  const shown = cleanHolderName(displayName)
  return cleanHolderName(remembered) || (shown.split(' ').length >= 2 ? shown : '')
}

// The holder's name a file's holder column gives (its first filled cell), or ''.
export function fileHolder(rows, mapping) {
  if (!mapping.holder) return ''
  for (const r of rows) {
    const name = cleanHolderName(r[mapping.holder])
    if (name) return name
  }
  return ''
}

// A transfer between the holder's own accounts: one of Revolut's own-balance
// moves (OWN_MOVE: top-ups, pockets, exchanges, savings); or the
// counterparty column (or, without one, the party named in the description)
// is the holder, in either word order; or a card top-up of their own Revolut
// account. Such rows aren't spending or income, so the import leaves them
// out. All but the first need the holder's name.
export function isOwnTransfer(row, mapping) {
  const cell = cellOf(row, mapping)
  if (OWN_MOVE.test(cell('description'))) return true
  const own = nameWords(holderOf(row, mapping))
  if (!own.size) return false
  const counterparty = cell('counterparty')
  if (counterparty) return sameWords(nameWords(counterparty), own)
  const described = DESCRIBED_PARTY.exec(plainText(cell('description')))
  if (described && sameWords(nameWords(described[1]), own)) return true
  const description = [cell('description'), cell('details')].filter(Boolean).join(' · ')
  if (isOwnTopUp(description, own)) return true
  const party = PARTY.exec(plainText(description))
  return !!party && partyIsHolder(party[1], own)
}

// The merchant name of a statement row (see merchantName): the counterparty
// column when it has a name, else the description. A row whose counterparty
// is the account holder (the "Name"/"Naam" column, either word order) is a
// transfer between the holder's own accounts — not a merchant — and gets none.
export function rowMerchantName(row, mapping) {
  const cell = cellOf(row, mapping)
  const holder = holderOf(row, mapping)
  const counterparty = cell('counterparty')
  if (counterparty) {
    if (sameWords(nameWords(counterparty), nameWords(holder))) return ''
    const name = merchantName(counterparty, { holder })
    if (name) return name
  }
  return merchantName([cell('description'), cell('details')].filter(Boolean).join(' · '), { holder })
}

// A money cell's own amount, without an equivalent in brackets ("$20.00
// (18.40 EUR)", as Revolut writes foreign amounts) or a trailing currency
// code the locale parser doesn't strip ("-1,098.67 AED").
const BRACKETED = /(\d)\s*\([^()]*\)\s*$/
const CODE_SUFFIX = /^([-+−–]?\s*\d[\d.,\s]*)\s+[A-Z]{3}$/

// A cell as an amount. Spreadsheet numbers pass through; text is parsed with
// the column's decimal separator when known (see detectDecimal).
export function parseAmount(v, decimal) {
  if (typeof v === 'number') return v
  if (v == null) return NaN
  const text = String(v).trim().replace(BRACKETED, '$1')
  return parseLocaleAmount(CODE_SUFFIX.exec(text)?.[1] ?? text, decimal)
}

// Excel stores dates as days since 1899-12-30; a date column that SheetJS
// didn't type as a date arrives as such a serial number.
const EXCEL_EPOCH = Date.UTC(1899, 11, 30)
function fromExcelSerial(n) {
  const d = new Date(EXCEL_EPOCH + Math.floor(n) * 86400000)
  return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

// A statement date as local YYYY-MM-DD, or null. `order` says how to read an
// all-numeric d/m/y date: 'dmy' (Europe, the default), 'mdy' or 'ymd' — the
// importer detects it per column (detectDateOrder), because "03/04/2026" is
// only unambiguous in context. Text is read by parseDateText (ISO taken
// literally, yyyymmdd, named months in EN/FR/NL/EL); Date cells give their
// local calendar day (never toISOString); numbers are Excel serials.
export function parseDate(v, order = 'dmy') {
  if (v instanceof Date) return isNaN(v) ? null : isoDate(v)
  if (typeof v === 'number') return v > 20000 && v < 80000 ? fromExcelSerial(v) : null
  if (v == null) return null
  return parseDateText(String(v), order)
}

// Debit/credit marker cells: D/C, Dr/Cr, Af/Bij (NL), Débit/Crédit (FR),
// Χ/Π and Χρέωση/Πίστωση (EL), plus plain income/expense words.
const EXPENSE_WORDS = new Set(['d', 'dr', 'debit', 'debet', 'af', 'χ', 'χρεωση', 'out', 'expense',
  'withdrawal', 'uitgave', 'depense', 'εξοδο', 'εξοδα'])
const INCOME_WORDS = new Set(['c', 'cr', 'credit', 'bij', 'π', 'πιστωση', 'in', 'income',
  'deposit', 'inkomst', 'inkomsten', 'revenu', 'recette', 'εσοδο', 'εσοδα'])
export function directionOf(value) {
  const t = foldText(value).replace(/[^\p{L}]/gu, '')
  if (!t) return null
  if (EXPENSE_WORDS.has(t) || t.startsWith('expense')) return 'expense'
  if (INCOME_WORDS.has(t) || t.startsWith('income')) return 'income'
  return null
}

// A currency cell as an ISO code: "eur", "€" and " EUR " are all EUR. Blank
// is ''. Anything else comes back upper-cased (rowToDraft rejects it). A
// money cell gives the currency written with its amount: "-€4.40" is EUR,
// "0.00 CHF" CHF, "$20.00 (18.40 EUR)" USD, a bare "4.40" ''.
const SYMBOLS = { '€': 'EUR', '$': 'USD', '£': 'GBP', '¥': 'JPY', 'CHF': 'CHF' }
export function normalizeCurrency(raw) {
  const s = String(raw ?? '').trim().toUpperCase()
  if (!/\d/.test(s)) return SYMBOLS[s] ?? s
  const money = s.replace(BRACKETED, '$1')
  const code = /(?<![A-Z])[A-Z]{3}(?![A-Z])/.exec(money)?.[0]
  return code ?? SYMBOLS[[...money].find((c) => SYMBOLS[c])] ?? ''
}

// Rows a bank lists but that aren't (yet) money moving: card holds still
// pending, declined/refused/reverted payments — in EN/FR/NL/EL.
// Matched against the folded (lowercase, unaccented) cell.
const NOT_BOOKED = /pending|declined|reverted|failed|cancel|refus|rejet|geweigerd|afgewezen|in afwachting|en attente|εκκρεμ|απορριφ|ακυρ/
// Balance and total lines some exports mix into the rows.
const SUMMARY = /^(opening|closing|starting|ending|previous|new)\s+balance|^(ancien|nouveau)\s+solde|^solde|^(oud|nieuw|begin|eind)\s*saldo|^saldo|^υπολοιπο|^(νεο|προηγουμενο)\s+(μικτο\s+)?υπολοιπο|^total(e|en)?$|^totaal$|^συνολο$/i

// Payee + memo + details as one description ("LIDL · Card payment"), each
// part once, capped at the column's 500 characters.
function describe(row, mapping) {
  const parts = []
  for (const key of ['counterparty', 'description', 'details']) {
    const v = mapping[key] ? String(row[mapping[key]] ?? '').replace(/\s+/g, ' ').trim() : ''
    if (v && !parts.some((p) => p.includes(v))) parts.push(v)
  }
  return parts.length ? parts.join(' · ').slice(0, 500) : null
}

// The row's signed amount: Amount (minus a separate Fee), or Credit − Debit.
function signedAmount(row, mapping) {
  const dec = mapping.decimal
  if (mapping.amount) {
    const amount = parseAmount(row[mapping.amount], dec)
    const fee = mapping.fee ? parseAmount(row[mapping.fee], dec) : NaN
    return Number.isFinite(fee) ? amount - Math.abs(fee) : amount
  }
  if (mapping.debit || mapping.credit) {
    const debit = mapping.debit ? parseAmount(row[mapping.debit], dec) : NaN
    const credit = mapping.credit ? parseAmount(row[mapping.credit], dec) : NaN
    if (!Number.isFinite(debit) && !Number.isFinite(credit)) return NaN
    return (Number.isFinite(credit) ? Math.abs(credit) : 0) - (Number.isFinite(debit) ? Math.abs(debit) : 0)
  }
  return NaN
}

// Whether a positive amount means income for this file: the case when the
// file is a signed statement (no marker column, no debit/credit split) and
// actually has both signs — a list of positive amounts is a list of spending.
export function signedConvention(rows, mapping) {
  if (mapping.type || !mapping.amount) return false
  let neg = false
  let pos = false
  for (const r of rows) {
    const n = signedAmount(r, mapping)
    if (n < 0) neg = true
    else if (n > 0) pos = true
    if (neg && pos) return true
  }
  return false
}

// Derive a normalized transaction draft from one raw statement row + the column
// mapping. Returns { skip } for lines that aren't transactions (pending or
// declined, balance/summary lines, footers with neither date nor amount),
// { error } when a real-looking row lacks a valid date or a nonzero amount,
// otherwise the parsed fields plus the row's merchant name (see
// rowMerchantName; groupMerchants turns a file's names into keys). `signed`
// (see signedConvention) treats a positive amount as income. Shared by the import preview and the
// authoritative buildTransactions so the two can never derive a row differently.
export function rowToDraft(row, mapping, baseCurrency, { signed = false } = {}) {
  if (mapping.status && NOT_BOOKED.test(foldText(row[mapping.status]))) {
    return { skip: 'pending or declined' }
  }
  const amountRaw = signedAmount(row, mapping)
  const spent_at = parseDate(row[mapping.date], mapping.dateOrder)
  const description = describe(row, mapping)
  if (!spent_at && !Number.isFinite(amountRaw)) return { skip: 'not a transaction' }
  if (description && SUMMARY.test(foldText(description))) return { skip: 'balance line' }
  if (isOwnTransfer(row, mapping)) return { skip: 'own transfer' }
  if (!spent_at) return { error: 'missing/invalid date' }
  if (!Number.isFinite(amountRaw) || amountRaw === 0) return { error: 'missing/invalid amount' }

  // A blank currency cell means the base currency. An unknown code is an
  // error, not "base": booking ฿500 as €500 would silently corrupt totals.
  const rawCurrency = mapping.currency ? normalizeCurrency(row[mapping.currency]) : ''
  const currency = rawCurrency || baseCurrency
  if (!CURRENCIES.includes(currency)) return { error: `unsupported currency ${rawCurrency}` }

  let kind = 'expense'
  if (mapping.type) {
    if (directionOf(row[mapping.type]) === 'income') kind = 'income'
  } else if (!mapping.amount || signed) {
    if (amountRaw > 0) kind = 'income'
  }

  const cell = cellOf(row, mapping)
  return {
    spent_at, kind, currency, amountRaw,
    amount_minor: toMinor(Math.abs(amountRaw), currency), description,
    // The raw text columns, for the shorter label kbcLabels.displayDescription
    // saves; `description` stays the raw text duplicates and rules match on.
    cells: { counterparty: cell('counterparty'), description: cell('description'), details: cell('details') },
    merchant: rowMerchantName(row, mapping),
    rate: statementRate(row, mapping, amountRaw, currency, baseCurrency),
  }
}

// The exchange rate the statement itself used for a foreign row, when it
// also gives the amount in the base currency (mapping.baseAmount: the euro
// column of a Revolut non-euro account): base / amount, to the 8 places the
// ledger keeps. Null when the column is absent, zero, or in another currency
// — the ECB rate for the day is used then.
function statementRate(row, mapping, amountRaw, currency, baseCurrency) {
  if (!mapping.baseAmount || currency === baseCurrency) return null
  const cell = row[mapping.baseAmount]
  const base = parseAmount(cell, mapping.decimal)
  if (!base || !Number.isFinite(base) || normalizeCurrency(cell) !== baseCurrency) return null
  return Math.round(Math.abs(base / amountRaw) * 1e8) / 1e8
}

// The live preview under the mapping step: the first `limit` rows as they'd
// be saved, and how many rows are ready / skipped / unreadable — derived by
// the same rowToDraft + sign rule the import uses. With `categoryOf` (a
// categoryMatcher) each shown row carries the `category_id` it will get.
export function previewDrafts(rows, mapping, baseCurrency, { limit = 6, categoryOf } = {}) {
  const out = { rows: [], ready: 0, skipped: 0, ownTransfers: 0, errors: 0, firstError: null }
  if (!mapping.date || !(mapping.amount || mapping.debit || mapping.credit)) return out
  const signed = signedConvention(rows, mapping)
  rows.forEach((r, i) => {
    const d = rowToDraft(r, mapping, baseCurrency, { signed })
    if (d.skip === 'own transfer') { out.ownTransfers++; return }
    if (d.skip) { out.skipped++; return }
    if (d.error) {
      out.errors++
      out.firstError ??= { index: i, reason: d.error }
      return
    }
    out.ready++
    if (out.rows.length < limit) out.rows.push(categoryOf ? { ...d, category_id: categoryOf(d, r, mapping) } : d)
  })
  return out
}

// Statement rows the ledger already holds, whatever text they were saved
// with: a row is known when the account has an entry of the same kind, date,
// amount and currency, counted as a multiset (two identical coffees in the
// file against one in the account import exactly one). The deterministic id
// below catches a plain re-import; this also catches one made after the app
// reads a bank's text differently (a new description format gives the same
// line a new id). Group shares are left out: they aren't bank lines.
// Returns { rows (to save), known (how many were dropped) }.
const statementKey = (t) => `${t.kind}|${t.spent_at}|${Number(t.amount_minor)}|${t.currency}`
export function dropKnownRows(rows, existing) {
  const have = new Map()
  for (const t of existing) {
    if (t.group_expense_id) continue
    const k = statementKey(t)
    have.set(k, (have.get(k) ?? 0) + 1)
  }
  const kept = []
  let known = 0
  for (const t of rows) {
    const k = statementKey(t)
    const left = have.get(k) ?? 0
    if (left > 0) { have.set(k, left - 1); known++ } else kept.push(t)
  }
  return { rows: kept, known }
}

// Deterministic row identity: the same statement line always maps to the same
// client_uuid, so re-importing a file (or an overlapping export) never
// duplicates — the (user_id, client_uuid) unique constraint absorbs it. The
// SHA-256 is plain JavaScript (sha256.js), so the native app's engine gives a
// line the same id as the browser does.
export function deterministicUuid(parts) {
  const hash = sha256(parts.join('|'))
  hash[6] = (hash[6] & 0x0f) | 0x40 // uuid shape: version 4
  hash[8] = (hash[8] & 0x3f) | 0x80 // variant 10
  const hex = [...hash.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

// The first and last day among imported drafts (spent_at, YYYY-MM-DD), or
// null when there are none: the done step says when the entries are dated and
// opens Transactions on that range — a statement from earlier months would
// otherwise look like nothing was imported, since lists open on this month.
export function importedRange(drafts) {
  let from = null
  let to = null
  for (const d of drafts ?? []) {
    const day = d?.spent_at
    if (!day) continue
    if (!from || day < from) from = day
    if (!to || day > to) to = day
  }
  return from ? { from, to } : null
}
