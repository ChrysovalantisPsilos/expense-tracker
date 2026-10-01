// The setup wizard's and the tour's rules (onboardingMath.js), and the tour's
// stops for a phone (tourSteps.tourStops), which the native app shows too.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  WIZARD_STEPS, basicsFields, finishFields, needsOnboarding, tourPending, wizardProgress,
} from '../src/features/onboarding/onboardingMath.js'
import { TOUR_STEPS, tourStops } from '../src/features/onboarding/tourSteps.js'
import { loadLanguage, setLanguage } from '../src/shared/lib/i18n/i18n.js'

test('needsOnboarding: only a loaded profile without onboarded_at', () => {
  assert.equal(needsOnboarding(null), false)
  assert.equal(needsOnboarding({ onboarded_at: null }), true)
  assert.equal(needsOnboarding({ onboarded_at: '2026-09-01T10:00:00Z' }), false)
})

test('tourPending: onboarded, and tour_done exactly false', () => {
  assert.equal(tourPending({ onboarded_at: '2026-09-01T10:00:00Z', tour_done: false }), true)
  assert.equal(tourPending({ onboarded_at: '2026-09-01T10:00:00Z', tour_done: true }), false)
  assert.equal(tourPending({ onboarded_at: '2026-09-01T10:00:00Z' }), false)
  assert.equal(tourPending({ onboarded_at: null, tour_done: false }), false)
  assert.equal(tourPending(null), false)
})

test('the wizard: four steps, the progress bar, the welcome save and the finish', () => {
  assert.deepEqual(WIZARD_STEPS, ['welcome', 'group', 'loop', 'tour'])
  assert.deepEqual([0, 1, 2, 3].map(wizardProgress), [25, 50, 75, 100])
  assert.deepEqual(basicsFields('  Sam ', 'GBP'), { display_name: 'Sam', base_currency: 'GBP' })
  assert.deepEqual(basicsFields('   ', 'EUR'), { display_name: null, base_currency: 'EUR' })
  const now = '2026-10-01T09:00:00.000Z'
  assert.deepEqual(finishFields(now), { onboarded_at: now, tour_done: true })
  assert.deepEqual(finishFields(now, true), { onboarded_at: now })
})

test('tourStops: a phone\'s stops in order, worded in the app\'s language', async () => {
  const phone = tourStops('mobile')
  assert.deepEqual(phone.map((s) => s.id), TOUR_STEPS.filter((s) => s.media !== 'desktop').map((s) => s.id))
  assert.equal(phone.find((s) => s.id === 'more').title, 'More')
  assert.equal(phone.find((s) => s.id === 'account').title, 'Updates and Settings')
  assert.equal(phone[0].route, '/')
  assert.equal(phone.at(-1).target, null)
  assert.deepEqual(tourStops('desktop').map((s) => s.id).filter((id) => id === 'more'), ['more'])
  await loadLanguage('el')
  setLanguage('el')
  try {
    assert.notEqual(tourStops('mobile')[0].title, phone[0].title)
  } finally {
    setLanguage('en')
  }
})
