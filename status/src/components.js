// The nine parts of Budgeer the status page reports on, in display order.
// `verb` and `slowWord` let the headline read naturally ("Email is running
// slow", "Exchange rates are running late"); `note` says what people notice
// when that part is slow or down.
export const COMPONENTS = [
  { id: 'app', name: 'App & website', icon: 'app', verb: 'are',
    desc: 'Opening Budgeer on your phone or at budgeer.com' },
  { id: 'auth', name: 'Sign-in & accounts', icon: 'lock', verb: 'are',
    desc: 'Logging in, sign-up and password resets' },
  { id: 'sync', name: 'Syncing your data', icon: 'sync', verb: 'is',
    desc: 'Saving entries and seeing them on your other devices' },
  { id: 'groups', name: 'Group splitting', icon: 'users', verb: 'is',
    desc: 'Shared groups, splits and settle-ups' },
  { id: 'email', name: 'Email', icon: 'mail', verb: 'is',
    desc: 'Group invites and verification emails' },
  { id: 'push', name: 'Push notifications', icon: 'bell', verb: 'are',
    desc: 'Alerts when friends add or settle an expense' },
  { id: 'reports', name: 'Reports', icon: 'file', verb: 'are',
    desc: 'PDF and Excel statements' },
  { id: 'fx', name: 'Exchange rates', icon: 'fx', verb: 'are', slowWord: 'running late',
    desc: 'Daily rates from the European Central Bank',
    note: 'New entries in other currencies use the latest rate we have for now. Anything you’ve already saved keeps the rate it was saved with.' },
  { id: 'bank', name: 'Bank imports', icon: 'bank', verb: 'are',
    desc: 'Importing statements from your bank' },
]

export const COMPONENT_IDS = COMPONENTS.map((c) => c.id)
export const componentById = (id) => COMPONENTS.find((c) => c.id === id)
export const componentNames = (ids) => ids.map((id) => componentById(id)?.name).filter(Boolean)
