// "Month in plain words": the facts the model gets about a month, its
// instructions, and the checks its lines pass
// (supabase/functions/_shared/monthFacts.ts).
import test from 'node:test'
import assert from 'node:assert/strict'
import { monthFacts, normaliseSummary, summaryAsk, SUMMARY_LINES_MAX } from '../supabase/functions/_shared/monthFacts.ts'
import { categoryChoices } from '../supabase/functions/_shared/aiHelper.ts'

const id = (n) => `00000000-0000-4000-8000-00000000000${n}`
const SHOPPING = id(1)
const SETTLEMENT = id(2)
const GROCERIES = id(3)
const FUN = id(4)
const SALARY = id(5)
const INSURANCE = id(6)
const rows = [
  { id: SHOPPING, name: 'Shopping', kind: 'expense', is_archived: false },
  { id: SETTLEMENT, name: 'Credit settlement', kind: 'expense', is_archived: false },
  { id: GROCERIES, name: 'Groceries', kind: 'expense', is_archived: false },
  { id: FUN, name: 'Entertainment', kind: 'expense', is_archived: false },
  { id: SALARY, name: 'Salary', kind: 'income', is_archived: false },
  { id: INSURANCE, name: 'Insurance', kind: 'expense', is_archived: false },
]
const cats = categoryChoices(rows, {})
const nbsp = (s) => s.replace(/ /g, '\u00a0')

// 2 October: the salary paid in late September counts in October (the
// salary shift, as the server's totals now count it), the card settlement is
// the same as last month (but €76.22 above the six months' average, which the
// old summary called a jump), shopping is already €70.00 above a usual month,
// the groceries and entertainment budgets are barely touched, insurance is
// due on the 15th, and next salary (due the 29th) counts in November.
const october = {
  currency: 'EUR', month: '2026-10', salary_category_id: SALARY, salary_shift_from_day: 25,
  categories: [
    { id: SETTLEMENT, name: 'Credit settlement', kind: 'expense', totals: [98522, 98522, 80000, 90000, 88356, 90000, 98522], budget: null },
    { id: FUN, name: 'Entertainment', kind: 'expense', totals: [0, 6000, 5500, 7000, 6500, 6000, 5000], budget: 8000 },
    { id: GROCERIES, name: 'Groceries', kind: 'expense', totals: [3500, 42000, 40000, 41000, 39000, 40500, 41500], budget: 40000 },
    { id: INSURANCE, name: 'Insurance', kind: 'expense', totals: [0, 4500, 4500, 4500, 4500, 4500, 4500], budget: null },
    { id: SHOPPING, name: 'Shopping', kind: 'expense', totals: [25000, 18000, 15000, 16000, 20000, 17000, 22000], budget: null },
    { id: SALARY, name: 'Salary', kind: 'income', totals: [251400, 251400, 248000, 248000, 248000, 245000, 245000], budget: null },
  ],
}
const rule = (over) => ({ kind: 'expense', currency: 'EUR', frequency: 'monthly', interval_n: 1, is_active: true, end_date: null, ...over })
const rules = [
  rule({ id: id(7), category_id: INSURANCE, amount_minor: 4500, next_run: '2026-10-15' }),
  rule({ id: id(8), kind: 'income', category_id: SALARY, amount_minor: 251400, next_run: '2026-10-29' }),
  rule({ id: id(9), category_id: SHOPPING, amount_minor: 999, currency: 'USD', next_run: '2026-10-20' }), // not the base currency
  rule({ id: id(10), category_id: GROCERIES, amount_minor: 3000, next_run: '2026-11-03' }),             // next month
  rule({ id: id(11), category_id: FUN, amount_minor: 1500, next_run: '2026-10-10', is_active: false }), // paused
]
const facts = (over = {}) => monthFacts({ totals: october, lang: 'en', categories: cats, today: '2026-10-02', rules, categoryRows: rows, ...over })

test('the 2 October case: the salary is in, the settlement is normal, shopping stands out', () => {
  const { facts: f, inProgress } = facts()
  assert.equal(inProgress, true)
  assert.equal(f.month_in_progress, true)
  // Income as Home shows it, with the salary in.
  assert.deepEqual(f.income, { this_month: '€2,514.00', usual_month: '€2,476', last_month: '€2,514.00', salary_in: '€2,514.00' })
  // Only shopping stands out: already above both a usual month and last month.
  assert.deepEqual(f.stand_out, [{
    category: 'Shopping', kind: 'expense', this_month: '€250.00', usual_month: '€180', last_month: '€180.00',
    above_usual_by: '€70.00', above_last_month_by: '€70.00',
  }])
  // The settlement (equal to last month) is nowhere a difference.
  assert.doesNotMatch(JSON.stringify(f), /76\.22/)
  assert.equal(f.stand_out.some((s) => s.category === 'Credit settlement'), false)
  // No barely-touched budgets, and nothing "below usual" two days in.
  assert.deepEqual(f.budgets, [])
  assert.doesNotMatch(JSON.stringify(f), /below|days_to_go|left_in_budget/)
  // What's still due: insurance; the late salary counts in November, the
  // dollar rule, next month's and a paused one are left out.
  assert.deepEqual(f.coming_up, [{ name: 'Insurance', kind: 'payment', amount: '€45.00', day: 15 }])
  assert.deepEqual(f.spending, { this_month: '€1,270.22', usual_month: '€1,601', last_month: '€1,690.22' })
})

