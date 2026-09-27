import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import {
  CONNECTION_ERROR, GENERIC_ERROR, SQL_USER_MESSAGES, UserError, dbError, edgeFunctionError, loadErrorMessage,
  userMessage,
} from '../src/shared/lib/errors.js'
import { loadLanguage, t, translate } from '../src/shared/lib/i18n/i18n.js'

const FALLBACK = 'Couldn’t save the expense. Please try again.'
const pg = (message, code) => ({ message, code, details: null, hint: null })

test('userMessage: our client-side copy passes through', () => {
  assert.equal(userMessage(new UserError('This file isn’t a Budgeer backup.'), FALLBACK), 'This file isn’t a Budgeer backup.')
  // Even with characters the server check would refuse: we wrote it here.
  assert.equal(userMessage(new UserError('This backup is damaged (entry #3: amount_minor).')),
    'This backup is damaged (entry #3: amount_minor).')
  class Sub extends UserError {}
  assert.equal(userMessage(new Sub('Wrong password or damaged file.')), 'Wrong password or damaged file.')
})

test('userMessage: a deliberate SQL RAISE (P0001) passes through as a sentence', () => {
  assert.equal(userMessage(pg('the split must add up to the total', 'P0001'), FALLBACK), 'The split must add up to the total.')
  assert.equal(userMessage(pg('not allowed', 'P0001')), 'Not allowed.')
  assert.equal(userMessage(pg('Too many saves — please slow down.', 'P0001')), 'Too many saves — please slow down.')
  // Through dbError, the way the data modules throw it.
  assert.equal(userMessage(dbError(pg('This member still has an outstanding balance — settle up first.', 'P0001'))),
    'This member still has an outstanding balance — settle up first.')
  // Signed out mid-session: our session copy, not the raw guard.
  assert.match(userMessage(pg('not authenticated', 'P0001')), /session has expired/)
  // Internal guards that only fire on a bug stay hidden.
  for (const guard of ['no_account', 'unknown quota scope', 'bad type', 'rows must be an array', 'invalid push keys']) {
    assert.equal(userMessage(pg(guard, 'P0001'), FALLBACK), FALLBACK, guard)
  }
  // Only an exact allowlisted message passes: not a lookalike.
  assert.equal(userMessage(pg('not allowed: row 3', 'P0001'), FALLBACK), FALLBACK)
})

test('userMessage: Postgres and PostgREST errors become the fallback', () => {
  const technical = [
    pg('duplicate key value violates unique constraint "categories_user_name_key"', '23505'),
    pg('new row violates row-level security policy for table "transactions"', '42501'),
    pg('permission denied for table budgets', '42501'),
    pg('invalid input syntax for type uuid: "abc"', '22P02'),
    pg('Could not find the function public.foo without parameters in the schema cache', 'PGRST202'),
    pg('JSON object requested, multiple (or no) rows returned', 'PGRST116'),
    pg('Images must be uploaded to Budgeer.', '23514'), // Postgres' own code: not trusted
    pg('value too long for type character varying(60)', '22001'),
  ]
  for (const e of technical) {
    assert.equal(userMessage(e, FALLBACK), FALLBACK, e.message)
    assert.equal(userMessage(dbError(e), FALLBACK), FALLBACK, e.message)
  }
  // P0001 that isn't on the allowlist falls back.
  assert.equal(userMessage(pg('relation "x" does not exist\n  at foo (bar.js:1)', 'P0001'), FALLBACK), FALLBACK)
  assert.equal(userMessage(pg('value is null', 'P0001'), FALLBACK), FALLBACK)
  assert.equal(userMessage(pg('x'.repeat(300), 'P0001'), FALLBACK), FALLBACK)
})

test('userMessage: JavaScript exceptions and plain Errors become the fallback', () => {
  assert.equal(userMessage(new TypeError('Cannot read properties of undefined (reading \'amount\')'), FALLBACK), FALLBACK)
  assert.equal(userMessage(new Error('Edge Function returned a non-2xx status code'), FALLBACK), FALLBACK)
  assert.equal(userMessage(new Error('The split must add up to the total'), FALLBACK), FALLBACK)
  assert.equal(userMessage(new Error('boom')), GENERIC_ERROR)
})

