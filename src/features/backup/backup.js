// Backup & restore data layer: gathers everything through the features' own
// read functions/RPCs (ledger values arrive decrypted for the owner) and
// restores through the same encrypting write RPCs the app uses. The document
// format, validation, matching and dedupe are pure — see backupMath.js.
import { saveBlob } from '../../shared/lib/download.js'
import {
  listTransactions, countTransactions, oldestTransactionDate, listAllCategories, createCategories,
} from '../transactions/useData.js'
import { listRecurring, saveRecurring } from '../recurring/recurring.js'
import { listBudgets, budgetPeriods, saveBudget } from '../budgets/budgets.js'
import { listAccounts, saveAccount, listGoals, saveGoal } from '../insights/insights.js'
import { getProfile, updateProfile, getMyPaymentInfo, savePaymentInfo } from '../../shared/lib/profile.js'
import { listGroups, getGroup } from '../groups/groups.js'
import { listComments, commentCounts } from '../groups/comments.js'
import { listRules, saveRule, importTransactions } from '../import/importExpenses.js'
import {
  buildBackup, serializeBackup, backupFileName, splitDateRange, mapCategories, matchByName,
  planRules, planTransactions, planBudgets, planRecurring, planProfile, planPayment,
} from './backupMath.js'

const PROFILE_FIELDS = 'display_name, base_currency, notify_email, notify_push'
// my_transactions is capped by the API's row limit; a window that comes back
// full is split in half until each piece fits.
const ROW_CAP = 1000

// Every transaction, newest first. One call for most accounts; longer
// histories are fetched in date windows. The total is checked against a head
// count so a backup can never be silently incomplete. `baseCurrency` (backup)
// estimates any rate the server hasn't filled in yet, like the app does.
async function allTransactions(baseCurrency) {
  const first = await listTransactions({ baseCurrency })
  let rows = first
  if (first.length >= ROW_CAP) {
    const from = await oldestTransactionDate()
    const to = first[0].spent_at
    rows = []
    const pending = [[from, to]]
    while (pending.length) {
      const [a, b] = pending.shift()
      const part = await listTransactions({ from: a, to: b, baseCurrency })
      const halves = part.length >= ROW_CAP ? splitDateRange(a, b) : null
      if (halves) pending.unshift(...halves)
      else rows.push(...part)
    }
  }
  const total = await countTransactions()
  if (rows.length !== total) {
    throw new Error('Couldn’t read all of your entries — please try again.')
  }
  return rows
}

async function allBudgets() {
  const periods = await budgetPeriods()
  const out = []
  for (const p of periods) out.push(...await listBudgets(p))
  return out
}

// Each group's full ledger plus its comment threads (only items that have any).
async function groupLedgers(groups) {
  const out = []
  for (const g of groups) {
    const detail = await getGroup(g.id)
    const counts = await commentCounts(g.id)
    const comments = new Map()
    for (const [targetId, n] of counts) if (n > 0) comments.set(targetId, await listComments(g.id, targetId))
    out.push({ ...detail, comments })
  }
  return out
}

// Gather the signed-in user's data into a backup document.
// `onStep(label)` narrates progress for the dialog.
async function gatherBackup(userId, onStep = () => {}) {
  onStep('Reading your settings')
  const [profile, payment] = await Promise.all([getProfile(userId, PROFILE_FIELDS), getMyPaymentInfo()])
  onStep('Reading categories, accounts and goals')
  const [categories, categoryRules, accounts, goals] = await Promise.all([
    listAllCategories(), listRules(), listAccounts(), listGoals(),
  ])
  onStep('Reading budgets and recurring entries')
  const [budgets, recurring] = await Promise.all([allBudgets(), listRecurring()])
  onStep('Reading expenses and income')
  const transactions = await allTransactions(profile?.base_currency || 'EUR')
  onStep('Reading group history')
  const groupList = await listGroups()
  const groups = await groupLedgers(groupList)
  return buildBackup({
    userId, profile: profile ?? {}, payment, categories, categoryRules, accounts, goals,
    budgets, recurring, transactions,
    groupNames: new Map(groupList.map((g) => [g.id, g.name])), groups,
  })
}

// Build, optionally password-protect, and download the backup file.
export async function downloadBackup(userId, password, onStep) {
  const doc = await gatherBackup(userId, onStep)
  onStep?.(password ? 'Encrypting' : 'Saving')
  const text = await serializeBackup(doc, password)
  saveBlob(new Blob([text], { type: 'application/json' }), backupFileName())
}

