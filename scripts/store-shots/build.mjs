// Frames the App Store pictures from the iOS app's store snapshots:
//   npm run store:shots -- <snapshots dir>
// <snapshots dir> is the unzipped `snapshots` artifact of ios-app.yml (run by
// hand with "snapshots" ticked), holding store-<shot>-<en|el>.png and
// store-ipad-<shot>-<en|el>.png. Writes
// ios/store/screenshots/<en-US|el>/<frame>.png at 1320×2868, the size
// scripts/asc/screenshots.mjs uploads as APP_IPHONE_67, and
// ios/store/screenshots-ipad/<en-US|el>/<frame>.png at 2064×2752 (the iPad's
// screen in a tablet's frame, APP_IPAD_PRO_3GEN_129), with the same captions;
// a device none of whose snapshots are there is skipped. It stops with the
// list of anything that doesn't fit (a headline over two lines, text wider
// than the frame, a screen of the wrong size, a missing snapshot).
//
// Needs Playwright with Chromium (not a dependency of the app): the
// project's if installed, else the global one (`npm i -g playwright`).
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  DEVICES, FRAMES, LANGS, captionProblems, headlineParts, outputFile, readCaptions, shotFile, shotSets,
} from './frames.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')

// Each face the frame uses: Latin from Poppins / Nunito Sans, Greek from
// Manrope / Noto Sans (the app's own fallbacks, src/shared/ui/palette.js).
const FONTS = [
  ['Poppins', 'poppins', 'latin', 600], ['Poppins', 'poppins', 'latin', 700],
  ['Manrope', 'manrope', 'greek', 700], ['Manrope', 'manrope', 'greek', 800],
  ['Nunito Sans', 'nunito-sans', 'latin', 400], ['Nunito Sans', 'nunito-sans', 'latin', 600],
  ['Noto Sans', 'noto-sans', 'greek', 400], ['Noto Sans', 'noto-sans', 'greek', 600],
]
const GREEK = 'U+0370-03FF, U+1F00-1FFF'

function fontFaces() {
  return FONTS.map(([family, pkg, subset, weight]) => {
    const file = path.join(root, 'node_modules/@fontsource', pkg, 'files', `${pkg}-${subset}-${weight}-normal.woff2`)
    if (!existsSync(file)) throw new Error(`${file} is missing: run npm ci`)
    const range = subset === 'greek' ? `unicode-range: ${GREEK};` : ''
    return `@font-face { font-family: '${family}'; font-weight: ${weight}; src: url(${pathToFileURL(file).href}); ${range} }`
  }).join('\n')
}

async function playwright() {
  try {
    return await import('playwright')
  } catch {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()
    return createRequire(path.join(globalRoot, 'noop.js'))('playwright')
  }
}

async function main() {
  const dir = process.argv[2]
  if (!dir) throw new Error('usage: npm run store:shots -- <snapshots dir>')
  const shots = path.resolve(dir)

  const captions = Object.fromEntries(Object.keys(LANGS).map((lang) => [lang, readCaptions(lang)]))
  const sets = shotSets(shots, existsSync)
  const problems = [...Object.entries(captions).flatMap(([lang, c]) => captionProblems(lang, c)), ...sets.problems]
  if (problems.length) throw new Error(problems.join('\n'))

  const { chromium } = await playwright()
  const browser = await chromium.launch()
  const template = pathToFileURL(path.join(here, 'template.html')).href
  const faces = fontFaces()
  try {
    for (const device of sets.devices) {
      const { size, shot: shotSize, frame: kind } = DEVICES[device]
      const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 })
      for (const [lang, set] of Object.entries(captions)) {
        for (const frame of FRAMES) {
          const { title, sub } = set.frames[frame.id]
          await page.goto(template)
          await page.addStyleTag({ content: faces })
          const misfits = await page.evaluate((args) => globalThis.render(args), {
            lang, parts: headlineParts(title), sub, shot: pathToFileURL(shotFile(shots, frame, lang, device)).href, shotSize,
            device: kind,
          })
          const out = outputFile(lang, frame, device)
          if (misfits.length) {
            problems.push(...misfits.map((m) => `${path.relative(root, out)}: ${m}`))
            continue
          }
          mkdirSync(path.dirname(out), { recursive: true })
          await page.screenshot({ path: out })
          console.log(path.relative(root, out))
        }
      }
      await page.close()
    }
  } finally {
    await browser.close()
  }
  if (problems.length) throw new Error(`These don't fit:\n${problems.join('\n')}`)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
