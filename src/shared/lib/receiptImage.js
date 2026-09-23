// Receipt photo clean-up before OCR, all on-device in a canvas: upright
// (EXIF orientation, plus the user's quarter turns), cropped to the receipt,
// scaled to an OCR-friendly size, grayscale, contrast-stretched and
// binarised with a local (adaptive) threshold so shadows and uneven phone
// lighting don't swallow the text. The pixel maths is pure and unit-tested;
// only decodeImage/orientedCanvas/prepareForOcr touch the DOM.

// Longest side after scaling: big enough for small receipt print, small
// enough that OCR stays quick on a phone. Tiny images are enlarged a bit.
const MAX_SIDE = 2000
const MIN_SIDE = 1000

// Scale factor for a w×h image: shrink to MAX_SIDE, enlarge small images up
// to MIN_SIDE (at most 2×), else leave alone.
export function fitScale(w, h, max = MAX_SIDE, min = MIN_SIDE) {
  const longest = Math.max(w, h)
  if (!longest) return 1
  if (longest > max) return max / longest
  if (longest < min) return Math.min(2, min / longest)
  return 1
}

// A crop rectangle given as fractions of the image ({ x, y, w, h } in 0..1)
// as whole pixels inside a width×height image. No crop (or a sliver under
// 5% either way) means the whole image.
export function cropPixels(crop, width, height) {
  if (!crop || crop.w < 0.05 || crop.h < 0.05) return { sx: 0, sy: 0, sw: width, sh: height }
  const clamp = (v) => Math.min(1, Math.max(0, v))
  const x0 = clamp(crop.x); const y0 = clamp(crop.y)
  const x1 = clamp(crop.x + crop.w); const y1 = clamp(crop.y + crop.h)
  const sx = Math.round(x0 * width); const sy = Math.round(y0 * height)
  return { sx, sy, sw: Math.max(1, Math.round(x1 * width) - sx), sh: Math.max(1, Math.round(y1 * height) - sy) }
}

// RGBA pixels → one luma byte per pixel (Rec. 601 weights).
export function toGrayscale(rgba) {
  const gray = new Uint8ClampedArray(rgba.length / 4)
  for (let i = 0, j = 0; j < gray.length; i += 4, j++) {
    gray[j] = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000
  }
  return gray
}

// Stretch the 1st–99th percentile of gray levels to 0–255 (in place), so a
// dim or washed-out photo uses the full range.
export function stretchContrast(gray) {
  const hist = new Uint32Array(256)
  for (const v of gray) hist[v]++
  const cut = gray.length * 0.01
  let lo = 0; let hi = 255; let acc = 0
  while (lo < 255 && (acc += hist[lo]) <= cut) lo++
  acc = 0
  while (hi > 0 && (acc += hist[hi]) <= cut) hi--
  if (hi <= lo) return gray
  const k = 255 / (hi - lo)
  for (let i = 0; i < gray.length; i++) gray[i] = (gray[i] - lo) * k
  return gray
}

// Bradley–Roth adaptive threshold (in place): a pixel is ink when it is
// `t` darker than the mean of its neighbourhood (a window ~1/16 of the
// width), computed in O(n) with an integral image.
export function adaptiveThreshold(gray, width, height, t = 0.15) {
  const s = Math.max(8, Math.round(width / 16)) >> 1
  const integral = new Float64Array((width + 1) * (height + 1))
  for (let y = 1; y <= height; y++) {
    let row = 0
    for (let x = 1; x <= width; x++) {
      row += gray[(y - 1) * width + (x - 1)]
      integral[y * (width + 1) + x] = integral[(y - 1) * (width + 1) + x] + row
    }
  }
  const out = new Uint8ClampedArray(gray.length)
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - s); const y1 = Math.min(height, y + s + 1)
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - s); const x1 = Math.min(width, x + s + 1)
      const sum = integral[y1 * (width + 1) + x1] - integral[y0 * (width + 1) + x1]
        - integral[y1 * (width + 1) + x0] + integral[y0 * (width + 1) + x0]
      const mean = sum / ((x1 - x0) * (y1 - y0))
      out[y * width + x] = gray[y * width + x] < mean * (1 - t) ? 0 : 255
    }
  }
  gray.set(out)
  return gray
}

// The photo decoded upright: the browser applies the EXIF orientation when
// asked (createImageBitmap) or by default (<img>, image-orientation:
// from-image), so a sideways phone photo arrives the right way up.
export async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch { /* older engines: fall back to <img> */ }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

const sizeOf = (image) => ({ w: image.naturalWidth || image.width, h: image.naturalHeight || image.height })

// The image turned by `quarterTurns` × 90° clockwise, scaled so its longest
// side is at most `maxSide`, on a new canvas.
export function orientedCanvas(image, quarterTurns = 0, maxSide = Infinity) {
  const { w, h } = sizeOf(image)
  const turns = ((quarterTurns % 4) + 4) % 4
  const scale = Math.min(1, maxSide / Math.max(w, h))
  const dw = Math.round(w * scale); const dh = Math.round(h * scale)
  const canvas = document.createElement('canvas')
  canvas.width = turns % 2 ? dh : dw
  canvas.height = turns % 2 ? dw : dh
  const ctx = canvas.getContext('2d')
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((turns * Math.PI) / 2)
  ctx.drawImage(image, -dw / 2, -dh / 2, dw, dh)
  return canvas
}

// The OCR input: turned, cropped (fractions of the turned image), scaled,
// then grayscale → contrast stretch → adaptive threshold.
export function prepareForOcr(image, { quarterTurns = 0, crop = null } = {}) {
  // Work from at most 4000px so a 50 MP photo can't exhaust a phone's memory.
  const upright = orientedCanvas(image, quarterTurns, 4000)
  const { sx, sy, sw, sh } = cropPixels(crop, upright.width, upright.height)
  const scale = fitScale(sw, sh)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(sw * scale))
  canvas.height = Math.max(1, Math.round(sh * scale))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(upright, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const gray = adaptiveThreshold(stretchContrast(toGrayscale(img.data)), canvas.width, canvas.height)
  for (let i = 0, j = 0; j < gray.length; i += 4, j++) {
    img.data[i] = img.data[i + 1] = img.data[i + 2] = gray[j]
    img.data[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}
