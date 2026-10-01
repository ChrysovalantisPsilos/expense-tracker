// The meal vouchers' words (pure: the active language and the setup): the
// next top-up as the Home card and the page show it ("+€176.00 on 5 Oct"
// over "September · 22 working days × €8.00") and the card's balance.
import { formatMoney, formatSigned } from '../../shared/lib/currency.js'
import { monthName, shortDate } from '../../shared/lib/dates.js'
import { t } from '../../shared/lib/i18n/i18n.js'

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
