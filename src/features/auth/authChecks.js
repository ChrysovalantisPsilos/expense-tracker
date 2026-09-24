import { emailError, fieldErrors, requiredError } from '../../shared/lib/formChecks.js'
import { validatePassword } from '../../shared/lib/password.js'

// The sign-in / sign-up form's inline errors, by field. Signing in only needs
// something in each field (the server checks it); signing up also applies the
// new-password rules (password.js) and needs the consent tick.
export const AUTH_FIELDS = ['email', 'password', 'consent']

export function authErrors({ mode, email, password, accepted }) {
  return fieldErrors({
    email: emailError(email),
    password: mode === 'signup'
      ? validatePassword(password ?? '')
      : requiredError(password, 'Enter your password.'),
    consent: mode === 'signup' && !accepted
      ? 'Please accept the Terms of Use and Privacy Notice'
      : null,
  })
}
