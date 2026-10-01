// The App Store pictures: which app screen each frame shows, in what order,
// with which caption, and where the framed PNG goes. The screens are the iOS
// snapshot tests' "store-<shot>-<lang>.png" (SnapshotTests+Store.swift); the
// captions are ios/store/captions.<lang>.json; build.mjs frames them.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
export const STORE_DIR = path.join(ROOT, 'ios/store')

// The 6.9" iPhone size (APP_IPHONE_67 in scripts/asc/screenshots.mjs).
export const SIZE = { width: 1320, height: 2868 }
// The snapshots: 402×874 points at 3x.
export const SHOT = { width: 1206, height: 2622 }

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

export const shotFile = (dir, frame, lang) => path.join(dir, `store-${frame.shot}-${lang}.png`)
export const outputFile = (lang, frame) => path.join(STORE_DIR, 'screenshots', LANGS[lang], `${frame.id}.png`)

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
