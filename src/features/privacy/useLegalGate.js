import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { acceptLegalDocuments, getLegalStatus } from './privacyData.js'

// Has the signed-in user accepted the Privacy Notice and Terms versions in
// force? Checked once per account per app load (a version bump reaches users
// the next time they open the app). `needs` is true only on a definite answer
// from the server: if the check fails (offline), the app isn't blocked and
// the next load asks again.
export function useLegalGate() {
  const { user } = useAuth()
  const uid = user?.id ?? null
  const [status, setStatus] = useState(null)

  useEffect(() => {
    if (!uid) return undefined
    let active = true
    getLegalStatus()
      .then((s) => { if (active) setStatus(s) })
      .catch(() => { /* fail open; asked again on the next load */ })
    return () => { active = false; setStatus(null) }
  }, [uid])

  const accept = useCallback(async () => {
    setStatus(await acceptLegalDocuments())
  }, [])

  return { status, needs: !!status?.needs_acceptance, accept }
}
