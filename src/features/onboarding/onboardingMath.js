// The setup wizard's and the app tour's rules (no React, no I/O), shared by
// the website (OnboardingWizard, App) and the native app, which runs them in
// its core. Unit-tested in test/onboardingMath.test.js.

// The wizard's steps: welcome, first group, stay in the loop, look around.
export const WIZARD_STEPS = ['welcome', 'group', 'loop', 'tour']

// A brand-new account (no profiles.onboarded_at) gets the setup wizard.
export function needsOnboarding(profile) {
  return !!profile && !profile.onboarded_at
}

// The tour picks up by itself (once per session) when the wizard is done but
// the tour was never finished or skipped (the app closed mid-tour, maybe on
// another device). `=== false`: a profile without the 0069 column never
// starts it.
export function tourPending(profile) {
  return !!profile?.onboarded_at && profile.tour_done === false
}

// The wizard's progress bar after `step` (0-based), 0–100.
export function wizardProgress(step) {
  return ((step + 1) / WIZARD_STEPS.length) * 100
}

// The welcome step's save: the name as typed (blank: none) and the currency.
export function basicsFields(name, currency) {
  return { display_name: String(name ?? '').trim() || null, base_currency: currency }
}

// Finishing or closing the wizard stamps onboarded_at (`nowISO`) so it never
// nags again; unless the tour follows, the tour is marked seen too.
export function finishFields(nowISO, tour = false) {
  return { onboarded_at: nowISO, ...(tour ? {} : { tour_done: true }) }
}
