import { useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import type { ProposedChange } from '../../supabase/functions/tracky/logic.ts'
import { toDate } from './dates'
import { markNew } from './motion'
import { keys } from './queries'
import { must, supabase } from './supabase'
import type { ScheduleSource } from './trackySchedule'
import { priorityLabel, statusLabel, type CalEvent, type TaskSummary } from './types'

/**
 * A change Tracky proposed to a saved task or event, tied to the row by its id: the refs in Tracky's
 * answer ("T3") only hold for the request they came with.
 */
export interface PendingChange extends Omit<ProposedChange, 'ref'> {
  key: number
  id: string
}

/** The changes in Tracky's answer, tied to their rows. A ref the app didn't send is dropped. */
export function fromProposed(changes: ProposedChange[], sources: Map<string, ScheduleSource>, nextKey: () => number): PendingChange[] {
  return changes.flatMap(({ ref, ...c }) => {
    const source = sources.get(ref)
    return source && source.kind === c.kind ? [{ ...c, id: source.row.id, key: nextKey() }] : []
  })
}

/**
 * Pending changes as the next request refers to them. One whose row Tracky can't see any more stays
 * on screen but isn't sent.
 */
export function toProposed(changes: PendingChange[], sources: Map<string, ScheduleSource>): ProposedChange[] {
  const refOf = new Map([...sources].map(([ref, s]) => [s.row.id, ref]))
  return changes.flatMap(({ key: _key, id, ...c }) => {
    const ref = refOf.get(id)
    return ref ? [{ ...c, ref }] : []
  })
}

/**
 * New changes join the pending ones. A second update to the same row merges into the first (the
 * server already worked it out on top of it); finishing or deleting replaces an update, and an update
 * replaces them.
 */
export function mergeChanges(pending: PendingChange[], incoming: PendingChange[]): PendingChange[] {
  const merged = [...pending]
  for (const c of incoming) {
    const at = merged.findIndex((p) => p.id === c.id)
    if (at === -1) merged.push(c)
    else if (c.action === 'update' && merged[at].action === 'update') merged[at] = { ...merged[at], set: { ...merged[at].set, ...c.set } }
    else merged[at] = { ...c, key: merged[at].key }
  }
  return merged
}

/** "2026-10-23T17:00" or "2026-10-23" in the device's time zone. */
const local = (value: string) => new Date(value.length === 10 ? `${value}T00:00` : value)
const shift = (iso: string, ms: number) => new Date(toDate(iso).getTime() + ms).toISOString()
const before = (start: Date, minutes: number) => new Date(start.getTime() - minutes * 60_000).toISOString()

type TaskPatch = Partial<Pick<TaskSummary, 'title' | 'due_at' | 'remind_at' | 'priority' | 'status'>>
type EventPatch = Partial<Pick<CalEvent, 'title' | 'starts_at' | 'ends_at' | 'all_day' | 'remind_at' | 'location'>>

/** What a change writes to a task. A moved deadline takes its reminder along, keeping the gap, as in the app. */
export function taskPatch(row: TaskSummary, c: PendingChange): TaskPatch {
  if (c.action === 'done') return { status: 'done' }
  const s = c.set
  const patch: TaskPatch = {}
  if (s.title !== undefined) patch.title = s.title
  if (s.priority !== undefined) patch.priority = s.priority
  if (s.status !== undefined) patch.status = s.status
  const due = s.at !== undefined ? local(s.at) : row.due_at ? toDate(row.due_at) : null
  if (s.at !== undefined) patch.due_at = due!.toISOString()
  if (s.remind_minutes_before !== undefined) patch.remind_at = due ? before(due, s.remind_minutes_before) : null
  else if (s.at !== undefined && row.remind_at && row.due_at) {
    patch.remind_at = shift(row.remind_at, due!.getTime() - toDate(row.due_at).getTime())
  }
  return patch
}

/** What a change writes to an event. Its reminder moves with its start. */
export function eventPatch(row: CalEvent, c: PendingChange): EventPatch {
  const s = c.set
  const patch: EventPatch = {}
  if (s.title !== undefined) patch.title = s.title
  if (s.location !== undefined) patch.location = s.location
  const start = s.at !== undefined ? local(s.at) : s.day !== undefined ? local(s.day) : toDate(row.starts_at)
  const moved = start.getTime() - toDate(row.starts_at).getTime()
  if (s.at !== undefined || s.day !== undefined) patch.starts_at = start.toISOString()
  if (s.all_day !== undefined) patch.all_day = s.all_day
  if (s.end !== undefined) patch.ends_at = s.end ? local(s.end).toISOString() : null
  else if (s.day !== undefined && row.ends_at) patch.ends_at = shift(row.ends_at, moved)
  if (s.remind_minutes_before !== undefined) patch.remind_at = before(start, s.remind_minutes_before)
  else if (moved && row.remind_at) patch.remind_at = shift(row.remind_at, moved)
  return patch
}

const deadline = (iso: string | null | undefined) => (iso ? format(toDate(iso), 'EEE d MMM, HH:mm') : 'no deadline')

function eventWhen(e: Pick<CalEvent, 'starts_at' | 'ends_at' | 'all_day'>) {
  const start = toDate(e.starts_at)
  if (e.all_day) return `${format(start, 'EEE d MMM')}, all day`
  return `${format(start, 'EEE d MMM, HH:mm')}${e.ends_at ? ` to ${format(toDate(e.ends_at), 'HH:mm')}` : ''}`
}

function reminderWords(minutes: number) {
  if (minutes === 0) return 'at the time'
  if (minutes % 1440 === 0) return minutes === 1440 ? '1 day before' : `${minutes / 1440} days before`
  if (minutes % 60 === 0) return minutes === 60 ? '1 hour before' : `${minutes / 60} hours before`
  return `${minutes} min before`
}

/**
 * What a change does, in words, from the row as it is now: "Deadline Tue 20 Oct, 17:00 → Fri 23 Oct,
 * 17:00 · Priority High → Urgent". Empty when the row is gone.
 */
export function describeChange(c: PendingChange, source: ScheduleSource | undefined): string {
  if (c.action === 'done') return 'Mark done'
  if (c.action === 'delete') return c.kind === 'task' ? 'Delete this task' : 'Delete this event'
  if (!source) return ''
  const s = c.set
  const parts: string[] = []
  if (s.title !== undefined) parts.push(`Rename to “${s.title}”`)
  if (source.kind === 'task') {
    const row = source.row
    const patch = taskPatch(row, c)
    if (patch.due_at !== undefined) parts.push(`Deadline ${deadline(row.due_at)} → ${deadline(patch.due_at)}`)
    if (patch.priority !== undefined) parts.push(`Priority ${priorityLabel(row.priority)} → ${priorityLabel(patch.priority)}`)
    if (patch.status !== undefined) parts.push(`${statusLabel(row.status)} → ${statusLabel(patch.status)}`)
  } else {
    const row = source.row
    const patch = eventPatch(row, c)
    if (patch.starts_at !== undefined || patch.ends_at !== undefined || patch.all_day !== undefined) {
      parts.push(`${eventWhen(row)} → ${eventWhen({ ...row, ...patch })}`)
    }
    if (patch.location !== undefined) parts.push(`Where: ${patch.location}`)
  }
  if (s.remind_minutes_before !== undefined) parts.push(`Reminder ${reminderWords(s.remind_minutes_before)}`)
  return parts.join(' · ')
}

const list = (parts: string[]) =>
  parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`

const TIMING = ['at', 'day', 'end', 'all_day']
const FIELD_NAMES: Record<string, string> = {
  title: 'title',
  priority: 'priority',
  status: 'status',
  remind_minutes_before: 'reminder',
  location: 'place',
}

/**
 * What one change did, for the chat: "moved “Send the report” to Fri 23 Oct, 17:00 with a new
 * priority", "marked “Pay the invoice” done", "renamed “Call” to “Call Dennis”".
 */
function sentence(c: PendingChange, title: string, after: string | null) {
  if (c.action === 'done') return `marked “${title}” done`
  if (c.action === 'delete') return `deleted “${title}”`
  const others = Object.keys(c.set).filter((k) => !TIMING.includes(k)).map((k) => FIELD_NAMES[k])
  if (after) return others.length ? `moved “${title}” to ${after} with a new ${list(others)}` : `moved “${title}” to ${after}`
  if (others.length === 1 && c.set.title !== undefined) return `renamed “${title}” to “${c.set.title}”`
  return others.length ? `gave “${title}” a new ${list(others)}` : `changed “${title}”`
}

export interface Applied {
  /** What happened, as a sentence for the chat: "Moved “Send the report” to Fri 23 Oct, 17:00." */
  text: string
  count: number
  /** Puts every row back as it was: updates are reversed and deleted rows come back. */
  undo: () => Promise<void>
}

/**
 * Applies confirmed changes to the saved rows, one at a time, and keeps what each row was so Undo can
 * put it back. A row deleted or changed elsewhere since is left out and named in the result.
 */
export function useApplyChanges() {
  const qc = useQueryClient()
  const refresh = () => {
    qc.invalidateQueries({ queryKey: keys.tasks })
    qc.invalidateQueries({ queryKey: keys.events })
  }

  return async (changes: PendingChange[], tasks: TaskSummary[], events: CalEvent[]): Promise<Applied> => {
    const said: string[] = []
    const gone: string[] = []
    const undo: (() => Promise<unknown>)[] = []
    const touched: string[] = []

    for (const c of changes) {
      if (c.kind === 'task') {
        const row = tasks.find((t) => t.id === c.id)
        if (!row) {
          gone.push(c.title)
          continue
        }
        if (c.action === 'delete') {
          const full = must(await supabase.from('tasks').select('*').eq('id', c.id).maybeSingle())
          if (!full) {
            gone.push(row.title)
            continue
          }
          must(await supabase.from('tasks').delete().eq('id', c.id))
          undo.push(async () => must(await supabase.from('tasks').insert(full).select('id')))
          said.push(sentence(c, row.title, null))
          continue
        }
        const patch = taskPatch(row, c)
        const was = Object.fromEntries(Object.keys(patch).map((k) => [k, row[k as keyof TaskPatch]])) as TaskPatch
        if (!must(await supabase.from('tasks').update(patch).eq('id', c.id).select('id')).length) {
          gone.push(row.title)
          continue
        }
        undo.push(async () => must(await supabase.from('tasks').update(was).eq('id', c.id).select('id')))
        touched.push(c.id)
        said.push(sentence(c, row.title, patch.due_at ? deadline(patch.due_at) : null))
      } else {
        const row = events.find((e) => e.id === c.id)
        if (!row) {
          gone.push(c.title)
          continue
        }
        if (c.action === 'delete') {
          must(await supabase.from('events').delete().eq('id', c.id))
          undo.push(async () => must(await supabase.from('events').insert(row).select('id')))
          said.push(sentence(c, row.title, null))
          continue
        }
        const patch = eventPatch(row, c)
        const was = Object.fromEntries(Object.keys(patch).map((k) => [k, row[k as keyof EventPatch]])) as EventPatch
        if (!must(await supabase.from('events').update(patch).eq('id', c.id).select('id')).length) {
          gone.push(row.title)
          continue
        }
        undo.push(async () => must(await supabase.from('events').update(was).eq('id', c.id).select('id')))
        touched.push(c.id)
        const timed = TIMING.some((k) => k in c.set)
        said.push(sentence(c, row.title, timed ? eventWhen({ ...row, ...patch }) : null))
      }
    }

    markNew(touched)
    refresh()
    const first = list(said)
    const text = [
      first && `${first.charAt(0).toUpperCase()}${first.slice(1)}.`,
      gone.length > 0 && `${list(gone.map((t) => `“${t}”`))} ${gone.length === 1 ? 'isn’t' : 'aren’t'} saved any more, so I left ${gone.length === 1 ? 'it' : 'them'} alone.`,
    ]
      .filter(Boolean)
      .join(' ')
    return {
      text,
      count: said.length,
      undo: async () => {
        // Last change first, so two changes to related rows unwind in order.
        for (const step of undo.reverse()) await step()
        markNew(touched)
        refresh()
      },
    }
  }
}
