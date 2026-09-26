// Client-side new-password rules, shared by sign-up, password reset, and the
// Profile change-password form. Supabase Auth's password settings are the
// authoritative server-side check (leaked-password protection is deliberately
// off) — this is the fast, friendly first pass.

import { t } from './i18n/i18n.js'

// A few of the most common weak passwords to reject outright.
const COMMON = new Set([
  '12345', '123456', '1234567', '12345678', '123456789', '1234567890',
  'password', 'password1', 'qwerty', 'abc123', '111111', '000000', 'iloveyou',
  'admin', 'letmein', 'welcome', 'monkey', 'dragon',
])

// Returns an error string, or null if the password is acceptable.
export function validatePassword(pw) {
  if (pw.length < 8) return t('common:forms.password.short')
  if (!/[a-zA-Z]/.test(pw)) return t('common:forms.password.letter')
  if (!/[0-9]/.test(pw)) return t('common:forms.password.number')
  if (COMMON.has(pw.toLowerCase())) return t('common:forms.password.common')
  return null
}
