import { format } from 'date-fns'
import { must, supabase } from './supabase'
import type { Tables } from './database.types'

/**
 * A copy of everything you've added, as one JSON file: what Settings → Your data downloads and what
 * the Mac app saves to iCloud Drive every week. Restoring one adds back what's missing.
 */
export interface Backup {
  app: 'Daily Tracker'
  version: string
  exported_at: string
  tasks: Tables<'tasks'>[]
  events: Tables<'events'>[]
  notes: Tables<'notes'>[]
  projects: Tables<'projects'>[]
  quick_links: Tables<'quick_links'>[]
  /** The rules of repeating events (v1.11 on; older backups have none). */
  event_series: Tables<'event_series'>[]
  /** Preferences only: nothing that identifies the account beyond the display name. */
  settings: Partial<Tables<'profiles'>>
}

export const backupFilename = (at = new Date()) => `daily-tracker-${format(at, 'yyyy-MM-dd')}.json`

export async function makeBackup(): Promise<Backup> {
  const [tasks, events, notes, projects, quickLinks, series, settings] = await Promise.all([
    supabase.from('tasks').select('*').order('created_at'),
    supabase.from('events').select('*').order('starts_at'),
    supabase.from('notes').select('*').order('created_at'),
    supabase.from('projects').select('*').order('created_at'),
    supabase.from('quick_links').select('*').order('position'),
    supabase.from('event_series').select('*').order('created_at'),
    supabase
      .from('profiles')
      .select('display_name,timezone,digest_enabled,digest_time,weekly_enabled,weekly_day,weekly_time,created_at')
      .single(),
  ])
  return {
    app: 'Daily Tracker',
    version: __APP_VERSION__,
    exported_at: new Date().toISOString(),
    tasks: must(tasks),
    events: must(events),
    notes: must(notes),
    projects: must(projects),
    quick_links: must(quickLinks),
    event_series: must(series),
    settings: must(settings),
  }
}

/** Restored in this order, so what a row points at is already there. */
const TABLES = ['projects', 'event_series', 'tasks', 'notes', 'events', 'quick_links'] as const
type Table = (typeof TABLES)[number]
/** What a backup must have; event_series came later. And what the counts you see are made of. */
const REQUIRED = ['projects', 'tasks', 'notes', 'events', 'quick_links'] as const
type Counted = (typeof REQUIRED)[number]
type Row = { id: string } & Record<string, unknown>

const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)
const text = (v: unknown) => typeof v === 'string' && v.trim() !== ''

/** What a row needs before it's worth sending back; the database checks the rest. */
const looksRight: Record<Table, (r: Row) => boolean> = {
  projects: (r) => text(r.name),
  event_series: (r) => text(r.repeat) && typeof r.anchor === 'string' && typeof r.written_until === 'string',
  tasks: (r) => text(r.title),
  notes: () => true,
  events: (r) => text(r.title) && typeof r.starts_at === 'string',
  quick_links: (r) => text(r.label) && typeof r.url === 'string',
}

export interface CheckedBackup {
  exportedAt: Date | null
  rows: Record<Table, Row[]>
  /** Rows the file holds that couldn't be read, so they're left out. */
  unreadable: number
}

/** Reads a backup file, or says in plain words why it can't. */
export function readBackup(raw: string): CheckedBackup {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error('That file isn’t a Daily Tracker backup: it isn’t JSON.')
  }
  const d = (data ?? {}) as Record<string, unknown>
  if (!REQUIRED.every((t) => Array.isArray(d[t]))) {
    throw new Error('That file isn’t a Daily Tracker backup. Pick one made by Download a copy or the weekly backup.')
  }
  let unreadable = 0
  const rows = Object.fromEntries(
    TABLES.map((t) => {
      const kept = ((d[t] ?? []) as unknown[]).filter((r): r is Row => {
        const ok = !!r && typeof r === 'object' && isId((r as Row).id) && looksRight[t](r as Row)
        if (!ok) unreadable++
        return ok
      })
      return [t, kept]
    }),
  ) as Record<Table, Row[]>
  const at = typeof d.exported_at === 'string' ? new Date(d.exported_at) : null
  return { exportedAt: at && !Number.isNaN(at.getTime()) ? at : null, rows, unreadable }
}

export type Counts = Record<Counted, number>

export const totalOf = (c: Counts) => REQUIRED.reduce((n, t) => n + c[t], 0)

/** "12 tasks, 3 events and 1 note", leaving out what there's none of. */
export function countsInWords(c: Counts): string {
  const words: Record<Counted, [string, string]> = {
    tasks: ['task', 'tasks'],
    events: ['event', 'events'],
    notes: ['note', 'notes'],
    projects: ['project', 'projects'],
    quick_links: ['quick link', 'quick links'],
  }
  const parts = (['tasks', 'events', 'notes', 'projects', 'quick_links'] as const)
    .filter((t) => c[t] > 0)
    .map((t) => `${c[t]} ${words[t][c[t] === 1 ? 0 : 1]}`)
  return parts.length < 2 ? (parts[0] ?? 'nothing') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}

/** How many rows of each kind are in the backup but not in the tracker now: what a restore adds. */
export async function missingFrom(backup: CheckedBackup): Promise<{ missing: Record<Table, Row[]>; counts: Counts }> {
  const present = await Promise.all(TABLES.map(async (t) => new Set(must(await supabase.from(t).select('id')).map((r) => r.id))))
  const missing = Object.fromEntries(TABLES.map((t, i) => [t, backup.rows[t].filter((r) => !present[i].has(r.id))])) as Record<Table, Row[]>
  const counts = Object.fromEntries(REQUIRED.map((t) => [t, missing[t].length])) as Counts
  // A task or note whose project is in neither place keeps no project rather than failing; an event
  // whose series is gone stops repeating.
  const projectIds = new Set([...present[TABLES.indexOf('projects')], ...missing.projects.map((p) => p.id)])
  for (const t of ['tasks', 'notes'] as const) {
    missing[t] = missing[t].map((r) => (r.project_id && !projectIds.has(r.project_id as string) ? { ...r, project_id: null } : r))
  }
  const seriesIds = new Set([...present[TABLES.indexOf('event_series')], ...missing.event_series.map((s) => s.id)])
  missing.events = missing.events.map((r) => (r.series_id && !seriesIds.has(r.series_id as string) ? { ...r, series_id: null } : r))
  return { missing, counts }
}

/**
 * Adds back the rows a backup has and the tracker doesn't, projects first so tasks and notes can point
 * at them. Nothing already there is changed or removed, and settings stay as they are.
 */
export async function restoreMissing(missing: Record<Table, Row[]>) {
  for (const t of TABLES) {
    // The account a row belongs to is always the one signed in now.
    const rows = missing[t].map(({ user_id: _user, ...r }) => r)
    for (let i = 0; i < rows.length; i += 200) {
      must(await supabase.from(t).insert(rows.slice(i, i + 200) as never).select('id'))
    }
  }
  // Inserting a finished task stamps it as finished now. Setting the time again on the saved row keeps
  // when it really was, so the weekly review and the chart on Home count it on the right day. (An
  // upsert wouldn't: its insert step stamps the time before the update step runs.)
  const done = missing.tasks.filter((r) => r.status === 'done' && typeof r.completed_at === 'string')
  for (let i = 0; i < done.length; i += 20) {
    await Promise.all(
      done
        .slice(i, i + 20)
        .map(async (r) => must(await supabase.from('tasks').update({ completed_at: r.completed_at as string }).eq('id', r.id).select('id'))),
    )
  }
}
