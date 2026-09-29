// One call to Claude with the official SDK: the helper's prompt, answered as
// strict JSON (structured outputs, output_config.format with the helper's
// schema), turned into an AskResult. Claude Haiku 4.5 (AI_MODEL) takes no
// effort level, adaptive thinking or server-side fallbacks, so none is sent.
// The key comes from the ANTHROPIC_API_KEY function secret; without one the
// function answers "not configured" and never calls out.

import Anthropic from 'npm:@anthropic-ai/sdk@0.128.0'
import { AI_MODEL, type Ask, type AskResult, readReply } from '../_shared/aiHelper.ts'

export function claudeAsker(apiKey: string | undefined): ((a: Ask) => Promise<AskResult>) | null {
  if (!apiKey) return null
  // One retry (the SDK backs off on 429/5xx), and a short wait: the app shows
  // a spinner meanwhile.
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 30_000 })
  return async (a) => {
    try {
      const message = await client.messages.create({
        model: AI_MODEL,
        max_tokens: a.maxTokens,
        system: a.system,
        messages: [{ role: 'user', content: a.user }],
        output_config: { format: { type: 'json_schema', schema: a.schema } },
      })
      return readReply(message)
    } catch (e) {
      // Typed SDK errors, most specific first; never the prompt in the log.
      if (e instanceof Anthropic.RateLimitError) return { ok: false, problem: 'busy' }
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
        console.error('ai-helper: the API key was refused', e.status)
        return { ok: false, problem: 'not_configured' }
      }
      if (e instanceof Anthropic.InternalServerError && e.status === 529) return { ok: false, problem: 'busy' }
      if (e instanceof Anthropic.APIError) {
        console.error('ai-helper: API error', e.status, e.constructor.name)
        return { ok: false, problem: 'failed' }
      }
      console.error('ai-helper: call failed', e instanceof Error ? e.name : typeof e)
      return { ok: false, problem: 'failed' }
    }
  }
}
