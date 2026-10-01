// How a person's avatar looks without a photo, as Chakra's Avatar draws it
// (UserAvatar): the initials of the first and last word of the name, on a
// colour worked out from the name (Chakra's randomColor string hash), in
// white on a dark colour and dark text on a light one. The viewer's own
// avatar is always the brand's (`highlight`). Pure, so the native app draws
// the same circles: test/avatarLook.test.js checks it against Chakra's own.

// Chakra's gray.400, the colour of an avatar without a name.
const NO_NAME = '#a0aec0'

// "Anna Maria Smith" → "AS", "Sam" → "S" (Chakra's avatar initials).
export function avatarInitials(name) {
  const names = String(name ?? '').trim().split(' ')
  const first = names[0] ?? ''
  const last = names.length > 1 ? names[names.length - 1] : ''
  return first && last ? `${first.charAt(0)}${last.charAt(0)}` : first.charAt(0)
}

// The name's colour, '#rrggbb' (randomColor({ string: name })).
export function avatarColor(name) {
  const str = String(name ?? '')
  if (!str) return NO_NAME
  let hash = 0
  for (let i = 0; i < str.length; i += 1) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
    hash = hash & hash
  }
  let color = '#'
  for (let j = 0; j < 3; j += 1) {
    const value = (hash >> (j * 8)) & 255
    color += `00${value.toString(16)}`.slice(-2)
  }
  return color
}

// 'light' text on a dark colour (brightness under 128), 'dark' otherwise, as
// Chakra's isDark decides the avatar's text colour.
export function avatarText(color) {
  const hex = String(color).replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return (r * 299 + g * 587 + b * 114) / 1000 < 128 ? 'light' : 'dark'
}

// Everything an avatar circle needs: { name, src, highlight, initials, bg, fg }.
// `bg` is null for the viewer (`highlight`: the brand's accent, white text).
export function avatarLook(name, { src = null, highlight = false } = {}) {
  const bg = highlight ? null : avatarColor(name ?? '')
  return {
    name: name ?? '',
    src: src ?? null,
    highlight: !!highlight,
    initials: name ? avatarInitials(name) : '',
    bg,
    fg: bg ? avatarText(bg) : 'light',
  }
}