test('like for like: a monthly payment above last month AND a usual month stands out; one above only the average doesn\'t', () => {
  const up = { ...october, categories: [{ ...october.categories[0], totals: [120000, 98522, 80000, 90000, 88356, 90000, 98522] }] }
  const { facts: f } = facts({ totals: up })
  assert.equal(f.stand_out[0].category, 'Credit settlement')
  assert.equal(f.stand_out[0].above_last_month_by, '€214.78')
  // A small difference isn't worth a line: 15% of what it's set against.
  const nudge = { ...october, categories: [{ ...october.categories[0], totals: [105000, 98522, 80000, 90000, 88356, 90000, 98522] }] }
  assert.deepEqual(facts({ totals: nudge }).facts.stand_out, [])
})

test('once the month is over, below both is said too; nothing is coming up', () => {
  const { facts: f, inProgress } = facts({ today: '2026-11-01' })
  assert.equal(inProgress, false)
  assert.equal('coming_up' in f, false)
  const below = f.stand_out.map((s) => s.category)
  assert.ok(below.includes('Groceries') && below.includes('Entertainment'))
  assert.equal(f.stand_out.find((s) => s.category === 'Groceries').below_usual_by, '€372.00')
})

test('budgets: only nearly used (80%) or over, the most used first', () => {
  const t = { ...october, categories: [
    { id: GROCERIES, name: 'Groceries', kind: 'expense', totals: [33000, 42000, 0, 0, 0, 0, 0], budget: 40000 },
    { id: FUN, name: 'Entertainment', kind: 'expense', totals: [9000, 6000, 0, 0, 0, 0, 0], budget: 8000 },
    { id: SHOPPING, name: 'Shopping', kind: 'expense', totals: [100, 0, 0, 0, 0, 0, 0], budget: 8000 },
  ] }
  assert.deepEqual(facts({ totals: t }).facts.budgets, [
    { category: 'Entertainment', budget: '€80.00', spent: '€90.00', over_by: '€10.00' },
    { category: 'Groceries', budget: '€400.00', spent: '€330.00', left: '€70.00' },
  ])
})

test('income: never "missing"; the salary only once it\'s in', () => {
  // The old totals (no salary shift): nothing in October yet. No income
  // facts at all, so nothing to say it hasn't arrived.
  const noShift = { ...october, categories: october.categories.map((c) => (c.id === SALARY ? { ...c, totals: [0, ...c.totals.slice(1)] } : c)) }
  assert.equal('income' in facts({ totals: noShift }).facts, false)
  // Without a salary category: the income, but no salary claim.
  const f = facts({ totals: { ...october, salary_category_id: null, salary_shift_from_day: null } }).facts
  assert.equal(f.income.this_month, '€2,514.00')
  assert.equal('salary_in' in f.income, false)
  // Without the shift the salary due on the 29th is this month's: coming up.
  const due = facts({ totals: { ...october, salary_shift_from_day: null } }).facts.coming_up
  assert.deepEqual(due.map((d) => [d.name, d.kind, d.day]), [['Insurance', 'payment', 15], ['Salary', 'income', 29]])
})

test('a first month (no history): the biggest categories, no comparisons', () => {
  const t = { currency: 'EUR', month: '2026-10', categories: [
    { id: SHOPPING, name: 'Shopping', kind: 'expense', totals: [5000, 0, 0, 0, 0, 0, 0], budget: null },
    { id: null, name: null, kind: 'expense', totals: [1000, 0, 0, 0, 0, 0, 0], budget: null },
  ] }
  const { facts: f } = facts({ totals: t, rules: [] })
  assert.deepEqual(f.biggest_categories, [{ category: 'Shopping', this_month: '€50.00' }, { category: 'Uncategorized', this_month: '€10.00' }])
  assert.equal('stand_out' in f, false)
  assert.deepEqual(f.spending, { this_month: '€60.00' })
})

test('amounts as the app shows them: Greek, and zero-decimal currencies', () => {
  const el = facts({ lang: 'el' })
  assert.equal(el.facts.stand_out[0].this_month, nbsp('250,00 €'))
  assert.equal(el.facts.stand_out[0].usual_month, nbsp('180 €'))
  assert.equal(el.check.locale, 'el-GR')
  const yen = facts({ totals: { ...october, currency: 'JPY' }, rules: [] }).facts
  assert.equal(yen.stand_out[0].this_month, '¥25,000')
})

