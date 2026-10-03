// Plan mode as the page shows it (pure: no React, no I/O; tested in
// test/planPage.test.js): the page's state from what it read (planState),
// the edits a tap makes (editItem, toggleItem, dropItem, tryIdeaWith), and
// every figure and word of its parts — the header with its ⓘ, the notices,
// the ideas, the rows by group, "Your changes", the inline editors, the
// overlap picker, the Apply sheet and the "Type a what-if" preview — worked
// out once for the website's components and the native app alike. The maths
// is planMath.js, the wording planText.js; the components only lay out.
import { formatMoney, formatSigned, minorToInput, toMinor } from '../../shared/lib/currency.js'
import { isoDate, shortDate, shortDateTime } from '../../shared/lib/dates.js'
import { payMonthStart, payMonthWindow } from '../../shared/lib/payCalendar.js'
import { t } from '../../shared/lib/i18n/i18n.js'
import { categoryDisplayName } from '../../shared/lib/categoryName.js'
import { categoryLook } from '../../shared/lib/categoryStyle.js'
import { ruleInBase, rulesInBase } from '../../shared/lib/ruleFx.js'
import { signTone } from '../../shared/ui/kit/kitMath.js'
import { choiceToRule, frequencyLabel, ratesNotes, repeatChoiceOptions, ruleToChoice } from '../recurring/recurringMath.js'
import {
  OVER_BUDGET_MONTHS, PRICE_MONTHS, acknowledge, applicable, asShown, buildItems, effectOf, effectTone, headline, inView, monthOf, overBudgetMonths,
  overlapPick, planGroups, planIdeas, planRules, planSteps, planSummary, priceRises, recentMonths, reconcile, removeAdd,
  resetChange, resetDerived, rowTag, salaryWindow, savingsCategories, setChange, setDerived, signalsFor, tryIdea, undoState, yearMinor,
} from './planMath.js'
import {
  changeLine, ideaText, itemName, monthList, newKey, perUnit, rowMeta, serviceCount, whatIfLine,
} from './planText.js'
import { rowReady } from './whatIfMath.js'

const tp = (key, values) => t(`plan:${key}`, values)

// ── The page's state ────────────────────────────────────────────────────────

// What the page reads besides the rules, the plan and the categories, as of
// `todayISO`: the income entries behind the derived Salary and Savings rows
// (salaryWindow's completed months), the charges the price rises look at
// (PRICE_MONTHS up to this month's end, yearly ones spread) and the months
// (labels, 'YYYY-MM-01') whose budgets the over-budget ideas check. With pay
// months (`cal`, payCalendar.js) every month is a pay month's window.
export function planReads(todayISO, cal = null) {
  const win = salaryWindow(todayISO, cal)
  const months = recentMonths(todayISO, PRICE_MONTHS, cal)
  const label = (m) => m.slice(0, 7)
  return {
    income: { from: win.from, to: win.to },
    charges: {
      from: payMonthStart(label(months[0]), cal),
      to: payMonthWindow(label(months[months.length - 1]), cal, todayISO).to,
    },
    budgetMonths: months.slice(-OVER_BUDGET_MONTHS),
  }
}

