// The App Store Connect store information (scripts/asc/, ios/store/): the
// texts within Apple's limits in both languages, the URLs real pages, and the
// token, the request bodies and the screenshot upload built right, all
// without a network.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, verify } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runCertificates } from '../scripts/asc/certificates.mjs'
import { legalVersions, signInState, signUpBody, supabaseFromXcconfig } from '../scripts/asc/reviewer.mjs'
import { AUDIENCE, AscError, createClient, errorText, makeToken, normalisePem, tokenParts } from '../scripts/asc/api.mjs'
import {
  APPS, LIMITS, LISTING_FILES, appUrls, length, listingProblems, loadStore, missingSecrets, requiredSecrets, reviewSecrets,
  withPrimaryLocale,
} from '../scripts/asc/listing.mjs'
import {
  ageRatingAttributes, betaAppLocalizationAttributes, betaGroupCreateBody, betaGroupLinkPatch, betaSubmissionBody,
  buildsLinkBody, changedAttributes, editableAppInfo, editableVersion, latestValidBuild, localizationRequest,
  primaryCategoryBody, reviewDetailAttributes, submissionAction, versionLocalizationAttributes,
} from '../scripts/asc/requests.mjs'
import {
  commitBody, displayTypeFor, localScreenshots, md5, pngSize, reserveBody, screenshotFolder, screenshotPlan, uploadRequests,
} from '../scripts/asc/screenshots.mjs'
import { marketingVersion, parseArgs } from '../scripts/asc/store-info.mjs'

