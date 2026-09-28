import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  yearMinor, monthOf, inView, emptyPlan, isEmptyPlan, normalisePlan, planRules, buildItems, planGroups,
  planSummary, effectOf, setChange, resetChange, cancelRules, upsertAdd, removeAdd, dismissIdea, reconcile,
  acknowledge, priceRises, recentMonths, overBudgetMonths, signalsFor, rowTag, planIdeas, overlapPick,
  applySelection, undoState, snapOf, rateNeeds, startOver, tryIdea, MAX_IDEAS,
  SALARY_ID, salaryCategoryId, salaryWindow, derivedSalary, setSalary, resetSalary, applicable, headline,
  asShown,
} from '../src/features/plan/planMath.js'
import { SERVICE_TYPES, isEssential, serviceTypes } from '../src/features/plan/planCatalog.js'

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

test('groups: Income, then Bills (home, utilities, health… by key or icon), then Subscriptions; totals follow the plan', () => {
  const plan = setChange(emptyPlan(), NETFLIX, { cancel: true })
  const groups = planGroups(items(plan))
  assert.deepEqual(groups.map((g) => g.key), ['income', 'bills', 'subscriptions'])
  assert.deepEqual(groups.map((g) => g.items.map((i) => i.name)), [
    ['Salary'], ['Rent'], ['Netflix', 'Spotify', 'Disney+', 'Gym', 'Car insurance'],
  ])
  assert.equal(groups[1].total, 12 * 115000)
  assert.equal(groups[2].total, 12 * (1099 + 899 + 3990) + 48000)
  // The user's own category counts by its icon; an add by its category.
  const phone = { ...rule(30, 'Phone', 2000, { category_id: id(930) }), categories: { name: 'Mobile', icon: 'phone' } }
  const ELEC = id(931)
  const withAdd = upsertAdd(emptyPlan(), {
    id: 'a1', kind: 'expense', name: 'Power', amount_minor: 5000, currency: 'EUR', frequency: 'monthly',
    interval_n: 1, start: '2026-10-01', category_id: ELEC,
  })
  const list = buildItems({
    rules: [phone], plan: withAdd, baseCurrency: 'EUR',
    categoriesById: new Map([[ELEC, { name: 'Electricity', icon: 'electricity' }]]),
  })
  assert.deepEqual(list.map((i) => i.group), ['bills', 'bills'])
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
  assert.equal(gym.group, 'subscriptions', 'rows keep their place while edited')

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
  // Netflix and Disney+ are both video: an overlap. Spotify (music) is alone.
  assert.deepEqual(sig.get(NETFLIX.id).overlap, { type: 'video', count: 2 })
  assert.equal(sig.get(SPOTIFY.id), undefined)
  assert.equal(rowTag(list.find((i) => i.id === NETFLIX.id), sig).kind, 'priceUp')
  assert.equal(rowTag(list.find((i) => i.id === NETFLIX.id), sig).pct, 17)
  assert.equal(rowTag(list.find((i) => i.id === DISNEY.id), sig).kind, 'overlap')
  assert.equal(rowTag(list.find((i) => i.id === GYM.id), sig).kind, 'overBudget')
  assert.equal(rowTag(list.find((i) => i.id === RENT.id), sig), null)
  const changed = items(setChange(emptyPlan(), DISNEY, { cancel: true }))
  assert.equal(rowTag(changed.find((i) => i.id === DISNEY.id), sig), null)
})

test('ideas: overlap, price up, over budget, biggest saver — each rule once, at most 3', () => {
  const list = items()
  const ideas = planIdeas(list, signalsFor(list, SIGNALS_OPTS))
  assert.equal(ideas.length, MAX_IDEAS)
  const [overlap, second, third] = ideas
  assert.equal(overlap.id, 'overlap:video')
  assert.equal(overlap.type, 'video')
  assert.deepEqual(overlap.ruleIds, [NETFLIX.id, DISNEY.id], 'dearest first')
  assert.equal(overlap.year, (1399 + 899) * 12)
  assert.equal(overlap.saves, 899 * 12, 'keeping the dearest one')
  // Netflix is already in the overlap, so its price rise isn't an idea of its own.
  assert.equal(second.id, `overBudget:${GYM.id}`)
  assert.deepEqual(second.months, ['2026-08-01', '2026-09-01'])
  // Biggest saver: the dearest non-essential expense not used yet. Car
  // insurance costs more but is essential; rent is housing.
  assert.equal(third.id, `biggest:${SPOTIFY.id}`)
  assert.equal(third.saves, 1099 * 12)
})

