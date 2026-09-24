// Which error text a user gets to see. Only words we wrote for users are
// shown; anything technical (Postgres/PostgREST errors, network failures,
// JavaScript exceptions, Supabase's own wording) becomes a friendly fallback.
// Callers keep logging the real error to the console for debugging.
//
// What counts as ours is decided by where the error came from, not by
// guessing from its text:
//   UserError                 — thrown by our client code with copy for the user
//   code 'P0001'              — a Postgres RAISE EXCEPTION from our SQL functions
//                               and triggers (Postgres' own errors carry other codes)
//   serverMessage: true       — the JSON `error` body of one of our edge functions
// Supabase Auth and WebAuthn errors with a clear meaning map to our own copy.
// Server-worded text is still checked for anything code-like (a snake_case
// token, brackets, a stack line) and falls back when it has some.

export const GENERIC_ERROR = 'Something went wrong. Please try again.'
export const CONNECTION_ERROR = 'Couldn’t reach the server. Check your connection and try again.'
const SESSION_EXPIRED = 'Your session has expired. Please sign in again.'
const TOO_MANY = 'Too many attempts. Please wait a few minutes and try again.'

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
// with { error: '<copy for the user>' }; anything else (the gateway, a crash,
// no network) keeps supabase-js' own error.
export async function edgeFunctionError(error) {
  try {
    const body = await error?.context?.json?.()
    if (typeof body?.error === 'string' && body.error) {
      return Object.assign(new Error(body.error), { serverMessage: true })
    }
  } catch { /* not JSON */ }
  return error
}

// Supabase Auth error codes → our copy.
const AUTH_MESSAGES = {
  invalid_credentials: 'Wrong email or password.',
  email_not_confirmed: 'Please confirm your email first. Check your inbox for the link.',
  email_address_invalid: 'Please enter a valid email address.',
  user_already_exists: 'An account with this email already exists. Try signing in.',
  email_exists: 'An account with this email already exists. Try signing in.',
  weak_password: 'That password is too easy to guess. Please pick a stronger one.',
  same_password: 'Your new password must be different from the current one.',
  current_password_invalid: 'Current password is incorrect.',
  otp_expired: 'This link has expired. Please request a new one.',
  over_request_rate_limit: TOO_MANY,
  over_email_send_rate_limit: TOO_MANY,
  over_sms_send_rate_limit: TOO_MANY,
  session_expired: SESSION_EXPIRED,
  session_not_found: SESSION_EXPIRED,
  refresh_token_not_found: SESSION_EXPIRED,
  refresh_token_already_used: SESSION_EXPIRED,
  bad_jwt: SESSION_EXPIRED,
  PGRST301: SESSION_EXPIRED, // PostgREST: JWT expired
}

// WebAuthn (passkey) failures, by supabase-js' code or the browser's name.
const PASSKEY_CANCELLED = 'The passkey request was cancelled or timed out.'
const PASSKEY_MESSAGES = {
  ERROR_CEREMONY_ABORTED: PASSKEY_CANCELLED,
  NotAllowedError: PASSKEY_CANCELLED,
  AbortError: PASSKEY_CANCELLED,
  ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED: 'This device already has a passkey for your account.',
}

const NETWORK_NAMES = new Set(['AuthRetryableFetchError', 'FunctionsFetchError'])
const NETWORK_TEXT = /failed to fetch|load failed|networkerror|network request failed|failed to send a request/i

// True when the request never got an answer: offline, DNS, CORS, a dropped
// connection.
export function isNetworkError(error) {
  if (!error) return false
  return NETWORK_NAMES.has(error.name) || NETWORK_TEXT.test(String(error.message ?? ''))
}

// Code-like content that must never reach the user, even from our own
// server: a snake_case or bracketed token, a stack line, Postgres wording.
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

// The message to show for `error`: ours when it is ours, otherwise `fallback`
// (network failures get the connection message instead).
export function userMessage(error, fallback = GENERIC_ERROR) {
  if (!error || typeof error !== 'object') return fallback
  if (error instanceof UserError) return error.message || fallback
  if (isNetworkError(error)) return CONNECTION_ERROR
  const mapped = AUTH_MESSAGES[error.code] ?? PASSKEY_MESSAGES[error.code] ?? PASSKEY_MESSAGES[error.name]
  if (mapped) return mapped
  if ((error.code === 'P0001' || error.serverMessage === true) && plainWording(error.message)) {
    return sentence(error.message)
  }
  return fallback
}
