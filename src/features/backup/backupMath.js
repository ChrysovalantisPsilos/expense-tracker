// Pure backup/restore logic (no React/supabase — unit-tested): build the
// backup document from rows the data layer gathered, read + validate a file,
// and plan a restore (category/account remap, duplicate detection, what's new).
//
// FORMAT (version 4) — one JSON file, budgeer-backup-YYYY-MM-DD.json:
//   { format: 'budgeer-backup', version: 4, exportedAt, app: { name },
//     data: { profile, payment, categories, categoryRules, accounts, goals,
//             budgets, recurring, transactions },
//     groupHistory: [...] }                    ← read-only record, never restored
// References inside the file are local keys ("c1" for a category, "a1" for an
// account), never server ids, so a restore remaps them onto whatever ids the
// target account has. Password-protected files are an envelope instead:
//   { format, version, encrypted: true, kdf, iv, ciphertext }  (backupCrypto.js)
// Version 2 added payment.paypal (the PayPal.me name); version 1 files still
// read (no PayPal name). A category's optional `savings` flag (0084: its
// income entries are savings, not income) and an income entry's or recurring
// entry's optional `from_income` (0084: savings taken from income) and an
// expense's or recurring expense's optional `from_savings` (0085: paid from
// savings) read as false when absent, so older files still read too.
// Version 3 added the salary shift (0081): profile.salary_shift_from_day and
// profile.salary_category (a category key, remapped on restore like every
// other reference); older files read as off. Files older than version 3 also
// follow the renames the server made to the default categories since (see
// upgradeCategories). Version 4 allows an account's type 'savings' (0092:
// a savings account, whose balance is the savings total); older files only
// have 'asset' and 'liability' and read as before, and an older app refuses a
// version 4 file with "update the app" rather than a damaged-file error.
// Names the server caps at 60 characters (display
// name, category names, group names) are trimmed to fit instead of failing.
// Deliberately NOT in a backup: UI state (whats_new_seen, tour_done,
// passkey_reminder_off, onboarded_at, language), the weekly-digest opt-in (a consent,
// given in person), transactions.spread_months and recurring_rule_id (derived
// by the server from a rule link, which a restore doesn't recreate), and the
// import wizard's saved column mappings (this device's storage, not the
// account's).
import { deterministicUuid } from '../import/importMath.js'
import { FREQUENCIES } from '../recurring/recurringMath.js'
import { sealText, openText } from './backupCrypto.js'
import { normalisePaypalHandle } from '../../shared/lib/payLinks.js'
import { CATEGORY_ICON_KEYS, CATEGORY_COLOR_KEYS } from '../../shared/lib/categoryStyle.js'
import { UserError } from '../../shared/lib/errors.js'
import { fxQueryDate, rateOnOrBefore, toBaseMinor } from '../../shared/lib/currency.js'
import { translate } from '../../shared/lib/i18n/i18n.js'

// Words in the app's language (backup namespace), looked up when needed.
const say = (key, vars) => translate(key, vars, { defaultNs: 'backup' })

export const BACKUP_FORMAT = 'budgeer-backup'
export const BACKUP_VERSION = 4

// The profiles.base_currency column default.
const DEFAULT_CURRENCY = 'EUR'
const KINDS = ['expense', 'income']
const ACCOUNT_TYPES = ['asset', 'liability', 'savings']
const SPLIT_NOTE_PREFIX = 'Group: '
const MAX_MINOR = Number.MAX_SAFE_INTEGER

export class BackupError extends UserError {}
const fail = (msg) => { throw new BackupError(msg) }
const notABackup = () => fail(say('errors.notABackup'))
// "This backup is damaged (category #3: name)." — `where` and `field` name the
// broken part (technical, so they stay as written).
const damaged = (where, field) => fail(say('errors.damaged', { where, field }))

