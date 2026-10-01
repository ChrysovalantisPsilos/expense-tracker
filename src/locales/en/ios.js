// The native iOS app's own words: what it says where it has no web page to
// borrow from (the web's namespaces cover everything else, and the app reads
// them by the same keys). Kept small on purpose.
export default {
  gate: {
    // The legal gate can't record consent in the app yet.
    acceptOnWeb: 'For now, please accept on the website, then come back and tap “Retry”.',
  },
  more: {
    account: 'Account',
    about: 'About',
    version: 'Version {{version}}',
    devProject: 'Connected to the test project (dev.budgeer.com)',
  },
}
