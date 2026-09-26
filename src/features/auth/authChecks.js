import { emailError, fieldErrors, requiredError } from '../../shared/lib/formChecks.js'
import { validatePassword } from '../../shared/lib/password.js'
import { t } from '../../shared/lib/i18n/i18n.js'

// The sign-in / sign-up form's inline errors, by field. Signing in only needs
// something in each field (the server checks it); signing up also applies the
// new-password rules (password.js) and needs the consent tick.
export const AUTH_FIELDS = ['email', 'password', 'consent']

export function authErrors({ mode, email, password, accepted }) {
  return fieldErrors({
    email: emailError(email),
    password: mode === 'signup'
      ? validatePassword(password ?? '')
      : requiredError(password, t('auth:password.required')),
    consent: consentError({ mode, accepted }),
  })
}

// Signing up, by email or with Google, needs the Terms/Privacy tick.
export function consentError({ mode, accepted }) {
  return mode === 'signup' && !accepted ? t('auth:signup.consentError') : null
}
