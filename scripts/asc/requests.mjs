// The App Store Connect request bodies and the choices between existing
// resources, as pure functions (tested in test/ascStoreInfo.test.js without a
// network). store-info.mjs sends them.

const rel = (type, id) => ({ data: { type, id } })

// One JSON:API body: create (no id, with relationships) or update (id).
export function resourceBody(type, { id, attributes, relationships } = {}) {
  const data = { type }
  if (id) data.id = id
  if (attributes && Object.keys(attributes).length) data.attributes = attributes
  if (relationships) data.relationships = relationships
  return { data }
}

// Only what differs from `current` (undefined values dropped): an update
// that changes nothing is skipped.
export function changedAttributes(current, wanted) {
  const out = {}
  for (const [key, value] of Object.entries(wanted)) {
    if (value === undefined) continue
    if (JSON.stringify(current?.[key] ?? null) !== JSON.stringify(value)) out[key] = value
  }
  return out
}

// Create the localization when the locale has none, update it when its
// texts differ, else nothing. `parent` = { rel: 'app', type: 'apps', id }.
export function localizationRequest(type, existing, locale, attributes, parent) {
  const found = existing.find((l) => l.attributes?.locale === locale)
  if (!found) {
    return {
      method: 'POST',
      path: `/v1/${type}`,
      body: resourceBody(type, {
        attributes: { locale, ...attributes },
        relationships: { [parent.rel]: rel(parent.type, parent.id) },
      }),
    }
  }
  const changed = changedAttributes(found.attributes, attributes)
  if (!Object.keys(changed).length) return null
  return { method: 'PATCH', path: `/v1/${type}/${found.id}`, body: resourceBody(type, { id: found.id, attributes: changed }) }
}

// TestFlight's Test Information, per locale.
export function betaAppLocalizationAttributes({ listing, app, urls, feedbackEmail }) {
  return {
    description: listing[app].testFlight.description,
    feedbackEmail,
    marketingUrl: urls.marketing,
    privacyPolicyUrl: urls.privacyPolicy,
  }
}

// The contact and sign-in Apple's reviewers use (TestFlight and App Store
// review details share these fields).
export function reviewDetailAttributes({ config, app, secrets }) {
  return {
    contactFirstName: config.contact.firstName,
    contactLastName: config.contact.lastName,
    contactEmail: secrets.contactEmail,
    contactPhone: secrets.contactPhone,
    demoAccountRequired: true,
    demoAccountName: secrets.reviewEmail,
    demoAccountPassword: secrets.reviewPassword,
    notes: config.reviewNotes[app],
  }
}

export function betaGroupCreateBody({ appId, name, publicLinkLimit, publicLink = true }) {
  return resourceBody('betaGroups', {
    attributes: {
      name,
      feedbackEnabled: true,
      publicLinkEnabled: publicLink,
      publicLinkLimitEnabled: publicLink,
      ...(publicLink ? { publicLinkLimit } : {}),
    },
    relationships: { app: rel('apps', appId) },
  })
}

// What a group still needs for its public link (null when it has it).
export function betaGroupLinkPatch(group, publicLinkLimit) {
  const a = group.attributes ?? {}
  const wanted = { publicLinkEnabled: true, publicLinkLimitEnabled: true, publicLinkLimit, feedbackEnabled: true }
  const changed = changedAttributes(a, wanted)
  return Object.keys(changed).length ? resourceBody('betaGroups', { id: group.id, attributes: changed }) : null
}

export const buildsLinkBody = (buildIds) => ({ data: buildIds.map((id) => ({ type: 'builds', id })) })

export const betaSubmissionBody = (buildId) =>
  resourceBody('betaAppReviewSubmissions', { relationships: { build: rel('builds', buildId) } })

