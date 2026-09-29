// Namespace `budgets`: src/features/budgets (the Budgets page, Home's
// Budgets card, and budgetMath's labels).
export default {
  title: 'Budgets',
  thisMonth: 'This month',
  // QueryError's "Couldn't load …".
  what: 'budgets',
  form: {
    title: 'Set a monthly cap',
    category: 'Category',
    select: 'Select',
    cap: 'Monthly cap',
    submit: 'Set',
  },
  saved: 'Budget saved',
  saveFailed: 'Couldn’t save the budget. Please try again.',
  removed: '{{name}} budget removed',
  removeFailed: 'Couldn’t remove the budget. Please try again.',
  copied_one: 'Copied {{count}} budget from last month',
  copied_other: 'Copied {{count}} budgets from last month',
  copy: {
    button: 'Copy last month’s budgets',
    // The same, as the This month card's small action (Greek keeps it shorter).
    action: 'Copy last month’s budgets',
    title: 'Copy last month’s budgets?',
    body_one: 'This month’s {{count}} cap is replaced by last month’s {{previous}}.',
    body_other: 'This month’s {{count}} caps are replaced by last month’s {{previous}}.',
    confirm: 'Copy',
  },
  empty: {
    title: 'No budgets yet',
    text: 'Set a monthly cap per category and Budgeer shows how close you are as you spend.',
    first: 'Set your first budget',
  },
  hint: 'Tap a budget to see or change it.',
  rollover: 'Budgets roll over until you change them. Edit or delete one and this month gets its own.',
  edit: 'Edit {{name}} budget',
  delete: 'Delete {{name}} budget',
  // A budget row's "€312.40 of €400.00".
  progress: '{{spent}} of {{limit}}',
  // Home's Budgets card.
  card: {
    manage: 'Manage',
    set: 'Set a budget',
    emptyPast: 'No budgets in {{period}}.',
    emptyThisYear: 'No budgets this year. Set monthly caps per category to track them here.',
    emptyYet: 'No budgets yet. Set monthly caps per category to track them here.',
    months_one: '{{period}} · {{count}} month',
    months_other: '{{period}} · {{count}} months',
    carried: '{{period}} · {{carried}}',
  },
  // Where a month's caps rolled over from: `month` is "August" (the month's
  // own form in a date; Greek: the genitive «Αυγούστου»), with the year when
  // it isn't this one's.
  carriedFrom: 'Carried over from {{month}}',
  fallbackName: 'Category',
}
