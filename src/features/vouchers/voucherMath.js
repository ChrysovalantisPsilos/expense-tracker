// Meal vouchers (pure, no I/O): the working days a month's top-up pays for,
// the top-ups since setup, what's on the card, and the next top-up.
//
// The settings are one document per account (0097, my_meal_vouchers):
//   { v: 1, country: 'BE' | 'GR', per_day_minor, currency, topup_day (1–31),
//     start_on: 'YYYY-MM-DD', start_balance_minor, days: { 'YYYY-MM': n } }
// start_on / start_balance_minor are what was on the card when the user last
// saved the setup ("On your card today"); every save starts again from there,
// so a new amount per day never rewrites past top-ups. `days` holds the
// months the user fixed ("Fix days": leave, sick days).
//
// A top-up lands on topup_day each month (the month's last day when it's
// shorter: 31 → 30 Sep, 28 Feb) and pays for the working days of the month
// before (Mon–Fri minus the country's public holidays). Top-ups
// after start_on count; so do expenses paid with vouchers dated start_on or
// later. Dates are local calendar strings ('YYYY-MM-DD'); the maths runs in
// UTC so the time zone never moves a day.
import { minorToInput, toBaseMinor, toMinor } from '../../shared/lib/currency.js'

export const COUNTRIES = ['BE', 'GR']
const MAX_TOPUP_DAY = 31

const pad = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
const utc = (y, m, d) => new Date(Date.UTC(y, m - 1, d))
const plusDays = (d, n) => new Date(d.getTime() + n * 86400000)

// Western Easter Sunday (the anonymous Gregorian computus).
export function westernEaster(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const n = h + l - 7 * m + 114
  return utc(year, Math.floor(n / 31), (n % 31) + 1)
}

// Orthodox Easter Sunday: the Julian computus, moved to the Gregorian
// calendar (+13 days, right for 1900–2099).
export function orthodoxEaster(year) {
  const d = (19 * (year % 19) + 15) % 30
  const e = (2 * (year % 4) + 4 * (year % 7) - d + 34) % 7
  const n = d + e + 114
  return plusDays(utc(year, Math.floor(n / 31), (n % 31) + 1), 13)
}

// The nationwide public holidays of a year, as 'YYYY-MM-DD'.
export function publicHolidays(country, year) {
  const fixed = (list) => list.map(([m, d]) => iso(utc(year, m, d)))
  if (country === 'GR') {
    const easter = orthodoxEaster(year)
    return new Set([
      ...fixed([[1, 1], [1, 6], [3, 25], [5, 1], [8, 15], [10, 28], [12, 25], [12, 26]]),
      // Clean Monday, Good Friday, Easter Monday, Whit Monday.
      ...[-48, -2, 1, 50].map((n) => iso(plusDays(easter, n))),
    ])
  }
  const easter = westernEaster(year)
  return new Set([
    ...fixed([[1, 1], [5, 1], [7, 21], [8, 15], [11, 1], [11, 11], [12, 25]]),
    // Easter Monday, Ascension, Whit Monday.
    ...[1, 39, 50].map((n) => iso(plusDays(easter, n))),
  ])
}

// Mon–Fri in a month ('YYYY-MM'), minus the country's public holidays.
export function workingDays(country, month) {
  const [y, m] = month.split('-').map(Number)
  const holidays = publicHolidays(country, y)
  let n = 0
  for (let d = utc(y, m, 1); d.getUTCMonth() === m - 1; d = plusDays(d, 1)) {
    const wd = d.getUTCDay()
    if (wd !== 0 && wd !== 6 && !holidays.has(iso(d))) n += 1
  }
  return n
}