// Everything the page works out from what it read: the rows (buildItems),
// the plan's figures (planSummary), what changed under the plan
// (reconcile), each row's signals and the ideas, and the rates notes'
// facts (foreign rules converted, and those without a rate right now).
//   rules, savingsIds, categories   the reads (every category, archived too)
//   salary, savings                 derivedSalary's and derivedSavings' answers (null: not read)
//   charges, budgetSets, budgetMonths   what the suggestions look at ([] without)
export function planState({
  rules, plan, savingsIds, baseCurrency, rates = {}, categories = [], salary = null, savings = null,
  charges = [], budgetSets = [], budgetMonths = [], separateYearly = false, cal = null,
}) {
  const categoriesById = new Map(categories.map((c) => [c.id, c]))
  const items = buildItems({ rules, plan, savingsIds, baseCurrency, rates, categoriesById, salary, savings })
  const live = planRules(rules, savingsIds)
  const signals = signalsFor(items, {
    rises: priceRises(charges, live),
    overCats: overBudgetMonths({ sets: budgetSets, rows: charges, months: budgetMonths, baseCurrency, separateYearly, cal }),
  })
  const fx = rulesInBase(live, baseCurrency, rates)
  return {
    items,
    sum: planSummary(items),
    reality: reconcile(plan, rules, savingsIds, salary, savings),
    signals,
    ideas: planIdeas(items, signals, plan.dismissed),
    rates: { converted: fx.converted, missing: fx.missing },
  }
}

// "OK" on the reality banner (planMath.acknowledge), with the same reads.
export const acknowledgePlan = (plan, { rules, savingsIds, salary = null, savings = null }) =>
  acknowledge(plan, rules, savingsIds, salary, savings)

// ── The edits a tap makes (each returns the new plan) ───────────────────────

const ruleOf = (rules, id) => rules.find((r) => r.id === id)

// A row's editor changed it: a derived row's plan-only edit, else a change
// to its rule. `patch`: any of { cancel, amount_minor, frequency, interval_n }.
export function editItem(plan, item, rules, patch) {
  return item.derived
    ? setDerived(plan, item.id, patch, item.before.amount_minor)
    : setChange(plan, ruleOf(rules, item.id), patch, itemName(item))
}

// A row's switch: an added one leaves the plan, any other is kept or cancelled.
export const toggleItem = (plan, item, rules) =>
  (item.added ? removeAdd(plan, item.id) : editItem(plan, item, rules, { cancel: !item.cancelled }))

// "Undo this change" (or "Remove"): an edit or cancel goes back to the real
// payment, an added one leaves.
export const dropItem = (plan, item) =>
  (item.added ? removeAdd(plan, item.id) : item.derived ? resetDerived(plan, item.id) : resetChange(plan, item.id))

// "Try it" on an idea: the rules picked (`ruleIds`: an overlap's ticks, else
// the idea's own rule) are cancelled in the plan and the idea leaves.
export const tryIdeaWith = (plan, idea, rules, ruleIds = idea.ruleIds.slice(0, 1)) =>
  tryIdea(plan, idea, ruleIds.map((id) => ruleOf(rules, id)))

// What a typed amount does in an editor: { amount_minor } once it's above
// zero, else null (the plan keeps what it had).
export function amountEdit(text, currency) {
  const minor = toMinor(text || '0', currency)
  return minor > 0 ? { amount_minor: minor } : null
}

// ── Small parts ─────────────────────────────────────────────────────────────

// The badge's tone for a row's kind: savings are money kept (positive), like income.
export const badgeKind = (kind) => (kind === 'expense' ? 'expense' : 'income')
const lookOf = (item) => categoryLook(item.category ?? null, badgeKind(item.kind))

// A signal's tag in words: { kind, text }.
const tagParts = (tag) => ({ kind: tag.kind, text: tp(`tags.${tag.kind}`, { pct: tag.pct }) })

// "How often": the Repeat choices, plus the rule's own "every N" first when
// it has one (value 'custom', which picks nothing): { value, options }.
export function frequencyOptions(fields) {
  const { choice, n } = ruleToChoice(fields)
  const custom = n > 1
  return {
    value: custom ? 'custom' : choice,
    options: [...(custom ? [{ value: 'custom', label: frequencyLabel(fields) }] : []), ...repeatChoiceOptions()],
  }
}

// A picked choice as the rule's { frequency, interval_n } (null for 'custom').
export const frequencyPick = (value) => (value === 'custom' ? null : choiceToRule(value, 1))

