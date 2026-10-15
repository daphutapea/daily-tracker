import { addDays, endOfDay, format, getISODay, isSameDay, nextMonday, set, startOfDay, startOfWeek } from 'date-fns'
import { toDate, WEEK_STARTS_ON } from './dates'
import type { NativeReminder, TodayItem } from './native'
import type { CalEvent, Profile, TaskSummary } from './types'

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

type SummarySettings = Pick<Profile, 'digest_enabled' | 'digest_time' | 'weekly_enabled' | 'weekly_day' | 'weekly_time'>

const atTime = (day: Date, time: string) => {
  const [hours, minutes] = time.split(':').map(Number)
  return set(day, { hours, minutes, seconds: 0, milliseconds: 0 })
}

/** A short fingerprint of the text, so a summary whose contents change replaces the old one. */
function fingerprint(text: string) {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * The next morning summary and the next weekly review, written from your data as it is now. The Mac
 * app rewrites them whenever your tasks change, so what arrives matches the day.
 */
export function upcomingSummaries(
  tasks: TaskSummary[],
  events: CalEvent[],
  settings: SummarySettings,
  now: Date,
): NativeReminder[] {
  const list: NativeReminder[] = []

  if (settings.digest_enabled) {
    let when = atTime(now, settings.digest_time)
    if (when <= now) when = atTime(addDays(now, 1), settings.digest_time)
    const open = tasks.filter((t) => t.status !== 'done' && t.due_at)
    const overdue = open.filter((t) => toDate(t.due_at!) < startOfDay(when))
    const due = open.filter((t) => isSameDay(toDate(t.due_at!), when))
    const todays = events.filter((e) => isSameDay(toDate(e.starts_at), when))
    const counts = [
      overdue.length && `${overdue.length} overdue`,
      due.length && `${due.length} due`,
      todays.length && plural(todays.length, 'event'),
    ].filter(Boolean)
    const lines = [
      ...[
        ...todays.map((e) => ({ at: e.all_day ? 0 : toDate(e.starts_at).getTime(), text: `${e.all_day ? 'All day' : format(toDate(e.starts_at), 'HH:mm')} ${e.title}` })),
        ...due.map((t) => ({ at: toDate(t.due_at!).getTime(), text: `${format(toDate(t.due_at!), 'HH:mm')} ${t.title}` })),
      ]
        .sort((a, b) => a.at - b.at)
        .map((l) => l.text),
      ...overdue.map((t) => `Overdue: ${t.title}`),
    ]
    const title = counts.length ? `Today: ${counts.join(', ')}` : 'Today: nothing due'
    const body = lines.length
      ? lines.slice(0, 4).join('\n') + (lines.length > 4 ? `\nand ${lines.length - 4} more` : '')
      : 'Nothing overdue, nothing due and no events.'
    list.push({
      id: `summary:morning:${format(when, "yyyy-MM-dd'T'HH:mm")}:${fingerprint(title + body)}`,
      kind: 'summary',
      taskId: null,
      title,
      body,
      at: when.getTime(),
      path: '/',
    })
  }

  if (settings.weekly_enabled) {
    let day = startOfDay(now)
    while (getISODay(day) !== settings.weekly_day) day = addDays(day, 1)
    let when = atTime(day, settings.weekly_time)
    if (when <= now) when = atTime(addDays(day, 7), settings.weekly_time)
    const weekStart = startOfWeek(when, { weekStartsOn: WEEK_STARTS_ON })
    const weekEnd = addDays(weekStart, 7)
    const inWeek = (iso: string | null, from: Date, to: Date) => !!iso && toDate(iso) >= from && toDate(iso) < to
    const finished = tasks.filter((t) => inWeek(t.completed_at, weekStart, weekEnd)).length
    const slipped = tasks.filter(
      (t) =>
        inWeek(t.due_at, weekStart, weekEnd) &&
        toDate(t.due_at!) < when &&
        (t.status !== 'done' || (t.completed_at !== null && t.completed_at > t.due_at!)),
    ).length
    const next = nextMonday(when)
    const nextEnd = addDays(next, 7)
    const deadlines = tasks.filter((t) => t.status !== 'done' && inWeek(t.due_at, next, nextEnd)).length
    const coming = events.filter((e) => inWeek(e.starts_at, next, nextEnd)).length
    const title = `Your week: ${finished} finished, ${slipped} slipped`
    const body = `Next week: ${plural(deadlines, 'deadline')} and ${plural(coming, 'event')}. Open the review for the details.`
    list.push({
      id: `summary:weekly:${format(when, "yyyy-MM-dd'T'HH:mm")}:${fingerprint(title + body)}`,
      kind: 'summary',
      taskId: null,
      title,
      body,
      at: when.getTime(),
      path: '/review',
    })
  }

  return list
}
