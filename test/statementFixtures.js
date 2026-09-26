// Fake data for the statements (test/deviceStatements.test.js): a Supabase
// client that answers the reads the statements make, and a month that has
// every kind of row the personal statement treats specially — yearly
// subscriptions (paid in and before the period), salary paid late in the
// month, savings taken from income and received, an expense paid from
// savings, foreign amounts with a rate and one still pending, a group
// expense share, formula-like text, and Greek names.

export const FROM = '2026-09-01'
export const TO = '2026-09-30'

export const profile = (yearlySeparate) => ({
  base_currency: 'EUR', display_name: 'Ελένη Παπαδοπούλου', yearly_separate: yearlySeparate,
  salary_shift_from_day: 25, salary_category_id: 'cat-salary',
})

export const CATEGORIES = [
  { id: 'cat-savings', kind: 'income', is_savings: true },
  { id: 'cat-pot', kind: 'expense', is_savings: true },
]

// my_transactions order: newest first.
export const TXNS = [
  { spent_at: '2026-09-28', kind: 'income', amount_minor: 250000, currency: 'EUR', exchange_rate: 1,
    category_id: 'cat-salary', description: 'Salary October', categories: { name: 'Salary' } },
  { spent_at: '2026-09-22', kind: 'expense', amount_minor: 5000, currency: 'EUR', exchange_rate: 1,
    description: '=HYPERLINK("http://evil.example")', categories: { name: 'Food & drink' } },
  { spent_at: '2026-09-18', kind: 'expense', amount_minor: 2000, currency: 'GBP', exchange_rate: null,
    description: 'Taxi', categories: { name: 'Travel' } },
  { spent_at: '2026-09-15', kind: 'expense', amount_minor: 1500, currency: 'JPY', exchange_rate: '0.0062',
    description: 'Ramen', categories: { name: 'Food & drink' } },
  { spent_at: '2026-09-12', kind: 'expense', amount_minor: 3000, currency: 'USD', exchange_rate: '0.9',
    paid_from_savings: true, description: 'Laptop repair', categories: { name: 'Tech' } },
  { spent_at: '2026-09-10', kind: 'expense', amount_minor: 24005, currency: 'EUR', exchange_rate: 1,
    spread_months: 12, description: 'Insurance', categories: { name: 'Bills' } },
  { spent_at: '2026-09-06', kind: 'income', amount_minor: 5000, currency: 'EUR', exchange_rate: 1,
    category_id: 'cat-savings', savings_from_income: false, description: 'Gift from grandma',
    categories: { name: 'Savings' } },
  { spent_at: '2026-09-05', kind: 'income', amount_minor: 20000, currency: 'EUR', exchange_rate: 1,
    category_id: 'cat-savings', savings_from_income: true, description: 'Monthly saving',
    categories: { name: 'Savings' } },
  { spent_at: '2026-09-03', kind: 'expense', amount_minor: 450, currency: 'EUR', exchange_rate: null,
    group_expense_id: 'ge1', group_expenses: { groups: { name: 'Λισαβόνα' } }, description: 'Dinner' },
  { spent_at: '2026-09-02', kind: 'expense', amount_minor: 1299, currency: 'EUR', exchange_rate: 1,
    description: 'Καφές και γλυκά', categories: { name: 'Καφετέρια' } },
  { spent_at: '2026-08-27', kind: 'income', amount_minor: 240000, currency: 'EUR', exchange_rate: 1,
    category_id: 'cat-salary', description: 'Salary September', categories: { name: 'Salary' } },
  { spent_at: '2026-03-15', kind: 'expense', amount_minor: 12000, currency: 'EUR', exchange_rate: 1,
    spread_months: 12, description: 'Gym', categories: { name: 'Sport' } },
]

export const RULES = [
  { is_active: true, kind: 'expense', frequency: 'yearly', interval_n: 1, amount_minor: 12000, currency: 'EUR',
    next_run: '2027-03-15', description: 'Gym' },
  { is_active: true, kind: 'expense', frequency: 'yearly', interval_n: 1, amount_minor: 9900, currency: 'USD',
    next_run: '2026-12-01', description: '@cloud storage' },
  { is_active: true, kind: 'expense', frequency: 'yearly', interval_n: 1, amount_minor: 6000, currency: 'CHF',
    next_run: '2027-01-10', description: 'Swiss magazine' },
]

// latest_fx_rates: USD has a rate, CHF none yet.
export const FX = [{ currency: 'USD', rate: '0.92' }]

export const GROUP = { id: 'g1', name: 'Λισαβόνα trip', currency: 'EUR' }
export const MEMBERS = [
  { id: 'm1', group_id: 'g1', display_name: 'Ελένη' },
  { id: 'm2', group_id: 'g1', display_name: 'Nikos' },
  { id: 'm3', group_id: 'g1', display_name: 'Γιώργος' },
]
export const LEDGER = {
  expenses: [
    { spent_at: '2026-09-03T19:00:00Z', description: 'Dinner', currency: 'EUR', amount_minor: 9000,
      group_amount_minor: 9000, paid_by: 'm1', expense_splits: [{}, {}, {}] },
    { spent_at: '2026-09-04T10:00:00Z', description: 'Tram tickets', currency: 'GBP', amount_minor: 1200,
      group_amount_minor: null, paid_by: 'm2', expense_splits: [{}, {}] },
    { spent_at: '2026-09-05T12:00:00Z', description: '', currency: 'USD', amount_minor: 3300,
      group_amount_minor: 3036, paid_by: 'm3', expense_splits: [{}, {}, {}] },
  ],
  settlements: [
    { settled_at: '2026-09-06T08:00:00Z', from_member: 'm2', to_member: 'm1', amount_minor: 2000, currency: 'EUR' },
  ],
}
export const AUDIT = [
  { created_at: '2026-09-06T08:00:01Z', summary: 'Nikos paid Ελένη', amount_minor: 2000, currency: 'EUR' },
  { created_at: '2026-09-05T12:00:01Z', summary: 'Γιώργος added an expense', amount_minor: 3300, currency: 'USD' },
  { created_at: '2026-09-01T09:00:00Z', summary: 'Ελένη created the group', amount_minor: null },
]
export const BALANCES = [
  { member_id: 'm1', net_minor: '4000' }, { member_id: 'm2', net_minor: '-1000' }, { member_id: 'm3', net_minor: '-3000' },
]

