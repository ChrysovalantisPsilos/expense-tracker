import { useEffect, useRef, useState } from 'react'
import { createConfirmWait } from './confirmWait.js'

// "Check your inbox" waiting for the confirmation: while the page is open and
// the sign-up's password is still in memory, retry the sign-in on
// confirmWait's schedule, and at once when the visitor comes back to the tab.
// A session that arrives any other way (the link opened in this browser)
// replaces the signed-out pages, and unmounting stops the wait.
// `hold` is AuthProvider's holdPendingSignIn. Returns the wait's status
// ('idle' when there is nothing to wait with) and stop() for "Start over".
export function useConfirmWait(hold) {
  const [status, setStatus] = useState('idle')
  const waiterRef = useRef(null)

  useEffect(() => {
    const pending = hold()
    if (!pending) return undefined
    const waiter = createConfirmWait({
      attempt: pending.retry,
      forget: pending.release,
      onChange: setStatus,
      isVisible: () => document.visibilityState === 'visible',
    })
    const poke = () => waiter.poke()
    document.addEventListener('visibilitychange', poke)
    window.addEventListener('focus', poke)
    waiterRef.current = waiter
    waiter.start()
    return () => {
      document.removeEventListener('visibilitychange', poke)
      window.removeEventListener('focus', poke)
      waiterRef.current = null
      waiter.stop()
    }
  }, [hold])

  return { status, stop: () => waiterRef.current?.stop() }
}