// budgeer-backup-YYYY-MM-DD.json, in the user's local calendar day.
export function backupFileName(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${BACKUP_FORMAT}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`
}

// A name as the server stores it (display, category and group names: at most
// 60 characters, no control characters — the same clean-up the signup trigger
// does): control characters become spaces, then trimmed and cut to 60
// characters (whole code points, so an emoji is never split). null if empty.
const NAME_MAX = 60
export function clipName(v, max = NAME_MAX) {
  // eslint-disable-next-line no-control-regex
  const s = String(v ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').trim()
  const cut = [...s].slice(0, max).join('').trim()
  return cut || null
}

// ---- Keys used for matching ------------------------------------------------

// Case-, spacing- and Unicode-form-insensitive text for comparisons.
export const normText = (s) => String(s ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase()

// Two transactions are the same entry when these match.
export const txnKey = (t) =>
  `${t.kind}|${t.spent_at}|${t.amount_minor}|${t.currency}|${normText(t.description)}`

const categoryKey = (c) => `${c.kind}|${normText(c.name)}`
const recurringKey = (r) => `${r.kind}|${r.frequency}|${r.amount_minor}|${normText(r.description)}`

// Notes for a restored group share: the group's name is appended so the entry
// still says where it came from once it's a plain personal expense.
// Idempotent — a note that already names the group is left alone.
export function groupShareNote(notes, groupName) {
  const line = groupName ? `${SPLIT_NOTE_PREFIX}${groupName}` : 'Group expense'
  if (!notes) return line
  return notes.split('\n').includes(line) ? notes : `${notes}\n${line}`
}

// ---- Build -----------------------------------------------------------------

// Assemble the document from server rows (as the data modules return them).
// `groupNames` maps group_id → name for shares whose row doesn't embed it;
// `groups` holds each group's { group, members, expenses, settlements,
// balances: Map, comments: Map(targetId → rows) } for the read-only history.
export function buildBackup({
  exportedAt = new Date().toISOString(), userId, profile = {}, payment = {},
  categories = [], categoryRules = [], accounts = [], goals = [], budgets = [],
  recurring = [], transactions = [], groupNames = new Map(), groups = [],
}) {
  const catKey = new Map(categories.map((c, i) => [c.id, `c${i + 1}`]))
  const acctKey = new Map(accounts.map((a, i) => [a.id, `a${i + 1}`]))
  const ref = (map, id) => (id ? map.get(id) ?? null : null)

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt,
    app: { name: 'Budgeer' },
    data: {
      profile: {
        display_name: profile.display_name ?? null,
        base_currency: profile.base_currency ?? null,
        notify_email: profile.notify_email ?? null,
        notify_push: profile.notify_push ?? null,
        yearly_separate: profile.yearly_separate ?? null,
        salary_shift_from_day: profile.salary_shift_from_day ?? null,
        salary_category: ref(catKey, profile.salary_category_id),
      },
      payment: {
        iban: payment.payment_iban ?? null, revolut: payment.payment_revolut ?? null,
        paypal: payment.payment_paypal ?? null,
      },
      categories: categories.map((c) => ({
        key: catKey.get(c.id), name: c.name, kind: c.kind,
        icon: c.icon ?? null, color: c.color ?? null, archived: !!c.is_archived,
        savings: !!c.is_savings,
      })),
      categoryRules: categoryRules.filter((r) => catKey.has(r.category_id))
        .map((r) => ({ pattern: r.pattern, category: catKey.get(r.category_id) })),
      accounts: accounts.map((a) => ({
        key: acctKey.get(a.id), name: a.name, type: a.type ?? 'asset',
        balance_minor: Number(a.balance_minor), currency: a.currency,
      })),
      goals: goals.map((g) => ({
        name: g.name, target_minor: Number(g.target_minor), saved_minor: Number(g.saved_minor),
        currency: g.currency, target_date: g.target_date ?? null,
      })),
      budgets: budgets.filter((b) => catKey.has(b.category_id)).map((b) => ({
        category: catKey.get(b.category_id), period_start: b.period_start,
        amount_minor: Number(b.amount_minor), currency: b.currency,
      })),
      recurring: recurring.map((r) => ({
        kind: r.kind, category: ref(catKey, r.category_id), account: ref(acctKey, r.account_id),
        amount_minor: Number(r.amount_minor), currency: r.currency, description: r.description ?? null,
        frequency: r.frequency, interval_n: r.interval_n ?? 1, next_run: r.next_run,
        end_date: r.end_date ?? null, is_active: r.is_active !== false,
        remind_days_before: r.remind_days_before ?? null,
        ...(r.savings_from_income ? { from_income: true } : {}),
        ...(r.paid_from_savings ? { from_savings: true } : {}),
      })),
      transactions: transactions.map((t) => {
        const shared = !!(t.group_expense_id || t.is_shared)
        return {
          kind: t.kind, category: ref(catKey, t.category_id), account: ref(acctKey, t.account_id),
          amount_minor: Number(t.amount_minor), currency: t.currency,
          exchange_rate: Number(t.exchange_rate ?? 1), description: t.description ?? null,
          notes: t.notes ?? null, spent_at: t.spent_at,
          ...(t.savings_from_income ? { from_income: true } : {}),
          ...(t.paid_from_savings ? { from_savings: true } : {}),
          ...(shared ? {
            group: t.group_expenses?.groups?.name ?? groupNames.get(t.group_id) ?? null,
          } : {}),
        }
      }),
    },
    groupHistory: groups.map((g) => groupRecord(g, userId)),
  }
}

// One group's full ledger by member name (a read-only record for the user).
function groupRecord({ group, members = [], expenses = [], settlements = [], balances = new Map(), comments = new Map() }, userId) {
  const nameOf = new Map(members.map((m) => [m.id, m.display_name || 'Member']))
  const who = (id) => nameOf.get(id) ?? 'Former member'
  const thread = (id) => (comments.get(id) ?? []).map((c) => ({
    author: c.author?.display_name ?? 'Former member', body: c.body, at: c.created_at,
  }))
  return {
    name: group.name,
    currency: group.currency,
    createdAt: group.created_at ?? null,
    members: members.map((m) => ({ name: who(m.id), role: m.role, you: !!userId && m.user_id === userId })),
    balances: members.map((m) => ({ member: who(m.id), net_minor: balances.get(m.id) ?? 0 })),
    expenses: expenses.map((e) => ({
      description: e.description ?? null, amount_minor: Number(e.amount_minor), currency: e.currency,
      // Paid in another currency: what it counted for in the group's (the splits' unit).
      ...(e.currency && e.currency !== group.currency && e.group_amount_minor != null ? {
        exchange_rate: Number(e.exchange_rate), group_amount_minor: Number(e.group_amount_minor),
      } : {}),
      spent_at: e.spent_at, paid_by: who(e.paid_by), split_type: e.split_type ?? 'equal',
      splits: (e.expense_splits ?? []).map((s) => ({ member: who(s.member_id), share_minor: Number(s.share_minor) })),
      comments: thread(e.id),
    })),
    settlements: settlements.map((s) => ({
      from: who(s.from_member), to: who(s.to_member), amount_minor: Number(s.amount_minor),
      currency: s.currency, settled_at: s.settled_at, note: s.note ?? null, comments: thread(s.id),
    })),
  }
}

// ---- Serialise / read --------------------------------------------------------

const aadFor = (version) => `${BACKUP_FORMAT}/${version}`

// The file's text: plain JSON, or the encrypted envelope when a password is set.
export async function serializeBackup(doc, password) {
  const text = JSON.stringify(doc, null, 2)
  if (!password) return text
  const sealed = await sealText(text, password, { aad: aadFor(BACKUP_VERSION) })
  return JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, encrypted: true, ...sealed }, null, 2)
}

// First look at a chosen file: is it ours, a version we understand, and
// encrypted? Returns { encrypted: true, envelope } or { encrypted: false,
// backup } (the validated, cleaned document). Throws BackupError.
export function readBackup(text) {
  let doc
  try { doc = JSON.parse(text) } catch { notABackup() }
  if (!isObj(doc) || doc.format !== BACKUP_FORMAT) notABackup()
  if (!Number.isInteger(doc.version) || doc.version < 1) notABackup()
  if (doc.version > BACKUP_VERSION) fail(say('errors.newer'))
  if (doc.encrypted === true) {
    const { version, kdf, iv, ciphertext } = doc
    return { encrypted: true, envelope: { version, kdf, iv, ciphertext } }
  }
  return { encrypted: false, backup: validateBackup(doc) }
}

// Decrypt an envelope from readBackup and validate what's inside. A wrong
// password or a damaged file throws "Wrong password or damaged file."
export async function unlockBackup(envelope, password) {
  const text = await openText(envelope, password, { aad: aadFor(envelope.version) })
  const inner = readBackup(text)
  if (inner.encrypted) notABackup()
  return inner.backup
}

// ---- Validation ----------------------------------------------------------------
// The file is untrusted input: every field is type-checked and bounded, only
// known keys are copied into a fresh object, and references must resolve.
// Any problem rejects the whole file (a half-restore of a damaged file would
// be worse than none).

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

function checker(where) {
  const bad = (field) => damaged(where, field)
  return {
    list(v, field, max) {
      if (v == null) return []
      if (!Array.isArray(v) || v.length > max) bad(field)
      return v
    },
    obj(v, field) { if (!isObj(v)) bad(field); return v },
    text(v, field, { max = 500, required = false } = {}) {
      if (v == null || v === '') { if (required) bad(field); return null }
      if (typeof v !== 'string' || v.length > max) bad(field)
      return v
    },
    minor(v, field) {
      if (!Number.isSafeInteger(v) || v < 0 || v > MAX_MINOR) bad(field)
      return v
    },
    int(v, field, min, max, { optional = false } = {}) {
      if (v == null && optional) return null
      if (!Number.isInteger(v) || v < min || v > max) bad(field)
      return v
    },
    date(v, field, { optional = false } = {}) {
      if (v == null && optional) return null
      if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)
        || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) bad(field)
      return v
    },
    currency(v, field) { if (typeof v !== 'string' || !/^[A-Z]{3}$/.test(v)) bad(field); return v },
    oneOf(v, list, field) { if (!list.includes(v)) bad(field); return v },
    bool(v, field, { optional = false } = {}) {
      if (v == null && optional) return null
      if (typeof v !== 'boolean') bad(field)
      return v
    },
    ref(v, keys, field) {
      if (v == null) return null
      if (typeof v !== 'string' || !keys.has(v)) bad(field)
      return v
    },
  }
}

// An entry's optional savings flags, each kept only on the kind the server's
// CHECK allows it on: `from_income` (0084: savings taken from income) on
// income, `from_savings` (0085: paid from savings) on an expense.
function savingsFlags(v, entry) {
  return {
    ...(v.bool(entry.from_income ?? false, 'from income') && entry.kind === 'income' ? { from_income: true } : {}),
    ...(v.bool(entry.from_savings ?? false, 'from savings') && entry.kind === 'expense' ? { from_savings: true } : {}),
  }
}

// Files made before version 3 follow what the server did to every account's
// default categories since, so a restore matches today's defaults instead of
// adding a near-duplicate next to them:
//   * 0083 renamed the income "Friend Transfer" to "Friends & family" — unless
//     the account (here: the file) also has an income "Friends & family";
//   * 0084 marked an income "Savings" as savings. A file from before 0084 (no
//     category carries the `savings` key) gets the same.
function upgradeCategories(version, categories, { before0084 }) {
  if (version >= 3) return categories
  const hasIncome = (name) => categories.some((c) => c.kind === 'income' && c.name === name)
  const rename = !hasIncome('Friends & family')
  return categories.map((c) => {
    if (c.kind !== 'income') return c
    if (rename && c.name === 'Friend Transfer') return { ...c, name: 'Friends & family' }
    if (before0084 && c.name === 'Savings') return { ...c, savings: true }
    return c
  })
}

function validateBackup(doc) {
  const top = checker('file')
  const data = top.obj(doc.data, 'data')
  const exportedAt = top.text(doc.exportedAt, 'exportedAt', { max: 40 })

  const p = checker('profile')
  const prof = isObj(data.profile) ? data.profile : {}
  const profile = {
    display_name: clipName(p.text(prof.display_name, 'display name', { max: 10000 })),
    base_currency: prof.base_currency == null ? null : p.currency(prof.base_currency, 'currency'),
    notify_email: p.bool(prof.notify_email, 'email switch', { optional: true }),
    notify_push: p.bool(prof.notify_push, 'push switch', { optional: true }),
    yearly_separate: p.bool(prof.yearly_separate, 'yearly subscriptions switch', { optional: true }),
    // v3+. Its category is resolved below, once the categories are read.
    salary_shift_from_day: p.int(prof.salary_shift_from_day, 'salary day', 1, 31, { optional: true }),
    salary_category: null,
  }
  const pay = isObj(data.payment) ? data.payment : {}
  const pc = checker('payment details')
  const payment = {
    iban: pc.text(pay.iban, 'IBAN', { max: 64 }),
    revolut: pc.text(pay.revolut, 'Revolut', { max: 64 }),
    // v2+. Anything that isn't a valid PayPal.me name is dropped, not restored.
    paypal: normalisePaypalHandle(pc.text(pay.paypal, 'PayPal', { max: 200 })),
  }

  const rawCategories = top.list(data.categories, 'categories', 2000)
  const categories = upgradeCategories(doc.version, rawCategories.map((c, i) => {
    const v = checker(`category #${i + 1}`)
    v.obj(c, 'entry')
    return {
      key: v.text(c.key, 'key', { max: 40, required: true }),
      name: clipName(v.text(c.name, 'name', { max: 10000, required: true })) ?? damaged(`category #${i + 1}`, 'name'),
      kind: v.oneOf(c.kind, KINDS, 'kind'),
      // Only the app's own icon/colour keys (the server's CHECKs); an old or
      // unknown value falls back to the default look.
      icon: CATEGORY_ICON_KEYS.includes(v.text(c.icon, 'icon', { max: 60 })) ? c.icon : null,
      color: CATEGORY_COLOR_KEYS.includes(v.text(c.color, 'colour', { max: 40 })) ? c.color : null,
      archived: v.bool(c.archived ?? false, 'archived'),
      // Only an income category can be savings (the server's CHECK).
      savings: v.bool(c.savings ?? false, 'savings') && c.kind === 'income',
    }
  }), { before0084: !rawCategories.some((c) => 'savings' in c) })
  const catKeys = new Set(categories.map((c) => c.key))
  if (catKeys.size !== categories.length) damaged('categories', 'duplicate key')
  // The salary category must be one of the file's income categories; anything
  // else (unknown key, an expense category) leaves the setting off.
  const salaryKey = typeof prof.salary_category === 'string' ? prof.salary_category : null
  profile.salary_category = categories.some((c) => c.key === salaryKey && c.kind === 'income') ? salaryKey : null

  const accounts = top.list(data.accounts, 'accounts', 1000).map((a, i) => {
    const v = checker(`account #${i + 1}`)
    v.obj(a, 'entry')
    return {
      key: v.text(a.key, 'key', { max: 40, required: true }),
      name: v.text(a.name, 'name', { max: 200, required: true }),
      type: v.oneOf(a.type ?? 'asset', ACCOUNT_TYPES, 'type'),
      balance_minor: v.int(a.balance_minor, 'balance', -MAX_MINOR, MAX_MINOR),
      currency: v.currency(a.currency, 'currency'),
    }
  })
  const acctKeys = new Set(accounts.map((a) => a.key))
  if (acctKeys.size !== accounts.length) damaged('accounts', 'duplicate key')

  const categoryRules = top.list(data.categoryRules, 'rules', 5000).map((r, i) => {
    const v = checker(`rule #${i + 1}`)
    v.obj(r, 'entry')
    const pattern = v.text(r.pattern, 'pattern', { max: 80, required: true })
    if (pattern.length < 2) damaged(`rule #${i + 1}`, 'pattern')
    return { pattern, category: v.ref(r.category, catKeys, 'category') ?? damaged(`rule #${i + 1}`, 'category') }
  })

  const goals = top.list(data.goals, 'goals', 1000).map((g, i) => {
    const v = checker(`goal #${i + 1}`)
    v.obj(g, 'entry')
    return {
      name: v.text(g.name, 'name', { max: 200, required: true }),
      target_minor: v.minor(g.target_minor, 'target'),
      saved_minor: v.minor(g.saved_minor ?? 0, 'saved'),
      currency: v.currency(g.currency, 'currency'),
      target_date: v.date(g.target_date, 'target date', { optional: true }),
    }
  })

  const budgets = top.list(data.budgets, 'budgets', 50000).map((b, i) => {
    const v = checker(`budget #${i + 1}`)
    v.obj(b, 'entry')
    return {
      category: v.ref(b.category, catKeys, 'category') ?? damaged(`budget #${i + 1}`, 'category'),
      period_start: v.date(b.period_start, 'month'),
      amount_minor: v.minor(b.amount_minor, 'amount'),
      currency: v.currency(b.currency, 'currency'),
    }
  })

  const recurring = top.list(data.recurring, 'recurring', 1000).map((r, i) => {
    const v = checker(`recurring entry #${i + 1}`)
    v.obj(r, 'entry')
    return {
      kind: v.oneOf(r.kind, KINDS, 'kind'),
      category: v.ref(r.category, catKeys, 'category'),
      account: v.ref(r.account, acctKeys, 'account'),
      amount_minor: v.minor(r.amount_minor, 'amount'),
      currency: v.currency(r.currency, 'currency'),
      description: v.text(r.description, 'description', { max: 10000 }),
      frequency: v.oneOf(r.frequency, FREQUENCIES, 'frequency'),
      interval_n: v.int(r.interval_n ?? 1, 'interval', 1, 1000),
      next_run: v.date(r.next_run, 'next charge'),
      end_date: v.date(r.end_date, 'end date', { optional: true }),
      is_active: v.bool(r.is_active ?? true, 'active'),
      remind_days_before: v.int(r.remind_days_before, 'reminder', 0, 365, { optional: true }),
      ...savingsFlags(v, r),
    }
  })

  const transactions = top.list(data.transactions, 'transactions', 500000).map((t, i) => {
    const v = checker(`entry #${i + 1}`)
    v.obj(t, 'entry')
    const rate = t.exchange_rate ?? 1
    if (typeof rate !== 'number' || !(rate > 0) || rate > 1e10) damaged(`entry #${i + 1}`, 'exchange rate')
    return {
      kind: v.oneOf(t.kind, KINDS, 'kind'),
      category: v.ref(t.category, catKeys, 'category'),
      account: v.ref(t.account, acctKeys, 'account'),
      amount_minor: v.minor(t.amount_minor, 'amount'),
      currency: v.currency(t.currency, 'currency'),
      exchange_rate: rate,
      description: v.text(t.description, 'description', { max: 10000 }),
      notes: v.text(t.notes, 'notes', { max: 10000 }),
      spent_at: v.date(t.spent_at, 'date'),
      ...savingsFlags(v, t),
      ...('group' in t ? { group: clipName(v.text(t.group, 'group', { max: 10000 })) } : {}),
    }
  })

  const groupHistory = top.list(doc.groupHistory, 'groupHistory', 1000)

  return {
    version: doc.version,
    exportedAt,
    data: { profile, payment, categories, categoryRules, accounts, goals, budgets, recurring, transactions },
    groupCount: groupHistory.length,
  }
}

