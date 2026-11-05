import type { Session } from '@supabase/supabase-js'
/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadProfile = useCallback(async (userId: string) => {
    if (!supabase) return

    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, role, created_at')
      .eq('id', userId)
      .single()

    if (profileError) {
      setProfile(null)
      setError('Для пользователя не найден профиль с ролью. Проверьте таблицу profiles.')
      return
    }

    setProfile(data as Profile)
    setError(null)
  }, [])

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let active = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      if (data.session) await loadProfile(data.session.user.id)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      if (!nextSession) {
        setProfile(null)
        setError(null)
        setLoading(false)
        return
      }

      setLoading(true)
      window.setTimeout(() => {
        loadProfile(nextSession.user.id).finally(() => setLoading(false))
      }, 0)
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [loadProfile])

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
