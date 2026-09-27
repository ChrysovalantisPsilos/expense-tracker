// Plan mode — pure maths (no React/supabase; unit-tested in
// test/planMath.test.js). A plan is a sandbox over the user's recurring rules:
// it keeps a list of changes to real rules, hypothetical new ones, and the
// ideas the user dismissed. Nothing here touches the real rules; applying
// goes through the server (0095 apply_recurring_plan).
//
// Net = active recurring income − active recurring expenses. Every figure is
// worked out per YEAR in base-currency minor units first; a month is the year
// ÷ 12, so a yearly €480 counts €40 a month, and the Month and Year views
// always agree. Foreign rules count at today's ECB rate, exactly like Home's
// Recurring card (ruleFx.ruleInBase); a rule with no rate is left out of both
// figures and reported as `missing`. Savings are left out entirely: a rule is
// in the plan only when it's income or an expense paid from income
// (savings.rowEffect) — never a savings transfer, received savings or an
// expense paid from savings.
//
// The plan document (stored encrypted by 0095, one per account):
//   { v: 1,
//     changes: [{ rule_id, snap: { name, amount_minor, currency, frequency,
//                 interval_n }, cancel?, amount_minor?, currency?,
//                 frequency?, interval_n? }],
//     adds: [{ id, kind, name, amount_minor, currency, frequency, interval_n,
//              start, category_id }],
//     dismissed: ['<idea id>'] }
// `snap` is the rule as it was when the change was first planned: "before"
// always uses today's rule, and a snapshot that differs says "Updated since
// your plan".
import { FREQUENCIES, subscriptionGroup } from '../recurring/recurringMath.js'
import { budgetWindow, periodBudgets } from '../budgets/budgetMath.js'
import { ruleInBase } from '../../shared/lib/ruleFx.js'
import { rowEffect } from '../../shared/lib/savings.js'
import { spendRows } from '../../shared/lib/spread.js'
import { categoryDisplayName } from '../../shared/lib/categoryName.js'

export const PLAN_VERSION = 1
// The server's caps (0095 recurring_plan_check).
const MAX_CHANGES = 200
const MAX_ADDS = 50
const MAX_DISMISSED = 100
export const NAME_MAX = 80
const INTERVAL_MAX = 365

// Suggestions: at most this many ideas; a price rise counts from this many
// percent; months looked at for over-budget (this one and the two before) and
// for price rises (this one and the five before); "biggest saver" needs at
// least this many recurring expenses to mean anything.
export const MAX_IDEAS = 3
export const PRICE_UP_MIN_PCT = 2
export const OVER_BUDGET_MONTHS = 3
export const PRICE_MONTHS = 6
const BIGGEST_MIN_EXPENSES = 3
// Categories we never suggest cutting as a whole (overlap, biggest saver):
// a home, its utilities, health, taxes and insurance aren't "subscriptions".
// Known by a default category's key or, for the user's own, by its icon.
// Facts about them (a price rise, over budget) still show.
const ESSENTIAL_KEYS = new Set(['housing', 'utilities', 'health'])
const ESSENTIAL_ICONS = new Set(['housing', 'rent', 'utilities', 'electricity', 'water', 'health', 'taxes', 'insurance'])

export const UNDO_HOURS = 24
// How long "Applied … · View in Recurring" stays once undo has run out.
const APPLIED_NOTE_DAYS = 7

const RULE_FIELDS = ['amount_minor', 'currency', 'frequency', 'interval_n']
const PER_YEAR = { daily: 365, weekly: 52, monthly: 12, yearly: 1 }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const every = (n) => Math.max(1, parseInt(n, 10) || 1)
const sign = (kind) => (kind === 'income' ? 1 : -1)

// ---- Money -------------------------------------------------------------------

// What a rule-like { amount_minor, frequency, interval_n } costs (or brings
// in) per year, in its own currency's minor units.
export const yearMinor = (r) =>
  Math.round((Number(r.amount_minor) || 0) * (PER_YEAR[r.frequency] ?? 12) / every(r.interval_n))

