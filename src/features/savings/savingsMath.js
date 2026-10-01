import {
  toBaseMinor, minorFactor, formatMoney, formatRoundedMoney, formatSigned, minorToInput, toMinor,
} from '../../shared/lib/currency.js'
import { isoDate, lastMonths, monthHeading, monthName, monthTitle, shortDate } from '../../shared/lib/dates.js'
import { t } from '../../shared/lib/i18n/i18n.js'
import { rowEffect, potSign, isSavingsRow, savingsNoteLabel } from '../../shared/lib/savings.js'
import { entryName } from '../../shared/lib/categoryName.js'
import { categoryLook } from '../../shared/lib/categoryStyle.js'
import { MARK_ARCS } from '../../shared/ui/markGeometry.js'
import { signedAmount } from '../../shared/ui/kit/kitMath.js'
import { frequencyLabel } from '../recurring/recurringMath.js'

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
// The filter's choices in words: [{ value, label }].
export const historyFilters = () => HISTORY_FILTERS.map(([value, key]) => ({ value, label: t(`savings:${key}`) }))

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

// ── The page's parts ────────────────────────────────────────────────────────
// What the Savings page shows, worked out once for the website's cards and
// the native app alike: every figure and word; the components only lay out.

// The pot's month-end line, from the month of the oldest move (seriesLength)
// to this month, moved onto the savings accounts' total when they are the
// source (anchoredSeries), and this month's flow (zeros with no moves).
export function potLine(moves, savingsIds, baseCurrency, total, now = new Date()) {
  const n = seriesLength(moves, now)
  const series = n ? potSeries(moves, savingsIds, baseCurrency, lastMonths(n, now)) : []
  return {
    line: anchoredSeries(series, total),
    month: series[series.length - 1] ?? { fromIncome: 0, received: 0, fromSavings: 0, net: 0 },
  }
}

// The pot's card: the total (signed, red below zero), where it comes from,
// this month's chip ("+€X this month", what was spent from it, or no change),
// how long the line runs ("since May · 5 months"), and the line's points in
// major units with their amounts (`chart` says them all, for a screen reader).
export function potCardParts(total, line, month, currency) {
  const chip = changeChip(month)
  const amount = wholeMoney(chip.minor, currency)
  const points = line.map((s) => ({ label: s.label, value: s.pot / minorFactor(currency), text: formatMoney(s.pot, currency) }))
  return {
    total: formatSigned(total.minor, currency),
    tone: total.minor < 0 ? 'negative' : 'default',
    note: totalSourceNote(total.source),
    chip: {
      kind: chip.kind,
      text: chip.kind === 'up' ? t('savings:chip.up', { amount })
        : chip.kind === 'spent' ? t('savings:chip.spent', { amount }) : t('savings:chip.none'),
    },
    since: line.length ? t('savings:pot.since', { month: line[0].label, count: line.length }) : null,
    points,
    chart: t('savings:pot.chart', { points: points.map((p) => `${p.label}: ${p.text}`).join(', ') }),
  }
}

// "This month": the month's name, what went in from income, what was
// received and what was paid from savings (growth in green, money taken out
// plainly, nothing muted; never red), the net change, and the savings that
// repeat (active rules in a savings category) with their next date.
export function monthCardParts(month, rules, savingsIds, currency, now = new Date()) {
  const signed = (minor) => signedAmount(minor, (x) => formatMoney(x, currency)).text
  const tile = (key, minor, tone) => ({ key, label: t(`savings:month.${key}`), text: signed(minor), tone })
  return {
    subtitle: monthName(now),
    tiles: [
      tile('fromIncome', month.fromIncome, month.fromIncome ? 'positive' : 'muted'),
      tile('received', month.received, month.received ? 'positive' : 'muted'),
      tile('fromSavings', -month.fromSavings, month.fromSavings ? 'default' : 'muted'),
    ],
    net: { text: signed(month.net), tone: month.net > 0 ? 'positive' : 'default' },
    repeating: (rules ?? []).filter((r) => r.is_active && isSavingsRow(r, savingsIds)).map((r) => ({
      id: r.id,
      title: `${formatMoney(r.amount_minor, r.currency)} ${frequencyLabel(r)}`,
      meta: t('savings:month.next', { name: entryName(r, t('savings:fallbackName')), date: shortDate(r.next_run, now) }),
    })),
  }
}

