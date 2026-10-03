// Plan mode — pure maths (no React/supabase; unit-tested in
// test/planMath.test.js). A plan is a sandbox over the user's recurring rules:
// it keeps a list of changes to real rules, hypothetical new ones, and the
// ideas the user dismissed. Nothing here touches the real rules; applying
// goes through the server (0095 apply_recurring_plan).
//
// Net = active recurring income − active recurring expenses − what's set
// aside as savings from income, exactly like Home's net (savings.netSign).
// Every figure is worked out per YEAR in base-currency minor units first; a
// month is the year ÷ 12, so a yearly €480 counts €40 a month, and the Month
// and Year views always agree. Foreign rules count at today's ECB rate,
// exactly like Home's Recurring card (ruleFx.ruleInBase); a rule with no rate
// is left out of both figures and reported as `missing`. A rule is in the
// plan when it moves the net (_shared/planRules.planKindOf): income, an
// expense paid from income, or savings taken from income — a row of kind
// 'savings' (in the database an income rule in a savings category with
// savings_from_income), in its own Savings group, money going out of the
// month. Received savings (a gift, interest) and expenses paid from savings
// or with meal vouchers never appear. Savings are never an idea to save, an
// overlap or a price rise: saving more isn't a cost to cut.
//
// The plan document (stored encrypted by 0095, one per account):
//   { v: 1,
//     changes: [{ rule_id, snap: { name, amount_minor, currency, frequency,
//                 interval_n }, cancel?, amount_minor?, currency?,
//                 frequency?, interval_n? }],
//     adds: [{ id, kind: 'expense' | 'income' | 'savings', name, amount_minor,
//              currency, frequency, interval_n, start, category_id }],
//     dismissed: ['<idea id>'],
//     salary?: { amount_minor?, cancel? },
//     savings?: { amount_minor?, cancel? } }
// `snap` is the rule as it was when the change was first planned: "before"
// always uses today's rule, and a snapshot that differs says "Updated since
// your plan". A 'savings' add always names its (savings) category: apply
// sends it as income in that category with savings_from_income (0107).
//
// Salary from entries: a salary is always recurring income, but many users
// log it as ordinary income entries. When there's no active recurring income
// rule in the salary category (the profile's salary_category_id, else the
// default "Salary" category), the plan gets a derived Salary row: the average
// monthly salary over the last 3 full calendar months that had salary entries
// (derivedSalary). Its what-if edit lives in `salary`: plan-only, never sent
// by apply (it isn't a recurring payment). The server checks its shape and
// keeps a plan that holds only a salary edit (0096).
//
// Savings from entries, the same way: with no recurring savings-from-income
// rule but one-off savings entries taken from income, the plan gets a
// derived Savings row (derivedSavings: the monthly average over the same 3
// full months, from the first one with such an entry). Its edit lives in
// `savings`, plan-only too (0107 checks and keeps it).
//
// No recurring income at all (no income row, derived or planned): the page
// shows the recurring payments instead of a negative net (planSummary's
// `mode: 'payments'`, headline()).
import { FREQUENCIES } from '../recurring/recurringMath.js'
import { budgetWindow, periodBudgets } from '../budgets/budgetMath.js'
import { ruleInBase } from '../../shared/lib/ruleFx.js'
import { isPlanRule, planKindOf } from '../../../supabase/functions/_shared/planRules.ts'
import { spendRows } from '../../shared/lib/spread.js'
import { entryName } from '../../shared/lib/categoryName.js'
import { sumToBaseByKey } from '../../shared/lib/txnRollup.js'
import { addMonths, payMonthOf, payMonthStart, payMonthWindow } from '../../shared/lib/payCalendar.js'
import { periodFromValue } from '../../shared/lib/periods.js'
import { ESSENTIAL_ICONS, ESSENTIAL_KEYS, SERVICE_TYPES, isEssential, serviceTypes } from './planCatalog.js'

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
const PRICE_UP_MIN_PCT = 2
export const OVER_BUDGET_MONTHS = 3
export const PRICE_MONTHS = 6
const BIGGEST_MIN_EXPENSES = 3
// Bills: the essential categories (planCatalog) plus the other running costs
// of a home (the icon picker's "home" section without streaming). Every other
// expense is a subscription.
const BILL_ICONS = new Set([...ESSENTIAL_ICONS, 'internet', 'phone', 'bank-fees'])

