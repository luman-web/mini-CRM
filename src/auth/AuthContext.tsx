import type { Session } from '@supabase/supabase-js'
/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types'

type AuthContextValue = {
  session: Session | null
  profile: Profile | null
  loading: boolean
  error: string | null
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)
const REFRESH_MARGIN_MS = 5 * 60 * 1000
const SESSION_CHECK_INTERVAL_MS = 60 * 1000

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const profileRef = useRef<Profile | null>(null)
  const refreshPromiseRef = useRef<Promise<Session | null> | null>(null)

  useEffect(() => {
    profileRef.current = profile
  }, [profile])

  const loadProfile = useCallback(async (userId: string) => {
    if (!supabase) return

    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, role, created_at')
      .eq('id', userId)
      .maybeSingle()

    if (profileError) {
      if (!profileRef.current) {
        setError('Не удалось загрузить профиль. Проверьте соединение и обновите страницу.')
      }
      return false
    }

    if (!data) {
      setProfile(null)
      setError('Для пользователя не найден профиль с ролью. Проверьте таблицу profiles.')
      return false
    }

    setProfile(data as Profile)
    setError(null)
    return true
  }, [])

  const ensureFreshSession = useCallback(async () => {
    if (!supabase) return null
    if (refreshPromiseRef.current) return refreshPromiseRef.current

    const refreshPromise = (async () => {
      const { data, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !data.session) return null

      const currentSession = data.session
      const expiresAt = currentSession.expires_at ? currentSession.expires_at * 1000 : 0
      const needsRefresh = !expiresAt || expiresAt - Date.now() <= REFRESH_MARGIN_MS

      if (!needsRefresh) {
        setSession(currentSession)
        return currentSession
      }

      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession()
      if (refreshError || !refreshed.session) {
        // Supabase keeps retryable failures in storage. Do not clear a valid UI
        // session because the network was temporarily unavailable.
        const { data: recovered } = await supabase.auth.getSession()
        return recovered.session
      }

      setSession(refreshed.session)
      return refreshed.session
    })()

    refreshPromiseRef.current = refreshPromise
    try {
      return await refreshPromise
    } finally {
      refreshPromiseRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let active = true

    ensureFreshSession()
      .then(async (currentSession) => {
        if (!active) return
        setSession(currentSession)
        if (currentSession) await loadProfile(currentSession.user.id)
      })
      .catch(() => {
        if (active) setError('Не удалось восстановить сессию. Проверьте соединение и обновите страницу.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      if (!nextSession) {
        setProfile(null)
        setError(null)
        setLoading(false)
        return
      }

      // Refreshing an access token does not change the application profile.
      // Avoid an unnecessary database request that could clear the role during
      // a short network failure.
      if (event === 'TOKEN_REFRESHED' && profileRef.current?.id === nextSession.user.id) return
      if (profileRef.current?.id === nextSession.user.id) return

      if (!profileRef.current) setLoading(true)
      window.setTimeout(() => {
        loadProfile(nextSession.user.id).finally(() => setLoading(false))
      }, 0)
    })

    const checkSession = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void ensureFreshSession()
      }
    }
    const handleVisibilityChange = () => checkSession()

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', checkSession)
    window.addEventListener('online', checkSession)
    const interval = window.setInterval(checkSession, SESSION_CHECK_INTERVAL_MS)

    return () => {
      active = false
      listener.subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', checkSession)
      window.removeEventListener('online', checkSession)
      window.clearInterval(interval)
    }
  }, [ensureFreshSession, loadProfile])

  const signIn = async (email: string, password: string) => {
    if (!supabase) return 'Supabase не настроен'
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    return signInError ? 'Не удалось войти. Проверьте email и пароль.' : null
  }

  const signOut = async () => {
    await supabase?.auth.signOut()
  }

  const value = useMemo(
    () => ({ session, profile, loading, error, signIn, signOut }),
    [session, profile, loading, error],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
