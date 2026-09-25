// Test helper (not a test file): an in-memory stand-in for Cloudflare D1 over
// node:sqlite, with the status page's real migration applied. Covers the part
// of the D1 API the Worker uses: prepare().bind().all()/first()/run() and
// batch() (run as one transaction, like D1).
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

const MIGRATION = readFileSync(new URL('../status/migrations/0001_init.sql', import.meta.url), 'utf8')

export function fakeD1() {
  const db = new DatabaseSync(':memory:')
  db.exec('pragma foreign_keys = on')
  db.exec(MIGRATION)
  const exec = (sql, args) => db.prepare(sql).all(...args).map((r) => ({ ...r }))
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    all: async () => ({ results: exec(sql, args) }),
    first: async () => exec(sql, args)[0] ?? null,
    run: async () => { exec(sql, args); return { success: true } },
    now: () => ({ results: exec(sql, args) }),
  })
  return {
    prepare: (sql) => stmt(sql),
    async batch(list) {
      db.exec('begin')
      try {
        const out = list.map((s) => s.now())
        db.exec('commit')
        return out
      } catch (e) {
        db.exec('rollback')
        throw e
      }
    },
    raw: db,
  }
}