// What a change does, a month and a year: "You'd save · +€15.00 a month".
// For savings the move in what's left is the other way round: setting more
// aside leaves less (never red: it's money kept), and the words carry the way.
const WORDS = { income: ['get', 'getLess'], expense: ['save', 'spend'], savings: ['setAsideLess', 'setAsideMore'] }
export function deltaParts(effect, kind, currency) {
  const word = effect === 0 ? 'none' : WORDS[kind][effect > 0 ? 0 : 1]
  const money = (v) => (kind === 'savings' ? formatMoney(Math.abs(v), currency) : formatSigned(v, currency, { plus: true }))
  return {
    word: tp(`delta.${word}`),
    perMonth: tp('delta.perMonth', { amount: money(monthOf(effect)) }),
    perYear: tp('delta.perYear', { amount: money(effect) }),
    tone: signTone(effectTone({ kind }, effect)),
  }
}

// ── The header ──────────────────────────────────────────────────────────────

// The figure after the plan in the chosen unit (what's left over, or with no
// recurring income the recurring payments), the move as a chip (`good`:
// green above zero, red below), "was <s>…</s>" when it moved, what goes into
// savings, how it adds up (the ⓘ's SumSteps: null when there's nothing to
// add up), the rates notes (converted: in the ⓘ; missing: always in view),
// and whether to ask for the salary as recurring income.
export function impactParts(state, view, currency) {
  const { sum, items, rates } = state
  const h = headline(sum)
  const change = inView(h.change, view)
  const amount = h.mode === 'payments'
    ? tp(change < 0 ? 'impact.less' : 'impact.more', { amount: formatMoney(Math.abs(change), currency) })
    : formatSigned(change, currency, { plus: true })
  const hasSum = h.mode !== 'payments' || sum.saved > 0
  return {
    mode: h.mode,
    label: tp(`impact.${h.mode}.${view}`),
    figure: formatMoney(inView(h.after, view), currency),
    delta: { text: change === 0 ? tp('impact.noChanges') : tp(`impact.per.${view}`, { amount }), good: h.good },
    was: h.change !== 0 ? tp('impact.was', { amount: formatMoney(inView(h.before, view), currency) }) : null,
    saved: sum.saved > 0
      ? tp(`impact.saved.${h.mode}.${view}`, { amount: formatMoney(inView(sum.saved, view), currency) }) : null,
    steps: hasSum ? sumSteps(items, sum.mode, view, currency) : null,
    converted: ratesNotes(rates.converted, []).converted,
    missing: ratesNotes(false, rates.missing).missing,
    hasInfo: hasSum || rates.converted,
    incomeHint: h.mode === 'payments',
  }
}

// "How it adds up" (planMath.planSteps, shown with SumSteps): Income, −
// Recurring payments, − Put into savings, then what's left over, each with
// today's figure as `was` where the plan moves it. With no recurring income:
// the payments and savings, then their total.
function sumSteps(items, mode, view, currency) {
  const { steps, now, planned } = planSteps(items, view, mode)
  const net = mode === 'net'
  const money = (v) => (net ? formatSigned(v, currency, { plus: true }) : formatMoney(v, currency))
  const was = (a, b) => (a !== b ? money(a) : null)
  return {
    title: tp(`impact.sum.title.${mode}`),
    steps: steps.map((s) => ({ key: s.key, label: tp(`impact.sum.${s.key}`), value: money(s.planned), was: was(s.now, s.planned) })),
    total: { label: tp(`impact.sum.total.${mode}`), value: money(planned), was: was(now, planned), tone: net ? signTone(planned) : 'muted' },
  }
}

// ── The notices ─────────────────────────────────────────────────────────────

