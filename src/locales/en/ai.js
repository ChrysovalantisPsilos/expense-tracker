// Namespace `ai`: src/features/ai — the optional AI helpers: Settings → AI
// helpers (`settings`), "Type it" on Add (`add`), category ideas on Import
// (`import`), the month in plain words on Insights and Home (`summary`), and
// the errors the ai-helper function can answer with (`errors`, by code:
// aiMath.aiErrorKey). The privacy wording must stay true to the Privacy
// Notice (privacy:notice.recipients.anthropic) and docs/GDPR.md.
export default {
  suggested: 'Suggested',
  settings: {
    title: 'AI helpers',
    note: 'Each helper you turn on sends only what it needs to Anthropic (Claude), which works it out.',
    noteLabel: 'What is sent',
    noteMore: 'Anthropic doesn’t use it to train its models and deletes it after a short time (at most 30 days). Your name, email and bank details are never sent. An answer only fills things in or suggests them for you to check: nothing is saved until you tap Save or Import. Budgeer is a hobby project, so this runs on Anthropic’s standard terms, with no special agreement. Turn any helper off at any time; every change is kept in your consent history (Settings → Privacy).',
    quickEntry: {
      label: 'Type to add',
      hint: 'On Add, “coffee 3.60 yesterday” fills in the form.',
      more: 'Sent: the line you type, your category names and, if you have more than the bank, which “Paid from” choices you have (savings, meal vouchers).',
    },
    importCategories: {
      label: 'Category ideas on import',
      hint: 'A category for merchants Budgeer hasn’t seen yet.',
      more: 'Sent: the merchant names (like “DELHAIZE”), whether money went in or out, and your category names. No amounts, dates or account numbers.',
    },
    monthSummary: {
      label: 'Month in plain words',
      hint: 'A short summary of your month on Insights and Home.',
      more: 'Sent: your total per category for the month and the six before, and your budgets. No entries, descriptions or notes. The summary is kept with your account, encrypted, and deleted when you turn this off.',
    },
    demoOff: 'AI helpers aren’t available on the demo account.',
  },
  add: {
    label: 'Type it',
    placeholder: 'coffee 3.60 yesterday',
    fill: 'Fill',
    more: 'Write it the way you’d say it. Claude (by Anthropic) fills in the form below; you check it and tap Save. Only this line, your category names and your “Paid from” choices are sent. To speak it, use the mic on your keyboard.',
    working: 'Filling in the form…',
    done: 'Filled in. Check it and tap Save.',
    undo: 'Undo',
  },
  import: {
    working: 'Finding categories…',
    some: 'Suggested for {{count}} of {{total}}. Change any that look wrong.',
    none: 'No suggestions this time. Pick them yourself.',
  },
  summary: {
    title: '{{month}} in short',
    by: 'Written by Claude from your category totals',
    byMore: 'Only your total per category (this month and the six before) and your budgets were sent: no entries, descriptions or notes. It can get things wrong, so check it against your numbers.',
    working: 'Writing your summary…',
    stale: 'Your totals changed since this was written.',
    update: 'Update',
    updateFailed: 'Couldn’t update it right now.',
    failed: 'Couldn’t write a summary right now.',
    retry: 'Try again',
    hide: 'Hide until next month',
  },
  errors: {
    unreadable: 'Couldn’t tell what that was. Try an amount and what it was, like “lunch 12.50”.',
    notConfigured: 'AI helpers aren’t available right now.',
    busy: 'The AI service is busy. Try again in a minute.',
    rateLimited: 'You’ve used this a lot just now. Try again later.',
    off: 'This helper is off. Turn it on in Settings → AI helpers.',
    failed: 'Couldn’t reach the AI service. Try again.',
  },
}
