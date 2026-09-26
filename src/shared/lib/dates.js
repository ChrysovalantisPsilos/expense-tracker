import { getLanguage, intlLocale } from './i18n/i18n.js'

// Date helpers. All app dates are YYYY-MM-DD strings in the user's LOCAL
// calendar. Never format a local date with toISOString(): that converts to UTC,
// which is the previous day east of UTC (e.g. local midnight 1 Sep in Belgium is
// 31 Aug 22:00 UTC), shifting month ranges and budget keys by a day.

const pad2 = (n) => String(n).padStart(2, '0')

export const isoDate = (d = new Date()) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

export const today = () => isoDate(new Date())

// First/last day of a month as { from, to } YYYY-MM-DD strings.
export function monthRange(d = new Date()) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1)
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return { from: isoDate(start), to: isoDate(end) }
}

// A month as a heading, e.g. "September 2026" ("Σεπτέμβριος 2026").
export const monthTitle = (d = new Date()) =>
  d.toLocaleDateString(intlLocale('en-US'), { month: 'long', year: 'numeric' })

// A month's name on its own, e.g. "September". Taken from the month-and-year
// form: Greek then gets the nominative "Σεπτέμβριος" (month-only formatting
// gives the genitive "Σεπτεμβρίου", as in "26 Σεπτεμβρίου").
export function monthName(d = new Date()) {
  return new Intl.DateTimeFormat(intlLocale('en-US'), { month: 'long', year: 'numeric' })
    .formatToParts(d).find((p) => p.type === 'month').value
}

// The last `n` calendar months, oldest → newest, each as
// { key: 'YYYY-MM', label: 'Jan', from, to }.
export function lastMonths(n, d = new Date()) {
  const out = []
  for (let i = n - 1; i >= 0; i--) {
    const start = new Date(d.getFullYear(), d.getMonth() - i, 1)
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0)
    out.push({
      key: isoDate(start).slice(0, 7),
      label: start.toLocaleDateString(intlLocale('en-US'), { month: 'short' }),
      from: isoDate(start), to: isoDate(end),
    })
  }
  return out
}

// Fixed month abbreviations per language: toLocaleDateString('en-GB')
// renders September as "Sept" on newer ICU builds, so it isn't stable across
// devices. Greek: ICU's own short forms ("26 Σεπ 2026").
const MONTHS_SHORT = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  el: ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαΐ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'],
}

// A month's short name (0 = January) in the app's language.
export const shortMonth = (m) => (MONTHS_SHORT[getLanguage()] ?? MONTHS_SHORT.en)[m]

const dayMonth = (y, m, d, now) =>
  `${d} ${shortMonth(m)}${y === now.getFullYear() ? '' : ` ${y}`}`

// A list-row date: "21 Sep", or "21 Sep 2025" outside the current year.
// Takes a YYYY-MM-DD string (a timestamp's date part is used as-is); falls
// back to the input for anything it can't read.
export function shortDate(iso, now = new Date()) {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  if (!y || !(m >= 1 && m <= 12) || !d) return String(iso)
  return dayMonth(y, m - 1, d, now)
}

// A timestamp in local time: "21 Sep, 14:05" (year added outside this year).
export function shortDateTime(ts, now = new Date()) {
  const t = new Date(ts)
  if (Number.isNaN(t.getTime())) return ''
  const hm = [t.getHours(), t.getMinutes()].map((n) => String(n).padStart(2, '0')).join(':')
  return `${dayMonth(t.getFullYear(), t.getMonth(), t.getDate(), now)}, ${hm}`
}