export const monthOf = (yearMinorValue) => Math.round(yearMinorValue / 12)

// A yearly figure in the view the user picked ('month' | 'year').
export const inView = (yearMinorValue, view) => (view === 'year' ? yearMinorValue : monthOf(yearMinorValue))

// ---- The plan document ---------------------------------------------------------

export const emptyPlan = () => ({ v: PLAN_VERSION, changes: [], adds: [], dismissed: [] })

export const isEmptyPlan = (plan) => !plan.changes.length && !plan.adds.length && !plan.dismissed.length

const isAmount = (v) => Number.isSafeInteger(v) && v > 0
const isCurrency = (v) => typeof v === 'string' && /^[A-Z]{3}$/.test(v)
const isInterval = (v) => Number.isInteger(v) && v >= 1 && v <= INTERVAL_MAX
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

const pickRule = (r) => ({
  amount_minor: Number(r.amount_minor), currency: r.currency, frequency: r.frequency, interval_n: every(r.interval_n),
})

// The edits a change makes, only the valid ones.
function editsOf(c) {
  const out = {}
  if (isAmount(c.amount_minor)) out.amount_minor = c.amount_minor
  if (isCurrency(c.currency)) out.currency = c.currency
  if (FREQUENCIES.includes(c.frequency)) out.frequency = c.frequency
  if (isInterval(c.interval_n)) out.interval_n = c.interval_n
  return out
}

function cleanSnap(s) {
  if (!isObj(s) || !isAmount(Number(s.amount_minor)) || !isCurrency(s.currency) || !FREQUENCIES.includes(s.frequency)) {
    return null
  }
  return {
    name: typeof s.name === 'string' ? s.name.slice(0, NAME_MAX) : '',
    ...pickRule(s),
  }
}

function cleanAdd(a) {
  if (!isObj(a) || typeof a.id !== 'string' || !a.id || a.id.length > 60) return null
  if (!['expense', 'income'].includes(a.kind) || !isAmount(a.amount_minor) || !isCurrency(a.currency)
    || !FREQUENCIES.includes(a.frequency) || !isInterval(a.interval_n)
    || typeof a.start !== 'string' || !ISO_DATE.test(a.start)) return null
  return {
    id: a.id, kind: a.kind,
    name: typeof a.name === 'string' ? a.name.trim().slice(0, NAME_MAX) : '',
    amount_minor: a.amount_minor, currency: a.currency, frequency: a.frequency, interval_n: a.interval_n,
    start: a.start, category_id: typeof a.category_id === 'string' && UUID.test(a.category_id) ? a.category_id : null,
  }
}

// Any stored or restored document → a valid plan: malformed entries are
// dropped, duplicates and anything past the server's caps too.
export function normalisePlan(raw) {
  if (!isObj(raw) || raw.v !== PLAN_VERSION) return emptyPlan()
  const seen = new Set()
  const changes = []
  for (const c of Array.isArray(raw.changes) ? raw.changes : []) {
    if (!isObj(c) || typeof c.rule_id !== 'string' || !UUID.test(c.rule_id) || seen.has(c.rule_id)) continue
    const snap = cleanSnap(c.snap)
    if (!snap) continue
    seen.add(c.rule_id)
    changes.push({ rule_id: c.rule_id, snap, ...(c.cancel === true ? { cancel: true } : {}), ...editsOf(c) })
  }
  const addIds = new Set()
  const adds = (Array.isArray(raw.adds) ? raw.adds : []).map(cleanAdd)
    .filter((a) => a && !addIds.has(a.id) && addIds.add(a.id))
  const dismissed = [...new Set((Array.isArray(raw.dismissed) ? raw.dismissed : [])
    .filter((d) => typeof d === 'string' && d && d.length <= 120))]
  return {
    v: PLAN_VERSION,
    changes: changes.slice(0, MAX_CHANGES),
    adds: adds.slice(0, MAX_ADDS),
    dismissed: dismissed.slice(-MAX_DISMISSED),
  }
}

