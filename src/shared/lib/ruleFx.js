// Recurring rules in the base currency, at the latest ECB rate. One module
// shared with the edge functions (the statement must add foreign rules up the
// way the app does): see supabase/functions/_shared/ruleFx.ts. The rates come
// from fx.js useLatestRates.
export {
  foreignCurrencies, ruleInBase, rulesInBase, missingRatesNote, CONVERTED_NOTE,
} from '../../../supabase/functions/_shared/ruleFx.ts'