const root = new URL('../', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8')
const store = loadStore()
const { config, listings } = store

// ---- The texts ----------------------------------------------------------

test('the listings pass every check and limit', () => {
  assert.deepEqual(listingProblems(store), [])
})

test('both languages have the same fields for both apps', () => {
  const shape = (l) => APPS.map((app) => [app, Object.keys(l[app].appStore).sort(), Object.keys(l[app].testFlight).sort()])
  assert.deepEqual(shape(listings.el), shape(listings['en-US']))
  assert.deepEqual(Object.keys(listings), Object.keys(LISTING_FILES))
})

test('the Greek texts are Greek, informal and use the glossary terms', () => {
  for (const app of APPS) {
    const all = JSON.stringify(listings.el[app])
    assert.match(all, /[α-ω]/, `${app} has Greek`)
    assert.doesNotMatch(all, /\bσας\b/, 'informal «σου», never «σας»')
    assert.doesNotMatch(all, /μοιρασιά|Μοίρασε\b/)
  }
  assert.match(listings.el.prod.appStore.description, /προϋπολογισμ/)
  assert.match(listings.el.prod.appStore.description, /Ξεχρέω|ξεχρεώ/)
})

test('the checks catch an over-long field and an empty one', () => {
  const broken = structuredClone(store)
  broken.listings['en-US'].prod.appStore.subtitle = 'x'.repeat(LIMITS.subtitle + 1)
  broken.listings.el.dev.testFlight.whatToTest = ' '
  broken.listings.el.prod.appStore.keywords = 'a, b'
  const problems = listingProblems(broken)
  assert.ok(problems.some((p) => p.startsWith('en-US.prod.appStore.subtitle is 31')))
  assert.ok(problems.some((p) => p === 'el.dev.testFlight.whatToTest is empty'))
  assert.ok(problems.some((p) => p.includes('spaces around commas')))
})

test('the dev listing says it is the test version with test data', () => {
  for (const [locale, l] of Object.entries(listings)) {
    for (const field of [l.dev.appStore.description, l.dev.testFlight.description, l.dev.testFlight.whatToTest]) {
      assert.match(field, /dev\.budgeer\.com/, locale)
    }
  }
  assert.match(listings['en-US'].dev.appStore.description, /test data/)
  assert.match(listings.el.dev.appStore.description, /δοκιμαστικά δεδομένα/)
  assert.match(config.reviewNotes.dev, /test server/)
  assert.match(config.reviewNotes.prod, /Budgeer Dev/)
})

test('the claims match the app: optional AI off by default, no ads, both languages', () => {
  const en = listings['en-US'].prod.appStore.description
  assert.match(en, /off until you turn them on/)
  assert.match(en, /No ads/)
  assert.match(en, /English and Greek/)
  assert.match(en, /budgeer\.com/)
  // The AI switches start off (docs/GDPR.md, profiles: "off by default").
  assert.match(read('docs/GDPR.md'), /ai_plan_whatif`, 0105; off by default/)
  // The landing copy's rule: never open with "Free app".
  for (const l of Object.values(listings)) assert.doesNotMatch(l.prod.appStore.description, /^Free/i)
})

test('every URL is a real public page of the site', () => {
  const app = read('src/app/App.jsx')
  const sitemap = read('public/sitemap.xml')
  for (const p of Object.values(config.paths)) {
    assert.match(app, new RegExp(`<Route path="${p}" `), `${p} is a route`)
    assert.ok(sitemap.includes(`https://www.budgeer.com${p}<`), `${p} is in the sitemap`)
  }
  assert.deepEqual(appUrls(config, 'prod'), {
    marketing: 'https://www.budgeer.com',
    privacyPolicy: 'https://www.budgeer.com/privacy',
    support: 'https://www.budgeer.com/help',
  })
  assert.equal(appUrls(config, 'dev').privacyPolicy, 'https://dev.budgeer.com/privacy')
  assert.equal(config.apps.prod.bundleId, 'com.budgeer.app')
  assert.equal(config.apps.dev.bundleId, 'com.budgeer.app.dev')
  // The same ids the Xcode configurations build.
  assert.match(read('ios/Budgeer/Config/Prod.xcconfig'), /BUDGEER_BUNDLE_ID\s*=\s*com\.budgeer\.app\s*$/m)
  assert.match(read('ios/Budgeer/Config/Dev.xcconfig'), /BUDGEER_BUNDLE_ID\s*=\s*com\.budgeer\.app\.dev\s*$/m)
})

test('the review notes point at real places in the app', () => {
  const ios = read('src/locales/en/ios.js')
  assert.match(ios, /setting: 'Face ID lock'/)
  assert.match(read('src/locales/en/settings.js'), /AI helpers/)
  // Settings is the picture at the top right (its label), not a row in More.
  assert.match(ios, /profile: 'Profile and settings'/)
})

// ---- Secrets -------------------------------------------------------------

test('the secrets are named per app, and missing ones are named', () => {
  assert.deepEqual(requiredSecrets('dev').slice(-2), ['REVIEW_EMAIL_DEV', 'REVIEW_PASSWORD_DEV'])
  assert.deepEqual(requiredSecrets('prod').slice(-2), ['REVIEW_EMAIL', 'REVIEW_PASSWORD'])
  const env = { ASC_KEY_ID: 'k', ASC_ISSUER_ID: 'i', ASC_KEY_P8: 'p', ASC_CONTACT_EMAIL: ' ', REVIEW_EMAIL: 'r@x', REVIEW_PASSWORD: 'pw' }
  assert.deepEqual(missingSecrets('prod', env), ['ASC_CONTACT_EMAIL', 'ASC_CONTACT_PHONE'])
  // The prod login never stands in for the dev one.
  assert.deepEqual(missingSecrets('dev', env), ['ASC_CONTACT_EMAIL', 'ASC_CONTACT_PHONE', 'REVIEW_EMAIL_DEV', 'REVIEW_PASSWORD_DEV'])
})

test('the review details carry the contact and the right login', () => {
  const env = {
    ASC_CONTACT_EMAIL: ' me@example.com\n', ASC_CONTACT_PHONE: '+32 400 00 00 00',
    REVIEW_EMAIL: 'prod@example.com', REVIEW_PASSWORD: 'prod pw',
    REVIEW_EMAIL_DEV: 'dev@example.com', REVIEW_PASSWORD_DEV: ' dev pw ',
  }
  const attrs = reviewDetailAttributes({ config, app: 'dev', secrets: reviewSecrets('dev', env) })
  assert.deepEqual(attrs, {
    contactFirstName: 'Chrysovalantis',
    contactLastName: 'Psilos',
    contactEmail: 'me@example.com',
    contactPhone: '+32 400 00 00 00',
    demoAccountRequired: true,
    demoAccountName: 'dev@example.com',
    demoAccountPassword: ' dev pw ',
    notes: config.reviewNotes.dev,
  })
  assert.equal(reviewDetailAttributes({ config, app: 'prod', secrets: reviewSecrets('prod', env) }).demoAccountName, 'prod@example.com')
})

// ---- The token -------------------------------------------------------------

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' })

test('the token is an ES256 JWT with Apple’s claims, signed r‖s', () => {
  const now = Date.UTC(2026, 9, 1, 12, 0, 0)
  const token = makeToken({ keyId: 'KEY123', issuerId: 'issuer-uuid', privateKey: pem, now })
  const [h, c, s] = token.split('.')
  const decode = (part) => JSON.parse(Buffer.from(part, 'base64url').toString())
  assert.deepEqual(decode(h), { alg: 'ES256', kid: 'KEY123', typ: 'JWT' })
  const claims = decode(c)
  assert.deepEqual(claims, { iss: 'issuer-uuid', iat: now / 1000, exp: now / 1000 + 900, aud: AUDIENCE })
  assert.ok(claims.exp - claims.iat <= 20 * 60)
  const signature = Buffer.from(s, 'base64url')
  assert.equal(signature.length, 64)
  assert.ok(verify('sha256', Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, signature))
  assert.deepEqual(tokenParts({ keyId: 'a', issuerId: 'b', now }).claims.aud, 'appstoreconnect-v1')
})

test('a key pasted without line breaks or with literal \\n still reads', () => {
  const body = pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '')
  const flat = `-----BEGIN PRIVATE KEY-----${body}-----END PRIVATE KEY-----`
  assert.equal(normalisePem(flat), pem.replace(/\r/g, ''))
  assert.equal(normalisePem(pem.replace(/\n/g, '\\n')), pem)
  assert.throws(() => normalisePem('  '), /ASC_KEY_P8/)
})