// ---- Which rules are in the plan -----------------------------------------------

// A rule that still has a charge to come: active and not past its end date
// (as the Recurring card counts them).
const upcoming = (r) => r.is_active && (!r.end_date || r.next_run <= r.end_date)

// The rules Plan mode shows and counts: upcoming income and expenses paid
// from income. Savings transfers (savings_from_income), received savings (any
// income in a savings category) and expenses paid from savings never appear.
export function planRules(rules, savingsIds = new Set()) {
  return rules.filter((r) => upcoming(r) && ['income', 'expense'].includes(rowEffect(r, savingsIds)))
}

// A rule's name as a row shows it (its description, else its category's).
export const ruleName = (rule) => rule.description || categoryDisplayName(rule.categories) || ''

// The rule as a change's snapshot keeps it.
export const snapOf = (rule, name = ruleName(rule)) => ({ name: String(name).slice(0, NAME_MAX), ...pickRule(rule) })

const snapDiffers = (snap, rule) => RULE_FIELDS.some((k) => snap[k] !== pickRule(rule)[k])

// ---- Items: every row of the plan, before → after ----------------------------

// The group a row sits in: income first, then the Recurring page's groups
// by how often they charge (recurringMath.subscriptionGroup).
export const GROUP_ORDER = ['income', 'weekly', 'monthly', 'quarterly', 'yearly']
const groupOf = (kind, fields) => (kind === 'income' ? 'income' : subscriptionGroup(fields))

function money(fields, baseCurrency, rates) {
  const b = fields && ruleInBase(fields, baseCurrency, rates)
  return b ? yearMinor(b) : null
}

// Each row:
//   id, ruleId (null for an add), added, kind, name, category, group, next
//   before / after   { amount_minor, currency, frequency, interval_n } in the
//                    rule's own currency (after: null once cancelled)
//   beforeYear / afterYear   per year in the base currency (0 when missing)
//   cancelled, changed, stale (its rule changed since the snapshot), snap
//   missing          no exchange rate right now: left out of every figure
// `categoriesById` gives an add's category its name/icon/colour.
export function buildItems({ rules, plan, savingsIds, baseCurrency, rates = {}, categoriesById = new Map() }) {
  const changeBy = new Map(plan.changes.map((c) => [c.rule_id, c]))
  const real = planRules(rules, savingsIds).map((rule) => {
    const change = changeBy.get(rule.id) ?? null
    const before = pickRule(rule)
    const after = change?.cancel ? null : { ...before, ...(change ? editsOf(change) : {}) }
    const b = money(before, baseCurrency, rates)
    const a = after ? money(after, baseCurrency, rates) : 0
    const missing = b == null || a == null
    return {
      id: rule.id, ruleId: rule.id, added: false, kind: rule.kind, name: ruleName(rule),
      category: rule.categories ?? null, categoryId: rule.category_id ?? null,
      group: groupOf(rule.kind, before), next: rule.next_run, before, after,
      beforeYear: missing ? 0 : b, afterYear: missing ? 0 : a, missing,
      cancelled: !!change?.cancel,
      changed: !!change && (!!change.cancel || RULE_FIELDS.some((k) => after[k] !== before[k])),
      stale: !!change && snapDiffers(change.snap, rule),
      snap: change?.snap ?? null,
    }
  })
  const adds = plan.adds.map((add) => {
    const after = pickRule(add)
    const a = money(after, baseCurrency, rates)
    return {
      id: add.id, ruleId: null, added: true, kind: add.kind, name: add.name,
      category: categoriesById.get(add.category_id) ?? null, categoryId: add.category_id,
      group: groupOf(add.kind, after), next: add.start, before: null, after,
      beforeYear: 0, afterYear: a ?? 0, missing: a == null,
      cancelled: false, changed: true, stale: false, snap: null, add,
    }
  })
  return [...real, ...adds]
}

