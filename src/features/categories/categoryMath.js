// Pure category rules (no I/O) — unit-tested in test/categoryMath.test.js.
// The name rules mirror the server's CHECK (0060): 1–60 characters after
// trimming, no control characters. Names are unique per kind; the server's
// UNIQUE is case-sensitive, the form is stricter so "food" and "Food" can't
// both exist.

import { paidInWindow, spendRows } from '../../shared/lib/spread.js'
import { toBaseMinor } from '../../shared/lib/currency.js'
import { t } from '../../shared/lib/i18n/i18n.js'
import { NO_CATEGORY, byDisplayName, categoryDisplayName, entryName } from '../../shared/lib/categoryName.js'
import { categoryPath } from '../../shared/lib/categoryLinks.js'
import { shortDate } from '../../shared/lib/dates.js'
import { periodFromValue, periodMonth, thisMonthPeriod } from '../../shared/lib/periods.js'
import { payMonthOf } from '../../shared/lib/payCalendar.js'
import { categoryIconKey } from '../../shared/lib/categoryStyle.js'
import { formatMoney } from '../../shared/lib/currency.js'
import { budgetPercent, budgetTone, carriedLabel } from '../budgets/budgetMath.js'

export const CATEGORY_NAME_MAX = 60

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/

// Why `name` can't be saved, or null when it can. `others` are the user's
// categories of the same kind (archived included), without the one being
// edited. The reason is in the app's language.
export function categoryNameError(name, others = []) {
  const n = String(name ?? '').trim()
  if (!n) return t('categories:nameErrors.empty')
  if ([...n].length > CATEGORY_NAME_MAX) return t('categories:nameErrors.tooLong', { max: CATEGORY_NAME_MAX })
  if (CONTROL.test(n)) return t('categories:nameErrors.characters')
  const key = n.toLocaleLowerCase()
  if (others.some((c) => String(c.name).trim().toLocaleLowerCase() === key)) {
    return t('categories:nameErrors.taken')
  }
  return null
}

// The categories page list for one kind: active first, then archived, each
// A–Z by the name shown (a default in the app's language; locale-aware,
// case-insensitive).
export function sortCategories(categories, kind) {
  return (categories ?? [])
    .filter((c) => c.kind === kind)
    .sort((a, b) => Number(!!a.is_archived) - Number(!!b.is_archived)
      || byDisplayName(a, b))
}

// Where a deleted category's entries can go: the other active categories of
// the same kind, A–Z.
export function moveTargets(categories, deleting) {
  return sortCategories(categories, deleting?.kind)
    .filter((c) => c.id !== deleting?.id && !c.is_archived)
}

// The categories a name must not clash with when adding/editing `category`:
// the same kind's (archived included), without the one being edited.
export function sameKindOthers(categories, category) {
  return (categories ?? []).filter((c) => c.kind === category?.kind && c.id !== category?.id)
}

// The add/edit form's starting { name, icon, color, savings } for `category`
// (null for a new one): a default category starts on its name in the app's
// language, and a legacy/unknown stored icon on the icon its badge shows, so
// saving keeps its look; a new category starts on 'other'.
export function categoryDraft(category) {
  return {
    name: categoryDisplayName(category),
    icon: category?.id ? categoryIconKey(category) : 'other',
    color: category?.color ?? null,
    savings: !!category?.is_savings,
  }
}

// The update an edit form's { name, icon, color, savings } makes to
// `category`, or null when nothing changed (the name compares trimmed, as it's
// stored). The form starts on the name as shown, so a default category's
// translated name left as it is isn't a rename (that would drop its key). `savings` ("Counts as savings", 0084) only applies to an income
// category — the server refuses is_savings on an expense one.
export function categoryPatch(category, { name, icon, color, savings = false }) {
  const patch = {}
  const trimmed = String(name ?? '').trim()
  if (trimmed !== category.name && trimmed !== categoryDisplayName(category)) patch.name = name
  if ((icon ?? null) !== (category.icon ?? null)) patch.icon = icon
  if ((color ?? null) !== (category.color ?? null)) patch.color = color
  if (category.kind === 'income' && !!savings !== !!category.is_savings) patch.is_savings = !!savings
  return Object.keys(patch).length ? patch : null
}

// A category's page for one period { from, to } (null = open-ended), from
// the rows my_transactions returned with `spread` (see spread.js):
//   listed — the real payments in the period, newest first as given (a
//            yearly subscription paid earlier isn't listed)
//   total  — base-currency minor units counted in the period: a spread
//            yearly subscription counts its monthly parts (or nothing when
//            `separateYearly`; by pay month with `cal`), exactly as the
//            budget bars and Home count it — the list and the total share
//            one window
// `categoryId` NO_CATEGORY keeps personal rows with no category (group
// shares bucket under their group instead); any other id keeps that
// category's rows.
export function categoryPeriod(rows, { categoryId, from, to, baseCurrency, separateYearly = false, cal = null }) {
  const mine = (rows ?? []).filter((r) => (categoryId === NO_CATEGORY
    ? !r.category_id && !r.group_expense_id
    : r.category_id === categoryId))
  const total = spendRows(mine, baseCurrency, from, to, { separateYearly, cal })
    .reduce((sum, r) => sum + toBaseMinor(r.amount_minor, r.exchange_rate, r.currency, baseCurrency), 0)
  return { listed: paidInWindow(mine, from, to), total }
}