test('ideas: price up shows when its rule is free; dismissed and tried ideas disappear', () => {
  const noOverlap = RULES.filter((r) => r.id !== SPOTIFY.id && r.id !== DISNEY.id)
  const list = buildItems({ rules: noOverlap, plan: emptyPlan(), savingsIds: SAVINGS_IDS, baseCurrency: 'EUR' })
  const sig = signalsFor(list, SIGNALS_OPTS)
  let ideas = planIdeas(list, sig)
  // Nothing non-essential is left for "biggest saver" (rent and car insurance are essential).
  assert.deepEqual(ideas.map((i) => i.kind), ['priceUp', 'overBudget'])
  assert.deepEqual(ideas[0].rise.pct, 17)
  // Dismissed: gone, and Netflix is free for the biggest saver.
  ideas = planIdeas(list, sig, [`priceUp:${NETFLIX.id}`])
  assert.deepEqual(ideas.map((i) => i.id), [`overBudget:${GYM.id}`, `biggest:${NETFLIX.id}`])
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
  assert.deepEqual(pick.rows.map((r) => r.name), ['Netflix', 'Disney+'])
  assert.equal(pick.saves, 0)
  pick = overlapPick(list, idea, new Set([NETFLIX.id, DISNEY.id]))
  assert.equal(pick.saves, (1399 + 899) * 12)
})

// ---- The service catalogue and essentials (planCatalog) ------------------------------

test('catalogue: matches names whatever the case, accents, spacing and extra words', () => {
  assert.deepEqual(serviceTypes('Apple ICloud '), ['cloud'])
  assert.deepEqual(serviceTypes('iCloud+ 200GB'), ['cloud'])
  assert.deepEqual(serviceTypes('Netflix.com'), ['video'])
  assert.deepEqual(serviceTypes('NETFLIX   Premium'), ['video'])
  assert.deepEqual(serviceTypes('Disney+'), ['video'])
  assert.deepEqual(serviceTypes('Dísney Plus'), ['video'])
  assert.deepEqual(serviceTypes('SPOTIFY family'), ['music'])
  assert.deepEqual(serviceTypes('Microsoft 365 Family'), ['cloud'])
  assert.deepEqual(serviceTypes('NordVPN'), ['vpn'])
  assert.deepEqual(serviceTypes('Proton  VPN'), ['vpn'])
  assert.deepEqual(serviceTypes('Amazon Prime Video'), ['video'])
  assert.deepEqual(serviceTypes('HBO Max'), ['video'])
  assert.deepEqual(serviceTypes('Max'), ['video'], 'Max alone is the service')
  assert.deepEqual(serviceTypes('Καθημερινή'), ['news'])
  // More than one type.
  assert.deepEqual(serviceTypes('YOUTUBE PREMIUM'), ['video', 'music'])
  assert.deepEqual(SERVICE_TYPES, ['video', 'music', 'cloud', 'vpn', 'news'])
})

test('catalogue: no false positives — whole words only, nothing fuzzy', () => {
  for (const name of ['Mobile Vikings', 'KBC monthly charges', 'Revolut', 'JIMS', 'Flighty', 'Amazon Prime',
    'Max gym', 'Maxi Zoo', 'Tidalwave surf club', 'Spotifyish', 'Disneyland Paris', 'Netflixx', '', null]) {
    assert.deepEqual(serviceTypes(name), [], String(name))
  }
})

test('catalogue: nothing in it is essential', () => {
  for (const name of ['Netflix', 'Spotify', 'iCloud', 'Google One', 'NordVPN', 'New York Times', 'YouTube Premium']) {
    assert.equal(isEssential({ name, category: null }), false, name)
  }
})

test('essentials: by the category (default key or icon)', () => {
  assert.equal(isEssential({ name: 'Anything', category: { name: 'Housing', default_key: 'housing' } }), true)
  assert.equal(isEssential({ name: 'Anything', category: { name: 'Utilities', default_key: 'utilities' } }), true)
  assert.equal(isEssential({ name: 'Anything', category: { name: 'Health', default_key: 'health' } }), true)
  assert.equal(isEssential({ name: 'Anything', category: { name: 'Mine', icon: 'insurance' } }), true)
  assert.equal(isEssential({ name: 'Anything', category: { name: 'Mine', icon: 'taxes' } }), true)
  assert.equal(isEssential({ name: 'Anything', category: { name: 'Fun', default_key: 'entertainment' } }), false)
  // The user's own category name counts too.
  assert.equal(isEssential({ name: 'KBC', category: { name: 'Verzekeringen' } }), true)
})

