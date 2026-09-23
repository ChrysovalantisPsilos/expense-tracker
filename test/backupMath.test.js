import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BACKUP_FORMAT, BACKUP_VERSION, BackupError, backupFileName, normText, txnKey, groupShareNote,
  buildBackup, serializeBackup, readBackup, unlockBackup, backupContents, mapCategories,
  matchByName, planRules, planTransactions, planBudgets, planRecurring, planProfile, planPayment,
  restoreSummary, splitDateRange,
} from '../src/features/backup/backupMath.js'

// ---- A small source account, in the shapes the data modules return ----------
const CATS = [
  { id: 'cat-food', name: 'Food', kind: 'expense', icon: 'utensils', color: 'orange', is_archived: false },
  { id: 'cat-old', name: 'Old hobby', kind: 'expense', icon: null, color: null, is_archived: true },
  { id: 'cat-pay', name: 'Salary', kind: 'income', icon: 'briefcase', color: 'green', is_archived: false },
]
const ACCOUNTS = [{ id: 'acc-1', name: 'Current account', type: 'asset', balance_minor: 125000, currency: 'EUR' }]
const TXNS = [
  { id: 't1', kind: 'expense', category_id: 'cat-food', account_id: 'acc-1', amount_minor: 450,
    currency: 'EUR', exchange_rate: 1, description: 'Lunch', notes: 'with Sam', spent_at: '2026-09-01' },
  { id: 't2', kind: 'expense', category_id: 'cat-food', account_id: null, amount_minor: 450,
    currency: 'EUR', exchange_rate: 1, description: 'Lunch', notes: null, spent_at: '2026-09-01' },
  { id: 't3', kind: 'income', category_id: 'cat-pay', account_id: null, amount_minor: 300000,
    currency: 'EUR', exchange_rate: 1, description: 'Salary', notes: null, spent_at: '2026-09-25' },
  { id: 't4', kind: 'expense', category_id: null, account_id: null, amount_minor: 2000,
    currency: 'JPY', exchange_rate: 0.0062, description: 'Ramen', notes: null, spent_at: '2026-08-10' },
  // A mirrored group share (name embedded, as my_transactions returns it).
  { id: 't5', kind: 'expense', category_id: null, account_id: null, amount_minor: 3333,
    currency: 'EUR', exchange_rate: 1, description: 'Dinner', notes: null, spent_at: '2026-07-02',
    group_id: 'g1', is_shared: true, group_expense_id: 'ge1', group_expenses: { groups: { name: 'Lisbon trip' } } },
  // A share from a group only known through groupNames.
  { id: 't6', kind: 'expense', category_id: null, account_id: null, amount_minor: 1000,
    currency: 'EUR', exchange_rate: 1, description: 'Taxi', notes: null, spent_at: '2026-07-03',
    group_id: 'g1', is_shared: true, group_expense_id: 'ge2', group_expenses: null },
]
const GROUP = {
  group: { id: 'g1', name: 'Lisbon trip', currency: 'EUR', created_at: '2026-06-01T10:00:00Z' },
  members: [
    { id: 'm1', user_id: 'u-source', display_name: 'Alex', role: 'owner' },
    { id: 'm2', user_id: 'u-sam', display_name: 'Sam', role: 'member' },
  ],
  expenses: [{
    id: 'ge1', description: 'Dinner', amount_minor: 6666, currency: 'EUR', spent_at: '2026-07-02',
    paid_by: 'm2', split_type: 'equal',
    expense_splits: [{ member_id: 'm1', share_minor: 3333 }, { member_id: 'm2', share_minor: 3333 }],
  }],
  settlements: [{ id: 's1', from_member: 'm1', to_member: 'm2', amount_minor: 3333, currency: 'EUR',
    settled_at: '2026-07-05', note: null }],
  balances: new Map([['m1', 0], ['m2', 0]]),
  comments: new Map([['ge1', [{ body: 'Great place!', created_at: '2026-07-02T21:00:00Z', author: { display_name: 'Sam' } }]]]),
}

