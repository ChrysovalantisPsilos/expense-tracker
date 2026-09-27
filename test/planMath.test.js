import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  yearMinor, monthOf, inView, emptyPlan, isEmptyPlan, normalisePlan, planRules, buildItems, planGroups,
  planSummary, effectOf, setChange, resetChange, cancelRules, upsertAdd, removeAdd, dismissIdea, reconcile,
  acknowledge, priceRises, recentMonths, overBudgetMonths, signalsFor, rowTag, planIdeas, overlapPick,
  applySelection, undoState, snapOf, rateNeeds, MAX_IDEAS,
} from '../src/features/plan/planMath.js'

// Fake ids (uuid-shaped, as the server's rule ids are).
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ENT = id(900)
const FIT = id(901)
const HOME = id(902)
const SAV = id(903)
const PAY = id(904)
const cats = {
  [ENT]: { name: 'Entertainment', default_key: 'entertainment' },
  [FIT]: { name: 'Fitness' },
  [HOME]: { name: 'Housing', default_key: 'housing' },
  [SAV]: { name: 'Savings', default_key: 'savings' },
  [PAY]: { name: 'Salary', default_key: 'salary' },
}
const rule = (n, description, amount_minor, extra = {}) => ({
  id: id(n), kind: 'expense', description, amount_minor, currency: 'EUR', frequency: 'monthly', interval_n: 1,
  next_run: '2026-10-01', end_date: null, is_active: true, category_id: null, categories: null,
  savings_from_income: false, paid_from_savings: false, ...extra,
  ...(extra.category_id ? { categories: cats[extra.category_id] } : {}),
})

const SALARY = rule(1, 'Salary', 325000, { kind: 'income', category_id: PAY })
const RENT = rule(2, 'Rent', 115000, { category_id: HOME })
const NETFLIX = rule(3, 'Netflix', 1399, { category_id: ENT })
const SPOTIFY = rule(4, 'Spotify', 1099, { category_id: ENT })
const DISNEY = rule(5, 'Disney+', 899, { category_id: ENT })
const GYM = rule(6, 'Gym', 3990, { category_id: FIT })
const CAR = rule(7, 'Car insurance', 48000, { frequency: 'yearly' })
const SAVE = rule(8, 'Monthly savings', 20000, { kind: 'income', category_id: SAV, savings_from_income: true })
const PAID_FROM_POT = rule(9, 'Holiday fund', 5000, { paid_from_savings: true })
const PAUSED = rule(10, 'Old gym', 2000, { is_active: false })
const RULES = [SALARY, RENT, NETFLIX, SPOTIFY, DISNEY, GYM, CAR, SAVE, PAID_FROM_POT, PAUSED]
const SAVINGS_IDS = new Set([SAV])
const items = (plan = emptyPlan(), extra = {}) =>
  buildItems({ rules: RULES, plan, savingsIds: SAVINGS_IDS, baseCurrency: 'EUR', ...extra })

test('money: a year of each frequency; a month is the year ÷ 12', () => {
  assert.equal(yearMinor({ amount_minor: 1000, frequency: 'monthly', interval_n: 1 }), 12000)
  assert.equal(yearMinor({ amount_minor: 1000, frequency: 'weekly', interval_n: 2 }), 26000)
  assert.equal(yearMinor({ amount_minor: 100, frequency: 'daily', interval_n: 1 }), 36500)
  assert.equal(yearMinor({ amount_minor: 3000, frequency: 'monthly', interval_n: 3 }), 12000) // quarterly
  assert.equal(yearMinor({ amount_minor: 48000, frequency: 'yearly', interval_n: 1 }), 48000)
  assert.equal(yearMinor({ amount_minor: 10000, frequency: 'yearly', interval_n: 2 }), 5000)
  assert.equal(monthOf(48000), 4000)
  assert.equal(inView(48000, 'month'), 4000)
  assert.equal(inView(48000, 'year'), 48000)
})

test('net: income minus expenses; yearly counts at 1/12; savings and stopped rules left out', () => {
  const list = items()
  assert.deepEqual(list.map((i) => i.name), ['Salary', 'Rent', 'Netflix', 'Spotify', 'Disney+', 'Gym', 'Car insurance'])
  const sum = planSummary(list)
  const year = 12 * (325000 - 115000 - 1399 - 1099 - 899 - 3990) - 48000
  assert.equal(sum.before, year)
  assert.equal(sum.after, year)
  assert.equal(sum.delta, 0)
  assert.equal(monthOf(sum.before), 325000 - 115000 - 1399 - 1099 - 899 - 3990 - 4000)
  assert.equal(sum.changes.length, 0)
})

