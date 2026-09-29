// The ai-helper request handler, without the network: index.ts gives it the
// caller's Supabase client, a service-role client and the Claude call, so the
// unit tests run it with stubs (test/aiHelperHandler.test.js).
//
// Every action: a signed-in caller (the JWT is also verified at the gateway),
// a well-formed request, and — before Claude is called — ai_helper_start
// (0103) as the caller: that helper's switch is on, the account isn't the
// demo, and the per-user and overall rate limits allow it. What's sent is
// built here from the caller's own rows (RLS) and the request's few fields;
// the answer is validated (_shared/aiHelper.ts) before it's returned.

import {
  type Ask, type AskResult, HELPERS, categoryChoices, normaliseEntry, normaliseSuggestions, normaliseSummary,
  parseEntryAsk, readParseRequest, readSuggestRequest, readSummaryRequest, suggestAsk, summaryAsk,
} from '../_shared/aiHelper.ts'

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

async function myCategories(asUser: Db, labels: unknown) {
  const { data, error } = await asUser.from('categories').select('id, name, kind, is_archived')
  if (error) throw error
  return categoryChoices(data ?? [], labels)
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
    const categories = await myCategories(asUser, body.labels)
    const res = await deps.ask(parseEntryAsk({ ...r.value, baseCurrency: s.base, categories }))
    if (!res.ok) return askReply(res.problem, true)
    const entry = normaliseEntry(res.json, { today: r.value.today, baseCurrency: s.base, categories })
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

  // month_summary: the totals come from the database, never from the request.
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
  const categories = await myCategories(asUser, body.labels)
  const res = await deps.ask(summaryAsk({ totals: state.totals, lang: r.value.lang, categories, today: deps.today() }))
  if (!res.ok) return askReply(res.problem, false)
  const lines = normaliseSummary(res.json)
  if (!lines) return askReply('unreadable', false)
  const summary = { lines, lang: r.value.lang }
  const { error: saveError } = await deps.service().rpc('ai_save_month_summary', {
    p_user: user.id, p_month: r.value.month, p_summary: summary, p_fingerprint: state.fingerprint,
  })
  if (saveError) return dbReply(saveError)
  return { status: 200, body: { summary: { ...summary, written_at: new Date().toISOString() }, stale: false } }
}