// The last apply (my_recurring_plan's `undo`) at `now`: just applied, with
// Undo until when, the net (or the payments) a month it leaves; then for a
// week the quiet "Applied yesterday · 4 changes"; else null.
export function appliedParts(undo, sum, currency, now = new Date()) {
  const state = undoState(undo, now)
  if (!state) return null
  if (state.canUndo) {
    const h = headline(sum)
    return {
      canUndo: true,
      count: state.count,
      title: tp('applied.title', { count: state.count }),
      body: tp(`applied.body.${h.mode}`, { amount: formatMoney(monthOf(h.before), currency) }),
      until: tp('applied.until', { time: shortDateTime(state.until, now) }),
    }
  }
  const day = isoDate(state.appliedAt)
  const yesterday = isoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))
  return {
    canUndo: false,
    count: state.count,
    note: day === yesterday
      ? tp('applied.yesterday', { count: state.count })
      : tp('applied.on', { date: shortDate(day, now), count: state.count }),
  }
}

// The real rules moved under the plan: a line for each changed one and each
// one that left the plan (null when nothing moved).
export function realityParts(reality) {
  if (!reality.dropped.length && !reality.stale.length) return null
  const name = (n) => n || tp('reality.unnamed')
  return {
    lines: [
      ...reality.stale.map((s) => ({ id: s.ruleId, text: tp('reality.stale', { name: name(s.name), amount: perUnit(s.now) }) })),
      ...reality.dropped.map((d) => ({ id: d.ruleId, text: tp(`reality.${d.reason}`, { name: name(d.name) }) })),
    ],
  }
}

// ── Ideas ───────────────────────────────────────────────────────────────────

// The "Ideas to save" cards: the tag, the headline and line, what it saves
// (or what a rise costs, red) in the view's unit, what "Try it" does
// ('pick': the overlap's picker; 'open': the payment's editor, to try a lower
// price; 'try': cancel it in the plan), its words, and the idea itself.
export function ideasParts(ideas, view, currency, now = new Date()) {
  return {
    count: ideas.length ? tp('ideas.count', { count: ideas.length }) : null,
    cards: ideas.map((idea) => {
      const text = ideaText(idea, currency, tp, now)
      const compare = idea.kind === 'compare'
      return {
        id: idea.id,
        kind: idea.kind,
        idea,
        action: idea.kind === 'overlap' ? 'pick' : compare ? 'open' : 'try',
        tag: tagParts({ kind: compare ? 'priceUp' : idea.kind, pct: idea.rise?.pct }),
        title: text.title,
        body: text.body,
        figure: compare
          ? { text: tp(`ideas.upBy.${view}`, { amount: formatMoney(inView(idea.riseYear, view), currency) }), tone: 'negative' }
          : { text: tp(`ideas.save.${view}`, { amount: formatMoney(inView(idea.saves, view), currency) }), tone: 'positive' },
        tryLabel: tp(compare ? 'ideas.compare.try' : 'ideas.try'),
        dismissLabel: tp('ideas.dismiss', { title: text.title }),
      }
    }),
  }
}

// ── Rows ────────────────────────────────────────────────────────────────────

// One row: its name, badge, state tag (New, Changed, Cancelled or Stopped),
// the muted line, the signal's tag, the amount in the view's unit (muted and
// in its own currency without a rate; struck through once cancelled; green
// for income) and today's struck through under a changed one, the switch's
// words, "Updated since your plan" (its <strong> marks the lead), and the
// item with its signals (the editor's).
export function rowParts(item, { view, currency, signals, now = new Date() }) {
  const name = itemName(item)
  const was = inView(item.beforeYear, view)
  const fields = item.after ?? item.before
  const state = !item.changed ? null
    : item.added ? { text: tp('tags.new'), tone: 'positive' }
      : item.cancelled ? { text: tp(item.kind === 'expense' ? 'tags.cancelled' : 'tags.stopped'), tone: 'negative' }
        : { text: tp('tags.changed'), tone: 'accent' }
  const tag = rowTag(item, signals)
  return {
    id: item.id,
    item,
    signal: signals.get(item.id) ?? null,
    name,
    look: lookOf(item),
    state,
    meta: rowMeta(item, view, tp, now),
    tag: tag ? tagParts(tag) : null,
    amount: item.missing ? { text: formatMoney(fields.amount_minor, fields.currency), tone: 'muted', struck: false }
      : item.cancelled ? { text: formatMoney(was, currency), tone: 'muted', struck: true }
        : { text: formatMoney(inView(item.afterYear, view), currency), tone: item.kind === 'income' ? 'positive' : 'default', struck: false },
    was: item.changed && !item.cancelled && !item.added && !item.missing ? formatMoney(was, currency) : null,
    cancelled: item.cancelled,
    openLabel: tp('row.open', { name }),
    toggleLabel: tp(item.cancelled ? 'row.keep' : item.kind === 'expense' ? 'row.cancel' : 'row.stop', { name }),
    stale: item.stale ? tp(item.cancelled ? 'row.updatedCancel' : 'row.updatedEdit', {
      now: perUnit(item.before), was: perUnit(item.snap), plan: item.after ? perUnit(item.after) : '',
    }) : null,
  }
}

