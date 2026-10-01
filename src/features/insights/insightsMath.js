import {
  toBaseMinor, minorFactor, baseEquivalent, formatMoney, formatSigned, minorToInput, rateText, toMinor,
} from '../../shared/lib/currency.js'
import { monthHeading } from '../../shared/lib/dates.js'
import { signedAmount } from '../../shared/ui/kit/kitMath.js'
import { bucketLabel, bucketLabels, bucketOf, sumToBaseByKey } from '../../shared/lib/txnRollup.js'
import { isSavingsAccount, isSpending, netSign, rowEffect } from '../../shared/lib/savings.js'
import { categoryBars } from '../dashboard/categoryBars.js'
import { entryName } from '../../shared/lib/categoryName.js'
import { t } from '../../shared/lib/i18n/i18n.js'

// Income/expense trend in MAJOR base-currency units, one entry per month bucket
// (keyed by YYYY-MM). `months` come from lastMonths(); rows outside those months
// are ignored. Values are major units so the chart axis reads naturally. Pass
// spendRows output (shared/lib/spread.js) so a yearly subscription counts its
// monthly share in each month. Savings entries (in `savingsIds`, 0084) are
// neither income nor spending; `net` (what's left over: income − expenses −
// savings taken from income) is the one figure they touch. An expense paid
// from savings (0085) is spending, but leaves `net` alone.
export function buildTrend(rows, months, baseCurrency, savingsIds = new Set()) {
  const factor = minorFactor(baseCurrency)
  const by = new Map(months.map((m) => [m.key, { label: m.label, income: 0, expense: 0, net: 0 }]))
  for (const r of rows) {
    const key = String(r.spent_at).slice(0, 7)
    const bucket = by.get(key)
    if (!bucket) continue
    const base = toBaseMinor(r.amount_minor, r.exchange_rate, r.currency, baseCurrency) / factor
    const effect = rowEffect(r, savingsIds)
    if (effect === 'income') bucket.income += base
    else if (isSpending(effect)) bucket.expense += base
    bucket.net += netSign(effect) * base
  }
  return [...by.values()]
}

// Whether a trend has anything to draw: some income or spending in any of
// its months. An all-zero trend shows a note instead of an empty chart.
export function hasTrendData(trend) {
  return (trend ?? []).some((m) => m.income > 0 || m.expense > 0)
}

// Percent change in spend from the previous month to the latest one, or null
// when there's no prior month or it had zero spend (avoids divide-by-zero).
export function spendDelta(trend) {
  const thisM = trend[trend.length - 1]
  const lastM = trend[trend.length - 2]
  if (!thisM || !lastM || lastM.expense <= 0) return null
  return Math.round(((thisM.expense - lastM.expense) / lastM.expense) * 100)
}

// Split account balances (minor units) into assets vs liabilities, plus net.
// `savings` — the savings pot in the base currency (savingsPotMinor over all
// time: every savings entry, 0084, minus every expense paid from savings,
// 0085) — is the read-only "Savings" line: an asset, or, once more was paid
// from savings than was recorded going in, a liability of the shortfall.
// Savings accounts (type 'savings', 0092) are assets like any other; while
// the user has one, they ARE the savings (savingsTotal in shared/lib/savings),
// so the pot line is left out and nothing is counted twice. `showPot` says
// whether the pot line is shown (it's hidden at exactly zero, too).
export function netWorth(accounts, savings = 0) {
  const showPot = savings !== 0 && !accounts.some(isSavingsAccount)
  const pot = showPot ? savings : 0
  let assets = Math.max(0, pot), liabilities = Math.max(0, -pot)
  for (const acc of accounts) {
    if (acc.type === 'liability') liabilities += acc.balance_minor
    else assets += acc.balance_minor
  }
  return { assets, liabilities, net: assets - liabilities, showPot }
}

