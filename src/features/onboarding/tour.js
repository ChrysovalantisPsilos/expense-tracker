import { useCallback, useEffect, useRef, useState } from 'react'
import { EVENTS } from '../../shared/lib/keys.js'

const here = () => `${window.location.pathname}${window.location.search}`

// Start the app tour from anywhere (the setup wizard's last step, Settings'
// "Take the tour again"). It ends on `returnTo` (default: where it started),
// focusing the `returnFocus` selector if given.
export function startTour({ returnTo, returnFocus } = {}) {
  window.dispatchEvent(new CustomEvent(EVENTS.startTour, { detail: { returnTo, returnFocus } }))
}

// App-level tour state: `tour` is null or { returnTo, returnFocus } while it
// runs. Starts on startTour(), or by itself once per session when `pending`
// (onboarded, but profiles.tour_done isn't set yet — the app was closed
// mid-tour, maybe on another device). Never twice at once.
export function useTour(pending) {
  const [tour, setTour] = useState(null)
  const started = useRef(false)

  useEffect(() => {
    function onStart(e) {
      started.current = true
      setTour((t) => t ?? { returnTo: e.detail?.returnTo || here(), returnFocus: e.detail?.returnFocus })
    }
    window.addEventListener(EVENTS.startTour, onStart)
    return () => window.removeEventListener(EVENTS.startTour, onStart)
  }, [])

  useEffect(() => {
    if (!pending || started.current) return
    started.current = true
    setTour({ returnTo: here() })
  }, [pending])

  const endTour = useCallback(() => setTour(null), [])
  return { tour, endTour }
}
