// The AI helpers' data layer: the three switches (profile columns, 0103),
// the ai-helper edge function's three actions, and the month summary as the
// server keeps it. The rules are in aiMath.js.
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../shared/lib/supabase.js'
import { useLiveQuery } from '../../shared/lib/db.js'
import { dbError, edgeFunctionError } from '../../shared/lib/errors.js'
import { updateProfile } from '../../shared/lib/profile.js'
import { EVENTS, STORAGE_KEYS } from '../../shared/lib/keys.js'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { useLanguage } from '../../shared/lib/i18n/I18nProvider.jsx'
import { categoryDisplayName } from '../../shared/lib/categoryName.js'
import { today } from '../../shared/lib/dates.js'
import {
  AI_SWITCHES, applySuggestions, categoryLabels, helpersOn, monthStartOf, shouldAutoWrite, suggestionRequest, summaryState,
} from './aiMath.js'

// { quickEntry, importCategories, monthSummary }: which helpers are on.
export function useAiHelpers() {
  const { profile, isDemo } = useProfile()
  return helpersOn(profile, isDemo)
}

// Switch one helper on or off. The server records the change in the consent
// history (and, for the month summary, turning it off deletes the summaries).
export async function saveAiHelper(userId, id, on) {
  await updateProfile(userId, { [AI_SWITCHES[id]]: on })
  window.dispatchEvent(new Event(EVENTS.profileUpdated))
}

// An error from ai-helper, with its code (aiMath.aiErrorKey names its words).
async function callAiHelper(body) {
  const { data, error } = await supabase.functions.invoke('ai-helper', { body })
  if (!error) return data
  const e = await edgeFunctionError(error)
  throw Object.assign(e instanceof Error ? e : new Error(String(e)), { code: e?.code ?? 'failed' })
}

// "Type it": the typed line → { kind, amount_minor, currency, date,
// category_id, description } for the form. `categories` are the user's (for
// their names as the app shows them).
export async function fillFromText(text, categories) {
  const data = await callAiHelper({
    action: 'parse_entry', text, today: today(), labels: categoryLabels(categories, categoryDisplayName),
  })
  return data.entry
}

// Import: category ideas for the new merchants → [{ index, category_id }]
// into `ids` (suggestionRequest).
export async function suggestCategories(groups, categories) {
  const { ids, merchants } = suggestionRequest(groups)
  const data = await callAiHelper({
    action: 'suggest_categories', merchants, labels: categoryLabels(categories, categoryDisplayName),
  })
  return { ids, suggestions: data.suggestions ?? [] }
}

async function readMonthSummary(month) {
  const { data, error } = await supabase.rpc('my_month_summary', { p_month: month })
  if (error) throw dbError(error)
  return data
}

// This month's summary for the Insights and Home cards: kept fresh over
// realtime (a new entry or budget can make it stale), written once without
// asking when there is none yet, and rewritten on Update.
//   state   aiMath.summaryState ('hidden' | 'writing' | 'failed' | 'ready' | 'stale')
//   summary { lines, lang, written_at } or null
//   month   'YYYY-MM-01'
//   write() write it (again)
export function useMonthSummary(categories) {
  const { user } = useAuth()
  const uid = user?.id ?? null
  const { monthSummary: on } = useAiHelpers()
  const { lang } = useLanguage()
  const month = monthStartOf(today())
  const { data, error, reload } = useLiveQuery(() => readMonthSummary(month), {
    key: uid && on ? `ai-summary:${uid}` : null,
    specs: uid ? [
      { table: 'transactions', filter: `user_id=eq.${uid}` },
      { table: 'budgets', filter: `user_id=eq.${uid}` },
    ] : [],
    deps: [uid, on, month],
    enabled: !!uid && on,
    initial: undefined,
  })
  const [writing, setWriting] = useState(false)
  const [writeFailed, setWriteFailed] = useState(false)
  const attempted = useRef(null) // the month already written (or tried) this visit
  const labels = useRef({})
  labels.current = categoryLabels(categories, categoryDisplayName)

  const write = useCallback(async () => {
    attempted.current = month
    setWriting(true)
    setWriteFailed(false)
    try {
      await callAiHelper({ action: 'month_summary', month, lang, labels: labels.current })
      await reload().catch(() => {})
    } catch (e) {
      console.error('[ai] month summary not written:', e?.code ?? e)
      setWriteFailed(true)
    } finally {
      setWriting(false)
    }
  }, [month, lang, reload])

  const shown = on ? data : null
  useEffect(() => {
    if (shouldAutoWrite({ data: shown, attempted: attempted.current === month })) write()
  }, [shown, month, write])

  const state = summaryState({ data: shown, error, writing, writeFailed, lang })
  return { state, summary: shown?.summary ?? null, month, write, writeFailed }
}

// Home's summary card hidden until next month (this device only).
export function summaryHidden(month) {
  try { return localStorage.getItem(STORAGE_KEYS.aiSummaryHidden) === month } catch { return false }
}
export function hideSummary(month) {
  try { localStorage.setItem(STORAGE_KEYS.aiSummaryHidden, month) } catch { /* private mode: hidden until reload */ }
}

// Import: category ideas for the review step's new merchants, asked for once
// per statement when the helper is on. Each idea fills a merchant the user
// hasn't picked yet (`setAssign`), and stays marked until changed.
//   status  'idle' | 'working' | 'done' | 'failed'
//   suggested  { group id: category id }
export function useCategoryIdeas({ groups, categories, enabled, setAssign }) {
  const [status, setStatus] = useState('idle')
  const [suggested, setSuggested] = useState({})
  const asked = useRef(null)
  useEffect(() => {
    if (!enabled || !groups?.length || asked.current === groups) return
    asked.current = groups
    setStatus('working')
    setSuggested({})
    suggestCategories(groups, categories).then(({ ids, suggestions }) => {
      if (asked.current !== groups) return // another statement since
      setSuggested(applySuggestions({}, ids, suggestions).suggested)
      setAssign((a) => applySuggestions(a, ids, suggestions).assign)
      setStatus('done')
    }).catch((e) => {
      console.error('[ai] no category ideas:', e?.code ?? e)
      if (asked.current === groups) setStatus('failed')
    })
  }, [enabled, groups, categories, setAssign])
  return { status, suggested }
}
