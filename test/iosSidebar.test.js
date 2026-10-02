// The iPad's sidebar (ios/Budgeer/Budgeer/App/AppLayout.swift, SidebarSection)
// lists the website's desktop sidebar's places (src/app/AppShell.jsx: PRIMARY,
// then SECONDARY, then Meal vouchers once set up) in the same order and the
// same two blocks, with the same words (the shell's nav keys; Activity is the
// app's word for Transactions). One order everywhere.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const shell = readFileSync(`${root}src/app/AppShell.jsx`, 'utf8')
const swift = readFileSync(`${root}ios/Budgeer/Budgeer/App/AppLayout.swift`, 'utf8')

// The web's paths as the app's sections.
const SECTION = {
  '/': 'home', '/transactions': 'activity', '/groups': 'groups', '/budgets': 'budgets', '/insights': 'insights',
  '/savings': 'savings', '/recurring': 'recurring', '/plan': 'plan', '/vouchers': 'vouchers',
}

function webList(name) {
  const block = new RegExp(`const ${name} = \\[([\\s\\S]*?)\\n\\]`).exec(shell)?.[1] ?? ''
  return [...block.matchAll(/to: '([^']+)', label: '([^']+)'/g)].map(([, to, label]) => ({ to, label }))
}

test('the iPad sidebar lists the website sidebar’s places in its order and blocks', () => {
  const primary = webList('PRIMARY')
  const secondary = webList('SECONDARY')
  const vouchers = /const VOUCHERS_NAV = \{ to: '([^']+)', label: '([^']+)'/.exec(shell)
  assert.ok(primary.length && secondary.length && vouchers)
  const web = [...primary, ...secondary, { to: vouchers[1], label: vouchers[2] }].map((n) => SECTION[n.to])
  const cases = /enum SidebarSection[^{]*\{\s*case ([a-z, ]+)\n/.exec(swift)?.[1].split(',').map((s) => s.trim())
  assert.deepEqual(cases, [...web, 'settings'])
  // The blocks: the web's PRIMARY is the first, the rest the second.
  const block = (section) => new RegExp(`case [^\\n]*\\.${section}\\b[^\\n]*: return (\\d)`).exec(swift)?.[1]
  for (const n of primary) assert.equal(block(SECTION[n.to]), '0', n.to)
  for (const n of [...secondary, { to: vouchers[1] }]) assert.equal(block(SECTION[n.to]), '1', n.to)
})

test('the iPad sidebar’s words are the website’s nav keys', () => {
  const all = [...webList('PRIMARY'), ...webList('SECONDARY')]
  for (const { to, label } of all) {
    const section = SECTION[to]
    const key = new RegExp(`case \\.${section}: return "([^"]+)"`).exec(swift)?.[1]
    // Transactions is Activity in the app (its tab's word), as on the phone.
    assert.equal(key, section === 'activity' ? 'ios:native.tabs.activity' : `shell:${label}`, to)
  }
})
