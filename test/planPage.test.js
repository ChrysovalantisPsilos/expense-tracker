// Plan mode as the page shows it (src/features/plan/planPage.js): the state
// from the reads, the edits a tap makes, and the words and figures of every
// part (the header, the notices, the ideas, the rows, Your changes, the
// editors, the picker, the Apply sheet, the what-if preview).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyPlan, setChange, upsertAdd } from '../src/features/plan/planMath.js'
import {
  planState, editItem, toggleItem, dropItem, tryIdeaWith, amountEdit, acknowledgePlan, frequencyOptions, frequencyPick,
  deltaParts, impactParts, appliedParts, realityParts, ideasParts, rowParts, groupsParts, changesParts, planPageParts,
  signalDetail, editorParts, addDraft, addKind, addFormParts, addToSave, pickParts, applySheetParts, whatIfParts,
  whatIfEditorParts, whatIfEmpty, badgeKind, planReads,
} from '../src/features/plan/planPage.js'
import { applyWhatIf, whatIfRows } from '../src/features/plan/whatIfMath.js'
import { setLanguage } from '../mobile-core/index.js'

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ENT = id(900)
const HOME = id(902)
const SAV = id(903)
const PAY = id(904)
const cat = (cid, name, extra = {}) => ({ id: cid, name, kind: 'expense', is_archived: false, ...extra })
const CATS = [
  cat(ENT, 'Entertainment', { default_key: 'entertainment' }),
  cat(HOME, 'Housing', { default_key: 'housing' }),
  cat(SAV, 'Savings', { kind: 'income', default_key: 'savings', is_savings: true }),
  cat(PAY, 'Salary', { kind: 'income', default_key: 'salary' }),
]
const byId = Object.fromEntries(CATS.map((c) => [c.id, c]))
const rule = (n, description, amount_minor, extra = {}) => ({
  id: id(n), kind: 'expense', description, amount_minor, currency: 'EUR', frequency: 'monthly', interval_n: 1,
  next_run: '2026-10-01', end_date: null, is_active: true, category_id: null, categories: null,
  savings_from_income: false, paid_from_savings: false, ...extra,
  ...(extra.category_id ? { categories: byId[extra.category_id] } : {}),
})
const SALARY = rule(1, 'Salary', 325000, { kind: 'income', category_id: PAY })
const RENT = rule(2, 'Rent', 115000, { category_id: HOME })
const NETFLIX = rule(3, 'Netflix', 1399, { category_id: ENT })
const SPOTIFY = rule(4, 'Spotify', 1099, { category_id: ENT })
const APPLE = rule(5, 'Apple Music', 1099, { category_id: ENT })
const SAVE = rule(8, 'Monthly savings', 20000, { kind: 'income', category_id: SAV, savings_from_income: true })
const RULES = [SALARY, RENT, NETFLIX, SPOTIFY, APPLE, SAVE]
const SAVINGS_IDS = new Set([SAV])
const NOW = new Date('2026-09-15T10:00:00Z')
const state = (plan = emptyPlan(), extra = {}) => planState({
  rules: RULES, plan, savingsIds: SAVINGS_IDS, baseCurrency: 'EUR', categories: CATS, ...extra,
})
const ctx = { view: 'month', currency: 'EUR', now: NOW }

test('the state: rows, figures, signals, ideas and the rates notes from the reads', () => {
  const s = state()
  assert.equal(s.items.length, 6)
  assert.equal(s.sum.mode, 'net')
  assert.equal(s.reality.dropped.length, 0)
  assert.ok(s.signals.get(SPOTIFY.id).overlap)
  assert.deepEqual(s.ideas.map((i) => i.kind), ['overlap', 'biggest'])
  assert.deepEqual(s.rates, { converted: false, missing: [] })
  const usd = planState({ rules: [rule(20, 'Cloud', 999, { currency: 'USD' })], plan: emptyPlan(), savingsIds: new Set(), baseCurrency: 'EUR' })
  assert.equal(usd.rates.missing.length, 1)
})

