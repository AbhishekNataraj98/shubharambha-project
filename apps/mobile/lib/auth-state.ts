import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type Profile = {
  id: string
  name: string
  role: string
  city: string | null
}

type SessionState = {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  refreshProfile: () => Promise<void>
}

async function fetchProfile(userId: string) {
  const { data } = await supabase.from('users').select('id,name,role,city').eq('id', userId).maybeSingle()
  return data ?? null
}

async function safeFetchProfile(userId: string) {
  try {
    return await fetchProfile(userId)
  } catch {
    return null
  }
}

export function useSessionState(): SessionState {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshProfile = useCallback(async () => {
    const userId = session?.user?.id
    if (!userId) {
      setProfile(null)
      return
    }
    const next = await fetchProfile(userId)
    setProfile(next)
  }, [session?.user?.id])

  useEffect(() => {
    let mounted = true

    void supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      setSession(data.session)
      if (data.session?.user?.id) {
        const nextProfile = await safeFetchProfile(data.session.user.id)
        if (mounted) setProfile(nextProfile)
      } else {
        setProfile(null)
      }
      if (mounted) setLoading(false)
    }).catch(() => {
      if (!mounted) return
      setSession(null)
      setProfile(null)
      setLoading(false)
    })

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!mounted) return
      setSession(nextSession)
      if (nextSession?.user?.id) {
        const nextProfile = await safeFetchProfile(nextSession.user.id)
        if (mounted) setProfile(nextProfile)
      } else {
        setProfile(null)
      }
      if (mounted) setLoading(false)
    })

    return () => {
      mounted = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  return useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      refreshProfile,
    }),
    [loading, profile, refreshProfile, session]
  )
}