// What a validated backup holds, for the confirm step.
export function backupContents({ data, groupCount }) {
  const n = (k) => data.transactions.filter((t) => t.kind === k).length
  return {
    expenses: n('expense'),
    income: n('income'),
    groupShares: data.transactions.filter((t) => 'group' in t).length,
    categories: data.categories.length,
    rules: data.categoryRules.length,
    budgets: data.budgets.length,
    recurring: data.recurring.length,
    accounts: data.accounts.length,
    goals: data.goals.length,
    groups: groupCount,
  }
}

// ---- Restore planning ------------------------------------------------------------

// Backup category key → the target's category id, matched on (kind, name)
// ignoring case. `missing` lists the categories to create (one per match key,
// so "Food" and "food" in one file become a single category).
export function mapCategories(backupCats, existingCats) {
  const byKey = new Map()
  for (const c of existingCats) if (!byKey.has(categoryKey(c))) byKey.set(categoryKey(c), c.id)
  const idByKey = new Map()
  const missing = new Map()
  for (const c of backupCats) {
    const k = categoryKey(c)
    if (byKey.has(k)) idByKey.set(c.key, byKey.get(k))
    else if (!missing.has(k)) missing.set(k, c)
  }
  return { idByKey, missing: [...missing.values()] }
}

// Named things (accounts, goals) match on name ignoring case. Returns the
// backup items that are new plus, for keyed items, key → existing id.
export function matchByName(backupItems, existingItems) {
  const byName = new Map(existingItems.map((e) => [normText(e.name), e.id]))
  const idByKey = new Map()
  const fresh = []
  const seen = new Set()
  for (const b of backupItems) {
    const n = normText(b.name)
    if (byName.has(n)) { if (b.key) idByKey.set(b.key, byName.get(n)); continue }
    if (seen.has(n)) continue
    seen.add(n)
    fresh.push(b)
  }
  return { fresh, idByKey, skipped: backupItems.length - fresh.length }
}