test('the edits: a change to a rule, the switch, undo, an idea tried', () => {
  const s = state()
  const net = s.items.find((i) => i.id === NETFLIX.id)
  const edited = editItem(emptyPlan(), net, RULES, { amount_minor: 999 })
  assert.deepEqual(edited.changes.map((c) => [c.rule_id, c.amount_minor, c.snap.name]), [[NETFLIX.id, 999, 'Netflix']])
  const off = toggleItem(emptyPlan(), net, RULES)
  assert.equal(off.changes[0].cancel, true)
  const cancelled = state(off).items.find((i) => i.id === NETFLIX.id)
  assert.equal(toggleItem(off, cancelled, RULES).changes.length, 0)
  assert.equal(dropItem(edited, state(edited).items.find((i) => i.id === NETFLIX.id)).changes.length, 0)
  const added = upsertAdd(emptyPlan(), { id: 'a1', kind: 'expense', name: 'Gym', amount_minor: 3990, currency: 'EUR', frequency: 'monthly', interval_n: 1, start: '2026-10-01', category_id: null })
  const gym = state(added).items.find((i) => i.id === 'a1')
  assert.equal(toggleItem(added, gym, RULES).adds.length, 0)
  assert.equal(dropItem(added, gym).adds.length, 0)
  const overlap = s.ideas[0]
  const tried = tryIdeaWith(emptyPlan(), overlap, RULES, [SPOTIFY.id])
  assert.deepEqual(tried.changes.map((c) => c.rule_id), [SPOTIFY.id])
  assert.deepEqual(tried.dismissed, [overlap.id])
  assert.deepEqual(amountEdit('12.50', 'EUR'), { amount_minor: 1250 })
  assert.equal(amountEdit('', 'EUR'), null)
  assert.equal(amountEdit('0', 'EUR'), null)
})

test('a derived salary row: its edit stays in the plan', () => {
  const salary = { state: 'derived', categoryId: PAY, amount_minor: 300000, months: 3 }
  const rules = RULES.filter((r) => r !== SALARY)
  const s = planState({ rules, plan: emptyPlan(), savingsIds: SAVINGS_IDS, baseCurrency: 'EUR', categories: CATS, salary })
  const row = s.items[0]
  assert.equal(row.salary, true)
  const plan = editItem(emptyPlan(), row, rules, { amount_minor: 310000 })
  assert.deepEqual(plan.salary, { amount_minor: 310000 })
  const parts = editorParts(state(plan, { rules, salary }).items[0], null, 'EUR', NOW)
  assert.equal(parts.frequency, null)
  assert.match(parts.note, /stays in your plan/)
  assert.equal(parts.help, 'Your average: €3,000.00 a month')
  assert.equal(parts.text, '3100.00')
  assert.equal(parts.resetText, '3000.00')
  // Gone from the entries: the banner says so, OK drops it.
  const gone = acknowledgePlan(plan, { rules, savingsIds: SAVINGS_IDS, salary: { state: 'none' } })
  assert.equal(gone.salary, undefined)
  const reality = planState({ rules, plan, savingsIds: SAVINGS_IDS, baseCurrency: 'EUR', salary: { state: 'none' } }).reality
  assert.match(realityParts(reality).lines[0].text, /^No salary entries/)
})

test('the header: the figure, the chip, was, savings, the sum and the notes', () => {
  const plan = setChange(emptyPlan(), NETFLIX, { cancel: true })
  const h = impactParts(state(plan), 'month', 'EUR')
  assert.equal(h.label, 'Left over a month')
  assert.equal(h.delta.text, '+€13.99 a month')
  assert.equal(h.delta.good, 13.99 * 100 * 12)
  assert.match(h.was, /^was <s>€[\d,.]+<\/s>$/)
  assert.equal(h.saved, 'After €200.00 a month into savings')
  assert.deepEqual(h.steps.steps.map((x) => x.key), ['income', 'payments', 'savings'])
  assert.equal(h.steps.total.label, 'Left over')
  assert.ok(h.steps.total.was)
  assert.equal(h.incomeHint, false)
  assert.equal(h.converted, null)
  const none = impactParts(state(), 'year', 'EUR')
  assert.deepEqual([none.delta.text, none.was], ['No changes yet', null])
  // No income: the payments.
  const pay = impactParts(planState({ rules: [RENT], plan: emptyPlan(), savingsIds: new Set(), baseCurrency: 'EUR' }), 'month', 'EUR')
  assert.deepEqual([pay.mode, pay.label, pay.incomeHint, pay.steps], ['payments', 'Recurring payments a month', true, null])
})