// The rows by group, in GROUP_ORDER, each with its total after the plan
// (per year, base currency). Only the groups that have rows.
export function planGroups(items) {
  return GROUP_ORDER.map((key) => {
    const rows = items.filter((i) => i.group === key)
    return { key, items: rows, total: rows.reduce((s, i) => s + i.afterYear, 0) }
  }).filter((g) => g.items.length)
}

// How a row moves the net over a year (+ = more left over).
export const effectOf = (item) => sign(item.kind) * (item.afterYear - item.beforeYear)

// The whole plan: net before (today's real rules) and after, per year, and
// the rows it changes (in list order).
export function planSummary(items) {
  let before = 0
  let after = 0
  for (const i of items) {
    if (!i.added) before += sign(i.kind) * i.beforeYear
    after += sign(i.kind) * i.afterYear
  }
  const changes = items.filter((i) => i.changed)
  return { before, after, delta: after - before, changes }
}

// The rules whose rates the figures need: every rule's currency, and any
// other currency the plan's edits and adds use.
export function rateNeeds(rules, plan) {
  return [
    ...rules,
    ...plan.changes.filter((c) => c.currency).map((c) => ({ currency: c.currency })),
    ...plan.adds.map((a) => ({ currency: a.currency })),
  ]
}

// ---- Editing the plan (each returns a new plan) ------------------------------

// Change a rule in the plan: `patch` is any of { cancel, amount_minor,
// currency, frequency, interval_n }. Edits back to the rule's own values are
// dropped, and a change with nothing left leaves the plan. The snapshot is
// taken the first time the rule is changed.
export function setChange(plan, rule, patch, name = ruleName(rule)) {
  const old = plan.changes.find((c) => c.rule_id === rule.id)
  const merged = { ...(old ? editsOf(old) : {}), cancel: old?.cancel === true, ...patch }
  const cur = pickRule(rule)
  const edits = Object.fromEntries(Object.entries(editsOf(merged)).filter(([k, v]) => v !== cur[k]))
  const rest = plan.changes.filter((c) => c.rule_id !== rule.id)
  if (!merged.cancel && !Object.keys(edits).length) return { ...plan, changes: rest }
  const next = { rule_id: rule.id, snap: old?.snap ?? snapOf(rule, name), ...(merged.cancel ? { cancel: true } : {}), ...edits }
  return { ...plan, changes: old ? plan.changes.map((c) => (c === old ? next : c)) : [...plan.changes, next] }
}

export const resetChange = (plan, ruleId) => ({ ...plan, changes: plan.changes.filter((c) => c.rule_id !== ruleId) })

// Cancel several rules at once (an overlap idea's picks).
export const cancelRules = (plan, rules) => rules.reduce((p, r) => setChange(p, r, { cancel: true }), plan)

// Add or replace a "What if I add…" item (validated like a stored one).
export function upsertAdd(plan, add) {
  const clean = cleanAdd(add)
  if (!clean) return plan
  const has = plan.adds.some((a) => a.id === clean.id)
  return { ...plan, adds: has ? plan.adds.map((a) => (a.id === clean.id ? clean : a)) : [...plan.adds, clean] }
}

export const removeAdd = (plan, id) => ({ ...plan, adds: plan.adds.filter((a) => a.id !== id) })

export const dismissIdea = (plan, id) =>
  (plan.dismissed.includes(id) ? plan : { ...plan, dismissed: [...plan.dismissed, id].slice(-MAX_DISMISSED) })

// ---- Plans follow reality ------------------------------------------------------