test('planRules: savings transfers, received savings, paid from savings, paused and ended rules never count', () => {
  const received = rule(11, 'Interest', 500, { kind: 'income', category_id: SAV })
  const ended = rule(12, 'Ended', 500, { end_date: '2026-09-01' })
  const kept = planRules([...RULES, received, ended], SAVINGS_IDS).map((r) => r.description)
  assert.ok(!kept.includes('Monthly savings'))
  assert.ok(!kept.includes('Interest'))
  assert.ok(!kept.includes('Holiday fund'))
  assert.ok(!kept.includes('Old gym'))
  assert.ok(!kept.includes('Ended'))
})

test('currency: foreign rules count at today’s rate; one with no rate is left out and flagged', () => {
  const usd = rule(20, 'Cloud', 1000, { currency: 'USD' })
  const jpy = rule(21, 'Manga', 1800, { currency: 'JPY' })
  const list = buildItems({ rules: [usd, jpy], plan: emptyPlan(), baseCurrency: 'EUR', rates: { USD: 0.9 } })
  assert.equal(list[0].beforeYear, 900 * 12)
  assert.equal(list[0].missing, false)
  assert.equal(list[1].missing, true)
  assert.equal(list[1].beforeYear, 0)
  assert.equal(planSummary(list).before, -900 * 12)
  assert.deepEqual(rateNeeds([usd], upsertAdd(emptyPlan(), {
    id: 'a1', kind: 'expense', name: 'X', amount_minor: 100, currency: 'GBP', frequency: 'monthly', interval_n: 1, start: '2026-10-01',
  })).map((r) => r.currency), ['USD', 'GBP'])
})

test('groups: income first, then by how often they charge; totals follow the plan', () => {
  const plan = setChange(emptyPlan(), NETFLIX, { cancel: true })
  const groups = planGroups(items(plan))
  assert.deepEqual(groups.map((g) => g.key), ['income', 'monthly', 'yearly'])
  const monthly = groups.find((g) => g.key === 'monthly')
  assert.equal(monthly.total, 12 * (115000 + 1099 + 899 + 3990))
})

test('edits: amount and frequency change the net; editing back removes the change', () => {
  let plan = setChange(emptyPlan(), GYM, { amount_minor: 2490 })
  let list = items(plan)
  let gym = list.find((i) => i.id === GYM.id)
  assert.equal(gym.changed, true)
  assert.equal(effectOf(gym), 1500 * 12)
  assert.equal(planSummary(list).delta, 18000)
  assert.deepEqual(plan.changes[0].snap, { name: 'Gym', amount_minor: 3990, currency: 'EUR', frequency: 'monthly', interval_n: 1 })

  plan = setChange(plan, GYM, { frequency: 'yearly' })
  gym = items(plan).find((i) => i.id === GYM.id)
  assert.equal(gym.afterYear, 2490)
  assert.equal(gym.group, 'monthly', 'rows keep their place while edited')

  plan = setChange(plan, GYM, { amount_minor: 3990, frequency: 'monthly' })
  assert.equal(plan.changes.length, 0)
  list = items(plan)
  assert.equal(list.find((i) => i.id === GYM.id).changed, false)
})

test('income is editable too: a raise moves the net up', () => {
  const plan = setChange(emptyPlan(), SALARY, { amount_minor: 340000 })
  assert.equal(planSummary(items(plan)).delta, 15000 * 12)
})

test('cancel: the row counts nothing; keeping it again restores; reset drops the change', () => {
  let plan = setChange(emptyPlan(), NETFLIX, { cancel: true })
  const net = items(plan).find((i) => i.id === NETFLIX.id)
  assert.equal(net.cancelled, true)
  assert.equal(net.afterYear, 0)
  assert.equal(planSummary(items(plan)).delta, 1399 * 12)
  plan = setChange(plan, NETFLIX, { cancel: false })
  assert.equal(plan.changes.length, 0)
  plan = cancelRules(emptyPlan(), [NETFLIX, DISNEY])
  assert.equal(planSummary(items(plan)).delta, (1399 + 899) * 12)
  plan = resetChange(plan, NETFLIX.id)
  assert.deepEqual(plan.changes.map((c) => c.rule_id), [DISNEY.id])
})

