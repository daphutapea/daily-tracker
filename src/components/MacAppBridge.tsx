import { useEffect, useEffectEvent, useRef } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { backupFilename, makeBackup } from '@/lib/backup'
import {
  inMacApp,
  onMacMessage,
  postToMac,
  useLastBackup,
  useMacBackupsEnabled,
  useMacBadgeEnabled,
  useMacIphoneEnabled,
  useMacRemindersEnabled,
  type FromMac,
} from '@/lib/native'
import { useEvents, useProfile, useSetTaskStatus, useTasks } from '@/lib/queries'
import { todaySummary, upcomingReminders, upcomingSummaries } from '@/lib/reminders'
import { useNow } from '@/lib/useNow'
import { useOpenTracky } from './trackyContext'

/**
 * Rendered in the Mac and iPhone apps. Keeps the reminders macOS holds in step with your tasks and events,
 * and carries out what you pick in a notification or the menu bar.
 */
export function MacAppBridge() {
  const tasks = useTasks()
  const events = useEvents()
  const enabled = useMacRemindersEnabled()
  const badgeOn = useMacBadgeEnabled()
  const iphone = useMacIphoneEnabled()
  const profile = useProfile()
  const now = useNow()
  const navigate = useNavigate()
  const setStatus = useSetTaskStatus()
  const openTracky = useOpenTracky()
  const backupsOn = useMacBackupsEnabled()
  const lastBackup = useLastBackup()

  const handle = useEffectEvent((m: FromMac) => {
    if (m.type === 'open') navigate(m.path)
    if (m.type === 'tracky') openTracky({ instant: true })
    if (m.type === 'saved') toast.success(`Saved ${m.name}`)
    if (m.type === 'backupFailed') toast.error(`Couldn’t save the weekly backup: ${m.message}`)
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

  // Reminders and the next summaries, handed to macOS (and the iPhone calendar when that's on).
  // Rechecked every minute too, so a summary that has fired is replaced by the next one.
  const sent = useRef<string | null>(null)
  useEffect(() => {
    if (!tasks.data || !events.data || !profile.data) return
    const list = enabled
      ? [...upcomingReminders(tasks.data, events.data, now), ...upcomingSummaries(tasks.data, events.data, profile.data, now)]
      : []
    const openTasks = enabled ? tasks.data.filter((t) => t.status !== 'done').map((t) => t.id) : []
    // The calendar route to the iPhone is for the Mac app; the iPhone app notifies by itself.
    const message = { type: 'reminders' as const, reminders: list.sort((a, b) => a.at - b.at), calendar: inMacApp && iphone, openTasks }
    const key = JSON.stringify(message)
    if (key === sent.current) return
    sent.current = key
    postToMac(message)
  }, [tasks.data, events.data, profile.data, enabled, iphone, now])

  // The weekly backup: once the last one is a week old (or there is none), the page makes the file
  // and the Mac app saves it. Asked once per launch, so a failing disk doesn't retry every minute.
  const backupAsked = useRef(false)
  useEffect(() => {
    // iCloud Drive backups are the Mac app's; the iPhone app can't write there without a paid account.
    if (!inMacApp || !backupsOn || backupAsked.current) return
    if (lastBackup && now.getTime() - Date.parse(lastBackup.at) < 7 * 86_400_000) return
    backupAsked.current = true
    makeBackup()
      .then((backup) => postToMac({ type: 'backup', filename: backupFilename(), content: JSON.stringify(backup, null, 2) }))
      .catch((e: unknown) => toast.error(`Couldn’t make the weekly backup: ${e instanceof Error ? e.message : String(e)}`))
  }, [backupsOn, lastBackup, now])

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
