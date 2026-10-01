// Bundle the mobile core (index.js) into one script for JavaScriptCore:
//   npm run core:build   →  ios/BudgeerCore/Sources/BudgeerCore/Resources/core.js
// An IIFE that sets globalThis.BudgeerCore, ES2020 (iOS 17's engine runs far
// newer, but the target keeps the syntax plain), no source map, no minify
// (a stack trace in the app should name the web function that threw).
//
// The build also guards the graph: any module from a forbidden package or
// file (modules.js) fails it, so a stray `import { supabase }` can't ride
// into the app. test/mobileCore.test.js builds through buildCore() too.
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { CORE_BUNDLE, CORE_PACKAGES, FORBIDDEN_FILES, FORBIDDEN_PACKAGES } from './modules.js'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// The inputs (repo-relative paths) of a metafile that the core must not have:
// a forbidden file or package, any package not in CORE_PACKAGES, UI code.
export function forbiddenInputs(metafile) {
  const inputs = Object.keys(metafile.inputs)
  return inputs.filter((p) =>
    FORBIDDEN_FILES.includes(p) ||
    p.startsWith('node_modules/') && FORBIDDEN_PACKAGES.some((pkg) => p.startsWith(`node_modules/${pkg}/`) || p.startsWith(`node_modules/${pkg}@`)) ||
    p.startsWith('node_modules/') && !CORE_PACKAGES.some((pkg) => p.startsWith(`node_modules/${pkg}/`)) ||
    /\.(jsx|tsx|css)$/.test(p))
}

// Build the core in memory: { code, metafile }. Throws on a forbidden input.
export async function buildCore() {
  const result = await build({
    absWorkingDir: ROOT,
    entryPoints: ['mobile-core/index.js'],
    bundle: true,
    format: 'iife',
    globalName: 'BudgeerCore',
    platform: 'neutral',
    target: ['es2020'],
    mainFields: ['module', 'main'],
    write: false,
    metafile: true,
    legalComments: 'none',
    logLevel: 'silent',
    // The web build's Vite variables: the core is never a dev build.
    define: { 'import.meta.env': '{}' },
  })
  const bad = forbiddenInputs(result.metafile)
  if (bad.length) throw new Error(`mobile core reaches forbidden modules:\n  ${bad.join('\n  ')}`)
  return { code: result.outputFiles[0].text, metafile: result.metafile }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const { code, metafile } = await buildCore()
  const out = resolve(ROOT, CORE_BUNDLE)
  await mkdir(dirname(out), { recursive: true })
  await writeFile(out, code)
  const inputs = Object.keys(metafile.inputs).length
  console.log(`mobile core: ${CORE_BUNDLE} (${(code.length / 1024).toFixed(0)} KB, ${inputs} modules)`)
}