test('essentials: by keyword, in English, Dutch, French and Greek', () => {
  const essential = [
    // English
    'Car insurance', 'Rent', 'Mortgage', 'Student loan', 'Council tax', 'Electricity', 'Water bill', 'Gas',
    'Energy', 'Heating oil', 'School fees', 'Childcare', 'Pension', 'Dentist',
    // Dutch
    'Autoverzekering', 'Huur', 'Hypotheek', 'Lening auto', 'Wegenbelasting', 'Elektriciteit', 'Energie',
    'Kinderopvang', 'Ziekenfonds', 'Pensioensparen',
    // French
    'Assurance habitation', 'Loyer', 'Prêt auto', 'Impôts', 'Électricité', 'Crèche', 'École', 'Mutuelle',
    // Greek
    'Ασφάλεια αυτοκινήτου', 'ΑΣΦΑΛΕΙΑ ΣΠΙΤΙΟΥ', 'Ενοίκιο', 'Δάνειο', 'Φόρος', 'ΕΝΦΙΑ', 'Ρεύμα', 'ΔΕΗ',
    'Νερό', 'Φυσικό αέριο', 'Σχολείο', 'Σύνταξη',
  ]
  for (const name of essential) assert.equal(isEssential({ name, category: null }), true, name)
  for (const name of ['Taxi', 'Parent club', 'Torrent seedbox', 'Netflix', 'Gym', 'Mobile Vikings', 'Revolut',
    'KBC monthly charges', 'Apple Music', 'Flighty']) {
    assert.equal(isEssential({ name, category: null }), false, name)
  }
})

// The owner's kind of list: nine payments in one broad "Subscriptions"
// category, plus car insurance whose price went up.
const SUBS = id(950)
const SUBS_CAT = { name: 'Subscriptions', icon: 'streaming' }
const sub = (n, name, amount) => ({ ...rule(n, name, amount, { category_id: SUBS }), categories: SUBS_CAT })
const OWNER = [
  sub(60, 'Mobile Vikings', 1500), sub(61, 'JIMS', 2999), sub(62, 'Revolut', 399), sub(63, 'Apple iCloud', 299),
  sub(64, 'Apple Music', 1099), sub(65, 'YouTube Premium', 1399), sub(66, 'KBC monthly charges', 450),
  sub(67, 'Flighty', 599), sub(68, 'Amazon Prime', 699),
]
const CAR_UP = rule(69, 'Car insurance', 7200, { category_id: SUBS, categories: SUBS_CAT })
const CAR_RISE = new Map([[CAR_UP.id, { pct: 12, from: 6429, to: 7200, currency: 'EUR', since: '2026-08-01' }]])

test('the owner’s list: one music overlap (Apple Music + YouTube Premium), nothing grouping the rest', () => {
  const list = buildItems({ rules: [SALARY, ...OWNER], plan: emptyPlan(), baseCurrency: 'EUR' })
  const sig = signalsFor(list)
  const ideas = planIdeas(list, sig)
  const overlaps = ideas.filter((i) => i.kind === 'overlap')
  assert.equal(overlaps.length, 1)
  assert.equal(overlaps[0].type, 'music')
  assert.deepEqual(overlaps[0].ruleIds, [id(65), id(64)], 'YouTube Premium (dearer) first')
  assert.deepEqual([...sig].filter(([, s]) => s.overlap).map(([k]) => k).sort(), [id(64), id(65)])
  // No category-based overlap any more, even with nine in one category.
  assert.ok(!ideas.some((i) => i.id === `overlap:${SUBS}`))
})