// ---- The client ----------------------------------------------------------

test('the client signs each call, follows pages and reports Apple’s error, not the request', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    if (url.endsWith('/v1/apps?limit=1')) {
      return new Response(JSON.stringify({ data: [{ id: '1' }], links: { next: 'https://api.appstoreconnect.apple.com/v1/apps?cursor=2' } }))
    }
    if (url.includes('cursor=2')) return new Response(JSON.stringify({ data: [{ id: '2' }], links: {} }))
    return new Response(JSON.stringify({ errors: [{ code: 'ENTITY_ERROR', title: 'Bad', detail: 'nope' }] }), { status: 409 })
  }
  const client = createClient({ keyId: 'K', issuerId: 'I', privateKey: pem, fetchImpl })
  assert.deepEqual((await client.all('/v1/apps?limit=1')).map((a) => a.id), ['1', '2'])
  assert.match(calls[0].init.headers.Authorization, /^Bearer [\w-]+\.[\w-]+\.[\w-]+$/)
  await assert.rejects(client.patch('/v1/betaAppReviewDetails/9?x=1', { data: { attributes: { demoAccountPassword: 'secret' } } }), (e) => {
    assert.ok(e instanceof AscError)
    assert.equal(e.status, 409)
    assert.equal(e.message, 'PATCH /v1/betaAppReviewDetails/9 → 409 ENTITY_ERROR: Bad: nope')
    assert.doesNotMatch(e.message, /secret/)
    return true
  })
  assert.equal(calls.at(-1).init.headers['Content-Type'], 'application/json')
  assert.equal(errorText(500, null), '500')
})

// ---- Request bodies --------------------------------------------------------

