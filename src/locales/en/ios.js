// The native iOS app's own words: what it says where it has no web page to
// borrow from (the web's namespaces cover everything else, and the app reads
// them by the same keys). Kept small on purpose.
export default {
  gate: {
    // The legal gate can't record consent in the app yet.
    acceptOnWeb: 'For now, please accept on the website, then come back and tap “Retry”.',
  },
  more: {
    version: 'Version {{version}}',
    devProject: 'Connected to the test project (dev.budgeer.com)',
  },
  // The native frame and screens.
  native: {
    seeAll: 'See all',
    profile: 'Profile and settings',
    tabs: {
      activity: 'Activity',
      add: 'Add',
    },
    home: {
      comingUp: 'Coming up',
      byCategory: 'By category',
    },
    add: {
      pullUp: 'Pull up for repeat, notes and groups',
    },
    activity: {
      duplicate: 'Duplicate',
      split: 'Split',
      previousMonth: 'Previous month',
      nextMonth: 'Next month',
      clearFilters: 'Clear filters',
      // The month's header (rowParts.monthPulse).
      peak: 'Biggest day: {{day}} · {{amount}}',
      peakIncome: 'Most in: {{day}} · {{amount}}',
    },
    group: {
      commentOn: 'Comment on {{name}}',
    },
    // Savings: deleting a goal asks first (the web deletes at once).
    savings: {
      deleteGoal: 'Delete the goal “{{name}}”?',
    },
    // A group's Balances page.
    balances: {
      everyone: 'Everyone',
      owes: 'Owes',
      getsBack: 'Gets back',
    },
    // The new-group flow (NewGroupModel).
    newGroup: {
      shareLink: 'Also make a share link',
      next: {
        title: 'What happens next',
        create: 'The group is made in {{currency}}, with you as its owner.',
        noInvites: 'You can invite people now, or later from Members.',
        invites_one: '{{count}} invite goes out: someone on Budgeer gets a request in the app, anyone else an email with a link.',
        invites_other: 'Your {{count}} invites go out: people on Budgeer get a request in the app, everyone else an email with a link.',
        link: 'You get a link to share in any chat.',
        expense: 'Then add the first expense, and Budgeer keeps everyone’s balance.',
      },
      done: '{{name}} is ready',
      open: 'Open the group',
    },
    lock: {
      setting: 'Face ID lock',
      settingNote: 'Ask for Face ID (or your passcode) when Budgeer opens, and after a minute away.',
      unavailable: 'Set up Face ID or a passcode on this iPhone to use the lock.',
      locked: 'Budgeer is locked',
      note: 'Your money stays private until you look.',
      unlock: 'Unlock',
      reason: 'Unlock Budgeer',
      // Info.plist's NSFaceIDUsageDescription (iOS shows it the first time).
      usage: 'Budgeer uses Face ID to keep your money private.',
    },
  },
}