// The rows by group (planGroups), each group with its name and its total
// after the plan in the view's unit.
export function groupsParts(state, { view, currency, now = new Date() }) {
  return planGroups(state.items).map((g) => ({
    key: g.key,
    title: tp(`groups.${g.key}`),
    total: formatMoney(inView(g.total, view), currency),
    rows: g.items.map((it) => rowParts(it, { view, currency, signals: state.signals, now })),
  }))
}

// ── Your changes ────────────────────────────────────────────────────────────

// "Your changes" (null before any): each change's name, badge, "before →
// after" line, "Only in your plan" / "Not in your recurring yet", what it
// does to the header's figure a month (in its tone) and a year, its "Undo
// this change" (or "Remove", for an added one) with its label, whether it
// opens its payment; the total; and whether anything can be applied (a
// derived row's change is only in the plan).
export function changesParts(sum, currency) {
  if (!sum.changes.length) return null
  const h = headline(sum)
  return {
    title: tp('changes.title', { count: sum.changes.length }),
    rows: sum.changes.map((it) => {
      const eff = effectOf(it)
      const shown = asShown(eff, sum.mode)
      const name = itemName(it)
      return {
        id: it.id,
        item: it,
        name,
        look: lookOf(it),
        line: changeLine(it, tp),
        note: it.derived ? tp('changes.planOnly') : it.added ? tp('changes.notYet') : null,
        perMonth: { text: tp('changes.perMonth', { amount: formatSigned(monthOf(shown), currency, { plus: true }) }), tone: signTone(effectTone(it, eff)) },
        perYear: tp('changes.perYear', { amount: formatSigned(shown, currency, { plus: true }) }),
        editLabel: tp('changes.edit', { name }),
        remove: !!it.added,
        drop: tp(it.added ? 'changes.remove' : 'changes.undo'),
        dropLabel: tp(it.added ? 'changes.removeLabel' : 'changes.undoLabel', { name }),
        rule: !it.added && !it.derived ? it.id : null,
      }
    }),
    total: {
      label: tp(`changes.total.${h.mode}`),
      perMonth: tp('changes.perMonth', { amount: formatSigned(monthOf(h.change), currency, { plus: true }) }),
      perYear: tp('changes.perYear', { amount: formatSigned(h.change, currency, { plus: true }) }),
      tone: signTone(h.good),
    },
    canApply: applicable(sum.changes).length > 0,
  }
}

// ── The page ────────────────────────────────────────────────────────────────

