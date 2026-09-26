// Field checks behind the forms' inline errors (FormErrorMessage under the
// field). Each returns the message to show, or null when the value is fine.
// Pure: the forms decide when to show them (after the first submit).

import { t } from './i18n/i18n.js'

// Deliberately loose (something@something.tld): the server has the final say.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function emailError(email) {
  const v = String(email ?? '').trim()
  if (!v) return t('common:forms.emailRequired')
  if (!EMAIL_SHAPE.test(v)) return t('common:errors.emailInvalid')
  return null
}

// A money amount as typed (MoneyInput keeps it as a dot-decimal string).
export function amountError(amount) {
  const n = Number(amount)
  return amount === '' || amount == null || !Number.isFinite(n) || n <= 0 ? t('common:forms.amountRequired') : null
}

// A required text or choice: blank (or only spaces) gets `message`.
export function requiredError(value, message) {
  return String(value ?? '').trim() ? null : message
}

// Only the fields that have a message: { field: message }.
export function fieldErrors(checks) {
  return Object.fromEntries(Object.entries(checks).filter(([, msg]) => msg))
}

// The first field (in `order`) with an error, to move focus to it.
export function firstInvalid(errors, order) {
  return order.find((f) => errors[f]) ?? null
}