const UNDO_HOURS = 24
// How long "Applied … · View in Recurring" stays once undo has run out.
const APPLIED_NOTE_DAYS = 7

// The derived rows' ids (also the keys of their plan-only edits in the plan
// document), and the full months their averages look at (see the header).
export const SALARY_ID = 'salary'
export const SAVINGS_ID = 'savings'
const DERIVED = [SALARY_ID, SAVINGS_ID]
const SALARY_MONTHS = 3
const ADD_KINDS = ['expense', 'income', 'savings']
const RULE_FIELDS = ['amount_minor', 'currency', 'frequency', 'interval_n']
const PER_YEAR = { daily: 365, weekly: 52, monthly: 12, yearly: 1 }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const every = (n) => Math.max(1, parseInt(n, 10) || 1)
// How a row of each kind moves the net: income adds, expenses and savings
// taken from income take away.
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

// "Clear plan": every change and add goes, the dismissed ideas stay dismissed.
export const startOver = (plan) => ({ ...emptyPlan(), dismissed: plan.dismissed })

export const isEmptyPlan = (plan) =>
  !plan.changes.length && !plan.adds.length && !plan.dismissed.length && !plan.salary && !plan.savings

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
  if (!ADD_KINDS.includes(a.kind) || !isAmount(a.amount_minor) || !isCurrency(a.currency)
    || !FREQUENCIES.includes(a.frequency) || !isInterval(a.interval_n)
    || typeof a.start !== 'string' || !ISO_DATE.test(a.start)) return null
  const category = typeof a.category_id === 'string' && UUID.test(a.category_id) ? a.category_id : null
  // Savings need their category: without one they'd be plain income.
  if (a.kind === 'savings' && !category) return null
  return {
    id: a.id, kind: a.kind,
    name: typeof a.name === 'string' ? a.name.trim().slice(0, NAME_MAX) : '',
    amount_minor: a.amount_minor, currency: a.currency, frequency: a.frequency, interval_n: a.interval_n,
    start: a.start, category_id: category,
  }
}

// A derived row's change (`salary` or `savings`), only its valid parts; null
// when nothing's left.
function cleanDerived(s) {
  if (!isObj(s)) return null
  const out = {
    ...(s.cancel === true ? { cancel: true } : {}),
    ...(isAmount(s.amount_minor) ? { amount_minor: s.amount_minor } : {}),
  }
  return Object.keys(out).length ? out : null
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
    ...derivedEdits(raw),
  }
}

// The valid derived-row edits of a document (or a backup's plan):
// { salary?, savings? }.
export function derivedEdits(raw) {
  const out = {}
  for (const key of DERIVED) {
    const edit = cleanDerived(raw?.[key])
    if (edit) out[key] = edit
  }
  return out
}

// ---- Which rules are in the plan -----------------------------------------------

// The rules Plan mode shows and counts: upcoming income, expenses paid from
// income and savings taken from income (_shared/planRules.isPlanRule, which
// ai-helper's what-if uses too). Received savings and expenses paid from
// savings or with meal vouchers never appear.
export function planRules(rules, savingsIds = new Set()) {
  return rules.filter((r) => isPlanRule(r, savingsIds))
}

// A rule's name as a row shows it (its description, else its category's).
const ruleName = (rule) => entryName(rule, '')

// The rule as a change's snapshot keeps it.
export const snapOf = (rule, name = ruleName(rule)) => ({ name: String(name).slice(0, NAME_MAX), ...pickRule(rule) })

