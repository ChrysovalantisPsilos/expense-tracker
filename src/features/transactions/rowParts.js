// What a transaction row in a list says (TransactionList, and the native
// app's lists): its title, the parts of the muted line under it, the amount
// with its sign and tone, and a foreign amount's value in the base currency.
// Pure, in the app's language; unit-tested in test/rowParts.test.js.
import { baseEquivalent, formatMoney, formatSigned, rateText, toBaseMinor } from '../../shared/lib/currency.js'
import { signedAmount } from '../../shared/ui/kit/kitMath.js'
import { rowEffect } from '../../shared/lib/savings.js'
import { netBaseMinor } from './txnFilter.js'
import { isoDate, shortDate } from '../../shared/lib/dates.js'
import { groupLabel } from '../../shared/lib/txnRollup.js'
import { monthlyShare } from '../../shared/lib/spread.js'
import { countsForLabel } from '../../shared/lib/salaryShift.js'
import { savingsNoteLabel } from '../../shared/lib/savings.js'
import { categoryDisplayName, entryName } from '../../shared/lib/categoryName.js'
import { categoryLook } from '../../shared/lib/categoryStyle.js'
import { t } from '../../shared/lib/i18n/i18n.js'
import { frequencyLabel } from '../recurring/recurringMath.js'

// `kind` is the list's (a row without its own kind takes it); `salaryShift`
// and `savingsIds` are the user's (salaryShiftOf, savingsIdsOf).
//   title      its description, else its category's name, else Expense/Income
//   shared     a group's share (read-only here: edited in the group)
//   kind       'income' | 'expense' (what its styling follows)
//   look       its category's badge (categoryLook)
//   meta       the muted line's start, in order: the date, the category
//              (when the title is the description), where savings came from
//   notes      the notes, next on that line (in italics)
//   group      the group's tag on a share
//   repeats    "Repeats every month" (with "(paused)"), for a rule's entry
//   spread     a yearly payment's "€8.00/month over 12 months" (≈ when uneven)
//   countsFor  a late salary's "Counts for October"
//   amount     signed: income with a plus; `tone` positive for income
//   approx     a foreign amount in the base currency ("≈ €9.00"), with its
//              `rate` and whether the rate is `estimated` on this device
export function rowParts(row, { kind, baseCurrency, salaryShift = null, savingsIds = new Set() }) {
  const rk = (row.kind ?? kind) === 'income' ? 'income' : 'expense'
  const shared = !!row.group_expense_id
  const conv = baseEquivalent(row.amount_minor, row.exchange_rate, row.currency, baseCurrency)
  const share = monthlyShare(row)
  const category = row.description && row.categories?.name ? categoryDisplayName(row.categories) : null
  const saved = savingsNoteLabel(row, savingsIds)
  return {
    id: row.id,
    title: entryName(row, t(`transactions:kinds.${rk}`)),
    shared,
    kind: rk,
    look: categoryLook(row.categories, rk),
    meta: [shortDate(row.spent_at), category, saved].filter(Boolean),
    notes: row.notes || null,
    group: shared ? groupLabel(row) : null,
    repeats: row.recurring
      ? `${t('transactions:list.repeats', { frequency: frequencyLabel(row.recurring) })}${
        row.recurring.is_active ? '' : ` ${t('transactions:list.paused')}`}`
      : null,
    spread: share
      ? `${share.exact ? '' : '≈ '}${t('transactions:list.spread', { amount: formatMoney(share.perMonth, row.currency), months: share.months })}`
      : null,
    countsFor: countsForLabel(row, salaryShift),
    amount: formatSigned(row.amount_minor, row.currency, { plus: rk === 'income' }),
    tone: rk === 'income' ? 'positive' : 'default',
    approx: conv ? t('transactions:list.approx', { amount: formatMoney(conv.baseMinor, baseCurrency) }) : null,
    rate: conv ? rateText(conv.rate) : null,
    estimated: conv && row.rate_estimated ? t('transactions:list.estimated') : null,
  }
}

// Every row of a list, with the same options.
export const listParts = (rows, options) => rows.map((row) => rowParts(row, options))

// A day's heading: "Today", "Yesterday", else its short date ("21 Sep").
// Days are local 'YYYY-MM-DD' strings, like `todayISO`.
const localDay = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function dayTitle(day, todayISO) {
  const [y, m, d] = String(todayISO).split('-').map(Number)
  if (day === todayISO) return t('transactions:ledger.today')
  if (day === isoDate(new Date(y, m - 1, d - 1))) return t('transactions:ledger.yesterday')
  return shortDate(day, new Date(y, m - 1, d))
}

