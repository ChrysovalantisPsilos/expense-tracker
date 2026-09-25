import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import RingLoader from '../../shared/ui/RingLoader.jsx'
import LinkExpired from './LinkExpired.jsx'
import { confirmDestination, CONFIRM_PATH, parseConfirmLink } from './confirmLink.js'

// /auth/confirm — where the links in the auth emails land (confirmLink.js).
// Signed out only: the verified link brings a session, and the signed-in app
// takes over (App.jsx: a pending invite, else the stashed return path, else
// Home); a reset link goes on to the new-password screen.
export default function ConfirmLink() {
  const location = useLocation()
  const navigate = useNavigate()
  const { verifyEmailLink } = useAuth()
  // Read once: the token leaves the address bar straight away.
  const [link] = useState(() => parseConfirmLink(location.search))
  const [failed, setFailed] = useState(!link)
  const started = useRef(false)

  useEffect(() => {
    if (!link || started.current) return
    started.current = true
    navigate(CONFIRM_PATH, { replace: true })
    verifyEmailLink(link).then(({ error }) => {
      if (error) {
        console.error('[auth] email link failed:', error)
        setFailed(true)
        return
      }
      const to = confirmDestination(link.type)
      if (to) navigate(to, { replace: true })
    })
  }, [link, navigate, verifyEmailLink])

  if (failed) return <LinkExpired type={link?.type} />
  return <RingLoader fullScreen />
}
