// The pure modules the mobile core is made of: one namespace per module, each
// a source file the web app runs as it is. index.js imports them (statically,
// for the bundler); the vector recorder (record/) wraps the same files while
// the unit tests run; test/mobileCore.test.js checks the two lists agree.
//
// A module belongs here when everything it does is a function of its
// arguments and the active language: no React, no Supabase, no window,
// document, storage, fetch or service worker. The build (build.mjs) refuses a
// graph that reaches any of those.
//
// Paths are relative to the repository root.
export const CORE_MODULES = {
  // The language engine: t(), the active language, the Intl locale.
  i18n: 'src/shared/lib/i18n/i18n.js',
  translate: 'src/shared/lib/i18n/translate.js',
  language: 'src/shared/lib/i18n/language.js',

  // shared/lib (pure).
  currency: 'src/shared/lib/currency.js',
  dates: 'src/shared/lib/dates.js',
  periods: 'src/shared/lib/periods.js',
  moneyParse: 'src/shared/lib/moneyParse.js',
  localeParse: 'src/shared/lib/localeParse.js',
  spread: 'src/shared/lib/spread.js',
  txnRollup: 'src/shared/lib/txnRollup.js',
  ruleFx: 'src/shared/lib/ruleFx.js',
  salaryShift: 'src/shared/lib/salaryShift.js',
  categoryName: 'src/shared/lib/categoryName.js',
  paginate: 'src/shared/lib/paginate.js',
  savings: 'src/shared/lib/savings.js',
  formChecks: 'src/shared/lib/formChecks.js',

  // supabase/functions/_shared (the client ↔ edge-function parity modules).
  sharedMoney: 'supabase/functions/_shared/money.ts',
  sharedSavings: 'supabase/functions/_shared/savings.ts',
  sharedSalaryShift: 'supabase/functions/_shared/salaryShift.ts',
  sharedSpread: 'supabase/functions/_shared/spread.ts',
  sharedRuleFx: 'supabase/functions/_shared/ruleFx.ts',
  planRules: 'supabase/functions/_shared/planRules.ts',
  breakdown: 'supabase/functions/_shared/breakdown.ts',
  aiHelper: 'supabase/functions/_shared/aiHelper.ts',

  // Feature maths.
  splitMath: 'src/features/groups/splitMath.js',
  quickAddMath: 'src/features/groups/quickAddMath.js',
  groupFormat: 'src/features/groups/groupFormat.js',
  importMath: 'src/features/import/importMath.js',
  importRulesMath: 'src/features/import/importRulesMath.js',
  bankPresets: 'src/features/import/bankPresets.js',
  statementDetect: 'src/features/import/statementDetect.js',
  statementText: 'src/features/import/statementText.js',
  kbcLabels: 'src/features/import/kbcLabels.js',
  sheetParse: 'src/features/import/sheetParse.js',
  recurringMath: 'src/features/recurring/recurringMath.js',
  ruleForm: 'src/features/recurring/ruleForm.js',
  planMath: 'src/features/plan/planMath.js',
  planText: 'src/features/plan/planText.js',
  planCatalog: 'src/features/plan/planCatalog.js',
  whatIfMath: 'src/features/plan/whatIfMath.js',
  salaryMath: 'src/features/salary/salaryMath.js',
  voucherMath: 'src/features/vouchers/voucherMath.js',
  savingsMath: 'src/features/savings/savingsMath.js',
  budgetMath: 'src/features/budgets/budgetMath.js',
  categoryMath: 'src/features/categories/categoryMath.js',
  dashboardMath: 'src/features/dashboard/dashboardMath.js',
  insightsMath: 'src/features/insights/insightsMath.js',
  aiMath: 'src/features/ai/aiMath.js',
  entryForm: 'src/features/transactions/entryForm.js',
  txnFilter: 'src/features/transactions/txnFilter.js',
  listHeading: 'src/features/transactions/listHeading.js',
}

// Where the bundle goes (the Swift package's resource) and where the recorded
// vectors go (the Swift tests' resource), relative to the repository root.
export const CORE_BUNDLE = 'ios/BudgeerCore/Sources/BudgeerCore/Resources/core.js'
export const VECTORS_FILE = 'ios/BudgeerCore/Tests/BudgeerCoreTests/Resources/vectors.json'

// Packages and globals the core must never reach. The build fails on any
// module in the graph that matches a package here, and the guard test looks
// for the globals in the bundle.
export const FORBIDDEN_PACKAGES = [
  'react', 'react-dom', 'react-router', 'react-router-dom', '@chakra-ui', '@emotion', 'framer-motion',
  '@supabase', 'recharts', 'lucide-react', 'workbox', 'tesseract.js', 'pdf-lib', 'xlsx', 'qrcode',
]
export const FORBIDDEN_FILES = [
  'src/shared/lib/supabase.js', 'src/shared/lib/db.js', 'src/shared/lib/realtime.js', 'src/shared/lib/fx.js',
  'src/shared/lib/push.js', 'src/shared/lib/profile.js', 'src/shared/lib/transactions.js',
  'src/shared/lib/categories.js', 'src/shared/lib/accounts.js', 'src/shared/lib/queryCache.js', 'src/sw.js',
]
