// Loader hooks (node:module register) for the vector recorder. Every import
// of a core module resolves to a facade that re-exports the real module with
// each function wrapped by recorder.js; the facade itself imports the real
// file under a `?real` query. Nothing else changes, so the tests exercise
// exactly the code they always did.
import { build } from 'esbuild'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve, dirname } from 'node:path'
import { CORE_MODULES } from '../modules.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const RECORDER = new URL('./recorder.js', import.meta.url).href
const byUrl = new Map(Object.entries(CORE_MODULES).map(([name, path]) => [pathToFileURL(resolve(ROOT, path)).href, name]))

// The export names of one file, from esbuild's metafile (no evaluation).
async function exportNames(file) {
  const result = await build({
    entryPoints: [file], bundle: false, write: false, metafile: true, format: 'esm', logLevel: 'silent',
  })
  return Object.values(result.metafile.outputs)[0].exports
}

export async function load(url, context, nextLoad) {
  const name = byUrl.get(url)
  if (!name) return nextLoad(url, context)
  const names = await exportNames(fileURLToPath(url))
  const lines = [
    `import * as __real from ${JSON.stringify(`${url}?real`)}`,
    `import { wrap as __wrap } from ${JSON.stringify(RECORDER)}`,
  ]
  for (const n of names) {
    if (n === 'default') lines.push(`export default __wrap(${JSON.stringify(name)}, 'default', __real.default)`)
    else lines.push(`export const ${n} = __wrap(${JSON.stringify(name)}, ${JSON.stringify(n)}, __real.${n})`)
  }
  return { format: 'module', shortCircuit: true, source: lines.join('\n') }
}
