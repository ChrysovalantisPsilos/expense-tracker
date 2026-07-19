import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => {
      mounted = false
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

  const signOut = useCallback(() => supabase.auth.signOut(), [])

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
    signInWithPassword,
    signUp,
    signInWithProvider,
    signOut,
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
