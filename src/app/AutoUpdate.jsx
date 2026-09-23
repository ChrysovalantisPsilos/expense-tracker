import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { isSafeToReload } from '../shared/lib/autoUpdate.js'

// How often an open, visible tab re-checks for a new deploy. The check is a
// conditional fetch of sw.js (304 from the CDN when unchanged) — cheap enough
// to pick up deploys effectively in real time.
const UPDATE_CHECK_MS = 60 * 1000
// While a new version waits for a safe moment, how often to look again.
const RETRY_MS = 5 * 1000

// Installs new deploys automatically, with no button to press. The browser
// only checks for a new worker on navigation, so an open tab (or installed
// PWA) re-checks on an interval while visible, on focus and on reconnect.
// When one is waiting, it activates and reloads as soon as that won't lose
// anything: immediately if the user is idle or the tab is hidden, otherwise
// once they stop typing / close the dialog, or switch away.
export default function AutoUpdate() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => {
        if (document.visibilityState === 'visible') registration.update().catch(() => {})
      }
      setInterval(check, UPDATE_CHECK_MS)
      document.addEventListener('visibilitychange', check)
      window.addEventListener('online', check)
    },
  })

  useEffect(() => {
    if (!needRefresh) return undefined
    let done = false
    const tryUpdate = () => {
      if (done || !isSafeToReload(document)) return
      done = true
      updateServiceWorker(true)
    }
    tryUpdate()
    const timer = setInterval(tryUpdate, RETRY_MS)
    document.addEventListener('visibilitychange', tryUpdate)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tryUpdate)
    }
  }, [needRefresh, updateServiceWorker])

  return null
}