// Everything the page shows for `state` (planState's) in the chosen unit:
// whether there's nothing to plan, whether "Plan saved" shows (there's
// something in the plan to keep), the header, the notices, the ideas, the
// rows by group, "Your changes", and the savings category a new savings
// item goes to (null: none, so none can be added).
export function planPageParts(state, { view, currency, undo = null, categories = [], now = new Date() }) {
  return {
    empty: state.items.length === 0,
    saved: state.sum.changes.length > 0,
    header: impactParts(state, view, currency),
    applied: appliedParts(undo, state.sum, currency, now),
    reality: realityParts(state.reality),
    ideas: ideasParts(state.ideas, view, currency, now),
    groups: groupsParts(state, { view, currency, now }),
    changes: changesParts(state.sum, currency),
    savingsCategoryId: savingsCategories(categories)[0]?.id ?? null,
  }
}

// ── The inline editors ──────────────────────────────────────────────────────

// Why a row carries a tag, in a line (price up, then overlap, then over
// budget): { tag, text } or null.
export function signalDetail(signal, now = new Date()) {
  const shown = !signal ? null : signal.priceUp ? 'priceUp' : signal.overlap ? 'overlap' : signal.overBudget ? 'overBudget' : null
  if (!shown) return null
  const text = shown === 'priceUp'
    ? tp('edit.detail.priceUp', {
      from: formatMoney(signal.priceUp.from, signal.priceUp.currency),
      to: formatMoney(signal.priceUp.to, signal.priceUp.currency), date: shortDate(signal.priceUp.since, now),
    })
    : shown === 'overlap' ? tp('edit.detail.overlap', { services: serviceCount(signal.overlap.type, signal.overlap.count, tp) })
      : tp('edit.detail.overBudget', { months: monthList(signal.overBudget.months) })
  return { tag: tagParts({ kind: shown, pct: signal.priceUp?.pct }), text }
}

// A row's editor (in place under the row or its change): why it's tagged,
// the plan-only note of a derived row, the amount as typed when it opens
// (and after Reset), today's (or the average) under it, the live delta, how
// often (none for a derived row: it stays monthly), keep or cancel (stop,
// for income and savings), and whether Reset does anything.
export function editorParts(item, signal, currency, now = new Date()) {
  const fields = item.after ?? item.before
  return {
    signal: signalDetail(signal, now),
    note: item.derived ? tp(item.salary ? 'edit.salaryNote' : 'edit.savingsNote') : null,
    text: minorToInput(fields.amount_minor, fields.currency),
    resetText: minorToInput(item.before.amount_minor, item.before.currency),
    currency: fields.currency,
    help: tp(item.derived ? 'edit.average' : 'edit.now', { amount: perUnit(item.before) }),
    delta: deltaParts(effectOf(item), item.kind, currency),
    frequency: item.derived ? null : frequencyOptions(fields),
    keep: [{ value: 'keep', label: tp('edit.keep') }, { value: 'cancel', label: tp(item.kind === 'expense' ? 'edit.cancel' : 'edit.stop') }],
    cancelled: item.cancelled,
    canReset: item.changed,
  }
}

// "What if I add…": the form as it opens (`add`: one already in the plan, or
// null for a new one, a monthly cost in the base currency from today).
export function addDraft(add, currency, todayISO) {
  return {
    kind: add?.kind ?? 'expense',
    name: add?.name ?? '',
    currency: add?.currency ?? currency,
    text: add ? minorToInput(add.amount_minor, add.currency) : '',
    ...(add ? { frequency: add.frequency, interval_n: add.interval_n } : choiceToRule('monthly')),
    start: add?.start ?? todayISO,
    categoryId: add?.category_id ?? '',
  }
}

// Picking what it is: a savings item goes to the first savings category,
// anything else starts without one.
export function addKind(draft, kind, categories) {
  return { ...draft, kind, categoryId: kind === 'savings' ? savingsCategories(categories)[0]?.id ?? '' : '' }
}