// 'YYYY-MM' n months from `month`.
export function addMonths(month, n) {
  const [y, m] = month.split('-').map(Number)
  const d = utc(y, m + n, 1)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`
}

// The days a month's top-up pays for: the user's fix, else the calendar's.
export function daysFor(settings, month) {
  const auto = workingDays(settings.country, month)
  const fixed = settings.days?.[month]
  return Number.isInteger(fixed) ? { days: fixed, auto, fixed: true } : { days: auto, auto, fixed: false }
}

// The top-up landing in `month` ('YYYY-MM'): on topup_day (or the month's
// last day), for the month before.
function topUpIn(settings, month) {
  const worked = addMonths(month, -1)
  const { days, auto, fixed } = daysFor(settings, worked)
  const [y, m] = month.split('-').map(Number)
  const day = Math.min(settings.topup_day, new Date(Date.UTC(y, m, 0)).getUTCDate())
  return { on: `${month}-${pad(day)}`, month: worked, days, auto, fixed, amount_minor: days * settings.per_day_minor }
}

// Every top-up after start_on up to and including `today`, newest first.
export function topUpsSince(settings, today) {
  const out = []
  for (let month = settings.start_on.slice(0, 7); ; month = addMonths(month, 1)) {
    const t = topUpIn(settings, month)
    if (t.on > today) break
    if (t.on > settings.start_on) out.push(t)
  }
  return out.reverse()
}

// The date the setup form shows for the top-up day (a calendar picks a
// date; its day repeats every month): the next top-up, or with no setup yet
// the 1st of next month.
export function firstTopUpDate(settings, today) {
  return settings ? nextTopUp(settings, today).on : `${addMonths(today.slice(0, 7), 1)}-01`
}

// The next top-up after `today`.
export function nextTopUp(settings, today) {
  const month = today.slice(0, 7)
  const t = topUpIn(settings, month)
  return t.on > today ? t : topUpIn(settings, addMonths(month, 1))
}

// An expense paid with vouchers, in the vouchers' currency.
const spendMinor = (row, currency) => (row.currency === currency
  ? Number(row.amount_minor)
  : toBaseMinor(row.amount_minor, row.exchange_rate, row.currency, currency))

// The expenses that come off the card: paid with vouchers, dated start_on or later.
const cardSpends = (settings, rows) =>
  (rows ?? []).filter((r) => r.kind === 'expense' && r.paid_with_vouchers === true && r.spent_at >= settings.start_on)

// What's on the card today, and this month's top-ups and spending.
export function voucherSummary(settings, rows, today) {
  const tops = topUpsSince(settings, today)
  const spends = cardSpends(settings, rows)
  const month = today.slice(0, 7)
  const inMonth = (on) => on.slice(0, 7) === month
  const sum = (list, f) => list.reduce((s, x) => s + f(x), 0)
  const spent = (list) => sum(list, (r) => spendMinor(r, settings.currency))
  return {
    balance: settings.start_balance_minor + sum(tops, (t) => t.amount_minor) - spent(spends),
    monthTopUps: sum(tops.filter((t) => inMonth(t.on)), (t) => t.amount_minor),
    monthSpent: spent(spends.filter((r) => inMonth(r.spent_at))),
  }
}

// The card's history since start_on, newest first, grouped by month:
// [{ month: 'YYYY-MM', net, items: [{ type: 'topup' | 'spend' | 'start', on, minor, … }] }].
export function voucherHistory(settings, rows, today) {
  const items = [
    ...topUpsSince(settings, today).map((t) => ({ type: 'topup', on: t.on, minor: t.amount_minor, days: t.days, month: t.month })),
    ...cardSpends(settings, rows).map((r) => ({ type: 'spend', on: r.spent_at, minor: -spendMinor(r, settings.currency), row: r })),
    { type: 'start', on: settings.start_on, minor: settings.start_balance_minor },
  ].sort((a, b) => (a.on === b.on ? ORDER[a.type] - ORDER[b.type] : a.on < b.on ? 1 : -1))
  const groups = []
  for (const item of items) {
    const month = item.on.slice(0, 7)
    let g = groups[groups.length - 1]
    if (!g || g.month !== month) groups.push(g = { month, net: 0, items: [] })
    g.items.push(item)
    if (item.type !== 'start') g.net += item.minor
  }
  return groups
}
// On the same day: spending above the top-up, the starting balance last.
const ORDER = { spend: 0, topup: 1, start: 2 }

// A setup ready to save: the fields the form edits, starting again today
// from what's on the card. Fixed days are kept for the months a coming
// top-up can still pay for (last month on); older ones are done with.
export function newSettings({ country, per_day_minor, currency, topup_day, balance_minor }, previous, today) {
  const from = addMonths(today.slice(0, 7), -1)
  const days = Object.fromEntries(Object.entries(previous?.days ?? {}).filter(([m]) => m >= from))
  return {
    v: 1, country, per_day_minor, currency, topup_day,
    start_on: today, start_balance_minor: balance_minor, days,
  }
}

// Settings → Meal vouchers' form as it opens: whether vouchers are on, the
// amount per day, whose working days, the next top-up's date (firstTopUpDate)
// and what's on the card now (never below zero), in the setup's currency (the
// base one for a new setup).
export function setupDraft(settings, balanceMinor, baseCurrency, today) {
  const currency = settings?.currency ?? baseCurrency
  return {
    on: !!settings,
    perDay: settings ? minorToInput(settings.per_day_minor, currency) : '',
    country: settings?.country ?? 'BE',
    topUpOn: firstTopUpDate(settings, today),
    onCard: minorToInput(Math.max(balanceMinor, 0), currency),
    currency,
  }
}

// The form ready to save: { settings: null } turns vouchers off,
// { missing: true } while it's on without an amount per day, else
// { settings } (newSettings: the top-up's day from its date, the card counted
// on from today).
export function setupToSave(form, previous, today) {
  if (!form.on) return { settings: null }
  const perDayMinor = Number(form.perDay) > 0 ? toMinor(form.perDay, form.currency) : 0
  if (perDayMinor <= 0) return { missing: true }
  return {
    settings: newSettings({
      country: form.country, per_day_minor: perDayMinor, currency: form.currency,
      topup_day: Number(form.topUpOn.slice(8, 10)),
      balance_minor: Number(form.onCard) > 0 ? toMinor(form.onCard, form.currency) : 0,
    }, previous, today),
  }
}

// The settings with one month's days fixed; the calendar's own count
// removes the fix.
export function withDays(settings, month, days) {
  const next = { ...(settings.days ?? {}) }
  if (days === workingDays(settings.country, month)) delete next[month]
  else next[month] = days
  return { ...settings, days: next }
}

// A setup from outside (a backup file) in the server's shape
// (meal_vouchers_check), or null when it isn't one. Fixed days that don't
// fit are dropped (the latest 24 kept).
export function normaliseSettings(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const whole = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi
  const { country, per_day_minor, currency, topup_day, start_on, start_balance_minor, days } = raw
  const realDate = typeof start_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(start_on)
    && iso(new Date(`${start_on}T00:00:00Z`)) === start_on
  if (!COUNTRIES.includes(country) || !whole(per_day_minor, 1, 9999999) || !/^[A-Z]{3}$/.test(currency ?? '')
    || !whole(topup_day, 1, MAX_TOPUP_DAY) || !realDate || !whole(start_balance_minor, 0, 999999999999)) return null
  const fixed = Object.entries(days && typeof days === 'object' && !Array.isArray(days) ? days : {})
    .filter(([m, n]) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m) && whole(n, 0, 31)).sort().slice(-24)
  return { v: 1, country, per_day_minor, currency, topup_day, start_on, start_balance_minor, days: Object.fromEntries(fixed) }
}
