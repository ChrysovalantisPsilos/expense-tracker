import { toBaseMinor, minorFactor, formatMoney, formatRoundedMoney } from '../../shared/lib/currency.js'
import { isoDate, monthTitle } from '../../shared/lib/dates.js'
import { t } from '../../shared/lib/i18n/i18n.js'
import { rowEffect, potSign } from '../../shared/lib/savings.js'
import { MARK_ARCS } from '../../shared/ui/markGeometry.js'

// The Savings page's pure maths. Which entries move the pot, and which way,
// is decided in one place only — shared/lib/savings.js (rowEffect, potSign);
// everything here builds on it and never re-derives the rules. Amounts are
// integer minor units in the base currency, each row at its captured rate
// (toBaseMinor), exactly like net worth's Savings line.

// Does this row move the pot? Savings entries (both kinds) and expenses paid
// from savings; everything else leaves it alone.
export const touchesSavings = (row, savingsIds) => potSign(rowEffect(row, savingsIds)) !== 0

// Which way a row moves the pot: 'in' or 'out' (null if it doesn't).
export function moveDirection(row, savingsIds) {
  const sign = potSign(rowEffect(row, savingsIds))
  return sign > 0 ? 'in' : sign < 0 ? 'out' : null
}

// The rows that move the pot, newest first (by date, then by when they were
// added), from any mix of reads.
export function savingsMoves(rows, savingsIds) {
  return rows.filter((r) => touchesSavings(r, savingsIds)).sort((a, b) =>
    String(b.spent_at).localeCompare(String(a.spent_at))
    || String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
}

// Which effect fills which part of a period's flow.
const FLOW_KEY = {
  'saved-from-income': 'fromIncome', 'saved-received': 'received', 'expense-from-savings': 'fromSavings',
}

// One period's savings flow: what went in from income, what was received,
// what was paid from savings (all ≥ 0), and the net change (in − out).
export function savingsFlow(rows, savingsIds, baseCurrency) {
  const flow = { fromIncome: 0, received: 0, fromSavings: 0, net: 0 }
  for (const r of rows) {
    const effect = rowEffect(r, savingsIds)
    const sign = potSign(effect)
    if (!sign) continue
    const base = toBaseMinor(r.amount_minor, r.exchange_rate, r.currency, baseCurrency)
    flow[FLOW_KEY[effect]] += base
    flow.net += sign * base
  }
  return flow
}

const monthOf = (row) => String(row.spent_at).slice(0, 7)

// Month by month over `months` (lastMonths' shape, oldest first):
// [{ key, label, fromIncome, received, fromSavings, net, pot }], `pot` the
// pot's total at the month's end — everything before the first month is
// counted in, so the line starts where the pot really stood. Rows after the
// last month are left out.
export function potSeries(rows, savingsIds, baseCurrency, months) {
  const first = months[0]?.key ?? ''
  const byMonth = new Map(months.map((m) => [m.key, []]))
  const before = []
  for (const r of rows) {
    const key = monthOf(r)
    if (byMonth.has(key)) byMonth.get(key).push(r)
    else if (key < first) before.push(r)
  }
  let pot = savingsFlow(before, savingsIds, baseCurrency).net
  return months.map((m) => {
    const flow = savingsFlow(byMonth.get(m.key), savingsIds, baseCurrency)
    pot += flow.net
    return { key: m.key, label: m.label, ...flow, pot }
  })
}

// How many months the pot's chart covers: from the month of the oldest entry
// in `moves` to this month, at least 2 (a line needs two points) and at most
// `max`; 0 when there are none.
export function seriesLength(moves, now = new Date(), max = 12) {
  if (!moves.length) return 0
  const oldest = moves.reduce((k, r) => (monthOf(r) < k ? monthOf(r) : k), monthOf(moves[0]))
  const [y, m] = oldest.split('-').map(Number)
  const n = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m) + 1
  return Math.max(2, Math.min(max, n))
}

// The history's filter: every move, only what went in, or only what came out.
// [value, the key of its name in the savings namespace]
export const HISTORY_FILTERS = [['all', 'history.filters.all'], ['in', 'history.filters.in'], ['out', 'history.filters.out']]

// The history, month by month, newest first: [{ key, rows, net }]. `rows` are
// the month's moves that pass `filter` ('all' | 'in' | 'out'); `net` is the
// whole month's net change, whatever the filter. A month with no rows left
// after filtering is left out.
export function monthGroups(moves, savingsIds, baseCurrency, filter = 'all') {
  const groups = []
  const byKey = new Map()
  for (const r of moves) {
    const key = monthOf(r)
    let g = byKey.get(key)
    if (!g) {
      g = { key, all: [], rows: [] }
      byKey.set(key, g)
      groups.push(g)
    }
    g.all.push(r)
    if (filter === 'all' || moveDirection(r, savingsIds) === filter) g.rows.push(r)
  }
  return groups.filter((g) => g.rows.length > 0)
    .map(({ key, all, rows }) => ({ key, rows, net: savingsFlow(all, savingsIds, baseCurrency).net }))
}

// How many months the history shows at first, and how many more each
// "Show older" adds.
export const HISTORY_MONTHS = 2
export const HISTORY_MORE = 3

