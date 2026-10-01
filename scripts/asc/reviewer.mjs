// Makes Apple's reviewer account on the app's Supabase project when it
// doesn't exist yet: the same sign-up the website does (the public anon key
// from the app's xcconfig, the legal versions as the sign-up's consent), with
// the REVIEW_EMAIL(_DEV) / REVIEW_PASSWORD(_DEV) secrets. A sign-in is tried
// first, so a run on an account that works changes nothing. Supabase then
// emails a confirmation link; the account works once it's confirmed.
//
// Run by .github/workflows/ios-store-info.yml (the `reviewer` input):
//   node scripts/asc/reviewer.mjs --app dev|prod
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { APPS } from './listing.mjs'

const ROOT = new URL('../../', import.meta.url)

// SUPABASE_URL and SUPABASE_ANON_KEY from an xcconfig (`https:/$()/…` keeps
// the // from starting a comment there).
export function supabaseFromXcconfig(text) {
  const value = (key) => new RegExp(`^${key}\\s*=\\s*(.+)$`, 'm').exec(text)?.[1].trim()
  const url = value('SUPABASE_URL')?.replace('$()', '')
  const anonKey = value('SUPABASE_ANON_KEY')
  if (!url || !anonKey) throw new Error('The xcconfig has no SUPABASE_URL or SUPABASE_ANON_KEY.')
  return { url, anonKey }
}

// The versions a sign-up accepts (supabase/functions/_shared/legal.ts).
export function legalVersions(text) {
  const m = /LEGAL_VERSIONS\s*=\s*\{\s*privacy:\s*'([^']+)',\s*terms:\s*'([^']+)'\s*\}/.exec(text)
  if (!m) throw new Error('LEGAL_VERSIONS not found in _shared/legal.ts.')
  return { privacy: m[1], terms: m[2] }
}

// The website's sign-up body (Login.jsx: signUp with signupConsentMetadata).
export function signUpBody({ email, password, versions }) {
  return { email, password, data: { accepted_privacy: versions.privacy, accepted_terms: versions.terms } }
}

// What a sign-in's answer means for the account.
export function signInState(status, body) {
  if (status === 200) return 'ready'
  const text = `${body?.error_code ?? ''} ${body?.msg ?? body?.error_description ?? body?.message ?? ''}`.toLowerCase()
  if (text.includes('not confirmed') || text.includes('not_confirmed')) return 'unconfirmed'
  return 'missing'
}

async function call(url, anonKey, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

async function main() {
  const at = process.argv.indexOf('--app')
  const app = at >= 0 ? process.argv[at + 1] : null
  if (!APPS.includes(app)) throw new Error('Pass --app dev or --app prod.')
  const suffix = app === 'dev' ? '_DEV' : ''
  const email = process.env[`REVIEW_EMAIL${suffix}`]?.trim()
  const password = process.env[`REVIEW_PASSWORD${suffix}`]
  if (!email || !password) throw new Error(`Missing repository secrets: REVIEW_EMAIL${suffix}, REVIEW_PASSWORD${suffix}.`)
  const { url, anonKey } = supabaseFromXcconfig(readFileSync(new URL(`ios/Budgeer/Config/${app === 'dev' ? 'Dev' : 'Prod'}.xcconfig`, ROOT), 'utf8'))
  const versions = legalVersions(readFileSync(new URL('supabase/functions/_shared/legal.ts', ROOT), 'utf8'))

  const signIn = await call(`${url}/auth/v1/token?grant_type=password`, anonKey, { email, password })
  const state = signInState(signIn.status, signIn.body)
  if (state === 'ready') return console.log('Reviewer account: exists and signs in.')
  if (state === 'unconfirmed') return console.log('Reviewer account: exists, waiting for its email confirmation.')

  const made = await call(`${url}/auth/v1/signup`, anonKey, signUpBody({ email, password, versions }))
  if (made.status >= 300) throw new Error(`Sign-up refused (${made.status}): ${made.body?.msg ?? made.body?.error_description ?? 'no message'}`)
  console.log('Reviewer account: signed up; it works once its email is confirmed.')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => {
    console.log(`::error::${e.message}`)
    process.exit(1)
  })
}