// The form's parts: what it can be (savings once there's a savings
// category), the categories it can go in (savings: those; else the kind's
// active ones, never a savings one for income) with "No category" first
// unless it's savings, the field's words, how often, whether it can be
// added, and the live delta in the base currency at today's rate (none yet
// for a currency whose rate hasn't arrived).
export function addFormParts(draft, { categories, currency, rates = {}, editing = false }) {
  const pots = savingsCategories(categories)
  const choices = draft.kind === 'savings' ? pots
    : categories.filter((c) => c.kind === draft.kind && !c.is_archived && !(c.is_savings && draft.kind === 'income'))
  const amount = toMinor(draft.text || '0', draft.currency)
  const freq = { frequency: draft.frequency, interval_n: draft.interval_n }
  const inBase = ruleInBase({ amount_minor: amount, currency: draft.currency, ...freq }, currency, rates)
  const effect = inBase ? (draft.kind === 'income' ? 1 : -1) * yearMinor(inBase) : 0
  return {
    kinds: [
      { value: 'expense', label: tp('add.cost') }, { value: 'income', label: tp('add.income') },
      ...(pots.length ? [{ value: 'savings', label: tp('add.savings') }] : []),
    ],
    placeholder: tp(`add.placeholder.${draft.kind}`),
    categoryLabel: tp(draft.kind === 'savings' ? 'add.savingsCategory' : 'add.category'),
    noCategory: draft.kind === 'savings' ? null : tp('add.noCategory'),
    categories: choices.map((c) => ({ id: c.id, label: categoryDisplayName(c) })),
    frequency: frequencyOptions(freq),
    ready: !!addToSave(draft, 'ready'),
    delta: deltaParts(effect, draft.kind, currency),
    submit: tp(editing ? 'add.update' : 'add.submit'),
  }
}

// The form as the plan keeps it (planMath.upsertAdd's add, its `id` the one
// it had or a new one), or null while it can't be added: an amount above
// zero, a name, a start date, and a category for savings.
export function addToSave(draft, id) {
  const amount = toMinor(draft.text || '0', draft.currency)
  if (!(amount > 0) || !draft.name.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(draft.start)) return null
  if (draft.kind === 'savings' && !draft.categoryId) return null
  return {
    id, kind: draft.kind, name: draft.name.trim(), amount_minor: amount, currency: draft.currency,
    frequency: draft.frequency, interval_n: draft.interval_n, start: draft.start, category_id: draft.categoryId || null,
  }
}

// "Try it" on an overlap: its rows dearest first with what each costs a year
// and a month and whether it's ticked (`pickedIds`), what cancelling the
// ticked ones saves, and the button's words.
export function pickParts(items, idea, pickedIds, currency) {
  const picked = new Set(pickedIds)
  const { rows, saves } = overlapPick(items, idea, picked)
  const count = rows.filter((r) => picked.has(r.id)).length
  return {
    title: ideaText(idea, currency, tp).name,
    rows: rows.map((it) => ({
      id: it.id,
      name: itemName(it),
      look: lookOf(it),
      perYear: tp('pick.perYear', { amount: formatMoney(it.beforeYear, currency) }),
      perMonth: tp('changes.perMonth', { amount: formatMoney(monthOf(it.beforeYear), currency) }),
      picked: picked.has(it.id),
    })),
    summary: {
      label: count ? tp('pick.cancelOf', { picked: count, count: rows.length }) : tp('pick.none'),
      amount: tp('delta.perMonth', { amount: formatSigned(monthOf(saves), currency, { plus: true }) }),
      tone: signTone(saves),
      sub: saves ? tp('pick.saveYear', { amount: formatSigned(saves, currency, { plus: true }) }) : tp('pick.hint'),
    },
    add: count ? tp('pick.add', { count }) : tp('pick.addNone'),
    picked: rows.filter((r) => picked.has(r.id)).map((r) => r.id),
  }
}

// ── The Apply sheet ─────────────────────────────────────────────────────────

// What Apply will do to one change, in words.
function applyLine(item, now) {
  if (item.added) return tp(`apply.new${newKey(item.kind)}`, { date: shortDate(item.next, now) })
  if (item.cancelled) return tp('apply.stops')
  return tp('apply.editLine', { amount: perUnit(item.after), date: shortDate(item.next, now) })
}