test('add: a hypothetical cost or income counts after, never before', () => {
  let plan = upsertAdd(emptyPlan(), {
    id: 'add-1', kind: 'income', name: ' Tutoring ', amount_minor: 12000, currency: 'EUR',
    frequency: 'monthly', interval_n: 1, start: '2026-10-01', category_id: null,
  })
  const list = items(plan)
  const tut = list.find((i) => i.id === 'add-1')
  assert.equal(tut.added, true)
  assert.equal(tut.name, 'Tutoring')
  assert.equal(tut.beforeYear, 0)
  assert.equal(effectOf(tut), 144000)
  assert.equal(planSummary(list).delta, 144000)
  // A cost added yearly.
  plan = upsertAdd(plan, { id: 'add-2', kind: 'expense', name: 'Course', amount_minor: 60000, currency: 'EUR',
    frequency: 'yearly', interval_n: 1, start: '2026-11-01', category_id: null })
  assert.equal(planSummary(items(plan)).delta, 144000 - 60000)
  // Invalid ones are ignored; removing one takes it out.
  assert.equal(upsertAdd(plan, { id: 'bad', kind: 'expense', amount_minor: -1 }), plan)
  assert.deepEqual(removeAdd(plan, 'add-1').adds.map((a) => a.id), ['add-2'])
})

test('normalisePlan: keeps valid entries only, one per rule, within the caps', () => {
  const snap = snapOf(GYM)
  const plan = normalisePlan({
    v: 1,
    changes: [
      { rule_id: GYM.id, snap, amount_minor: 2490, currency: 'eur', frequency: 'hourly' },
      { rule_id: GYM.id, snap, cancel: true },
      { rule_id: 'nope', snap },
      { rule_id: NETFLIX.id, snap: { amount_minor: -1 } },
    ],
    adds: [{ id: 'x', kind: 'gift' }],
    dismissed: ['overlap:a', 'overlap:a', 5],
  })
  assert.deepEqual(plan.changes, [{ rule_id: GYM.id, snap, amount_minor: 2490 }])
  assert.deepEqual(plan.adds, [])
  assert.deepEqual(plan.dismissed, ['overlap:a'])
  assert.deepEqual(normalisePlan(null), emptyPlan())
  assert.deepEqual(normalisePlan({ v: 2 }), emptyPlan())
  assert.equal(isEmptyPlan(emptyPlan()), true)
  assert.equal(isEmptyPlan(dismissIdea(emptyPlan(), 'x')), false)
})

test('plans follow reality: "before" uses today’s rule; a changed rule is stale; a gone one drops out', () => {
  let plan = setChange(emptyPlan(), GYM, { amount_minor: 2490 })
  plan = setChange(plan, DISNEY, { cancel: true })
  plan = setChange(plan, SPOTIFY, { cancel: true })
  const now = RULES.filter((r) => r.id !== DISNEY.id)
    .map((r) => (r.id === GYM.id ? { ...r, amount_minor: 4290 } : r.id === SPOTIFY.id ? { ...r, is_active: false } : r))
  const { dropped, stale } = reconcile(plan, now, SAVINGS_IDS)
  assert.deepEqual(dropped, [
    { ruleId: DISNEY.id, name: 'Disney+', reason: 'deleted' },
    { ruleId: SPOTIFY.id, name: 'Spotify', reason: 'stopped' },
  ])
  assert.equal(stale.length, 1)
  assert.equal(stale[0].now.amount_minor, 4290)
  const list = buildItems({ rules: now, plan, savingsIds: SAVINGS_IDS, baseCurrency: 'EUR' })
  const gym = list.find((i) => i.id === GYM.id)
  assert.equal(gym.stale, true)
  assert.equal(gym.beforeYear, 4290 * 12, 'before is today’s rule')
  assert.equal(effectOf(gym), (4290 - 2490) * 12)
  assert.equal(planSummary(list).changes.length, 1, 'the dropped changes no longer count')

  const ok = acknowledge(plan, now, SAVINGS_IDS)
  assert.deepEqual(ok.changes.map((c) => c.rule_id), [GYM.id])
  assert.equal(ok.changes[0].snap.amount_minor, 4290)
  assert.equal(ok.changes[0].amount_minor, 2490, 'the plan’s own edit stays')
  assert.deepEqual(reconcile(ok, now, SAVINGS_IDS), { dropped: [], stale: [] })
})