test('car insurance: never a cancel idea; a price rise is worth comparing offers', () => {
  const list = buildItems({ rules: [SALARY, ...OWNER, CAR_UP], plan: emptyPlan(), baseCurrency: 'EUR' })
  const sig = signalsFor(list, { rises: CAR_RISE, overCats: new Map([[SUBS, ['2026-09-01']]]) })
  const ideas = planIdeas(list, sig)
  const car = ideas.find((i) => i.ruleIds.includes(CAR_UP.id))
  assert.equal(car.kind, 'compare')
  assert.equal(car.id, `compare:${CAR_UP.id}`)
  assert.equal(car.saves, 0, 'nothing pre-cancelled')
  assert.equal(car.rise.pct, 12)
  assert.equal(car.riseYear, Math.round((7200 * 12 * (7200 - 6429)) / 7200))
  // Its row shows the price rise, never overlap or over budget.
  const row = list.find((i) => i.id === CAR_UP.id)
  assert.deepEqual(rowTag(row, sig), { kind: 'priceUp', pct: 12 })
  assert.equal(sig.get(CAR_UP.id).overBudget, undefined)
  // Without a rise it's in no idea at all, however dear it is.
  const calm = signalsFor(list, { overCats: new Map([[SUBS, ['2026-09-01']]]) })
  const none = planIdeas(list, calm)
  assert.ok(!none.some((i) => i.ruleIds.includes(CAR_UP.id)))
  // A non-essential rise stays a cancel idea.
  const rises = new Map([[id(61), { pct: 10, from: 2726, to: 2999, currency: 'EUR', since: '2026-08-01' }]])
  const gymUp = planIdeas(list, signalsFor(list, { rises }))
  assert.ok(gymUp.some((i) => i.id === `priceUp:${id(61)}` && i.saves === 2999 * 12))
})