// Rules match on (pattern, category). A pattern the account already uses for
// a different category is kept as it is (skipped), never overwritten.
export function planRules(backupRules, existingRules, categoryIdByKey) {
  const taken = new Set(existingRules.map((r) => normText(r.pattern)))
  const create = []
  for (const r of backupRules) {
    const p = normText(r.pattern)
    if (taken.has(p)) continue
    taken.add(p)
    create.push({ pattern: r.pattern, category_id: categoryIdByKey.get(r.category) })
  }
  return { create, skipped: backupRules.length - create.length }
}

// Transactions: a backup entry is a duplicate when the account already holds
// an entry with the same (kind, date, amount, currency, description) —
// counted as a multiset, so two identical coffees in the backup against one in
// the account add exactly one. Each new row gets a deterministic client_uuid
// (user + key + occurrence) so the server's (user_id, client_uuid) constraint
// also absorbs a re-run, e.g. after an interrupted restore.
export async function planTransactions(backupTxns, existingTxns, { userId, categoryIdByKey, accountIdByKey }) {
  const have = new Map()
  for (const t of existingTxns) { const k = txnKey(t); have.set(k, (have.get(k) ?? 0) + 1) }
  const seen = new Map()
  const rows = []
  let duplicates = 0
  for (const t of backupTxns) {
    const k = txnKey(t)
    const occurrence = seen.get(k) ?? 0
    seen.set(k, occurrence + 1)
    if (occurrence < (have.get(k) ?? 0)) { duplicates++; continue }
    rows.push({
      client_uuid: await deterministicUuid(['restore', userId, k, occurrence]),
      kind: t.kind,
      category_id: t.category ? categoryIdByKey.get(t.category) ?? null : null,
      account_id: t.account ? accountIdByKey.get(t.account) ?? null : null,
      amount_minor: t.amount_minor,
      currency: t.currency,
      exchange_rate: t.exchange_rate,
      description: t.description,
      notes: 'group' in t ? groupShareNote(t.notes, t.group) : t.notes,
      spent_at: t.spent_at,
      ...(t.from_income ? { savings_from_income: true } : {}),
      ...(t.from_savings ? { paid_from_savings: true } : {}),
    })
  }
  return { rows, duplicates }
}