test('a localization is created, updated with only what changed, or left alone', () => {
  const parent = { rel: 'app', type: 'apps', id: 'A1' }
  const attrs = { description: 'D', feedbackEmail: 'support@budgeer.com' }
  assert.deepEqual(localizationRequest('betaAppLocalizations', [], 'el', attrs, parent), {
    method: 'POST',
    path: '/v1/betaAppLocalizations',
    body: { data: { type: 'betaAppLocalizations', attributes: { locale: 'el', ...attrs }, relationships: { app: { data: { type: 'apps', id: 'A1' } } } } },
  })
  const existing = [{ id: 'L1', attributes: { locale: 'el', description: 'old', feedbackEmail: 'support@budgeer.com' } }]
  assert.deepEqual(localizationRequest('betaAppLocalizations', existing, 'el', attrs, parent), {
    method: 'PATCH',
    path: '/v1/betaAppLocalizations/L1',
    body: { data: { type: 'betaAppLocalizations', id: 'L1', attributes: { description: 'D' } } },
  })
  existing[0].attributes.description = 'D'
  assert.equal(localizationRequest('betaAppLocalizations', existing, 'el', attrs, parent), null)
  assert.deepEqual(changedAttributes({ a: null }, { a: undefined, b: null }), {})
})

test('the TestFlight and App Store texts come from the listing and the site', () => {
  const urls = appUrls(config, 'prod')
  const beta = betaAppLocalizationAttributes({ listing: listings['en-US'], app: 'prod', urls, feedbackEmail: config.feedbackEmail })
  assert.deepEqual(Object.keys(beta), ['description', 'feedbackEmail', 'marketingUrl', 'privacyPolicyUrl'])
  assert.equal(beta.privacyPolicyUrl, 'https://www.budgeer.com/privacy')
  const version = versionLocalizationAttributes({ listing: listings.el, app: 'dev', urls: appUrls(config, 'dev') })
  assert.equal(version.supportUrl, 'https://dev.budgeer.com/help')
  assert.equal(version.keywords, listings.el.dev.appStore.keywords)
  assert.equal(version.whatsNew, undefined, 'a first version takes no What’s New')
  assert.deepEqual(primaryCategoryBody('I1', 'FINANCE'), {
    data: { type: 'appInfos', id: 'I1', relationships: { primaryCategory: { data: { type: 'appCategories', id: 'FINANCE' } } } },
  })
})

test('the public group, its build and the beta submission', () => {
  assert.deepEqual(betaGroupCreateBody({ appId: 'A1', name: 'Public', publicLinkLimit: 1000 }).data, {
    type: 'betaGroups',
    attributes: { name: 'Public', feedbackEnabled: true, publicLinkEnabled: true, publicLinkLimitEnabled: true, publicLinkLimit: 1000 },
    relationships: { app: { data: { type: 'apps', id: 'A1' } } },
  })
  assert.deepEqual(betaGroupCreateBody({ appId: 'A1', name: 'Public', publicLinkLimit: 5, publicLink: false }).data.attributes,
    { name: 'Public', feedbackEnabled: true, publicLinkEnabled: false, publicLinkLimitEnabled: false })
  assert.deepEqual(betaGroupLinkPatch({ id: 'G', attributes: { publicLinkEnabled: false, publicLinkLimitEnabled: true, publicLinkLimit: 1000, feedbackEnabled: true } }, 1000),
    { data: { type: 'betaGroups', id: 'G', attributes: { publicLinkEnabled: true } } })
  assert.equal(betaGroupLinkPatch({ id: 'G', attributes: { publicLinkEnabled: true, publicLinkLimitEnabled: true, publicLinkLimit: 100, feedbackEnabled: true } }, 100), null)
  assert.deepEqual(buildsLinkBody(['B1']), { data: [{ type: 'builds', id: 'B1' }] })
  assert.deepEqual(betaSubmissionBody('B1'), { data: { type: 'betaAppReviewSubmissions', relationships: { build: { data: { type: 'builds', id: 'B1' } } } } })
  assert.equal(submissionAction('READY_FOR_BETA_SUBMISSION'), 'submit')
  assert.equal(submissionAction('WAITING_FOR_BETA_REVIEW'), 'already')
  assert.equal(submissionAction('BETA_APPROVED'), 'already')
  assert.equal(submissionAction('PROCESSING_EXCEPTION'), 'cannot')
  assert.equal(submissionAction(undefined), 'cannot')
})

