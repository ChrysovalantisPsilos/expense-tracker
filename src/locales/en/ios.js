// The native iOS app's own words: what it says where it has no web page to
// borrow from (the web's namespaces cover everything else, and the app reads
// them by the same keys). Kept small on purpose.
export default {
  gate: {
    // The legal gate can't record consent in the app yet.
    acceptOnWeb: 'For now, please accept on the website, then come back and tap “Retry”.',
  },
  soon: {
    title: 'Coming to the app soon',
    body: 'This part of Budgeer isn’t in the app yet. Use budgeer.com for now.',
  },
  more: {
    account: 'Account',
    about: 'About',
    version: 'Version {{version}}',
    devProject: 'Connected to the test project (dev.budgeer.com)',
  },
}