// Budgets upsert on (category, month): identical ones are skipped, a
// different amount/currency for the same month is updated.
export function planBudgets(backupBudgets, existingBudgets, categoryIdByKey) {
  const have = new Map(existingBudgets.map((b) => [`${b.category_id}|${b.period_start}`, b]))
  const create = []; const update = []; let unchanged = 0
  const seen = new Set()
  for (const b of backupBudgets) {
    const categoryId = categoryIdByKey.get(b.category)
    const k = `${categoryId}|${b.period_start}`
    if (seen.has(k)) continue
    seen.add(k)
    const row = { categoryId, amountMinor: b.amount_minor, currency: b.currency, periodStart: b.period_start }
    const cur = have.get(k)
    if (!cur) create.push(row)
    else if (Number(cur.amount_minor) !== b.amount_minor || cur.currency !== b.currency) update.push(row)
    else unchanged++
  }
  return { create, update, unchanged }
}

// Recurring rules match on (description, amount, frequency, kind).
export function planRecurring(backupRules, existingRules, { categoryIdByKey, accountIdByKey }) {
  const have = new Set(existingRules.map((r) => recurringKey({ ...r, amount_minor: Number(r.amount_minor) })))
  const create = []
  for (const r of backupRules) {
    const k = recurringKey(r)
    if (have.has(k)) continue
    have.add(k)
    create.push({
      kind: r.kind,
      category_id: r.category ? categoryIdByKey.get(r.category) ?? null : null,
      account_id: r.account ? accountIdByKey.get(r.account) ?? null : null,
      amount_minor: r.amount_minor, currency: r.currency, description: r.description,
      frequency: r.frequency, interval_n: r.interval_n, next_run: r.next_run,
      end_date: r.end_date, is_active: r.is_active, remind_days_before: r.remind_days_before,
      ...(r.from_income ? { savings_from_income: true } : {}),
      ...(r.from_savings ? { paid_from_savings: true } : {}),
    })
  }
  return { create, skipped: backupRules.length - create.length }
}

