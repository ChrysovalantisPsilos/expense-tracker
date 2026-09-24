// The app theme's key colour pairs meet WCAG AA: 4.5:1 for text, 3:1 for
// large text and UI parts. Values come from palette.js, which theme.js maps
// onto its semantic tokens (text.muted, accent.fg, accent.solid).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { colors, ACCESSIBLE, DARK } from '../src/shared/ui/palette.js'
import { contrast } from './contrast.js'

const WHITE = '#ffffff'
const LIGHT = { canvas: colors.sand[50], surface: WHITE, subtle: colors.sand[100] }
const DARK_BG = { canvas: DARK.canvas, surface: DARK.surface, subtle: DARK.subtle }

function passes(fg, bg, min, label) {
  const ratio = contrast(fg, bg)
  assert.ok(ratio >= min, `${label}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1, needs ${min}:1`)
}

test('solid coral buttons: white label passes 4.5:1 at rest, hover and press', () => {
  for (const fill of [ACCESSIBLE.solid, ACCESSIBLE.solidHover, ACCESSIBLE.solidActive]) {
    passes(WHITE, fill, 4.5, 'button label')
  }
})

test('the solid fill still reads as a control (3:1) on every dark surface', () => {
  for (const [name, bg] of Object.entries(DARK_BG)) passes(ACCESSIBLE.solid, bg, 3, `button on dark ${name}`)
})

test('coral text and links pass 4.5:1 on white, cream and sand (light mode)', () => {
  for (const [name, bg] of Object.entries(LIGHT)) passes(ACCESSIBLE.text, bg, 4.5, `accent on ${name}`)
})

test('coral text passes 4.5:1 on the dark surfaces (brand.300)', () => {
  for (const [name, bg] of Object.entries(DARK_BG)) passes(colors.brand[300], bg, 4.5, `accent on dark ${name}`)
})

test('muted text passes 4.5:1 on every surface in both modes', () => {
  for (const [name, bg] of Object.entries(LIGHT)) passes(ACCESSIBLE.muted, bg, 4.5, `muted on ${name}`)
  for (const [name, bg] of Object.entries(DARK_BG)) passes(colors.sand[400], bg, 4.5, `muted on dark ${name}`)
})

test('primary text passes 4.5:1 everywhere', () => {
  for (const [name, bg] of Object.entries(LIGHT)) passes(colors.sand[900], bg, 4.5, `text on ${name}`)
  for (const [name, bg] of Object.entries(DARK_BG)) passes(DARK.text, bg, 4.5, `text on dark ${name}`)
})

test('the brand coral itself stays decorative: it would fail as a text colour', () => {
  // Guards against "simplifying" the accessible shades back to brand.500.
  assert.ok(contrast(WHITE, colors.brand[500]) < 4.5)
  assert.notEqual(ACCESSIBLE.solid, colors.brand[500])
})
