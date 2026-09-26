// Namespace `whatsnew`: src/features/whatsnew. Each release's words live
// under releases.<release id>.<page id> (title, body, chips.<chip id>, and
// action for a page with a button); releases.js holds the ids.
// Conventions: docs/I18N.md.
export default {
  description: 'The changes in each update. Tap one to see it again.',
  story: {
    counter: 'New · {{page}} of {{pages}} · {{day}}',
    skip: 'Skip',
    next: 'Next',
    done: 'Done',
  },
  releases: {
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