test('userMessage: no error or a non-object gives the fallback', () => {
  assert.equal(userMessage(null, FALLBACK), FALLBACK)
  assert.equal(userMessage(undefined), GENERIC_ERROR)
  assert.equal(userMessage('duplicate key value', FALLBACK), FALLBACK)
  assert.equal(userMessage(new UserError(''), FALLBACK), FALLBACK)
})

test('userMessage: network failures get the connection message', () => {
  for (const message of ['Failed to fetch', 'TypeError: Failed to fetch', 'Load failed',
    'NetworkError when attempting to fetch resource.', 'Failed to send a request to the Edge Function']) {
    assert.equal(userMessage(new Error(message), FALLBACK), CONNECTION_ERROR, message)
  }
  assert.equal(userMessage(Object.assign(new Error('{}'), { name: 'AuthRetryableFetchError' })), CONNECTION_ERROR)
  assert.equal(userMessage(Object.assign(new Error(''), { name: 'FunctionsFetchError' })), CONNECTION_ERROR)
})

test('loadErrorMessage (QueryError): offline, then connection, then our copy, else generic', () => {
  const pass = pg('not a member of this group', 'P0001')
  assert.equal(loadErrorMessage(pass, false), 'You’re offline. Reconnect and try again.')
  assert.equal(loadErrorMessage(new Error('Failed to fetch'), false), 'You’re offline. Reconnect and try again.')
  assert.equal(loadErrorMessage(new Error('Failed to fetch'), true), CONNECTION_ERROR)
  assert.equal(loadErrorMessage(new Error('Load failed'), undefined), CONNECTION_ERROR)
  assert.equal(loadErrorMessage(pass, true), 'Not a member of this group.')
  assert.equal(loadErrorMessage(new UserError('Couldn’t read all of your entries — please try again.'), true),
    'Couldn’t read all of your entries — please try again.')
  assert.equal(loadErrorMessage(pg('permission denied for table budgets', '42501'), true), GENERIC_ERROR)
  assert.equal(loadErrorMessage(pg('unknown quota scope', 'P0001'), true), GENERIC_ERROR)
  assert.equal(loadErrorMessage(null, true), GENERIC_ERROR)
})

test('userMessage: Supabase Auth codes map to our own copy', () => {
  const auth = (code, message = 'raw text from the server') => Object.assign(new Error(message), { code, name: 'AuthApiError' })
  assert.equal(userMessage(auth('invalid_credentials', 'Invalid login credentials')), 'Wrong email or password.')
  assert.match(userMessage(auth('email_not_confirmed')), /confirm your email/)
  assert.match(userMessage(auth('weak_password')), /stronger/)
  assert.match(userMessage(auth('same_password')), /different from the current one/)
  assert.match(userMessage(auth('over_email_send_rate_limit')), /Too many attempts/)
  assert.match(userMessage(auth('over_request_rate_limit')), /Too many attempts/)
  assert.match(userMessage(auth('otp_expired')), /link has expired/)
  assert.match(userMessage(auth('session_not_found')), /sign in again/)
  assert.match(userMessage(pg('JWT expired', 'PGRST301')), /sign in again/)
  // An unknown auth code falls back; Supabase's text never shows.
  assert.equal(userMessage(auth('unexpected_failure', 'Database error saving new user'), FALLBACK), FALLBACK)
})

test('userMessage: passkey failures', () => {
  const webauthn = (code, name) => Object.assign(new Error('The operation either timed out or was not allowed.'), { code, name })
  assert.match(userMessage(webauthn('ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY', 'NotAllowedError')), /cancelled or timed out/)
  assert.match(userMessage(webauthn('ERROR_CEREMONY_ABORTED', 'AbortError')), /cancelled or timed out/)
  assert.match(userMessage(webauthn('ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED', 'InvalidStateError')), /already has a passkey/)
  assert.equal(userMessage(webauthn('ERROR_INVALID_RP_ID', 'SecurityError'), FALLBACK), FALLBACK)
})

