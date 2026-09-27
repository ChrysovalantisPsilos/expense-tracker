// Which error text a user gets to see. Only words we wrote for users are
// shown; anything technical (Postgres/PostgREST errors, network failures,
// JavaScript exceptions, Supabase's own wording) becomes a friendly fallback.
// Callers keep logging the real error to the console for debugging.
//
// What counts as ours is decided by where the error came from, not by
// guessing from its text:
//   UserError                 — thrown by our client code with copy for the user
//   code 'P0001'              — a Postgres RAISE EXCEPTION from our SQL functions
//                               and triggers (Postgres' own errors carry other
//                               codes), but only when its text is on the
//                               SQL_USER_MESSAGES allowlist: our SQL also raises
//                               internal guards ("unknown quota scope") that
//                               only fire on a bug, and those stay hidden
//   serverMessage: true       — the JSON `error` body of one of our edge functions
// Supabase Auth and WebAuthn errors with a clear meaning map to our own copy.
// Edge-function text is still checked for anything code-like (a snake_case
// token, brackets, a stack line) and falls back when it has some.

// The copy itself lives in the dictionaries (common:errors.*): the tables
// below hold keys, translated when a message is asked for.
import { DEMO_REFUSAL } from './demoAccount.js'
import { t, translate } from './i18n/i18n.js'

const msg = (key) => t(`common:errors.${key}`)

// The generic and connection lines in English (the source text), for
// comparing against; users get them in their language from userMessage.
export const GENERIC_ERROR = translate('common:errors.generic', undefined, { lang: 'en' })
export const CONNECTION_ERROR = translate('common:errors.connection', undefined, { lang: 'en' })
const SESSION_EXPIRED = 'sessionExpired'
const TOO_MANY = 'tooMany'

// An error whose message was written for the user.
export class UserError extends Error {
  constructor(message) {
    super(message)
    this.name = 'UserError'
  }
}

// A PostgREST error as a thrown Error, keeping its code so userMessage can
// tell a deliberate RAISE (P0001) from a technical failure.
export function dbError(error) {
  return Object.assign(new Error(error?.message || 'Database request failed'), { code: error?.code })
}

// A failed supabase.functions.invoke as a thrown Error. Our functions answer
// with { error: '<copy for the user>', code?: '<machine-readable reason>' };
// anything else (the gateway, a crash, no network) keeps supabase-js' own
// error.
export async function edgeFunctionError(error) {
  try {
    const body = await error?.context?.json?.()
    if (typeof body?.error === 'string' && body.error) {
      return Object.assign(new Error(body.error), {
        serverMessage: true, ...(typeof body.code === 'string' ? { code: body.code } : {}),
      })
    }
  } catch { /* not JSON */ }
  return error
}

// Supabase Auth error codes → our copy (keys under common:errors).
const AUTH_MESSAGES = {
  invalid_credentials: 'auth.invalidCredentials',
  email_not_confirmed: 'auth.emailNotConfirmed',
  email_address_invalid: 'emailInvalid',
  user_already_exists: 'auth.accountExists',
  email_exists: 'auth.accountExists',
  weak_password: 'auth.weakPassword',
  same_password: 'auth.samePassword',
  current_password_invalid: 'auth.currentPasswordInvalid',
  otp_expired: 'auth.linkExpired',
  over_request_rate_limit: TOO_MANY,
  over_email_send_rate_limit: TOO_MANY,
  over_sms_send_rate_limit: TOO_MANY,
  session_expired: SESSION_EXPIRED,
  session_not_found: SESSION_EXPIRED,
  refresh_token_not_found: SESSION_EXPIRED,
  refresh_token_already_used: SESSION_EXPIRED,
  bad_jwt: SESSION_EXPIRED,
  // The delete-account function's "sign in again" (_shared/reauth.ts).
  reauth_required: 'reauth.deleteAccount',
  PGRST301: SESSION_EXPIRED, // PostgREST: JWT expired
}

