// The ai-helper request handler, without the network: index.ts gives it the
// caller's Supabase client, a service-role client and the Claude call, so the
// unit tests run it with stubs (test/aiHelperHandler.test.js).
//
// Every action: a signed-in caller (the JWT is also verified at the gateway),
// a well-formed request, and — before Claude is called — ai_helper_start
// (0103) as the caller: that helper's switch is on, and the per-user and
// overall rate limits allow it (the shared demo login also under its own
// daily cap, 0106). What's sent is
// built here from the caller's own rows (RLS) and the request's few fields;
// the answer is validated (_shared/aiHelper.ts) before it's returned.

import {
  type Ask, type AskResult, HELPERS, categoryChoices, normaliseEntry, normaliseSuggestions, normaliseWhatIf,
  parseEntryAsk, planPayments, readParseRequest, readSuggestRequest, readSummaryRequest, readWhatIfRequest,
  suggestAsk, whatIfAsk,
} from '../_shared/aiHelper.ts'
import { normaliseSummary, summaryAsk } from '../_shared/monthFacts.ts'
import { paidFromSources, savingsIdsOf } from '../_shared/savings.ts'

// The few Supabase client calls used here (supabase-js, typed loosely).
interface Db {
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> }
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: any }>
  from: (table: string) => any
}

export interface Deps {
  asUser: Db
  service: () => Pick<Db, 'rpc'>
  ask: ((a: Ask) => Promise<AskResult>) | null // null: no API key set
  today: () => string                          // the server's date, YYYY-MM-DD
}

export interface Reply { status: number; body: Record<string, unknown> }

const fail = (status: number, code: string, error: string): Reply => ({ status, body: { error, code } })
const BAD = fail(400, 'bad_request', 'Bad request.')
const OFF = fail(403, 'off', 'This AI helper is off.')
const NOT_CONFIGURED = fail(503, 'not_configured', 'AI helpers aren’t set up here yet.')
const LIMITED = fail(429, 'rate_limited', 'Too many requests — please try again later.')

// A database error from ai_helper_start / the summary RPCs, as a reply.
function dbReply(error: any): Reply {
  const message = String(error?.message ?? '')
  if (message.includes('AI helper is off')) return OFF
  if (message.startsWith('Too many requests')) return LIMITED
  if (message.includes('bad month')) return BAD
  console.error('ai-helper: database error', error?.code ?? '', message)
  return fail(500, 'failed', 'Something went wrong.')
}

// Why Claude's answer couldn't be used, as a reply. `unreadable` is what the
// app shows as "couldn't tell what that was" (Type it).
function askReply(problem: Exclude<AskResult, { ok: true }>['problem'], unreadableOk: boolean): Reply {
  if (problem === 'busy') return fail(503, 'busy', 'The AI service is busy — please try again in a minute.')
  if (problem === 'not_configured') return NOT_CONFIGURED
  if (unreadableOk && problem !== 'failed') return fail(422, 'unreadable', 'Couldn’t read that.')
  return fail(502, 'failed', 'The AI service didn’t answer.')
}

async function start(asUser: Db, helper: string): Promise<{ base: string } | Reply> {
  const { data, error } = await asUser.rpc('ai_helper_start', { p_helper: helper })
  if (error) return dbReply(error)
  return { base: typeof data?.base_currency === 'string' ? data.base_currency : 'EUR' }
}

async function myCategoryRows(asUser: Db) {
  const { data, error } = await asUser.from('categories').select('id, name, kind, is_archived, is_savings')
  if (error) throw error
  return data ?? []
}
const myCategories = async (asUser: Db, labels: unknown) => categoryChoices(await myCategoryRows(asUser), labels)

// The caller's "Paid from" choices, worked out here as the Add form does
// (savings.paidFromSources), never taken from the request: savings once they
// have a savings category, vouchers once they have a meal-voucher setup
// (my_meal_vouchers as the caller; unreadable counts as none).
async function myPaidFrom(asUser: Db, rows: any[]) {
  const { data, error } = await asUser.rpc('my_meal_vouchers', {})
  return paidFromSources({ savings: savingsIdsOf(rows).size > 0, vouchers: !error && data != null })
}