const snapDiffers = (snap, rule) => RULE_FIELDS.some((k) => snap[k] !== pickRule(rule)[k])

// ---- Salary from entries ---------------------------------------------------------

// The user's salary category: the profile's choice (0081) when set, else
// their income category whose default_key is 'salary' (an unarchived one
// first). null when there's none.
export function salaryCategoryId(profile, categories = []) {
  if (profile?.salary_category_id) return profile.salary_category_id
  const own = categories.filter((c) => c.kind === 'income' && c.default_key === 'salary')
  return (own.find((c) => !c.is_archived) ?? own[0])?.id ?? null
}


// The SALARY_MONTHS completed months before `todayISO`'s (this month, still
// open, is never counted): { from, to, months: ['YYYY-MM-01', …] }, oldest
// first. With pay months (`cal`, payCalendar.js) they are pay months, read
// from the first one's first day to the day before this one began.
export function salaryWindow(todayISO, cal = null) {
  const months = recentMonths(todayISO, SALARY_MONTHS + 1, cal).slice(0, SALARY_MONTHS)
  const label = (m) => m.slice(0, 7)
  return {
    from: payMonthStart(label(months[0]), cal),
    to: payMonthWindow(label(months[months.length - 1]), cal, todayISO).to,
    months,
  }
}

// The month ('YYYY-MM') an entry counts in: its pay month with `cal`.
const entryMonthKey = (r, cal) => payMonthOf(String(r.spent_at).slice(0, 10), cal)

// Whether the plan gets a derived Salary row, and its amount:
//   { state: 'none' }                 no salary category, or no entries
//   { state: 'rule', categoryId }     an active recurring income rule in the
//                                     category: the rule is the salary
//   { state: 'derived', categoryId, amount_minor, months }
//        the average of the monthly totals (base currency, each entry at its
//        captured rate) over the months of salaryWindow that had entries
// `entries` are income transactions, each in the month it counts in (its pay
// month with `cal`).
export function derivedSalary({ rules, savingsIds, categoryId, entries = [], todayISO, baseCurrency, cal = null }) {
  if (!categoryId) return { state: 'none' }
  if (planRules(rules, savingsIds).some((r) => planKindOf(r, savingsIds) === 'income' && r.category_id === categoryId)) {
    return { state: 'rule', categoryId }
  }
  const keys = new Set(salaryWindow(todayISO, cal).months.map((m) => m.slice(0, 7)))
  const mine = entries.filter((r) => r.kind === 'income' && r.category_id === categoryId)
  const totals = sumToBaseByKey(mine, baseCurrency, (r) => {
    const k = entryMonthKey(r, cal)
    return keys.has(k) ? k : null
  })
  const amount = totals.size ? Math.round([...totals.values()].reduce((s, v) => s + v, 0) / totals.size) : 0
  return amount > 0
    ? { state: 'derived', categoryId, amount_minor: amount, months: totals.size }
    : { state: 'none', categoryId }
}

// ---- Savings from entries ---------------------------------------------------------

