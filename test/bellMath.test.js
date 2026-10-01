// The bell's pure rules (src/features/notifications/bellMath.js).
import test from 'node:test'
import assert from 'node:assert/strict'
import { badgeText, notificationPath, unreadCount } from '../src/features/notifications/bellMath.js'

test('bell: counts the unread ones', () => {
  assert.equal(unreadCount([{ read_at: null }, { read_at: '2026-09-01T00:00:00Z' }, {}]), 2)
  assert.equal(unreadCount([]), 0)
  assert.equal(unreadCount(undefined), 0)
})

test('bell: the badge shows the count, 9+ past nine, nothing at zero', () => {
  assert.equal(badgeText(0), null)
  assert.equal(badgeText(1), '1')
  assert.equal(badgeText(9), '9')
  assert.equal(badgeText(10), '9+')
})

test('bell: where a notification goes', () => {
  assert.equal(notificationPath({ type: 'invite', group_id: 'g' }), '/groups')
  assert.equal(notificationPath({ type: 'reminder' }), '/recurring')
  assert.equal(notificationPath({ type: 'budget' }), '/budgets')
  assert.equal(notificationPath({ type: 'digest' }), '/')
  assert.equal(notificationPath({ type: 'expense', group_id: 'g1' }), '/groups/g1')
  assert.equal(notificationPath({ type: 'nudge' }), null)
})
