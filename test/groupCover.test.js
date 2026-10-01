// A group's own colour and the cover picker's choices (groupCover.js), the
// same for the website and the native app.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  COVER_COLOURS, COVER_EMOJI, COVER_IMAGE, coverChoices, coverColour, groupColour,
} from '../src/features/groups/groupCover.js'
import { colors } from '../src/shared/ui/palette.js'

test('groupColour: stable for a group, one of the cover colours, spread across them', () => {
  assert.equal(groupColour('g-lisbon'), groupColour('g-lisbon'))
  assert.ok(COVER_COLOURS.includes(groupColour('g-lisbon')))
  assert.ok(COVER_COLOURS.includes(groupColour(null)))
  assert.equal(groupColour(''), COVER_COLOURS[0])
  const ids = Array.from({ length: 60 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
  const used = new Set(ids.map((id) => groupColour(id).key))
  assert.equal(used.size, COVER_COLOURS.length)
})

test('the cover colours: the brand first, unique keys, hex gradients', () => {
  assert.deepEqual(COVER_COLOURS[0], { key: 'coral', from: colors.brand[500], to: colors.amber[400] })
  assert.equal(new Set(COVER_COLOURS.map((c) => c.key)).size, COVER_COLOURS.length)
  for (const c of COVER_COLOURS) {
    assert.match(c.from, /^#[0-9a-f]{6}$/i)
    assert.match(c.to, /^#[0-9a-f]{6}$/i)
  }
  assert.equal(coverColour('blue').key, 'blue')
  assert.equal(coverColour('nope').key, 'coral')
})

test('coverChoices: the emoji, the colours and how the image is drawn', () => {
  assert.deepEqual(coverChoices(), { emoji: COVER_EMOJI, colours: COVER_COLOURS, image: COVER_IMAGE })
  assert.equal(new Set(COVER_EMOJI).size, COVER_EMOJI.length)
  assert.deepEqual([COVER_IMAGE.size, COVER_IMAGE.type, COVER_IMAGE.ext], [600, 'image/png', 'png'])
})
