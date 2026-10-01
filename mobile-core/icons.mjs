// The native app's category badges use the web's own Lucide icons, drawn
// from the same package (lucide-react) the web renders them with:
//   npm run ios:icons  →  ios/Budgeer/Budgeer/Resources/Icons.xcassets
// One template image set per category icon key of the web's registry
// (src/shared/lib/icons.jsx), "category-<key>", holding its SVG (24×24,
// stroke 2, round caps and joins, as Lucide draws it), so SwiftUI tints it
// like the web's `currentColor` and a category's badge on the phone is the
// icon it has on the web, chosen by the key the core already resolved
// (categoryLook). Everything else in the app is an SF Symbol.
// The files are committed (they change only with the registry or Lucide's
// version); test/iosIcons.test.js fails when they no longer match.
// Lucide is ISC-licensed: its licence is copied beside the icons.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as lucide from 'lucide-react'

export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
export const CATALOG = 'ios/Budgeer/Budgeer/Resources/Icons.xcassets'
// The category registry, read from the web's source: { key: 'Component' }.
export async function categoryIcons() {
  const src = await readFile(resolve(ROOT, 'src/shared/lib/icons.jsx'), 'utf8')
  const block = /const CATEGORY_ICONS = \{([\s\S]*?)\n\}/.exec(src)
  if (!block) throw new Error('CATEGORY_ICONS not found in src/shared/lib/icons.jsx')
  const out = {}
  for (const m of block[1].matchAll(/^\s*'?([\w-]+)'?:\s*(\w+),/gm)) out[m[1]] = m[2]
  // categoryIcon's fallback for an unknown key.
  out.fallback = /\?\? (\w+)\s*\n\}/.exec(src)?.[1] ?? 'Tag'
  return out
}

// One icon's SVG exactly as the web renders it (lucide-react), in black so
// the template image takes its tint from SwiftUI.
export function svgFor(component, strokeWidth = 2) {
  const Icon = lucide[component]
  if (!Icon) throw new Error(`lucide-react has no icon ${component}`)
  return renderToStaticMarkup(createElement(Icon, { size: 24, strokeWidth, color: '#000000' }))
    .replace(/ class="[^"]*"/g, '')
    + '\n'
}

const json = (value) => JSON.stringify(value, null, 2) + '\n'
const imageSet = (file) => json({
  images: [{ filename: file, idiom: 'universal' }],
  info: { author: 'xcode', version: 1 },
  properties: { 'preserves-vector-representation': true, 'template-rendering-intent': 'template' },
})

// Every file the generator writes: { 'relative/path': 'content' }.
export async function iconFiles() {
  const files = {}
  files[`${CATALOG}/Contents.json`] = json({ info: { author: 'xcode', version: 1 } })
  const license = await readFile(resolve(ROOT, 'node_modules/lucide-react/LICENSE'), 'utf8')
  files['ios/Budgeer/Budgeer/Resources/LUCIDE-LICENSE.txt'] = license
  const add = (asset, component) => {
    const dir = `${CATALOG}/${asset}.imageset`
    files[`${dir}/Contents.json`] = imageSet(`${asset}.svg`)
    files[`${dir}/${asset}.svg`] = svgFor(component)
  }
  const categories = await categoryIcons()
  for (const [key, component] of Object.entries(categories)) add(`category-${key}`, component)
  return files
}

async function main() {
  const files = await iconFiles()
  await rm(resolve(ROOT, CATALOG), { recursive: true, force: true })
  for (const [path, content] of Object.entries(files)) {
    const full = resolve(ROOT, path)
    await mkdir(resolve(full, '..'), { recursive: true })
    await writeFile(full, content)
  }
  console.log(`${Object.keys(files).filter((f) => f.endsWith('.svg')).length} icons → ${CATALOG}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