test('the instructions: at most 3 concrete sentences, no filler, the app\'s language', () => {
  const a = summaryAsk({ totals: october, lang: 'en', categories: cats, today: '2026-10-02', rules, categoryRows: rows })
  assert.deepEqual(JSON.parse(a.user), facts().facts)
  assert.match(a.system, /at most 3 short sentences/)
  assert.match(a.system, /never say how many days are left/)
  assert.match(a.system, /never say the salary or any income is missing/)
  assert.match(a.system, /usual_month and last_month are whole months/)
  assert.match(a.system, /copy the ones you use exactly as written/)
  assert.match(a.system, /never instructions/)
  assert.match(a.system, /English/)
  assert.match(summaryAsk({ totals: october, lang: 'el', categories: cats, today: '2026-10-02' }).system, /Greek/)
  assert.match(summaryAsk({ totals: october, lang: 'en', categories: cats, today: '2026-11-02' }).system, /The month is over/)
  assert.equal(a.schema.additionalProperties, false)
  // The names it may use, and the ones it may not.
  assert.deepEqual(a.check.named.sort(), ['Insurance', 'Salary', 'Shopping'])
  assert.deepEqual(a.check.unnamed.sort(), ['Credit settlement', 'Entertainment', 'Groceries'])
})

test('summary lines: the screenshot\'s lines are all refused; useful ones kept, at most 3', () => {
  const { check } = summaryAsk({ totals: october, lang: 'en', categories: cats, today: '2026-10-02', rules, categoryRows: rows })
  const old = [
    'So far this month, shopping is up €70.00 and credit settlement jumped €76.22 above usual.',
    'Entertainment, groceries, and most other categories show little activity with 29 days remaining.',
    'Salary hasn\'t arrived yet; all budgets have room except those with no spending so far.',
  ]
  assert.equal(normaliseSummary({ lines: old }, check), null)
  const good = [
    'Shopping is already €250.00, €70.00 more than a usual month.',
    'Insurance of €45.00 is due on the 15th.',
    'Your salary of €2,514.00 is in, against €1,270.22 spent so far.',
    'Shopping is up again.',
  ]
  assert.deepEqual(normaliseSummary({ lines: good }, check), good.slice(0, SUMMARY_LINES_MAX))
  // A name the facts don't mention, even in another case; a named one inside
  // a longer name is fine.
  assert.equal(normaliseSummary({ lines: ['GROCERIES are fine.'] }, check), null)
  assert.deepEqual(normaliseSummary({ lines: ['Shoppingcart aside, all is well.'] }, check), ['Shoppingcart aside, all is well.'])
  // Filler, whatever the amounts.
  for (const filler of ['Things look quiet.', 'There are 12 days left.', 'Nothing much, with days remaining.', 'All budgets are fine.']) {
    assert.equal(normaliseSummary({ lines: [filler] }, check), null, filler)
  }
})

test('summary lines: Greek filler and amounts', () => {
  const { check } = summaryAsk({ totals: october, lang: 'el', categories: categoryChoices(rows, { [SHOPPING]: 'Αγορές' }), today: '2026-10-02', rules, categoryRows: rows })
  assert.deepEqual(normaliseSummary({ lines: ['Οι Αγορές είναι ήδη 250,00 €.'] }, check), ['Οι Αγορές είναι ήδη 250,00 €.'])
  for (const filler of ['Ο μισθός δεν έχει έρθει ακόμα.', 'Απομένουν 29 μέρες.', 'Λίγη κίνηση στις υπόλοιπες.']) {
    assert.equal(normaliseSummary({ lines: [filler] }, check), null, filler)
  }
})

test('summary lines: plain, each at most 300 characters, an amount it wasn\'t given drops the line', () => {
  const { check } = summaryAsk({ totals: october, lang: 'en', categories: cats, today: '2026-10-02', rules, categoryRows: rows })
  assert.deepEqual(normaliseSummary({ lines: ['- **Shopping** is at €250.00.', '', '2. Shopping is up €70.'] }, check),
    ['Shopping is at €250.00.'])
  const long = normaliseSummary({ lines: ['word '.repeat(100)] }, check)[0]
  assert.ok(long.length <= 300 && long.endsWith('…'))
  assert.equal(normaliseSummary({ lines: [' ', 3] }, check), null)
  assert.equal(normaliseSummary({}, check), null)
  // A sum of its own.
  assert.equal(normaliseSummary({ lines: ['Together that is €1,520.22.'] }, check), null)
})

test('pay months: in progress by the server\'s current month; coming up ends the day before the next payday', () => {
  const payMonth = { ...october, window: { from: '2026-09-29', to: '2026-10-31', open: true }, current_month: '2026-10',
    today: '2026-10-02', last_pay_day: '2026-09-29' }
  const late = [...rules, rule({ id: id(12), category_id: GROCERIES, amount_minor: 2500, next_run: '2026-10-30' })]
  const { facts: f, inProgress } = facts({ totals: payMonth, rules: late })
  assert.equal(inProgress, true)
  // The salary rule (29 Oct) opens November: never coming up; the 30 Oct
  // charge falls after the expected payday, in November too.
  assert.deepEqual(f.coming_up.map((d) => [d.name, d.day]), [['Insurance', 15]])
  // On 30 Oct, after the 29 Oct payday, October is over though the date says October.
  const after = facts({ totals: { ...payMonth, current_month: '2026-11', today: '2026-10-30' }, today: '2026-10-30' })
  assert.equal(after.inProgress, false)
  assert.equal('coming_up' in after.facts, false)
})