// Whether the plan gets a derived Savings row, and its amount (like
// derivedSalary):
//   { state: 'none' }      no savings taken from income in the months looked at
//   { state: 'rule' }      an active recurring savings-from-income rule: the
//                          rules are the savings
//   { state: 'derived', amount_minor, months, categoryId }
//        the monthly average of the savings entries taken from income
//        (base currency, each at its captured rate) over salaryWindow's
//        months, from the first one that had such an entry (a month after
//        that with none counts as nothing saved); `categoryId` is the
//        savings category most of it went to (the row's badge)
// `entries` are income transactions (any category); received savings (a
// gift, interest) never count. Each counts in its month (its pay month with
// `cal`).
export function derivedSavings({ rules, savingsIds, entries = [], todayISO, baseCurrency, cal = null }) {
  if (planRules(rules, savingsIds).some((r) => planKindOf(r, savingsIds) === 'savings')) return { state: 'rule' }
  const months = salaryWindow(todayISO, cal).months.map((m) => m.slice(0, 7))
  const keys = new Set(months)
  const mine = entries.filter((r) => planKindOf(r, savingsIds) === 'savings')
  const keyOf = (r) => {
    const k = entryMonthKey(r, cal)
    return keys.has(k) ? k : null
  }
  const totals = sumToBaseByKey(mine, baseCurrency, keyOf)
  const first = months.findIndex((m) => totals.has(m))
  const total = [...totals.values()].reduce((s, v) => s + v, 0)
  const counted = months.length - first
  const amount = first < 0 ? 0 : Math.round(total / counted)
  if (amount <= 0) return { state: 'none' }
  const byCategory = sumToBaseByKey(mine, baseCurrency, (r) => (keyOf(r) ? r.category_id : null))
  const categoryId = [...byCategory].sort((a, b) => b[1] - a[1])[0][0]
  return { state: 'derived', amount_minor: amount, months: counted, categoryId }
}

// The categories a new savings item can go to: the user's savings categories
// (income marked is_savings) that aren't archived. The first is the default.
export const savingsCategories = (categories = []) =>
  categories.filter((c) => c.kind === 'income' && c.is_savings === true && !c.is_archived)

// ---- Editing a derived row ---------------------------------------------------------

// Edit a derived row in the plan (`key`: SALARY_ID or SAVINGS_ID, the row's
// id): `patch` is any of { cancel, amount_minor }; `amount` is the derived
// average. An amount back at the average is dropped, and a change with
// nothing left leaves the plan.
export function setDerived(plan, key, patch, amount) {
  const merged = { ...plan[key], ...patch }
  const next = cleanDerived({ ...merged, amount_minor: merged.amount_minor === amount ? undefined : merged.amount_minor })
  const rest = { ...plan }
  delete rest[key]
  return next ? { ...rest, [key]: next } : rest
}

export const resetDerived = (plan, key) => setDerived(plan, key, { cancel: false, amount_minor: undefined }, 0)

// ---- Items: every row of the plan, before → after ----------------------------

// The group a row sits in: Income, then Savings (set aside from income), then
// Bills (an expense in a home, utility, health, tax or insurance category —
// by the default category's key, or by the icon for the user's own), then
// Subscriptions (every other expense).
const GROUP_ORDER = ['income', 'savings', 'bills', 'subscriptions']
const isBill = (category) => ESSENTIAL_KEYS.has(category?.default_key) || BILL_ICONS.has(category?.icon)
const groupOf = (kind, category) => (kind !== 'expense' ? kind : isBill(category) ? 'bills' : 'subscriptions')

function money(fields, baseCurrency, rates) {
  const b = fields && ruleInBase(fields, baseCurrency, rates)
  return b ? yearMinor(b) : null
}

