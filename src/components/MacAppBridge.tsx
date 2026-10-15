import { useEffect, useEffectEvent, useRef } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { onMacMessage, postToMac, useMacBadgeEnabled, useMacRemindersEnabled, type FromMac } from '@/lib/native'
import { useEvents, useSetTaskStatus, useTasks } from '@/lib/queries'
import { todaySummary, upcomingReminders } from '@/lib/reminders'
import { useNow } from '@/lib/useNow'
import { useOpenQuickAdd } from './quickAddContext'

/**
 * Rendered only in the Mac app. Keeps the reminders macOS holds in step with your tasks and events,
 * and carries out what you pick in a notification or the menu bar.
 */
export function MacAppBridge() {
  const tasks = useTasks()
  const events = useEvents()
  const enabled = useMacRemindersEnabled()
  const badgeOn = useMacBadgeEnabled()
  const now = useNow()
  const navigate = useNavigate()
  const setStatus = useSetTaskStatus()
  const openQuickAdd = useOpenQuickAdd()

  const handle = useEffectEvent((m: FromMac) => {
    if (m.type === 'open') navigate(m.path)
    if (m.type === 'quickAdd') openQuickAdd({ instant: true })
    if (m.type === 'saved') toast.success(`Saved ${m.name}`)
    if (m.type === 'done') {
      setStatus.mutate({ id: m.taskId, status: 'done' })
      const title = tasks.data?.find((t) => t.id === m.taskId)?.title
      toast.success(title ? `Marked “${title}” done` : 'Marked done')
    }
  })

  useEffect(() => {
    const off = onMacMessage((m) => handle(m))
    // Tells the app the page is listening; it then sends anything it held back, such as a
    // notification you clicked before the page had loaded.
    postToMac({ type: 'hello' })
    return () => {
      off()
    }
  }, [])

  const sent = useRef<string | null>(null)
  useEffect(() => {
    if (!tasks.data || !events.data) return
    const list = enabled ? upcomingReminders(tasks.data, events.data, new Date()) : []
    const key = JSON.stringify(list)
    if (key === sent.current) return
    sent.current = key
    postToMac({ type: 'reminders', reminders: list })
  }, [tasks.data, events.data, enabled])

  // The menu bar's Today list and the Dock badge. Rechecked every minute, as times pass.
  const sentToday = useRef<string | null>(null)
  useEffect(() => {
    if (!tasks.data || !events.data) return
    const { overdue, items } = todaySummary(tasks.data, events.data, now)
    const message = { type: 'today' as const, overdue, badge: badgeOn ? overdue : 0, items }
    const key = JSON.stringify(message)
    if (key === sentToday.current) return
    sentToday.current = key
    postToMac(message)
  }, [tasks.data, events.data, now, badgeOn])

  return null
}
