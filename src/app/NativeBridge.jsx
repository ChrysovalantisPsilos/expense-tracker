import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useColorMode } from '@chakra-ui/react'
import { useAuth } from '../shared/auth/AuthProvider.jsx'
import { deepLinkTarget } from '../shared/lib/deepLinks.js'
import { closeBrowser, onAppUrl, openInBrowser, setStatusBarTheme } from '../shared/lib/native.js'

// Each URL is acted on once: the launch URL can also arrive as an event, and
// an Auth code works only once.
const handled = new Set()

// The iOS app's link to the phone (rendered only there; main.jsx loads it
// lazily behind isNative(), so the website never downloads it):
//  - links that open the app (deepLinks.js): Google sign-in coming back from
//    the system browser, email confirm/reset links and invite links;
//  - the status bar's text colour following the app's light/dark mode.
export default function NativeBridge() {
  const navigate = useNavigate()
  const { finishNativeSignIn } = useAuth()
  const { colorMode } = useColorMode()

  useEffect(() => { setStatusBarTheme(colorMode) }, [colorMode])

  useEffect(() => onAppUrl(async (url) => {
    if (handled.has(url)) return
    handled.add(url)
    const target = deepLinkTarget(url)
    if (!target) return
    if (target.kind === 'browser') {
      openInBrowser(target.url)
      return
    }
    if (target.kind === 'signin') {
      closeBrowser()
      if (target.code) {
        const { error } = await finishNativeSignIn(target.code)
        if (error) console.error('[native] Google sign-in did not finish:', error)
      }
    }
    if (target.path) navigate(target.path, { replace: target.kind === 'signin' })
  }), [navigate, finishNativeSignIn])

  return null
}
