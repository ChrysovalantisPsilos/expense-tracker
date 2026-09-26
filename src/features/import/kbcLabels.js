// Shorter descriptions for KBC/CBC statement rows (pure, unit-tested). KBC
// writes the whole operation into its description column: "PAYMENT VIA
// BANCONTACT 06-01-2026 AT 10.54 TIME LIDL 1153 LEUVEN BE3000 LEUVEN WITH KBC
// DEBIT CARD 5127 88XX XXXX 1234 CARDHOLDER: DOE JANE". An imported entry is
// saved with a readable label instead — "Lidl · Leuven" — keeping the
// merchant or counterparty and the town, and the free message of a transfer.
//
// Only the SAVED description changes. The raw text stays what everything
// that matches works on: the duplicate check (the row's deterministic id is
// built from it, so re-importing a file imported before this change still
// finds its rows), the saved import rules and the "New merchants" keys
// (importMath). A row this module doesn't recognise keeps its raw text.
//
// Recognised (NL/FR/EN, as KBC writes them): card payments, cash withdrawals
// and deposits, transfers in and out, direct debits (domiciliations), and the
// bank's own fees and card settlements.
import { descriptionParts } from './importMath.js'

const LABEL_MAX = 120

const CARD = /^(?:PAYMENT|BETALING|PAIEMENT) VIA\b/
const CASH_OUT = /^(?:CASH WITHDRAWAL|GELDOPNEMING|GELDOPNAME|RETRAIT)\b/
const CASH_IN = /^(?:CASH DEPOSIT|DEPOSIT OF CASH|STORTING|VERSEMENT|D[EÉ]P[OÔ]T)\b/
const DIRECT_DEBIT = /^(?:EUROPESE DOMICILIERING|DOMICILIERING|EUROPEAN DIRECT DEBIT|DIRECT DEBIT|DOMICILIATION(?: EUROP[EÉ]ENNE)?)\b/
const TRANSFER = /^(?:EUROPESE OVERSCHRIJVING|INSTANTOVERSCHRIJVING|OVERSCHRIJVING|DOORLOPENDE BETALINGSOPDRACHT|SENDING MONEY|RECEIVING MONEY|EUROPEAN (?:CREDIT )?TRANSFER|VIREMENT)\b/
const CARD_SETTLEMENT = /^(?:SETTLEMENT|AFREKENING|D[EÉ]COMPTE)\b.*\b(?:CREDIT ?CARD|KREDIETKAART|CARTE DE CR[EÉ]DIT)\b/
const ACCOUNT_FEE = /^(?:BIJDRAGE|CONTRIBUTION|COTISATION)\b/
const FEES = /^(?:KOSTEN|AFREKENING KOSTEN|FRAIS|CHARGES|FEES)\b/
// The bank's own lines name it ("KBC-PLUSREKENING", "SETTLEMENT KBC CREDIT CARD").
const OWN_BANK = /\b(?:KBC|CBC)\b/
// The bank's account product in a fee line: "KBC-PLUSREKENING".
const PRODUCT = /\b(?:KBC|CBC)-[\p{L}-]+/u
// Everything up to a line's last date ("19-01-2026", "31-12"), for the town
// that follows it on a deposit line without a card: "… 19-01-2026 KBC LEUVEN".
const UP_TO_DATE = /^.*\b\d{2}-\d{2}(?:-\d{4})?\b/
const BANK_WORDS = new Set(['KBC', 'CBC', 'CONTANTEN', 'CASH', 'ESPECES', 'ESPÈCES', 'IN', 'EN', 'EURO', 'EUR', 'OF'])

const VOWELS = /[AEIOUYÀ-ÖØ-ÝΑΕΗΙΟΥΩΆΈΉΊΌΎΏ]/i

// "LIDL" → "Lidl", "K. DE SMET" → "K. De Smet", "KBC-PLUSREKENING" →
// "KBC-Plusrekening": each word's first letter kept upper, the rest lower,
// except a word without a vowel, which reads as an abbreviation ("KBC",
// "AMZN MKTP").
export function titleCase(text) {
  return String(text ?? '').trim().split(/\s+/).filter(Boolean).map((word) => word.split('-').map((part) => {
    if (!VOWELS.test(part) && /^\p{L}{2,}$/u.test(part)) return part.toUpperCase()
    return part.toLowerCase().replace(/(^|[.'’])(\p{L})/gu, (_, before, letter) => before + letter.toUpperCase())
  }).join('-')).join(' ')
}

const joinParts = (...parts) => parts.filter(Boolean).join(' · ').slice(0, LABEL_MAX)

// The town printed after a line's last date, without the bank's own words.
function townAfterDate(text) {
  const rest = text.replace(UP_TO_DATE, '')
  if (rest === text) return ''
  return rest.split(' ').filter((w) => w && !BANK_WORDS.has(w) && !/\d/.test(w)).join(' ')
}

// The short label for a KBC statement row (a draft from importMath's
// rowToDraft: its raw `cells` and `kind`), or null when the row isn't one of
// KBC's recognised shapes.
export function kbcLabel({ cells = {}, kind } = {}) {
  const text = String(cells.description ?? '').toUpperCase().replace(/\s+/g, ' ').trim()
  if (!text) return null
  const parts = descriptionParts(text)
  const counterparty = String(cells.counterparty ?? '').trim()
  const message = String(cells.details ?? '').replace(/\s+/g, ' ').trim()

  if (CASH_OUT.test(text) || CASH_IN.test(text)) {
    const town = parts.card?.town || townAfterDate(text)
    return joinParts(CASH_OUT.test(text) ? 'Cash withdrawal' : 'Cash deposit', titleCase(town))
  }
  // A card line without KBC's time stamp names the shop in the counterparty column.
  if (CARD.test(text) && !parts.card) return counterparty ? titleCase(counterparty).slice(0, LABEL_MAX) : null
  if (CARD.test(text)) {
    const merchant = parts.card.name || parts.card.segment.replace(/\s*\b\S*\d\S*\b/g, '')
    if (!merchant) return null
    const town = titleCase(parts.card.town)
    const name = titleCase(merchant)
    return joinParts(name, town.toUpperCase() === name.toUpperCase() ? '' : town)
  }
  // Without the other party the raw text is kept: it may be all there is.
  if (DIRECT_DEBIT.test(text)) {
    const creditor = parts.creditor || counterparty
    return creditor ? joinParts(titleCase(creditor), 'Direct debit') : null
  }
  if (TRANSFER.test(text)) {
    const party = counterparty || parts.party
    return party ? joinParts(`Transfer ${kind === 'income' ? 'from' : 'to'} ${titleCase(party)}`, message) : null
  }
  if (!OWN_BANK.test(text)) return null
  if (CARD_SETTLEMENT.test(text)) return 'Credit card settlement'
  if (ACCOUNT_FEE.test(text)) return joinParts('Account fee', titleCase(PRODUCT.exec(text)?.[0] ?? ''))
  if (FEES.test(text)) return 'Bank fees'
  return null
}

// The description an imported row is saved with: KBC's short label when the
// row is one of its shapes, else the raw description (counterparty · text ·
// details) as before.
export const displayDescription = (draft) => kbcLabel(draft) ?? draft.description ?? null