// Net worth's two lists: the savings accounts (under "Savings", 0092) and
// every other account (under "Accounts"), each in the order given.
export function accountSections(accounts) {
  return {
    savings: accounts.filter(isSavingsAccount),
    other: accounts.filter((a) => !isSavingsAccount(a)),
  }
}

// The net-worth card as it shows (netWorth, accountSections): the assets,
// the debts (red once there are any), whether there's nothing to list yet,
// the savings accounts, the savings pot's line (its signed amount, red and
// "More paid from savings than saved" below zero; null when it's hidden),
// the other accounts, and the net worth (red below zero). Each account row:
// its kind ('asset' | 'debt' | 'savings'), name, what it is, the balance in
// its own currency (a debt with a minus, red), and the account itself (to
// edit or delete).
export function netWorthParts(accounts, savings, currency) {
  const { assets, liabilities, net, showPot } = netWorth(accounts, savings)
  const sections = accountSections(accounts)
  const row = (acc) => {
    const kind = acc.type === 'liability' ? 'debt' : acc.type === 'savings' ? 'savings' : 'asset'
    return {
      id: acc.id,
      kind,
      title: acc.name,
      meta: t(`insights:netWorth.${kind === 'savings' ? 'savingsAccount' : kind}`),
      amount: `${kind === 'debt' ? '−' : ''}${formatMoney(acc.balance_minor, acc.currency)}`,
      tone: kind === 'debt' ? 'negative' : 'default',
      account: acc,
    }
  }
  return {
    assets: formatMoney(assets, currency),
    debts: { text: formatMoney(liabilities, currency), tone: liabilities > 0 ? 'negative' : 'muted' },
    empty: accounts.length === 0 && savings === 0,
    savings: sections.savings.map(row),
    pot: showPot ? {
      amount: formatSigned(savings, currency),
      tone: savings < 0 ? 'negative' : 'default',
      overdrawn: savings < 0 ? t('insights:netWorth.overdrawn') : null,
    } : null,
    accounts: sections.other.map(row),
    net: { text: formatMoney(net, currency), tone: net < 0 ? 'negative' : 'default' },
  }
}

// An account's page: its kinds, worded ([{ value, label }]).
export const ACCOUNT_TYPES = ['asset', 'liability', 'savings']
export const accountTypes = () => ACCOUNT_TYPES.map((value) => ({ value, label: t(`insights:account.${value}`) }))

// The form's fields as it opens: the account's own, or a new asset in the
// base currency with no balance yet.
export function accountDraft(account, baseCurrency) {
  if (!account) return { name: '', type: 'asset', balance: '', currency: baseCurrency }
  return {
    name: account.name, type: account.type,
    balance: minorToInput(account.balance_minor, account.currency), currency: account.currency,
  }
}

// The form ready to save: { error } (the name is missing, worded) or
// { account } as save_account takes it (`id` null for a new one).
export function accountToSave(draft, id = null) {
  if (!draft.name.trim()) return { error: t('insights:account.nameIt') }
  return {
    account: {
      id: id ?? null, name: draft.name.trim(), type: draft.type,
      balance_minor: toMinor(Number(draft.balance) || 0, draft.currency), currency: draft.currency,
    },
  }
}

// Expense rows (anything not income) dated in the `monthKey` (YYYY-MM) month.
const monthExpenses = (rows, monthKey) =>
  rows.filter((r) => r.kind !== 'income' && String(r.spent_at).slice(0, 7) === monthKey)

// "Where your money went": the month's spending by category as StackedBar /
// ShareLegend items [{ name, label, share }] — top 5 + "Other", integer
// shares that sum to 100, "Other" last (`folded: true` when it merges several
// buckets). `name` is the bucket (bucketOf), `label` what it's called on
// screen (bucketLabel). Buckets and converts exactly like the dashboard breakdown
// (bucketOf + sumToBaseByKey, then categoryBars). [] when nothing was spent.
export function spendingShares(rows, monthKey, baseCurrency) {
  const expenses = monthExpenses(rows, monthKey)
  const totals = sumToBaseByKey(expenses, baseCurrency, bucketOf)
  const labels = bucketLabels(expenses)
  const categories = [...totals.entries()].map(([name, value]) => ({ name, value }))
  return categoryBars(categories).map((c) => ({
    name: c.name, label: bucketLabel(c, labels), share: c.share, ...(c.folded && { folded: true }),
  }))
}

