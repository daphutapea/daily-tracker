import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.localdb', import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => line.startsWith('VITE_'))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]),
)
const API = env.VITE_SUPABASE_URL
const KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!API?.startsWith('http://127.0.0.1')) throw new Error(`Browser tests only run against the local stack, not ${API}`)

/** Every row a test creates starts with this, so cleanup can't touch anything else. */
export const PREFIX = 'e2e '

/** A date in Jakarta, `offset` days from today, as YYYY-MM-DD. */
export function jakartaDay(offset = 0) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(Date.now() + offset * 86_400_000))
}

/** An instant at a Jakarta wall-clock time. */
export const jakarta = (day: string, time: string) => `${day}T${time}:00+07:00`

export interface TaskRow {
  id: string
  title: string
  status: string
  priority: string
  due_at: string | null
  remind_at: string | null
}

/**
 * Reads and writes rows as the signed-in owner, with the session the page holds, so the database's
 * access rules apply to test data exactly as they do to the app.
 */
export async function asOwner(page: Page) {
  const token = await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('sb-') && k.endsWith('-auth-token')) return JSON.parse(localStorage.getItem(k)!).access_token as string
    }
    return null
  })
  if (!token) throw new Error('Not signed in')

  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...init.headers,
      },
    })
    if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${res.status} ${await res.text()}`)
    return (res.status === 204 ? null : await res.json()) as T
  }

  return {
    addTask: async (row: Partial<TaskRow> & { title: string }) =>
      (await call<TaskRow[]>('tasks', { method: 'POST', body: JSON.stringify(row) }))[0],
    task: async (id: string) => (await call<TaskRow[]>(`tasks?id=eq.${id}`))[0],
    tasksTitled: (title: string) => call<TaskRow[]>(`tasks?title=eq.${encodeURIComponent(title)}`),
    eventsTitled: (title: string) =>
      call<{ id: string; title: string; starts_at: string; ends_at: string | null; remind_at: string | null; location: string | null }[]>(
        `events?title=eq.${encodeURIComponent(title)}`,
      ),
    tasksTitledFull: (title: string) =>
      call<(TaskRow & { repeat: string | null; repeat_next: string | null })[]>(`tasks?title=eq.${encodeURIComponent(title)}&order=due_at`),
    seriesEvents: (title: string) =>
      call<{ id: string; starts_at: string; series_id: string | null }[]>(`events?title=eq.${encodeURIComponent(title)}&order=starts_at`),
    series: (id: string) => call<{ id: string; repeat: string; ends_before: string | null }[]>(`event_series?id=eq.${id}`),
    /** Removes every task and event a test made. */
    cleanUp: async () => {
      const like = encodeURIComponent(`${PREFIX}*`)
      const series = (await call<{ series_id: string | null }[]>(`events?title=like.${like}&select=series_id`))
        .map((e) => e.series_id)
        .filter(Boolean)
      await call(`tasks?title=like.${like}`, { method: 'DELETE' })
      await call(`events?title=like.${like}`, { method: 'DELETE' })
      if (series.length) await call(`event_series?id=in.(${[...new Set(series)].join(',')})`, { method: 'DELETE' })
    },
  }
}
