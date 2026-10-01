// The emoji-and-colour cover as an image to upload (uploadGroupImage), drawn
// on a canvas as the native app draws it: a COVER_IMAGE.size square in the
// colour's gradient, top-left to bottom-right, the emoji centred at
// COVER_IMAGE.emoji of its width. Browser only (canvas).
import { COVER_IMAGE, coverColour } from './groupCover.js'

// What the picker holds, as a file to upload: the photo picked, the drawn
// emoji cover, or null when nothing new was picked.
export async function coverFile(cover) {
  if (cover?.kind === 'photo') return cover.file
  if (cover?.kind !== 'emoji') return null
  const { size, emoji, type, ext } = COVER_IMAGE
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const { from, to } = coverColour(cover.colour)
  const gradient = ctx.createLinearGradient(0, 0, size, size)
  gradient.addColorStop(0, from)
  gradient.addColorStop(1, to)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  ctx.font = `${Math.round(size * emoji)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(cover.emoji, size / 2, size / 2)
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('cover image'))), type)
  })
  return new File([blob], `cover.${ext}`, { type })
}
