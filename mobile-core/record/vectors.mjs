// Record the test vectors:
//   npm run core:vectors  →  ios/BudgeerCore/Tests/BudgeerCoreTests/Resources/vectors.json
// It runs the unit tests once (TZ=UTC) with preload.mjs in every test
// process, so each call a test makes into a core module is captured
// (recorder.js), then merges the processes' harvests: one vector per
// distinct call, sorted, one per line. It ends with the coverage: how many
// functions and calls were recorded, and which exported functions no test
// reached (a function with no vector has no proof yet).
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import vm from 'node:vm'
import { buildCore, ROOT } from '../build.mjs'
import { VECTORS_FILE } from '../modules.js'

// Every function the core exports, per module (from the bundle itself).
async function coreFunctions() {
  const { code } = await buildCore()
  const context = vm.createContext({})
  vm.runInContext(code, context)
  const out = {}
  for (const [module, ns] of Object.entries(context.BudgeerCore.modules)) {
    out[module] = Object.keys(ns).filter((k) => typeof ns[k] === 'function').sort()
  }
  return out
}

const dir = mkdtempSync(join(tmpdir(), 'budgeer-vectors-'))
try {
  const preload = new URL('./preload.mjs', import.meta.url).href
  // Every unit test but the core's own replay (which needs this file's output).
  const tests = readdirSync(resolve(ROOT, 'test')).filter((f) => f.endsWith('.test.js') && f !== 'mobileCore.test.js').map((f) => `test/${f}`)
  const run = spawnSync(process.execPath, ['--test', ...tests], {
    cwd: ROOT,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, TZ: 'UTC', NODE_OPTIONS: `--import=${preload}`, BUDGEER_VECTORS_DIR: dir },
  })
  if (run.status !== 0) {
    console.error(`the unit tests failed under the recorder (exit ${run.status}); no vectors written`)
    process.exit(1)
  }

  const merged = new Map()
  for (const file of readdirSync(dir)) {
    const { vectors } = JSON.parse(readFileSync(join(dir, file), 'utf8'))
    for (const v of vectors) {
      const id = `${v.m}.${v.f}|${v.l ?? 'en'}|${v.a}`
      if (!merged.has(id)) merged.set(id, v)
    }
  }
  // At most PER_FUNCTION vectors per function, spread across the sizes seen
  // (the smallest, the largest and the steps between), so a much-called
  // helper doesn't swell the file while its odd cases stay in.
  const PER_FUNCTION = 80
  const groups = new Map()
  for (const v of merged.values()) {
    const key = `${v.m}.${v.f}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(v)
  }
  const kept = []
  for (const group of groups.values()) {
    group.sort((x, y) => JSON.stringify(x).length - JSON.stringify(y).length || x.a.localeCompare(y.a))
    if (group.length <= PER_FUNCTION) kept.push(...group)
    else for (let i = 0; i < PER_FUNCTION; i++) kept.push(group[Math.floor(i * (group.length - 1) / (PER_FUNCTION - 1))])
  }
  const vectors = kept.sort((x, y) =>
    x.m.localeCompare(y.m) || x.f.localeCompare(y.f) || (x.l ?? '').localeCompare(y.l ?? '') ||
    x.a.localeCompare(y.a))

  const all = await coreFunctions()
  const covered = new Set(vectors.map((v) => `${v.m}.${v.f}`))
  const total = Object.values(all).reduce((n, fns) => n + fns.length, 0)
  const uncovered = Object.entries(all).flatMap(([m, fns]) => fns.filter((f) => !covered.has(`${m}.${f}`)).map((f) => `${m}.${f}`))

  const out = resolve(ROOT, VECTORS_FILE)
  mkdirSync(dirname(out), { recursive: true })
  const text = `{"vectors":[\n${vectors.map((v) => JSON.stringify(v)).join(',\n')}\n]}\n`
  writeFileSync(out, text)

  console.log(`vectors: ${vectors.length} calls of ${covered.size}/${total} functions → ${VECTORS_FILE} (${(text.length / 1024).toFixed(0)} KB)`)
  console.log(`no recorded calls (${uncovered.length}): ${uncovered.join(', ')}`)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
