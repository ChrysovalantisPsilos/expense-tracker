// The settle-up page's rules (SettleUpPage, PayShortcuts), pure so the web's
// page and the native app's work the same: where the form opens (the
// biggest payment you're part of), the suggestions' words, the line about
// the other person's balance, what stops a save, what a save records, and
// the "Pay Sam directly" box. No I/O.
import { formatMoney, minorToInput, toMinor } from '../../shared/lib/currency.js'
import { intlLocale, t } from '../../shared/lib/i18n/i18n.js'
import { paypalUrl, revolutUrl, sepaQrPayload } from '../../shared/lib/payLinks.js'
import { memberName, mySettleSuggestions } from './groupFormat.js'

// The members you can settle with: everyone but you, in the group's order.
export const settleOthers = (members, myMemberId) => (members ?? []).filter((m) => m.id !== myMemberId)

// The form as the page opens it: on the top suggestion (direction 'out' =
// you paid them, 'in' = they paid you; the other member; the amount as
// typed; `picked` = which suggestion it holds, -1 for none), else on you
// paying the first other member, and today's date.
export function settleFormStart({ balances, members, myMemberId, currency, today }) {
  const top = mySettleSuggestions(balances, myMemberId)[0] ?? null
  return {
    direction: top?.direction ?? 'out',
    otherId: top?.otherId ?? settleOthers(members, myMemberId)[0]?.id ?? '',
    amount: top ? minorToInput(top.amount, currency) : '',
    settledAt: today,
    picked: top ? 0 : -1,
  }
}

// "Suggested to settle up": your payments in the fewest-payments plan,
// biggest first. Each says what it is ("Pay <b>Sam</b> €12.00", "<b>Sam</b>
// pays you €12.00", the name in <b>: `text`, or its `key` and `values`
// for <Trans>), the values it fills the form with, and
// for money owed to you by someone with an account, the reminder's label.
export function settleSuggestionParts({ balances, members, myMemberId, currency }) {
  return mySettleSuggestions(balances, myMemberId).map((s, index) => {
    const iPay = s.direction === 'out'
    const name = memberName(members, iPay ? s.to : s.from)
    const remindable = !iPay && !!(members ?? []).find((m) => m.id === s.from)?.user_id
    const key = iPay ? 'groups:settle.payOut' : 'groups:settle.payIn'
    const values = { name, amount: formatMoney(s.amount, currency) }
    return {
      index,
      direction: s.direction,
      otherId: s.otherId,
      amount: minorToInput(s.amount, currency),
      key,
      values,
      text: t(key, values),
      remind: remindable ? { memberId: s.from, label: t('groups:settle.remind', { name: memberName(members, s.from) }) } : null,
    }
  })
}

// The line under the person picker: "Sam owes €12.00 overall", "Sam is owed
// …", "Sam is settled up". null with nobody picked.
export function settleOtherLine({ balances, members, otherId, currency }) {
  if (!otherId) return null
  const net = balances?.get(otherId) ?? 0
  const name = (members ?? []).find((m) => m.id === otherId)?.display_name ?? ''
  if (net === 0) return t('groups:settle.otherSettled', { name })
  return t(net > 0 ? 'groups:settle.otherOwed' : 'groups:settle.otherOwes',
    { name, amount: formatMoney(Math.abs(net), currency) })
}

// The two names either side of the arrow: "You → Sam" when you paid,
// "Sam → You" when you received ('—' while nobody is picked).
export function settleParties({ direction, members, otherId }) {
  const other = (members ?? []).find((m) => m.id === otherId)?.display_name || '—'
  const you = t('groups:you')
  return direction === 'out' ? { from: you, to: other } : { from: other, to: you }
}

// Why the form can't be recorded yet, or null: nobody picked, no amount.
export function settleProblem({ otherId, amount }) {
  if (!otherId) return t('groups:settle.pickPerson')
  if (!amount || Number(amount) <= 0) return t('groups:settle.enterAmount')
  return null
}

// What recording the form sends (addSettlement's arguments): you are one
// side, the other member the other.
export function settlementArgs({ groupId, direction, myMemberId, otherId, amount, currency, settledAt }) {
  return {
    groupId,
    fromMember: direction === 'out' ? myMemberId : otherId,
    toMember: direction === 'out' ? otherId : myMemberId,
    amountMinor: toMinor(amount, currency),
    currency,
    settledAt,
  }
}

// "Pay Sam directly", from the payment details Sam saved (member_payment_info's
// { payment_iban, payment_revolut, payment_paypal }; `info` null while they
// load). `kind`: 'hidden' (nobody picked, or still loading), 'hint' (no
// details yet, or not on Budgeer: the box says what it would offer), or
// 'links' (Revolut and PayPal links with the amount filled in, a SEPA QR
// payload for a EUR group with an IBAN, the IBAN to copy).
export function payShortcutParts({ member, info, amountMinor, currency, groupName }) {
  if (!member) return { kind: 'hidden' }
  const title = t('groups:pay.direct', { name: member.display_name })
  const iban = info?.payment_iban || null
  const revolut = revolutUrl(info?.payment_revolut, amountMinor, currency)
  const paypal = paypalUrl(info?.payment_paypal, amountMinor, currency)
  if (!member.user_id || (info && !iban && !revolut && !paypal)) {
    return {
      kind: 'hint',
      title,
      note: t(member.user_id ? 'groups:pay.noDetails' : 'groups:pay.notJoined', { name: member.display_name }),
    }
  }
  if (!info) return { kind: 'hidden' }
  const qr = iban && currency === 'EUR' ? sepaQrPayload({
    name: member.display_name, iban, amountMinor, reference: `Budgeer settle-up · ${groupName ?? ''}`,
  }) : null
  // "12.50" (English, as before) or "12,50" (Greek), for the QR's caption.
  const amount = intlLocale()
    ? (amountMinor / 100).toLocaleString(intlLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : (amountMinor / 100).toFixed(2)
  return {
    kind: 'links', title, iban, revolut, paypal, qr,
    qrCaption: t('groups:pay.scan', { amount }),
    after: t('groups:pay.afterPaying'),
  }
}
