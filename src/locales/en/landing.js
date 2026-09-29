// Namespace `landing`: the public landing page (src/features/landing).
export default {
  hero: {
    // <br/> breaks the line; <accent> is the coral second half.
    title: 'Track your money.<br/><accent>Split with friends.</accent>',
    lead: 'A free expense tracker and bill splitter. Log spending and income, set budgets, split trips and flats with friends, and pay them back by IBAN, Revolut or PayPal in a tap. No limits, no ads.',
    start: 'Get started — it’s free',
    haveAccount: 'I already have an account',
  },
  how: {
    eyebrow: 'How it works',
    title: 'Shared costs, sorted in three steps',
    step: 'Step {{n}}',
    invite: {
      title: 'Create a group & invite friends with a link',
      body: 'Create a group for a trip, your flat or a night out, share one invite link, and friends join with a free account.',
      copy: 'Copy',
      copied: 'Copied',
      joined: '{{name}} joined',
      share: 'Share the link',
      allIn: 'Everyone’s in the group',
      freeAccount: 'Friends join with a free account',
    },
    split: {
      title: 'Add expenses as you go',
      body: 'Log who paid, in any currency. Split equally, or by amount, percentage or shares.',
      equally: 'Split equally · {{amount}} each',
      yourShare: 'Your share, in your spending:',
    },
    settle: {
      title: 'See who owes what and settle up',
      body: 'Budgeer works out the fewest payments to square up, and shows each friend’s IBAN, Revolut or PayPal to pay back.',
      done: 'All settled up',
      payments_one: '{{count}} payment settles everyone',
      payments_other: '{{count}} payments settle everyone',
    },
  },
  showcase: {
    budgets: {
      eyebrow: 'Budgets & tracking',
      title: 'Know where every euro goes',
      body: 'Log expenses and income and set a monthly budget for each category — it carries over to the next month. Bars turn amber at 80% and red when you’re over, and Budgeer notifies you when you cross either line.',
    },
    insights: {
      eyebrow: 'Insights',
      title: 'Your spending, at a glance',
      body: 'See what you spend by category and your last six months side by side, with the change from last month.',
    },
    currency: {
      eyebrow: 'Multi-currency',
      title: 'Spend abroad, track at home',
      body: 'Add expenses in the currency you paid in, on your own or in a group. Budgeer converts them at the European Central Bank rate for that day, and each one keeps its rate, so past totals never shift.',
    },
    ai: {
      eyebrow: 'Optional AI helpers',
      title: 'Type it, and it’s filled in',
      body: 'Write “coffee 3.60 yesterday” and Add fills in the amount, category, date and more, for you to check and save. Import can suggest categories for new merchants, and Insights can sum up your month in a few lines.',
      // One line under the three helpers' names, then a link to the FAQ.
      note: 'Optional, and off until you turn it on. It uses Claude by Anthropic and sends only what each helper needs.',
      how: 'How it works',
    },
  },
  also: {
    eyebrow: 'Also included',
    title: 'Everything else, free too',
    payBack: 'Pay back by IBAN, Revolut or PayPal',
    splitWays: 'Split by amount, percent or shares',
    receipts: 'Receipt scan on your device',
    import: 'Import from CSV or Excel',
    recurring: 'Recurring payments',
    savings: 'Savings goals and net worth',
    statements: 'PDF and Excel statements',
    backups: 'Encrypted backups',
    atRest: 'Encrypted at rest',
  },
  honest: {
    title: 'Made by one person, for fun',
    lead: 'There’s no company behind Budgeer — just one person building it in their spare time. Here’s what that means.',
    whoRuns: 'Who runs Budgeer?',
    terms: 'Terms of Use',
    free: { title: 'Free, with no ads', body: 'Every feature is free. No ads, no analytics, no cookies, and your data is never sold.' },
    notBank: { title: 'Not a bank or an adviser', body: 'Budgeer never holds or moves money, and it doesn’t give financial, tax or legal advice.' },
    eu: { title: 'Stored in the EU', body: 'Our database is hosted in the EU, in Paris, France.' },
    care: { title: 'Looked after with care', body: 'It can still have bugs or downtime, so check important figures against your bank.' },
  },
  closing: {
    // <accent> is the coral part.
    title: 'Start splitting — <accent>it’s free</accent>',
    lead: 'Create your first group and invite friends with a link. No limits, no ads.',
  },
  footer: {
    help: 'Help',
    install: 'Install the app',
    privacy: 'Privacy',
    terms: 'Terms',
    status: 'Status',
    contact: 'Contact',
  },
  // The illustrations' sample data (landingDemo.js): names, labels and the
  // mock cards' own words.
  demo: {
    people: { you: 'You', anna: 'Anna', marco: 'Marco', sofia: 'Sofia' },
    trip: {
      name: 'Lisbon weekend',
      label: 'Example group “{{name}}”: four friends split trip expenses and see who owes what.',
      e1: 'Airbnb',
      e2: 'Dinner at Time Out',
      e3: 'Taxi to Belém',
      e4: 'Pastéis de nata',
    },
    paidBy: 'Paid by {{name}}',
    total: 'Total',
    balances: 'Balances',
    owesYou: '{{name}} owes you',
    settleUp_one: 'Settle up · {{count}} payment',
    settleUp_other: 'Settle up · {{count}} payments',
    groceriesForFlat: 'Groceries for the flat',
    categories: {
      groceries: 'Groceries',
      foodDining: 'Food & Dining',
      transport: 'Transport',
      entertainment: 'Entertainment',
      housing: 'Housing',
      other: 'Other',
      salary: 'Salary',
    },
    budgets: {
      title: 'September budgets',
      label: 'Example monthly budgets: progress bars per category, with Food & Dining over budget and Groceries nearly at its cap.',
      of: '{{spent}} of {{cap}}',
    },
    insights: {
      title: 'Where your money went',
      label: 'Example insights: spending split by category and a six-month spending trend.',
      last6: 'Last 6 months',
    },
    currency: {
      title: 'Travel spending in {{base}}',
      label: 'Example: expenses in pounds, dollars and yen converted to {{base}} at the rate captured when each was added.',
      train: 'Train to London',
      hotel: 'NYC hotel night',
      ramen: 'Ramen in Tokyo',
    },
    // The AI helpers' illustration (aiDemo.js): the lines typed into
    // "Type it" and the descriptions they fill in, by example id.
    ai: {
      label: 'Example: typing “coffee 3.60 yesterday” fills in the Add form with €3.60, Food & Dining, yesterday’s date, the description “Coffee” and Paid from Bank, each marked Suggested for you to check.',
      lines: { coffee: 'coffee 3.60 yesterday', salary: 'salary 2450 today' },
      descriptions: { coffee: 'Coffee', salary: 'Salary' },
    },
  },
}