// What changed under the plan since it was made:
//   dropped  changes whose rule is gone: { ruleId, name, reason: 'deleted' |
//            'stopped' } (stopped: paused, ended or now a savings rule)
//   stale    changes whose rule changed since the snapshot: { ruleId, name,
//            snap, now } — "before" already uses `now`
export function reconcile(plan, rules, savingsIds = new Set()) {
  const live = new Set(planRules(rules, savingsIds).map((r) => r.id))
  const byId = new Map(rules.map((r) => [r.id, r]))
  const dropped = []
  const stale = []
  for (const c of plan.changes) {
    const rule = byId.get(c.rule_id)
    if (!live.has(c.rule_id)) dropped.push({ ruleId: c.rule_id, name: c.snap.name, reason: rule ? 'stopped' : 'deleted' })
    else if (snapDiffers(c.snap, rule)) stale.push({ ruleId: c.rule_id, name: c.snap.name, snap: c.snap, now: pickRule(rule) })
  }
  return { dropped, stale }
}

// "OK" on the banner: the dropped changes leave the plan and the stale ones
// take today's rule as their new snapshot (the plan's own edits stay).
export function acknowledge(plan, rules, savingsIds = new Set()) {
  const { dropped } = reconcile(plan, rules, savingsIds)
  const gone = new Set(dropped.map((d) => d.ruleId))
  const byId = new Map(rules.map((r) => [r.id, r]))
  return {
    ...plan,
    changes: plan.changes.filter((c) => !gone.has(c.rule_id))
      .map((c) => ({ ...c, snap: snapOf(byId.get(c.rule_id), c.snap.name) })),
  }
}

// ---- Suggestions -----------------------------------------------------------------

// Price rises from what the rules actually charged (transactions linked by
// recurring_rule_id, 0065): the latest charge against the most recent earlier
// one at a different amount, in the rule's currency. Only a rise of at least
// PRICE_UP_MIN_PCT counts. Map ruleId → { pct, from, to, currency, since }
// (`since`: the first charge at the new price).
export function priceRises(charges, rules) {
  const out = new Map()
  const byRule = new Map()
  for (const t of charges) {
    if (t.kind !== 'expense' || !t.recurring_rule_id) continue
    if (!byRule.has(t.recurring_rule_id)) byRule.set(t.recurring_rule_id, [])
    byRule.get(t.recurring_rule_id).push(t)
  }
  for (const r of rules) {
    const list = (byRule.get(r.id) ?? []).filter((t) => t.currency === r.currency)
      .sort((a, b) => (a.spent_at < b.spent_at ? -1 : a.spent_at > b.spent_at ? 1 : 0))
    if (list.length < 2) continue
    const to = Number(list[list.length - 1].amount_minor)
    let i = list.length - 1
    while (i > 0 && Number(list[i - 1].amount_minor) === to) i--
    if (i === 0) continue
    const from = Number(list[i - 1].amount_minor)
    if (!(from > 0) || to <= from) continue
    const pct = Math.round(((to - from) * 100) / from)
    if (pct >= PRICE_UP_MIN_PCT) out.set(r.id, { pct, from, to, currency: r.currency, since: list[i].spent_at })
  }
  return out
}

