import { endOfDay, format, isSameDay } from 'date-fns'
import { toDate } from './dates'
import type { NativeReminder, TodayItem } from './native'
import type { CalEvent, TaskSummary } from './types'

/** How far ahead reminders are handed to macOS. The list is refreshed whenever the data changes. */
const HORIZON_DAYS = 14
/** Well under the number of pending notifications macOS keeps for one app. */
const MAX_REMINDERS = 50

export function upcomingReminders(tasks: TaskSummary[], events: CalEvent[], now: Date): NativeReminder[] {
  const from = now.getTime()
  const until = from + HORIZON_DAYS * 86_400_000
  const soon = (iso: string | null) => {
    if (!iso) return null
    const at = toDate(iso).getTime()
    return at > from && at <= until ? at : null
  }
  const list: NativeReminder[] = []

  for (const t of tasks) {
    const at = t.status === 'done' ? null : soon(t.remind_at)
    if (at === null) continue
    const due = t.due_at ? toDate(t.due_at) : null
    list.push({
      id: `task:${t.id}:${t.remind_at}`,
      kind: 'task',
      taskId: t.id,
      title: t.title,
      body: due ? `Due ${format(due, isSameDay(due, at) ? 'HH:mm' : 'EEE d MMM, HH:mm')}` : 'Reminder',
      at,
      path: `/?task=${t.id}`,
    })
  }

  for (const e of events) {
    const at = soon(e.remind_at)
    if (at === null) continue
    const start = toDate(e.starts_at)
    const when = e.all_day
      ? `All day, ${format(start, 'EEE d MMM')}`
      : `Starts ${format(start, isSameDay(start, at) ? 'HH:mm' : 'EEE d MMM, HH:mm')}${e.ends_at ? ` to ${format(toDate(e.ends_at), 'HH:mm')}` : ''}`
    list.push({
      id: `event:${e.id}:${e.remind_at}`,
      kind: 'event',
      taskId: null,
      title: e.title,
      body: e.location ? `${when} · ${e.location}` : when,
      at,
      path: `/?event=${e.id}`,
    })
  }

  return list.sort((a, b) => a.at - b.at).slice(0, MAX_REMINDERS)
}

/**
 * What the menu bar lists under Today: open tasks due today and events still to come, in time
 * order, plus how many tasks have passed their deadline (the Dock badge).
 */
export function todaySummary(tasks: TaskSummary[], events: CalEvent[], now: Date) {
  const end = endOfDay(now)
  const open = tasks.filter((t) => t.status !== 'done' && t.due_at)
  const overdue = open.filter((t) => toDate(t.due_at!) < now).length

  const items: (TodayItem & { at: number })[] = [
    ...open
      .filter((t) => isSameDay(toDate(t.due_at!), now))
      .map((t) => {
        const due = toDate(t.due_at!)
        return { at: due.getTime(), when: due < now ? 'Overdue' : format(due, 'HH:mm'), title: t.title, path: `/?task=${t.id}` }
      }),
    ...events
      .filter((e) => {
        const start = toDate(e.starts_at)
        const finish = e.ends_at ? toDate(e.ends_at) : start
        return isSameDay(start, now) && (e.all_day || finish >= now) && start <= end
      })
      .map((e) => {
        const start = toDate(e.starts_at)
        return { at: e.all_day ? 0 : start.getTime(), when: e.all_day ? 'All day' : format(start, 'HH:mm'), title: e.title, path: `/?event=${e.id}` }
      }),
  ].sort((a, b) => a.at - b.at)

  return { overdue, items: items.slice(0, 8).map(({ when, title, path }) => ({ when, title, path })) }
}
