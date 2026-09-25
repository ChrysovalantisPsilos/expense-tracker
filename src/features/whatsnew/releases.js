// The "What's new" story's content: one entry per production release, newest
// first. Add the new release at the top when shipping; whatsNewMath.js shows
// it once per device (test/whatsNewReleases.test.js checks the shape).
//   id, date  — the release day, 'YYYY-MM-DD' (the id is what's remembered)
//   pages     — 1–5 pages, one change each:
//     title, body — short and plain
//     chips       — 1–2 short labels floating around the ring picture
//     variant     — the ring picture: 'update' (default), 'start' or 'split'
//     action      — optional { label, to }: a button that opens that page
export const RELEASES = [
  {
    id: '2026-09-26',
    date: '2026-09-26',
    pages: [
      {
        title: 'Smarter bank imports',
        body: 'KBC and Revolut statements (Revolut’s consolidated statement too) now import cleanly, with real shop names instead of bank jargon. Transfers between your own accounts and Revolut top-ups are left out, and money in and money out are listed separately when you pick categories.',
        chips: ['LIDL', 'Own transfer · left out'],
        variant: 'split',
      },
      {
        title: 'Home follows the period you pick',
        body: 'Budgets and Subscriptions now change with the month or year you select. And there’s a new Income list, right under Expenses.',
        chips: ['August 2025', 'Income'],
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
        title: 'New income categories',
        body: 'Friends & family, Bonus and Savings are ready to use. Savings entries don’t count as income: they add up in a Savings line in your net worth on Insights.',
        chips: ['Savings', 'Friends & family'],
        variant: 'update',
      },
    ],
  },
]