test('the newest valid build, the version and the app info being prepared', () => {
  const builds = [
    { id: 'old', attributes: { processingState: 'VALID', expired: false, uploadedDate: '2026-09-01T10:00:00Z' } },
    { id: 'new', attributes: { processingState: 'VALID', expired: false, uploadedDate: '2026-09-30T10:00:00Z' } },
    { id: 'gone', attributes: { processingState: 'VALID', expired: true, uploadedDate: '2026-10-01T10:00:00Z' } },
    { id: 'busy', attributes: { processingState: 'PROCESSING', expired: false, uploadedDate: '2026-10-01T11:00:00Z' } },
  ]
  assert.equal(latestValidBuild(builds).id, 'new')
  assert.equal(latestValidBuild([]), null)
  const versions = [
    { id: 'live', attributes: { platform: 'IOS', appVersionState: 'READY_FOR_DISTRIBUTION' } },
    { id: 'next', attributes: { platform: 'IOS', appStoreState: 'PREPARE_FOR_SUBMISSION' } },
  ]
  assert.equal(editableVersion(versions).id, 'next')
  assert.equal(editableVersion([versions[0]]), null)
  assert.equal(editableVersion([{ id: 'r', attributes: { platform: 'IOS', appVersionState: 'REJECTED' } }]).id, 'r')
  assert.equal(editableAppInfo([{ id: 'a', attributes: { state: 'READY_FOR_DISTRIBUTION' } }, { id: 'b', attributes: { state: 'PREPARE_FOR_SUBMISSION' } }]).id, 'b')
  assert.equal(editableAppInfo([{ id: 'a', attributes: { appStoreState: 'READY_FOR_DISTRIBUTION' } }]), null)
})

test('the age rating answers NONE and false to the questions the declaration has', () => {
  const current = { violenceRealistic: null, gambling: null, messagingAndChat: false, contests: 'NONE', kidsAgeBand: null }
  assert.deepEqual(ageRatingAttributes(current), { violenceRealistic: 'NONE', gambling: false })
  assert.deepEqual(ageRatingAttributes(current, { messagingAndChat: true }), { violenceRealistic: 'NONE', gambling: false, messagingAndChat: true })
  const all = ageRatingAttributes({})
  assert.equal(all.sexualContentOrNudity, 'NONE')
  assert.equal(all.unrestrictedWebAccess, false)
  assert.equal(Object.values(all).every((v) => v === 'NONE' || v === false), true)
  assert.deepEqual(ageRatingAttributes(current, config.ageRatingOverrides), { violenceRealistic: 'NONE', gambling: false })
})

// ---- Screenshots -----------------------------------------------------------

function fakePng(width, height) {
  const b = Buffer.alloc(33)
  Buffer.from('89504e470d0a1a0a', 'hex').copy(b, 0)
  b.writeUInt32BE(13, 8)
  b.write('IHDR', 12, 'ascii')
  b.writeUInt32BE(width, 16)
  b.writeUInt32BE(height, 20)
  return b
}

test('screenshot sizes map to Apple’s display types', () => {
  assert.deepEqual(pngSize(fakePng(1320, 2868)), { width: 1320, height: 2868 })
  assert.throws(() => pngSize(Buffer.from('not a png at all, really not')), /not a PNG/)
  assert.equal(displayTypeFor(1320, 2868), 'APP_IPHONE_67')
  assert.equal(displayTypeFor(1290, 2796), 'APP_IPHONE_67')
  assert.equal(displayTypeFor(2796, 1290), 'APP_IPHONE_67')
  assert.equal(displayTypeFor(1284, 2778), 'APP_IPHONE_65')
  assert.equal(displayTypeFor(390, 844), null)
})

