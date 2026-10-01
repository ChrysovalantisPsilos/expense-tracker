// The group expense form's rules (GroupExpenseForm), pure so the web's form
// and the native app's run the same ones: where a new or an edited expense
// starts, who a split includes, the split's preview and its line ("€21.15
// each", "€3.00 left to assign"), the collapsed split card, what stops a
// save and the words it says, what a save sends and the toast after it.
// No I/O: the amounts and shares are integer minor units.
import { formatMoney, minorToInput, toMinor } from '../../shared/lib/currency.js'
import { amountError, fieldErrors, requiredError } from '../../shared/lib/formChecks.js'
import { intlLocale, t } from '../../shared/lib/i18n/i18n.js'
import { computeSplit, expenseGroupAmount, prefillSplitValues, splitEqually } from './splitMath.js'
import { splitCountLabel } from './quickAddMath.js'

// The split modes, in the buttons' order; each one's words are
// groups:form.modes.<mode>.
const SPLIT_MODES = ['equal', 'exact', 'percent', 'shares']
export const splitModes = () => SPLIT_MODES

// The required fields, in the order a failed save focuses them.
export const EXPENSE_FIELDS = ['description', 'amount', 'paidBy']

// The inline errors of the required fields ({} when they're all filled in).
export const expenseFieldErrors = ({ description, amount, paidBy }) => fieldErrors({
  description: requiredError(description, t('groups:form.errors.description')),
  amount: amountError(amount),
  paidBy: requiredError(paidBy, t('groups:form.errors.paidBy')),
})

// The mode an expense opens in: its own, or Equally for a new one (an old
// itemised split opens as amounts).
export function initialSplitMode(expense) {
  if (['exact', 'percent', 'shares'].includes(expense?.split_type)) return expense.split_type
  return expense?.split_type === 'items' ? 'exact' : 'equal'
}

// The form as it opens: an expense's own values to edit it, else a new one
// paid by `defaultPayer` (you), split equally between everyone, starting
// from `initial` when the Add form carried a draft over ({ amount, currency,
// currencyPicked, description, spentAt }), on `today`.
export function expenseFormStart({ expense, members, defaultPayer, groupCurrency, initial, today }) {
  const mode = initialSplitMode(expense)
  return {
    description: expense?.description ?? initial?.description ?? '',
    paidCurrency: expense?.currency ?? initial?.currency ?? groupCurrency,
    currencyPicked: !!initial?.currencyPicked,
    amount: expense ? minorToInput(expense.amount_minor, expense.currency ?? groupCurrency) : initial?.amount ?? '',
    paidBy: expense?.paid_by ?? defaultPayer ?? members?.[0]?.id ?? '',
    spentAt: expense?.spent_at ?? initial?.spentAt ?? today,
    splitWith: expense ? (expense.expense_splits ?? []).map((s) => s.member_id) : (members ?? []).map((m) => m.id),
    mode,
    values: expense ? prefillSplitValues(expense, mode, groupCurrency) : {},
  }
}

// The members a split includes (their rows, and their ids), in the group's order.
export const includedMembers = (members, splitWith) => (members ?? []).filter((m) => (splitWith ?? []).includes(m.id))
export const includedIds = (members, splitWith) => includedMembers(members, splitWith).map((m) => m.id)

// The amount as paid, in minor units (0 until one is typed).
export const paidMinorOf = (amount, currency) => (amount && Number(amount) > 0 ? toMinor(amount, currency) : 0)

// What the split has to add up to: the amount in the group currency (0 while
// a foreign amount has no rate).
export const splitTotal = ({ paidMinor, paidCurrency, rate, groupCurrency }) =>
  expenseGroupAmount(paidMinor, paidCurrency, rate, groupCurrency) ?? 0

// The split as it stands: computeSplit's shares for the mode, each included
// member's share by id (`byMember`, and formatted: `shareText`), what's left
// to assign, the line under the split and whether it's complete (`ok`).
//   needsFx  the expense is in another currency than the group's
//   paidMinor, rate  what was paid and the rate (to say the split needs one)
export function splitPreview({ mode, totalMinor, ids, values, currency, needsFx, paidMinor, rate }) {
  const computed = computeSplit(mode, totalMinor, ids, values ?? {}, currency)
  const byMember = Object.fromEntries(ids.map((id, i) => [id, computed.shares[i] ?? 0]))
  const remaining = totalMinor - computed.assigned
  return {
    ...computed,
    byMember,
    shareText: Object.fromEntries(ids.map((id) => [id, formatMoney(byMember[id], currency)])),
    remaining,
    summary: splitLine({ mode, totalMinor, ids, computed, remaining, currency, needsFx, paidMinor, rate }),
    complete: ids.length > 0 && totalMinor > 0 && (mode === 'equal' || computed.ok),
  }
}