// The category page's heading (CategoryPage.jsx) for `category` (null for
// the uncategorised bucket, `uncategorised` true): its kind, its name, the
// eyebrow above it and the label of its total. A savings category's total is
// what was saved (0084), never "Earned".
export function categoryPageHead(category, uncategorised = false) {
  const kind = uncategorised ? 'expense' : category?.kind
  const eyebrow = category?.is_archived ? 'archived'
    : category?.is_savings ? 'savings' : kind === 'income' ? 'income' : 'expense'
  return {
    kind,
    name: uncategorised ? t('categories:uncategorized') : categoryDisplayName(category),
    eyebrow: t(`categories:page.eyebrow.${eyebrow}`),
    totalLabel: t(`categories:page.total.${category?.is_savings ? 'saved' : kind === 'income' ? 'earned' : 'spent'}`),
  }
}

// The category page's budget line for a period: budgets are monthly, so a
// longer period says so ('monthly'); a month with a cap shows its bar
// ('bar': "€312.40 of €400.00", the percent, the tone, over, and where a
// carried cap came from); without one, this month offers "Set a budget"
// ('set') and any other month says it had none ('none').
//   budget  — my_budgets' row for the category in the month, or null
//   spent   — the period's total (minor units, base currency)
//   canEdit — the month is this month (only its cap can change)
export function categoryBudget({ budget, spent, month, canEdit, period, baseCurrency }) {
  if (!month) return { state: 'monthly', text: t('categories:page.budgetsMonthly') }
  if (budget) {
    const cap = budget.amount_minor
    return {
      state: 'bar',
      title: t('categories:page.budget'),
      meta: t('categories:page.budgetOf', { spent: formatMoney(spent, baseCurrency), cap: formatMoney(cap, baseCurrency) }),
      percent: budgetPercent(spent, cap),
      tone: budgetTone(spent, cap) ?? null,
      over: spent > cap,
      carried: budget.period_start < periodMonth(period) ? carriedLabel(budget.period_start, periodMonth(period)) : null,
    }
  }
  return canEdit
    ? { state: 'set', text: t('categories:page.setBudget') }
    : { state: 'none', text: t('categories:page.noBudget', { period: period.label }) }
}

// The month an entry was paid in, as a period ({ value, label, from, to };
// "This month" when it's now's): where its page's category box reads from.
// With pay months (`cal`) it is the entry's pay month: an expense on 30 Sep
// after a 29 Sep payday is October's.
export function entryMonth(entry, now = new Date(), cal = null) {
  const iso = String(entry?.spent_at ?? '').slice(0, 10)
  const [y, m] = (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? payMonthOf(iso, cal) : '').split('-').map(Number)
  return (y && m ? periodFromValue(`m:${y}-${m}`, now, cal) : null) ?? thisMonthPeriod(now, cal)
}

// The box under an entry (the website's entry page, the iPad's entry
// detail): its category in the month it was paid — that month's budget when
// it has one (categoryBudget's bar: spent of the cap, the percent, the tone)
// and the category's other entries paid that month, newest first (`limit`
// of them), each with its day and amount; "See all" opens the category's
// page for the month. Null for an entry without a category or a group's
// share (edited in its group). `now` (a Date) names this month and the
// days' years.
//   rows   — my_transactions for the category in entryMonth (spread)
//   budget — my_budgets' row for the category in that month, or null
export function entryCategoryBox({
  entry, category, rows, budget = null, baseCurrency, separateYearly = false, cal = null,
  limit = 3,
}, now = new Date()) {
  if (!entry?.category_id || entry.group_expense_id || !category || category.id !== entry.category_id) return null
  const period = entryMonth(entry, now, cal)
  const name = categoryDisplayName(category)
  const { listed, total } = categoryPeriod(rows, {
    categoryId: category.id, from: period.from, to: period.to, baseCurrency, separateYearly, cal,
  })
  const others = listed.filter((r) => r.id !== entry.id)
    .sort((a, b) => String(b.spent_at ?? '').localeCompare(String(a.spent_at ?? '')))
  const bar = category.kind === 'expense' && budget
    ? categoryBudget({ budget, spent: total, month: true, canEdit: false, period, baseCurrency })
    : null
  return {
    title: t('categories:entry.title', { name, period: period.label }),
    path: categoryPath(category.id, period.value),
    seeAll: t('categories:entry.seeAll'),
    budget: bar && { ...bar, valueLabel: `${bar.percent}%` },
    others: others.slice(0, limit).map((r) => ({
      id: r.id, name: entryName(r, name), date: shortDate(r.spent_at, now), amount: formatMoney(r.amount_minor, r.currency),
    })),
    empty: others.length ? null : t('categories:entry.none', { period: period.label }),
  }
}

// The default income categories added since 0081: new accounts are seeded
// with them, and 0082 (Friends & family, Bonus) and 0084 (Savings, marked as
// savings) gave every existing account the same. The category list tags them
// "New" for NEW_TAG_MS after they were added. The tag is UI only — never part
// of the name — so it can't reach statements or exports.
// test/categoryMath.test.js keeps this list in lockstep with the seed and the
// backfills.
export const NEW_DEFAULT_CATEGORIES = [
  { name: 'Friends & family', icon: 'transfer', kind: 'income' },
  { name: 'Bonus', icon: 'salary', kind: 'income' },
  { name: 'Savings', icon: 'savings', kind: 'income', savings: true },
]
export const NEW_TAG_MS = 2 * 24 * 60 * 60 * 1000

// Does `category` still wear its "New" tag at time `now` (ms)?
export function isNewCategory(category, now = Date.now()) {
  const added = Date.parse(category?.created_at ?? '')
  if (!Number.isFinite(added)) return false
  const age = now - added
  return age >= 0 && age < NEW_TAG_MS
    && NEW_DEFAULT_CATEGORIES.some((d) => d.kind === category.kind && d.name === category.name)
}
