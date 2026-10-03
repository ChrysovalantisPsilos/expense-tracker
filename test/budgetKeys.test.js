// Budgets are keyed by a month's label ('YYYY-MM-01': periods.periodMonth),
// never by its window's first day: with pay months October can start on
// 29 September, and a cap keyed by `period.from` would land on September.
// This guard scans the web, the core and the iOS app for the ways that
// mistake has been written.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const DIRS = ['src', 'mobile-core', 'ios/Budgeer']
const EXT = /\.(js|jsx|mjs|ts|swift)$/
const SKIP = new Set(['node_modules', 'core.js'])

function* files(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) yield* files(path)
    else if (EXT.test(name)) yield path
  }
}

const BAD = [
  [/monthKey\(\s*period\.from\s*\)/, 'monthKey(period.from)'],
  [/useMonthBudgets\(\s*[^)]*\.from\s*\)/, 'useMonthBudgets(….from)'],
  [/budgets\(\s*period:\s*[^)]*from\b/, 'budgets(period: …from)'],
]

test('no budget is keyed by a window\'s first day', () => {
  const found = []
  for (const dir of DIRS) {
    for (const path of files(join(ROOT, dir))) {
      const text = readFileSync(path, 'utf8')
      for (const [re, what] of BAD) {
        if (re.test(text)) found.push(`${relative(ROOT, path)}: ${what}`)
      }
    }
  }
  assert.deepEqual(found, [])
})
