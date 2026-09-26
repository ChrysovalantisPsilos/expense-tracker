// The shared demo account (profiles.is_demo, 0090): one login the owner hands
// to friends and testers on the test site. The server refuses anything that
// would reach a real person from it, with DEMO_REFUSAL (the same words as
// supabase/functions/_shared/demo.ts; test/demoAccount.test.js keeps the
// three in step), and puts the account back every night. The app hides the
// controls that can't work there.

export const DEMO_REFUSAL = 'That isn’t available on the demo account.'

// Only an explicit true counts: a profile without the 0090 column is a
// regular account.
export const isDemoAccount = (profile) => profile?.is_demo === true
