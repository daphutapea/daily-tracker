import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

/**
 * Task and event dialogs are driven by the URL (?task=<id|new>, ?event=<id|new>) so any page,
 * the calendar, or a pasted link can open them, and the browser back button closes them.
 */
const DIALOG_PARAMS = ['task', 'event', 'due', 'date'] as const

export function useDialogs() {
  const [params, setParams] = useSearchParams()

  const open = useCallback(
    (kind: 'task' | 'event', id: string, extra: Partial<Record<'due' | 'date', string>> = {}) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        DIALOG_PARAMS.forEach((k) => next.delete(k))
        next.set(kind, id)
        Object.entries(extra).forEach(([k, v]) => v && next.set(k, v))
        return next
      })
    },
    [setParams],
  )

  const close = useCallback(() => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        DIALOG_PARAMS.forEach((k) => next.delete(k))
        return next
      },
      { replace: true },
    )
  }, [setParams])

  return {
    taskId: params.get('task'),
    eventId: params.get('event'),
    due: params.get('due'),
    date: params.get('date'),
    openTask: (id: string, extra?: { due?: string }) => open('task', id, extra),
    openEvent: (id: string, extra?: { date?: string }) => open('event', id, extra),
    close,
  }
}