test('price rises: latest charge above the last different one, from 2%', () => {
  const charge = (ruleId, spent_at, amount_minor, extra = {}) =>
    ({ kind: 'expense', recurring_rule_id: ruleId, spent_at, amount_minor, currency: 'EUR', ...extra })
  const rises = priceRises([
    charge(NETFLIX.id, '2026-06-22', 1199), charge(NETFLIX.id, '2026-07-22', 1399), charge(NETFLIX.id, '2026-08-22', 1399),
    charge(SPOTIFY.id, '2026-07-01', 1099), charge(SPOTIFY.id, '2026-08-01', 1099),
    charge(GYM.id, '2026-07-03', 3990), charge(GYM.id, '2026-08-03', 3999), // +0.2%: too small
    charge(DISNEY.id, '2026-07-08', 999), charge(DISNEY.id, '2026-08-08', 899), // went down
    charge(RENT.id, '2026-07-01', 100, { currency: 'USD' }), charge(RENT.id, '2026-08-01', 115000),
  ], RULES)
  assert.deepEqual([...rises.keys()], [NETFLIX.id])
  assert.deepEqual(rises.get(NETFLIX.id), { pct: 17, from: 1199, to: 1399, currency: 'EUR', since: '2026-07-22' })
})

test('over budget: a category over its cap in one of the recent months', () => {
  assert.deepEqual(recentMonths('2026-02-14', 3), ['2025-12-01', '2026-01-01', '2026-02-01'])
  const cap = (period, category_id, amount_minor) =>
    ({ id: `${period}:${category_id}`, category_id, amount_minor, currency: 'EUR', period_start: period, categories: cats[category_id] })
  const sets = [{ period: '2026-07-01', rows: [cap('2026-07-01', FIT, 3000), cap('2026-07-01', ENT, 10000)] }]
  const row = (spent_at, category_id, amount_minor) =>
    ({ kind: 'expense', spent_at, category_id, amount_minor, currency: 'EUR', exchange_rate: 1 })
  const over = overBudgetMonths({
    sets, months: ['2026-07-01', '2026-08-01', '2026-09-01'], baseCurrency: 'EUR',
    rows: [row('2026-07-03', FIT, 3990), row('2026-08-03', FIT, 2500), row('2026-09-03', FIT, 3990), row('2026-09-05', ENT, 3000)],
  })
  assert.deepEqual([...over], [[FIT, ['2026-07-01', '2026-09-01']]])
})

const SIGNALS_OPTS = {
  rises: new Map([[NETFLIX.id, { pct: 17, from: 1199, to: 1399, currency: 'EUR', since: '2026-07-22' }]]),
  overCats: new Map([[FIT, ['2026-08-01', '2026-09-01']]]),
}

test('signals and row tags: one tag per row, price up first; none on a changed row', () => {
  const list = items()
  const sig = signalsFor(list, SIGNALS_OPTS)
  assert.deepEqual(sig.get(NETFLIX.id).overlap, { categoryId: ENT, count: 3 })
  assert.equal(rowTag(list.find((i) => i.id === NETFLIX.id), sig).kind, 'priceUp')
  assert.equal(rowTag(list.find((i) => i.id === NETFLIX.id), sig).pct, 17)
  assert.equal(rowTag(list.find((i) => i.id === SPOTIFY.id), sig).kind, 'overlap')
  assert.equal(rowTag(list.find((i) => i.id === GYM.id), sig).kind, 'overBudget')
  assert.equal(rowTag(list.find((i) => i.id === RENT.id), sig), null)
  const changed = items(setChange(emptyPlan(), SPOTIFY, { cancel: true }))
  assert.equal(rowTag(changed.find((i) => i.id === SPOTIFY.id), sig), null)
})

test('ideas: overlap, price up, over budget, biggest saver — each rule once, at most 3', () => {
  const list = items()
  const ideas = planIdeas(list, signalsFor(list, SIGNALS_OPTS))
  assert.equal(ideas.length, MAX_IDEAS)
  const [overlap, second, third] = ideas
  assert.equal(overlap.id, `overlap:${ENT}`)
  assert.deepEqual(overlap.ruleIds, [NETFLIX.id, SPOTIFY.id, DISNEY.id], 'dearest first')
  assert.equal(overlap.year, (1399 + 1099 + 899) * 12)
  assert.equal(overlap.saves, (1099 + 899) * 12, 'keeping the dearest one')
  // Netflix is already in the overlap, so its price rise isn't an idea of its own.
  assert.equal(second.id, `overBudget:${GYM.id}`)
  assert.deepEqual(second.months, ['2026-08-01', '2026-09-01'])
  // Biggest saver: the dearest non-essential expense not used yet (rent is
  // housing, gym and the streams are taken).
  assert.equal(third.id, `biggest:${CAR.id}`)
  assert.equal(third.saves, 48000)
})