test('dbError keeps the message and code as an Error', () => {
  const e = dbError(pg('not allowed', 'P0001'))
  assert.ok(e instanceof Error)
  assert.equal(e.message, 'not allowed')
  assert.equal(e.code, 'P0001')
  assert.ok(dbError(null).message)
})

test('edgeFunctionError: our JSON `error` is copy; anything else keeps the original error', async () => {
  const withBody = (body) => Object.assign(new Error('Edge Function returned a non-2xx status code'), {
    name: 'FunctionsHttpError', context: { json: async () => body },
  })
  const ours = await edgeFunctionError(withBody({ error: 'Too many report requests. Please try again later.' }))
  assert.equal(userMessage(ours, FALLBACK), 'Too many report requests. Please try again later.')
  const tellUs = await edgeFunctionError(withBody({ error: 'Tell us a little more (at least 10 characters).' }))
  assert.equal(userMessage(tellUs), 'Tell us a little more (at least 10 characters).')
  // A developer-facing check stays hidden.
  assert.equal(userMessage(await edgeFunctionError(withBody({ error: 'group_id is required' })), FALLBACK), FALLBACK)
  // The gateway's own body (no `error` key) and a non-JSON body fall back.
  const gateway = withBody({ code: 401, message: 'Invalid JWT' })
  assert.equal(await edgeFunctionError(gateway), gateway)
  assert.equal(userMessage(await edgeFunctionError(gateway), FALLBACK), FALLBACK)
  const html = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
    context: { json: async () => { throw new SyntaxError('Unexpected token <') } },
  })
  assert.equal(userMessage(await edgeFunctionError(html), FALLBACK), FALLBACK)
  const offline = Object.assign(new Error('Failed to send a request to the Edge Function'), { name: 'FunctionsFetchError' })
  assert.equal(userMessage(await edgeFunctionError(offline), FALLBACK), CONNECTION_ERROR)
})

test('edgeFunctionError keeps the machine-readable code next to the copy', async () => {
  const res = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
    context: { json: async () => ({ error: 'For your security, please sign in again to delete your account.', code: 'reauth_required' }) },
  })
  const e = await edgeFunctionError(res)
  assert.equal(e.code, 'reauth_required')
  assert.equal(userMessage(e, FALLBACK), 'For your security, please sign in again to delete your account.')
  const plain = await edgeFunctionError(Object.assign(new Error('x'), { context: { json: async () => ({ error: 'Incorrect password.' }) } }))
  assert.equal(plain.code, undefined)
})

// Every RAISE EXCEPTION in the migrations, classified. A message is either
// copy for the user (on SQL_USER_MESSAGES in errors.js, so it passes) or an
// internal guard listed here (it only fires on a bug, a migration or a cron
// job, or carries a Postgres errcode, so users get the fallback). A new raise
// in neither list fails the test until someone decides which it is.
const INTERNAL_RAISES = [
  // Not-found guards: a stale id or a bug; the action's fallback says enough.
  'not found', 'item not found', 'member not found', 'expense not found', 'group not found',
  'invite not found', 'category not found', 'category or account not found', 'category to move to not found',
  // Input the app never sends.
  'bad type', 'unknown currency', 'cannot nudge yourself', 'rows must be an array', 'too many rows in one request',
  'invalid push keys', 'unsupported push endpoint', 'no_account', 'unknown quota scope', 'bad plan',
  // Server-only paths: cron, migrations, decryption.
  'unknown privacy email kind %', 'encrypted value is not an amount',
  'receipts bucket is not empty: empty it via the Storage API, then re-run this migration',
  'unknown demo role', 'a demo login needs a password hash', 'that address belongs to an existing account',
  // Raised with a Postgres errcode (42501, 23514), not P0001: never trusted.
  'Group members can only be changed through the app.', 'Images must be uploaded to Budgeer.',
]

