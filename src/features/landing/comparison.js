// "How is Budgeer different?" — the one source for the landing section and
// the matching FAQ answer. Plain data plus one pure helper, no React.
//
// Rules for editing (comparative advertising must be objective, verifiable
// and not misleading or denigrating):
//  * Budgeer points must be true to the code — update them with the feature.
//  * Every fact about another app quotes or paraphrases that vendor's own
//    page (pricing, help centre, store listing) and carries its `url` and the
//    day it was `checked`. Re-check them all and bump the dates together;
//    drop a fact rather than keep one that can't be re-verified.

export const COMPARISON_CHECKED = { iso: '2026-09-23', label: 'September 2026' }

export const COMPARISON_TITLE = 'How is Budgeer different?'

export const COMPARISON_INTRO = 'Bill splitters such as Splitwise, Tricount and Settle Up focus on shared costs, and budgeting apps such as YNAB on your own money. Here’s how Budgeer differs.'

export const COMPARISON_POINTS = [
  {
    id: 'one-app',
    title: 'Your budget and your groups in one app',
    body: 'Track your own spending against monthly budgets and split costs with friends in the same place. Your share of a group expense lands in your own spending automatically, converted at the European Central Bank rate for the day.',
  },
  {
    id: 'free',
    title: 'Free, with no daily cap and no ads',
    body: 'Every feature is free. There’s no daily limit on how many expenses you add — only hourly safety limits against abuse — and no ads or analytics trackers.',
  },
  {
    id: 'privacy',
    title: 'Private by default',
    body: 'Your data is stored in the EU (Paris). Amounts and descriptions are encrypted at rest on the server — that’s not end-to-end encryption. Receipts are read on your device and never uploaded.',
  },
]

export const COMPARISON_CAVEAT = {
  id: 'others-better',
  title: 'Where others are better',
  body: 'Budgeer has no live bank connection: you import CSV or Excel statements instead. It isn’t in the App Store or Google Play — you install it from your browser. And it’s a one-person hobby project, so it has less polish than long-established apps, and support replies can take a few days.',
}

const SPLITWISE_KB = 'https://kb.splitwise.com/pro/what-is-splitwise-pro'
const TRICOUNT_STORE = 'https://apps.apple.com/us/app/tricount-split-settle-bills/id349866256'
const SETTLE_UP_STORE = 'https://apps.apple.com/us/app/settle-up-group-expenses/id737534985'
const YNAB_PRICING = 'https://www.ynab.com/pricing'
const YNAB_FEATURES = 'https://www.ynab.com/features'
const CHECKED = COMPARISON_CHECKED.iso

// The detailed comparison behind the landing disclosure: each app's facts as
// its vendor states them, with the page they come from.
export const COMPARED_APPS = [
  {
    name: 'Splitwise',
    facts: [
      { text: 'Free plan: up to 4 expenses a day, according to Splitwise’s help centre.', url: SPLITWISE_KB, checked: CHECKED },
      { text: 'Splitwise Pro (paid, monthly or yearly) removes the daily limit and ads, and adds currency conversion, receipt scanning, charts and transaction import in some countries.', url: 'https://www.splitwise.com/pro', checked: CHECKED },
      { text: 'Apps for iPhone and Android, plus a website.', url: 'https://www.splitwise.com/', checked: CHECKED },
    ],
  },
  {
    name: 'Tricount (by bunq)',
    facts: [
      { text: 'Free, with no subscription and no limit on groups or expenses, according to its App Store listing.', url: TRICOUNT_STORE, checked: CHECKED },
      { text: 'Its former Premium tier has been retired; the app also offers an optional free virtual bunq card.', url: 'https://help.tricount.com/articles/tricount-faqs', checked: CHECKED },
    ],
  },
  {
    name: 'Settle Up',
    facts: [
      { text: 'Free with ads. Premium (US App Store: $3.99 a month or $19.99 a year) removes ads and adds receipt photos, recurring expenses, categories, Excel export and statistics.', url: SETTLE_UP_STORE, checked: CHECKED },
      { text: 'Apps for iPhone and Android, plus a web app.', url: 'https://settleup.io/', checked: CHECKED },
    ],
  },
  {
    name: 'YNAB',
    facts: [
      { text: 'A budgeting subscription: US$14.99 a month or US$109 a year, with a 34-day free trial.', url: YNAB_PRICING, checked: CHECKED },
      { text: 'Links bank accounts and imports transactions automatically; apps for web, iPhone and Android.', url: YNAB_FEATURES, checked: CHECKED },
      { text: 'Built for personal and household budgeting; splitting bills with friends isn’t among its listed features.', url: YNAB_FEATURES, checked: CHECKED },
    ],
  },
]

// The link text for a source: its host without "www." ("ynab.com").
export function sourceLabel(url) {
  return new URL(url).hostname.replace(/^www\./, '')
}

// The FAQ answer, one string per paragraph, built from the same points so
// the landing section and the Help page can't drift apart.
export function comparisonFaqAnswer() {
  return [
    COMPARISON_INTRO,
    ...COMPARISON_POINTS.map((p) => `${p.title}. ${p.body}`),
    `${COMPARISON_CAVEAT.title}: ${COMPARISON_CAVEAT.body}`,
    `The landing page at budgeer.com has a detailed comparison with links to each app’s own pages (checked ${COMPARISON_CHECKED.label}). Prices and plans change, so check the latest there.`,
  ]
}
