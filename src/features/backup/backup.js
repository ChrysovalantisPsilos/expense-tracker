// Backup & restore data layer: gathers everything through the features' own
// read functions/RPCs (ledger values arrive decrypted for the owner) and
// restores through the same encrypting write RPCs the app uses. The document
// format, validation, matching and dedupe are pure — see backupMath.js.
import { saveBlob } from '../../shared/lib/download.js'
import { listTransactions, countTransactions, oldestTransactionDate } from '../../shared/lib/transactions.js'
import { listAllCategories, createCategories } from '../../shared/lib/categories.js'
import { listRecurring, saveRecurring } from '../recurring/recurring.js'
import { readPlan, savePlan } from '../plan/plan.js'
import { readMealVouchers, saveMealVouchers } from '../vouchers/vouchers.js'
import { isEmptyPlan } from '../plan/planMath.js'
import { listBudgets, budgetPeriods, saveBudget } from '../budgets/budgets.js'
import { listAccounts, saveAccount } from '../../shared/lib/accounts.js'
import { listGoals, saveGoal } from '../savings/savings.js'
import {
  baseCurrencyLocked, fetchProfile, updateProfile, getMyPaymentInfo, savePaymentInfo,
} from '../../shared/lib/profile.js'
import { getRateSeriesMap } from '../../shared/lib/fx.js'
import { today } from '../../shared/lib/dates.js'
import { listGroups, getGroup } from '../groups/groups.js'
import { listComments, commentCounts } from '../groups/comments.js'
import { listRules, saveRule, importTransactions } from '../import/importExpenses.js'
import {
  buildBackup, serializeBackup, backupFileName, splitDateRange, mapCategories, matchByName,
  planRules, planTransactions, planBudgets, planRecurring, planProfile, planSalaryShift, planPayment, restorePlan,
  rebaseRateSpans, rebaseBackupData, currencyChange,
} from './backupMath.js'
import { UserError } from '../../shared/lib/errors.js'
import { t } from '../../shared/lib/i18n/i18n.js'

// The profile settings a backup carries (see backupMath.js for what's left out).
const PROFILE_FIELDS = 'display_name, base_currency, notify_email, notify_push, yearly_separate, '
  + 'salary_shift_from_day, salary_category_id'
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
    throw new UserError(t('backup:errors.incomplete'))
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
// `onStep(label)` narrates progress for the export page, in the app's language.
async function gatherBackup(userId, onStep = () => {}) {
  onStep(t('backup:export.steps.settings'))
  // fetchProfile throws on a failed read: a backup without its settings (and
  // its main currency) must stop with an error, not download incomplete.
  const [profile, payment] = await Promise.all([fetchProfile(userId, PROFILE_FIELDS), getMyPaymentInfo()])
  onStep(t('backup:export.steps.lists'))
  const [categories, categoryRules, accounts, goals] = await Promise.all([
    listAllCategories(), listRules(), listAccounts(), listGoals(),
  ])
  onStep(t('backup:export.steps.plans'))
  const [budgets, recurring, plan, vouchers] = await Promise.all([
    allBudgets(), listRecurring(), readPlan(), readMealVouchers(),
  ])
  onStep(t('backup:export.steps.entries'))
  const transactions = await allTransactions(profile?.base_currency || 'EUR')
  onStep(t('backup:export.steps.groups'))
  const groupList = await listGroups()
  const groups = await groupLedgers(groupList)
  return buildBackup({
    userId, profile: profile ?? {}, payment, categories, categoryRules, accounts, goals,
    budgets, recurring, transactions, plan, vouchers,
    groupNames: new Map(groupList.map((g) => [g.id, g.name])), groups,
  })
}

// Build, optionally password-protect, and download the backup file.
export async function downloadBackup(userId, password, onStep) {
  const doc = await gatherBackup(userId, onStep)
  onStep?.(t(password ? 'backup:export.steps.encrypting' : 'backup:export.steps.saving'))
  const text = await serializeBackup(doc, password)
  saveBlob(new Blob([text], { type: 'application/json' }), backupFileName())
}

// The backup's data restated in the target account's main currency `toBase`
// (see backupMath.js rebaseBackupData): the ECB rates are fetched the way an
// import fetches them, one range per currency. Throws before anything is
// written when a rate is missing.
async function inMainCurrency(data, toBase) {
  const opts = { fromBase: data.profile.base_currency, toBase, todayIso: today() }
  const spans = rebaseRateSpans(data, opts)
  const seriesByCurrency = spans.size ? await getRateSeriesMap(spans, toBase) : new Map()
  return rebaseBackupData(data, { ...opts, seriesByCurrency })
}

// Whether the account's main currency is locked (0078). A failed check counts
// as locked: never plan to switch a currency we can't confirm is free.
const currencyLocked = () => baseCurrencyLocked().catch(() => true)

// For the review screen: what the restore will do about the main currency —
// { change: 'convert' | 'adopt' | null, from, to } (see currencyChange), `from`
// the backup's currency and `to` the account's, as restoreBackup decides it.
export async function restoreCurrencyPlan(userId, backup) {
  // A failed read throws (never guess EUR: the plan would convert wrongly).
  const [profile, locked] = await Promise.all([fetchProfile(userId, 'base_currency'), currencyLocked()])
  const from = backup.data.profile.base_currency
  const to = profile?.base_currency || 'EUR'
  return { change: currencyChange(from, to, locked), from, to }
}

