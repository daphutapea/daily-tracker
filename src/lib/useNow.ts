import { useEffect, useState } from 'react'

/**
 * The current time, refreshed every `intervalMs`. Reading `new Date()` while rendering gives a time
 * that never moves on its own, so an "overdue" label would only update when something else re-rendered.
 */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}
