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
    incomeUpcoming: 'Income includes {{amount}} of recurring income still to come.',
    // "How Net adds up" (dashboardMath.netSteps).
    sumTitle: 'How Net adds up',
    steps: {
      income: 'Income',
      spent: 'Spent',
      fromSavings: 'Paid from savings (not from income)',
      vouchers: 'Paid with meal vouchers',
      toSavings: 'Put into savings',
    },
    net: 'Net',
  },
  // What was put aside in the period (dashboardMath.savedNote).
  saved: {
    thisMonth: 'Saved {{amount}} this month',
    thisYear: 'Saved {{amount}} this year',
    total: 'Saved {{amount}} in total',
    in: 'Saved {{amount}} in {{period}}',
    // Savings in and out in the period (dashboardMath.savingsLine).
    inOut: '+{{in}} in · −{{out}} out',
  },
  categories: {
    title: 'Spending by category',
    // A category that groups also carry (dashboardMath.categoryLine).
    withGroup: '{{amount}} · +{{shared}} in {{group}} = {{total}}',
    withGroups: '{{amount}} · +{{shared}} in {{count}} groups = {{total}}',
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
