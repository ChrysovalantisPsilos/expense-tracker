import { test } from 'node:test'
import assert from 'node:assert/strict'
import { memberName, describeBalance } from '../src/features/groups/groupFormat.js'
import { formatMoney } from '../src/shared/lib/currency.js'

const members = [{ id: 'a', display_name: 'Alice' }, { id: 'b', display_name: 'Bob' }]

test('memberName: resolves an id, em-dash for unknown/empty', () => {
  assert.equal(memberName(members, 'a'), 'Alice')
  assert.equal(memberName(members, 'zzz'), '—')
  assert.equal(memberName(null, 'a'), '—')
})

test('describeBalance: owed / owes / settled up', () => {
  assert.equal(describeBalance(0, 'EUR'), 'settled up')
  assert.equal(describeBalance(500, 'EUR'), `owed ${formatMoney(500, 'EUR')}`)
  assert.equal(describeBalance(-500, 'EUR'), `owes ${formatMoney(500, 'EUR')}`)
})
