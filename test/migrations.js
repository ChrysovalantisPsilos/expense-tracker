// Test helper (not a test file): read SQL from supabase/migrations for the
// JS↔SQL lockstep checks.
import { readFileSync, readdirSync } from 'node:fs'

const MIGRATIONS = new URL('../supabase/migrations/', import.meta.url)

// The body of the newest migration that (re)defines SQL function `fn`.
export function latestSql(fn) {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort().reverse()
  for (const f of files) {
    const src = readFileSync(new URL(f, MIGRATIONS), 'utf8')
    const at = src.search(new RegExp(`create (or replace )?function public\\.${fn}\\(`))
    if (at >= 0) return src.slice(at, src.indexOf('$$;', src.indexOf('$$', at) + 2))
  }
  throw new Error(`no migration defines ${fn}`)
}
