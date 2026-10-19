import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { forgetTrackyChat } from '@/lib/trackyChat'
import { SessionContext, type SessionState } from './sessionContext'

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [state, setState] = useState<SessionState>({ status: 'loading' })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setState(data.session ? { status: 'signed-in', session: data.session } : { status: 'signed-out' })
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        qc.clear()
        forgetTrackyChat()
      }
      setState(session ? { status: 'signed-in', session } : { status: 'signed-out' })
    })
    return () => sub.subscription.unsubscribe()
  }, [qc])

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>
}
