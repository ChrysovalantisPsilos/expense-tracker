// Start fresh (Settings › Your data): wipe your own data and keep the account
// (start_fresh, migration 0112). The rules both apps follow (the iOS app
// through the core): the phrase typed to confirm, what the confirmation asks
// for, and what goes and what stays, in the app's language.
import { t } from '../../shared/lib/i18n/i18n.js'
import { hasPasswordIdentity } from '../settings/authMethods.js'

// What's typed to confirm: the same in every language, like Delete account's
// DELETE.
export const START_FRESH_PHRASE = 'START FRESH'

// Whether `value` is the phrase: case and extra spaces don't matter.
export function phraseMatches(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase() === START_FRESH_PHRASE
}

// The confirmation for `user` with `phrase` and `password` typed, as Delete
// account asks (deleteAccountCheck): an account with a password gives it
// again (the app signs in with it, which is the fresh sign-in the server
// requires); any other needs a sign-in in the last few minutes (`recent`,
// reauth.isRecentSignIn), else "sign in again" first. Start fresh can be
// pressed once the phrase is typed and that is met.
export function startFreshCheck({ user, recent, phrase, password }) {
  const withPassword = hasPasswordIdentity(user)
  const needsReauth = !withPassword && !recent
  const phraseOk = phraseMatches(phrase)
  return {
    password: withPassword,
    needsReauth,
    phraseOk,
    canSubmit: phraseOk && (withPassword ? String(password ?? '').length > 0 : !needsReauth),
  }
}

// What goes and what stays (backup:startFresh.scope.*), in the order shown;
// the server's list is start_fresh's header in 0112.
const SCOPE = {
  wiped: ['entries', 'plans', 'savings', 'salary', 'rules', 'notifications', 'categories'],
  kept: ['account', 'settings', 'groups'],
}
export function startFreshScope() {
  return Object.fromEntries(Object.entries(SCOPE)
    .map(([list, ids]) => [list, ids.map((id) => t(`backup:startFresh.scope.${list}.${id}`))]))
}
