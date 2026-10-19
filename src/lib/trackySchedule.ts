import { addDays, format, startOfDay } from 'date-fns'
import { useSyncExternalStore } from 'react'
import type { ScheduleEntry } from '../../supabase/functions/quick-add/logic.ts'
import { toDate } from './dates'
import { PRIORITY_RANK, type CalEvent, type Project, type TaskSummary } from './types'

const MAX_ENTRIES = 80

/**
 * What Tracky sees of your saved schedule, so it can advise on priorities and clashes: open tasks
 * due from 30 days ago to two weeks ahead, open tasks without a deadline that are in progress,
 * waiting, urgent or high, and events in the next two weeks. Titles, times, status, priority and
 * project only; never notes, links or anything finished.
 */
export function scheduleForTracky(
  tasks: TaskSummary[],
  events: CalEvent[],
  projects: Project[],
  now: Date,
): ScheduleEntry[] {
  const today = startOfDay(now)
  const from = addDays(today, -30)
  const until = addDays(today, 15)
  const local = (iso: string) => format(toDate(iso), "yyyy-MM-dd'T'HH:mm")
  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name ?? null
  const inWindow = (iso: string) => {
    const d = toDate(iso)
    return d >= from && d < until
  }

  const dated = tasks.filter((t) => t.status !== 'done' && t.due_at && inWindow(t.due_at))
  const undated = tasks
    .filter((t) => t.status !== 'done' && !t.due_at && (t.status !== 'todo' || PRIORITY_RANK[t.priority] <= PRIORITY_RANK.high))
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
  const upcoming = events.filter((e) => toDate(e.starts_at) >= today && toDate(e.starts_at) < until)

  // Deadlines and events in time order, nearest first, then undated tasks; past the cap, the
  // furthest-out entries are the ones left out.
  const timed: ScheduleEntry[] = [
    ...dated.map((t) => ({
      kind: 'task' as const,
      title: t.title,
      at: local(t.due_at!),
      status: t.status,
      priority: t.priority,
      project: projectName(t.project_id),
    })),
    ...upcoming.map((e) => ({
      kind: 'event' as const,
      title: e.title,
      at: e.all_day ? null : local(e.starts_at),
      day: format(toDate(e.starts_at), 'yyyy-MM-dd'),
      end: e.ends_at && !e.all_day ? local(e.ends_at) : null,
    })),
  ]
  timed.sort((a, b) => (a.at ?? a.day ?? '').localeCompare(b.at ?? b.day ?? ''))
  const entries: ScheduleEntry[] = [
    ...timed,
    ...undated.map((t) => ({
      kind: 'task' as const,
      title: t.title,
      at: null,
      status: t.status,
      priority: t.priority,
      project: projectName(t.project_id),
    })),
  ]
  return entries.slice(0, MAX_ENTRIES)
}

// Whether Tracky gets the schedule at all. On unless turned off in Settings → Tracky, per device.
const KEY = 'dt-tracky-schedule'
const listeners = new Set<() => void>()
let sees = (() => {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
})()

export const useTrackySeesSchedule = () =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => sees,
  )

export function setTrackySeesSchedule(on: boolean) {
  sees = on
  try {
    if (on) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, 'off')
  } catch {
    // Private mode: the choice holds for this visit only.
  }
  listeners.forEach((l) => l())
}
