// The meal vouchers' words (pure: the active language and the setup): the
// next top-up as the Home card and the page show it ("+€176.00 on 5 Oct"
// over "September · 22 working days × €8.00") and the card's balance.
import { formatMoney, formatSigned } from '../../shared/lib/currency.js'
import { monthHeading, monthName, shortDate } from '../../shared/lib/dates.js'
import { t } from '../../shared/lib/i18n/i18n.js'
import { categoryDisplayName, entryName } from '../../shared/lib/categoryName.js'
import { categoryLook } from '../../shared/lib/categoryStyle.js'
import { COUNTRIES, daysFor } from './voucherMath.js'

// A month's name from its key ('YYYY-MM').
export const monthOfKey = (key) => monthName(new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1))

// The next top-up's two lines: what and when, then why (the month, its
// working days and the value per day; "your days" once fixed by hand).
export function nextTopUpText(settings, next) {
  const why = t('vouchers:next.days', {
    month: monthOfKey(next.month), count: next.days, perDay: formatMoney(settings.per_day_minor, settings.currency),
  })
  return {
    amount: t('vouchers:next.amount', { amount: formatMoney(next.amount_minor, settings.currency), date: shortDate(next.on) }),
    why: next.fixed ? `${why} · ${t('vouchers:next.fixed')}` : why,
  }
}

// The Home card: the balance on the card (signed, red below zero) and the
// next top-up's lines, from voucherSummary and nextTopUp (voucherMath).
export function voucherCardParts(settings, summary, next) {
  return {
    balance: formatSigned(summary.balance, settings.currency),
    tone: summary.balance < 0 ? 'negative' : 'default',
    next: nextTopUpText(settings, next),
  }
}

// The Meal vouchers page's card: the balance (signed, red below zero), then
// this month's top-ups (green once there are any) and spending (muted while
// nothing was spent).
export function voucherPageParts(settings, summary) {
  const cur = settings.currency
  return {
    balance: formatSigned(summary.balance, cur),
    tone: summary.balance < 0 ? 'negative' : 'default',
    topUps: { text: `+${formatMoney(summary.monthTopUps, cur)}`, tone: summary.monthTopUps ? 'positive' : 'muted' },
    spent: { text: formatSigned(-summary.monthSpent, cur), tone: summary.monthSpent ? 'default' : 'muted' },
  }
}

// "Fix days" for the month the next top-up pays for, at `days`: its label,
// the values of "× €8.00 = <b>€176.00</b>" (fix.total), what the calendar
// says, and which way the stepper can still go (none to every day).
export function daysFixParts(settings, month, days) {
  const cur = settings.currency
  return {
    label: t('vouchers:fix.label', { month: monthOfKey(month) }),
    total: { perDay: formatMoney(settings.per_day_minor, cur), amount: formatMoney(days * settings.per_day_minor, cur) },
    hint: t('vouchers:fix.hint', { count: daysFor(settings, month).auto }),
    fewer: days > 0,
    more: days < 31,
  }
}

// One line of the card's history: an expense paid with vouchers (its name,
// date and category, `row` to open it), a top-up (when, for which month's
// days) or the balance the setup started from.
function historyItemParts(item, currency, now) {
  if (item.type === 'spend') {
    const r = item.row
    const none = t('vouchers:history.noCategory')
    return {
      key: `spend-${r.id}`, type: 'spend', row: r, look: categoryLook(r.categories, r.kind),
      title: entryName(r, none),
      meta: `${shortDate(r.spent_at, now)} · ${categoryDisplayName(r.categories) || none}`,
      amount: formatSigned(item.minor, currency), tone: 'default',
    }
  }
  if (item.type === 'topup') {
    return {
      key: `topup-${item.on}`, type: 'topup', title: t('vouchers:history.topUp'),
      meta: t('vouchers:history.topUpMeta', { date: shortDate(item.on, now), month: monthOfKey(item.month), count: item.days }),
      amount: `+${formatMoney(item.minor, currency)}`, tone: 'positive',
    }
  }
  return {
    key: `start-${item.on}`, type: 'start', title: t('vouchers:history.start'),
    meta: t('vouchers:history.startMeta', { date: shortDate(item.on, now) }),
    amount: formatMoney(item.minor, currency), tone: 'muted',
  }
}

// The card's history (voucherHistory's months) as the page lists it: each
// month's heading and net change (green when it grew), then its lines.
export function voucherHistoryParts(settings, groups, now = new Date()) {
  return groups.map((g) => ({
    month: g.month,
    heading: monthHeading(g.month, now),
    net: { text: formatSigned(g.net, settings.currency, { plus: true }), tone: g.net > 0 ? 'positive' : 'muted' },
    items: g.items.map((item) => historyItemParts(item, settings.currency, now)),
  }))
}

// The setup's "Working days" choices: each country's rule in words.
export const countryOptions = () => COUNTRIES.map((c) => ({ value: c, label: t(`vouchers:setup.countries.${c}`) }))
