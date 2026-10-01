// The "What's new" story's content: one entry per production release, newest
// first. Add the new release at the top when shipping; whatsNewMath.js shows
// it once per account (test/whatsNew.test.js checks the shape).
//   id, date  — the release day, 'YYYY-MM-DD' (the id is what's remembered)
//   pages     — 1–5 pages, one change each:
//     id          — the page's key: its words are whatsnew:releases.<release
//                   id>.<page id>.title / .body (short and plain)
//     chips       — 1–2 chip ids: short labels floating around the ring
//                   picture, at …<page id>.chips.<chip id>
//     variant     — the ring picture: 'update' (default), 'start' or 'split'
//     action      — optional { to }: a button that opens that page; its
//                   label is …<page id>.action
//
// Every release is written in BOTH languages: add its words to
// src/locales/en/whatsnew.js AND src/locales/el/whatsnew.js in the same
// change (test/i18n.test.js fails when a key is missing in either; the
// Greek wording follows docs/i18n-glossary-el.md).
export const RELEASES = [
  {
    id: '2026-10-04',
    date: '2026-10-04',
    pages: [
      { id: 'widgets', chips: ['month', 'lock'], variant: 'start' },
      { id: 'links', chips: ['opens', 'passkey'], variant: 'update', action: { to: '/settings/security' } },
    ],
  },
  {
    id: '2026-10-03',
    date: '2026-10-03',
    pages: [
      { id: 'iphone', chips: ['testFlight', 'same'], variant: 'start' },
      { id: 'apple', chips: ['apple', 'connect'], variant: 'update', action: { to: '/settings/security' } },
      { id: 'groups', chips: ['cover', 'shares'], variant: 'split', action: { to: '/groups' } },
      { id: 'more', chips: ['ask', 'export'], variant: 'update' },
    ],
  },
  {
    id: '2026-10-02',
    date: '2026-10-02',
    pages: [
      { id: 'salaryNet', chips: ['net', 'gross'], variant: 'update', action: { to: '/insights/salary' } },
      { id: 'backButton', chips: ['back', 'more'], variant: 'update' },
    ],
  },
  {
    id: '2026-10-01',
    date: '2026-10-01',
    pages: [
      { id: 'planSavings', chips: ['left', 'savings'], variant: 'update', action: { to: '/plan' } },
      { id: 'salaryDots', chips: ['month', 'regular'], variant: 'update', action: { to: '/insights/salary' } },
      { id: 'oneForm', chips: ['repeat', 'edit'], variant: 'split' },
    ],
  },
  {
    id: '2026-09-30',
    date: '2026-09-30',
    pages: [
      { id: 'nextMonth', chips: ['october', 'counts'], variant: 'update' },
    ],
  },
  {
    id: '2026-09-29',
    date: '2026-09-29',
    pages: [
      { id: 'plan', chips: ['cancel', 'ideas'], variant: 'update', action: { to: '/plan' } },
      { id: 'vouchers', chips: ['perDay', 'topUp'], variant: 'start', action: { to: '/settings/vouchers' } },
      { id: 'salary', chips: ['raises', 'prices'], variant: 'update', action: { to: '/insights/salary' } },
      { id: 'ai', chips: ['typeIt', 'suggested'], variant: 'start', action: { to: '/settings/ai' } },
      { id: 'more', chips: ['imports', 'months'], variant: 'split' },
    ],
  },
  {
    id: '2026-09-27',
    date: '2026-09-27',
    pages: [
      { id: 'greek', chips: ['el', 'device'], variant: 'start', action: { to: '/settings/language' } },
      { id: 'whoFor', chips: ['question', 'group'], variant: 'split' },
      { id: 'savings', chips: ['account', 'goals'], variant: 'update', action: { to: '/savings' } },
      { id: 'statements', chips: ['formats', 'long'], variant: 'update' },
      { id: 'more', chips: ['rules', 'photos'], variant: 'split' },
    ],
  },
  {
    id: '2026-09-26',
    date: '2026-09-26',
    pages: [
      { id: 'sideways', chips: ['strip', 'oneLine'], variant: 'update' },
      { id: 'status', chips: ['working', 'every'], variant: 'start' },
      { id: 'more', chips: ['backups', 'device'], variant: 'split' },
    ],
  },
  {
    id: '2026-09-25',
    date: '2026-09-25',
    pages: [
      { id: 'imports', chips: ['shop', 'transfer'], variant: 'split' },
      { id: 'period', chips: ['month', 'showAll'], variant: 'update' },
      { id: 'salary', chips: ['counts', 'paid'], variant: 'start', action: { to: '/settings/spending' } },
      { id: 'savings', chips: ['savings', 'fromIncome'], variant: 'update' },
      { id: 'more', chips: ['family', 'bonus'], variant: 'split' },
    ],
  },
]