// The sheet with `offIds` unticked: every change Apply can send (ticked,
// what it does, its move a month), a note for each derived row's change
// (it stays in the plan), the figure after applying the ticked ones, the
// button's words, and the ids it applies.
export function applySheetParts(sum, currency, offIds = [], now = new Date()) {
  const off = new Set(offIds)
  const list = applicable(sum.changes)
  const picked = list.filter((c) => !off.has(c.id))
  const effect = picked.reduce((s, it) => s + effectOf(it), 0)
  return {
    rows: list.map((it) => {
      const eff = effectOf(it)
      return {
        id: it.id,
        name: itemName(it),
        look: lookOf(it),
        line: applyLine(it, now),
        amount: { text: tp('changes.perMonth', { amount: formatSigned(monthOf(asShown(eff, sum.mode)), currency, { plus: true }) }), tone: signTone(effectTone(it, eff)) },
        on: !off.has(it.id),
      }
    }),
    kept: sum.changes.filter((c) => c.derived).map((c) => ({ id: c.id, text: tp(c.salary ? 'apply.salaryNote' : 'apply.savingsNote') })),
    after: { label: tp(`apply.after.${sum.mode}`), value: tp('apply.netValue', { amount: formatMoney(monthOf(asShown(sum.before + effect, sum.mode)), currency) }) },
    submit: tp('apply.submit', { count: picked.length }),
    picked: picked.map((p) => p.id),
  }
}

// ── "Type a what-if" ────────────────────────────────────────────────────────

// The preview of the helper's proposals (whatIfMath.whatIfRows) with
// `pickedIds` ticked: each row's name (or "No name"), whether it's still the
// helper's suggestion (unedited), what it does, its badge and words; how
// many can go in (ticked and complete), the button's words, and the names
// it couldn't find.
export function whatIfParts(rows, pickedIds, notFound = []) {
  const picked = new Set(pickedIds)
  const ready = rows.filter((r) => picked.has(r.id) && rowReady(r)).length
  return {
    rows: rows.map((row) => {
      const name = row.item ? itemName(row.item) : row.name
      return {
        id: row.id,
        name: name || tp('typeIt.noName'),
        suggested: !row.edited,
        line: whatIfLine(row, tp),
        look: categoryLook(row.item?.category ?? null, badgeKind(row.kind)),
        picked: picked.has(row.id),
        pickLabel: tp('typeIt.pick', { name }),
        editLabel: tp('typeIt.editLabel', { name }),
      }
    }),
    ready,
    add: ready ? tp('typeIt.addToPlan', { count: ready }) : tp('typeIt.addNone'),
    notFound: notFound.length ? tp('typeIt.notFoundToo', { names: notFound.join(', ') }) : null,
  }
}

// A proposal's editor: keep-and-change or cancel (a payment that's there) or
// its name (a new one), the amount as it opens, how often.
export function whatIfEditorParts(row) {
  const fields = row.after ?? row.kept ?? row.before
  const cancelled = row.type === 'cancel'
  return {
    add: row.type === 'add',
    text: minorToInput(fields.amount_minor, fields.currency),
    currency: fields.currency,
    cancelled,
    choice: cancelled ? 'cancel' : 'change',
    choices: [{ value: 'change', label: tp('typeIt.changeIt') }, { value: 'cancel', label: tp(row.kind === 'expense' ? 'edit.cancel' : 'edit.stop') }],
    frequency: frequencyOptions(fields),
  }
}

// Why the helper's answer didn't land, in words: none of it was found (the
// names), or it couldn't tell (null: there are rows to show).
export function whatIfEmpty(rows, notFound = []) {
  if (rows.length) return null
  return notFound.length ? tp('typeIt.notFound', { names: notFound.join(', ') }) : tp('typeIt.unreadable')
}
