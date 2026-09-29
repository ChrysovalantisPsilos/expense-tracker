import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { isSafeToReload, missedUpdate } from '../shared/lib/autoUpdate.js'

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
// once they stop typing, close the dialog or leave a form page with unsaved
// input (isSafeToReload), or switch away. A page no worker controls gets no
// waiting worker: when a new one activates over an old one, it is reloaded
// the same way (missedUpdate), or it would stay on a build whose page chunks
// are gone from the server.
export default function AutoUpdate() {
  const [missed, setMissed] = useState(false)
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      registration.addEventListener('updatefound', () => {
        const sw = registration.installing
        const replacedActive = !!registration.active
        sw?.addEventListener('statechange', () => {
          if (missedUpdate({ state: sw.state, replacedActive, controlled: !!navigator.serviceWorker.controller })) setMissed(true)
        })
      })
      const check = () => {
        if (document.visibilityState === 'visible') registration.update().catch(() => {})
      }
      setInterval(check, UPDATE_CHECK_MS)
      document.addEventListener('visibilitychange', check)
      window.addEventListener('online', check)
    },
  })

  useEffect(() => {
    if (!needRefresh && !missed) return undefined
    let done = false
    const tryUpdate = () => {
      if (done || !isSafeToReload(document)) return
      done = true
      // A missed update has no waiting worker to activate (the plugin still
      // flags it as needRefresh, and its skip-waiting then does nothing).
      if (missed) window.location.reload()
      else updateServiceWorker(true)
    }
    tryUpdate()
    const timer = setInterval(tryUpdate, RETRY_MS)
    document.addEventListener('visibilitychange', tryUpdate)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tryUpdate)
    }
  }, [needRefresh, missed, updateServiceWorker])

  return null
}