test('the notices: just applied with Undo, the quiet note, nothing after a week', () => {
  const s = state()
  const just = appliedParts({ applied_at: '2026-09-15T08:00:00Z', change_count: 2 }, s.sum, 'EUR', NOW)
  assert.equal(just.canUndo, true)
  assert.equal(just.title, 'Applied 2 changes')
  assert.match(just.body, /^Your recurring now leaves €[\d,.]+ a month\./)
  assert.match(just.until, /^Undo available until 16 Sep, \d\d:00$/)
  const yesterday = appliedParts({ applied_at: '2026-09-13T20:00:00Z', change_count: 1 }, s.sum, 'EUR', NOW)
  assert.deepEqual([yesterday.canUndo, yesterday.note], [false, 'Applied 13 Sep · 1 change'])
  assert.equal(appliedParts({ applied_at: '2026-09-01T08:00:00Z', change_count: 1 }, s.sum, 'EUR', NOW), null)
  assert.equal(appliedParts(null, s.sum, 'EUR', NOW), null)
  assert.equal(realityParts({ dropped: [], stale: [] }), null)
})

test('ideas: what each says and what Try it does', () => {
  const parts = ideasParts(state().ideas, 'month', 'EUR', NOW)
  assert.equal(parts.count, '2 ideas')
  const [overlap, biggest] = parts.cards
  assert.deepEqual([overlap.action, overlap.tag.text, overlap.figure.tone], ['pick', 'Overlap', 'positive'])
  assert.match(overlap.title, /^2 music services/)
  assert.equal(overlap.tryLabel, 'Try it')
  assert.equal(biggest.action, 'try')
  assert.match(biggest.dismissLabel, /^Dismiss: /)
  assert.equal(ideasParts([], 'month', 'EUR', NOW).count, null)
})

test('rows: tags, amounts, was, the switch and the updated note', () => {
  const plan = setChange(setChange(emptyPlan(), NETFLIX, { amount_minor: 999 }), RENT, { cancel: true })
  const s = state(plan)
  const groups = groupsParts(s, ctx)
  assert.deepEqual(groups.map((g) => g.title), ['Income', 'Savings', 'Bills', 'Subscriptions'])
  const row = (rid) => groups.flatMap((g) => g.rows).find((r) => r.id === rid)
  const net = row(NETFLIX.id)
  assert.deepEqual([net.state.text, net.amount.text, net.was], ['Changed', '€9.99', '€13.99'])
  const rent = row(RENT.id)
  assert.deepEqual([rent.state.text, rent.amount.struck, rent.amount.tone, rent.was], ['Cancelled', true, 'muted', null])
  assert.equal(rent.toggleLabel, 'Keep Rent')
  assert.equal(row(SALARY.id).amount.tone, 'positive')
  assert.equal(row(SPOTIFY.id).tag.text, 'Overlap')
  assert.equal(row(SPOTIFY.id).meta, 'Monthly · next 1 Oct')
  assert.equal(row(SAVE.id).toggleLabel, 'Stop Monthly savings in the plan')
  // The real rule changed since: the note.
  const stale = rowParts(state(plan, { rules: RULES.map((r) => (r === NETFLIX ? { ...r, amount_minor: 1499 } : r)) })
    .items.find((i) => i.id === NETFLIX.id), { ...ctx, signals: new Map() })
  assert.match(stale.stale, /^<strong>Updated since your plan\.<\/strong> Now €14\.99 a month/)
  assert.deepEqual(stale.look, { key: 'entertainment', tone: 'accent', tint: stale.look.tint })
  assert.equal(badgeKind('savings'), 'income')
})

test('your changes: lines, notes, effects, the total and Apply', () => {
  const added = upsertAdd(setChange(emptyPlan(), NETFLIX, { cancel: true }), {
    id: 'a1', kind: 'expense', name: 'Gym', amount_minor: 3990, currency: 'EUR', frequency: 'monthly', interval_n: 1,
    start: '2026-10-01', category_id: null,
  })
  const parts = changesParts(state(added).sum, 'EUR')
  assert.equal(parts.title, 'Your changes · 2')
  const [net, gym] = parts.rows
  assert.deepEqual([net.line, net.perMonth.text, net.perMonth.tone, net.drop, net.rule], ['€13.99 a month → cancelled', '+€13.99/mo', 'positive', 'Undo this change', NETFLIX.id])
  assert.deepEqual([gym.note, gym.remove, gym.drop, gym.rule], ['Not in your recurring yet', true, 'Remove', null])
  assert.equal(parts.total.perMonth, '−€25.91/mo')
  assert.equal(parts.canApply, true)
  assert.equal(changesParts(state().sum, 'EUR'), null)
})