// The page as a whole: the first-run explainer before anything was ever
// saved (no moves, no savings account), the pot's card and this month's.
export function savingsPage({ moves, total, savingsIds, baseCurrency, rules, now = new Date() }) {
  const { line, month } = potLine(moves, savingsIds, baseCurrency, total, now)
  return {
    first: moves.length === 0 && total.source === 'entries',
    pot: potCardParts(total, line, month, baseCurrency),
    month: monthCardParts(month, rules, savingsIds, baseCurrency, now),
  }
}

// One history row: the entry's name, its date, where the money came from or
// went ("from income", "received", "from savings"), whether a rule adds it,
// its badge, and the amount signed by what it did to the pot (in: green,
// with its plus; out: plain). `row` is the entry itself, to open or delete.
export function savingsRowParts(row, savingsIds, now = new Date()) {
  const out = moveDirection(row, savingsIds) === 'out'
  return {
    id: row.id,
    row,
    look: categoryLook(row.categories, row.kind),
    title: entryName(row, t('savings:fallbackName')),
    date: shortDate(row.spent_at, now),
    note: savingsNoteLabel(row, savingsIds),
    out,
    repeats: !!row.recurring_rule_id,
    amount: formatSigned(out ? -row.amount_minor : row.amount_minor, row.currency, { plus: true }),
    tone: out ? 'default' : 'positive',
  }
}

// "Savings history" for a filter: the months (monthGroups), each with its
// heading, its whole net change (green when the pot grew, else muted) and
// its rows; `empty` says why there is nothing (null when there is).
export function savingsHistory(moves, savingsIds, baseCurrency, filter = 'all', now = new Date()) {
  const groups = monthGroups(moves, savingsIds, baseCurrency, filter).map((g) => {
    const net = signedAmount(g.net, (m) => formatMoney(m, baseCurrency))
    return {
      key: g.key,
      heading: monthHeading(g.key, now),
      net: { text: net.text, tone: net.tone === 'positive' ? 'positive' : 'muted' },
      rows: g.rows.map((r) => savingsRowParts(r, savingsIds, now)),
    }
  })
  return {
    groups,
    empty: groups.length ? null : t(filter === 'out' ? 'savings:history.emptyOut' : 'savings:history.emptyIn'),
  }
}

// A month-by-month history of `count` months with `months` asked for (the
// first HISTORY_MONTHS until "Show older"; null asks for those): how many
// show, whether there are older ones, and how many "Show older" asks for.
export function historyWindow(count, months = HISTORY_MONTHS) {
  const asked = months ?? HISTORY_MONTHS
  return { shown: Math.min(count, asked), more: count > asked, next: asked + HISTORY_MORE }
}

// A goal as its card shows it: the ring (`pct`, its arcs), the name, "€X of
// €Y", the status line (goalStatus), and the quick buttons' words with their
// step: "+ €X" until it's reached, "− €X" once something is saved.
export function goalParts(goal, now = new Date()) {
  const { pct, done, step } = goalProgress(goal)
  const money = (minor) => formatMoney(minor, goal.currency)
  return {
    id: goal.id,
    name: goal.name,
    pct,
    done,
    step,
    of: t('savings:goals.of', { saved: money(goal.saved_minor), target: money(goal.target_minor) }),
    status: goalStatus(goal, now),
    plus: done ? null : `+ ${money(step)}`,
    minus: !done && goal.saved_minor > 0 ? `− ${money(step)}` : null,
    arcs: goalRingArcs(pct),
  }
}

// A goal's page: the form's fields as it opens (the goal's own, or a new one
// in the base currency with nothing saved yet).
export function goalDraft(goal, baseCurrency) {
  if (!goal) return { name: '', target: '', saved: '0', currency: baseCurrency, targetDate: '' }
  return {
    name: goal.name,
    target: minorToInput(goal.target_minor, goal.currency),
    saved: minorToInput(goal.saved_minor, goal.currency),
    currency: goal.currency,
    targetDate: goal.target_date ?? '',
  }
}

// The form ready to save: { error } (what's missing first, worded) or
// { goal } as saveGoal takes it (`id` null for a new one).
export function goalToSave(draft, id = null) {
  if (!draft.name.trim()) return { error: t('savings:goal.nameIt') }
  if (!draft.target || Number(draft.target) <= 0) return { error: t('savings:goal.setTarget') }
  return {
    goal: {
      id: id ?? null,
      name: draft.name.trim(),
      target_minor: toMinor(draft.target, draft.currency),
      saved_minor: toMinor(draft.saved || '0', draft.currency),
      currency: draft.currency,
      target_date: draft.targetDate || null,
    },
  }
}
