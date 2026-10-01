// A group's look without a photo, and the covers a group's picture can be
// made of — one list for the website and the native app (which reads it
// through the core), so both draw the same colours and offer the same
// choices. Pure.
import { colors } from '../../shared/ui/palette.js'
import { CATEGORY_COLORS } from '../../shared/lib/categoryStyle.js'

// The cover colours, each a gradient from the top-left corner to the
// bottom-right: the brand's coral and amber first, then the category hues
// with a lighter partner. `key` is stable; the hex values are drawing only.
export const COVER_COLOURS = [
  { key: 'coral', from: colors.brand[500], to: colors.amber[400] },
  { key: 'sunset', from: colors.brand[400], to: colors.brand[200] },
  { key: 'teal', from: CATEGORY_COLORS.teal, to: '#7fd0c9' },
  { key: 'blue', from: CATEGORY_COLORS.blue, to: '#7fb3f5' },
  { key: 'green', from: CATEGORY_COLORS.green, to: '#86c98a' },
  { key: 'purple', from: CATEGORY_COLORS.purple, to: '#c4a2f5' },
]

// The emoji a cover can carry.
export const COVER_EMOJI = ['✈️', '🏠', '❤️', '🍕', '🎉', '🏖️', '⛷️', '🎓', '⚽️', '🎸']

// How a cover image is drawn (the website's canvas and the app's renderer):
// a square of `size` px, the emoji `emoji` of its width, centred.
export const COVER_IMAGE = { size: 600, emoji: 0.46, type: 'image/png', ext: 'png' }

// A group's own colour when it has no photo: one of COVER_COLOURS, picked by
// a hash of `key` (the group's id; its name where no id is known, as on the
// invite preview), so a group keeps its colour everywhere and across renames.
export function groupColour(key) {
  const text = String(key ?? '')
  let hash = 0
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0
  return COVER_COLOURS[hash % COVER_COLOURS.length]
}

// A colour by its key (the picker's choice); the first for an unknown one.
export const coverColour = (key) => COVER_COLOURS.find((c) => c.key === key) ?? COVER_COLOURS[0]

// Everything a cover picker offers, and how its image is drawn.
export const coverChoices = () => ({ emoji: COVER_EMOJI, colours: COVER_COLOURS, image: COVER_IMAGE })
