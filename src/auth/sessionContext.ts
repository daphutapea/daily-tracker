import type { Session } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'

export type SessionState = { status: 'loading' } | { status: 'signed-out' } | { status: 'signed-in'; session: Session }

export const SessionContext = createContext<SessionState>({ status: 'loading' })

export const useSession = () => useContext(SessionContext)

export function useUserEmail() {
  const s = useSession()
  return s.status === 'signed-in' ? (s.session.user.email ?? '') : ''
}