test('ideas: price up shows when its rule is free; dismissed and tried ideas disappear', () => {
  const noOverlap = RULES.filter((r) => r.id !== SPOTIFY.id && r.id !== DISNEY.id)
  const list = buildItems({ rules: noOverlap, plan: emptyPlan(), savingsIds: SAVINGS_IDS, baseCurrency: 'EUR' })
  const sig = signalsFor(list, SIGNALS_OPTS)
  let ideas = planIdeas(list, sig)
  assert.deepEqual(ideas.map((i) => i.kind), ['priceUp', 'overBudget', 'biggest'])
  assert.deepEqual(ideas[0].rise.pct, 17)
  // Dismissed: gone, and the next one moves up.
  ideas = planIdeas(list, sig, [`priceUp:${NETFLIX.id}`])
  assert.deepEqual(ideas.map((i) => i.kind), ['overBudget', 'biggest'])
  // Tried (any of its payments changed in the plan): gone.
  const tried = buildItems({ rules: noOverlap, plan: setChange(emptyPlan(), GYM, { amount_minor: 2490 }),
    savingsIds: SAVINGS_IDS, baseCurrency: 'EUR' })
  assert.ok(!planIdeas(tried, sig).some((i) => i.ruleIds.includes(GYM.id)))
})

test('ideas: an overlap disappears once any of its payments changes; biggest needs 3+ expenses', () => {
  const plan = setChange(emptyPlan(), DISNEY, { amount_minor: 799 })
  const list = items(plan)
  assert.ok(!planIdeas(list, signalsFor(list)).some((i) => i.kind === 'overlap'))
  const few = buildItems({ rules: [SALARY, GYM, CAR], plan: emptyPlan(), baseCurrency: 'EUR' })
  assert.deepEqual(planIdeas(few, signalsFor(few)), [])
})

test('overlap picker: dearest first, nothing picked saves nothing, picks add up', () => {
  const list = items()
  const idea = planIdeas(list, signalsFor(list))[0]
  let pick = overlapPick(list, idea, new Set())
  assert.deepEqual(pick.rows.map((r) => r.name), ['Netflix', 'Spotify', 'Disney+'])
  assert.equal(pick.saves, 0)
  pick = overlapPick(list, idea, new Set([NETFLIX.id, DISNEY.id]))
  assert.equal(pick.saves, (1399 + 899) * 12)
})

test('apply selection: only the ticked changes are sent; the rest stay in the plan', () => {
  let plan = setChange(emptyPlan(), NETFLIX, { cancel: true })
  plan = setChange(plan, GYM, { amount_minor: 2490 })
  plan = upsertAdd(plan, { id: 'add-1', kind: 'income', name: 'Tutoring', amount_minor: 12000, currency: 'EUR',
    frequency: 'monthly', interval_n: 1, start: '2026-10-01', category_id: null })
  plan = dismissIdea(plan, 'biggest:x')
  const list = items(plan)
  const sel = applySelection(list, plan, new Set([NETFLIX.id, GYM.id, 'add-1']))
  assert.deepEqual(sel.apply, {
    changes: [
      { rule_id: NETFLIX.id, cancel: true },
      { rule_id: GYM.id, amount_minor: 2490, currency: 'EUR', frequency: 'monthly', interval_n: 1 },
    ],
    adds: [{ kind: 'income', description: 'Tutoring', amount_minor: 12000, currency: 'EUR', frequency: 'monthly',
      interval_n: 1, next_run: '2026-10-01', category_id: null }],
  })
  assert.equal(sel.count, 3)
  assert.equal(sel.effect, (1399 + 1500 + 12000) * 12)
  assert.deepEqual(sel.remaining, { ...emptyPlan(), dismissed: ['biggest:x'] })
  // Unticked: stays.
  const some = applySelection(list, plan, new Set([GYM.id]))
  assert.deepEqual(some.remaining.changes.map((c) => c.rule_id), [NETFLIX.id])
  assert.deepEqual(some.remaining.adds.map((a) => a.id), ['add-1'])
  assert.equal(some.effect, 1500 * 12)
})

test('undo state: undo for 24 hours, then a quiet note for a week', () => {
  const at = '2026-09-26T12:00:00Z'
  assert.equal(undoState(null), null)
  const open = undoState({ applied_at: at, change_count: 4 }, new Date('2026-09-27T11:00:00Z'))
  assert.deepEqual(open, { canUndo: true, count: 4, until: new Date('2026-09-27T12:00:00Z') })
  const late = undoState({ applied_at: at, change_count: 4 }, new Date('2026-09-27T12:00:01Z'))
  assert.equal(late.canUndo, false)
  assert.equal(late.count, 4)
  assert.equal(undoState({ applied_at: at, change_count: 4 }, new Date('2026-10-05T12:00:00Z')), null)
})