function splitLine({ mode, totalMinor, ids, computed, remaining, currency, needsFx, paidMinor, rate }) {
  if (ids.length === 0) return t('groups:form.summary.pickOne')
  if (needsFx && paidMinor && !rate) return t('groups:form.summary.needsRate')
  if (!totalMinor) return t('groups:form.summary.enterAmount')
  if (mode === 'equal') {
    return t('groups:form.summary.each', { amount: formatMoney(splitEqually(totalMinor, ids.length)[0], currency) })
  }
  if (mode === 'exact') {
    if (remaining === 0) return t('groups:form.summary.addsUp')
    return t(remaining > 0 ? 'groups:form.summary.left' : 'groups:form.summary.over',
      { amount: formatMoney(Math.abs(remaining), currency) })
  }
  if (mode === 'percent') {
    const r = Math.round((computed.wsum ?? 0) * 10) / 10
    // English keeps its plain "33.3"; Greek writes "33,3".
    const pct = intlLocale() ? r.toLocaleString(intlLocale()) : String(r)
    return r === 100 ? t('groups:form.summary.pctOk') : t('groups:form.summary.pctPartial', { pct })
  }
  return t(computed.wsum > 0 ? 'groups:form.summary.byShares' : 'groups:form.summary.giveShare')
}

// What a share's field is counted in: the group currency, % or × (shares).
export const shareUnit = (mode, currency) => (mode === 'percent' ? '%' : mode === 'shares' ? '×' : currency)

// The collapsed split card (the Add form's quick layout): "Split equally"
// or "Custom split", over "All 4 · €21.15 each".
export function splitCardParts({ mode, included, total, summary }) {
  return {
    title: t(mode === 'equal' ? 'groups:form.splitEqually' : 'groups:form.customSplit'),
    line: `${splitCountLabel(included, total)} · ${summary}`,
  }
}

// Why the expense can't be saved yet, as the toast says it ({ title,
// description? }), or null. The required fields are checked before this
// (expenseFieldErrors). `fxLoading`: the rate is still being fetched.
export function expenseSaveProblem({ rate, fxLoading, ids, mode, preview, totalMinor, currency }) {
  // Never split a foreign amount without a real rate (no silent 1:1).
  if (!rate) return { title: t(fxLoading ? 'groups:form.toast.fxLoading' : 'groups:form.toast.fxMissing') }
  if (ids.length === 0) return { title: t('groups:form.toast.nobody') }
  if (mode === 'exact' && preview.assigned !== totalMinor) {
    const diff = totalMinor - preview.assigned
    return {
      title: t('groups:form.toast.exactTitle'),
      description: t(diff > 0 ? 'groups:form.toast.missing' : 'groups:form.toast.overBy',
        { amount: formatMoney(Math.abs(diff), currency) }),
    }
  }
  if (mode === 'percent' && !preview.ok) return { title: t('groups:form.toast.percent') }
  if (mode === 'shares' && !preview.ok) return { title: t('groups:form.toast.shares') }
  return null
}

// What a save sends (addSharedExpense / updateSharedExpense's arguments):
// the amount as paid, the rate for a foreign one, the members and, for a
// custom split, their shares in the group currency.
export function expenseSaveArgs({
  groupId, expenseId, description, paidMinor, paidCurrency, needsFx, rate, paidBy, spentAt, ids, mode, preview,
}) {
  return {
    ...(expenseId ? { expenseId } : { groupId }),
    description,
    amountMinor: paidMinor,
    currency: paidCurrency,
    exchangeRate: needsFx ? rate : null,
    paidBy,
    spentAt,
    memberIds: ids,
    shares: mode === 'equal' ? null : ids.map((id) => preview.byMember[id] ?? 0),
    splitType: mode,
  }
}

// The toast after a save: updated, added, or from the Add form ("Added to
// Lisbon trip", with your share or that it isn't split with you).
export function expenseSavedToast({ isEdit, quick, groupName, myShare, currency }) {
  if (isEdit) return { title: t('groups:form.toast.updated') }
  if (!quick) return { title: t('groups:form.toast.added') }
  return {
    title: t('groups:form.toast.addedTo', { name: groupName }),
    description: myShare > 0
      ? t('groups:form.toast.yourShare', { amount: formatMoney(myShare, currency) })
      : t('groups:form.toast.notYours'),
  }
}
