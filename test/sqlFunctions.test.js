// One source per SQL function: supabase/sql/functions/<name>.sql holds the
// current definition of the most-redefined functions. A migration that
// changes one pastes the edited file in, so the newest migration's definition
// (and the revoke/grant lines on it) must equal the canonical file.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { currentDefinition } from './migrations.js'

const DIR = new URL('../supabase/sql/functions/', import.meta.url)
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()

// The file without its leading comment lines, whitespace runs folded.
const normalise = (sql) => sql.replace(/^(?:--[^\n]*\n)+/, '').replace(/\s+/g, ' ').trim()

test('the canonical function files are there', () => {
  assert.deepEqual(files, [
    'ai_month_totals.sql', 'demo_wipe.sql', 'export_my_data.sql', 'materialize_recurring_rules.sql',
    'my_recurring_rules.sql', 'my_transactions.sql', 'notify_budget_threshold.sql', 'pay_month_windows.sql',
    'save_recurring_rule.sql', 'save_transactions.sql', 'send_weekly_digests.sql', 'update_transaction.sql',
  ])
})

for (const file of files) {
  const fn = file.replace(/\.sql$/, '')
  test(`${fn}: the newest migration's definition is supabase/sql/functions/${file}`, () => {
    const canonical = readFileSync(new URL(file, DIR), 'utf8')
    assert.equal(normalise(currentDefinition(fn)), normalise(canonical),
      `migrations and ${file} differ: edit the file and paste it into the migration`)
    // A definer function keeps its search_path pinned and anon shut out.
    assert.match(canonical, /set search_path = public, pg_temp/)
    assert.match(canonical, new RegExp(`^revoke execute on function public\\.${fn}\\([^)]*\\) from [^;]*\\banon\\b`, 'm'))
  })
}
