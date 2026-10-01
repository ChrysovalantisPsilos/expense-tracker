import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isDark, randomColor } from '@chakra-ui/theme-tools'
import { avatarColor, avatarInitials, avatarLook, avatarText } from '../src/shared/ui/avatarLook.js'

const NAMES = ['Anna', 'Sam Lee', 'Μαρία Παπαδοπούλου', 'Jean-Luc Picard', 'x', 'Zoë  Two Spaces']

test('avatarColor / avatarText: the colour and text Chakra\'s Avatar picks for a name', () => {
  for (const name of NAMES) {
    const color = randomColor({ string: name })
    assert.equal(avatarColor(name), color, name)
    assert.equal(avatarText(color), isDark(color)({}) ? 'light' : 'dark', name)
  }
  assert.equal(avatarColor(''), '#a0aec0')
})

test('avatarInitials: the first and the last word\'s first letter, or the one word\'s', () => {
  assert.equal(avatarInitials('Anna Maria Smith'), 'AS')
  assert.equal(avatarInitials('  Sam  '), 'S')
  assert.equal(avatarInitials('Μαρία Παπαδοπούλου'), 'ΜΠ')
  assert.equal(avatarInitials(''), '')
})

test('avatarLook: a circle\'s initials and colours; the viewer\'s is the brand\'s', () => {
  assert.deepEqual(avatarLook('Sam Lee', { src: 'https://x/a.png' }), {
    name: 'Sam Lee', src: 'https://x/a.png', highlight: false, initials: 'SL',
    bg: avatarColor('Sam Lee'), fg: avatarText(avatarColor('Sam Lee')),
  })
  assert.deepEqual(avatarLook('Sam Lee', { highlight: true }),
    { name: 'Sam Lee', src: null, highlight: true, initials: 'SL', bg: null, fg: 'light' })
  assert.equal(avatarLook(undefined).initials, '')
})
