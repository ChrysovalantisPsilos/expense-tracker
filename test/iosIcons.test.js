// The native app's category icons (mobile-core/icons.mjs): the web's Lucide
// icons as template SVG image sets, one per category key of the web's
// registry, and the committed catalog equal to what the generator writes
// today (nothing more in it).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { CATALOG, ROOT, categoryIcons, iconFiles, svgFor } from '../mobile-core/icons.mjs'

test('ios icons: an icon is the SVG the web renders, in black for tinting', () => {
  const svg = svgFor('House')
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="24" height="24" viewBox="0 0 24 24"/)
  assert.match(svg, /stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/)
  assert.doesNotMatch(svg, /class=/)
  assert.throws(() => svgFor('NoSuchIcon'), /no icon NoSuchIcon/)
})

test('ios icons: every category key of the web registry has its icon', async () => {
  const map = await categoryIcons()
  assert.equal(map.utensils, 'Utensils')
  assert.equal(map['bank-fees'], 'Percent')
  assert.equal(map.fallback, 'Tag')
  assert.ok(Object.keys(map).length >= 40)
  const files = await iconFiles()
  for (const key of Object.keys(map)) {
    assert.ok(files[`${CATALOG}/category-${key}.imageset/category-${key}.svg`], key)
  }
})

test('ios icons: the committed catalog matches the generator, with nothing else in it', async () => {
  const files = await iconFiles()
  const sets = (await readdir(resolve(ROOT, CATALOG))).filter((name) => name.endsWith('.imageset')).sort()
  const expected = Object.keys(files).filter((path) => path.endsWith('.svg'))
    .map((path) => path.split('/').at(-2)).sort()
  assert.deepEqual(sets, expected)
  for (const [path, content] of Object.entries(files)) {
    const committed = await readFile(resolve(ROOT, path), 'utf8').catch(() => null)
    assert.equal(committed, content, `${path} is stale: run npm run ios:icons`)
  }
})