test('a locale folder is read in name order; a missing one means no screenshots', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'asc-shots-'))
  assert.deepEqual(localScreenshots('el', dir), {})
  mkdirSync(path.join(dir, 'el'))
  writeFileSync(path.join(dir, 'el', '02-split.png'), fakePng(1290, 2796))
  writeFileSync(path.join(dir, 'el', '01-home.png'), fakePng(1290, 2796))
  writeFileSync(path.join(dir, 'el', 'notes.txt'), 'ignored')
  const groups = localScreenshots('el', dir)
  assert.deepEqual(Object.keys(groups), ['APP_IPHONE_67'])
  assert.deepEqual(groups.APP_IPHONE_67.map((f) => f.fileName), ['01-home.png', '02-split.png'])
  assert.equal(groups.APP_IPHONE_67[0].checksum, md5(fakePng(1290, 2796)))
  writeFileSync(path.join(dir, 'el', '03-small.png'), fakePng(390, 844))
  assert.throws(() => localScreenshots('el', dir), /03-small\.png is 390×844/)
})

test('the app’s primary language (en-GB) takes the English set; a folder of its own wins', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'asc-shots-'))
  for (const locale of ['en-US', 'el']) {
    mkdirSync(path.join(dir, locale))
    writeFileSync(path.join(dir, locale, `1-${locale}.png`), fakePng(1320, 2868))
  }
  assert.equal(screenshotFolder('en-GB', dir), 'en-US')
  assert.equal(screenshotFolder('el-GR', dir), 'el')
  assert.equal(screenshotFolder('en-US', dir), 'en-US')
  assert.deepEqual(localScreenshots('en-GB', dir).APP_IPHONE_67.map((f) => f.fileName), ['1-en-US.png'])
  mkdirSync(path.join(dir, 'en-GB'))
  writeFileSync(path.join(dir, 'en-GB', '1-en-GB.png'), fakePng(1320, 2868))
  assert.equal(screenshotFolder('en-GB', dir), 'en-GB')
  assert.deepEqual(localScreenshots('en-GB', dir).APP_IPHONE_67.map((f) => f.fileName), ['1-en-GB.png'])
})

test('a set is kept only when it holds the same files in order', () => {
  const local = [{ fileName: 'a.png', checksum: 'x' }, { fileName: 'b.png', checksum: 'y' }]
  const remote = (pairs, state = 'COMPLETE') => pairs.map(([fileName, sourceFileChecksum]) => ({ attributes: { fileName, sourceFileChecksum, assetDeliveryState: { state } } }))
  assert.equal(screenshotPlan(local, remote([['a.png', 'x'], ['b.png', 'y']])), 'keep')
  assert.equal(screenshotPlan(local, remote([['b.png', 'y'], ['a.png', 'x']])), 'replace')
  assert.equal(screenshotPlan(local, remote([['a.png', 'x'], ['b.png', 'changed']])), 'replace')
  assert.equal(screenshotPlan(local, remote([['a.png', 'x']])), 'replace')
  assert.equal(screenshotPlan(local, remote([['a.png', 'x'], ['b.png', 'y']], 'FAILED')), 'replace')
})

test('the reservation, the byte ranges and the commit', () => {
  const file = { fileName: '01.png', fileSize: 10, checksum: 'abc' }
  assert.deepEqual(reserveBody('S1', file), {
    data: { type: 'appScreenshots', attributes: { fileName: '01.png', fileSize: 10 }, relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: 'S1' } } } },
  })
  const bytes = Buffer.from('0123456789')
  const reqs = uploadRequests([
    { method: 'PUT', url: 'https://u/1', offset: 0, length: 6, requestHeaders: [{ name: 'Content-Type', value: 'image/png' }] },
    { method: 'PUT', url: 'https://u/2', offset: 6, length: 4 },
  ], bytes)
  assert.deepEqual(reqs.map((r) => [r.url, r.body.toString(), r.headers]), [
    ['https://u/1', '012345', { 'Content-Type': 'image/png' }],
    ['https://u/2', '6789', {}],
  ])
  assert.deepEqual(commitBody('X', 'abc'), { data: { type: 'appScreenshots', id: 'X', attributes: { uploaded: true, sourceFileChecksum: 'abc' } } })
})

// ---- The script's inputs ---------------------------------------------------

