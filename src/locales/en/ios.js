// The native iOS app's own words: what it says where it has no web page to
// borrow from (the web's namespaces cover everything else, and the app reads
// them by the same keys). Kept small on purpose.
export default {
  gate: {
    // "I don't agree" on the legal gate (the app offers signing out; deleting
    // the account is the website's from there).
    declined: 'Without accepting, you can’t use Budgeer. You can sign out, or delete your account on the website (Settings › Security).',
  },
  more: {
    version: 'Version {{version}}',
    devProject: 'Connected to the test project (dev.budgeer.com)',
  },
  // The native frame and screens.
  native: {
    seeAll: 'See all',
    // Settings › Notifications when iOS doesn't allow Budgeer's notifications.
    push: {
      off: 'Notifications are off for Budgeer on this iPhone. Allow them in Settings › Notifications › Budgeer.',
      openSettings: 'Open Settings',
    },
    profile: 'Profile and settings',
    more: {
      // More's first row: the way in to Settings.
      accountSettings: 'Account & settings',
    },
    insights: {
      // The statement row's button (it opens PDF or Excel).
      export: 'Export',
    },
    tabs: {
      activity: 'Activity',
      add: 'Add',
    },
    home: {
      comingUp: 'Coming up',
      byCategory: 'By category',
    },
    // Your salary's Against prices: the country and the year compared from, as one menu.
    salary: {
      pricesFrom: '{{country}} · since {{year}}',
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
    // Scan a receipt on Add (the phone reads the photo; nothing is uploaded).
    receipt: {
      camera: 'Take a photo',
      library: 'Choose a photo',
      nothingRead: 'Couldn’t read much from this photo — fill in what you can, or try another photo.',
      // Info.plist's NSCameraUsageDescription (iOS shows it the first time).
      cameraUsage: 'Budgeer uses the camera to read a receipt on this iPhone. The photo isn’t saved or uploaded.',
    },
    // Joining a group from an invite link (the Groups tab, a budgeer:// link).
    join: {
      entry: 'Join with a link',
      lead: 'Paste the invite link a friend sent you, or just its code.',
      field: 'Invite link',
      paste: 'Paste',
      next: 'Continue',
      notLink: 'That isn’t an invite link. It looks like budgeer.com/join/…',
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
    // Settings › Your data › Export backup: the file is made on the phone,
    // then handed to the share sheet (the web downloads it instead).
    backup: {
      save: 'Save backup file',
      ready: 'Your backup is ready. Save it to Files, or send it somewhere safe.',
    },
    lock: {
      setting: 'Face ID lock',
      settingNote: 'Ask for Face ID (or your passcode) when Budgeer opens, and after a minute away.',
      unavailable: 'Set up Face ID or a passcode on this iPhone, or an app PIN below, to use the lock.',
      locked: 'Budgeer is locked',
      note: 'Your money stays private until you look.',
      unlock: 'Unlock',
      reason: 'Unlock Budgeer',
      // Info.plist's NSFaceIDUsageDescription (iOS shows it the first time).
      usage: 'Budgeer uses Face ID to keep your money private.',
      // The app's own PIN, for when Face ID fails or isn't there.
      pin: {
        title: 'App PIN',
        note: 'A 4–6 digit PIN that opens Budgeer when Face ID doesn’t. It stays on this iPhone, kept as a salted hash, never the digits.',
        use: 'Use PIN',
        enter: 'Enter your Budgeer PIN',
        wrong: 'That’s not the PIN. Try again.',
        wait_one: 'Too many tries. Try again in {{count}} second.',
        wait_other: 'Too many tries. Try again in {{count}} seconds.',
        set: 'Set up a PIN',
        change: 'Change PIN',
        remove: 'Remove PIN',
        current: 'Enter your current PIN',
        new: 'Choose a PIN of 4–6 digits',
        next: 'Next',
        confirm: 'Enter the same PIN again',
        mismatch: 'Those PINs don’t match. Choose one again.',
        saved: 'PIN saved',
        removed: 'PIN removed',
      },
    },
  },
}