// A list's rows by day, newest day first (the native app's Activity): each
// day's heading (dayTitle), what was spent that day in the base currency
// ("€45.55 spent", null without an expense), and its rows (rowParts,
// without the date the heading already says).
export function dayGroups(rows, options, todayISO) {
  const sorted = [...(rows ?? [])].sort((a, b) => String(b.spent_at).localeCompare(String(a.spent_at)))
  const days = []
  for (const row of sorted) {
    const key = String(row.spent_at ?? '').slice(0, 10)
    const last = days[days.length - 1]
    if (last && last.key === key) last.rows.push(row)
    else days.push({ key, rows: [row] })
  }
  return days.map(({ key, rows: list }) => {
    const spent = list
      .filter((r) => (r.kind ?? options.kind) !== 'income')
      .reduce((sum, r) => sum + toBaseMinor(r.amount_minor, r.exchange_rate ?? 1, r.currency, options.baseCurrency), 0)
    return {
      key,
      title: dayTitle(key, todayISO),
      spent: spent > 0 ? t('transactions:ledger.daySpent', { amount: formatMoney(spent, options.baseCurrency) }) : null,
      rows: list.map((row) => {
        const parts = rowParts(row, options)
        return { ...parts, meta: row.spent_at ? parts.meta.slice(1) : parts.meta }
      }),
    }
  })
}

// The days of a month ({ from, to }, local 'YYYY-MM-DD'), in order.
function monthDays({ from, to }) {
  const [y, m, d] = String(from).split('-').map(Number)
  const days = []
  for (let i = 0; i < 31 && y; i++) {
    const key = isoDate(new Date(y, m - 1, d + i))
    if (key > to) break
    days.push(key)
  }
  return days
}

// A month at a glance (the native app's Activity header) over the rows the
// list shows: what was spent (as dayGroups counts it: every row that isn't
// income) and what came in (income, not savings), each worded with its
// label, the net in its tone (All only), and one bar per day of `month`
// ({ from, to }): the day's amount of the list's kind (income for Income,
// spending otherwise) as a share of the biggest day's (`bar`, 0…1), and
// whether the day is today or still ahead. `peak` words the biggest day. `month` null
// (a search over all history): no days.
export function monthPulse(rows, { kind, baseCurrency, savingsIds = new Set() }, month, todayISO) {
  const list = rows ?? []
  const base = (r) => toBaseMinor(r.amount_minor, r.exchange_rate ?? 1, r.currency, baseCurrency)
  const isIncome = (r) => (r.kind ?? kind) === 'income'
  const counts = kind === 'income'
    ? (r) => isIncome(r) && rowEffect(r, savingsIds) === 'income'
    : (r) => !isIncome(r)
  const spent = list.filter((r) => !isIncome(r)).reduce((sum, r) => sum + base(r), 0)
  const earned = list.filter((r) => isIncome(r) && rowEffect(r, savingsIds) === 'income').reduce((sum, r) => sum + base(r), 0)
  const money = (minor) => formatMoney(minor, baseCurrency)
  const byDay = new Map()
  for (const r of list) {
    if (!counts(r)) continue
    const key = String(r.spent_at ?? '').slice(0, 10)
    byDay.set(key, (byDay.get(key) ?? 0) + base(r))
  }
  const keys = month ? monthDays(month) : []
  const peakKey = [...byDay.entries()].filter(([key]) => keys.includes(key))
    .reduce((best, entry) => (!best || entry[1] > best[1] ? entry : best), null)
  const most = peakKey?.[1] ?? 0
  const days = keys.map((key) => ({
    key,
    label: String(Number(key.slice(8))),
    bar: most > 0 ? (byDay.get(key) ?? 0) / most : 0,
    today: key === todayISO,
    future: key > todayISO,
  }))
  return {
    spent: kind === 'income' ? null : { label: t('dashboard:overview.spent'), amount: money(spent) },
    income: kind === 'expense' ? null
      : { label: t('dashboard:overview.income'), amount: formatSigned(earned, baseCurrency, { plus: true }) },
    net: kind ? null
      : { label: t('dashboard:overview.net'), ...signedAmount(netBaseMinor(list, baseCurrency, savingsIds), money) },
    days,
    peak: peakKey && most > 0
      ? t(kind === 'income' ? 'ios:native.activity.peakIncome' : 'ios:native.activity.peak', {
        day: shortDate(peakKey[0], localDay(todayISO)), amount: money(most),
      })
      : null,
  }
}