// What a restore does about the main currency, from the backup's, the
// account's (null: the column default) and whether the account's is locked
// (0078: it has entries — transactions, recurring entries, budgets, accounts
// or goals). 'adopt': an empty account takes the backup's currency, whatever
// it uses now, so nothing needs converting. 'convert': a locked account keeps
// its own and the backup's amounts are restated in it (rebaseBackupData).
// null: same currency, or an old backup that doesn't say. The review screen
// and planProfile both ask this, so they can't disagree.
export function currencyChange(backupBase, accountBase, locked) {
  const target = accountBase || DEFAULT_CURRENCY
  if (!backupBase || backupBase === target) return null
  return locked ? 'convert' : 'adopt'
}

// Profile settings and payment details fill in only what's empty or still at
// its default; anything the account already set is kept and reported (`kept`:
// ids that restoreSummary words, backup:summary.kept.<id>), never
// overwritten. The main currency is the exception: an empty account takes the
// backup's (currencyChange). `emailName` is the email's local part (the signup
// default for the display name); `emptyAccount` means no entries before the
// restore (the main currency isn't locked).
export function planProfile(backup, current, { emailName, emptyAccount }) {
  const patch = {}
  const kept = []
  const b = backup.profile
  if (b.display_name && b.display_name !== current.display_name) {
    if (!current.display_name || current.display_name === emailName) patch.display_name = b.display_name
    else kept.push('displayName')
  }
  const currency = currencyChange(b.base_currency, current.base_currency, !emptyAccount)
  if (currency === 'adopt') patch.base_currency = b.base_currency
  else if (currency === 'convert') kept.push('mainCurrency')
  // Notifications default to on. Only an untouched "on" follows the backup's
  // "off"; a restore never switches notifications on.
  for (const [field, id] of [['notify_email', 'emailNotifications'], ['notify_push', 'pushNotifications']]) {
    if (typeof b[field] !== 'boolean' || b[field] === current[field]) continue
    if (current[field] === true && b[field] === false) patch[field] = false
    else kept.push(id)
  }
  // Yearly subscriptions count in monthly spending by default (0068). Only
  // that untouched default follows a backup that kept them separate.
  if (typeof b.yearly_separate === 'boolean' && b.yearly_separate !== !!current.yearly_separate) {
    if (b.yearly_separate && !current.yearly_separate) patch.yearly_separate = true
    else kept.push('yearlySeparate')
  }
  return { patch, kept }
}