// Each row:
//   id, ruleId (null for an add), added, kind ('income' | 'expense' |
//   'savings': planRules.planKindOf), name, category, group, next
//   before / after   { amount_minor, currency, frequency, interval_n } in the
//                    rule's own currency (after: null once cancelled)
//   beforeYear / afterYear   per year in the base currency (0 when missing)
//   cancelled, changed, stale (its rule changed since the snapshot), snap
//   missing          no exchange rate right now: left out of every figure
//   derived          a row worked out from entries, its change plan-only:
//                    the Salary row (id SALARY_ID, `salary` true), listed
//                    first when `salary` (derivedSalary's answer) is
//                    'derived', and the Savings row (id SAVINGS_ID, kind
//                    'savings'), first in Savings when `savings`
//                    (derivedSavings') is; both monthly, in the base currency
// `categoriesById` gives an add's (and a derived row's) category its name/icon/colour.
export function buildItems({
  rules, plan, savingsIds = new Set(), baseCurrency, rates = {}, categoriesById = new Map(), salary = null, savings = null,
}) {
  const changeBy = new Map(plan.changes.map((c) => [c.rule_id, c]))
  const real = planRules(rules, savingsIds).map((rule) => {
    const change = changeBy.get(rule.id) ?? null
    const before = pickRule(rule)
    const after = change?.cancel ? null : { ...before, ...(change ? editsOf(change) : {}) }
    const b = money(before, baseCurrency, rates)
    const a = after ? money(after, baseCurrency, rates) : 0
    const missing = b == null || a == null
    const kind = planKindOf(rule, savingsIds)
    return {
      id: rule.id, ruleId: rule.id, added: false, kind, name: ruleName(rule),
      category: rule.categories ?? null, categoryId: rule.category_id ?? null,
      group: groupOf(kind, rule.categories), next: rule.next_run, before, after,
      beforeYear: missing ? 0 : b, afterYear: missing ? 0 : a, missing,
      cancelled: !!change?.cancel,
      changed: !!change && (!!change.cancel || RULE_FIELDS.some((k) => after[k] !== before[k])),
      stale: !!change && snapDiffers(change.snap, rule),
      snap: change?.snap ?? null,
    }
  })
  const adds = plan.adds.map((add) => {
    const after = pickRule(add)
    const category = categoriesById.get(add.category_id) ?? null
    const a = money(after, baseCurrency, rates)
    return {
      id: add.id, ruleId: null, added: true, kind: add.kind, name: add.name,
      category, categoryId: add.category_id,
      group: groupOf(add.kind, category), next: add.start, before: null, after,
      beforeYear: 0, afterYear: a ?? 0, missing: a == null,
      cancelled: false, changed: true, stale: false, snap: null, add,
    }
  })
  const derived = [
    ...(salary?.state === 'derived' ? [derivedItem(SALARY_ID, 'income', salary, plan.salary, baseCurrency, categoriesById)] : []),
    ...(savings?.state === 'derived' ? [derivedItem(SAVINGS_ID, 'savings', savings, plan.savings, baseCurrency, categoriesById)] : []),
  ]
  return [...derived, ...real, ...adds]
}

