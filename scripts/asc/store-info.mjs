// Fills in App Store Connect for one of the two iOS apps, through the App
// Store Connect API: TestFlight's test information, review details, the
// newest build's What to Test, the "Public" external group (public link) and,
// with --submit, the build's beta review submission; then the App Store page
// (name, subtitle, category, age rating, the version's texts, copyright, the
// review details, and screenshots when ios/store/screenshots/<locale>/
// exists). It never submits the App Store version. Every step reads first and
// writes only what differs, so a run can be repeated.
//
// Run by .github/workflows/ios-store-info.yml:
//   node scripts/asc/store-info.mjs --app dev|prod [--submit]
// The secrets come in as environment variables (listing.mjs requiredSecrets);
// none is ever printed. The texts are ios/store/*.json.
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { AscError, createClient } from './api.mjs'
import { APPS, appUrls, listingProblems, loadStore, missingSecrets, requiredSecrets, reviewSecrets, withPrimaryLocale } from './listing.mjs'
import {
  ageRatingAttributes, appInfoLocalizationAttributes, betaAppLocalizationAttributes, betaGroupCreateBody,
  betaGroupLinkPatch, betaSubmissionBody, buildsLinkBody, changedAttributes, editableAppInfo, editableVersion,
  latestValidBuild, localizationRequest, primaryCategoryBody, resourceBody, reviewDetailAttributes,
  submissionAction, versionLocalizationAttributes,
} from './requests.mjs'
import { localScreenshots, syncScreenshots } from './screenshots.mjs'

const log = (msg) => console.log(msg)
const warn = (msg) => console.log(process.env.GITHUB_ACTIONS ? `::warning::${msg}` : `Warning: ${msg}`)

export function parseArgs(argv) {
  const app = argv.includes('--app') ? argv[argv.indexOf('--app') + 1] : null
  if (!APPS.includes(app)) throw new Error('Pass --app dev or --app prod.')
  const submitAt = argv.indexOf('--submit')
  const submit = submitAt >= 0 && argv[submitAt + 1] !== 'false'
  return { app, submit }
}

// The app's version in the Xcode project (a new App Store version's number).
export function marketingVersion(projectYml) {
  const m = /MARKETING_VERSION:\s*"?([0-9.]+)"?/.exec(projectYml)
  return m ? m[1] : null
}

async function send(client, req, what) {
  if (!req) return false
  await client[req.method.toLowerCase()](req.path, req.body)
  log(`${what}: ${req.method === 'POST' ? 'added' : 'updated'}`)
  return true
}

async function findApp(client, bundleId) {
  const apps = await client.all(`/v1/apps?filter[bundleId]=${encodeURIComponent(bundleId)}&limit=200`)
  const app = apps.find((a) => a.attributes?.bundleId === bundleId)
  if (!app) throw new Error(`No App Store Connect app with bundle id ${bundleId}: create the app record first (Apps → +).`)
  return app
}

async function testFlight({ client, app, appKey, config, listings, secrets, submit }) {
  const urls = appUrls(config, appKey)

  const betaLocs = await client.all(`/v1/apps/${app.id}/betaAppLocalizations`)
  for (const [locale, listing] of Object.entries(listings)) {
    const attrs = betaAppLocalizationAttributes({ listing, app: appKey, urls, feedbackEmail: config.feedbackEmail })
    const req = localizationRequest('betaAppLocalizations', betaLocs, locale, attrs, { rel: 'app', type: 'apps', id: app.id })
    if (!(await send(client, req, `TestFlight test information (${locale})`))) log(`TestFlight test information (${locale}): up to date`)
  }

  const detail = (await client.get(`/v1/apps/${app.id}/betaAppReviewDetail`)).data
  const reviewChanges = changedAttributes(detail.attributes, reviewDetailAttributes({ config, app: appKey, secrets }))
  if (Object.keys(reviewChanges).length) {
    await client.patch(`/v1/betaAppReviewDetails/${detail.id}`, resourceBody('betaAppReviewDetails', { id: detail.id, attributes: reviewChanges }))
    log('TestFlight beta review details: updated')
  } else log('TestFlight beta review details: up to date')

  const group = await publicGroup({ client, app, appKey, config })

  const builds = await client.all(`/v1/builds?filter[app]=${app.id}&filter[processingState]=VALID&filter[expired]=false&sort=-uploadedDate&limit=20`)
  const build = latestValidBuild(builds)
  if (!build) {
    warn('No processed (VALID) build yet: run ios-testflight first, then this again for What to Test, the group and the submission.')
    return
  }
  log(`Newest valid build: ${build.attributes.version} (uploaded ${build.attributes.uploadedDate})`)

  const buildLocs = await client.all(`/v1/builds/${build.id}/betaBuildLocalizations`)
  for (const [locale, listing] of Object.entries(listings)) {
    const req = localizationRequest('betaBuildLocalizations', buildLocs, locale, { whatsNew: listing[appKey].testFlight.whatToTest },
      { rel: 'build', type: 'builds', id: build.id })
    if (!(await send(client, req, `What to Test (${locale})`))) log(`What to Test (${locale}): up to date`)
  }

  const inGroup = await client.all(`/v1/betaGroups/${group.id}/builds?limit=200`)
  if (inGroup.some((b) => b.id === build.id)) log(`Group "${config.betaGroup}": has the build already`)
  else {
    await client.post(`/v1/betaGroups/${group.id}/relationships/builds`, buildsLinkBody([build.id]))
    log(`Group "${config.betaGroup}": build added`)
  }

  if (submit) {
    const beta = (await client.get(`/v1/builds/${build.id}/buildBetaDetail`)).data
    const state = beta?.attributes?.externalBuildState
    const action = submissionAction(state)
    if (action === 'submit') {
      try {
        await client.post('/v1/betaAppReviewSubmissions', betaSubmissionBody(build.id))
        log('Beta App Review: build submitted')
      } catch (e) {
        // One build per version in review at a time: this one goes once the
        // earlier one is through (run this again then).
        if (!(e instanceof AscError) || !/ANOTHER_BUILD_IN_REVIEW/.test(e.message)) throw e
        warn('Beta App Review: an earlier build of this version is still in review; run this again once it is through.')
      }
    } else if (action === 'already') log(`Beta App Review: nothing to do (${state})`)
    else warn(`Beta App Review: this build can't be submitted now (${state ?? 'unknown state'}).`)
  } else log('Beta App Review: not submitted (run with submit to send it)')

  const fresh = (await client.get(`/v1/betaGroups/${group.id}`)).data
  if (fresh.attributes?.publicLinkEnabled && fresh.attributes?.publicLink) log(`Public link: ${fresh.attributes.publicLink}`)
  else log('Public link: not live yet (Apple turns it on once a build passes Beta App Review; run this again then).')
}