// The salary shift (0081), planned once the categories exist: the backup's
// category key → the target account's id (categoryIdByKey, matched on kind and
// name, so it is always one of the account's own income categories). No id —
// the category isn't in the file or wasn't restored — means nothing is set:
// the shift stays off rather than pointing anywhere else. Like the other
// settings it only fills the default: an account whose shift is off takes the
// backup's (on, or just the remembered category when it's off there too); one
// that has its own is kept and reported.
export function planSalaryShift(backupProfile, current, categoryIdByKey) {
  const day = backupProfile.salary_shift_from_day ?? null
  const categoryId = backupProfile.salary_category ? categoryIdByKey.get(backupProfile.salary_category) ?? null : null
  const curDay = current.salary_shift_from_day ?? null
  const curCat = current.salary_category_id ?? null
  if (!categoryId) return { patch: {}, kept: [] }
  if (curDay == null) {
    if (day != null) return { patch: { salary_shift_from_day: day, salary_category_id: categoryId }, kept: [] }
    return { patch: curCat ? {} : { salary_category_id: categoryId }, kept: [] }
  }
  const differs = day != null && (day !== curDay || categoryId !== curCat)
  return { patch: {}, kept: differs ? ['salaryShift'] : [] }
}

export function planPayment(backup, current) {
  const patch = {}
  const kept = []
  for (const [field, cur] of [
    ['iban', current.payment_iban], ['revolut', current.payment_revolut], ['paypal', current.payment_paypal]]) {
    const v = backup.payment[field]
    if (!v || v === cur) continue
    if (!cur) patch[field] = v
    else kept.push(field)
  }
  return {
    patch: Object.keys(patch).length
      ? {
        iban: patch.iban ?? current.payment_iban ?? null,
        revolut: patch.revolut ?? current.payment_revolut ?? null,
        paypal: patch.paypal ?? current.payment_paypal ?? null,
      }
      : null,
    kept,
  }
}

