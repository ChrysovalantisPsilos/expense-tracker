import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  fitScale, cropPixels, toGrayscale, stretchContrast, adaptiveThreshold,
} from '../src/shared/lib/receiptImage.js'

test('fitScale: big photos shrink to 2000px, tiny ones grow (≤2×), the rest stay', () => {
  assert.equal(fitScale(4000, 3000), 0.5)
  assert.equal(fitScale(3000, 4000), 0.5)
  assert.equal(fitScale(1500, 800), 1)
  assert.equal(fitScale(600, 400), 1000 / 600)
  assert.equal(fitScale(200, 100), 2)
  assert.equal(fitScale(0, 0), 1)
})

test('cropPixels: fractions → pixels, clamped; slivers and no crop mean the whole image', () => {
  assert.deepEqual(cropPixels(null, 1000, 800), { sx: 0, sy: 0, sw: 1000, sh: 800 })
  assert.deepEqual(cropPixels({ x: 0.1, y: 0.2, w: 0.5, h: 0.5 }, 1000, 800), { sx: 100, sy: 160, sw: 500, sh: 400 })
  assert.deepEqual(cropPixels({ x: 0.9, y: -0.5, w: 0.5, h: 1 }, 1000, 800), { sx: 900, sy: 0, sw: 100, sh: 400 })
  assert.deepEqual(cropPixels({ x: 0.5, y: 0.5, w: 0.01, h: 0.5 }, 1000, 800), { sx: 0, sy: 0, sw: 1000, sh: 800 })
})

test('toGrayscale: Rec. 601 luma per pixel', () => {
  const rgba = Uint8ClampedArray.from([255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255])
  assert.deepEqual([...toGrayscale(rgba)], [255, 0, 76, 150])
})

test('stretchContrast: a washed-out range spans 0–255; a flat image is left alone', () => {
  const gray = Uint8ClampedArray.from({ length: 200 }, (_, i) => 100 + (i % 51)) // 100..150
  stretchContrast(gray)
  assert.equal(Math.min(...gray), 0)
  assert.equal(Math.max(...gray), 255)
  const flat = new Uint8ClampedArray(50).fill(128)
  assert.deepEqual([...stretchContrast(flat)], [...new Uint8ClampedArray(50).fill(128)])
})

test('adaptiveThreshold: dark text stays ink under a lighting gradient; paper turns white', () => {
  // 64×32 "paper" getting darker left→right (220 → 120), with a 2px dark
  // stroke at x=10 and x=50 that is ~40% darker than its surroundings.
  const w = 64; const h = 32
  const gray = new Uint8ClampedArray(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const paper = 220 - (100 * x) / (w - 1)
      const ink = x === 10 || x === 11 || x === 50 || x === 51
      gray[y * w + x] = ink ? paper * 0.6 : paper
    }
  }
  adaptiveThreshold(gray, w, h)
  const at = (x, y) => gray[y * w + x]
  assert.equal(at(10, 16), 0)
  assert.equal(at(50, 16), 0)
  assert.equal(at(30, 16), 255) // mid paper
  assert.equal(at(62, 16), 255) // dark paper on the right is still paper
  assert.ok([...gray].every((v) => v === 0 || v === 255))
})
