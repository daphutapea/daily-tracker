import { addDays, format, startOfDay } from 'date-fns'
import { useSyncExternalStore } from 'react'
import type { ScheduleEntry } from '../../supabase/functions/tracky/logic.ts'
import { toDate } from './dates'
import { PRIORITY_RANK, type CalEvent, type Project, type TaskSummary } from './types'

const MAX_ENTRIES = 80

/** The saved row behind a schedule entry's ref, so a change Tracky proposes can be applied to it. */
export type ScheduleSource = { kind: 'task'; row: TaskSummary } | { kind: 'event'; row: CalEvent }

/**
 * What Tracky sees of your saved schedule, so it can advise on priorities and clashes and propose
 * changes: open tasks due from 30 days ago to two weeks ahead, open tasks without a deadline that are
 * in progress, waiting, urgent or high, and events in the next two weeks. Titles, times, status,
 * priority and project only; never notes, links or anything finished. Each entry gets a short ref
 * ("T3", "E2") for this request; `sources` maps it back to the row, so no row ids leave the device.
 */
export function scheduleForTracky(
  tasks: TaskSummary[],
  events: CalEvent[],
  projects: Project[],
  now: Date,
): { entries: ScheduleEntry[]; sources: Map<string, ScheduleSource> } {
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

  const taskEntry = (t: TaskSummary) => ({
    entry: {
      kind: 'task' as const,
      title: t.title,
      at: t.due_at ? local(t.due_at) : null,
      status: t.status,
      priority: t.priority,
      project: projectName(t.project_id),
    },
    source: { kind: 'task' as const, row: t },
  })

  // Deadlines and events in time order, nearest first, then undated tasks; past the cap, the
  // furthest-out entries are the ones left out.
  const timed = [
    ...dated.map(taskEntry),
    ...upcoming.map((e) => ({
      entry: {
        kind: 'event' as const,
        title: e.title,
        at: e.all_day ? null : local(e.starts_at),
        day: format(toDate(e.starts_at), 'yyyy-MM-dd'),
        end: e.ends_at && !e.all_day ? local(e.ends_at) : null,
      },
      source: { kind: 'event' as const, row: e },
    })),
  ]
  const when = (e: ScheduleEntry) => e.at ?? e.day ?? ''
  timed.sort((a, b) => when(a.entry).localeCompare(when(b.entry)))
  const kept = [...timed, ...undated.map(taskEntry)].slice(0, MAX_ENTRIES)

  const sources = new Map<string, ScheduleSource>()
  const count = { task: 0, event: 0 }
  const entries = kept.map(({ entry, source }) => {
    const ref = `${source.kind === 'task' ? 'T' : 'E'}${++count[source.kind]}`
    sources.set(ref, source)
    return { ref, ...entry } as ScheduleEntry
  })
  return { entries, sources }
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