async function publicGroup({ client, app, config, appKey }) {
  const limit = config.apps[appKey].publicLinkLimit
  const groups = await client.all(`/v1/apps/${app.id}/betaGroups`)
  let group = groups.find((g) => g.attributes?.name === config.betaGroup && !g.attributes?.isInternalGroup)
  if (!group) {
    try {
      group = (await client.post('/v1/betaGroups', betaGroupCreateBody({ appId: app.id, name: config.betaGroup, publicLinkLimit: limit }))).data
      log(`Group "${config.betaGroup}": created with a public link`)
    } catch (e) {
      if (!(e instanceof AscError) || e.status !== 409) throw e
      group = (await client.post('/v1/betaGroups', betaGroupCreateBody({ appId: app.id, name: config.betaGroup, publicLinkLimit: limit, publicLink: false }))).data
      warn(`Group "${config.betaGroup}": created; its public link can't be turned on yet (${e.message}). Run this again after Beta App Review.`)
    }
    return group
  }
  const patch = betaGroupLinkPatch(group, limit)
  if (!patch) {
    log(`Group "${config.betaGroup}": public link set`)
    return group
  }
  try {
    await client.patch(`/v1/betaGroups/${group.id}`, patch)
    log(`Group "${config.betaGroup}": public link turned on (limit ${limit})`)
  } catch (e) {
    if (!(e instanceof AscError) || e.status !== 409) throw e
    warn(`Group "${config.betaGroup}": public link can't be turned on yet (${e.message}). Run this again after Beta App Review.`)
  }
  return group
}

