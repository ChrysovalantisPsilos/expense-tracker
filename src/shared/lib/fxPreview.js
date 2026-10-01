// What a foreign-currency entry's form says about its exchange rate BEFORE
// saving (FxPreview, and the native form): "£42.50 ≈ €49.73 @ 1.1699 on
// 21 Aug (ECB)". Pure, in the app's language (common:fx.*).
//
//   from, to     the entry's currency and the base currency
//   amountMinor  the amount typed, in minor units of `from` (0: none yet)
//   fx           the rate lookup's state (fx.js useFxRate): { status:
//                'loading' | 'ok' | 'missing' | 'skipped', rate?, date? }
//   captured     the rate the saved row keeps (keptRate), or null
//   rate         the rate the form would save with (effectiveRate), or null
//
// Returns { status, text, label?, conversion? }: 'loading', 'captured' and
// 'ecb' are one line (`text`); 'missing' asks for a rate (`text` says why,
// `label` names the field) and shows what the typed rate gives
// (`conversion`, null until there is one).
import { formatMoney, formatRate, toBaseMinor } from './currency.js'
import { shortDate } from './dates.js'
import { t } from './i18n/i18n.js'

export function fxPreview({ from, to, amountMinor, fx, captured = null, rate = null }) {
  const convert = (r) => (amountMinor > 0
    ? `${formatMoney(amountMinor, from)} ≈ ${formatMoney(toBaseMinor(amountMinor, r, from, to), to)}`
    : `1 ${from} = ${formatRate(r)} ${to}`)
  // With an amount, the conversion and the rate it used.
  const conversion = (r) => (amountMinor > 0 ? `${convert(r)} @ ${formatRate(r)}` : convert(r))

  if (fx.status === 'loading') return { status: 'loading', text: t('common:fx.loading', { from, to }) }
  if (fx.status === 'skipped' && captured) {
    return { status: 'captured', text: t('common:fx.captured', { conversion: conversion(captured) }) }
  }
  if (fx.status === 'ok') {
    return { status: 'ecb', text: t('common:fx.ecb', { conversion: conversion(fx.rate), date: shortDate(fx.date) }) }
  }
  return {
    status: 'missing',
    text: t('common:fx.missing', { from, to }),
    label: t('common:fx.rateLabel', { from, to }),
    conversion: rate && amountMinor > 0 ? conversion(rate) : null,
  }
}