test('the page: everything at once, the savings category for a new savings item', () => {
  const page = planPageParts(state(), { ...ctx, undo: null, categories: CATS })
  assert.deepEqual([page.empty, page.saved, page.applied, page.reality, page.changes], [false, false, null, null, null])
  assert.equal(page.savingsCategoryId, SAV)
  assert.equal(planPageParts(planState({ rules: [], plan: emptyPlan(), savingsIds: new Set(), baseCurrency: 'EUR' }), ctx).empty, true)
})

test('the editor: the signal in a line, the delta, how often, keep or cancel', () => {
  const s = state()
  const spot = s.items.find((i) => i.id === SPOTIFY.id)
  const parts = editorParts(spot, s.signals.get(spot.id), 'EUR', NOW)
  assert.equal(parts.signal.text, 'One of 2 music services.')
  assert.equal(parts.help, 'Now €10.99 a month')
  assert.deepEqual(parts.delta, { word: 'No change yet', perMonth: '€0.00 a month', perYear: '€0.00 a year', tone: 'muted' })
  assert.equal(parts.frequency.value, 'monthly')
  assert.deepEqual(parts.keep.map((k) => k.label), ['Keep', 'Cancel'])
  assert.equal(parts.canReset, false)
  assert.deepEqual(deltaParts(-24000, 'savings', 'EUR').word, 'You’d set aside more')
  assert.equal(deltaParts(-24000, 'savings', 'EUR').perMonth, '€20.00 a month')
  assert.equal(deltaParts(12000, 'expense', 'EUR').word, 'You’d save')
  assert.equal(signalDetail(null), null)
})

test('how often: the choices, a custom interval first, picking one', () => {
  assert.deepEqual(frequencyOptions({ frequency: 'monthly', interval_n: 3 }).value, 'quarterly')
  const custom = frequencyOptions({ frequency: 'weekly', interval_n: 2 })
  assert.deepEqual([custom.value, custom.options[0]], ['custom', { value: 'custom', label: 'every 2 weeks' }])
  assert.deepEqual(frequencyPick('quarterly'), { frequency: 'monthly', interval_n: 3 })
  assert.equal(frequencyPick('custom'), null)
})

test('what if I add: the draft, its kinds, readiness, the add', () => {
  const draft = addDraft(null, 'EUR', '2026-09-15')
  assert.deepEqual(draft, { kind: 'expense', name: '', currency: 'EUR', text: '', frequency: 'monthly', interval_n: 1, start: '2026-09-15', categoryId: '' })
  let parts = addFormParts(draft, { categories: CATS, currency: 'EUR' })
  assert.deepEqual(parts.kinds.map((k) => k.value), ['expense', 'income', 'savings'])
  assert.deepEqual([parts.ready, parts.submit, parts.noCategory], [false, 'Add to plan', 'No category'])
  assert.deepEqual(parts.categories.map((c) => c.label), ['Entertainment', 'Housing'])
  const savings = addKind({ ...draft, name: 'Fund', text: '50' }, 'savings', CATS)
  assert.equal(savings.categoryId, SAV)
  parts = addFormParts(savings, { categories: CATS, currency: 'EUR' })
  assert.deepEqual([parts.ready, parts.noCategory, parts.categoryLabel], [true, null, 'Savings category'])
  assert.equal(parts.delta.perMonth, '€50.00 a month')
  const add = addToSave(savings, 'x1')
  assert.deepEqual([add.id, add.kind, add.amount_minor, add.category_id], ['x1', 'savings', 5000, SAV])
  assert.equal(addToSave({ ...savings, categoryId: '' }, 'x1'), null)
  assert.equal(addToSave({ ...savings, start: '' }, 'x1'), null)
  const back = addDraft(add, 'EUR', '2026-09-15')
  assert.deepEqual([back.text, back.categoryId], ['50.00', SAV])
  assert.equal(addFormParts(back, { categories: CATS, currency: 'EUR', editing: true }).submit, 'Save')
  // A currency without a rate yet: no delta.
  assert.equal(addFormParts({ ...savings, currency: 'USD' }, { categories: CATS, currency: 'EUR' }).delta.word, 'No change yet')
})

