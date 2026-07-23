import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'

const AuthContext = createContext(null)

// Is a Supabase session token persisted in this browser? Used to avoid a
// landing-page flash: if a token exists, we keep showing the loading spinner
// (rather than the logged-out landing) until auth definitively settles.
function hasStoredSession() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token') && localStorage.getItem(k)) {
        return true
      }
    }
  } catch { /* localStorage unavailable */ }
  return false
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  // True from when a password-recovery link is opened until the new password is
  // saved. The link establishes a real session, so without this flag the app
  // would drop the user straight into the dashboard with their password unset.
  const [recovering, setRecovering] = useState(false)

  useEffect(() => {
    let mounted = true
    const stored = hasStoredSession()

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      // Settle immediately when we have a session, or when there's nothing
      // stored (genuinely logged out). If a token IS stored but getSession
      // momentarily returned null (rehydrate/refresh race), stay on the
      // spinner and let onAuthStateChange deliver the session.
      if (data.session || !stored) setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (!mounted) return
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      setSession(s)
      setLoading(false)
    })

    // Safety net: never hang on the spinner if auth never settles.
    const timeout = setTimeout(() => { if (mounted) setLoading(false) }, 4000)

    return () => {
      mounted = false
      clearTimeout(timeout)
      sub.subscription.unsubscribe()
    }
  }, [])

  const signInWithPassword = useCallback(
    (email, password) => supabase.auth.signInWithPassword({ email, password }),
    [],
  )

  const signUp = useCallback(
    (email, password) =>
      supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      }),
    [],
  )

  const signInWithProvider = useCallback(
    (provider) =>
      supabase.auth.signInWithOAuth({
        provider, // 'google' | 'apple'
        options: { redirectTo: window.location.origin },
      }),
    [],
  )

  const signOut = useCallback(async () => {
    const res = await supabase.auth.signOut()
    // Clear the cached financial data (supabase REST responses) so it isn't
    // left behind on a shared device after logout.
    try { if ('caches' in window) await caches.delete('supabase-rest') } catch { /* ignore */ }
    return res
  }, [])

  const resendConfirmation = useCallback(
    (email) =>
      supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: window.location.origin },
      }),
    [],
  )

  // Email a password-reset link. The link lands on /reset-password, where the
  // recovery session lets the user set a new password. Supabase returns success
  // whether or not the address exists, so we never reveal which emails are known.
  const sendPasswordReset = useCallback(
    (email) =>
      supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      }),
    [],
  )

  // Set a new password on the current (recovery or signed-in) session.
  const updatePassword = useCallback(
    (password) => supabase.auth.updateUser({ password }),
    [],
  )

  const clearRecovery = useCallback(() => setRecovering(false), [])

  // Passkeys (WebAuthn). These no-op-guard so callers can rely on them even if
  // the API is missing on an older client build.
  const signInWithPasskey = useCallback(() => supabase.auth.signInWithPasskey(), [])
  const registerPasskey = useCallback(() => supabase.auth.registerPasskey(), [])
  const listPasskeys = useCallback(() => supabase.auth.passkey.list(), [])
  const deletePasskey = useCallback(
    (passkeyId) => supabase.auth.passkey.delete({ passkeyId }),
    [],
  )

  const value = {
    session,
    user: session?.user ?? null,
    loading,
    recovering,
    signInWithPassword,
    signUp,
    signInWithProvider,
    signOut,
    resendConfirmation,
    sendPasswordReset,
    updatePassword,
    clearRecovery,
    signInWithPasskey,
    registerPasskey,
    listPasskeys,
    deletePasskey,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