test('biggest saver and over budget skip essentials', () => {
  const HOME_INS = rule(70, 'Home insurance', 9000, { category_id: FIT })
  const list = buildItems({ rules: [SALARY, RENT, CAR, HOME_INS, GYM, SPOTIFY], plan: emptyPlan(), baseCurrency: 'EUR' })
  const sig = signalsFor(list, { overCats: new Map([[FIT, ['2026-09-01']], [HOME, ['2026-09-01']]]) })
  // Over budget: gym, not the dearer home insurance in the same category, nor rent.
  assert.equal(sig.get(HOME_INS.id)?.overBudget, undefined)
  assert.equal(sig.get(RENT.id)?.overBudget, undefined)
  assert.equal(rowTag(list.find((i) => i.id === HOME_INS.id), sig), null)
  const ideas = planIdeas(list, sig)
  assert.deepEqual(ideas.map((i) => i.id), [`overBudget:${GYM.id}`, `biggest:${SPOTIFY.id}`])
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

test('Start over drops every change and add but keeps the dismissed ideas', () => {
  let plan = setChange(emptyPlan(), NETFLIX, { cancel: true })
  plan = upsertAdd(plan, {
    id: 'a1', kind: 'income', name: 'Tutoring', amount_minor: 12000, currency: 'EUR', frequency: 'monthly',
    interval_n: 1, start: '2026-10-01',
  })
  plan = dismissIdea(plan, 'biggest:x')
  assert.deepEqual(startOver(plan), { ...emptyPlan(), dismissed: ['biggest:x'] })
  assert.equal(isEmptyPlan(startOver(setChange(emptyPlan(), GYM, { cancel: true }))), true)
})

test('trying an idea cancels its picked rules and retires the idea, even after a reset', () => {
  const list = items()
  const signals = signalsFor(list)
  const overlap = planIdeas(list, signals).find((i) => i.kind === 'overlap')
  let plan = tryIdea(emptyPlan(), overlap, [NETFLIX])
  assert.deepEqual(plan.changes.map((c) => [c.rule_id, c.cancel]), [[NETFLIX.id, true]])
  assert.ok(plan.dismissed.includes(overlap.id))
  plan = resetChange(plan, NETFLIX.id)
  assert.equal(planIdeas(items(plan), signals, plan.dismissed).some((i) => i.id === overlap.id), false)
})

// ---- Salary from entries, and the payments view ------------------------------------

const NO_PAY_RULES = RULES.filter((r) => r !== SALARY)
const entry = (spent_at, amount_minor, extra = {}) => ({
  id: `t-${spent_at}-${amount_minor}`, kind: 'income', category_id: PAY, amount_minor, currency: 'EUR',
  exchange_rate: 1, spent_at, ...extra,
})
const TODAY = '2026-09-27' // the full months looked at: June, July, August
const derive = (entries, extra = {}) => derivedSalary({
  rules: NO_PAY_RULES, savingsIds: SAVINGS_IDS, categoryId: PAY, entries, todayISO: TODAY, baseCurrency: 'EUR', ...extra,
})
const SAL = derive([entry('2026-06-25', 300000), entry('2026-07-24', 310000), entry('2026-08-25', 320000)])
const salaryItems = (plan = emptyPlan(), salary = SAL) => buildItems({
  rules: NO_PAY_RULES, plan, savingsIds: SAVINGS_IDS, baseCurrency: 'EUR', salary,
  categoriesById: new Map([[PAY, cats[PAY]]]),
})
const EXPENSES_YEAR = (115000 + 1399 + 1099 + 899 + 3990) * 12 + 48000

test('salary category: the profile’s choice, else the default Salary income category', () => {
  const cat = (cid, extra) => ({ id: cid, kind: 'income', default_key: null, is_archived: false, ...extra })
  const list = [cat('c-bonus'), cat('c-old', { default_key: 'salary', is_archived: true }), cat('c-pay', { default_key: 'salary' }),
    { id: 'c-exp', kind: 'expense', default_key: 'salary' }]
  assert.equal(salaryCategoryId({ salary_category_id: 'c-bonus' }, list), 'c-bonus')
  assert.equal(salaryCategoryId({ salary_category_id: null }, list), 'c-pay')
  assert.equal(salaryCategoryId(null, [list[1]]), 'c-old', 'an archived Salary still counts when it’s the only one')
  assert.equal(salaryCategoryId({}, [cat('c-bonus'), list[3]]), null)
})

test('salary window: the 3 full months before this one, in the local calendar', () => {
  assert.deepEqual(salaryWindow(TODAY), { from: '2026-06-01', to: '2026-08-31', months: ['2026-06-01', '2026-07-01', '2026-08-01'] })
  assert.deepEqual(salaryWindow('2026-01-01'), { from: '2025-10-01', to: '2025-12-31', months: ['2025-10-01', '2025-11-01', '2025-12-01'] })
  assert.equal(salaryWindow('2024-03-31').to, '2024-02-29')
})

test('derived salary: the average over the months that had entries (1, 2 or 3), this month left out', () => {
  assert.deepEqual(SAL, { state: 'derived', categoryId: PAY, amount_minor: 310000, months: 3 })
  // A new user: one month is not divided by 3.
  assert.deepEqual(derive([entry('2026-08-25', 300000)]), { state: 'derived', categoryId: PAY, amount_minor: 300000, months: 1 })
  // Two months; a month with two entries (salary + bonus) is summed first.
  const two = derive([entry('2026-07-25', 300000), entry('2026-08-10', 300000), entry('2026-08-25', 21000)])
  assert.equal(two.amount_minor, Math.round((300000 + 321000) / 2))
  assert.equal(two.months, 2)
  // This month and anything before June don't count; nor other categories or kinds.
  const noise = [entry('2026-09-25', 999999), entry('2026-05-29', 999999), entry('2026-08-25', 5000, { category_id: 'other' }),
    entry('2026-08-25', 5000, { kind: 'expense' })]
  assert.deepEqual(derive(noise), { state: 'none', categoryId: PAY })
  assert.equal(derive([...noise, entry('2026-08-25', 300000)]).amount_minor, 300000)
  // Foreign entries at their captured rate.
  assert.equal(derive([entry('2026-08-25', 100000, { currency: 'USD', exchange_rate: 0.9 })]).amount_minor, 90000)
  assert.deepEqual(derive([], { categoryId: null }), { state: 'none' })
})

test('derived salary: salary paid late counts in the next month while the salary shift is on', () => {
  const shift = { fromDay: 25, categoryId: PAY }
  const rows = [entry('2026-05-28', 300000), entry('2026-06-28', 310000), entry('2026-08-28', 999999)]
  // May 28 → June, June 28 → July, Aug 28 → September (this month: left out).
  assert.equal(derive(rows, { salaryShift: shift }).amount_minor, 305000)
  assert.equal(derive(rows).amount_minor, Math.round((310000 + 999999) / 2))
})

test('derived salary: an active recurring salary rule takes precedence; a paused one doesn’t', () => {
  const rows = [entry('2026-08-25', 300000)]
  assert.deepEqual(derive(rows, { rules: RULES }), { state: 'rule', categoryId: PAY })
  assert.equal(derive(rows, { rules: [...NO_PAY_RULES, { ...SALARY, is_active: false }] }).state, 'derived')
  // A recurring income in another category doesn't replace the salary.
  assert.equal(derive(rows, { rules: [...NO_PAY_RULES, rule(20, 'Tutoring', 20000, { kind: 'income' })] }).state, 'derived')
  // With the rule, no Salary row: the rule is the salary.
  assert.equal(salaryItems(emptyPlan(), derive(rows, { rules: RULES })).some((i) => i.salary), false)
})

test('the Salary row: first in Income, monthly in the base currency, counts in the net', () => {
  const list = salaryItems()
  const s = list[0]
  assert.equal(s.id, SALARY_ID)
  assert.equal(s.salary, true)
  assert.equal(s.group, 'income')
  assert.deepEqual(s.before, { amount_minor: 310000, currency: 'EUR', frequency: 'monthly', interval_n: 1 })
  assert.equal(s.beforeYear, 310000 * 12)
  assert.equal(s.changed, false)
  assert.equal(s.category, cats[PAY])
  const sum = planSummary(list)
  assert.equal(sum.mode, 'net')
  assert.equal(sum.before, 310000 * 12 - EXPENSES_YEAR)
  assert.deepEqual(planGroups(list)[0].items.map((i) => i.id), [SALARY_ID])
  assert.equal(salaryItems(emptyPlan(), { state: 'none' }).some((i) => i.salary), false)
})

test('the Salary row: a what-if raise and switching it off live in plan.salary; back to the average drops it', () => {
  let plan = setSalary(emptyPlan(), { amount_minor: 330000 }, 310000)
  assert.deepEqual(plan.salary, { amount_minor: 330000 })
  assert.equal(isEmptyPlan(plan), false)
  let s = salaryItems(plan)[0]
  assert.equal(s.changed, true)
  assert.equal(s.after.amount_minor, 330000)
  assert.equal(effectOf(s), 20000 * 12)
  assert.equal(planSummary(salaryItems(plan)).delta, 20000 * 12)
  // Off: counts nothing; on again keeps the raise.
  plan = setSalary(plan, { cancel: true }, 310000)
  s = salaryItems(plan)[0]
  assert.equal(s.cancelled, true)
  assert.equal(s.afterYear, 0)
  assert.equal(effectOf(s), -310000 * 12)
  plan = setSalary(plan, { cancel: false }, 310000)
  assert.deepEqual(plan.salary, { amount_minor: 330000 })
  // Back to the average: no change left.
  assert.equal('salary' in setSalary(plan, { amount_minor: 310000 }, 310000), false)
  assert.equal('salary' in resetSalary(setSalary(plan, { cancel: true }, 310000)), false)
  // Clear plan clears it too.
  assert.equal('salary' in startOver(plan), false)
})

test('the salary change survives a round trip, and a malformed one is dropped', () => {
  const only = setSalary(emptyPlan(), { cancel: true }, 310000)
  assert.equal(isEmptyPlan(only), false, 'a salary-only plan is a plan (0096 keeps it)')
  assert.deepEqual(normalisePlan(only), only)
  assert.deepEqual(normalisePlan({ v: 1, changes: [], adds: [], dismissed: [], salary: { amount_minor: -5, cancel: 'yes', x: 1 } }),
    emptyPlan())
  assert.deepEqual(normalisePlan({ v: 1, salary: { amount_minor: 330000, x: 1 } }).salary, { amount_minor: 330000 })
})

test('apply: the salary change is plan-only — never sent, and it stays in the plan', () => {
  let plan = setSalary(emptyPlan(), { amount_minor: 330000 }, 310000)
  plan = setChange(plan, NETFLIX, { cancel: true })
  const list = salaryItems(plan)
  assert.deepEqual(applicable(list).map((i) => i.id), [NETFLIX.id])
  const sel = applySelection(list, plan, new Set([SALARY_ID, NETFLIX.id]))
  assert.deepEqual(sel.apply, { changes: [{ rule_id: NETFLIX.id, cancel: true }], adds: [] })
  assert.equal(sel.count, 1)
  assert.equal(sel.effect, 1399 * 12)
  assert.deepEqual(sel.remaining.salary, { amount_minor: 330000 })
  assert.equal(sel.remaining.changes.length, 0)
  assert.equal(isEmptyPlan(sel.remaining), false)
})

test('plans follow reality: a new recurring salary rule or no entries drops the salary change', () => {
  const plan = setChange(setSalary(emptyPlan(), { amount_minor: 330000 }, 310000), NETFLIX, { cancel: true })
  assert.deepEqual(reconcile(plan, NO_PAY_RULES, SAVINGS_IDS, SAL).dropped, [])
  assert.deepEqual(reconcile(plan, NO_PAY_RULES, SAVINGS_IDS, null).dropped, [], 'entries not read: leave it be')
  assert.deepEqual(reconcile(plan, RULES, SAVINGS_IDS, { state: 'rule', categoryId: PAY }).dropped,
    [{ ruleId: SALARY_ID, name: '', reason: 'salaryRule' }])
  assert.deepEqual(reconcile(plan, NO_PAY_RULES, SAVINGS_IDS, { state: 'none', categoryId: PAY }).dropped,
    [{ ruleId: SALARY_ID, name: '', reason: 'salaryGone' }])
  const ok = acknowledge(plan, RULES, SAVINGS_IDS, { state: 'rule', categoryId: PAY })
  assert.equal('salary' in ok, false)
  assert.deepEqual(ok.changes.map((c) => c.rule_id), [NETFLIX.id])
  assert.deepEqual(acknowledge(plan, NO_PAY_RULES, SAVINGS_IDS, SAL).salary, { amount_minor: 330000 })
})

test('ideas and signals ignore the Salary row', () => {
  const list = salaryItems(setSalary(emptyPlan(), { amount_minor: 330000 }, 310000))
  const signals = signalsFor(list, { rises: new Map([[SALARY_ID, { pct: 10 }]]), overCats: new Map([[PAY, ['2026-08-01']]]) })
  assert.equal(signals.has(SALARY_ID), false)
  assert.equal(planIdeas(list, signals).some((i) => i.ruleIds.includes(SALARY_ID)), false)
})

test('no recurring income: the payments view — a positive total, a saving is a minus', () => {
  let list = salaryItems(emptyPlan(), { state: 'none' })
  let sum = planSummary(list)
  assert.equal(sum.mode, 'payments')
  assert.deepEqual(headline(sum), { mode: 'payments', before: EXPENSES_YEAR, after: EXPENSES_YEAR, change: 0, good: 0 })
  const plan = setChange(setChange(emptyPlan(), NETFLIX, { cancel: true }), GYM, { amount_minor: 4990 })
  list = salaryItems(plan, { state: 'none' })
  sum = planSummary(list)
  const h = headline(sum)
  assert.equal(h.before, EXPENSES_YEAR)
  assert.equal(h.after, EXPENSES_YEAR - 1399 * 12 + 1000 * 12)
  assert.equal(h.change, (-1399 + 1000) * 12, 'payments went down: a minus')
  assert.equal(h.good, (1399 - 1000) * 12, 'more left over: green')
  const netflix = list.find((i) => i.id === NETFLIX.id)
  assert.equal(asShown(effectOf(netflix), sum.mode), -1399 * 12)
  // Payments after applying Netflix only.
  assert.equal(asShown(sum.before + effectOf(netflix), sum.mode), EXPENSES_YEAR - 1399 * 12)
  // In net mode nothing flips.
  assert.equal(asShown(effectOf(netflix), 'net'), 1399 * 12)
  assert.deepEqual(headline({ mode: 'net', before: -5, after: 7, delta: 12 }), { mode: 'net', before: -5, after: 7, change: 12, good: 12 })
})

test('the card switches back to net once there’s any income: salary entries, a rule, or a planned one', () => {
  assert.equal(planSummary(salaryItems(emptyPlan(), SAL)).mode, 'net')
  assert.equal(planSummary(items()).mode, 'net')
  const add = upsertAdd(emptyPlan(), { id: 'a1', kind: 'income', name: 'Tutoring', amount_minor: 12000, currency: 'EUR',
    frequency: 'monthly', interval_n: 1, start: '2026-10-01' })
  assert.equal(planSummary(salaryItems(add, { state: 'none' })).mode, 'net')
  // Switched off in the plan, the salary is still there: net (it would be minus the payments).
  const off = salaryItems(setSalary(emptyPlan(), { cancel: true }, 310000))
  assert.equal(planSummary(off).mode, 'net')
})