// Merge a validated backup into the signed-in account: add what's missing,
// skip duplicates, never delete or overwrite (budgets for the same month
// excepted — those upsert). Safe to run twice. Order matters: categories and
// accounts first (everything else references them), transactions before
// budgets (so restoring history doesn't fire "budget exceeded" alerts for
// past months), profile last. Values in the backup's main currency are
// converted first when the account's main currency differs.
// `onProgress({ label, done, total })` drives the progress bar.
export async function restoreBackup(user, backup, onProgress = () => {}) {
  const step = (id, done = 0, total = 0) => onProgress({ label: t(`backup:restore.progressSteps.${id}`), done, total })
  const tally = {
    expenses: 0, income: 0, categories: 0, rules: 0, budgets: 0, budgetsUpdated: 0,
    recurring: 0, plan: 0, accounts: 0, goals: 0, settings: 0, duplicates: 0, kept: [],
  }

  step('checking')
  // The profile must be read: its main currency decides what the amounts mean.
  const [cats, existingAccounts, existingTxns, current, locked] = await Promise.all([
    listAllCategories(), listAccounts(), allTransactions(),
    fetchProfile(user.id, PROFILE_FIELDS), currencyLocked(),
  ])

  // Profile settings go first: the main currency can only change while the
  // account has no entries (0078), i.e. before this restore adds any.
  const prof = planProfile(backup.data, current ?? {}, {
    emailName: (user.email ?? '').split('@')[0], emptyAccount: !locked,
  })
  const data = await inMainCurrency(backup.data,
    prof.patch.base_currency ?? current?.base_currency ?? 'EUR')
  if (Object.keys(prof.patch).length) await updateProfile(user.id, prof.patch)

  step('categories')
  const catPlan = mapCategories(data.categories, cats)
  await createCategories(user.id, catPlan.missing.map((c) => ({
    name: c.name, kind: c.kind, icon: c.icon, color: c.color, is_archived: c.archived,
    is_savings: c.savings, default_key: c.default_key, // a hint: the server re-derives it (0094)
  })))
  tally.categories = catPlan.missing.length
  tally.duplicates += data.categories.length - catPlan.missing.length
  const categoryIdByKey = catPlan.missing.length
    ? mapCategories(data.categories, await listAllCategories()).idByKey
    : catPlan.idByKey

  // The salary shift points at a category, so it's set once they exist —
  // the same profile update Settings › Monthly spending makes (0081's column
  // grant; the server re-checks the category is the caller's own income one).
  const salary = planSalaryShift(data.profile, current ?? {}, categoryIdByKey)
  if (Object.keys(salary.patch).length) await updateProfile(user.id, salary.patch)

  step('accounts')
  const acctPlan = matchByName(data.accounts, existingAccounts)
  for (const a of acctPlan.fresh) {
    await saveAccount({ name: a.name, type: a.type, balance_minor: a.balance_minor, currency: a.currency })
  }
  tally.accounts = acctPlan.fresh.length
  tally.duplicates += acctPlan.skipped
  const accountIdByKey = acctPlan.fresh.length
    ? matchByName(data.accounts, await listAccounts()).idByKey
    : acctPlan.idByKey

  step('rules')
  const rulePlan = planRules(data.categoryRules, await listRules(), categoryIdByKey)
  for (const r of rulePlan.create) await saveRule(user.id, r.pattern, r.category_id)
  tally.rules = rulePlan.create.length
  tally.duplicates += rulePlan.skipped

  const txPlan = await planTransactions(data.transactions, existingTxns,
    { userId: user.id, categoryIdByKey, accountIdByKey })
  tally.duplicates += txPlan.duplicates
  // Saved per kind so the summary can say how many of each were new; rows the
  // server itself recognises (same client_uuid, e.g. from an interrupted
  // earlier restore) come back as duplicates.
  const total = txPlan.rows.length
  let done = 0
  step('entries', 0, total)
  for (const kind of ['expense', 'income']) {
    const rows = txPlan.rows.filter((r) => r.kind === kind)
    const base = done
    const res = await importTransactions(rows, (n) => step('entries', base + n, total))
    done += rows.length
    tally[kind === 'expense' ? 'expenses' : 'income'] = res.inserted
    tally.duplicates += res.duplicates
  }

  step('recurring')
  const recPlan = planRecurring(data.recurring, await listRecurring(), { categoryIdByKey, accountIdByKey })
  for (const r of recPlan.create) await saveRecurring(r)
  tally.recurring = recPlan.create.length
  tally.duplicates += recPlan.skipped

  // Plan mode's plan: only into an account that has none (never over the
  // user's own), with the changes whose recurring entry is here.
  if (data.plan && isEmptyPlan(await readPlan())) {
    const plan = restorePlan(data.plan, data.recurring, await listRecurring(), categoryIdByKey)
    if (!isEmptyPlan(plan)) {
      await savePlan(plan)
      tally.plan = 1
    }
  }

  // The meal voucher setup: only into an account that doesn't get vouchers yet.
  if (data.vouchers && !(await readMealVouchers())) await saveMealVouchers(user.id, data.vouchers)

  step('budgets')
  const budPlan = planBudgets(data.budgets, await allBudgets(), categoryIdByKey)
  for (const b of [...budPlan.create, ...budPlan.update]) await saveBudget(b)
  tally.budgets = budPlan.create.length
  tally.budgetsUpdated = budPlan.update.length
  tally.duplicates += budPlan.unchanged

  step('goals')
  const goalPlan = matchByName(data.goals, await listGoals())
  for (const g of goalPlan.fresh) await saveGoal(g)
  tally.goals = goalPlan.fresh.length
  tally.duplicates += goalPlan.skipped

  step('payment')
  const pay = planPayment(data, await getMyPaymentInfo())
  if (pay.patch) await savePaymentInfo(pay.patch)
  tally.settings = Object.keys(prof.patch).length + (Object.keys(salary.patch).length ? 1 : 0) + (pay.patch ? 1 : 0)
  tally.kept = [...prof.kept, ...salary.kept, ...pay.kept]
  return tally
}
