import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { acceptLegalDocuments, getLegalStatus } from './privacyData.js'
import { GATE_VIEW, gateView, localAcceptanceFor } from './legalGateMath.js'
import { readLocalAcceptance, takeConsentMarker, writeLocalAcceptance } from './legalConsentStore.js'

// A check that hangs (a captive portal, a dead connection the browser still
// calls online) counts as failed after this long, so the user gets "Try
// again" instead of an endless loader.
const CHECK_TIMEOUT_MS = 10_000

function withTimeout(promise) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Legal status check timed out')), CHECK_TIMEOUT_MS)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

const EMPTY = { uid: null, status: null, failed: false, error: null, marker: null }

// Has the signed-in user accepted the Privacy Notice and Terms versions in
// force? Asked once per account per app load (a version bump reaches users the
// next time they open the app), and the app waits for the answer: `view`
// (legalGateMath.js) is what App.jsx renders. Fails closed: when the server
// can't be reached the app opens only if this device already saw this account
// accept the current versions; otherwise "Try again", which also re-runs by
// itself when the connection comes back or the tab is shown again.
export function useLegalGate() {
  const { user } = useAuth()
  const uid = user?.id ?? null
  // The last answer, for the account it was about (another account starts
  // from nothing). `marker`: the versions ticked before a Google sign-up,
  // taken with the first answer.
  const [result, setResult] = useState(EMPTY)
  const [attempt, setAttempt] = useState(0)
  const [checking, setChecking] = useState(false)
  const autoAccepted = useRef(false)
  const current = result.uid === uid ? result : EMPTY

  useEffect(() => {
    if (!uid) return undefined
    let active = true
    setChecking(true)
    withTimeout(getLegalStatus())
      .then((status) => {
        if (!active) return
        // The server's answer wins, and this device remembers it for offline use.
        writeLocalAcceptance(localAcceptanceFor(uid, status))
        setResult({ ...EMPTY, uid, status, marker: takeConsentMarker() })
      })
      .catch((e) => {
        if (!active) return
        console.error('[legal] status check failed:', e)
        setResult({ ...EMPTY, uid, failed: true, error: e })
      })
      .finally(() => { if (active) setChecking(false) })
    return () => { active = false }
  }, [uid, attempt])

  const view = gateView({
    status: current.status,
    failed: current.failed,
    marker: current.marker,
    local: current.failed ? readLocalAcceptance() : null,
    uid,
  })
  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  // While the server couldn't be reached (the error screen, or the app opened
  // from this device's memory), ask again once back online or back in view.
  const failed = current.failed
  useEffect(() => {
    if (!failed) return undefined
    const onVisible = () => { if (document.visibilityState === 'visible') retry() }
    window.addEventListener('online', retry)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', retry)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [failed, retry])

  const accept = useCallback(async () => {
    const status = await acceptLegalDocuments()
    writeLocalAcceptance(localAcceptanceFor(uid, status))
    setResult({ ...EMPTY, uid, status })
  }, [uid])

  // Signed up with Google after ticking the box: record that acceptance now
  // (the server records its own versions, which the marker was checked
  // against). The loader stays up meanwhile; if it fails, the prompt shows.
  useEffect(() => {
    if (view !== GATE_VIEW.autoAccept || autoAccepted.current) return
    autoAccepted.current = true
    accept().catch((e) => {
      console.error('[legal] recording the sign-up acceptance failed:', e)
      setResult((r) => ({ ...r, marker: null }))
    })
  }, [view, accept])

  return { view, status: current.status, error: current.error, checking, accept, retry }
}