function sourceDoc() {
  return buildBackup({
    exportedAt: '2026-09-22T12:00:00.000Z',
    userId: 'u-source',
    profile: { display_name: 'Alex Demo', base_currency: 'USD', notify_email: false, notify_push: true },
    payment: { payment_iban: 'CY17002001280000001200527600', payment_revolut: null },
    categories: CATS,
    categoryRules: [{ pattern: 'LIDL', category_id: 'cat-food' }, { pattern: 'GONE', category_id: 'cat-missing' }],
    accounts: ACCOUNTS,
    goals: [{ id: 'goal-1', name: 'Holiday', target_minor: 100000, saved_minor: 2500, currency: 'EUR', target_date: '2027-06-01' }],
    budgets: [{ category_id: 'cat-food', amount_minor: 40000, currency: 'EUR', period_start: '2026-09-01' }],
    recurring: [{ kind: 'expense', category_id: 'cat-food', account_id: 'acc-1', amount_minor: 999,
      currency: 'EUR', description: 'Netflix', frequency: 'monthly', interval_n: 1, next_run: '2026-10-01',
      end_date: null, is_active: true, remind_days_before: 2 }],
    transactions: TXNS,
    groupNames: new Map([['g1', 'Lisbon trip']]),
    groups: [GROUP],
  })
}

const fresh = () => readBackup(JSON.stringify(sourceDoc())).backup

// ---- Build / read -------------------------------------------------------------

test('backupFileName: budgeer-backup-YYYY-MM-DD.json in local time', () => {
  assert.equal(backupFileName(new Date(2026, 8, 2, 23, 59)), 'budgeer-backup-2026-09-02.json')
})

test('build: versioned header, local keys instead of server ids', () => {
  const doc = sourceDoc()
  assert.equal(doc.format, BACKUP_FORMAT)
  assert.equal(doc.version, BACKUP_VERSION)
  assert.deepEqual(doc.app, { name: 'Budgeer' })
  const text = JSON.stringify(doc)
  for (const id of ['cat-food', 'acc-1', 't1', 'ge1', 'm1', 'u-sam', 'goal-1']) {
    assert.ok(!text.includes(`"${id}"`), `server id ${id} leaked into the file`)
  }
  assert.deepEqual(doc.data.categories.map((c) => c.key), ['c1', 'c2', 'c3'])
  assert.equal(doc.data.transactions[0].category, 'c1')
  assert.equal(doc.data.transactions[0].account, 'a1')
  assert.equal(doc.data.categories[1].archived, true)
  // A rule pointing at a category that no longer exists is dropped.
  assert.deepEqual(doc.data.categoryRules, [{ pattern: 'LIDL', category: 'c1' }])
})

test('build: group shares carry the group name; the group ledger is by member name', () => {
  const doc = sourceDoc()
  const shares = doc.data.transactions.filter((t) => 'group' in t)
  assert.deepEqual(shares.map((t) => t.group), ['Lisbon trip', 'Lisbon trip'])
  assert.ok(!('group' in doc.data.transactions[0]))
  const [g] = doc.groupHistory
  assert.equal(g.name, 'Lisbon trip')
  assert.deepEqual(g.members, [{ name: 'Alex', role: 'owner', you: true }, { name: 'Sam', role: 'member', you: false }])
  assert.equal(g.expenses[0].paid_by, 'Sam')
  assert.deepEqual(g.expenses[0].splits, [{ member: 'Alex', share_minor: 3333 }, { member: 'Sam', share_minor: 3333 }])
  assert.deepEqual(g.expenses[0].comments, [{ author: 'Sam', body: 'Great place!', at: '2026-07-02T21:00:00Z' }])
  assert.deepEqual(g.settlements[0], { from: 'Alex', to: 'Sam', amount_minor: 3333, currency: 'EUR',
    settled_at: '2026-07-05', note: null, comments: [] })
})

