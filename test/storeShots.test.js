// The App Store pictures (scripts/store-shots): the captions in both
// languages fit the frame's rules, the committed pictures are one per frame
// at the 6.9" size, and the store sample data (the iOS snapshot fixtures as
// the pictures show them, ios/Budgeer/BudgeerTests/Fixtures/store-sample.json)
// only names categories that exist and words the fixtures really hold.
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  FRAMES, LANGS, MAX_TITLE, SIZE, STORE_DIR, captionProblems, headlineParts, outputFile, readCaptions,
} from '../scripts/store-shots/frames.mjs'
import { pngSize } from '../scripts/asc/screenshots.mjs'
import en from '../src/locales/en/index.js'
import el from '../src/locales/el/index.js'

const root = fileURLToPath(new URL('..', import.meta.url))
const tests = path.join(root, 'ios/Budgeer/BudgeerTests')
const sample = JSON.parse(readFileSync(path.join(tests, 'Fixtures/store-sample.json'), 'utf8'))

test('a headline splits into its plain and highlighted runs', () => {
  assert.deepEqual(headlineParts('Add it, *split it*'), [{ text: 'Add it, ', em: false }, { text: 'split it', em: true }])
  assert.deepEqual(headlineParts('*Ο μήνας* σου'), [{ text: 'Ο μήνας', em: true }, { text: ' σου', em: false }])
})

test('both languages caption every frame, within the rules', () => {
  for (const lang of Object.keys(LANGS)) assert.deepEqual(captionProblems(lang, readCaptions(lang)), [], lang)
})

test('a caption without one highlight, too long, missing or unknown is caught', () => {
  const good = readCaptions('en')
  const frames = { ...good.frames, '1-home': { title: 'No highlight here', sub: 'x' } }
  assert.match(captionProblems('en', { ...good, frames }).join(), /exactly one \*highlighted\*/)
  frames['1-home'] = { title: `*${'a'.repeat(MAX_TITLE + 1)}*`, sub: 'x' }
  assert.match(captionProblems('en', { ...good, frames }).join(), /title over/)
  delete frames['1-home']
  frames['9-extra'] = { title: '*x*', sub: 'x' }
  const problems = captionProblems('en', { ...good, locale: 'el', frames }).join('\n')
  assert.match(problems, /locale should be en-US/)
  assert.match(problems, /1-home: needs a title/)
  assert.match(problems, /unknown frame 9-extra/)
})

test('frames sort in the store’s order and land in the upload’s locale folders', () => {
  const ids = FRAMES.map((f) => f.id)
  assert.deepEqual([...ids].sort(), ids)
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(outputFile('en', FRAMES[0]), path.join(STORE_DIR, 'screenshots/en-US/1-home.png'))
  assert.equal(outputFile('el', FRAMES[5]), path.join(STORE_DIR, 'screenshots/el/6-savings.png'))
})

test('the committed pictures are one per frame, 1320×2868', () => {
  for (const locale of Object.values(LANGS)) {
    const dir = path.join(STORE_DIR, 'screenshots', locale)
    if (!existsSync(dir)) continue
    assert.deepEqual(readdirSync(dir).sort(), FRAMES.map((f) => `${f.id}.png`), locale)
    for (const file of readdirSync(dir)) {
      assert.deepEqual(pngSize(readFileSync(path.join(dir, file))), SIZE, `${locale}/${file}`)
    }
  }
})

test('the store sample moves 2020 to a year with the same weekdays', () => {
  const day = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  assert.equal(day(2020, 9, 15), day(2020 + sample.years, 9, 15))
  assert.equal(day(2020, 3, 1), day(2020 + sample.years, 3, 1))
  assert.equal(day(2021, 2, 28), day(2021 + sample.years, 2, 28))
})

test('the store sample’s default keys are default categories, in both languages', () => {
  for (const key of Object.values(sample.defaultKeys)) {
    assert.ok(en.common.defaultCategories[key], key)
    assert.ok(el.common.defaultCategories[key], key)
  }
})

test('the store sample only swaps words the fixtures hold; the Greek ones are Greek', () => {
  const fixtures = path.join(tests, 'Fixtures')
  const sources = [
    ...readdirSync(fixtures).filter((f) => f.endsWith('.json') && f !== 'store-sample.json').map((f) => path.join(fixtures, f)),
    ...readdirSync(tests).filter((f) => f.endsWith('.swift')).map((f) => path.join(tests, f)),
  ].map((f) => readFileSync(f, 'utf8')).join('\n')
  for (const [lang, names] of Object.entries(sample.names)) {
    assert.ok(Object.keys(LANGS).includes(lang), lang)
    for (const [from, to] of Object.entries(names)) {
      assert.ok(sources.includes(JSON.stringify(from)), `${lang}: "${from}" is in no fixture`)
      if (lang === 'el') assert.match(to, /[Ͱ-Ͽ]/, `el: "${to}" has no Greek`)
    }
  }
  for (const name of Object.keys(sample.defaultKeys)) assert.ok(sources.includes(JSON.stringify(name)), name)
})
