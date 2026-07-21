import { useEffect, useRef } from 'react'
import { supabase } from './supabase.js'

// Live refetch: the app's one realtime primitive. Subscribes to postgres
// changes and calls `refetch` (debounced) when anything relevant happens.
// Catch-up is built in — realtime doesn't replay events missed while a
// websocket was down or a tab was asleep, so we also refetch on every
// re-subscribe and whenever the tab becomes visible again. With that, no
// steady-state polling is needed anywhere.
//
//   channelKey — stable identity for the subscription; pass null to disable
//                (e.g. a closed modal). Changing it tears down + resubscribes.
//   specs      — [{ table, filter? }] in schema public, all events.
//   refetch    — called to reload the caller's data; always reads the latest
//                closure via a ref, so callers don't need useCallback.

let seq = 0

export function useLiveRefetch(channelKey, specs, refetch, { debounceMs = 300 } = {}) {
  const cb = useRef(refetch)
  cb.current = refetch
  // Channel topics must be unique per client — two pages watching the same
  // table each get their own suffix.
  const uid = useRef(++seq)
  const specsJson = JSON.stringify(specs)

  useEffect(() => {
    if (!channelKey) return
    let timer = null
    let subscribedOnce = false
    const bump = () => {
      clearTimeout(timer)
      timer = setTimeout(() => cb.current(), debounceMs)
    }

    // Realtime is an enhancement — it must NEVER take the app down. A throw
    // out of a mount effect (e.g. the realtime client rejecting a subscribe)
    // unmounts the entire React root: the user sees a blank page. Degrade to
    // no-live-updates instead.
    let ch = null
    try {
      ch = supabase.channel(`${channelKey}#${uid.current}`)
      for (const spec of JSON.parse(specsJson)) {
        ch.on('postgres_changes', { event: '*', schema: 'public', ...spec }, bump)
      }
      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // First subscribe races the caller's initial load — skip. Every
          // later one is a reconnect, where events may have been missed.
          if (subscribedOnce) bump()
          subscribedOnce = true
        }
      })
    } catch (e) {
      console.error('[realtime] subscription failed; continuing without live updates', e)
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') bump()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      if (ch) supabase.removeChannel(ch)
    }
  }, [channelKey, specsJson, debounceMs])
}
