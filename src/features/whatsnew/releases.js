// The "What's new" story's content: one entry per production release, newest
// first. Add the new release at the top when shipping; whatsNewMath.js shows
// it once per account (test/whatsNew.test.js checks the shape).
//   id, date  — the release day, 'YYYY-MM-DD' (the id is what's remembered)
//   pages     — 1–5 pages, one change each:
//     title, body — short and plain
//     chips       — 1–2 short labels floating around the ring picture
//     variant     — the ring picture: 'update' (default), 'start' or 'split'
//     action      — optional { label, to }: a button that opens that page
export const RELEASES = [
  {
    id: '2026-09-25',
    date: '2026-09-25',
    pages: [
      {
        title: 'Smarter bank imports',
        body: 'KBC and Revolut statements (Revolut’s consolidated statement too) now import cleanly, with real shop names instead of bank jargon. Transfers between your own accounts and Revolut top-ups are left out, and money in and money out are listed separately when you pick categories.',
        chips: ['LIDL', 'Own transfer · left out'],
        variant: 'split',
      },
      {
        title: 'Home follows the period you pick',
        body: 'Budgets and Recurring change with the month or year you select, a new Income list sits under Expenses, and every category is one tap away with Show all. Recurring payments in other currencies now count at today’s rate.',
        chips: ['August 2025', 'Show all'],
        variant: 'update',
      },
      {
        title: 'Your salary, in the right month',
        body: 'Paid near the end of the month for the next one? Turn it on and your salary counts toward the next month. The entry keeps its real date.',
        chips: ['Oct · Salary', '30 Sep'],
        variant: 'start',
        action: { label: 'Open settings', to: '/settings/spending' },
      },
      {
        title: 'Savings, your way',
        body: 'Log money you put aside under Savings: it never counts as income, and it adds up in a Savings line in your net worth. Say whether it came from your income, and mark expenses you paid from savings so your Net stays honest.',
        chips: ['Savings', 'From income'],
        variant: 'update',
      },
      {
        title: 'And a few more',
        body: 'Friends & family and Bonus income categories are ready to use. Signing up now continues by itself once you confirm your email, Settle up shows how to pay someone directly, and phones held sideways get a roomier layout.',
        chips: ['Friends & family', 'Bonus'],
        variant: 'split',
      },
    ],
  },
]