// A derived row (SALARY_ID or SAVINGS_ID) from its derive answer and its
// plan-only change.
function derivedItem(id, kind, answer, change, baseCurrency, categoriesById) {
  const before = { amount_minor: answer.amount_minor, currency: baseCurrency, frequency: 'monthly', interval_n: 1 }
  const after = change?.cancel ? null : { ...before, amount_minor: change?.amount_minor ?? before.amount_minor }
  return {
    id, ruleId: null, added: false, derived: true, ...(id === SALARY_ID ? { salary: true } : {}), kind, name: '',
    category: categoriesById.get(answer.categoryId) ?? null, categoryId: answer.categoryId,
    group: kind, next: null, before, after,
    beforeYear: yearMinor(before), afterYear: after ? yearMinor(after) : 0, missing: false, months: answer.months,
    cancelled: !after, changed: !after || after.amount_minor !== before.amount_minor, stale: false, snap: null,
  }
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

// The whole plan: net before (today's real rules) and after, per year, the
// rows it changes (in list order), and the mode the page shows it in: 'net',
// or 'payments' when there's no income row at all (no rule, no salary from
// entries, none planned), where a net would only be minus the payments.
// `saved` is what the savings rows set aside a year after the plan (already
// taken off the net), `savedDelta` what the plan's savings changes do to the
// net (− = saving more).
export function planSummary(items) {
  let before = 0
  let after = 0
  let saved = 0
  let savedDelta = 0
  for (const i of items) {
    if (!i.added) before += sign(i.kind) * i.beforeYear
    after += sign(i.kind) * i.afterYear
    if (i.kind === 'savings') {
      saved += i.afterYear
      savedDelta += effectOf(i)
    }
  }
  const changes = items.filter((i) => i.changed)
  const mode = items.some((i) => i.kind === 'income') ? 'net' : 'payments'
  return { mode, before, after, delta: after - before, changes, saved, savedDelta }
}

// The header's figures, per year: in 'net' mode the net; in 'payments' mode
// the recurring payments (savings included) as a positive amount (with no
// income the net is minus the payments). `change` moves the figure shown;
// `good` > 0 means more left over (green) in either mode, < 0 less (red).
// Savings are neither: a move that's only (or mostly, the other way round)
// saving more or less is 0 (neutral) — only the rest of the plan's changes
// can make it good or bad news.
export function headline(sum) {
  const flip = (v) => asShown(v, sum.mode)
  const rest = sum.delta - (sum.savedDelta ?? 0)
  const good = Math.sign(rest) === Math.sign(sum.delta) ? sum.delta : 0
  return { mode: sum.mode, before: flip(sum.before), after: flip(sum.after), change: flip(sum.delta), good }
}

// The tone of one change's effect on the net (+ green, − red): saving more or
// less is neither (money kept is not lost), so a savings row is always 0.
export const effectTone = (item, effect = effectOf(item)) => (item.kind === 'savings' ? 0 : effect)

// How the header's figure adds up (its ⓘ, shared/ui/SumSteps): Income (the
// derived Salary row too), − Recurring payments, − Put into savings, then
// the left-over — each step signed, in the view's unit ('month' | 'year'),
// today (`now`, real rules only) and after the plan (`planned`). Only the
// steps that have rows. Each column adds up to its `total` exactly, and the
// totals are the header's (headline's before/after in that unit): a month's
// rounding (each step is its year ÷ 12) goes to the biggest step. In
// 'payments' mode (no income) the steps and total are the payments as
// positive amounts, like the header.
const STEPS = [['income', 'income'], ['payments', 'expense'], ['savings', 'savings']]
const sumOf = (list) => list.reduce((s, v) => s + v, 0)

function fitSteps(years, view, mode) {
  const total = inView(asShown(sumOf(years), mode), view)
  const shown = years.map((y) => inView(asShown(y, mode), view))
  const off = total - sumOf(shown)
  if (off) {
    const big = shown.reduce((best, v, n) => (Math.abs(v) > Math.abs(shown[best]) ? n : best), 0)
    shown[big] += off
  }
  return { shown, total }
}

export function planSteps(items, view, mode) {
  const column = (field, real) => STEPS.map(([, kind]) =>
    sumOf(items.filter((i) => i.kind === kind && !(real && i.added)).map((i) => sign(kind) * i[field])))
  const now = fitSteps(column('beforeYear', true), view, mode)
  const planned = fitSteps(column('afterYear', false), view, mode)
  return {
    steps: STEPS.map(([key, kind], n) => ({ key, kind, now: now.shown[n], planned: planned.shown[n] }))
      .filter((s) => items.some((i) => i.kind === s.kind)),
    now: now.total,
    planned: planned.total,
  }
}

// A change's effect (effectOf: + = more left over) as the page shows it in
// `mode`: in 'payments' mode as the move in payments (a saving is minus).
export const asShown = (effect, mode) => (mode === 'payments' && effect ? -effect : effect)

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

// "Try it" on an idea: its picked rules (every rule of a single-rule idea)
// are cancelled in the plan, and the idea is gone for good — resetting the
// change later doesn't bring it back.
export const tryIdea = (plan, idea, rules) => dismissIdea(cancelRules(plan, rules), idea.id)

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
//            The salary change (ruleId SALARY_ID) drops out too once the
//            derived row is gone: reason 'salaryRule' (a recurring salary
//            rule now) or 'salaryGone' (no salary entries in the months
//            looked at). `salary` is derivedSalary's answer; null (not read)
//            leaves it be. The savings change (SAVINGS_ID) likewise, from
//            `savings` (derivedSavings'): 'savingsRule' or 'savingsGone'.
export function reconcile(plan, rules, savingsIds = new Set(), salary = null, savings = null) {
  const live = new Set(planRules(rules, savingsIds).map((r) => r.id))
  const byId = new Map(rules.map((r) => [r.id, r]))
  const dropped = []
  const stale = []
  for (const c of plan.changes) {
    const rule = byId.get(c.rule_id)
    if (!live.has(c.rule_id)) dropped.push({ ruleId: c.rule_id, name: c.snap.name, reason: rule ? 'stopped' : 'deleted' })
    else if (snapDiffers(c.snap, rule)) stale.push({ ruleId: c.rule_id, name: c.snap.name, snap: c.snap, now: pickRule(rule) })
  }
  for (const [key, answer] of [[SALARY_ID, salary], [SAVINGS_ID, savings]]) {
    if (plan[key] && answer && answer.state !== 'derived') {
      dropped.push({ ruleId: key, name: '', reason: `${key}${answer.state === 'rule' ? 'Rule' : 'Gone'}` })
    }
  }
  return { dropped, stale }
}

// "OK" on the banner: the dropped changes leave the plan and the stale ones
// take today's rule as their new snapshot (the plan's own edits stay).
export function acknowledge(plan, rules, savingsIds = new Set(), salary = null, savings = null) {
  const { dropped } = reconcile(plan, rules, savingsIds, salary, savings)
  const gone = new Set(dropped.map((d) => d.ruleId))
  const byId = new Map(rules.map((r) => [r.id, r]))
  return {
    ...DERIVED.filter((key) => gone.has(key)).reduce(resetDerived, plan),
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

// The 'YYYY-MM-01' keys of the `n` months up to and including `todayISO`'s
// (its pay month with `cal`).
export function recentMonths(todayISO, n, cal = null) {
  const now = payMonthOf(todayISO, cal)
  const out = []
  for (let k = n - 1; k >= 0; k--) out.push(`${addMonths(now, -k)}-01`)
  return out
}

// Which categories went over their budget in `months` ('YYYY-MM-01'), with the
// Budgets page's own maths (budgetMath.periodBudgets over each month, spend
// from spread.spendRows). Map categoryId → the months it was over, oldest
// first. With pay months (`cal`) each month is its pay window.
export function overBudgetMonths({ sets, rows, months, baseCurrency, separateYearly = false, cal = null }) {
  const out = new Map()
  for (const month of months) {
    const [y, m] = month.split('-').map(Number)
    const span = budgetWindow(periodFromValue(`m:${y}-${m}`, new Date(y, m - 1, 1), cal), month, cal)
    const spend = spendRows(rows, baseCurrency, span.from, span.to, { separateYearly, cal })
    for (const b of periodBudgets({ sets, span, spend, baseCurrency, cal }).items) {
      if (b.spent <= b.limit) continue
      if (!out.has(b.categoryId)) out.set(b.categoryId, [])
      out.get(b.categoryId).push(month)
    }
  }
  return out
}

// What ideas, overlaps and tags look at: today's real expenses. Never income
// or savings (saving is not a cost to cut), nor anything only in the plan.
const candidates = (items) => items.filter((i) => !i.added && i.kind === 'expense' && !i.missing)

// Overlaps: 2+ recurring expenses of the same service type (planCatalog), in
// any category, never an essential one: [{ type, items (dearest first) }], in
// SERVICE_TYPES order. A service of two types (YouTube Premium) can be in two.
function overlaps(items) {
  const pool = candidates(items).filter((i) => !isEssential(i))
  return SERVICE_TYPES.map((type) => ({
    type, items: pool.filter((i) => serviceTypes(i.name).includes(type)).sort((a, b) => b.beforeYear - a.beforeYear),
  })).filter((o) => o.items.length >= 2)
}

// Each row's signals: Map id → { priceUp?, overlap?, overBudget? }.
// `rises` from priceRises, `overCats` from overBudgetMonths. A price rise
// shows on any row; overlap and over budget never on an essential one.
export function signalsFor(items, { rises = new Map(), overCats = new Map() } = {}) {
  const out = new Map()
  const add = (id, k, v) => out.set(id, { ...out.get(id), [k]: v })
  for (const o of overlaps(items)) {
    for (const i of o.items) if (!out.get(i.id)?.overlap) add(i.id, 'overlap', { type: o.type, count: o.items.length })
  }
  for (const i of candidates(items)) {
    if (rises.has(i.id)) add(i.id, 'priceUp', rises.get(i.id))
    if (i.categoryId && overCats.has(i.categoryId) && !isEssential(i)) add(i.id, 'overBudget', { months: overCats.get(i.categoryId) })
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

// The "Ideas to save" strip, at most MAX_IDEAS, each rule in one idea only.
// Nothing ever suggests cancelling an essential payment (planCatalog):
//   overlap     2+ services of one type (2 music services): the user picks
//               which to cancel. `saves` = all but the dearest one.
//   priceUp     a non-essential rule whose price went up; `saves` = cancelling it
//   compare     an essential rule whose price went up: worth comparing offers.
//               Trying it opens the rule to model a cheaper quote, never
//               cancels it. `saves` 0; `riseYear` = what the rise costs a year
//   overBudget  the dearest non-essential rule in a category over its budget
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
  const risen = (i) => {
    const rise = signals.get(i.id).priceUp
    return isEssential(i)
      ? single('compare', i, { rise, saves: 0, riseYear: Math.round((i.beforeYear * (rise.to - rise.from)) / rise.to) })
      : single('priceUp', i, { rise })
  }

  const found = [
    ...overlaps(items).map((o) => {
      const year = o.items.reduce((s, i) => s + i.beforeYear, 0)
      return { id: `overlap:${o.type}`, kind: 'overlap', type: o.type, ruleIds: o.items.map((i) => i.id),
        names: o.items.map((i) => i.name), year, saves: year - o.items[0].beforeYear }
    }).sort((a, b) => b.saves - a.saves),
    ...pool.filter((i) => signals.get(i.id)?.priceUp).sort((a, b) => b.beforeYear - a.beforeYear).map(risen),
  ]
  const overCats = new Map()
  for (const i of pool) {
    const months = signals.get(i.id)?.overBudget?.months
    if (months && !isEssential(i) && (!overCats.has(i.categoryId) || overCats.get(i.categoryId).beforeYear < i.beforeYear)) {
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

// The changes Apply can send: every change but a derived row's (plan-only).
export const applicable = (items) => items.filter((i) => i.changed && !i.derived)

// What "Apply N changes" sends for the picked rows (ids), and the plan left
// behind (the changes not picked stay, and so do the derived rows' changes,
// which are plan-only and never sent). A savings add goes as income in its
// savings category, taken from income (savings_from_income, 0107):
//   apply      { changes: [{ rule_id, cancel: true } | { rule_id, amount_minor,
//              currency, frequency, interval_n }], adds: [{ kind, description,
//              amount_minor, currency, frequency, interval_n, next_run,
//              category_id, savings_from_income? }] } — apply_recurring_plan's
//              input
//   remaining  the plan without them
//   count      how many changes; effect  their move on the net, per year
export function applySelection(items, plan, pickedIds) {
  const picked = applicable(items).filter((i) => pickedIds.has(i.id))
  const rules = picked.filter((i) => !i.added)
  const adds = picked.filter((i) => i.added)
  const ruleIds = new Set(rules.map((i) => i.id))
  const addIds = new Set(adds.map((i) => i.id))
  return {
    apply: {
      changes: rules.map((i) => (i.cancelled ? { rule_id: i.id, cancel: true } : { rule_id: i.id, ...i.after })),
      adds: adds.map(({ add }) => ({
        kind: add.kind === 'expense' ? 'expense' : 'income', description: add.name || null,
        amount_minor: add.amount_minor, currency: add.currency,
        frequency: add.frequency, interval_n: add.interval_n, next_run: add.start, category_id: add.category_id,
        ...(add.kind === 'savings' ? { savings_from_income: true } : {}),
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