// The 'YYYY-MM-01' keys of the `n` months up to and including `todayISO`'s.
export function recentMonths(todayISO, n) {
  const [y, m] = todayISO.split('-').map(Number)
  const out = []
  for (let k = n - 1; k >= 0; k--) {
    const d = new Date(Date.UTC(y, m - 1 - k, 1))
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`)
  }
  return out
}

// Which categories went over their budget in `months` ('YYYY-MM-01'), with the
// Budgets page's own maths (budgetMath.periodBudgets over each month, spend
// from spread.spendRows). Map categoryId → the months it was over, oldest first.
export function overBudgetMonths({ sets, rows, months, baseCurrency, separateYearly = false }) {
  const out = new Map()
  for (const month of months) {
    const span = budgetWindow({ value: `m:${month}`, from: month }, month)
    const spend = spendRows(rows, baseCurrency, span.from, span.to, { separateYearly })
    for (const b of periodBudgets({ sets, span, spend, baseCurrency }).items) {
      if (b.spent <= b.limit) continue
      if (!out.has(b.categoryId)) out.set(b.categoryId, [])
      out.get(b.categoryId).push(month)
    }
  }
  return out
}

const isEssential = (item) => ESSENTIAL_KEYS.has(item.category?.default_key) || ESSENTIAL_ICONS.has(item.category?.icon)
const candidates = (items) => items.filter((i) => !i.added && i.kind === 'expense' && !i.missing)

// The expense rules sharing a category (2+), non-essential ones only:
// [{ categoryId, category, items (dearest first) }].
function overlaps(items) {
  const by = new Map()
  for (const i of candidates(items)) {
    if (!i.categoryId || isEssential(i)) continue
    if (!by.has(i.categoryId)) by.set(i.categoryId, [])
    by.get(i.categoryId).push(i)
  }
  return [...by].filter(([, list]) => list.length >= 2)
    .map(([categoryId, list]) => ({
      categoryId, category: list[0].category, items: [...list].sort((a, b) => b.beforeYear - a.beforeYear),
    }))
}

// Each row's signals: Map id → { priceUp?, overlap?, overBudget? }.
// `rises` from priceRises, `overCats` from overBudgetMonths.
export function signalsFor(items, { rises = new Map(), overCats = new Map() } = {}) {
  const out = new Map()
  const add = (id, k, v) => out.set(id, { ...out.get(id), [k]: v })
  for (const o of overlaps(items)) for (const i of o.items) add(i.id, 'overlap', { categoryId: o.categoryId, count: o.items.length })
  for (const i of candidates(items)) {
    if (rises.has(i.id)) add(i.id, 'priceUp', rises.get(i.id))
    if (i.categoryId && overCats.has(i.categoryId)) add(i.id, 'overBudget', { months: overCats.get(i.categoryId) })
  }
  return out
}

// The one tag a row shows (price up, then overlap, then over budget), or null
// — never on a row the plan already changes.
export function rowTag(item, signals) {
  const s = signals.get(item.id)
  if (!s || item.changed) return null
  if (s.priceUp) return { kind: 'priceUp', pct: s.priceUp.pct }
  if (s.overlap) return { kind: 'overlap' }
  if (s.overBudget) return { kind: 'overBudget' }
  return null
}

// The "Ideas to save" strip, at most MAX_IDEAS, each rule in one idea only:
//   overlap     2+ recurring expenses in one category: the user picks which
//               to cancel. `saves` = all but the dearest one.
//   priceUp     a rule whose price went up; `saves` = cancelling it
//   overBudget  the dearest rule in a category that went over its budget
//   biggest     the dearest non-essential recurring expense (3+ expenses)
// Each: { id, kind, ruleIds, year (what its rules cost a year), saves (a
// year), …details }. An idea disappears once dismissed or once any of its
// rules is changed in the plan (trying one changes its rules).
export function planIdeas(items, signals, dismissed = []) {
  const off = new Set(dismissed)
  const changed = new Set(items.filter((i) => i.changed).map((i) => i.id))
  const pool = candidates(items)
  const byId = new Map(pool.map((i) => [i.id, i]))
  const single = (kind, i, extra) => ({ id: `${kind}:${i.id}`, kind, ruleIds: [i.id], name: i.name, category: i.category,
    year: i.beforeYear, saves: i.beforeYear, ...extra })

  const found = [
    ...overlaps(items).map((o) => {
      const year = o.items.reduce((s, i) => s + i.beforeYear, 0)
      return { id: `overlap:${o.categoryId}`, kind: 'overlap', ruleIds: o.items.map((i) => i.id),
        names: o.items.map((i) => i.name), category: o.category, year, saves: year - o.items[0].beforeYear }
    }).sort((a, b) => b.saves - a.saves),
    ...pool.filter((i) => signals.get(i.id)?.priceUp).sort((a, b) => b.beforeYear - a.beforeYear)
      .map((i) => single('priceUp', i, { rise: signals.get(i.id).priceUp })),
  ]
  const overCats = new Map()
  for (const i of pool) {
    const months = signals.get(i.id)?.overBudget?.months
    if (months && (!overCats.has(i.categoryId) || overCats.get(i.categoryId).beforeYear < i.beforeYear)) {
      overCats.set(i.categoryId, i)
    }
  }
  found.push(...[...overCats.values()].sort((a, b) => b.beforeYear - a.beforeYear)
    .map((i) => single('overBudget', i, { months: signals.get(i.id).overBudget.months })))

  const out = []
  const used = new Set()
  const take = (idea) => {
    if (out.length >= MAX_IDEAS || off.has(idea.id)) return
    if (idea.ruleIds.some((id) => changed.has(id) || used.has(id) || !byId.has(id))) return
    idea.ruleIds.forEach((id) => used.add(id))
    out.push(idea)
  }
  found.forEach(take)
  if (pool.length >= BIGGEST_MIN_EXPENSES) {
    const biggest = pool.filter((i) => !isEssential(i) && !used.has(i.id))
      .sort((a, b) => b.beforeYear - a.beforeYear)[0]
    if (biggest) take(single('biggest', biggest))
  }
  return out
}

// The overlap picker: the idea's rows dearest first, and what cancelling the
// picked ones saves a year.
export function overlapPick(items, idea, pickedIds) {
  const rows = idea.ruleIds.map((id) => items.find((i) => i.id === id)).filter(Boolean)
    .sort((a, b) => b.beforeYear - a.beforeYear)
  const saves = rows.filter((r) => pickedIds.has(r.id)).reduce((s, r) => s + r.beforeYear, 0)
  return { rows, saves }
}

// ---- Apply and undo ----------------------------------------------------------------

// What "Apply N changes" sends for the picked rows (ids), and the plan left
// behind (the changes not picked stay):
//   apply      { changes: [{ rule_id, cancel: true } | { rule_id, amount_minor,
//              currency, frequency, interval_n }], adds: [{ kind, description,
//              amount_minor, currency, frequency, interval_n, next_run,
//              category_id }] } — apply_recurring_plan's input
//   remaining  the plan without them
//   count      how many changes; effect  their move on the net, per year
export function applySelection(items, plan, pickedIds) {
  const picked = items.filter((i) => i.changed && pickedIds.has(i.id))
  const rules = picked.filter((i) => !i.added)
  const adds = picked.filter((i) => i.added)
  const ruleIds = new Set(rules.map((i) => i.id))
  const addIds = new Set(adds.map((i) => i.id))
  return {
    apply: {
      changes: rules.map((i) => (i.cancelled ? { rule_id: i.id, cancel: true } : { rule_id: i.id, ...i.after })),
      adds: adds.map(({ add }) => ({
        kind: add.kind, description: add.name || null, amount_minor: add.amount_minor, currency: add.currency,
        frequency: add.frequency, interval_n: add.interval_n, next_run: add.start, category_id: add.category_id,
      })),
    },
    remaining: {
      ...plan,
      changes: plan.changes.filter((c) => !ruleIds.has(c.rule_id)),
      adds: plan.adds.filter((a) => !addIds.has(a.id)),
    },
    count: picked.length,
    effect: picked.reduce((s, i) => s + effectOf(i), 0),
  }
}

// The last apply as the screen shows it, from my_recurring_plan's `undo`
// ({ applied_at, change_count }) at `now`:
//   null                                       nothing to show
//   { canUndo: true, count, until }            "Applied N changes" + Undo
//   { canUndo: false, count, appliedAt }       the quiet note, for a week
export function undoState(undo, now = new Date()) {
  if (!undo?.applied_at) return null
  const at = new Date(undo.applied_at)
  if (Number.isNaN(at.getTime())) return null
  const until = new Date(at.getTime() + UNDO_HOURS * 3600e3)
  const count = Number(undo.change_count) || 0
  if (now < until) return { canUndo: true, count, until }
  if (now - at > APPLIED_NOTE_DAYS * 86400e3) return null
  return { canUndo: false, count, appliedAt: at }
}
