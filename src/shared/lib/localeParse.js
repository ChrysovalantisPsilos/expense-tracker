// Locale-tolerant parsing of money and dates written by banks and printed on
// receipts in EN/FR/NL/EL. Shared by the statement importer and the receipt
// scanner so both read "1.234,56", "12,50-" or "21 Ιουλ 2026" the same way.
// Pure module: no DOM, no Supabase.
import { CURRENCIES } from './currency.js'

// ---------------------------------------------------------------- amounts

// Currency symbols and codes that may surround an amount.
const CURRENCY_NOISE = new RegExp(`[€$£¥₺₹₩]|\\b(?:${CURRENCIES.join('|')}|euros?)\\b`, 'gi')
// Spaces (incl. NBSP / thin) and apostrophes used as grouping in "1 234,56" / "1'234.56".
const GROUP_SPACES = /[\s\u00a0\u202f']/g

// Parse one amount string. Handles "-12,50", "12,50-", "(12.50)", "+3.00",
// "€ 1.234,56", "1,234.56 EUR", "12.50 DR"/"CR". `decimal` (',' or '.') pins
// the decimal separator when the caller knows it (e.g. from the whole column);
// without it the last separator followed by 1–2 digits is the decimal one.
// Anything that isn't clearly a number (text, an IBAN, a date) is NaN — a
// footer line like "Account GR12 3456…" must never become an amount.
export function parseLocaleAmount(input, decimal) {
  if (input == null) return NaN
  let s = String(input).trim()
  if (!s) return NaN
  let negative = false
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1) }
  // Trailing debit/credit marker: DR/CR, D/C, or Greek Χ(ρέωση)/Π(ίστωση).
  const drcr = /\s*(?:\b(DR|CR|D|C)|(Χ|Π))\.?$/iu.exec(s)
  if (drcr && /\d/.test(s.slice(0, drcr.index))) {
    negative = /^[DΧ]/i.test(drcr[1] ?? drcr[2])
    s = s.slice(0, drcr.index)
  }
  s = s.replace(CURRENCY_NOISE, '').replace(GROUP_SPACES, '')
  if (/^[-−–]/.test(s)) { negative = !negative; s = s.slice(1) } else if (s.startsWith('+')) s = s.slice(1)
  if (/[-−–]$/.test(s)) { negative = !negative; s = s.slice(0, -1) }
  if (!/^(\d[\d.,]*|[.,]\d+)$/.test(s)) return NaN

  let dec = decimal ?? guessDecimal(s)
  const other = dec === ',' ? '.' : ','
  // A lone "12.50" in a comma-decimal column (or "12,50" in a dot one) is
  // still twelve-fifty: one separator with 1–2 digits after it is decimal.
  if (!s.includes(dec) && new RegExp(`^\\d+\\${other}\\d{1,2}$`).test(s)) dec = other
  s = s.split(dec === ',' ? '.' : ',').join('')
  if (s.split(dec).length > 2) return NaN
  s = s.replace(dec, '.')
  const n = Number(s)
  if (!Number.isFinite(n)) return NaN
  return negative ? -n : n
}

// The decimal separator of a single number string, or '.' when there is none.
function guessDecimal(s) {
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma === -1 && lastDot === -1) return '.'
  if (lastComma !== -1 && lastDot !== -1) return lastComma > lastDot ? ',' : '.'
  const sep = lastComma !== -1 ? ',' : '.'
  // One occurrence is a decimal point ("12,5", "1.234"); several are grouping.
  return s.split(sep).length === 2 ? sep : (sep === ',' ? '.' : ',')
}

// ------------------------------------------------------------------ dates

// Month names and abbreviations, accent- and case-folded (see foldText).
// English, French, Dutch and Greek (incl. genitive forms used in dates).
const MONTHS = [
  ['jan', 'january', 'janv', 'janvier', 'januari', 'ιαν', 'ιανουαριοσ', 'ιανουαριου'],
  ['feb', 'february', 'fev', 'fevr', 'fevrier', 'februari', 'φεβ', 'φεβρουαριοσ', 'φεβρουαριου'],
  ['mar', 'march', 'mars', 'maart', 'mrt', 'μαρ', 'μαρτιοσ', 'μαρτιου'],
  ['apr', 'april', 'avr', 'avril', 'απρ', 'απριλιοσ', 'απριλιου'],
  ['may', 'mai', 'mei', 'μαι', 'μαιοσ', 'μαιου'],
  ['jun', 'june', 'juin', 'juni', 'ιουν', 'ιουνιοσ', 'ιουνιου'],
  ['jul', 'july', 'juil', 'juillet', 'juli', 'ιουλ', 'ιουλιοσ', 'ιουλιου'],
  ['aug', 'august', 'aout', 'augustus', 'αυγ', 'αυγουστοσ', 'αυγουστου'],
  ['sep', 'sept', 'september', 'septembre', 'σεπ', 'σεπτ', 'σεπτεμβριοσ', 'σεπτεμβριου'],
  ['oct', 'october', 'octobre', 'okt', 'oktober', 'οκτ', 'οκτωβριοσ', 'οκτωβριου'],
  ['nov', 'november', 'novembre', 'νοε', 'νοεμβριοσ', 'νοεμβριου'],
  ['dec', 'december', 'decembre', 'δεκ', 'δεκεμβριοσ', 'δεκεμβριου'],
]
const MONTH_BY_NAME = new Map(MONTHS.flatMap((names, i) => names.map((n) => [n, i + 1])))

// Lowercase, strip accents/tonos, final sigma → sigma: "Ιούλ." → "ιουλ.".
export function foldText(s) {
  return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/ς/g, 'σ')
}

// 1–12 for a month name/abbreviation in any supported language, else null.
export function monthNumber(word) {
  return MONTH_BY_NAME.get(foldText(word).replace(/\.$/, '')) ?? null
}

// A regex alternation of every month word (folded), longest first.
export const MONTH_WORDS = [...MONTH_BY_NAME.keys()].sort((a, b) => b.length - a.length).join('|')

// "YYYY-MM-DD" when y/m/d is a real calendar day, else null. Two-digit years
// are 20xx.
export function ymd(y, m, d) {
  const year = y < 100 ? 2000 + y : y
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && year >= 1900 && year <= 2100)) return null
  const check = new Date(year, m - 1, d)
  if (check.getMonth() !== m - 1 || check.getDate() !== d) return null
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