function migrationRaises() {
  const dir = new URL('../supabase/migrations/', import.meta.url)
  const messages = new Set()
  const raise = /raise\s+exception\s+(?:'((?:[^']|'')*)'|using[^;]*?message\s*=\s*'((?:[^']|'')*)')/gis
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql'))) {
    for (const m of readFileSync(new URL(f, dir), 'utf8').matchAll(raise)) {
      messages.add((m[1] ?? m[2]).replaceAll("''", "'"))
    }
  }
  return messages
}

test('every RAISE in the migrations is classified: user copy passes, internal guards are hidden', () => {
  const raises = migrationRaises()
  assert.ok(raises.size > 60)
  const unclassified = [...raises].filter((m) => !SQL_USER_MESSAGES.has(m) && !INTERNAL_RAISES.includes(m))
  assert.deepEqual(unclassified, [], 'classify these raises in errors.js or INTERNAL_RAISES')
  for (const m of raises) {
    const shown = userMessage(pg(m, 'P0001'), FALLBACK)
    if (INTERNAL_RAISES.includes(m)) assert.equal(shown, FALLBACK, m)
    else if (m === 'not authenticated') assert.match(shown, /session has expired/)
    else assert.equal(shown, /[.!?…]$/.test(m) ? m : `${m.charAt(0).toUpperCase()}${m.slice(1)}.`, m)
  }
  // No list names a message the migrations don't raise, and none both.
  for (const m of [...SQL_USER_MESSAGES.keys(), ...INTERNAL_RAISES]) assert.ok(raises.has(m), `not raised: ${m}`)
  for (const m of INTERNAL_RAISES) assert.ok(!SQL_USER_MESSAGES.has(m), `in both lists: ${m}`)
})

// Every literal `error` string our browser-called edge functions return is
// plain copy (a snake_case or code-like one would be hidden from users).
test('the browser-called edge functions’ error strings pass through', () => {
  const fns = ['send-invite', 'privacy-request', 'delete-account', 'generate-report', 'group-report']
  const hidden = []
  for (const fn of fns) {
    const src = readFileSync(new URL(`../supabase/functions/${fn}/index.ts`, import.meta.url), 'utf8')
    for (const m of src.matchAll(/json\(\{ error: (['`])((?:(?!\1).)+)\1 \}/g)) {
      const text = m[2].replaceAll('${INBOX}', 'privacy@budgeer.com')
      const shown = userMessage({ message: text, serverMessage: true }, FALLBACK)
      if (shown === FALLBACK) hidden.push(text)
    }
  }
  // Only developer-facing request checks (a client bug, never user input).
  assert.deepEqual(hidden.sort(), ['group_id is required'])
})

test('userMessage in Greek: our copy is translated, the raw SQL text still maps to it', async () => {
  await loadLanguage('el')
  try {
    assert.equal(userMessage(pg('the split must add up to the total', 'P0001')), 'Το μοίρασμα πρέπει να βγάζει το σύνολο.')
    assert.equal(userMessage(pg('not authenticated', 'P0001')), 'Η σύνδεσή σου έληξε. Συνδέσου ξανά.')
    assert.equal(userMessage(new Error('boom')), 'Κάτι πήγε στραβά. Δοκίμασε ξανά.')
    assert.equal(userMessage(new Error('Failed to fetch'), FALLBACK), t('common:errors.connection'))
    assert.equal(loadErrorMessage(null, false), 'Είσαι εκτός σύνδεσης. Συνδέσου ξανά και δοκίμασε πάλι.')
    // An internal guard still falls back; every allowlisted raise has Greek copy.
    assert.equal(userMessage(pg('unknown quota scope', 'P0001'), FALLBACK), FALLBACK)
    for (const m of SQL_USER_MESSAGES.keys()) {
      const english = translate(`common:errors.${SQL_USER_MESSAGES.get(m)}`, null, { lang: 'en' })
      assert.notEqual(userMessage(pg(m, 'P0001'), FALLBACK), english, m)
    }
  } finally {
    await loadLanguage('en')
  }
})