// ---- Main currency -----------------------------------------------------------------
// What a backup holds in its main currency — each entry's exchange_rate (the
// entry's currency → that main currency) and the budget caps — is restated
// when the target account's main currency differs. Entries keep their own
// amount and currency; each gets the ECB rate for its date into the target's
// main currency (1 when it's already in it), as if it were added there. Budget
// caps have no currency of their own: they're converted at the ECB rate for
// their month, rounded to the target's minor units (toBaseMinor). Account
// balances and savings goals (target and saved) are summed and shown as
// main-currency amounts, so they're converted too, at the latest rate (the
// restore day's). A row already in the target's currency is left alone.
// Recurring entries keep their own currency (the server rates each charge
// when it runs). Same main currency — or an old backup that doesn't say —
// changes nothing.

const needsRebase = (fromBase, toBase) => !!fromBase && !!toBase && fromBase !== toBase

// Which rates a rebase needs: Map<currency, { first, last }> (the dates, as
// the rate is asked for — never the future), for fx.js getRateSeriesMap.
// Empty when nothing needs converting.
export function rebaseRateSpans(data, { fromBase, toBase, todayIso }) {
  const spans = new Map()
  if (!needsRebase(fromBase, toBase)) return spans
  const add = (currency, date) => {
    if (currency === toBase) return
    const d = fxQueryDate(date, todayIso)
    const s = spans.get(currency)
    if (!s) spans.set(currency, { first: d, last: d })
    else {
      if (d < s.first) s.first = d
      if (d > s.last) s.last = d
    }
  }
  for (const t of data.transactions) add(t.currency, t.spent_at)
  for (const b of data.budgets) add(b.currency, b.period_start)
  for (const x of [...data.accounts, ...data.goals]) add(x.currency, todayIso)
  return spans
}

// The backup's data restated in `toBase`, using `seriesByCurrency` (Map<currency,
// [[date, rate]]>, currency → toBase). The same object when nothing needs
// converting. Any rate missing (offline, API down) rejects the whole restore:
// a wrong number is worse than none.
export function rebaseBackupData(data, { fromBase, toBase, seriesByCurrency, todayIso }) {
  if (!needsRebase(fromBase, toBase)) return data
  const rateFor = (currency, date) => (currency === toBase ? 1
    : rateOnOrBefore(seriesByCurrency.get(currency) ?? [], fxQueryDate(date, todayIso))?.rate
      ?? fail(say('errors.ratesMissing')))
  // `fields` (minor amounts) of a row in its own currency → toBase at `date`.
  const convert = (row, fields, date) => {
    if (row.currency === toBase) return row
    const rate = rateFor(row.currency, date)
    const out = { ...row, currency: toBase }
    for (const f of fields) out[f] = toBaseMinor(row[f], rate, row.currency, toBase)
    return out
  }
  return {
    ...data,
    transactions: data.transactions.map((t) => ({ ...t, exchange_rate: rateFor(t.currency, t.spent_at) })),
    budgets: data.budgets.map((b) => convert(b, ['amount_minor'], b.period_start)),
    accounts: data.accounts.map((a) => convert(a, ['balance_minor'], todayIso)),
    goals: data.goals.map((g) => convert(g, ['target_minor', 'saved_minor'], todayIso)),
  }
}

// ---- Summary ---------------------------------------------------------------------

// "a, b and c" (the last pair joined by the language's "and").
const listOf = (items) => (items.length < 2 ? items.join('')
  : say('summary.list', { rest: items.slice(0, -1).join(', '), last: items[items.length - 1] }))

// The tallies the summary counts, in order (backup:summary.<id>_one/_other).
const TALLIES = ['expenses', 'income', 'categories', 'rules', 'budgets', 'recurring', 'accounts', 'goals',
  'budgetsUpdated', 'settings']

// "Added 212 expenses, 14 categories… Skipped 3 duplicates." from the restore's
// tallies, in the app's language. Returns { added, skipped, kept } sentences
// (null when empty).
export function restoreSummary(tally) {
  const parts = TALLIES.filter((id) => tally[id] > 0).map((id) => say(`summary.${id}`, { count: tally[id] }))
  const added = parts.length ? say('summary.added', { items: parts.join(', ') }) : say('summary.nothingNew')
  const skipped = tally.duplicates > 0 ? say('summary.skipped', { count: tally.duplicates }) : null
  const kept = tally.kept?.length
    ? say(tally.kept.length === 1 ? 'summary.keptOne' : 'summary.keptMany',
      { items: listOf(tally.kept.map((id) => say(`summary.kept.${id}`))) })
    : null
  return { added, skipped, kept }
}

// ---- Fetch windows -------------------------------------------------------------------

// Split an inclusive [from, to] date range (YYYY-MM-DD) into two halves, for
// fetching a long history in pieces under the server's row cap. A single day
// can't be split (returns null).
export function splitDateRange(from, to) {
  const day = 86400000
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  if (!(b > a)) return null
  const mid = a + Math.floor((b - a) / day / 2) * day
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10)
  return [[from, iso(mid)], [iso(mid + day), to]]
}