// WebAuthn (passkey) failures, by supabase-js' code or the browser's name.
const PASSKEY_CANCELLED = 'passkey.cancelled'
const PASSKEY_MESSAGES = {
  ERROR_CEREMONY_ABORTED: PASSKEY_CANCELLED,
  NotAllowedError: PASSKEY_CANCELLED,
  AbortError: PASSKEY_CANCELLED,
  ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED: 'passkey.registered',
}

const NETWORK_NAMES = new Set(['AuthRetryableFetchError', 'FunctionsFetchError'])
const NETWORK_TEXT = /failed to fetch|load failed|networkerror|network request failed|failed to send a request/i

// True when the request never got an answer: offline, DNS, CORS, a dropped
// connection.
function isNetworkError(error) {
  if (!error) return false
  return NETWORK_NAMES.has(error.name) || NETWORK_TEXT.test(String(error.message ?? ''))
}

// The RAISE EXCEPTION messages in supabase/migrations that are copy for the
// user (validation, permission and rate-limit refusals), exactly as raised,
// mapped to the key of what to show (common:errors.<key>). The server keeps
// raising stable English; the English copy is the raise as a sentence
// ("the split must add up to the total" → "The split must add up to the
// total."), and test/errors.test.js checks it still is.
// Every other raise there is an internal guard and gets the fallback.
// test/errors.test.js reads the migrations and fails when a raise is in
// neither this list nor its list of internal guards.
export const SQL_USER_MESSAGES = new Map([
  // Signed out mid-session (every definer function checks auth.uid()).
  ['not authenticated', 'sessionExpired'],
  // Permissions and membership
  ['not allowed', 'sql.notAllowed'],
  ['not a member', 'sql.notMember'],
  ['not a member of this group', 'sql.notGroupMember'],
  ['only the owner can delete this group', 'sql.ownerDeletes'],
  ['Only the person who added this expense (or the group owner) can edit it.', 'sql.editExpense'],
  ['You can only record settlements you are part of.', 'sql.ownSettlements'],
  ['Payer is not a member of this group', 'sql.payerNotMember'],
  ['Settlement members must belong to this group', 'sql.settlementMembers'],
  ["Split member is not in this expense's group", 'sql.splitMember'],
  // Leaving, removing, deleting
  ['Everyone must be settled up before the group can be deleted.', 'sql.settleBeforeDelete'],
  ['Remove the other members before deleting this group.', 'sql.removeMembersFirst'],
  ['This member still has an outstanding balance — settle up first.', 'sql.memberOwes'],
  ["This person has expense history and can't be removed individually — delete the group instead.", 'sql.memberHistory'],
  ['You are the only member — delete the group instead.', 'sql.onlyMember'],
  // Invites and reminders
  ['invalid email', 'sql.invalidEmail'],
  ['invite expired', 'sql.inviteExpired'],
  ['invite invalid or expired', 'sql.inviteInvalid'],
  ['already responded', 'sql.alreadyResponded'],
  ['That person is already in this group.', 'sql.alreadyInGroup'],
  ['They already have a pending invite to this group.', 'sql.alreadyInvited'],
  ["You've already reminded them today.", 'sql.alreadyReminded'],
  // Amounts and splits
  ['amount must be positive', 'sql.amountPositive'],
  ['amount must be zero or more', 'sql.amountZeroOrMore'],
  ['each person needs a share', 'sql.shareEach'],
  ['shares cannot be negative', 'sql.sharesNegative'],
  ['split between at least one person', 'sql.splitSomeone'],
  ['the split must add up to the total', 'sql.splitTotal'],
  ['A foreign-currency entry needs a positive exchange rate.', 'sql.entryRate'],
  ['A foreign-currency expense needs a positive exchange rate.', 'sql.expenseRate'],
  // Entries, categories, budgets, recurring, comments, payment details, profile
  ['An entry’s type can’t be changed once it’s saved.', 'sql.entryType'],
  ["That entry can't be made recurring.", 'sql.notRecurring'],
  ['You can have at most 200 recurring entries.', 'sql.recurringMax'],
  ["A category can't be moved to another account.", 'sql.categoryAccount'],
  ["A category's type (expense or income) can't change.", 'sql.categoryType'],
  ['Pick a different category to move its entries to.', 'sql.moveCategory'],
  ['Last month has no budgets to copy.', 'sql.noBudgetsToCopy'],
  ['A comment must be 1–2000 characters.', 'sql.commentLength'],
  ['A PayPal.me name is up to 20 letters and numbers.', 'sql.paypalName'],
  ['Your base currency is fixed once you’ve added entries, so past amounts stay correct.', 'sql.baseCurrencyFixed'],
  ['Payment details are too long.', 'sql.paymentDetailsLong'],
  ['Choose one of your own income categories for your salary.', 'sql.salaryCategory'],
  // Plan mode (0095)
  ['Your plan is too big.', 'sql.planTooBig'],
  ['Undo is no longer available.', 'sql.undoExpired'],
  // Rate limits
  ['Too many changes — please try again later.', 'sql.tooManyChanges'],
  ['Too many comments — please slow down.', 'sql.tooManyComments'],
  ['Too many expenses added — please slow down.', 'sql.tooManyExpenses'],
  ['Too many exports — please try again later.', 'sql.tooManyExports'],
  ['Too many groups joined — please try again later.', 'sql.tooManyGroups'],
  ['Too many invites — please slow down.', 'sql.tooManyInvites'],
  ['Too many requests — please try again later.', 'sql.tooManyRequests'],
  ['Too many saves — please slow down.', 'sql.tooManySaves'],
  ['Too many settlements — please slow down.', 'sql.tooManySettlements'],
  // The shared demo account (0090): invites, links, reminders, push, emails.
  [DEMO_REFUSAL, 'sql.demo'],
])