test('the arguments and the app version', () => {
  assert.deepEqual(parseArgs(['--app', 'dev']), { app: 'dev', submit: false })
  assert.deepEqual(parseArgs(['--app', 'prod', '--submit', 'true']), { app: 'prod', submit: true })
  assert.deepEqual(parseArgs(['--app', 'prod', '--submit', 'false']), { app: 'prod', submit: false })
  assert.deepEqual(parseArgs(['--app', 'prod', '--submit']), { app: 'prod', submit: true })
  assert.throws(() => parseArgs(['--app', 'staging']), /--app dev or --app prod/)
  assert.match(marketingVersion(read('ios/Budgeer/project.yml')), /^\d+\.\d+(\.\d+)?$/)
  assert.equal(marketingVersion('MARKETING_VERSION: "1.2.0"'), '1.2.0')
})

test('the workflow passes every secret under its own name and never echoes one', () => {
  const yml = read('.github/workflows/ios-store-info.yml')
  for (const app of APPS) {
    for (const name of requiredSecrets(app)) assert.match(yml, new RegExp(`${name}: \\$\\{\\{ secrets\\.${name} \\}\\}`), name)
  }
  assert.doesNotMatch(yml, /echo .*secrets\./)
  assert.match(yml, /node scripts\/asc\/store-info\.mjs --app "\$\{\{ inputs\.app \}\}" --submit "\$\{\{ inputs\.submit \}\}"/)
  assert.ok(length(config.copyright) > 0)
})

test('the app\'s primary language gets texts too: English for any English, Greek for Greek', () => {
  const listings = { 'en-US': { n: 'en' }, el: { n: 'el' } }
  assert.equal(withPrimaryLocale(listings, 'en-US'), listings)
  assert.deepEqual(Object.keys(withPrimaryLocale(listings, 'en-GB')), ['en-GB', 'en-US', 'el'])
  assert.equal(withPrimaryLocale(listings, 'en-GB')['en-GB'].n, 'en')
  assert.equal(withPrimaryLocale(listings, 'el-GR')['el-GR'].n, 'el')
  assert.equal(withPrimaryLocale(listings, undefined), listings)
})

test('the reviewer account: the app\'s project, the sign-up the website sends, what a sign-in means', () => {
  const dev = readFileSync(new URL('../ios/Budgeer/Config/Dev.xcconfig', import.meta.url), 'utf8')
  const { url, anonKey } = supabaseFromXcconfig(dev)
  assert.equal(url, 'https://ctvdljzybbujuywppixo.supabase.co')
  assert.ok(anonKey.length > 20)
  assert.equal(supabaseFromXcconfig(readFileSync(new URL('../ios/Budgeer/Config/Prod.xcconfig', import.meta.url), 'utf8')).url,
    'https://tuxfpylowcxazinqtrzx.supabase.co')
  const versions = legalVersions(readFileSync(new URL('../supabase/functions/_shared/legal.ts', import.meta.url), 'utf8'))
  assert.deepEqual(signUpBody({ email: 'r@x.test', password: 'p w', versions }), {
    email: 'r@x.test', password: 'p w', data: { accepted_privacy: versions.privacy, accepted_terms: versions.terms },
  })
  assert.equal(signInState(200, {}), 'ready')
  assert.equal(signInState(400, { error_code: 'email_not_confirmed', msg: 'Email not confirmed' }), 'unconfirmed')
  assert.equal(signInState(400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' }), 'missing')
})

test('a TestFlight run frees only the development certificates earlier runs made', () => {
  const cert = (id, certificateType, name) => ({ id, attributes: { certificateType, name, displayName: name } })
  const list = [
    cert('a', 'DEVELOPMENT', 'Apple Development: Created via API (Z9KGWP5G82)'),
    cert('b', 'IOS_DEVELOPMENT', 'iOS Development: Created via API'),
    cert('c', 'DEVELOPMENT', 'Apple Development: Chrysovalantis Psilos (ABCDE12345)'),
    cert('d', 'DISTRIBUTION', 'Apple Distribution: Created via API'),
    cert('e', 'IOS_DISTRIBUTION', 'iOS Distribution: Budgeer'),
  ]
  assert.deepEqual(runCertificates(list).map((c) => c.id), ['a', 'b'])
})