// Merge a validated backup into the signed-in account: add what's missing,
// skip duplicates, never delete or overwrite (budgets for the same month
// excepted — those upsert). Safe to run twice. Order matters: categories and
// accounts first (everything else references them), transactions before
// budgets (so restoring history doesn't fire "budget exceeded" alerts for
// past months), profile last.
// `onProgress({ label, done, total })` drives the progress bar.
export async function restoreBackup(user, backup, onProgress = () => {}) {
  const { data } = backup
  const step = (label, done = 0, total = 0) => onProgress({ label, done, total })
  const t = {
    expenses: 0, income: 0, categories: 0, rules: 0, budgets: 0, budgetsUpdated: 0,
    recurring: 0, accounts: 0, goals: 0, settings: 0, duplicates: 0, kept: [],
  }

  step('Checking what’s already in your account')
  const [cats, existingAccounts, existingTxns] = await Promise.all([
    listAllCategories(), listAccounts(), allTransactions(),
  ])

  step('Categories')
  const catPlan = mapCategories(data.categories, cats)
  await createCategories(user.id, catPlan.missing.map((c) => ({
    name: c.name, kind: c.kind, icon: c.icon, color: c.color, is_archived: c.archived,
  })))
  t.categories = catPlan.missing.length
  t.duplicates += data.categories.length - catPlan.missing.length
  const categoryIdByKey = catPlan.missing.length
    ? mapCategories(data.categories, await listAllCategories()).idByKey
    : catPlan.idByKey

  step('Accounts')
  const acctPlan = matchByName(data.accounts, existingAccounts)
  for (const a of acctPlan.fresh) {
    await saveAccount({ name: a.name, type: a.type, balance_minor: a.balance_minor, currency: a.currency })
  }
  t.accounts = acctPlan.fresh.length
  t.duplicates += acctPlan.skipped
  const accountIdByKey = acctPlan.fresh.length
    ? matchByName(data.accounts, await listAccounts()).idByKey
    : acctPlan.idByKey

  step('Auto-category rules')
  const rulePlan = planRules(data.categoryRules, await listRules(), categoryIdByKey)
  for (const r of rulePlan.create) await saveRule(user.id, r.pattern, r.category_id)
  t.rules = rulePlan.create.length
  t.duplicates += rulePlan.skipped

  const txPlan = await planTransactions(data.transactions, existingTxns,
    { userId: user.id, categoryIdByKey, accountIdByKey })
  t.duplicates += txPlan.duplicates
  // Saved per kind so the summary can say how many of each were new; rows the
  // server itself recognises (same client_uuid, e.g. from an interrupted
  // earlier restore) come back as duplicates.
  const total = txPlan.rows.length
  let done = 0
  step('Expenses and income', 0, total)
  for (const kind of ['expense', 'income']) {
    const rows = txPlan.rows.filter((r) => r.kind === kind)
    const base = done
    const res = await importTransactions(rows, (n) => step('Expenses and income', base + n, total))
    done += rows.length
    t[kind === 'expense' ? 'expenses' : 'income'] = res.inserted
    t.duplicates += res.duplicates
  }

  step('Recurring entries')
  const recPlan = planRecurring(data.recurring, await listRecurring(), { categoryIdByKey, accountIdByKey })
  for (const r of recPlan.create) await saveRecurring(r)
  t.recurring = recPlan.create.length
  t.duplicates += recPlan.skipped

  step('Budgets')
  const budPlan = planBudgets(data.budgets, await allBudgets(), categoryIdByKey)
  for (const b of [...budPlan.create, ...budPlan.update]) await saveBudget(b)
  t.budgets = budPlan.create.length
  t.budgetsUpdated = budPlan.update.length
  t.duplicates += budPlan.unchanged

  step('Savings goals')
  const goalPlan = matchByName(data.goals, await listGoals())
  for (const g of goalPlan.fresh) await saveGoal(g)
  t.goals = goalPlan.fresh.length
  t.duplicates += goalPlan.skipped

  step('Profile and payment details')
  const current = await getProfile(user.id, PROFILE_FIELDS) ?? {}
  const prof = planProfile(data, current, {
    emailName: (user.email ?? '').split('@')[0], emptyAccount: existingTxns.length === 0,
  })
  if (Object.keys(prof.patch).length) await updateProfile(user.id, prof.patch)
  const pay = planPayment(data, await getMyPaymentInfo())
  if (pay.patch) await savePaymentInfo(pay.patch)
  t.settings = Object.keys(prof.patch).length + (pay.patch ? 1 : 0)
  t.kept = [...prof.kept, ...pay.kept]
  return t
}