async function appStore({ client, app, appKey, config, listings, secrets }) {
  const urls = appUrls(config, appKey)

  const rights = changedAttributes(app.attributes, { contentRightsDeclaration: config.contentRightsDeclaration })
  if (Object.keys(rights).length) {
    await client.patch(`/v1/apps/${app.id}`, resourceBody('apps', { id: app.id, attributes: rights }))
    log('Content rights: set')
  }

  const info = editableAppInfo(await client.all(`/v1/apps/${app.id}/appInfos`))
  if (!info) warn('App information is locked (in review or live): name, subtitle, category and age rating skipped.')
  else {
    const category = (await client.get(`/v1/appInfos/${info.id}/relationships/primaryCategory`))?.data
    if (category?.id !== config.primaryCategory) {
      await client.patch(`/v1/appInfos/${info.id}`, primaryCategoryBody(info.id, config.primaryCategory))
      log(`Primary category: ${config.primaryCategory}`)
    } else log(`Primary category: ${config.primaryCategory} already`)

    const infoLocs = await client.all(`/v1/appInfos/${info.id}/appInfoLocalizations`)
    for (const [locale, listing] of Object.entries(listings)) {
      const attrs = appInfoLocalizationAttributes({ config, listing, app: appKey, urls })
      const req = localizationRequest('appInfoLocalizations', infoLocs, locale, attrs, { rel: 'appInfo', type: 'appInfos', id: info.id })
      if (!(await send(client, req, `App name and subtitle (${locale})`))) log(`App name and subtitle (${locale}): up to date`)
    }

    const rating = (await client.get(`/v1/appInfos/${info.id}/ageRatingDeclaration`)).data
    const answers = ageRatingAttributes(rating.attributes, config.ageRatingOverrides)
    if (Object.keys(answers).length) {
      await client.patch(`/v1/ageRatingDeclarations/${rating.id}`, resourceBody('ageRatingDeclarations', { id: rating.id, attributes: answers }))
      log('Age rating: answered')
    } else log('Age rating: up to date')
  }

  const versions = await client.all(`/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&limit=50`)
  let version = editableVersion(versions)
  if (!version && versions.length === 0) {
    const yml = readFileSync(fileURLToPath(new URL('../../ios/Budgeer/project.yml', import.meta.url)), 'utf8')
    const versionString = marketingVersion(yml)
    version = (await client.post('/v1/appStoreVersions', resourceBody('appStoreVersions', {
      attributes: { platform: 'IOS', versionString, copyright: config.copyright },
      relationships: { app: { data: { type: 'apps', id: app.id } } },
    }))).data
    log(`App Store version ${versionString}: created`)
  }
  if (!version) {
    warn('No App Store version is being prepared (add one in App Store Connect): the version texts were skipped.')
    return
  }
  log(`App Store version ${version.attributes.versionString}`)

  const copyright = changedAttributes(version.attributes, { copyright: config.copyright })
  if (Object.keys(copyright).length) {
    await client.patch(`/v1/appStoreVersions/${version.id}`, resourceBody('appStoreVersions', { id: version.id, attributes: copyright }))
    log('Copyright: set')
  }

  const locPath = `/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`
  const versionLocs = await client.all(locPath)
  for (const [locale, listing] of Object.entries(listings)) {
    const attrs = versionLocalizationAttributes({ listing, app: appKey, urls })
    const req = localizationRequest('appStoreVersionLocalizations', versionLocs, locale, attrs,
      { rel: 'appStoreVersion', type: 'appStoreVersions', id: version.id })
    if (!(await send(client, req, `App Store description and keywords (${locale})`))) log(`App Store description and keywords (${locale}): up to date`)
  }

  const review = await client.get(`/v1/appStoreVersions/${version.id}/appStoreReviewDetail`).catch((e) => {
    if (e instanceof AscError && e.status === 404) return null
    throw e
  })
  const wanted = reviewDetailAttributes({ config, app: appKey, secrets })
  if (!review?.data) {
    await client.post('/v1/appStoreReviewDetails', resourceBody('appStoreReviewDetails', {
      attributes: wanted,
      relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } },
    }))
    log('App Review details: added')
  } else {
    const changes = changedAttributes(review.data.attributes, wanted)
    if (Object.keys(changes).length) {
      await client.patch(`/v1/appStoreReviewDetails/${review.data.id}`, resourceBody('appStoreReviewDetails', { id: review.data.id, attributes: changes }))
      log('App Review details: updated')
    } else log('App Review details: up to date')
  }

  const withShots = Object.keys(listings).map((locale) => [locale, localScreenshots(locale)]).filter(([, g]) => Object.keys(g).length)
  if (!withShots.length) {
    log('Screenshots: none in ios/store/screenshots/<locale>/ yet, skipped')
    return
  }
  const current = await client.all(locPath)
  for (const [locale, groups] of withShots) {
    const loc = current.find((l) => l.attributes?.locale === locale)
    await syncScreenshots({ client, localizationId: loc.id, locale, groups, log })
  }
}

async function main() {
  const { app: appKey, submit } = parseArgs(process.argv.slice(2))
  const { config, listings: files } = loadStore()
  const problems = listingProblems({ config, listings: files })
  if (problems.length) throw new Error(`ios/store has problems:\n- ${problems.join('\n- ')}`)

  const missing = missingSecrets(appKey, process.env)
  if (missing.length) {
    throw new Error(`Missing repository secrets: ${missing.join(', ')} (Settings → Secrets and variables → Actions).`)
  }
  // The runner hides secrets already; a trimmed copy is hidden too.
  if (process.env.GITHUB_ACTIONS) {
    for (const name of requiredSecrets(appKey)) {
      for (const line of String(process.env[name]).split('\n')) if (line.trim()) console.log(`::add-mask::${line.trim()}`)
    }
  }

  const secrets = reviewSecrets(appKey, process.env)
  const client = createClient({ keyId: process.env.ASC_KEY_ID.trim(), issuerId: process.env.ASC_ISSUER_ID.trim(), privateKey: process.env.ASC_KEY_P8 })
  const app = await findApp(client, config.apps[appKey].bundleId)
  log(`App: ${app.attributes.name} (${config.apps[appKey].bundleId}), primary language ${app.attributes.primaryLocale}`)
  const listings = withPrimaryLocale(files, app.attributes.primaryLocale)

  log('— TestFlight')
  await testFlight({ client, app, appKey, config, listings, secrets, submit })
  log('— App Store page (not submitted)')
  await appStore({ client, app, appKey, config, listings, secrets })
  log('Done.')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => {
    console.error(process.env.GITHUB_ACTIONS ? `::error::${e.message}` : e.message)
    process.exit(1)
  })
}