// An amount without a zero fraction ("€899", but "€709.40"), for the short
// phrases (the month's chip, a goal's pace).
export function wholeMoney(minor, currency = 'EUR') {
  return minor % minorFactor(currency) !== 0 ? formatMoney(minor, currency) : formatRoundedMoney(minor, currency)
}

// The chip under the pot's total, from this month's flow: 'up' (green,
// "+€X this month") only when the pot grew; otherwise neutral — 'spent'
// ("€X spent from savings this month") when something was paid from it, or
// 'none'. Never a red one: using savings is what they're for.
export function changeChip(flow) {
  if (flow.net > 0) return { kind: 'up', minor: flow.net }
  if (flow.fromSavings > 0) return { kind: 'spent', minor: flow.fromSavings }
  return { kind: 'none', minor: 0 }
}

// ── Goals ───────────────────────────────────────────────────────────────────

// A savings goal's progress: `pct` (0–100, whole), `done` once the target is
// reached, and `step` — the quick-add increment, a tenth of the target (≥ 1
// minor unit).
export function goalProgress({ saved_minor: saved, target_minor: target }) {
  return {
    pct: target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0,
    done: target > 0 && saved >= target,
    step: Math.max(1, Math.round(target / 10)),
  }
}

// The saved amount after a quick add/remove of `deltaMinor`; never below zero.
export function goalSavedAfter(goal, deltaMinor) {
  return Math.max(0, goal.saved_minor + deltaMinor)
}

// What a goal still needs each month to be reached by its target date:
// { perMonth, by } — the rest spread over the months left, counting the
// target's month (at least one: due this month, it's all of it this month),
// rounded up to a whole minor unit; `by` is "May 2027". null without a date,
// once reached, or when the date has passed.
export function goalPace({ saved_minor: saved, target_minor: target, target_date: date }, now = new Date()) {
  if (!date || saved >= target || date < isoDate(now)) return null
  const [y, m] = date.split('-').map(Number)
  const months = Math.max(1, (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth()))
  return { perMonth: Math.ceil((target - saved) / months), by: monthTitle(new Date(y, m - 1, 1)) }
}

// The line under a goal's amounts: { text, strong } — "Reached 🎉", what it
// needs a month to be reached by its date ("€163/mo to reach it by May
// 2027", strong), or, muted, that it has no date or its date has passed.
export function goalStatus(goal, now = new Date()) {
  if (goalProgress(goal).done) return { text: t('savings:goals.status.reached'), strong: true }
  const pace = goalPace(goal, now)
  if (pace) {
    return {
      text: t('savings:goals.status.pace', { amount: wholeMoney(pace.perMonth, goal.currency), date: pace.by }),
      strong: true,
    }
  }
  return { text: t(goal.target_date ? 'savings:goals.status.passed' : 'savings:goals.status.noDeadline'), strong: false }
}

// A goal's ring in the logo's language: the amber arc, the gap, then coral
// (markGeometry's MARK_ARCS), filled clockwise from 12 o'clock up to `pct` —
// so a reached goal is the Budgeer ring itself. Each arc as [start, length],
// fractions of the circumference; a zero length draws nothing.
export function goalRingArcs(pct) {
  const f = Math.min(1, Math.max(0, pct / 100))
  const [amberFrom, amberTo] = MARK_ARCS.amber
  const [coralFrom, coralTo] = MARK_ARCS.coral
  return {
    amber: [amberFrom, Math.max(0, Math.min(f, amberTo) - amberFrom)],
    coral: [coralFrom, Math.max(0, Math.min(f, coralTo) - coralFrom)],
  }
}

// The category "Add to savings" opens the income form on: the user's first
// (active) savings category, or null when there's none.
export function savingsCategoryOf(categories) {
  return (categories ?? []).find((c) => c.kind === 'income' && c.is_savings === true && !c.is_archived)?.id ?? null
}

// ── Savings accounts (0092) ─────────────────────────────────────────────────
// Where the page's total comes from (savingsTotal's `source`), as the line
// under it says it.
export const totalSourceNote = (source) =>
  t(source === 'accounts' ? 'savings:pot.fromAccounts' : 'savings:pot.fromEntries')

// The pot's month-end line when the total comes from savings accounts: the
// entries' line moved so its last point (this month's end) is the accounts'
// total, each earlier month being that total less what the entries recorded
// since. With the entries as the source, `series` as it is.
export function anchoredSeries(series, total) {
  if (total.source !== 'accounts' || !series.length) return series
  const shift = total.minor - series[series.length - 1].pot
  return series.map((s) => ({ ...s, pot: s.pot + shift }))
}

// ── Layout ──────────────────────────────────────────────────────────────────
// The page's cards by id. Two columns that each flow on their own (desktop,
// tablet): the pot and this month on the left, goals and the history on the
// right. On a phone held sideways the pot is a strip across the top (its
// total beside its chart) over the same two stacks. A portrait phone reads
// the left column, then the right. Every card appears once.
export function savingsStacks({ sideways = false } = {}) {
  return sideways
    ? { strip: ['pot'], left: ['month', 'goals'], right: ['history'] }
    : { strip: [], left: ['pot', 'month'], right: ['goals', 'history'] }
}
