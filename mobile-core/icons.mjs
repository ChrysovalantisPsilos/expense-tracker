// The native app's icons are the web's own Lucide icons, drawn from the same
// package (lucide-react) the web renders them with:
//   npm run ios:icons  →  ios/Budgeer/Budgeer/Resources/Icons.xcassets
//                         ios/Budgeer/Budgeer/Theme/Lucide.swift
// Each icon becomes a template image set holding its SVG (24×24, stroke 2,
// round caps and joins, as Lucide draws it), so SwiftUI tints it like the
// web's `currentColor`. Two families:
//   lucide-<name>     the icons the app's screens use (APP_ICONS), named in
//                     Swift by the generated `Lucide` enum;
//   category-<key>    one per category icon key, from the web's registry
//                     (src/shared/lib/icons.jsx), so a category's badge on
//                     the phone is the icon it has on the web, chosen by the
//                     key the core already resolved (categoryLook).
// The files are committed (they change only with this list or Lucide's
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
export const SWIFT = 'ios/Budgeer/Budgeer/Theme/Lucide.swift'

// The Lucide components the app draws outside category badges (the web's
// imports in the shell, the kit and the ported pages).
export const APP_ICONS = [
  'Activity', 'AlertCircle', 'AlertTriangle', 'ArrowDownRight', 'ArrowLeft', 'ArrowLeftRight', 'ArrowRight',
  'ArrowUpRight', 'Banknote', 'BarChart3', 'Bell', 'BellRing', 'Calculator', 'CalendarClock', 'CalendarDays',
  'CalendarRange', 'Camera', 'ChartBarDecreasing', 'Check', 'ChevronDown', 'ChevronLeft', 'ChevronRight',
  'ChevronUp', 'CircleAlert', 'CircleHelp', 'Copy', 'CreditCard', 'ExternalLink', 'Eye', 'EyeOff', 'FileDown',
  'FileSpreadsheet', 'FileText', 'Globe', 'HandCoins', 'Info', 'KeyRound', 'Languages', 'LayoutDashboard',
  'Link2', 'Lock', 'LogIn', 'LogOut', 'Mail', 'MessageSquare', 'Minus', 'Monitor', 'Moon', 'MoreHorizontal',
  'MoreVertical', 'Pause', 'Pencil', 'PiggyBank', 'Play', 'Plus', 'QrCode', 'Receipt', 'ReceiptText', 'Repeat',
  'RotateCw', 'Scale', 'ScanText', 'Search', 'Send', 'Settings', 'Share2', 'SlidersHorizontal', 'Sparkle',
  'Sparkles', 'Sun', 'Table', 'Tag', 'Target', 'Ticket', 'Trash2', 'TrendingDown', 'TrendingUp', 'Undo2',
  'User', 'UserCheck', 'UserMinus', 'UserPlus', 'UserRound', 'Users', 'Wallet', 'Wand2', 'WifiOff', 'X',
]

// The lit tab's icon and the floating Add are drawn heavier on the web
// (strokeWidth 2.4): "lucide-<name>-bold".
export const BOLD_ICONS = ['LayoutDashboard', 'ReceiptText', 'Users', 'Target', 'MoreHorizontal', 'Plus']

// 'MoreHorizontal' → 'more-horizontal', 'Trash2' → 'trash-2', 'Link2' → 'link-2'.
export const kebab = (name) => name
  .replace(/([a-z])([A-Z0-9])/g, '$1-$2')
  .replace(/([0-9])([A-Z])/g, '$1-$2')
  .toLowerCase()

// 'more-horizontal' → 'moreHorizontal' (a Swift case name).
const camel = (name) => name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())

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
  const add = (asset, component, strokeWidth) => {
    const dir = `${CATALOG}/${asset}.imageset`
    files[`${dir}/Contents.json`] = imageSet(`${asset}.svg`)
    files[`${dir}/${asset}.svg`] = svgFor(component, strokeWidth)
  }
  const names = [...new Set(APP_ICONS)].sort()
  for (const name of names) add(`lucide-${kebab(name)}`, name)
  for (const name of BOLD_ICONS) add(`lucide-${kebab(name)}-bold`, name, 2.4)
  const categories = await categoryIcons()
  for (const [key, component] of Object.entries(categories)) add(`category-${key}`, component)
  const cases = names.map((n) => `    case ${camel(kebab(n))} = "lucide-${kebab(n)}"`).join('\n')
  files[SWIFT] = `// Generated by mobile-core/icons.mjs (npm run ios:icons); do not edit.
// The Lucide icons bundled in Resources/Icons.xcassets, as the web draws
// them; a category's icon is "category-<key>" (CategoryBadge).
enum Lucide: String, CaseIterable {
${cases}
}
`
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
