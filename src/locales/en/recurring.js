// Namespace `recurring`: src/features/recurring (the Recurring page, a rule's
// page and form, the Repeat fields, and Home's Recurring card), plus the
// frequency and group labels recurringMath.js builds. Conventions: docs/I18N.md.
export default {
  kinds: {
    expense: 'Expense',
    income: 'Income',
  },
  // frequencyLabel(): "every month", "every 2 weeks", "every quarter".
  frequency: {
    quarterly: 'every quarter',
    every: {
      daily: 'every day',
      weekly: 'every week',
      monthly: 'every month',
      yearly: 'every year',
    },
    everyN: {
      daily_one: 'every {{count}} days',
      daily_other: 'every {{count}} days',
      weekly_one: 'every {{count}} weeks',
      weekly_other: 'every {{count}} weeks',
      monthly_one: 'every {{count}} months',
      monthly_other: 'every {{count}} months',
      yearly_one: 'every {{count}} years',
      yearly_other: 'every {{count}} years',
    },
  },
  // The Repeat choices, and the subscription groups' tabs.
  choices: {
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    yearly: 'Yearly',
  },
  groups: {
    total: {
      weekly: 'Weekly total',
      monthly: 'Monthly total',
      quarterly: 'Quarterly total',
      yearly: 'Yearly total',
    },
    charged: {
      weekly: 'Weekly charged',
      monthly: 'Monthly charged',
      quarterly: 'Quarterly charged',
      yearly: 'Yearly charged',
    },
    perUnit: {
      week: '{{amount}}/week',
      month: '{{amount}}/month',
      quarter: '{{amount}}/quarter',
      year: '{{amount}}/year',
    },
    aboutPerMonth: '≈ {{amount}}/month',
  },
  // chargedWording(): Home's card for a period other than this month.
  charged: {
    soFar: 'Charged so far',
    noneYet: 'No recurring charges yet.',
    thisYear: 'Charged this year',
    noneThisYear: 'No recurring charges this year.',
    inPeriod: 'Charged in {{period}}',
    noneInPeriod: 'No recurring charges in {{period}}.',
  },
  list: {
    title: 'Recurring',
    what: 'recurring payments',
    tabs: {
      subscriptions: 'Subscriptions',
      income: 'Income',
    },
    incomeIntro: 'Money that comes in on a schedule, like your salary — it’s added to your income on each date.',
    emptySubscriptions: {
      title: 'No subscriptions or bills yet',
      text: 'Add the bills and subscriptions that repeat, like rent or streaming, and Budgeer logs each one on its date.',
      add: 'Add a subscription or bill',
    },
    emptyIncome: {
      title: 'No recurring income yet',
      add: 'Add recurring income',
    },
    byFrequency: 'Subscriptions by frequency',
    recurringIncome: 'Recurring income',
    updateFailed: 'Couldn’t update the recurring entry. Please try again.',
    removed: 'Recurring entry removed',
    removeFailed: 'Couldn’t remove the recurring entry. Please try again.',
    remove: {
      title: 'Remove recurring entry?',
      body: '“{{name}}” will stop repeating. Transactions it already created stay.',
      thisEntry: 'This entry',
      confirm: 'Remove',
    },
  },
  row: {
    pause: 'Pause',
    resume: 'Resume',
    next: 'next {{date}}',
    due: 'due {{date}} · added tonight',
    budgetShare: '{{amount}}/mo in budgets',
    remindDays: '{{days}}d',
    paused: 'Paused',
  },
  // A rule's page (RecurringForm): Add's fields (transactions:form), plus these.
  form: {
    updated: 'Recurring entry updated',
    saveChanges: 'Save changes',
    repeatSubtitle: 'It’s logged on this schedule',
    eachChargeRate: 'Each charge is converted at the exchange rate of its day.',
    nextMissed: 'Any charges missed since then are added tonight.',
  },
  page: {
    editTitle: 'Edit recurring entry',
    what: 'this recurring entry',
    gone: 'This recurring entry doesn’t exist any more.',
    goToList: 'Go to Recurring',
  },
  // RepeatFields: the schedule, shared with the transaction page's Repeat.
  repeat: {
    howOften: 'How often',
    every: 'Every',
    units: {
      daily: 'days',
      weekly: 'weeks',
      monthly: 'months',
      yearly: 'years',
    },
    everyHowMany: {
      daily: 'Every how many days',
      weekly: 'Every how many weeks',
      monthly: 'Every how many months',
      yearly: 'Every how many years',
    },
    countsAs: 'Counts as {{amount}}/month in budgets, spread over {{months}} months.',
    countsAsAbout: 'Counts as about {{amount}}/month in budgets, spread over {{months}} months.',
    nextCharge: 'Next charge',
    endDate: 'Set an end date',
    remind: 'Remind me before each charge',
    remindDays: 'Days before each charge',
    daysBefore: 'days before, via notification',
    paused: 'Paused',
    pausedHelp: 'No new charges are added while it’s paused.',
    push: {
      blocked: 'Push blocked',
      blockedText: 'Reminders will show in the app’s notification bell instead.',
      unsupported: 'Push isn’t available in this browser',
      unsupportedText: 'On iPhone, install Budgeer to your home screen first. Reminders will still show in the bell.',
      failed: 'Couldn’t enable push on this device',
      failedText: 'Reminders will show in the app’s notification bell.',
    },
  },
  // Home's Recurring card (SubscriptionsCard).
  card: {
    manage: 'Manage',
    yearlySeparate: 'Kept out of your monthly spending (Settings › Monthly spending).',
    yearlySpread: 'Each counts in your monthly spending a twelfth at a time.',
    whatUpcoming: 'your recurring payments',
    whatCharged: 'your recurring charges',
    empty: 'No recurring payments yet. Add an expense and switch on Repeat to log it on a schedule.',
    add: 'Add a recurring payment',
    upcomingByFrequency: 'Recurring payments by frequency',
    chargedByFrequency: 'Recurring charges by frequency',
    nextCharges: 'Next charges',
    showAll: 'Show all {{n}} charges',
    showNext: 'Show the next {{n}}',
    charges_one: '{{count}} charge',
    charges_other: '{{count}} charges',
  },
  // Under a total built from recurring rules (SubscriptionGroups' RatesNote).
  rates: {
    converted: 'Other currencies converted at today’s rate.',
    missing: '{{amounts}} not included — no exchange rate right now.',
  },
}
