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
