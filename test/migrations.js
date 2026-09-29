// Test helper (not a test file): read SQL from supabase/migrations for the
// JS↔SQL lockstep checks and the canonical function files.
import { readFileSync, readdirSync } from 'node:fs'

const MIGRATIONS = new URL('../supabase/migrations/', import.meta.url)

// Every migration's text, newest first.
function newestFirst() {
  return readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort().reverse()
    .map((f) => readFileSync(new URL(f, MIGRATIONS), 'utf8'))
}

// The body of the newest migration that (re)defines SQL function `fn`.
export function latestSql(fn) {
  for (const src of newestFirst()) {
    const at = src.search(new RegExp(`create (or replace )?function public\\.${fn}\\(`))
    if (at >= 0) return src.slice(at, src.indexOf('$$;', src.indexOf('$$', at) + 2))
  }
  throw new Error(`no migration defines ${fn}`)
}

// SQL function `fn` as the migrations leave it: its newest create statement
// (through the closing $$;), then the revoke/grant lines on it from the newest
// migration that sets any.
export function currentDefinition(fn) {
  const grants = new RegExp(`^(?:revoke|grant) [^;]*\\bfunction public\\.${fn}\\([^;]*;`, 'gm')
  const lines = newestFirst().map((src) => src.match(grants)).find(Boolean) ?? []
  return [`${latestSql(fn)}$$;`, ...lines].join('\n')
}
