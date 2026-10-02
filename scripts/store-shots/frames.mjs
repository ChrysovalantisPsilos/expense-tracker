// The App Store pictures: which app screen each frame shows, in what order,
// with which caption, and where the framed PNG goes, for the iPhone and the
// iPad. The screens are the iOS snapshot tests' "store-<shot>-<lang>.png"
// (SnapshotTests+Store.swift) and "store-ipad-<shot>-<lang>.png"
// (SnapshotTests+iPad.swift); the captions, the same for both, are
// ios/store/captions.<lang>.json; build.mjs frames them.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
export const STORE_DIR = path.join(ROOT, 'ios/store')

// Each device's set: the store's size (scripts/asc/screenshots.mjs's display
// type), the snapshot's size, the snapshots' prefix and the folder it goes in.
export const DEVICES = {
  // The 6.9" iPhone (APP_IPHONE_67); the snapshots are 402×874 points at 3x.
  iphone: {
    size: { width: 1320, height: 2868 }, shot: { width: 1206, height: 2622 },
    prefix: 'store-', folder: 'screenshots', frame: 'phone',
  },
  // The 13" iPad in portrait (APP_IPAD_PRO_3GEN_129); the snapshots are an
  // iPad Pro 13-inch's 1032×1376 points at 2x, the store's size itself.
  ipad: {
    size: { width: 2064, height: 2752 }, shot: { width: 2064, height: 2752 },
    prefix: 'store-ipad-', folder: 'screenshots-ipad', frame: 'tablet',
  },
}

// The iPhone's, as most callers want them.
export const SIZE = DEVICES.iphone.size
export const SHOT = DEVICES.iphone.shot

// Frame order is the store's order (the file names sort that way).
export const FRAMES = [
  { id: '1-home', shot: 'home' },
  { id: '2-activity', shot: 'activity' },
  { id: '3-add-split', shot: 'add-group' },
  { id: '4-group', shot: 'group' },
  { id: '5-budgets', shot: 'budgets' },
  { id: '6-savings', shot: 'savings' },
]

// Each picture language and the store folder (an App Store Connect locale)
// its set goes in; the app's primary language (en-GB) reuses en-US's set.
export const LANGS = { en: 'en-US', el: 'el' }

export const MAX_TITLE = 34
export const MAX_SUB = 60

export const shotFile = (dir, frame, lang, device = 'iphone') =>
  path.join(dir, `${DEVICES[device].prefix}${frame.shot}-${lang}.png`)
export const outputFile = (lang, frame, device = 'iphone') =>
  path.join(STORE_DIR, DEVICES[device].folder, LANGS[lang], `${frame.id}.png`)

// Which devices' sets a snapshots folder holds: every screen of a device
// (framed), none (skipped: an artifact from before the iPad's), or only some
// (each missing one is a problem); a folder with neither set is one too.
export function shotSets(dir, exists) {
  const devices = []
  const problems = []
  for (const device of Object.keys(DEVICES)) {
    const files = Object.keys(LANGS).flatMap((lang) => FRAMES.map((frame) => shotFile(dir, frame, lang, device)))
    const missing = files.filter((file) => !exists(file))
    if (!missing.length) devices.push(device)
    else if (missing.length < files.length) problems.push(...missing.map((file) => `missing ${file}`))
  }
  if (!devices.length && !problems.length) problems.push(`no store snapshots in ${dir}`)
  return { devices, problems }
}

export function readCaptions(lang) {
  return JSON.parse(readFileSync(path.join(STORE_DIR, `captions.${lang}.json`), 'utf8'))
}

// A headline as text runs: "Add it, *split it*" → the second run highlighted.
export function headlineParts(title) {
  return title.split(/(\*[^*]+\*)/).filter(Boolean).map((part) => (
    part.startsWith('*') ? { text: part.slice(1, -1), em: true } : { text: part, em: false }
  ))
}

// What's wrong with a language's captions: every frame has a headline with
// exactly one highlighted phrase and a subline, both short; nothing extra.
export function captionProblems(lang, captions) {
  const problems = []
  if (captions.locale !== LANGS[lang]) problems.push(`${lang}: locale should be ${LANGS[lang]}`)
  const frames = captions.frames ?? {}
  for (const id of Object.keys(frames)) if (!FRAMES.some((f) => f.id === id)) problems.push(`${lang}: unknown frame ${id}`)
  for (const { id } of FRAMES) {
    const c = frames[id]
    if (!c?.title || !c?.sub) { problems.push(`${lang} ${id}: needs a title and a sub`); continue }
    const parts = headlineParts(c.title)
    if (parts.filter((p) => p.em).length !== 1 || /\*/.test(parts.map((p) => p.text).join(''))) {
      problems.push(`${lang} ${id}: the title needs exactly one *highlighted* phrase`)
    }
    const plain = parts.map((p) => p.text).join('')
    if (plain.length > MAX_TITLE) problems.push(`${lang} ${id}: title over ${MAX_TITLE} characters`)
    if (c.sub.length > MAX_SUB) problems.push(`${lang} ${id}: sub over ${MAX_SUB} characters`)
  }
  return problems
}