// A build's external TestFlight state → what a `submit` run does with it.
export function submissionAction(externalBuildState) {
  if (externalBuildState === 'READY_FOR_BETA_SUBMISSION') return 'submit'
  if (['WAITING_FOR_BETA_REVIEW', 'IN_BETA_REVIEW', 'BETA_APPROVED', 'IN_BETA_TESTING', 'READY_FOR_BETA_TESTING'].includes(externalBuildState)) {
    return 'already'
  }
  return 'cannot'
}

// The newest processed, unexpired build (the API sorts; this is the guard).
export function latestValidBuild(builds) {
  return builds
    .filter((b) => b.attributes?.processingState === 'VALID' && !b.attributes?.expired)
    .sort((x, y) => String(y.attributes.uploadedDate).localeCompare(String(x.attributes.uploadedDate)))[0] ?? null
}

// App Store states in which a version's or an app info's metadata can change.
export const EDITABLE_STATES = ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY']

const stateOf = (r) => r.attributes?.appVersionState ?? r.attributes?.appStoreState ?? r.attributes?.state ?? null

export function editableVersion(versions) {
  const ios = versions.filter((v) => (v.attributes?.platform ?? 'IOS') === 'IOS')
  return ios.find((v) => stateOf(v) === 'PREPARE_FOR_SUBMISSION')
    ?? ios.find((v) => EDITABLE_STATES.includes(stateOf(v)))
    ?? null
}

export function editableAppInfo(infos) {
  return infos.find((i) => stateOf(i) === 'PREPARE_FOR_SUBMISSION')
    ?? infos.find((i) => !['READY_FOR_DISTRIBUTION', 'REPLACED_WITH_NEW_INFO', 'ACCEPTED', 'IN_REVIEW', 'PENDING_RELEASE', 'WAITING_FOR_REVIEW'].includes(stateOf(i)))
    ?? null
}

export function appInfoLocalizationAttributes({ config, listing, app, urls }) {
  return {
    name: config.apps[app].name,
    subtitle: listing[app].appStore.subtitle,
    privacyPolicyUrl: urls.privacyPolicy,
  }
}

export function versionLocalizationAttributes({ listing, app, urls }) {
  const s = listing[app].appStore
  return {
    description: s.description,
    keywords: s.keywords,
    promotionalText: s.promotionalText,
    supportUrl: urls.support,
    marketingUrl: urls.marketing,
  }
}

export const primaryCategoryBody = (appInfoId, category) =>
  resourceBody('appInfos', { id: appInfoId, relationships: { primaryCategory: rel('appCategories', category) } })

// The age rating questionnaire: nothing objectionable, no capability that
// raises the rating. Enum answers are NONE, yes/no ones false.
export const AGE_RATING_NONE = [
  'alcoholTobaccoOrDrugUseOrReferences', 'contests', 'gamblingSimulated', 'gunsOrOtherWeapons',
  'horrorOrFearThemes', 'matureOrSuggestiveThemes', 'medicalOrTreatmentInformation',
  'profanityOrCrudeHumor', 'sexualContentGraphicAndNudity', 'sexualContentOrNudity',
  'violenceCartoonOrFantasy', 'violenceRealistic', 'violenceRealisticProlongedGraphicOrSadistic',
]
export const AGE_RATING_FALSE = [
  'advertising', 'ageAssurance', 'gambling', 'healthOrWellnessTopics', 'lootBox',
  'messagingAndChat', 'parentalControls', 'unrestrictedWebAccess', 'userGeneratedContent',
]

// The answers to send: only the questions the declaration has (the API
// rejects unknown ones, and its set changes), or all of them when the
// declaration came back without attributes. `overrides` wins.
export function ageRatingAttributes(current, overrides = {}) {
  const all = {
    ...Object.fromEntries(AGE_RATING_NONE.map((k) => [k, 'NONE'])),
    ...Object.fromEntries(AGE_RATING_FALSE.map((k) => [k, false])),
    ...overrides,
  }
  const known = current && Object.keys(current).some((k) => k in all)
  const wanted = known ? Object.fromEntries(Object.entries(all).filter(([k]) => k in current)) : all
  return changedAttributes(current, wanted)
}
