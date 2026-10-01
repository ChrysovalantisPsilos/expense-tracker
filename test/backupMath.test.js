import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  BACKUP_FORMAT, BACKUP_VERSION, BackupError, backupFileName, normText, txnKey, groupShareNote,
  buildBackup, readBackup, backupContents, mapCategories, envelopeParams, openedBackup, backupText, sealedText,
  CONTENT_ROWS, MAX_BACKUP_BYTES, currencyLine, madeLine, emailName, targetCurrency, categoryRows, wantsSalary, settingsTally,
  FETCH_ROW_CAP,
  matchByName, planRules, planTransactions, planBudgets, planRecurring, planProfile, planSalaryShift, planPayment,
  currencyChange, restorePlan, restoreSalary,
  restoreSummary, splitDateRange, rebaseRateSpans, rebaseBackupData,
} from '../src/features/backup/backupMath.js'
import { serializeBackup, unlockBackup } from '../src/features/backup/backupCrypto.js'
import { UserError } from '../src/shared/lib/errors.js'
import { loadLanguage } from '../src/shared/lib/i18n/i18n.js'

// ---- A small source account, in the shapes the data modules return ----------
const CATS = [
  { id: 'cat-food', name: 'Food', kind: 'expense', icon: 'utensils', color: 'amber', is_archived: false },
  { id: 'cat-old', name: 'Old hobby', kind: 'expense', icon: null, color: null, is_archived: true },
  { id: 'cat-pay', name: 'Salary', kind: 'income', icon: 'salary', color: 'green', is_archived: false, default_key: 'salary' },
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
    payment: { payment_iban: 'BE68539007547034', payment_revolut: null },
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
  assert.ok(!text.includes('Lunch') && !text.includes('BE68'), 'plaintext leaked into the envelope')
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

test('sealing, pure: the envelope\'s checked parameters, the texts around a seal', async () => {
  const doc = sourceDoc()
  assert.equal(backupText(doc), JSON.stringify(doc, null, 2))
  const env = JSON.parse(await serializeBackup(doc, 'pw-12345678'))
  const read = readBackup(JSON.stringify(env))
  const params = envelopeParams(read.envelope)
  assert.deepEqual(params, {
    iterations: 600000, salt: env.kdf.salt, iv: env.iv, ciphertext: env.ciphertext, aad: `${BACKUP_FORMAT}/${BACKUP_VERSION}`,
  })
  assert.deepEqual(JSON.parse(sealedText({ kdf: env.kdf, iv: env.iv, ciphertext: env.ciphertext })), env)
  for (const bad of [{ ...read.envelope, iv: 'AAAA' }, { ...read.envelope, kdf: { ...env.kdf, salt: 'AAAA' } },
    { ...read.envelope, kdf: { ...env.kdf, hash: 'SHA-1' } }, { ...read.envelope, ciphertext: 'A' }, {}]) {
    assert.throws(() => envelopeParams(bad), /Wrong password or damaged file/)
  }
  assert.deepEqual(openedBackup(backupText(doc)).data, doc.data)
  assert.throws(() => openedBackup(JSON.stringify(env)), /isn’t a Budgeer backup/)
})

test('confirm step: when the backup was made, and what happens to the main currency', () => {
  assert.match(madeLine('2026-09-22T12:00:00.000Z'), /^Backup made .*2026\.$/)
  assert.equal(madeLine(undefined), null)
  assert.equal(madeLine('not a date'), null)
  assert.equal(currencyLine(null), null)
  assert.equal(currencyLine({ change: null, from: 'EUR', to: 'EUR' }), null)
  assert.equal(currencyLine({ change: 'adopt', from: 'USD', to: 'EUR' }), 'Your main currency will be set to USD to match this backup.')
  assert.match(currencyLine({ change: 'convert', from: 'USD', to: 'EUR' }), /^This backup is in USD and your account uses EUR/)
  assert.deepEqual(CONTENT_ROWS.filter((k) => !(k in backupContents({ ...fresh(), groupCount: 0 }))), [])
  assert.equal(MAX_BACKUP_BYTES, 50 * 1024 * 1024)
})

test('restore steps: the email\'s name, the currency the amounts land in, rows, salary, settings', () => {
  assert.equal(emailName('sam.morgan@example.com'), 'sam.morgan')
  assert.equal(emailName(null), '')
  assert.equal(targetCurrency({ patch: { base_currency: 'USD' } }, { base_currency: 'EUR' }), 'USD')
  assert.equal(targetCurrency({ patch: {} }, { base_currency: 'GBP' }), 'GBP')
  assert.equal(targetCurrency({ patch: {} }, null), 'EUR')
  const { backup } = readBackup(JSON.stringify(sourceDoc()))
  const { missing } = mapCategories(backup.data.categories, [])
  assert.deepEqual(categoryRows(missing)[2], {
    name: 'Salary', kind: 'income', icon: 'salary', color: 'green', is_archived: false, is_savings: false, default_key: 'salary',
  })
  assert.equal(wantsSalary(backup.data), false)
  assert.equal(wantsSalary({ ...backup.data, salary: { country: 'BE' } }), true)
  assert.equal(wantsSalary({ ...backup.data, transactions: [{ salary_extra: 'bonus' }] }), true)
  assert.deepEqual(settingsTally({ patch: { display_name: 'A', base_currency: 'EUR' }, kept: ['iban'] },
    { patch: { salary_category_id: 'c' }, kept: [] }, { patch: null, kept: ['paypal'] }), { settings: 3, kept: ['iban', 'paypal'] })
  assert.equal(FETCH_ROW_CAP, 1000)
})

// The sealed file the native app's tests open (BackupTests): made here, with
// WebCrypto, so the app proves it opens the website's files.
test('password: the native app\'s fixture opens with its password', async () => {
  const text = readFileSync(new URL('../ios/Budgeer/BudgeerTests/Fixtures/backup-sealed.json', import.meta.url), 'utf8')
  const read = readBackup(text)
  assert.equal(read.encrypted, true)
  const backup = await unlockBackup(read.envelope, 'correct horse 42')
  assert.equal(backup.data.transactions.length > 0, true)
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
  assert.deepEqual(a.kept, ['pushNotifications'])

  const settled = { display_name: 'Alexandra', base_currency: 'EUR', notify_email: false, notify_push: true }
  const b = planProfile(data, settled, { emailName: 'alex.d', emptyAccount: false })
  assert.deepEqual(b.patch, {})
  assert.deepEqual(b.kept, ['displayName', 'mainCurrency'])
})

test('profile: an empty account takes the backup’s main currency, whatever it uses now', () => {
  const { data } = fresh() // USD
  // Everything but the currency matches the backup, so only it can differ.
  const plan = (current, emptyAccount) => planProfile(data, { ...data.profile, ...current }, { emailName: 'a', emptyAccount })
  // Not only the EUR default: an empty JPY account switches too.
  assert.deepEqual(plan({ base_currency: 'JPY' }, true).patch, { base_currency: 'USD' })
  assert.deepEqual(plan({ base_currency: 'JPY' }, true).kept, [])
  assert.deepEqual(plan({ base_currency: null }, true).patch, { base_currency: 'USD' }) // unread: the column default
  // An account with entries keeps its own (the backup's amounts are converted).
  assert.equal(plan({ base_currency: 'JPY' }, false).patch.base_currency, undefined)
  assert.deepEqual(plan({ base_currency: 'JPY' }, false).kept, ['mainCurrency'])
  // Same currency: nothing to change or report.
  assert.deepEqual(plan({ base_currency: 'USD' }, false), { patch: {}, kept: [] })
})

test('currencyChange: adopt on an empty account, convert on a locked one, nothing when they match', () => {
  assert.equal(currencyChange('USD', 'EUR', false), 'adopt')
  assert.equal(currencyChange('USD', 'JPY', false), 'adopt')
  assert.equal(currencyChange('USD', 'EUR', true), 'convert')
  assert.equal(currencyChange('USD', 'USD', true), null)
  assert.equal(currencyChange('USD', 'USD', false), null)
  assert.equal(currencyChange(null, 'EUR', true), null) // an old backup that doesn't say
  assert.equal(currencyChange('EUR', null, true), null) // no currency read: the column default
  assert.equal(currencyChange('USD', null, true), 'convert')
})

test('payment: fills an empty IBAN/Revolut, keeps one that is set', () => {
  const { data } = fresh() // IBAN set, no Revolut
  assert.deepEqual(planPayment(data, {}), { patch: { iban: 'BE68539007547034', revolut: null, paypal: null }, kept: [] })
  assert.deepEqual(planPayment(data, { payment_iban: 'GB00OTHER', payment_revolut: 'alex' }), { patch: null, kept: ['iban'] })
  assert.deepEqual(planPayment(data, { payment_iban: 'BE68539007547034' }), { patch: null, kept: [] })
})

test('summary: what was added, what was skipped, what was kept', () => {
  const s = restoreSummary({ expenses: 212, income: 1, categories: 14, rules: 0, budgets: 0, budgetsUpdated: 2,
    recurring: 0, accounts: 0, goals: 0, settings: 1, duplicates: 3, kept: ['displayName'] })
  assert.equal(s.added, 'Added 212 expenses, 1 income entry, 14 categories, updated 2 budgets, filled in 1 setting.')
  assert.equal(s.skipped, 'Skipped 3 duplicates.')
  assert.equal(s.kept, 'Kept your current display name — the backup’s differs. You can change it in Settings.')
  assert.match(restoreSummary({ kept: ['displayName', 'mainCurrency', 'iban'] }).kept,
    /^Kept your current display name, main currency and IBAN — the backup’s differ\. You can change them/)
  const again = restoreSummary({ expenses: 0, income: 0, categories: 0, duplicates: 40, kept: [] })
  assert.match(again.added, /Nothing new to add/)
  assert.equal(again.kept, null)
})

test('summary: in Greek, with Greek plurals and "και"', async () => {
  await loadLanguage('el')
  try {
    const s = restoreSummary({ expenses: 1, income: 3, duplicates: 1, kept: ['displayName', 'mainCurrency', 'iban'] })
    assert.equal(s.added, 'Προστέθηκαν: 1 έξοδο, 3 έσοδα.')
    assert.equal(s.skipped, 'Παραλείφθηκε 1 διπλότυπο.')
    assert.match(s.kept, /^Έμειναν όπως ήταν: όνομα, βασικό νόμισμα και IBAN,/)
  } finally {
    await loadLanguage('en')
  }
})

test('splitDateRange: halves an inclusive range; a single day cannot split', () => {
  assert.deepEqual(splitDateRange('2026-01-01', '2026-01-10'), [['2026-01-01', '2026-01-05'], ['2026-01-06', '2026-01-10']])
  assert.deepEqual(splitDateRange('2026-01-01', '2026-01-02'), [['2026-01-01', '2026-01-01'], ['2026-01-02', '2026-01-02']])
  assert.deepEqual(splitDateRange('2024-02-28', '2024-03-01'), [['2024-02-28', '2024-02-29'], ['2024-03-01', '2024-03-01']])
  assert.equal(splitDateRange('2026-01-01', '2026-01-01'), null)
})

// ---- Version 2: PayPal.me name, names trimmed to the server's 60 characters --
import { clipName } from '../src/features/backup/backupMath.js'

test('clipName: control characters become spaces, trimmed, cut to 60 whole characters', () => {
  assert.equal(clipName('  Alex  '), 'Alex')
  assert.equal(clipName('Alex\nDemo'), 'Alex Demo')
  assert.equal(clipName('x'.repeat(75)), 'x'.repeat(60))
  assert.equal(clipName('🍕'.repeat(61)), '🍕'.repeat(60)) // never half an emoji
  assert.equal(clipName(`${'a'.repeat(59)} b`), 'a'.repeat(59)) // no trailing space
  assert.equal(clipName('   '), null)
  assert.equal(clipName(null), null)
})

test('restore: over-long display, category and group names are trimmed, not refused', () => {
  const doc = sourceDoc()
  doc.data.profile.display_name = 'A'.repeat(300)
  doc.data.categories[0].name = `${'Long category '.repeat(10)}end`
  doc.data.transactions.push({ ...doc.data.transactions[0], group: 'G'.repeat(250) })
  const { backup } = readBackup(JSON.stringify(doc))
  assert.equal(backup.data.profile.display_name, 'A'.repeat(60))
  assert.equal([...backup.data.categories[0].name].length <= 60, true)
  assert.equal(backup.data.transactions.at(-1).group, 'G'.repeat(60))
})

test('restore: unknown category icons/colours fall back to the default look', () => {
  const doc = sourceDoc()
  doc.data.categories[0].icon = '🍔'
  doc.data.categories[0].color = '#ff0000'
  const { backup } = readBackup(JSON.stringify(doc))
  assert.equal(backup.data.categories[0].icon, null)
  assert.equal(backup.data.categories[0].color, null)
})

test('version 2 carries the PayPal.me name; a version 1 file still reads', () => {
  const v2 = sourceDoc()
  v2.data.payment.paypal = 'paypal.me/AlexK'
  assert.equal(readBackup(JSON.stringify(v2)).backup.data.payment.paypal, 'AlexK')
  v2.data.payment.paypal = 'not a name!'
  assert.equal(readBackup(JSON.stringify(v2)).backup.data.payment.paypal, null)
  const v1 = sourceDoc()
  v1.version = 1
  delete v1.data.payment.paypal
  const { backup } = readBackup(JSON.stringify(v1))
  assert.equal(backup.version, 1)
  assert.equal(backup.data.payment.paypal, null)
})

test('version 4 carries savings accounts; a version 3 file with asset/debt accounts still reads', () => {
  const doc = buildBackup({
    exportedAt: '2026-09-26T12:00:00.000Z', userId: 'u-source', profile: { base_currency: 'EUR' },
    accounts: [...ACCOUNTS, { id: 'acc-2', name: 'Savings', type: 'savings', balance_minor: 1021300, currency: 'EUR' }],
  })
  assert.equal(doc.version, 4)
  assert.deepEqual(doc.data.accounts.map((a) => a.type), ['asset', 'savings'])
  assert.deepEqual(readBackup(JSON.stringify(doc)).backup.data.accounts.map((a) => a.type), ['asset', 'savings'])
  const v3 = sourceDoc()
  v3.version = 3
  assert.deepEqual(readBackup(JSON.stringify(v3)).backup.data.accounts.map((a) => a.type), ['asset'])
  // An unknown type is still a damaged file.
  const bad = sourceDoc()
  bad.data.accounts[0].type = 'pension'
  assert.throws(() => readBackup(JSON.stringify(bad)), BackupError)
})

test('payment: a PayPal.me name fills an empty one and is kept when set', () => {
  const { data } = fresh()
  data.payment.paypal = 'AlexK'
  assert.deepEqual(planPayment(data, { payment_iban: 'BE68539007547034' }).patch,
    { iban: 'BE68539007547034', revolut: null, paypal: 'AlexK' })
  assert.deepEqual(planPayment(data, { payment_iban: 'BE68539007547034', payment_paypal: 'Other' }),
    { patch: null, kept: ['paypal'] })
})

test('profile: the yearly-subscriptions setting round-trips and fills only the default', () => {
  const doc = buildBackup({ userId: 'u', profile: { display_name: 'A', yearly_separate: true } })
  const { data } = readBackup(JSON.stringify(doc)).backup
  assert.equal(data.profile.yearly_separate, true)
  const blank = { display_name: 'A', yearly_separate: false }
  assert.deepEqual(planProfile(data, blank, { emailName: 'a', emptyAccount: false }),
    { patch: { yearly_separate: true }, kept: [] })
  // An account that already keeps them separate isn't switched back.
  const off = { ...data, profile: { ...data.profile, yearly_separate: false } }
  assert.deepEqual(planProfile(off, { display_name: 'A', yearly_separate: true }, { emailName: 'a', emptyAccount: false }),
    { patch: {}, kept: ['yearlySeparate'] })
  // Older backups without the field leave it alone.
  assert.equal(fresh().data.profile.yearly_separate, null)
  assert.deepEqual(planProfile(fresh().data, blank, { emailName: 'a', emptyAccount: false }).patch.yearly_separate, undefined)
})

// ---- Main currency: restoring into an account with another one ------------------

const TODAY = '2026-09-24'
const tx = (currency, amount_minor, spent_at, exchange_rate = 1) => ({
  kind: 'expense', category: null, account: null, amount_minor, currency, exchange_rate,
  description: null, notes: null, spent_at,
})
const cap = (currency, amount_minor, period_start = '2026-09-01') => ({ category: 'c1', period_start, amount_minor, currency })
const dataIn = (base, transactions, budgets = []) => ({
  profile: { base_currency: base }, transactions, budgets,
  recurring: [{ kind: 'expense', amount_minor: 999, currency: base, frequency: 'monthly' }],
  goals: [{ name: 'Holiday', target_minor: 100000, saved_minor: 0, currency: base, target_date: null }],
  accounts: [{ key: 'a1', name: 'Current', type: 'asset', balance_minor: 5000, currency: base }],
})
const rebase = (data, toBase, series = new Map()) =>
  rebaseBackupData(data, { fromBase: data.profile.base_currency, toBase, seriesByCurrency: series, todayIso: TODAY })

test('main currency: same as the backup’s (or unknown) changes nothing', () => {
  const data = dataIn('EUR', [tx('EUR', 450, '2026-09-01'), tx('JPY', 2000, '2026-08-10', 0.0062)], [cap('EUR', 40000)])
  assert.equal(rebaseRateSpans(data, { fromBase: 'EUR', toBase: 'EUR', todayIso: TODAY }).size, 0)
  assert.equal(rebase(data, 'EUR'), data)
  const old = { ...data, profile: { base_currency: null } }
  assert.equal(rebaseRateSpans(old, { fromBase: null, toBase: 'USD', todayIso: TODAY }).size, 0)
  assert.equal(rebaseBackupData(old, { fromBase: null, toBase: 'USD', seriesByCurrency: new Map(), todayIso: TODAY }), old)
})

test('main currency: USD backup into a EUR account — entries keep amounts, rates and caps restated', () => {
  const data = dataIn('USD', [
    tx('USD', 1000, '2026-09-01'),
    tx('EUR', 450, '2026-09-01', 1.1111),          // the target's own currency → 1
    tx('GBP', 2000, '2026-08-08', 1.3),            // a third currency, on a Saturday
    tx('USD', 500, '2026-10-01'),                  // future-dated: today's rate
  ], [cap('USD', 40000), cap('EUR', 7000)])
  const opts = { fromBase: 'USD', toBase: 'EUR', todayIso: TODAY }
  // Accounts and goals need the restore day's rate (covered by the span too).
  assert.deepEqual([...rebaseRateSpans(data, opts)], [
    ['USD', { first: '2026-09-01', last: '2026-09-24' }],
    ['GBP', { first: '2026-08-08', last: '2026-08-08' }],
  ])
  const series = new Map([
    ['USD', [['2026-08-31', 0.91], ['2026-09-01', 0.9], ['2026-09-24', 0.85]]],
    ['GBP', [['2026-08-07', 1.17], ['2026-08-10', 1.18]]],
  ])
  const out = rebase(data, 'EUR', series)
  assert.deepEqual(out.transactions.map((t) => [t.currency, t.amount_minor, t.exchange_rate]), [
    ['USD', 1000, 0.9], ['EUR', 450, 1], ['GBP', 2000, 1.17], ['USD', 500, 0.85],
  ])
  // Budget caps are in the main currency: converted at their month's rate.
  assert.deepEqual(out.budgets, [cap('EUR', 36000), cap('EUR', 7000)])
  // Balances and goals at the latest rate (the restore day's): $50.00 → €42.50,
  // $1000.00 → €850.00. Recurring rules keep their own currency.
  assert.deepEqual(out.accounts, [{ key: 'a1', name: 'Current', type: 'asset', balance_minor: 4250, currency: 'EUR' }])
  assert.deepEqual(out.goals, [{ name: 'Holiday', target_minor: 85000, saved_minor: 0, currency: 'EUR', target_date: null }])
  assert.equal(out.recurring, data.recurring)
  // The input isn't mutated.
  assert.equal(data.accounts[0].currency, 'USD')
  assert.equal(data.transactions[0].exchange_rate, 1)
  assert.equal(data.budgets[0].currency, 'USD')
})

test('main currency: zero-decimal target (EUR → JPY)', () => {
  const data = dataIn('EUR', [tx('EUR', 1234, '2026-09-01'), tx('JPY', 1800, '2026-09-01', 0.0061)], [cap('EUR', 1234)])
  const out = rebase(data, 'JPY', new Map([['EUR', [['2026-09-01', 163.456]]]]))
  assert.deepEqual(out.transactions.map((t) => [t.currency, t.amount_minor, t.exchange_rate]),
    [['EUR', 1234, 163.456], ['JPY', 1800, 1]])
  // €12.34 × 163.456 = ¥2017.05 → ¥2017 (no fractional yen).
  assert.deepEqual(out.budgets, [cap('JPY', 2017)])
})

test('main currency: zero-decimal source (JPY → EUR) rounds half away from zero', () => {
  const data = dataIn('JPY', [tx('JPY', 2000, '2026-09-01')], [cap('JPY', 2000), cap('JPY', 275, '2026-08-01')])
  const out = rebase(data, 'EUR', new Map([['JPY', [['2026-08-01', 0.0062], ['2026-09-01', 0.0062]]]]))
  assert.equal(out.transactions[0].exchange_rate, 0.0062)
  assert.equal(out.transactions[0].amount_minor, 2000)
  // ¥2000 → €12.40; ¥275 × 0.0062 = €1.705 → €1.71 (as SQL to_base_minor).
  assert.deepEqual(out.budgets, [cap('EUR', 1240), cap('EUR', 171, '2026-08-01')])
})

test('main currency: both zero-decimal (KRW → JPY)', () => {
  const data = dataIn('KRW', [], [cap('KRW', 12345)])
  const out = rebase(data, 'JPY', new Map([['KRW', [['2026-09-01', 0.1085]]]]))
  assert.deepEqual(out.budgets, [cap('JPY', 1339)]) // 1339.43 → 1339
})

test('main currency: a missing rate stops the restore with a clear message', () => {
  const data = dataIn('USD', [tx('USD', 1000, '2026-09-01')], [])
  for (const series of [new Map(), new Map([['USD', [['2026-09-02', 0.9]]]])]) {
    assert.throws(() => rebase(data, 'EUR', series), (err) =>
      err instanceof UserError && /exchange rates/.test(err.message))
  }
  // A budget alone needs its rate too.
  assert.throws(() => rebase(dataIn('USD', [], [cap('USD', 100)]), 'EUR'), UserError)
})

test('main currency: restated rates flow into the rows a restore saves', async () => {
  const data = { ...dataIn('USD', [tx('GBP', 2000, '2026-08-07', 1.3)]), accounts: [], goals: [] }
  const out = rebase(data, 'EUR', new Map([['GBP', [['2026-08-07', 1.17]]]]))
  const plan = await planTransactions(out.transactions, [],
    { userId: 'u', categoryIdByKey: new Map(), accountIdByKey: new Map() })
  assert.equal(plan.rows[0].exchange_rate, 1.17)
  assert.equal(plan.rows[0].amount_minor, 2000)
  assert.equal(plan.rows[0].currency, 'GBP')
})

test('main currency: accounts and goals — zero-decimal target, negatives, rows already in the target', () => {
  const data = {
    ...dataIn('EUR', []),
    accounts: [
      { key: 'a1', name: 'Card', type: 'liability', balance_minor: 12345, currency: 'EUR' },
      { key: 'a2', name: 'Overdrawn', type: 'asset', balance_minor: -1005, currency: 'EUR' },
      { key: 'a3', name: 'Tokyo cash', type: 'asset', balance_minor: 30000, currency: 'JPY' },
    ],
    goals: [
      { name: 'Trip', target_minor: 250050, saved_minor: 1234, currency: 'EUR', target_date: '2027-01-01' },
      { name: 'Camera', target_minor: 150000, saved_minor: 20000, currency: 'JPY', target_date: null },
    ],
  }
  assert.deepEqual([...rebaseRateSpans(data, { fromBase: 'EUR', toBase: 'JPY', todayIso: TODAY })],
    [['EUR', { first: TODAY, last: TODAY }]])
  // The latest rate on or before the restore day wins.
  const out = rebase(data, 'JPY', new Map([['EUR', [['2026-09-01', 160], ['2026-09-23', 163.456]]]]))
  assert.deepEqual(out.accounts.map((a) => [a.balance_minor, a.currency]), [
    [20179, 'JPY'],   // €123.45 × 163.456 = ¥20178.64
    [-1643, 'JPY'],   // −€10.05 × 163.456 = −¥1642.73
    [30000, 'JPY'],   // already yen: untouched
  ])
  assert.equal(out.accounts[2], data.accounts[2])
  assert.deepEqual(out.goals.map((g) => [g.target_minor, g.saved_minor, g.currency, g.target_date]), [
    [408722, 2017, 'JPY', '2027-01-01'], // €2500.50 → ¥408721.73; €12.34 → ¥2017.05
    [150000, 20000, 'JPY', null],
  ])
  assert.equal(out.goals[1], data.goals[1])
  // Zero-decimal source: ¥30,000 at 0.0061 → €183.00.
  const back = rebase({ ...dataIn('JPY', []), accounts: [data.accounts[2]], goals: [] }, 'EUR',
    new Map([['JPY', [['2026-09-24', 0.0061]]]]))
  assert.deepEqual(back.accounts.map((a) => [a.balance_minor, a.currency]), [[18300, 'EUR']])
  // No rate for the restore day's side → the restore stops.
  assert.throws(() => rebase(data, 'JPY'), UserError)
})

test('backup: a savings category keeps its flag; only income can be savings; older files read as not savings', () => {
  const doc = buildBackup({
    exportedAt: '2026-09-22T12:00:00.000Z', userId: 'u-source',
    profile: { base_currency: 'EUR' }, payment: {},
    categories: [...CATS, { id: 'cat-save', name: 'Savings', kind: 'income', icon: 'savings', color: null, is_archived: false, is_savings: true }],
  })
  assert.deepEqual(doc.data.categories.map((c) => c.savings), [false, false, false, true])
  doc.data.categories[0].savings = true // an expense category can't be savings
  delete doc.data.categories[2].savings // a file from before 0084
  const { backup } = readBackup(JSON.stringify(doc))
  assert.deepEqual(backup.data.categories.map((c) => c.savings), [false, false, false, true])
})

test('backup: "Taken from my income" on savings entries and recurring savings round-trips', async () => {
  const save = { id: 'cat-save', name: 'Savings', kind: 'income', icon: 'savings', color: null, is_archived: false, is_savings: true }
  const entry = (o) => ({ kind: 'income', category_id: 'cat-save', account_id: null, amount_minor: 30000,
    currency: 'EUR', exchange_rate: 1, description: 'Set aside', notes: null, spent_at: '2026-09-02', ...o })
  const doc = buildBackup({
    exportedAt: '2026-09-22T12:00:00.000Z', userId: 'u-source',
    profile: { base_currency: 'EUR' }, payment: {},
    categories: [save],
    transactions: [
      entry({ id: 'a', savings_from_income: true }),
      entry({ id: 'b', savings_from_income: false, description: 'Interest' }),
    ],
    recurring: [{ kind: 'income', category_id: 'cat-save', amount_minor: 30000, currency: 'EUR', description: 'Monthly',
      frequency: 'monthly', interval_n: 1, next_run: '2026-10-02', is_active: true, savings_from_income: true }],
  })
  // Only set flags are written (older readers ignore the key).
  assert.deepEqual(doc.data.transactions.map((t) => t.from_income), [true, undefined])
  assert.equal(doc.data.recurring[0].from_income, true)
  // An expense can't carry it; a file from before 0084 has none.
  doc.data.transactions.push({ ...doc.data.transactions[1], kind: 'expense', category: null, from_income: true })
  const { backup } = readBackup(JSON.stringify(doc))
  assert.deepEqual(backup.data.transactions.map((t) => t.from_income), [true, undefined, undefined])
  const maps = { userId: 'u-target', categoryIdByKey: new Map([['c1', 'new-save']]), accountIdByKey: new Map() }
  const { rows } = await planTransactions(backup.data.transactions, [], maps)
  assert.deepEqual(rows.map((r) => r.savings_from_income), [true, undefined, undefined])
  const { create } = planRecurring(backup.data.recurring, [], maps)
  assert.equal(create[0].savings_from_income, true)
})

test('backup: "Paid from savings" on expenses and recurring expenses round-trips; older files read as off', async () => {
  const entry = (o) => ({ kind: 'expense', category_id: null, account_id: null, amount_minor: 90000,
    currency: 'EUR', exchange_rate: 1, description: 'New laptop', notes: null, spent_at: '2026-09-02', ...o })
  const doc = buildBackup({
    exportedAt: '2026-09-22T12:00:00.000Z', userId: 'u-source',
    profile: { base_currency: 'EUR' }, payment: {},
    categories: [],
    transactions: [
      entry({ id: 'a', paid_from_savings: true }),
      entry({ id: 'b', paid_from_savings: false, description: 'Groceries' }),
    ],
    recurring: [{ kind: 'expense', category_id: null, amount_minor: 5000, currency: 'EUR', description: 'Gym',
      frequency: 'monthly', interval_n: 1, next_run: '2026-10-02', is_active: true, paid_from_savings: true }],
  })
  // Only set flags are written (older readers ignore the key).
  assert.deepEqual(doc.data.transactions.map((t) => t.from_savings), [true, undefined])
  assert.equal(doc.data.recurring[0].from_savings, true)
  // Income can't carry it (the server's CHECK): dropped on read.
  doc.data.transactions.push({ ...doc.data.transactions[1], kind: 'income', from_savings: true })
  const { backup } = readBackup(JSON.stringify(doc))
  assert.deepEqual(backup.data.transactions.map((t) => t.from_savings), [true, undefined, undefined])
  const maps = { userId: 'u-target', categoryIdByKey: new Map(), accountIdByKey: new Map() }
  const { rows } = await planTransactions(backup.data.transactions, [], maps)
  assert.deepEqual(rows.map((r) => r.paid_from_savings), [true, undefined, undefined])
  assert.equal(planRecurring(backup.data.recurring, [], maps).create[0].paid_from_savings, true)

  // A file from before 0085 (no key anywhere) still reads, every flag off.
  const older = JSON.parse(JSON.stringify(doc))
  for (const t of older.data.transactions) delete t.from_savings
  delete older.data.recurring[0].from_savings
  const old = readBackup(JSON.stringify(older)).backup
  assert.ok(old.data.transactions.every((t) => !('from_savings' in t)))
  assert.deepEqual((await planTransactions(old.data.transactions, [], maps)).rows.map((r) => r.paid_from_savings),
    [undefined, undefined, undefined])
  assert.equal(planRecurring(old.data.recurring, [], maps).create[0].paid_from_savings, undefined)
  // A malformed flag is refused, like any other damaged field.
  older.data.transactions[0].from_savings = 'yes'
  assert.throws(() => readBackup(JSON.stringify(older)), UserError)
})

test('backup: meal vouchers (the flag and the setup) round-trip; older files read without them', async () => {
  const entry = (o) => ({ kind: 'expense', category_id: null, account_id: null, amount_minor: 1180,
    currency: 'EUR', exchange_rate: 1, description: 'Lunch', notes: null, spent_at: '2026-09-24', ...o })
  const vouchers = { v: 1, country: 'BE', per_day_minor: 800, currency: 'EUR', topup_day: 5,
    start_on: '2026-08-20', start_balance_minor: 3450, days: { '2026-09': 20 } }
  const doc = buildBackup({
    exportedAt: '2026-09-28T12:00:00.000Z', userId: 'u-source', profile: { base_currency: 'EUR' }, payment: {},
    transactions: [entry({ id: 'a', paid_with_vouchers: true }), entry({ id: 'b', description: 'Bank lunch' })],
    vouchers,
  })
  assert.deepEqual(doc.data.transactions.map((t) => t.with_vouchers), [true, undefined])
  assert.deepEqual(doc.data.vouchers, vouchers)
  // Never on income, never beside "from savings" (the server's CHECK).
  doc.data.transactions.push({ ...doc.data.transactions[1], kind: 'income', with_vouchers: true })
  doc.data.transactions.push({ ...doc.data.transactions[1], from_savings: true, with_vouchers: true })
  const { backup } = readBackup(JSON.stringify(doc))
  assert.deepEqual(backup.data.transactions.map((t) => t.with_vouchers), [true, undefined, undefined, undefined])
  assert.deepEqual(backup.data.vouchers, vouchers)
  const maps = { userId: 'u-target', categoryIdByKey: new Map(), accountIdByKey: new Map() }
  const { rows } = await planTransactions(backup.data.transactions, [], maps)
  assert.deepEqual(rows.map((r) => r.paid_with_vouchers), [true, undefined, undefined, undefined])
  // A setup that isn't the server's shape is left out; the rest still reads.
  const odd = readBackup(JSON.stringify({ ...doc, data: { ...doc.data, vouchers: { country: 'FR' } } })).backup
  assert.equal(odd.data.vouchers, undefined)
  // A file from before 0097 still reads, without either.
  const older = JSON.parse(JSON.stringify(doc))
  for (const t of older.data.transactions) delete t.with_vouchers
  delete older.data.vouchers
  const old = readBackup(JSON.stringify(older)).backup
  assert.ok(old.data.transactions.every((t) => !('with_vouchers' in t)))
  assert.equal(old.data.vouchers, undefined)
})

test('backup: salary corrections round-trip onto the matching entries; older files read without them', () => {
  const A = '7d9f3a52-2c1e-4b8a-9f00-1a2b3c4d5e6f'
  const B = '0e1f2a3b-4c5d-4e6f-8a7b-9c0d1e2f3a4b'
  const BONUS = '11111111-2222-4333-8444-555555555555'
  const pay = (o) => ({ kind: 'income', category_id: 'sal', account_id: null, amount_minor: 200000,
    currency: 'EUR', exchange_rate: 1, description: 'Salary', notes: null, spent_at: '2026-06-25', ...o })
  const categories = [{ id: 'sal', name: 'Salary', kind: 'income' }, { id: BONUS, name: 'Extras', kind: 'income' }]
  const doc = buildBackup({
    exportedAt: '2026-09-28T12:00:00.000Z', userId: 'u-source', profile: { base_currency: 'EUR' }, payment: {},
    categories,
    transactions: [pay({ id: A, amount_minor: 180000, spent_at: '2026-06-12' }), pay({ id: B }), pay({ id: 'c', spent_at: '2026-07-25' })],
    salary: { v: 1, fixes: { [A]: 'holiday', [B]: 'regular', 'not-an-entry': 'bonus' }, bonus_category_id: BONUS, country: 'GR' },
  })
  assert.deepEqual(doc.data.transactions.map((t) => t.salary_extra), ['holiday', 'regular', undefined])
  assert.deepEqual(doc.data.salary, { bonus_category: 'c2', country: 'GR' })
  // Only on income, only a known kind.
  doc.data.transactions.push({ ...doc.data.transactions[0], kind: 'expense' })
  doc.data.transactions.push({ ...doc.data.transactions[0], spent_at: '2026-05-02', salary_extra: 'lottery' })
  const { backup } = readBackup(JSON.stringify(doc))
  assert.deepEqual(backup.data.transactions.map((t) => t.salary_extra), ['holiday', 'regular', undefined, undefined, undefined])
  assert.deepEqual(backup.data.salary, { bonus_category: 'c2', country: 'GR' })
  // Onto the target's entries (new ids), matched like duplicates are.
  const T1 = '99999999-0000-4000-8000-000000000001'
  const T2 = '99999999-0000-4000-8000-000000000002'
  const TB = '99999999-0000-4000-8000-00000000000b'
  const now = [
    { id: T1, kind: 'income', amount_minor: '180000', currency: 'EUR', description: 'Salary', spent_at: '2026-06-12' },
    { id: T2, kind: 'income', amount_minor: 200000, currency: 'EUR', description: 'Salary', spent_at: '2026-06-25' },
  ]
  assert.deepEqual(restoreSalary(backup.data, now, new Map([['c2', TB]])),
    { v: 1, fixes: { [T1]: 'holiday', [T2]: 'regular' }, bonus_category_id: TB, country: 'GR' })
  assert.equal(restoreSalary({ transactions: [] }, now, new Map()), null)
  // Unknown settings are dropped; a file from before 0102 reads without them.
  const odd = readBackup(JSON.stringify({ ...doc, data: { ...doc.data, salary: { bonus_category: 'c9', country: 'FR' } } })).backup
  assert.equal(odd.data.salary, undefined)
  const older = JSON.parse(JSON.stringify(doc))
  for (const t of older.data.transactions) delete t.salary_extra
  delete older.data.salary
  const old = readBackup(JSON.stringify(older)).backup
  assert.ok(old.data.transactions.every((t) => !('salary_extra' in t)))
  assert.equal(old.data.salary, undefined)
})

// ---- Version 3: the salary shift; older files follow today's defaults ------------

const SALARY_SOURCE = [
  { id: 'cat-food', name: 'Food', kind: 'expense', icon: 'utensils', color: null, is_archived: false },
  { id: 'cat-bonus', name: 'Bonus', kind: 'income', icon: 'salary', color: null, is_archived: false },
  { id: 'cat-pay', name: 'Salary', kind: 'income', icon: 'salary', color: null, is_archived: false },
]
const salaryDoc = (profile = {}) => buildBackup({
  exportedAt: '2026-09-25T12:00:00.000Z', userId: 'u-source', categories: SALARY_SOURCE,
  profile: { base_currency: 'EUR', salary_shift_from_day: 27, salary_category_id: 'cat-pay', ...profile },
})

test('version 3: the salary shift round-trips as a category key, never a server id', async () => {
  assert.ok(BACKUP_VERSION >= 3)
  const doc = salaryDoc()
  assert.equal(doc.version, BACKUP_VERSION)
  assert.equal(doc.data.profile.salary_shift_from_day, 27)
  assert.equal(doc.data.profile.salary_category, 'c3')
  assert.ok(!JSON.stringify(doc).includes('cat-pay'))
  const back = readBackup(await serializeBackup(doc, null)).backup
  assert.deepEqual(back.data.profile, doc.data.profile)
  // Off with a remembered category; a category that's no longer listed.
  assert.equal(salaryDoc({ salary_shift_from_day: null }).data.profile.salary_category, 'c3')
  assert.equal(salaryDoc({ salary_category_id: 'cat-deleted' }).data.profile.salary_category, null)
})

test('version 3: every flag the recent features added survives build → encrypt → read', async () => {
  const doc = buildBackup({
    exportedAt: '2026-09-25T12:00:00.000Z', userId: 'u-source',
    profile: { base_currency: 'EUR', yearly_separate: true, salary_shift_from_day: 25, salary_category_id: 'cat-pay' },
    categories: [...SALARY_SOURCE,
      { id: 'cat-save', name: 'Savings', kind: 'income', icon: 'savings', color: null, is_archived: false, is_savings: true }],
    transactions: [
      { kind: 'income', category_id: 'cat-save', amount_minor: 20000, currency: 'EUR', exchange_rate: 1,
        description: 'Set aside', spent_at: '2026-09-02', savings_from_income: true },
      { kind: 'expense', category_id: 'cat-food', amount_minor: 1500, currency: 'EUR', exchange_rate: 1,
        description: 'Treat', spent_at: '2026-09-03', paid_from_savings: true },
    ],
    recurring: [
      { kind: 'income', category_id: 'cat-save', amount_minor: 20000, currency: 'EUR', description: 'Monthly',
        frequency: 'monthly', interval_n: 1, next_run: '2026-10-02', savings_from_income: true },
      { kind: 'expense', category_id: 'cat-food', amount_minor: 900, currency: 'EUR', description: 'Box',
        frequency: 'monthly', interval_n: 1, next_run: '2026-10-03', paid_from_savings: true },
    ],
  })
  const { envelope } = readBackup(await serializeBackup(doc, 'correct horse battery'))
  const back = await unlockBackup(envelope, 'correct horse battery')
  assert.deepEqual(back.data, doc.data)
  assert.equal(back.data.categories.find((c) => c.name === 'Savings').savings, true)
  assert.deepEqual(back.data.transactions.map((t) => [t.from_income, t.from_savings]), [[true, undefined], [undefined, true]])
  assert.deepEqual(back.data.recurring.map((r) => [r.from_income, r.from_savings]), [[true, undefined], [undefined, true]])
  assert.deepEqual(back.data.profile, {
    display_name: null, base_currency: 'EUR', notify_email: null, notify_push: null,
    yearly_separate: true, salary_shift_from_day: 25, salary_category: 'c3',
  })
})

test('backup: UI state (whats_new_seen and the like) is never written to the file', () => {
  const doc = salaryDoc({
    whats_new_seen: '2026-09-25', tour_done: true, passkey_reminder_off: true,
    onboarded_at: '2026-01-01T00:00:00Z', notify_digest: true, is_developer: true, is_demo: true, language: 'el',
  })
  const text = JSON.stringify(doc)
  for (const k of ['whats_new_seen', 'tour_done', 'passkey_reminder_off', 'onboarded_at', 'notify_digest', 'is_developer', 'is_demo', 'language']) {
    assert.ok(!text.includes(k), `${k} leaked into the backup`)
  }
  // …and a hand-edited file that has it doesn't carry it through.
  doc.data.profile.whats_new_seen = '2026-09-25'
  assert.ok(!('whats_new_seen' in readBackup(JSON.stringify(doc)).backup.data.profile))
})

test('read: a bad salary day is refused; a salary category that isn’t an income one in the file reads as off', () => {
  for (const day of [0, 32, 2.5, '25']) {
    const doc = salaryDoc()
    doc.data.profile.salary_shift_from_day = day
    assert.throws(() => readBackup(JSON.stringify(doc)), UserError, `day ${day}`)
  }
  for (const key of ['c1' /* expense */, 'c99' /* not in the file */, 42]) {
    const doc = salaryDoc()
    doc.data.profile.salary_category = key
    assert.equal(readBackup(JSON.stringify(doc)).backup.data.profile.salary_category, null, `key ${key}`)
  }
})

test('salary shift: restore remaps the category onto the target’s own id', () => {
  const { data } = readBackup(JSON.stringify(salaryDoc())).backup
  // The target has its own Salary (matched on kind + name) under another id.
  const target = [
    { id: 'tgt-food', name: 'Food', kind: 'expense' },
    { id: 'tgt-bonus', name: 'bonus', kind: 'income' },
    { id: 'tgt-salary', name: 'SALARY', kind: 'income' },
  ]
  const { idByKey } = mapCategories(data.categories, target)
  assert.deepEqual(planSalaryShift(data.profile, { salary_shift_from_day: null, salary_category_id: null }, idByKey),
    { patch: { salary_shift_from_day: 27, salary_category_id: 'tgt-salary' }, kept: [] })
})

test('salary shift: a category that can’t be resolved leaves the setting off, never pointing elsewhere', () => {
  const { data } = readBackup(JSON.stringify(salaryDoc())).backup
  const blank = { salary_shift_from_day: null, salary_category_id: null }
  // The category wasn't restored (no id for its key).
  assert.deepEqual(planSalaryShift(data.profile, blank, new Map([['c2', 'tgt-bonus']])), { patch: {}, kept: [] })
  // The file had no (usable) salary category.
  const none = { ...data.profile, salary_category: null }
  assert.deepEqual(planSalaryShift(none, blank, new Map([['c3', 'tgt-salary']])), { patch: {}, kept: [] })
  // An old file without the fields at all.
  const v2 = salaryDoc()
  v2.version = 2
  delete v2.data.profile.salary_shift_from_day
  delete v2.data.profile.salary_category
  const old = readBackup(JSON.stringify(v2)).backup
  assert.equal(old.version, 2)
  assert.equal(old.data.profile.salary_shift_from_day, null)
  assert.equal(old.data.profile.salary_category, null)
  assert.deepEqual(planSalaryShift(old.data.profile, blank, new Map([['c3', 'tgt-salary']])), { patch: {}, kept: [] })
})

test('salary shift: fills only an account whose shift is off; its own setting is kept and reported', () => {
  const { data } = readBackup(JSON.stringify(salaryDoc())).backup
  const ids = new Map([['c3', 'tgt-salary'], ['c2', 'tgt-bonus']])
  // Off, but remembering another category: the backup's pair is taken.
  assert.deepEqual(planSalaryShift(data.profile, { salary_shift_from_day: null, salary_category_id: 'tgt-bonus' }, ids).patch,
    { salary_shift_from_day: 27, salary_category_id: 'tgt-salary' })
  // Already on: kept, and said so when it differs.
  assert.deepEqual(planSalaryShift(data.profile, { salary_shift_from_day: 25, salary_category_id: 'tgt-salary' }, ids),
    { patch: {}, kept: ['salaryShift'] })
  assert.deepEqual(planSalaryShift(data.profile, { salary_shift_from_day: 27, salary_category_id: 'tgt-salary' }, ids),
    { patch: {}, kept: [] })
  // The backup's is off but remembers a category: only an empty one is filled.
  const off = { ...data.profile, salary_shift_from_day: null }
  assert.deepEqual(planSalaryShift(off, { salary_shift_from_day: null, salary_category_id: null }, ids).patch,
    { salary_category_id: 'tgt-salary' })
  assert.deepEqual(planSalaryShift(off, { salary_shift_from_day: null, salary_category_id: 'tgt-bonus' }, ids).patch, {})
  assert.deepEqual(planSalaryShift(off, { salary_shift_from_day: 20, salary_category_id: 'tgt-bonus' }, ids),
    { patch: {}, kept: [] })
  assert.match(restoreSummary({ kept: ['salaryShift'] }).kept, /^Kept your current salary setting/)
})

// A fresh account's default categories (0084's seed), as listAllCategories returns them.
const DEFAULTS = [
  { id: 'd-food', name: 'Food & Dining', kind: 'expense', is_savings: false },
  { id: 'd-salary', name: 'Salary', kind: 'income', is_savings: false },
  { id: 'd-ff', name: 'Friends & family', kind: 'income', is_savings: false },
  { id: 'd-bonus', name: 'Bonus', kind: 'income', is_savings: false },
  { id: 'd-save', name: 'Savings', kind: 'income', is_savings: true },
]

test('categories: the default Savings, Friends & family and Bonus are matched, never duplicated', () => {
  const doc = buildBackup({
    userId: 'u-source',
    categories: DEFAULTS.map((c) => ({ ...c, id: `src-${c.id}` })),
  })
  const { data } = readBackup(JSON.stringify(doc)).backup
  const { idByKey, missing } = mapCategories(data.categories, DEFAULTS)
  assert.deepEqual(missing, [])
  const save = data.categories.find((c) => c.name === 'Savings')
  assert.equal(save.savings, true)
  assert.equal(idByKey.get(save.key), 'd-save') // the account's own Savings, already marked savings
})

test('categories: a version 2 file follows the 0083 rename and the 0084 Savings flag', () => {
  const doc = buildBackup({
    userId: 'u-source',
    categories: [
      { id: 's-ft', name: 'Friend Transfer', kind: 'income' },
      { id: 's-bonus', name: 'Bonus', kind: 'income' },
      { id: 's-save', name: 'Savings', kind: 'income' },
      { id: 's-other', name: 'Savings', kind: 'expense' },
    ],
  })
  doc.version = 2
  for (const c of doc.data.categories) delete c.savings // made before 0084
  const { data } = readBackup(JSON.stringify(doc)).backup
  assert.deepEqual(data.categories.map((c) => [c.name, c.kind, c.savings]), [
    ['Friends & family', 'income', false], ['Bonus', 'income', false],
    ['Savings', 'income', true], ['Savings', 'expense', false],
  ])
  const plan = mapCategories(data.categories, DEFAULTS)
  assert.deepEqual(plan.missing.map((c) => `${c.kind}:${c.name}`), ['expense:Savings'])
  assert.equal(plan.idByKey.get('c1'), 'd-ff')
  // Restored into an account without a Savings category, it's created as savings.
  const bare = mapCategories(data.categories, DEFAULTS.filter((c) => c.name !== 'Savings'))
  assert.equal(bare.missing.find((c) => c.kind === 'income').savings, true)
})

test('categories: the upgrade leaves newer files and deliberate names alone', () => {
  const cats = [
    { id: 's-ft', name: 'Friend Transfer', kind: 'income' },
    { id: 's-ff', name: 'Friends & family', kind: 'income' },
    { id: 's-save', name: 'Savings', kind: 'income', is_savings: false },
  ]
  // Version 2 with both names (as 0083 left such accounts): no rename. It has
  // the savings key (made after 0084), so "Savings" keeps the file's flag.
  const v2 = buildBackup({ userId: 'u', categories: cats })
  v2.version = 2
  assert.deepEqual(readBackup(JSON.stringify(v2)).backup.data.categories.map((c) => [c.name, c.savings]),
    [['Friend Transfer', false], ['Friends & family', false], ['Savings', false]])
  // Version 3: a "Friend Transfer" is the user's own choice.
  const v3 = buildBackup({ userId: 'u', categories: [cats[0]] })
  assert.equal(readBackup(JSON.stringify(v3)).backup.data.categories[0].name, 'Friend Transfer')
})

test('plan: the saved plan rides along with keys, round-trips, and restores onto the matching entries', async () => {
  const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  const snap = { name: 'Netflix', amount_minor: 999, currency: 'EUR', frequency: 'monthly', interval_n: 1 }
  const recurring = [
    { id: 'rule-net', kind: 'expense', category_id: 'cat-food', account_id: null, amount_minor: 999, currency: 'EUR',
      description: 'Netflix', frequency: 'monthly', interval_n: 1, next_run: '2026-10-01', end_date: null, is_active: true },
    { id: 'rule-gym', kind: 'expense', category_id: null, account_id: null, amount_minor: 3990, currency: 'EUR',
      description: 'Gym', frequency: 'monthly', interval_n: 1, next_run: '2026-10-03', end_date: null, is_active: true },
  ]
  const plan = {
    v: 1,
    changes: [
      { rule_id: 'rule-net', snap, cancel: true },
      { rule_id: 'rule-gym', snap: { ...snap, name: 'Gym', amount_minor: 3990 }, amount_minor: 2490 },
      { rule_id: 'rule-gone', snap, cancel: true },
    ],
    adds: [
      { id: 'a1', kind: 'income', name: 'Tutoring', amount_minor: 12000, currency: 'EUR', frequency: 'monthly',
        interval_n: 1, start: '2026-10-01', category_id: 'cat-pay' },
      { id: 'a2', kind: 'expense', name: 'Climbing', amount_minor: 4500, currency: 'EUR', frequency: 'monthly',
        interval_n: 1, start: '2026-11-01', category_id: 'cat-missing' },
    ],
    dismissed: ['biggest:rule-gym'],
  }
  const doc = buildBackup({ userId: 'u-source', categories: CATS, recurring, plan })
  assert.deepEqual(doc.data.recurring.map((r) => r.key), ['r1', 'r2'])
  assert.deepEqual(doc.data.plan.changes.map((c) => c.rule), ['r1', 'r2'], 'a change to a rule not in the file is left out')
  assert.deepEqual(doc.data.plan.adds.map((a) => a.category), ['c3', null])
  for (const id of ['rule-net', 'rule-gym', 'cat-pay']) assert.ok(!JSON.stringify(doc).includes(`"${id}"`), id)

  const back = readBackup(await serializeBackup(doc, null)).backup
  assert.deepEqual(back.data.plan, doc.data.plan)
  assert.equal(readBackup(JSON.stringify(buildBackup({ userId: 'u', plan: { v: 1, changes: [], adds: [], dismissed: [] } })))
    .backup.data.plan, undefined, 'an empty plan isn’t written')

  // Restored into an account whose Netflix entry already exists (matched as
  // planRecurring matches it) and whose Gym entry doesn't: Netflix's change
  // follows it, Gym's is dropped; the add's category maps to the account's.
  const rulesNow = [{ id: uuid(1), kind: 'expense', amount_minor: '999', frequency: 'monthly', description: 'NETFLIX' }]
  const restored = restorePlan(back.data.plan, back.data.recurring, rulesNow, new Map([['c3', uuid(9)]]))
  assert.deepEqual(restored.changes, [{ rule_id: uuid(1), snap, cancel: true }])
  assert.deepEqual(restored.adds.map((a) => [a.name, a.category_id]), [['Tutoring', uuid(9)], ['Climbing', null]])
  assert.deepEqual(restored.dismissed, ['biggest:rule-gym'])
  assert.deepEqual(restorePlan(undefined, [], [], new Map()), { v: 1, changes: [], adds: [], dismissed: [] })
})

test('plan: the salary what-if (Salary row from entries) survives backup and restore', async () => {
  const plan = { v: 1, changes: [], adds: [], dismissed: [], salary: { amount_minor: 330000, cancel: true } }
  const doc = buildBackup({ userId: 'u-source', categories: CATS, plan })
  assert.deepEqual(doc.data.plan.salary, { amount_minor: 330000, cancel: true }, 'a salary-only plan is written')
  const back = readBackup(await serializeBackup(doc, null)).backup
  assert.deepEqual(back.data.plan, doc.data.plan)
  assert.deepEqual(restorePlan(back.data.plan, [], [], new Map()), plan)
  // A damaged salary entry loses its bad parts, never the file.
  const bad = sourceDoc()
  bad.data.plan = { changes: [], adds: [], dismissed: ['x'], salary: { amount_minor: 'lots', cancel: true, extra: 1 } }
  assert.deepEqual(readBackup(JSON.stringify(bad)).backup.data.plan.salary, { cancel: true })
  bad.data.plan.salary = { amount_minor: -1 }
  assert.equal('salary' in readBackup(JSON.stringify(bad)).backup.data.plan, false)
})

test('plan: a damaged plan in the file is refused; one naming an unknown entry loses that change', () => {
  const doc = sourceDoc()
  doc.data.plan = { changes: 'nope', adds: [], dismissed: [] }
  assert.throws(() => readBackup(JSON.stringify(doc)), BackupError)
  doc.data.plan = { changes: [{ rule: 'r9', cancel: true }], adds: [], dismissed: ['x'] }
  assert.deepEqual(readBackup(JSON.stringify(doc)).backup.data.plan, { changes: [], adds: [], dismissed: ['x'] })
})

// backup.js can't be loaded here (it talks to Supabase), so its profile reads
// are checked in the source: a failed read must stop the backup or restore
// (fetchProfile throws), never go on without the settings or assume EUR
// (getProfile swallows the error and returns null).
test('backup and restore read the profile with the throwing fetchProfile', () => {
  const src = readFileSync(new URL('../src/features/backup/backup.js', import.meta.url), 'utf8')
  assert.ok(!/\bgetProfile\b/.test(src), 'backup.js uses the best-effort getProfile')
  assert.equal(src.match(/\bfetchProfile\(/g)?.length, 3, 'the export, the currency plan and the restore each read it')
})

test('plan: the savings what-if (Savings row from entries) and a new savings item survive backup and restore', async () => {
  const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  const add = { id: 'a1', kind: 'savings', name: 'Holiday fund', amount_minor: 5000, currency: 'EUR', frequency: 'monthly',
    interval_n: 1, start: '2026-10-01', category_id: 'cat-pay' }
  const plan = { v: 1, changes: [], adds: [add], dismissed: [], savings: { amount_minor: 42000 } }
  const doc = buildBackup({ userId: 'u-source', categories: CATS, plan })
  assert.deepEqual(doc.data.plan.savings, { amount_minor: 42000 })
  const back = readBackup(await serializeBackup(doc, null)).backup
  assert.deepEqual(back.data.plan, doc.data.plan)
  assert.deepEqual(restorePlan(back.data.plan, [], [], new Map([['c3', uuid(9)]])),
    { ...plan, adds: [{ ...add, category_id: uuid(9) }] })
  // A savings-only plan is written; a savings item whose category is gone can't be savings, so it's dropped.
  const only = { v: 1, changes: [], adds: [], dismissed: [], savings: { cancel: true } }
  assert.deepEqual(buildBackup({ userId: 'u', categories: CATS, plan: only }).data.plan.savings, { cancel: true })
  assert.deepEqual(restorePlan(back.data.plan, [], [], new Map()).adds, [])
})
