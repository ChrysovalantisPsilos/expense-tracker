// Namespace `whatsnew`: src/features/whatsnew. Each release's words live
// under releases.<release id>.<page id> (title, body, chips.<chip id>, and
// action for a page with a button); releases.js holds the ids.
// Conventions: docs/I18N.md.
export default {
  description: 'The changes in each update. Tap one to see it again.',
  story: {
    counter: 'New · {{page}} of {{pages}} · {{day}}',
  },
  releases: {
    '2026-10-01': {
      planSavings: {
        title: 'Plan counts what you save',
        body: 'Money you put into savings from your salary now shows in Plan and comes off what’s left each month. Tap ⓘ to see how Left over adds up, and what your changes do to each line.',
        chips: { left: 'Left over', savings: 'Put into savings' },
        action: 'Open Plan',
      },
      salaryDots: {
        title: 'Every month’s pay on the chart',
        body: 'Your salary chart now shows each month’s pay as a dot, with your regular pay as a line behind it. A month that was lower or higher stands out as a ring.',
        chips: { month: 'Pay each month', regular: 'Regular pay' },
        action: 'See your salary',
      },
      oneForm: {
        title: 'One way to add',
        body: 'Recurring payments and income are now added from Add: switch on Repeat. The Recurring page is for seeing and editing them, with the same form as Add.',
        chips: { repeat: 'Repeat', edit: 'Edit' },
      },
    },
    '2026-09-30': {
      nextMonth: {
        title: 'Next month, as soon as your salary is in',
        body: 'Salary counting toward next month? Once it’s in, Home lets you open next month to see it start with that income, its budgets and what’s coming up. This month stays the default.',
        chips: { october: 'October', counts: 'Counts for October' },
      },
    },
    '2026-09-29': {
      plan: {
        title: 'Plan: try it before you change it',
        body: 'Plan is a sandbox for your recurring payments and income. Cancel, change or add one and see what it does to your month or year, with ideas to save, like two music services. Nothing real changes until you tap Apply, and you can undo it.',
        chips: { cancel: 'Cancel Netflix', ideas: 'Ideas to save' },
        action: 'Open Plan',
      },
      vouchers: {
        title: 'Meal vouchers',
        body: 'Get meal vouchers with your pay? Set an amount per working day, and public holidays in Belgium or Greece are left out. Home shows what’s on the card and the next top-up. An expense paid from vouchers counts as spending but doesn’t lower your Net.',
        chips: { perDay: 'Per working day', topUp: 'Next top-up' },
        action: 'Set up vouchers',
      },
      salary: {
        title: 'Your salary, over the years',
        body: 'A Your salary card on Insights shows your pay over time, your raises and extras like holiday pay and bonuses. See where it goes in 1 to 10 years if things go on, and how it keeps up with prices in Belgium or Greece.',
        chips: { raises: 'Raises', prices: 'Against prices' },
        action: 'See your salary',
      },
      ai: {
        title: 'Optional AI helpers',
        body: 'Four helpers, each off until you switch it on in Settings › AI helpers. Type it on Add fills in the form from a line like “coffee 3.60 yesterday”, Paid from too. Import suggests categories for new shops, Home’s overview can tell your month in words, and Plan takes a what-if in your own words. You check it all before it’s saved.',
        chips: { typeIt: 'coffee 3.60 yesterday', suggested: 'Suggested' },
        action: 'Open AI helpers',
      },
      more: {
        title: 'And a few more',
        body: 'Import skips entries already in your ledger. Tap a month in Insights’ Last 6 months to see it. Home’s overview shows how your Net adds up, and group spending counts in its category. Plus small polish across the app, an updated Privacy Notice for the AI helpers, and a fix so the app always updates itself.',
        chips: { imports: 'Already added', months: 'Last 6 months' },
      },
    },
    '2026-09-27': {
      greek: {
        title: 'Budgeer in Greek',
        body: 'The whole app now speaks Greek, with the default categories in Greek too. It follows your device’s language, or pick English or Ελληνικά in Settings › Language.',
        chips: { el: 'Ελληνικά', device: 'Like my device' },
        action: 'Choose language',
      },
      whoFor: {
        title: 'Add a shared expense from Add',
        body: 'In a group? Add now asks “Who’s it for?”. Pick a group and split the expense right there, without opening the group first. Swipe for more groups; the ones you used last come first.',
        chips: { question: 'Who’s it for?', group: 'Lisbon trip' },
      },
      savings: {
        title: 'A page for your savings',
        body: 'Savings has its own page: your pot, this month’s savings, your goals and the history. Net worth also gets a Savings account type, and it counts toward your savings.',
        chips: { account: 'Savings account', goals: 'Goals' },
        action: 'Open Savings',
      },
      statements: {
        title: 'Faster statements',
        body: 'PDF and Excel statements are now made on your phone, so your data stays with you. Long ranges that used to hang now finish, and the app stays usable while a big one is prepared.',
        chips: { formats: 'PDF · Excel', long: 'Long ranges' },
      },
      more: {
        title: 'And a few more',
        body: 'See, edit and delete your saved import rules in Settings › Import rules. After an import, Budgeer tells you which dates came in and opens them. Group expenses show profile pictures in Paid by and the split, and the welcome tour starts at Home’s period picker.',
        chips: { rules: 'Import rules', photos: 'Paid by' },
      },
    },
    '2026-09-26': {
      sideways: {
        title: 'Sideways phones, redesigned',
        body: 'Turn your phone on its side for a slim rail, a header that stays put, and a summary strip across the top of Home. Entries sit on one line, and adding an expense puts the amount beside the categories.',
        chips: { strip: 'Spent · Income · Net', oneLine: 'One line' },
      },
      status: {
        title: 'Service status',
        body: 'status.budgeer.com shows whether everything in Budgeer is working, checked every 10 minutes. Find it in Settings › Help, on the Help page and in the site footer.',
        chips: { working: 'All working', every: 'Every 10 min' },
      },
      more: {
        title: 'And a few more',
        body: 'Backups now include your salary setting. And tapping the sun or moon button back to your device’s theme makes the app follow your device again.',
        chips: { backups: 'Backups', device: 'Match device' },
      },
    },
    '2026-09-25': {
      imports: {
        title: 'Smarter bank imports',
        body: 'KBC and Revolut statements (Revolut’s consolidated statement too) now import cleanly, with real shop names instead of bank jargon. Transfers between your own accounts and Revolut top-ups are left out, and money in and money out are listed separately when you pick categories.',
        chips: { shop: 'LIDL', transfer: 'Own transfer · left out' },
      },
      period: {
        title: 'Home follows the period you pick',
        body: 'Budgets and Recurring change with the month or year you select, a new Income list sits under Expenses, and every category is one tap away with Show all. Recurring payments in other currencies now count at today’s rate.',
        chips: { month: 'August 2025', showAll: 'Show all' },
      },
      salary: {
        title: 'Your salary, in the right month',
        body: 'Paid near the end of the month for the next one? Turn it on and your salary counts toward the next month. The entry keeps its real date.',
        chips: { counts: 'Oct · Salary', paid: '30 Sep' },
        action: 'Open settings',
      },
      savings: {
        title: 'Savings, your way',
        body: 'Log money you put aside under Savings: it never counts as income, and it adds up in a Savings line in your net worth. Say whether it came from your income, and mark expenses you paid from savings so your Net stays honest.',
        chips: { savings: 'Savings', fromIncome: 'From income' },
      },
      more: {
        title: 'And a few more',
        body: 'Friends & family and Bonus income categories are ready to use. Signing up now continues by itself once you confirm your email, Settle up shows how to pay someone directly, and phones held sideways get a roomier layout.',
        chips: { family: 'Friends & family', bonus: 'Bonus' },
      },
    },
  },
}