// A long account, as bank imports make one: `n` rows over 18 months (newest
// first, as my_transactions returns them) with 60–120-character bank
// descriptions, some Greek; foreign amounts, a few still awaiting a rate;
// salaries, savings, yearly subscriptions and group shares. Deterministic.
export const LONG_FROM = '2025-03-12'
export const LONG_TO = '2026-09-30'
export function longAccount(n) {
  let seed = 7
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
  const pick = (a) => a[Math.floor(rand() * a.length)]
  const merchants = ['LIDL HELLAS', 'AB VASSILOPOULOS', 'SHELL KIFISIAS', 'AMAZON EU SARL', 'WOLT ATHENS',
    'ΔΕΗ ΛΟΓΑΡΙΑΣΜΟΣ ΡΕΥΜΑΤΟΣ', 'ΚΑΦΕΤΕΡΙΑ ΤΟ ΣΤΕΚΙ', 'AEGEAN AIRLINES', 'ΦΑΡΜΑΚΕΙΟ ΠΑΠΑΔΟΠΟΥΛΟΥ', 'Café Straße']
  const categories = ['Groceries', 'Transport', 'Food & drink', 'Bills', 'Travel', 'Καφετέρια']
  const currencies = [['EUR', 1], ['EUR', 1], ['EUR', 1], ['USD', 0.92], ['GBP', 1.17], ['JPY', 0.0062]]
  const start = Date.UTC(2025, 2, 1)
  const days = (Date.UTC(2026, 8, 30) - start) / 864e5
  const rows = Array.from({ length: n }, (_, i) => {
    const date = new Date(start + Math.floor(rand() * days) * 864e5).toISOString().slice(0, 10)
    let description = `CARD PURCHASE ${date} ${pick(merchants)} ATHENS GR REF ${Math.floor(rand() * 1e10)} VISA`
    const length = 60 + Math.floor(rand() * 61)
    while (description.length < length) description += ` ${pick(['CONTACTLESS', 'POS', 'ΑΓΟΡΑ', String(i)])}`
    const [currency, rate] = pick(currencies)
    const row = {
      spent_at: date, kind: 'expense', amount_minor: 100 + Math.floor(rand() * 30000), currency,
      exchange_rate: currency === 'EUR' ? 1 : rand() < 0.05 ? null : String(rate),
      description: description.slice(0, length), categories: { name: pick(categories) },
    }
    const k = rand()
    if (k < 0.04) {
      Object.assign(row, { kind: 'income', category_id: 'cat-salary', amount_minor: 250000, currency: 'EUR',
        exchange_rate: 1, categories: { name: 'Salary' } })
    } else if (k < 0.07) {
      Object.assign(row, { kind: 'income', category_id: 'cat-savings', savings_from_income: rand() < 0.5 })
    } else if (k < 0.09) row.spread_months = 12
    else if (k < 0.1) row.paid_from_savings = true
    else if (k < 0.12) Object.assign(row, { group_expense_id: `ge${i}`, group_expenses: { groups: { name: 'Λισαβόνα' } } })
    return row
  })
  return rows.sort((a, b) => b.spent_at.localeCompare(a.spent_at))
}

// A stand-in for a supabase-js client signed in as the user: the chained
// query builder and rpc() the statements use, each answered from the data
// above. Every read is logged in `calls`.
// `txns` stands in for my_transactions' rows (TXNS by default).
export function fakeSupabase({ yearlySeparate = false, txns = TXNS } = {}) {
  const calls = []
  const tables = {
    profiles: () => [profile(yearlySeparate)],
    categories: (f) => CATEGORIES.filter((c) => f.is_savings == null || c.is_savings === f.is_savings),
    groups: (f) => [GROUP].filter((g) => g.id === f.id),
    group_members: (f) => MEMBERS.filter((m) => m.group_id === f.group_id),
  }
  const rpcs = {
    consume_quota: () => true,
    my_transactions: () => txns,
    my_recurring_rules: () => RULES,
    latest_fx_rates: ({ p_currencies }) => FX.filter((r) => p_currencies.includes(r.currency)),
    group_ledger: ({ p_group }) => (p_group === GROUP.id ? LEDGER : null),
    group_audit_entries: ({ p_group }) => (p_group === GROUP.id ? AUDIT : []),
    group_balances: ({ p_group }) => (p_group === GROUP.id ? BALANCES : []),
  }
  const from = (table) => {
    const filters = {}
    const call = { from: table, filters }
    calls.push(call)
    const rows = () => structuredClone(tables[table](filters))
    const builder = {
      select(cols) { call.select = cols; return builder },
      eq(col, v) { filters[col] = v; return builder },
      order(col) { call.order = col; return builder },
      single: async () => ({ data: rows()[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (ok, fail) => Promise.resolve({ data: rows(), error: null }).then(ok, fail),
    }
    return builder
  }
  return {
    calls,
    from,
    rpc: async (fn, args = {}) => {
      calls.push({ rpc: fn, args })
      return { data: structuredClone(rpcs[fn](args)), error: null }
    },
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  }
}
