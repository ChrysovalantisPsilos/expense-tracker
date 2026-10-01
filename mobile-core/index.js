// The mobile core: the web app's pure maths and wording, one module per
// namespace, for a native app that runs it in JavaScriptCore instead of
// writing the maths a second time (ios/README.md). build.mjs bundles this
// file into one script that sets globalThis.BudgeerCore.
//
// Every namespace is a source module the web app runs as it is; modules.js
// is the list. Nothing here touches React, Supabase, window, document,
// storage, fetch or the service worker: the build refuses such a graph.
import el from '../src/locales/el/index.js'
import { setLanguage as activate, getLanguage } from '../src/shared/lib/i18n/i18n.js'
import { CORE_MODULES } from './modules.js'
import { decode, encode, runEncoded } from './vectorCodec.js'
import * as i18n from '../src/shared/lib/i18n/i18n.js'
import * as translate from '../src/shared/lib/i18n/translate.js'
import * as language from '../src/shared/lib/i18n/language.js'
import * as currency from '../src/shared/lib/currency.js'
import * as dates from '../src/shared/lib/dates.js'
import * as periods from '../src/shared/lib/periods.js'
import * as moneyParse from '../src/shared/lib/moneyParse.js'
import * as localeParse from '../src/shared/lib/localeParse.js'
import * as spread from '../src/shared/lib/spread.js'
import * as txnRollup from '../src/shared/lib/txnRollup.js'
import * as ruleFx from '../src/shared/lib/ruleFx.js'
import * as salaryShift from '../src/shared/lib/salaryShift.js'
import * as categoryName from '../src/shared/lib/categoryName.js'
import * as categoryStyle from '../src/shared/lib/categoryStyle.js'
import * as paginate from '../src/shared/lib/paginate.js'
import * as savings from '../src/shared/lib/savings.js'
import * as formChecks from '../src/shared/lib/formChecks.js'
import * as fxPreview from '../src/shared/lib/fxPreview.js'
import * as payLinks from '../src/shared/lib/payLinks.js'
import * as kitMath from '../src/shared/ui/kit/kitMath.js'
import * as chartAxis from '../src/shared/ui/chartAxis.js'
import * as avatarLook from '../src/shared/ui/avatarLook.js'
import * as sharedMoney from '../supabase/functions/_shared/money.ts'
import * as sharedSavings from '../supabase/functions/_shared/savings.ts'
import * as sharedSalaryShift from '../supabase/functions/_shared/salaryShift.ts'
import * as sharedSpread from '../supabase/functions/_shared/spread.ts'
import * as sharedRuleFx from '../supabase/functions/_shared/ruleFx.ts'
import * as planRules from '../supabase/functions/_shared/planRules.ts'
import * as breakdown from '../supabase/functions/_shared/breakdown.ts'
import * as aiHelper from '../supabase/functions/_shared/aiHelper.ts'
import * as splitMath from '../src/features/groups/splitMath.js'
import * as quickAddMath from '../src/features/groups/quickAddMath.js'
import * as groupFormat from '../src/features/groups/groupFormat.js'
import * as groupExpenseForm from '../src/features/groups/groupExpenseForm.js'
import * as settleForm from '../src/features/groups/settleForm.js'
import * as importMath from '../src/features/import/importMath.js'
import * as importRulesMath from '../src/features/import/importRulesMath.js'
import * as bankPresets from '../src/features/import/bankPresets.js'
import * as statementDetect from '../src/features/import/statementDetect.js'
import * as statementText from '../src/features/import/statementText.js'
import * as kbcLabels from '../src/features/import/kbcLabels.js'
import * as sheetParse from '../src/features/import/sheetParse.js'
import * as recurringMath from '../src/features/recurring/recurringMath.js'
import * as ruleForm from '../src/features/recurring/ruleForm.js'
import * as planMath from '../src/features/plan/planMath.js'
import * as planText from '../src/features/plan/planText.js'
import * as planCatalog from '../src/features/plan/planCatalog.js'
import * as whatIfMath from '../src/features/plan/whatIfMath.js'
import * as salaryMath from '../src/features/salary/salaryMath.js'
import * as voucherMath from '../src/features/vouchers/voucherMath.js'
import * as savingsMath from '../src/features/savings/savingsMath.js'
import * as budgetMath from '../src/features/budgets/budgetMath.js'
import * as categoryMath from '../src/features/categories/categoryMath.js'
import * as dashboardMath from '../src/features/dashboard/dashboardMath.js'
import * as insightsMath from '../src/features/insights/insightsMath.js'
import * as aiMath from '../src/features/ai/aiMath.js'
import * as entryForm from '../src/features/transactions/entryForm.js'
import * as txnFilter from '../src/features/transactions/txnFilter.js'
import * as rowParts from '../src/features/transactions/rowParts.js'
import * as listHeading from '../src/features/transactions/listHeading.js'

// The language every wording function answers in. English is the default and
// always at hand; Greek is bundled here too (the web app fetches it lazily).
export function setLanguage(lang) {
  return activate(lang, lang === 'el' ? el : undefined)
}
export { getLanguage }

export const modules = {
  i18n,
  translate,
  language,
  currency,
  dates,
  periods,
  moneyParse,
  localeParse,
  spread,
  txnRollup,
  ruleFx,
  salaryShift,
  categoryName,
  categoryStyle,
  paginate,
  savings,
  formChecks,
  fxPreview,
  payLinks,
  kitMath,
  chartAxis,
  avatarLook,
  sharedMoney,
  sharedSavings,
  sharedSalaryShift,
  sharedSpread,
  sharedRuleFx,
  planRules,
  breakdown,
  aiHelper,
  splitMath,
  quickAddMath,
  groupFormat,
  groupExpenseForm,
  settleForm,
  importMath,
  importRulesMath,
  bankPresets,
  statementDetect,
  statementText,
  kbcLabels,
  sheetParse,
  recurringMath,
  ruleForm,
  planMath,
  planText,
  planCatalog,
  whatIfMath,
  salaryMath,
  voucherMath,
  savingsMath,
  budgetMath,
  categoryMath,
  dashboardMath,
  insightsMath,
  aiMath,
  entryForm,
  txnFilter,
  rowParts,
  listHeading,
}

// The paths each namespace comes from, for the guard test and the docs.
export const sources = CORE_MODULES

// The JSON bridge: Swift (and the vector replays) call a function by
// namespace and name with its arguments as a JSON array, and get the result
// back as JSON (vectorCodec.js says how undefined, Set, Map and a thrown
// error are written). A missing function is an error in its own right.
export const vectors = {
  encode,
  decode,
  call(module, fn, argsJson) {
    const ns = modules[module]
    if (!ns) throw new Error(`BudgeerCore: no module "${module}"`)
    const f = ns[fn]
    if (typeof f !== 'function') throw new Error(`BudgeerCore: no function "${module}.${fn}"`)
    return JSON.stringify(runEncoded(f, JSON.parse(argsJson)))
  },
}
