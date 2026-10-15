import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'

type SessionState = { status: 'loading' } | { status: 'signed-out' } | { status: 'signed-in'; session: Session }

const SessionContext = createContext<SessionState>({ status: 'loading' })

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [state, setState] = useState<SessionState>({ status: 'loading' })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setState(data.session ? { status: 'signed-in', session: data.session } : { status: 'signed-out' })
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') qc.clear()
      setState(session ? { status: 'signed-in', session } : { status: 'signed-out' })
    })
    return () => sub.subscription.unsubscribe()
  }, [qc])

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>
}

export const useSession = () => useContext(SessionContext)

export function useUserEmail() {
  const s = useSession()
  return s.status === 'signed-in' ? (s.session.user.email ?? '') : ''
}