// Code-like content that must never reach the user, even from our own
// edge functions: a snake_case or bracketed token, a stack line, Postgres wording.
const CODE_LIKE = /[_{}<>[\]\\`|]|\n|\bat\s+\S+\s*\(|\b(undefined|null|NaN|violates|constraint|syntax|permission denied|row-level security|JWT|PGRST\w*|SQLSTATE|\w+Error)\b/i

function plainWording(message) {
  return typeof message === 'string' && message.trim().length > 0 && message.length <= 240
    && !CODE_LIKE.test(message)
}

// "the split must add up to the total" → "The split must add up to the total."
function sentence(message) {
  const s = message.trim()
  const capital = s.charAt(0).toUpperCase() + s.slice(1)
  return /[.!?…]$/.test(capital) ? capital : `${capital}.`
}

// The copy for a P0001 raise, or null when it isn't on the allowlist.
function sqlCopy(message) {
  return SQL_USER_MESSAGES.has(message) ? msg(SQL_USER_MESSAGES.get(message)) : null
}

// The message to show for `error`: ours when it is ours, otherwise `fallback`
// (the generic line when there's none; network failures get the connection
// message instead). Our client and server copy is shown in the app's
// language; an edge function's own `error` text is shown as it comes.
export function userMessage(error, fallback = msg('generic')) {
  if (!error || typeof error !== 'object') return fallback
  if (error instanceof UserError) return error.message || fallback
  if (isNetworkError(error)) return msg('connection')
  const mapped = AUTH_MESSAGES[error.code] ?? PASSKEY_MESSAGES[error.code] ?? PASSKEY_MESSAGES[error.name]
  if (mapped) return msg(mapped)
  if (error.code === 'P0001') return sqlCopy(error.message) ?? fallback
  if (error.serverMessage === true && plainWording(error.message)) return sentence(error.message)
  return fallback
}

// The line under "Couldn't load …" (QueryError): offline first, then the
// connection hint, then our own copy, else a generic line. `online` is
// navigator.onLine; only an explicit false means offline.
export function loadErrorMessage(error, online) {
  if (online === false) return msg('offlineRetry')
  return userMessage(error)
}
