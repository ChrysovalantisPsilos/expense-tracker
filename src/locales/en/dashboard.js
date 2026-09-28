// Namespace `dashboard`: src/features/dashboard (Home: the overview, spending
// by category, and dashboardMath's notes).
export default {
  title: 'Overview',
  period: 'Period',
  unavailable: 'Not available until your transactions load.',
  // QueryError's "Couldn't load …".
  what: 'your transactions',
  overview: {
    spent: 'Spent',
    income: 'Income',
    net: 'Net',
  },
  // What the overview's ⓘ opens (dashboardMath.overviewInfo).
  info: {
    spentUpcoming: 'Spent includes {{amount}} of recurring payments still to come.',
    spentFromSavings: 'Spent includes {{amount}} paid from savings.',
    incomeUpcoming: 'Income includes {{amount}} of recurring income still to come.',
    net: 'Net is income minus expenses.',
    netSavings: 'Net is income minus expenses and what you set aside from income.',
    netExclSavings: 'Spending paid from savings isn’t in the Net.',
  },
  // What was put aside in the period (dashboardMath.savedNote).
  saved: {
    thisMonth: 'Saved {{amount}} this month',
    thisYear: 'Saved {{amount}} this year',
    total: 'Saved {{amount}} in total',
    in: 'Saved {{amount}} in {{period}}',
  },
  categories: {
    title: 'Spending by category',
    chart: 'Chart',
    chartView: 'Chart view',
    table: 'Table',
    tableView: 'Table view',
    category: 'Category',
    amount: 'Amount',
    share: 'Share',
    add: 'Add an expense',
    // A bar's tooltip: "Groceries: €120.00 (24%)".
    tooltip: '{{name}}: {{amount}} ({{share}}%)',
    showTop: 'Show top {{n}}',
    showAll: 'Show all {{n}} categories',
  },
  noExpenses: 'No expenses in this period.',
  noIncome: 'No income in this period.',
}