export async function handle(req: Request, deps: Deps): Promise<Reply> {
  if (req.method !== 'POST') return fail(405, 'bad_request', 'Method not allowed.')
  const { asUser } = deps
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return fail(401, 'not_authenticated', 'not authenticated')
  const body = await req.json().catch(() => null)
  const action = body?.action
  if (!HELPERS.includes(action)) return BAD

  if (action === 'parse_entry') {
    const r = readParseRequest(body)
    if (!r.ok) return BAD
    if (!deps.ask) return NOT_CONFIGURED
    const s = await start(asUser, action)
    if ('status' in s) return s
    const rows = await myCategoryRows(asUser)
    const categories = categoryChoices(rows, body.labels)
    const paidFrom = await myPaidFrom(asUser, rows)
    const res = await deps.ask(parseEntryAsk({ ...r.value, baseCurrency: s.base, categories, paidFrom }))
    if (!res.ok) return askReply(res.problem, true)
    const entry = normaliseEntry(res.json, { today: r.value.today, baseCurrency: s.base, categories, paidFrom })
    return entry ? { status: 200, body: { entry } } : fail(422, 'unreadable', 'Couldn’t read that.')
  }

  if (action === 'suggest_categories') {
    const r = readSuggestRequest(body)
    if (!r.ok) return BAD
    if (!deps.ask) return NOT_CONFIGURED
    const s = await start(asUser, action)
    if ('status' in s) return s
    const categories = await myCategories(asUser, body.labels)
    const res = await deps.ask(suggestAsk({ merchants: r.value, categories }))
    if (!res.ok) return askReply(res.problem, false)
    const picked = normaliseSuggestions(res.json, r.value, categories)
    return {
      status: 200,
      body: { suggestions: Object.entries(picked).map(([index, category_id]) => ({ index: Number(index), category_id })) },
    }
  }

  // plan_whatif: the payments and income come from the caller's own recurring
  // rules (my_recurring_rules, RLS: auth.uid()), never from the request; the
  // request gives only the line and the category names as the app shows them.
  if (action === 'plan_whatif') {
    const r = readWhatIfRequest(body)
    if (!r.ok) return BAD
    if (!deps.ask) return NOT_CONFIGURED
    const s = await start(asUser, action)
    if ('status' in s) return s
    const { data: rules, error } = await asUser.rpc('my_recurring_rules', {})
    if (error) return dbReply(error)
    const payments = planPayments(rules ?? [], await myCategoryRows(asUser), body.labels)
    const res = await deps.ask(whatIfAsk({ text: r.value.text, baseCurrency: s.base, payments }))
    if (!res.ok) return askReply(res.problem, true)
    const whatif = normaliseWhatIf(res.json, { baseCurrency: s.base, payments })
    return whatif ? { status: 200, body: { whatif } } : fail(422, 'unreadable', 'Couldn’t read that.')
  }

  // month_summary: the totals come from the database, never from the request,
  // and what's still due this month from the caller's own recurring rules
  // (my_recurring_rules, RLS; unreadable counts as none).
  const r = readSummaryRequest(body)
  if (!r.ok) return BAD
  const { data: state, error } = await asUser.rpc('my_month_summary', { p_month: r.value.month })
  if (error) return dbReply(error)
  if (!state) return OFF
  if (state.empty) return { status: 200, body: { empty: true } }
  // Written for these totals and in this language already: no new call.
  if (state.summary && !state.stale && state.summary.lang === r.value.lang) {
    return { status: 200, body: { summary: state.summary, stale: false } }
  }
  if (!deps.ask) return NOT_CONFIGURED
  const s = await start(asUser, action)
  if ('status' in s) return s
  const categoryRows = await myCategoryRows(asUser)
  const { data: rules, error: rulesError } = await asUser.rpc('my_recurring_rules', {})
  const ask = summaryAsk({
    totals: state.totals, lang: r.value.lang, categories: categoryChoices(categoryRows, body.labels), today: deps.today(),
    rules: rulesError ? [] : rules ?? [], categoryRows,
  })
  const res = await deps.ask(ask)
  if (!res.ok) return askReply(res.problem, false)
  const lines = normaliseSummary(res.json, ask.check)
  if (!lines) return askReply('unreadable', false)
  const summary = { lines, lang: r.value.lang }
  const { error: saveError } = await deps.service().rpc('ai_save_month_summary', {
    p_user: user.id, p_month: r.value.month, p_summary: summary, p_fingerprint: state.fingerprint,
  })
  if (saveError) return dbReply(saveError)
  return { status: 200, body: { summary: { ...summary, written_at: new Date().toISOString() }, stale: false } }
}
