// Edge Function: ai-helper
// The four optional AI helpers (Settings → AI helpers, 0103/0105), one action each:
//   parse_entry         { text, today, labels }  → { entry }        (Add → Type it)
//   suggest_categories  { merchants, labels }    → { suggestions }  (Import)
//   month_summary       { month, lang, labels }  → { summary } | { empty }
//   plan_whatif         { text, labels }         → { whatif }       (Plan → Type a what-if)
// Claude (Anthropic) does the reading and writing; handler.ts checks the
// caller, the helper's switch and the rate limits first, and validates the
// answer after. Nothing is stored except a month summary (encrypted, 0103).
//
// verify_jwt = true. Secrets: ANTHROPIC_API_KEY (optional: without it every
// action answers 503 not_configured, which the app shows gracefully).

import { callerClient, json, serviceClient, withCors } from '../_shared/http.ts'
import { handle } from './handler.ts'
import { claudeAsker } from './claude.ts'

const ask = claudeAsker(Deno.env.get('ANTHROPIC_API_KEY'))

Deno.serve(withCors(async (req) => {
  try {
    const { status, body } = await handle(req, {
      asUser: callerClient(req),
      service: serviceClient,
      ask,
      today: () => new Date().toISOString().slice(0, 10),
    })
    return json(body, status)
  } catch (e) {
    console.error('ai-helper error', e instanceof Error ? e.message : e)
    return json({ error: 'Something went wrong.', code: 'failed' }, 500)
  }
}))
