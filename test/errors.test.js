import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import {
  CONNECTION_ERROR, GENERIC_ERROR, UserError, dbError, edgeFunctionError, isNetworkError, userMessage,
} from '../src/shared/lib/errors.js'

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
  // An internal guard token is not copy.
  assert.equal(userMessage(pg('no_account', 'P0001'), FALLBACK), FALLBACK)
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
  // P0001 with code-like content still falls back.
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
    assert.equal(isNetworkError({ message }), true)
  }
  assert.equal(userMessage(Object.assign(new Error('{}'), { name: 'AuthRetryableFetchError' })), CONNECTION_ERROR)
  assert.equal(userMessage(Object.assign(new Error(''), { name: 'FunctionsFetchError' })), CONNECTION_ERROR)
  assert.equal(isNetworkError(null), false)
  assert.equal(isNetworkError(new Error('not allowed')), false)
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

// The copy our SQL raises for users (a capitalised RAISE EXCEPTION without an
// errcode, so P0001) must all reach them.
test('every capitalised RAISE message in the migrations passes through', () => {
  const dir = new URL('../supabase/migrations/', import.meta.url)
  const messages = new Set()
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql'))) {
    const sql = readFileSync(new URL(f, dir), 'utf8')
    for (const m of sql.matchAll(/raise exception '((?:[^']|'')+)'\s*;/gi)) messages.add(m[1].replaceAll("''", "'"))
  }
  const copy = [...messages].filter((m) => /^[A-Z]/.test(m))
  assert.ok(copy.length > 20)
  for (const m of copy) assert.equal(userMessage(pg(m, 'P0001')), /[.!?…]$/.test(m) ? m : `${m}.`, m)
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
