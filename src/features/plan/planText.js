// Plan mode's wording: how a payment, its frequency, a row, an idea and a
// change read, in the app's language. Pure (no React): tested in
// test/planText.test.js. `t` is the page's plan translator (useT('plan')).
import { formatMoney } from '../../shared/lib/currency.js'
import { categoryDisplayName } from '../../shared/lib/categoryName.js'
import { shortDate, shortMonth } from '../../shared/lib/dates.js'
import { intlLocale, t as tr } from '../../shared/lib/i18n/i18n.js'
import { frequencyLabel, ruleToChoice } from '../recurring/recurringMath.js'

// "Monthly", "Quarterly", or "every 2 weeks" for an interval.
export function freqLabel(fields) {
  const { choice, n } = ruleToChoice(fields)
  return n > 1 ? frequencyLabel(fields) : tr(`recurring:choices.${choice}`)
}

// "€13.99 a month", "€480.00 a year", "€10.00 every 2 weeks" — a charge in
// its own currency, per the period it repeats.
export function perUnit(fields) {
  const amount = formatMoney(fields.amount_minor, fields.currency)
  const { choice, n } = ruleToChoice(fields)
  return n > 1 ? tr('plan:units.custom', { amount, frequency: frequencyLabel(fields) }) : tr(`plan:units.${choice}`, { amount })
}

// "2 music services": an overlap's type (planCatalog.SERVICE_TYPES) and size.
export const serviceCount = (type, count, t) => t(`services.${type}`, { count })

// A row's display name: its own, else its category's, else its kind ("Salary"
// for the derived salary row).
export const itemName = (item) => (item.salary ? tr('plan:salary.name')
  : item.name || tr(`recurring:kinds.${item.kind === 'income' ? 'income' : 'expense'}`))

// "Jul, Aug and Sep" from 'YYYY-MM-01' keys.
export function monthList(months) {
  const names = months.map((m) => shortMonth(Number(m.slice(5, 7)) - 1))
  return new Intl.ListFormat(intlLocale('en-GB'), { type: 'conjunction' }).format(names)
}

// The muted line under a row's name.
export function rowMeta(item, view, t) {
  const f = item.after ?? item.before
  if (item.salary) return t('row.salary')
  if (item.added) return t('row.from', { frequency: freqLabel(f), date: shortDate(item.next) })
  const b = item.before
  if (view === 'month' && b.frequency === 'yearly' && Number(b.interval_n) === 1 && !item.changed) {
    return t('row.yearShare', { amount: formatMoney(b.amount_minor, b.currency) })
  }
  return t('row.next', { frequency: freqLabel(f), date: shortDate(item.next) })
}

// An idea's headline and short line, in the app's language.
export function ideaText(idea, currency, t) {
  const year = formatMoney(idea.year, currency)
  switch (idea.kind) {
    case 'overlap': {
      const names = new Intl.ListFormat(intlLocale('en-GB'), { type: 'conjunction' }).format(idea.names.map((n) => n || '…'))
      const services = serviceCount(idea.type, idea.ruleIds.length, t)
      return {
        name: services,
        title: t('ideas.overlap.title', { services, amount: year }),
        body: t('ideas.overlap.body', { names }),
      }
    }
    case 'compare':
      return {
        title: t('ideas.compare.title', { name: idea.name, pct: idea.rise.pct }),
        body: t('ideas.compare.body', {
          from: formatMoney(idea.rise.from, idea.rise.currency), to: formatMoney(idea.rise.to, idea.rise.currency),
          date: shortDate(idea.rise.since),
        }),
      }
    case 'priceUp':
      return {
        title: t('ideas.priceUp.title', { name: idea.name, pct: idea.rise.pct, amount: year }),
        body: t('ideas.priceUp.body', {
          from: formatMoney(idea.rise.from, idea.rise.currency), to: formatMoney(idea.rise.to, idea.rise.currency),
          date: shortDate(idea.rise.since),
        }),
      }
    case 'overBudget':
      return {
        title: t('ideas.overBudget.title', { name: idea.name, amount: year }),
        body: t('ideas.overBudget.body', { category: categoryDisplayName(idea.category), months: monthList(idea.months) }),
      }
    default:
      return { title: t('ideas.biggest.title', { name: idea.name, amount: year }), body: t('ideas.biggest.body') }
  }
}

// "Before → after" for one change, in words.
export function changeLine(item, t) {
  if (item.added) return t(item.kind === 'income' ? 'changes.newIncome' : 'changes.newCost', { amount: perUnit(item.after) })
  if (item.cancelled) return t(item.kind === 'income' ? 'changes.stopLine' : 'changes.cancelLine', { was: perUnit(item.before) })
  return t('changes.editLine', { was: perUnit(item.before), now: perUnit(item.after) })
}

// A "Type a what-if" proposal (whatIfMath.whatIfRows) in words: "Cancel ·
// €15.99 a month", "Change to €12.99 a month · now €10.99 a month", "Add ·
// €40.00 a month".
export function whatIfLine(row, t) {
  if (row.type === 'add') return t(row.kind === 'income' ? 'typeIt.addIncome' : 'typeIt.add', { amount: perUnit(row.after) })
  if (row.type === 'cancel') return t(row.kind === 'income' ? 'typeIt.stop' : 'typeIt.cancel', { was: perUnit(row.before) })
  return t('typeIt.change', { now: perUnit(row.after), was: perUnit(row.before) })
}
