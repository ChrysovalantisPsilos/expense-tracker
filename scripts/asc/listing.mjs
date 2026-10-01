// The store texts (ios/store/listing.<lang>.json) and settings
// (ios/store/config.json), their checks against Apple's limits, and the
// secrets each run needs. Pure apart from reading the files.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export const STORE_DIR = fileURLToPath(new URL('../../ios/store/', import.meta.url))
export const APPS = ['prod', 'dev']
// The listing file for each App Store Connect locale.
export const LISTING_FILES = { 'en-US': 'listing.en.json', el: 'listing.el.json' }

// Apple's limits, in characters (App Store Connect help, "Platform version
// information" and "TestFlight"; keywords are comma-separated).
export const LIMITS = {
  name: 30,
  subtitle: 30,
  promotionalText: 170,
  keywords: 100,
  description: 4000,
  betaDescription: 4000,
  whatToTest: 4000,
  reviewNotes: 4000,
}

const readJson = (file) => JSON.parse(readFileSync(path.join(STORE_DIR, file), 'utf8'))

export function loadStore() {
  const config = readJson('config.json')
  const listings = Object.fromEntries(Object.entries(LISTING_FILES).map(([locale, file]) => [locale, readJson(file)]))
  return { config, listings }
}

export const length = (text) => [...String(text ?? '')].length

// Everything wrong with the texts and settings, as readable lines (empty when
// all is well).
export function listingProblems({ config, listings }) {
  const problems = []
  const need = (cond, msg) => { if (!cond) problems.push(msg) }
  const within = (where, text, limit) => {
    need(typeof text === 'string' && text.trim().length > 0, `${where} is empty`)
    need(length(text) <= limit, `${where} is ${length(text)} characters (limit ${limit})`)
  }
  for (const app of APPS) {
    const a = config.apps?.[app]
    need(a && /^com\.budgeer\.app(\.dev)?$/.test(a.bundleId), `config.apps.${app}.bundleId`)
    need(a && /^https:\/\/[a-z.]+budgeer\.com$/.test(a.site), `config.apps.${app}.site must be an https budgeer.com origin`)
    if (a) within(`config.apps.${app}.name`, a.name, LIMITS.name)
    need(Number.isInteger(a?.publicLinkLimit) && a.publicLinkLimit >= 1 && a.publicLinkLimit <= 10000,
      `config.apps.${app}.publicLinkLimit must be 1–10000`)
    within(`config.reviewNotes.${app}`, config.reviewNotes?.[app], LIMITS.reviewNotes)
  }
  need(JSON.stringify(config.locales) === JSON.stringify(Object.keys(LISTING_FILES)), 'config.locales must match the listing files')
  for (const [locale, listing] of Object.entries(listings)) {
    need(listing.locale === locale, `listing for ${locale} says locale ${listing.locale}`)
    for (const app of APPS) {
      const where = `${locale}.${app}`
      const store = listing[app]?.appStore ?? {}
      const beta = listing[app]?.testFlight ?? {}
      within(`${where}.appStore.subtitle`, store.subtitle, LIMITS.subtitle)
      within(`${where}.appStore.promotionalText`, store.promotionalText, LIMITS.promotionalText)
      within(`${where}.appStore.keywords`, store.keywords, LIMITS.keywords)
      within(`${where}.appStore.description`, store.description, LIMITS.description)
      within(`${where}.testFlight.description`, beta.description, LIMITS.betaDescription)
      within(`${where}.testFlight.whatToTest`, beta.whatToTest, LIMITS.whatToTest)
      if (typeof store.keywords === 'string') {
        const words = store.keywords.split(',')
        need(words.every((w) => w.length > 0 && w === w.trim()), `${where}.appStore.keywords: no empty words or spaces around commas`)
        need(!words.some((w) => w.toLowerCase().includes('budgeer')), `${where}.appStore.keywords: the app's name is indexed already`)
      }
    }
  }
  return problems
}

// The URLs one app's pages point at.
export function appUrls(config, app) {
  const site = config.apps[app].site
  return {
    marketing: site,
    privacyPolicy: `${site}${config.paths.privacyPolicy}`,
    support: `${site}${config.paths.support}`,
  }
}

// The GitHub secrets a run reads. The workflow passes each under its own
// name, so the dev app can never pick up the prod login, or the reverse.
export function requiredSecrets(app) {
  const suffix = app === 'dev' ? '_DEV' : ''
  return ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_KEY_P8', 'ASC_CONTACT_EMAIL', 'ASC_CONTACT_PHONE', `REVIEW_EMAIL${suffix}`, `REVIEW_PASSWORD${suffix}`]
}

export function missingSecrets(app, env) {
  return requiredSecrets(app).filter((name) => !String(env[name] ?? '').trim())
}

// The review contact and the reviewer's login for one app.
export function reviewSecrets(app, env) {
  const suffix = app === 'dev' ? '_DEV' : ''
  return {
    contactEmail: env.ASC_CONTACT_EMAIL.trim(),
    contactPhone: env.ASC_CONTACT_PHONE.trim(),
    reviewEmail: env[`REVIEW_EMAIL${suffix}`].trim(),
    // A password goes as it is: spaces may be part of it.
    reviewPassword: env[`REVIEW_PASSWORD${suffix}`],
  }
}
