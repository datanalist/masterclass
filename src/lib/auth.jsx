import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase.js'

const AuthContext = createContext({
  ready: false,
  session: null,
  user: null,
  profile: null,
  refreshProfile: async () => {},
  signIn: async () => {},
  signUp: async () => {},
  signOut: async () => {},
})

export function AuthProvider({ children }) {
  const [ready, setReady] = useState(!supabase)
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const userIdRef = useRef(null)
  userIdRef.current = session?.user?.id ?? null

  useEffect(() => {
    if (!supabase) return undefined

    let cancelled = false
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setSession(data.session ?? null)
      setReady(true)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      if (!next?.user?.id) setProfile(null)
    })

    return () => {
      cancelled = true
      data.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!supabase || !session?.user?.id) {
      setProfile(null)
      return undefined
    }

    let cancelled = false
    supabase
      .from('profiles')
      .select('id, email, points_balance')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && userIdRef.current === session.user.id) setProfile(data ?? null)
      })

    return () => {
      cancelled = true
    }
  }, [session?.user?.id])

  const value = useMemo(() => {
    const refreshProfile = async () => {
      const userId = userIdRef.current
      if (!supabase || !userId) {
        setProfile(null)
        return
      }
      const { data } = await supabase
        .from('profiles')
        .select('id, email, points_balance')
        .eq('id', userId)
        .maybeSingle()
      if (userIdRef.current !== userId) {
        if (!userIdRef.current) setProfile(null)
        return
      }
      setProfile(data ?? null)
    }

    return {
      ready,
      session,
      user: session?.user ?? null,
      profile,
      refreshProfile,
      signIn: async (email, password) => {
        if (!supabase) throw new Error('Supabase не настроен')
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        })
        if (error) throw error
      },
      signUp: async (email, password) => {
        if (!supabase) throw new Error('Supabase не настроен')
        const normalizedEmail = email.trim().toLowerCase()
        const { error } = await supabase.rpc('register_account', {
          p_email: normalizedEmail,
          p_password: password,
        })
        if (error) throw error
        const { data, error: loginError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        })
        if (loginError) throw loginError
        return data
      },
      signOut: async () => {
        userIdRef.current = null
        setProfile(null)
        setSession(null)
        if (!supabase) return
        await supabase.auth.signOut()
      },
    }
  }, [profile, ready, session])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
