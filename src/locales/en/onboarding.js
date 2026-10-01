// Namespace `onboarding`: src/features/onboarding (the setup wizard and the
// app tour). Conventions: docs/I18N.md.
export default {
  wizard: {
    skipSetup: 'Skip setup',
    welcome: {
      title: 'Welcome to Budgeer',
      lead: 'Track your spending and split costs with friends. Let’s set up the basics — this takes under a minute.',
      currencyHelp: 'It’s fixed once you add your first entry, so past amounts stay correct.',
      failed: 'Couldn’t save your details',
    },
    group: {
      title: 'Split costs with friends',
      lead: 'A group keeps track of shared costs for a trip or a household, and of who owes whom. Start one now if you like — or any time from Groups.',
      label: 'Name your first group (optional)',
      placeholder: 'Corfu trip, Flatmates…',
      created: 'Group “{{name}}” created',
    },
    loop: {
      title: 'Stay in the loop',
      lead: 'Get a nudge when friends add expenses or bills are due, and log in faster next time.',
      enable: 'Enable notifications',
      enabled: 'Notifications set',
      addPasskey: 'Add a passkey',
      on: 'Notifications on',
      blocked: 'Notifications blocked — you can enable them later in Settings',
      iphone: 'On iPhone, install Budgeer to your home screen for push',
      later: 'You can change both anytime in Settings.',
    },
    tour: {
      title: 'Let’s take a quick look around',
      lead: 'A one-minute tour of where things are: adding expenses, groups, budgets and more. You can take it again any time from Settings.',
      skip: 'Skip tour',
      start: 'Start tour',
    },
    continue: 'Continue',
    finishFailed: 'Couldn’t finish',
  },
  tourLabel: 'App tour',
  // The app tour's stops (tourSteps.js holds these keys).
  tour: {
    period: {
      title: 'Pick the period',
      body: 'Home shows this month. Switch to another month, this year or all time here, and every card follows.',
    },
    overview: {
      title: 'Your month at a glance',
      body: 'What you spent, earned and kept in the period you picked.',
    },
    categories: {
      title: 'Where it goes',
      body: 'Your spending by category. Tap one to open its page: its entries for any period, its budget, and its name, icon and colour.',
    },
    subscriptions: {
      title: 'Recurring',
      body: 'Your recurring bills by how often they charge — weekly, monthly, quarterly or yearly — with the next charges. Manage opens Recurring.',
    },
    addExpense: {
      title: 'Add an expense or income',
      body: 'Opens a page for the amount (in any currency), category, date and notes. Switch on Repeat for a bill that comes back. Tap any entry to edit it.',
    },
    search: {
      title: 'Search and filters',
      body: 'Everything you spend and earn, in one list you can search. To import a bank or card statement, use the ⋯ menu at the top.',
    },
    groups: {
      title: 'Groups',
      body: 'Split bills with friends and invite them with a link. Budgeer keeps track of who owes whom.',
    },
    budgets: {
      title: 'Budgets',
      body: 'Set a monthly limit for each category; what you don’t spend can carry over. Tap a budget to open its category.',
    },
    moreMobile: {
      title: 'More',
      body: 'Insights (trends and net worth), Savings (your pot and goals), Recurring and Settings are here.',
    },
    moreDesktop: {
      title: 'Insights, Savings and Recurring',
      body: 'Trends and net worth, your savings pot and goals, plus your subscriptions, bills and regular income.',
    },
    accountMobile: {
      title: 'Updates and Settings',
      body: 'The bell shows what’s new, and your picture opens Settings, where you can also pick light or dark.',
    },
    accountDesktop: {
      title: 'Your account',
      body: 'Settings, light or dark, and sign-out. The bell at the top shows what’s new.',
    },
    privacy: {
      title: 'Privacy and security',
      body: 'How you log in (password, Google, Apple, passkeys), backups of your data, and Privacy: your data rights, consents and requests.',
    },
    done: {
      title: 'You’re all set',
      body: 'Questions? Settings → Help & FAQ has answers, and you can take this tour again from there.',
    },
  },
}