// "Spending abroad": the month's foreign-currency expenses with their value
// in the base currency at each row's captured rate (baseEquivalent), newest
// first as given, plus the base-currency total. Rows in the base currency or
// without a rate are left out, so { items: [], totalBaseMinor: 0 } means
// there's nothing to show.
//   items: [{ id, label, currency, minor, rate, baseMinor }]
export function foreignSpending(rows, monthKey, baseCurrency) {
  const items = []
  for (const r of monthExpenses(rows, monthKey)) {
    const conv = baseEquivalent(r.amount_minor, r.exchange_rate, r.currency, baseCurrency)
    if (!conv) continue
    items.push({
      id: r.id, label: entryName(r, t('insights:expense')),
      currency: r.currency, minor: r.amount_minor, rate: conv.rate, baseMinor: conv.baseMinor,
    })
  }
  return { items, totalBaseMinor: items.reduce((sum, i) => sum + i.baseMinor, 0) }
}

// ---- The Insights page's words (Insights.jsx, the native app) ---------------

// How many foreign-currency rows "Spending abroad" lists (the total covers all).
const ABROAD_ROWS = 5

// "Spending abroad" as the card shows it (foreignSpending's answer): its
// subtitle, the first ABROAD_ROWS payments ("Phone case", "@ 0.8523",
// "US$24.00" → "€20.46"), how many more the total includes, and the total.
export function abroadCard(abroad, baseCurrency) {
  const more = abroad.items.length - ABROAD_ROWS
  return {
    subtitle: t('insights:abroad.subtitle', { currency: baseCurrency }),
    rows: abroad.items.slice(0, ABROAD_ROWS).map((i) => ({
      id: i.id, label: i.label, rate: rateText(i.rate),
      from: formatMoney(i.minor, i.currency), to: formatMoney(i.baseMinor, baseCurrency),
    })),
    more: more > 0 ? t('insights:abroad.more', { count: more }) : null,
    total: formatMoney(abroad.totalBaseMinor, baseCurrency),
  }
}

// A trend value (major units, buildTrend's) as money: back to minor units,
// then formatted ("€1,635.00").
export const trendMoney = (major, currency) => formatMoney(Math.round(major * minorFactor(currency)), currency)

// "Where your money went"'s month: this one ("This month"), or the column
// tapped in the six-month bars ("August", "December 2025").
export function pickedMonthLabel(months, picked, now = new Date()) {
  return picked === months.length - 1 ? t('insights:thisMonth') : monthHeading(months[picked].key, now)
}

// The six-month spending bars (TrendBars): each month's spend, its label
// and what a tap says, and the headline over them for the picked month
// ("Aug: €1,635.00").
export function spendingBars(trend, picked, currency) {
  const shown = trend[picked]
  return {
    aside: `${shown.label}: ${trendMoney(shown.expense, currency)}`,
    bars: trend.map((m) => ({
      label: m.label, value: m.expense,
      ariaLabel: t('insights:spending.pickMonth', { month: m.label, amount: trendMoney(m.expense, currency) }),
    })),
  }
}

// "Income vs expenses" for this month: the two tiles, what's left over
// (signed, with its tone) and the change in spending from last month.
export function incomeFigures(trend, currency) {
  const latest = trend[trend.length - 1]
  return {
    income: trendMoney(latest.income, currency),
    spent: trendMoney(latest.expense, currency),
    net: signedAmount(latest.net, (m) => trendMoney(m, currency)),
    delta: spendDelta(trend),
  }
}
