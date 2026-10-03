// Start fresh (Settings › Your data, start_fresh in 0114): the phrase, what
// the confirmation asks for, what goes and what stays, and the server's
// lockstep with the app (the sign-in window, the refusals' words, the tables).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  START_FRESH_PHRASE, phraseMatches, startFreshCheck, startFreshScope,
} from '../src/features/backup/startFreshMath.js'
import { REAUTH_WINDOW_SECONDS, reauthMessage } from '../supabase/functions/_shared/reauth.ts'
import { SQL_USER_MESSAGES } from '../src/shared/lib/errors.js'
import { latestSql, currentDefinition } from './migrations.js'
import en from '../src/locales/en/index.js'
import el from '../src/locales/el/index.js'
import { loadLanguage } from '../src/shared/lib/i18n/i18n.js'

const emailUser = { email: 'sam@example.com', app_metadata: { providers: ['email'] } }
const googleUser = { email: 'sam@example.com', app_metadata: { providers: ['google'] } }

test('the phrase: START FRESH in every language, case and spaces forgiven', () => {
  assert.equal(START_FRESH_PHRASE, 'START FRESH')
  for (const typed of ['START FRESH', 'start fresh', '  Start   Fresh ', 'start\tfresh']) {
    assert.equal(phraseMatches(typed), true, typed)
  }
  for (const typed of ['', null, undefined, 'STARTFRESH', 'START FRESH NOW', 'START FRES', 'DELETE']) {
    assert.equal(phraseMatches(typed), false, String(typed))
  }
  // Both languages name the same phrase in the label.
  assert.match(en.backup.startFresh.phraseLabel, /START FRESH/)
  assert.match(el.backup.startFresh.phraseLabel, /START FRESH/)
})

test('startFreshCheck: a password account gives its password; any other needs a recent sign-in', () => {
  assert.deepEqual(startFreshCheck({ user: emailUser, recent: false, phrase: '', password: '' }),
    { password: true, needsReauth: false, phraseOk: false, canSubmit: false })
  assert.equal(startFreshCheck({ user: emailUser, recent: false, phrase: 'start fresh', password: '' }).canSubmit, false)
  assert.equal(startFreshCheck({ user: emailUser, recent: false, phrase: 'start fresh', password: 'x' }).canSubmit, true)
  assert.equal(startFreshCheck({ user: emailUser, recent: true, phrase: 'start', password: 'x' }).canSubmit, false)

  const stale = startFreshCheck({ user: googleUser, recent: false, phrase: 'START FRESH' })
  assert.deepEqual(stale, { password: false, needsReauth: true, phraseOk: true, canSubmit: false })
  assert.deepEqual(startFreshCheck({ user: googleUser, recent: true, phrase: 'START FRESH' }),
    { password: false, needsReauth: false, phraseOk: true, canSubmit: true })
  assert.equal(startFreshCheck({ user: googleUser, recent: true, phrase: 'START' }).canSubmit, false)
})

test('startFreshScope: what goes and what stays, in the app\'s language', async () => {
  assert.deepEqual(startFreshScope(), {
    wiped: Object.values(en.backup.startFresh.scope.wiped),
    kept: Object.values(en.backup.startFresh.scope.kept),
  })
  await loadLanguage('el')
  try {
    assert.deepEqual(startFreshScope(), {
      wiped: Object.values(el.backup.startFresh.scope.wiped),
      kept: Object.values(el.backup.startFresh.scope.kept),
    })
  } finally {
    await loadLanguage('en')
  }
})

test('start_fresh: the same sign-in window as reauth.ts, and refusals the app shows in its words', () => {
  const recent = latestSql('signed_in_recently')
  assert.match(recent, new RegExp(`p_window_seconds integer default ${REAUTH_WINDOW_SECONDS}\\b`))
  assert.match(recent, /between -60 and p_window_seconds/)
  const sql = latestSql('start_fresh')
  const refusal = reauthMessage('start fresh')
  assert.ok(sql.includes(`'${refusal}'`))
  assert.equal(SQL_USER_MESSAGES.get(refusal), 'reauth.startFresh')
  assert.equal(en.common.errors.reauth.startFresh, refusal)
  assert.ok(sql.includes('public.refuse_if_demo(uid)'))
  assert.match(sql, /rate_limit\('start_fresh:' \|\| uid, 3, 86400\)/)
})

test('start_fresh: wipes only the caller\'s personal tables, keeps the group shares, re-seeds the defaults', () => {
  const sql = latestSql('start_fresh')
  const wiped = [...sql.matchAll(/delete from public\.(\w+) where ([^;]+);/g)]
  assert.deepEqual(wiped.map(([, table]) => table).sort(), [
    'accounts', 'ai_month_summaries', 'budgets', 'categories', 'category_rules', 'meal_vouchers', 'notifications',
    'recurring_plan_undo', 'recurring_plans', 'recurring_rules', 'salary_history', 'savings_goals', 'transactions',
  ])
  for (const [, table, where] of wiped) assert.match(where, /^user_id = uid\b/, table)
  assert.match(sql, /delete from public\.transactions where user_id = uid and group_expense_id is null;/)
  assert.match(sql, /perform public\.seed_default_categories\(\);/)
  assert.match(sql, /set salary_category_id = null where id = uid/)
  // Closed to anon; signed_in_recently to every client.
  const grants = currentDefinition('start_fresh')
  assert.match(grants, /revoke execute on function public\.start_fresh\(\) from public, anon;/)
  assert.match(grants, /grant execute on function public\.start_fresh\(\) to authenticated;/)
  assert.match(currentDefinition('signed_in_recently'),
    /revoke execute on function public\.signed_in_recently\(jsonb, integer\) from public, anon, authenticated;/)
})