test('build → serialise → read: a lossless round trip of everything restorable', async () => {
  const doc = sourceDoc()
  const back = readBackup(await serializeBackup(doc, null))
  assert.equal(back.encrypted, false)
  assert.deepEqual(back.backup.data, doc.data)
  assert.equal(back.backup.groupCount, 1)
  assert.deepEqual(backupContents(back.backup), {
    expenses: 5, income: 1, groupShares: 2, categories: 3, rules: 1, budgets: 1,
    recurring: 1, accounts: 1, goals: 1, groups: 1,
  })
})

test('read: rejects anything that is not a Budgeer backup', () => {
  for (const text of ['', 'not json', '[]', 'null', '{"format":"other","version":1}',
    '{"format":"budgeer-backup"}', '{"format":"budgeer-backup","version":0,"data":{}}',
    '{"format":"budgeer-backup","version":"1","data":{}}']) {
    assert.throws(() => readBackup(text), (e) => e instanceof BackupError && /isn’t a Budgeer backup/.test(e.message), text)
  }
})

test('read: a newer version asks for an app update', () => {
  const text = JSON.stringify({ ...sourceDoc(), version: BACKUP_VERSION + 1 })
  assert.throws(() => readBackup(text), /newer version of Budgeer/)
})

test('read: validates shape and values, naming the bad entry', () => {
  const bad = (mutate, re) => {
    const doc = sourceDoc()
    mutate(doc)
    assert.throws(() => readBackup(JSON.stringify(doc)), (e) => e instanceof BackupError && re.test(e.message))
  }
  bad((d) => { delete d.data }, /damaged \(file: data\)/)
  bad((d) => { d.data.transactions = {} }, /transactions/)
  bad((d) => { d.data.transactions[1].amount_minor = -5 }, /entry #2: amount/)
  bad((d) => { d.data.transactions[0].amount_minor = 4.5 }, /entry #1: amount/)
  bad((d) => { d.data.transactions[0].amount_minor = '450' }, /entry #1: amount/)
  bad((d) => { d.data.transactions[0].spent_at = '2026-02-30' }, /entry #1: date/)
  bad((d) => { d.data.transactions[0].kind = 'transfer' }, /entry #1: kind/)
  bad((d) => { d.data.transactions[0].currency = 'eur' }, /entry #1: currency/)
  bad((d) => { d.data.transactions[0].category = 'c99' }, /entry #1: category/)
  bad((d) => { d.data.transactions[0].exchange_rate = 0 }, /entry #1: exchange rate/)
  bad((d) => { d.data.transactions[0].description = { toString: 'x' } }, /entry #1: description/)
  bad((d) => { d.data.categories[1].key = 'c1' }, /duplicate key/)
  bad((d) => { d.data.budgets[0].category = null }, /budget #1: category/)
  bad((d) => { d.data.recurring[0].frequency = 'hourly' }, /recurring entry #1: frequency/)
  bad((d) => { d.data.categoryRules[0].pattern = 'x' }, /rule #1: pattern/)
})

test('read: copies only known fields (file contents are data, never code)', () => {
  const doc = sourceDoc()
  doc.data.transactions[0].user_id = 'someone-else'
  doc.data.transactions[0].group_expense_id = 'ge-x'
  doc.data.evil = '<script>'
  const text = JSON.stringify(doc).replace('"kind":"expense"', '"__proto__":{"polluted":true},"kind":"expense"')
  const { backup } = readBackup(text)
  const t = backup.data.transactions[0]
  assert.ok(!('user_id' in t) && !('group_expense_id' in t))
  assert.equal({}.polluted, undefined)
  assert.ok(!('evil' in backup.data))
})

// ---- Encryption ------------------------------------------------------------------

test('password: encrypted envelope round trip, and a wrong password is refused', async () => {
  const doc = sourceDoc()
  const text = await serializeBackup(doc, 'correct horse 42')
  assert.ok(!text.includes('Lunch') && !text.includes('CY17'), 'plaintext leaked into the envelope')
  const env = JSON.parse(text)
  assert.equal(env.format, BACKUP_FORMAT)
  assert.equal(env.version, BACKUP_VERSION)
  assert.equal(env.encrypted, true)
  assert.equal(env.kdf.name, 'PBKDF2')
  assert.equal(env.kdf.hash, 'SHA-256')
  assert.ok(env.kdf.iterations >= 310000)
  assert.equal(atob(env.kdf.salt).length, 16)
  assert.equal(atob(env.iv).length, 12)

  const read = readBackup(text)
  assert.equal(read.encrypted, true)
  const backup = await unlockBackup(read.envelope, 'correct horse 42')
  assert.deepEqual(backup.data, doc.data)
  await assert.rejects(unlockBackup(read.envelope, 'wrong horse 42'), /Wrong password or damaged file/)
})

test('password: a damaged envelope or a swapped header fails the same way', async () => {
  const env = JSON.parse(await serializeBackup(sourceDoc(), 'pw-12345678'))
  const flip = (b64) => { const s = atob(b64); return btoa(s.slice(0, 20) + String.fromCharCode(s.charCodeAt(20) ^ 1) + s.slice(21)) }
  const cases = [
    { ...env, ciphertext: flip(env.ciphertext) },
    { ...env, ciphertext: env.ciphertext.slice(0, 40) },
    { ...env, iv: btoa('short') },
    { ...env, kdf: { ...env.kdf, iterations: 1000 } },
    { ...env, kdf: { ...env.kdf, iterations: 10 ** 12 } },
    { ...env, ciphertext: 'not base64!!' },
  ]
  for (const c of cases) {
    const read = readBackup(JSON.stringify(c))
    await assert.rejects(unlockBackup(read.envelope, 'pw-12345678'), /Wrong password or damaged file/)
  }
})

// ---- Restore planning --------------------------------------------------------------

test('categories: match on (kind, name) ignoring case; create only the missing ones', () => {
  const { data } = fresh()
  const target = [{ id: 'T-food', name: '  food ', kind: 'expense' }, { id: 'T-sal', name: 'Salary', kind: 'expense' }]
  const first = mapCategories(data.categories, target)
  assert.equal(first.idByKey.get('c1'), 'T-food')
  // "Salary" exists only as an expense category here, so the income one is new.
  assert.deepEqual(first.missing.map((c) => `${c.kind}:${c.name}`), ['expense:Old hobby', 'income:Salary'])
  // After creating them, every key resolves.
  const after = [...target, { id: 'T-old', name: 'Old hobby', kind: 'expense' }, { id: 'T-inc', name: 'Salary', kind: 'income' }]
  const second = mapCategories(data.categories, after)
  assert.equal(second.missing.length, 0)
  assert.deepEqual([...second.idByKey], [['c1', 'T-food'], ['c2', 'T-old'], ['c3', 'T-inc']])
})

test('categories: two names differing only in case become one', () => {
  const cats = [{ key: 'c1', name: 'Food', kind: 'expense' }, { key: 'c2', name: 'FOOD', kind: 'expense' }]
  assert.equal(mapCategories(cats, []).missing.length, 1)
  const { idByKey } = mapCategories(cats, [{ id: 'X', name: 'food', kind: 'expense' }])
  assert.equal(idByKey.get('c1'), 'X')
  assert.equal(idByKey.get('c2'), 'X')
})

test('transactions: remap refs, add the group note, dedupe as a multiset', async () => {
  const { data } = fresh()
  const maps = { userId: 'u-target', categoryIdByKey: new Map([['c1', 'T-food'], ['c3', 'T-inc']]), accountIdByKey: new Map([['a1', 'T-acc']]) }
  const first = await planTransactions(data.transactions, [], maps)
  assert.equal(first.duplicates, 0)
  assert.equal(first.rows.length, 6)
  assert.equal(first.rows[0].category_id, 'T-food')
  assert.equal(first.rows[0].account_id, 'T-acc')
  assert.equal(first.rows[0].notes, 'with Sam')
  assert.equal(first.rows[3].exchange_rate, 0.0062)
  assert.equal(first.rows[4].notes, 'Group: Lisbon trip')
  for (const r of first.rows) {
    assert.ok(!('group' in r) && !('group_expense_id' in r) && !('user_id' in r))
    assert.match(r.client_uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  }
  // The two identical lunches are both kept, with distinct identities.
  assert.notEqual(first.rows[0].client_uuid, first.rows[1].client_uuid)

  // Running it again against what the first run saved: nothing new.
  const saved = first.rows.map((r) => ({ ...r }))
  const again = await planTransactions(data.transactions, saved, maps)
  assert.equal(again.rows.length, 0)
  assert.equal(again.duplicates, 6)

  // One of the two lunches already there (typed by hand, different case) → only one added,
  // with the same deterministic identity as before (so the server also dedupes).
  const partial = await planTransactions(data.transactions,
    [{ kind: 'expense', spent_at: '2026-09-01', amount_minor: 450, currency: 'EUR', description: '  LUNCH ' }], maps)
  assert.equal(partial.duplicates, 1)
  assert.equal(partial.rows.length, 5)
  assert.equal(partial.rows[0].client_uuid, first.rows[1].client_uuid)
})

test('transactions: key ignores case/spacing but not amount, date, currency or kind', () => {
  const base = { kind: 'expense', spent_at: '2026-01-01', amount_minor: 100, currency: 'EUR', description: 'Coffee  shop' }
  assert.equal(txnKey(base), txnKey({ ...base, description: ' coffee shop' }))
  assert.equal(normText(null), '')
  for (const change of [{ amount_minor: 101 }, { spent_at: '2026-01-02' }, { currency: 'USD' }, { kind: 'income' }]) {
    assert.notEqual(txnKey(base), txnKey({ ...base, ...change }))
  }
})

test('groupShareNote: appends the group name once', () => {
  assert.equal(groupShareNote(null, 'Lisbon trip'), 'Group: Lisbon trip')
  assert.equal(groupShareNote('paid by card', 'Lisbon trip'), 'paid by card\nGroup: Lisbon trip')
  assert.equal(groupShareNote('paid by card\nGroup: Lisbon trip', 'Lisbon trip'), 'paid by card\nGroup: Lisbon trip')
  assert.equal(groupShareNote(null, null), 'Group expense')
})

test('rules: match on pattern; an existing pattern is never repointed', () => {
  const rules = [{ pattern: 'LIDL', category: 'c1' }, { pattern: 'Uber', category: 'c1' }, { pattern: 'uber', category: 'c1' }]
  const plan = planRules(rules, [{ pattern: 'lidl', category_id: 'OTHER' }], new Map([['c1', 'T-food']]))
  assert.deepEqual(plan.create, [{ pattern: 'Uber', category_id: 'T-food' }])
  assert.equal(plan.skipped, 2)
})

test('named items: accounts/goals match by name; keys map to the existing id', () => {
  const plan = matchByName([{ key: 'a1', name: 'Current account' }, { key: 'a2', name: 'Savings' }],
    [{ id: 'X', name: 'current ACCOUNT' }])
  assert.deepEqual(plan.fresh.map((a) => a.name), ['Savings'])
  assert.equal(plan.idByKey.get('a1'), 'X')
  assert.equal(plan.skipped, 1)
})

test('budgets: upsert by (category, month) — new, changed, unchanged', () => {
  const cat = new Map([['c1', 'T-food'], ['c2', 'T-fun']])
  const backup = [
    { category: 'c1', period_start: '2026-09-01', amount_minor: 40000, currency: 'EUR' },
    { category: 'c1', period_start: '2026-08-01', amount_minor: 30000, currency: 'EUR' },
    { category: 'c2', period_start: '2026-09-01', amount_minor: 5000, currency: 'EUR' },
  ]
  const existing = [
    { category_id: 'T-food', period_start: '2026-09-01', amount_minor: 40000, currency: 'EUR' },
    { category_id: 'T-fun', period_start: '2026-09-01', amount_minor: 9000, currency: 'EUR' },
  ]
  const plan = planBudgets(backup, existing, cat)
  assert.deepEqual(plan.create, [{ categoryId: 'T-food', amountMinor: 30000, currency: 'EUR', periodStart: '2026-08-01' }])
  assert.deepEqual(plan.update, [{ categoryId: 'T-fun', amountMinor: 5000, currency: 'EUR', periodStart: '2026-09-01' }])
  assert.equal(plan.unchanged, 1)
})

test('recurring: match on (description, amount, frequency, kind)', () => {
  const { data } = fresh()
  const maps = { categoryIdByKey: new Map([['c1', 'T-food']]), accountIdByKey: new Map() }
  const first = planRecurring(data.recurring, [], maps)
  assert.equal(first.create.length, 1)
  assert.equal(first.create[0].category_id, 'T-food')
  assert.equal(first.create[0].account_id, null)
  assert.equal(first.create[0].remind_days_before, 2)
  const existing = [{ kind: 'expense', frequency: 'monthly', amount_minor: 999, description: 'NETFLIX' }]
  assert.equal(planRecurring(data.recurring, existing, maps).create.length, 0)
  assert.equal(planRecurring(data.recurring, [{ ...existing[0], amount_minor: 1099 }], maps).create.length, 1)
})

test('profile: only empty/default values are filled; the rest is reported, never overwritten', () => {
  const { data } = fresh() // Alex Demo, USD, email off, push on
  const newbie = { display_name: 'alex.d', base_currency: 'EUR', notify_email: true, notify_push: false }
  const a = planProfile(data, newbie, { emailName: 'alex.d', emptyAccount: true })
  assert.deepEqual(a.patch, { display_name: 'Alex Demo', base_currency: 'USD', notify_email: false })
  // Push is off here and on in the backup: a restore never switches it on.
  assert.deepEqual(a.kept, ['push notifications'])

  const settled = { display_name: 'Alexandra', base_currency: 'EUR', notify_email: false, notify_push: true }
  const b = planProfile(data, settled, { emailName: 'alex.d', emptyAccount: false })
  assert.deepEqual(b.patch, {})
  assert.deepEqual(b.kept, ['display name', 'main currency'])
})

test('payment: fills an empty IBAN/Revolut, keeps one that is set', () => {
  const { data } = fresh() // IBAN set, no Revolut
  assert.deepEqual(planPayment(data, {}), { patch: { iban: 'CY17002001280000001200527600', revolut: null }, kept: [] })
  assert.deepEqual(planPayment(data, { payment_iban: 'GB00OTHER', payment_revolut: 'alex' }), { patch: null, kept: ['IBAN'] })
  assert.deepEqual(planPayment(data, { payment_iban: 'CY17002001280000001200527600' }), { patch: null, kept: [] })
})

test('summary: what was added, what was skipped, what was kept', () => {
  const s = restoreSummary({ expenses: 212, income: 1, categories: 14, rules: 0, budgets: 0, budgetsUpdated: 2,
    recurring: 0, accounts: 0, goals: 0, settings: 1, duplicates: 3, kept: ['display name'] })
  assert.equal(s.added, 'Added 212 expenses, 1 income entry, 14 categories, updated 2 budgets, filled in 1 setting.')
  assert.equal(s.skipped, 'Skipped 3 duplicates.')
  assert.equal(s.kept, 'Kept your current display name — the backup’s differs. You can change it in Settings.')
  assert.match(restoreSummary({ kept: ['display name', 'main currency', 'IBAN'] }).kept,
    /^Kept your current display name, main currency and IBAN — the backup’s differ\. You can change them/)
  const again = restoreSummary({ expenses: 0, income: 0, categories: 0, duplicates: 40, kept: [] })
  assert.match(again.added, /Nothing new to add/)
  assert.equal(again.kept, null)
})

test('splitDateRange: halves an inclusive range; a single day cannot split', () => {
  assert.deepEqual(splitDateRange('2026-01-01', '2026-01-10'), [['2026-01-01', '2026-01-05'], ['2026-01-06', '2026-01-10']])
  assert.deepEqual(splitDateRange('2026-01-01', '2026-01-02'), [['2026-01-01', '2026-01-01'], ['2026-01-02', '2026-01-02']])
  assert.deepEqual(splitDateRange('2024-02-28', '2024-03-01'), [['2024-02-28', '2024-02-29'], ['2024-03-01', '2024-03-01']])
  assert.equal(splitDateRange('2026-01-01', '2026-01-01'), null)
})
