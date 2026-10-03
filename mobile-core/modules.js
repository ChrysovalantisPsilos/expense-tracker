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
  // A receipt's text (the phone reads the photo) → merchant, date, total, currency.
  receiptRead: 'src/shared/lib/receiptRead.js',
  spread: 'src/shared/lib/spread.js',
  txnRollup: 'src/shared/lib/txnRollup.js',
  ruleFx: 'src/shared/lib/ruleFx.js',
  salaryShift: 'src/shared/lib/salaryShift.js',
  categoryName: 'src/shared/lib/categoryName.js',
  categoryStyle: 'src/shared/lib/categoryStyle.js',
  paginate: 'src/shared/lib/paginate.js',
  savings: 'src/shared/lib/savings.js',
  formChecks: 'src/shared/lib/formChecks.js',
  fxPreview: 'src/shared/lib/fxPreview.js',
  // The shared demo login (profiles.is_demo): what it keeps to this device.
  demoAccount: 'src/shared/lib/demoAccount.js',
  payLinks: 'src/shared/lib/payLinks.js',
  // Which error text a user sees (userMessage over the web's error shape).
  errors: 'src/shared/lib/errors.js',
  // The design kit's pure rules (a signed amount's tone, a bar's width).
  kitMath: 'src/shared/ui/kit/kitMath.js',
  // The money charts' y-axis tick labels ("1.6k", "1,6 χιλ.").
  chartAxis: 'src/shared/ui/chartAxis.js',
  // An avatar circle's initials and colours (UserAvatar).
  avatarLook: 'src/shared/ui/avatarLook.js',
  // The loading ring's motion (the sign-in's intro).
  loaderTiming: 'src/shared/ui/loaderTiming.js',
  // Settings: the appearance choices, where people reach Budgeer.
  themePref: 'src/shared/lib/themePref.js',
  contact: 'src/shared/lib/contact.js',
  // A new password's first check (the backup's optional password).
  password: 'src/shared/lib/password.js',

  // supabase/functions/_shared (the client ↔ edge-function parity modules).
  sharedMoney: 'supabase/functions/_shared/money.ts',
  sharedSavings: 'supabase/functions/_shared/savings.ts',
  sharedSalaryShift: 'supabase/functions/_shared/salaryShift.ts',
  sharedSpread: 'supabase/functions/_shared/spread.ts',
  sharedRuleFx: 'supabase/functions/_shared/ruleFx.ts',
  planRules: 'supabase/functions/_shared/planRules.ts',
  breakdown: 'supabase/functions/_shared/breakdown.ts',
  aiHelper: 'supabase/functions/_shared/aiHelper.ts',
  // The recent-sign-in rule for the dangerous account actions (the app reads
  // its token's claims itself: jwtClaims needs atob, which JavaScriptCore lacks).
  reauth: 'supabase/functions/_shared/reauth.ts',
  // The statement's file name and types (the native app shares the file the
  // generate-report function makes).
  reportFiles: 'supabase/functions/_shared/files.ts',

  // Feature maths.
  splitMath: 'src/features/groups/splitMath.js',
  quickAddMath: 'src/features/groups/quickAddMath.js',
  groupFormat: 'src/features/groups/groupFormat.js',
  groupCover: 'src/features/groups/groupCover.js',
  groupExpenseForm: 'src/features/groups/groupExpenseForm.js',
  settleForm: 'src/features/groups/settleForm.js',
  importMath: 'src/features/import/importMath.js',
  importRulesMath: 'src/features/import/importRulesMath.js',
  bankPresets: 'src/features/import/bankPresets.js',
  statementDetect: 'src/features/import/statementDetect.js',
  statementText: 'src/features/import/statementText.js',
  kbcLabels: 'src/features/import/kbcLabels.js',
  sheetParse: 'src/features/import/sheetParse.js',
  // A statement file's bytes → its table (SheetJS for .xlsx/.xls; the app
  // calls it with the file's bytes through vectors.callBytes).
  sheetRead: 'src/features/import/sheetRead.js',
  statementRows: 'src/features/import/statementRows.js',
  importText: 'src/features/import/importText.js',
  // Settings › Your data: the backup file, reading and checking one, the
  // restore's plans (backupCrypto.js is the web's WebCrypto; the app seals
  // with CryptoKit by backupMath.SEAL).
  backupMath: 'src/features/backup/backupMath.js',
  // Start fresh: the phrase, what the confirmation asks for, what goes and stays.
  startFreshMath: 'src/features/backup/startFreshMath.js',
  recurringMath: 'src/features/recurring/recurringMath.js',
  ruleForm: 'src/features/recurring/ruleForm.js',
  planMath: 'src/features/plan/planMath.js',
  planText: 'src/features/plan/planText.js',
  planCatalog: 'src/features/plan/planCatalog.js',
  whatIfMath: 'src/features/plan/whatIfMath.js',
  planPage: 'src/features/plan/planPage.js',
  salaryMath: 'src/features/salary/salaryMath.js',
  salaryText: 'src/features/salary/salaryText.js',
  voucherMath: 'src/features/vouchers/voucherMath.js',
  savingsMath: 'src/features/savings/savingsMath.js',
  budgetMath: 'src/features/budgets/budgetMath.js',
  categoryMath: 'src/features/categories/categoryMath.js',
  dashboardMath: 'src/features/dashboard/dashboardMath.js',
  insightsMath: 'src/features/insights/insightsMath.js',
  aiMath: 'src/features/ai/aiMath.js',
  entryForm: 'src/features/transactions/entryForm.js',
  txnFilter: 'src/features/transactions/txnFilter.js',
  rowParts: 'src/features/transactions/rowParts.js',
  listHeading: 'src/features/transactions/listHeading.js',
  bellMath: 'src/features/notifications/bellMath.js',
  navMatch: 'src/app/navMatch.js',
  voucherText: 'src/features/vouchers/voucherText.js',
  // Settings and its pages (Monthly spending, Security, Privacy, What's new).
  spendingPrefs: 'src/features/settings/spendingPrefs.js',
  authMethods: 'src/features/settings/authMethods.js',
  legal: 'src/features/privacy/legal.js',
  whatsNewMath: 'src/features/whatsnew/whatsNewMath.js',
  // A category page's links (Home's bars, the budgets), the sign-up and reset
  // forms' checks, the "Check your inbox" wait, an auth email's link (opened
  // in the app as a Universal Link) and its expired page, the setup wizard
  // and the tour's stops, and Help & FAQ.
  categoryLinks: 'src/shared/lib/categoryLinks.js',
  authChecks: 'src/features/auth/authChecks.js',
  confirmWait: 'src/features/auth/confirmWait.js',
  confirmLink: 'src/features/auth/confirmLink.js',
  onboardingMath: 'src/features/onboarding/onboardingMath.js',
  tourSteps: 'src/features/onboarding/tourSteps.js',
  faqContent: 'src/features/help/faqContent.js',
  faqMath: 'src/features/help/faqMath.js',
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
  '@supabase', 'recharts', 'lucide-react', 'workbox', 'tesseract.js', 'pdf-lib', 'qrcode',
]
// The packages the core may bundle: pure JavaScript the web runs as it is.
// SheetJS (xlsx, Apache-2.0; its licence ships beside the bundle as
// ios/BudgeerCore/Sources/BudgeerCore/Resources/SHEETJS-LICENSE.txt) reads
// .xlsx/.xls statements on the phone as the web's parsing worker does.
export const CORE_PACKAGES = ['xlsx']
export const FORBIDDEN_FILES = [
  'src/shared/lib/supabase.js', 'src/shared/lib/db.js', 'src/shared/lib/realtime.js', 'src/shared/lib/fx.js',
  'src/shared/lib/push.js', 'src/shared/lib/profile.js', 'src/shared/lib/transactions.js',
  'src/shared/lib/categories.js', 'src/shared/lib/accounts.js', 'src/shared/lib/queryCache.js', 'src/sw.js',
]