test('the overlap picker: dearest first, the ticks, the saving', () => {
  const s = state()
  const idea = s.ideas[0]
  const none = pickParts(s.items, idea, [], 'EUR')
  assert.deepEqual([none.summary.label, none.summary.sub, none.add, none.picked], ['Nothing picked yet', 'Tick one or more to see the saving', 'Add to plan', []])
  const one = pickParts(s.items, idea, [APPLE.id], 'EUR')
  assert.deepEqual([one.summary.label, one.summary.amount, one.add, one.picked], ['Cancel 1 of 2', '+€10.99 a month', 'Add 1 to plan', [APPLE.id]])
  assert.equal(one.title, '2 music services')
})

test('the Apply sheet: every applicable change, unticking, the figure after', () => {
  const plan = setChange(setChange(emptyPlan(), NETFLIX, { cancel: true }), SPOTIFY, { amount_minor: 899 })
  const s = state(plan)
  const all = applySheetParts(s.sum, 'EUR', [], NOW)
  assert.deepEqual(all.rows.map((r) => [r.line, r.on]), [['Stops it · its history is kept', true], ['€8.99 a month from 1 Oct', true]])
  assert.equal(all.submit, 'Apply 2 changes')
  const one = applySheetParts(s.sum, 'EUR', [NETFLIX.id], NOW)
  assert.deepEqual([one.picked, one.submit], [[SPOTIFY.id], 'Apply 1 change'])
  assert.equal(one.after.label, 'Left over after applying')
  assert.notEqual(one.after.value, all.after.value)
})

test('type a what-if: the preview, its editor, why nothing landed, the ids made beforehand', () => {
  const s = state()
  const rows = whatIfRows({
    changes: [{ rule_id: NETFLIX.id, cancel: true }],
    adds: [{ kind: 'expense', name: 'Gym', amount_minor: 4000, currency: 'EUR', repeat: 'monthly' }],
  }, s.items, SAV)
  const parts = whatIfParts(rows, rows.map((r) => r.id), ['Hulu'])
  assert.deepEqual(parts.rows.map((r) => [r.name, r.suggested, r.line]), [['Netflix', true, 'Cancel (−€13.99 a month)'], ['Gym', true, 'Add €40.00 a month']])
  assert.deepEqual([parts.ready, parts.add, parts.notFound], [2, 'Add 2 to plan', 'Not found among your recurring payments, income and savings: Hulu.'])
  assert.equal(whatIfParts(rows, [], []).add, 'Add to plan')
  const editor = whatIfEditorParts(rows[0])
  assert.deepEqual([editor.add, editor.cancelled, editor.choice, editor.text], [false, true, 'cancel', '13.99'])
  assert.equal(whatIfEditorParts(rows[1]).add, true)
  assert.equal(whatIfEmpty(rows), null)
  assert.match(whatIfEmpty([], ['Hulu']), /^Couldn’t find Hulu/)
  assert.match(whatIfEmpty([]), /^Couldn’t tell what to change/)
  const res = applyWhatIf(emptyPlan(), rows, rows.map((r) => r.id), { rules: RULES, todayISO: '2026-09-15', ids: ['new-1'], savingsCategoryId: SAV })
  assert.deepEqual(res.plan.adds.map((a) => a.id), ['new-1'])
  assert.deepEqual(res.added.addIds, ['new-1'])
})

test('what the page reads: the salary months (shifted), six months of charges, three of budgets', () => {
  assert.deepEqual(planReads('2026-09-15'), {
    income: { from: '2026-06-01', to: '2026-08-31' }, charges: { from: '2026-04-01', to: '2026-09-30' },
    budgetMonths: ['2026-07-01', '2026-08-01', '2026-09-01'],
  })
  assert.equal(planReads('2026-01-10', { fromDay: 25, categoryId: PAY }).income.from, '2025-09-25')
})

test('the parts follow the app\'s language', () => {
  setLanguage('el')
  try {
    assert.notEqual(impactParts(state(), 'month', 'EUR').label, 'Left over a month')
  } finally {
    setLanguage('en')
  }
})
