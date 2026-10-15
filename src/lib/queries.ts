import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { TablesInsert, TablesUpdate } from './database.types'
import { must, supabase } from './supabase'
import type {
  CalEvent,
  Note,
  NoteSummary,
  Profile,
  Project,
  QuickLink,
  Task,
  TaskStatus,
  TaskSummary,
  TelegramStatus,
} from './types'

const TASK_SUMMARY_COLUMNS =
  'id,title,status,priority,due_at,remind_at,show_on_calendar,links,project_id,completed_at,created_at,updated_at,notes_text'
const NOTE_SUMMARY_COLUMNS = 'id,title,content_text,pinned,project_id,created_at,updated_at'

/**
 * Wraps an async event handler. A failed mutation stops the handler (so no "saved" toast or close
 * runs) and is already shown as an error toast; anything else is rethrown so real bugs still surface.
 */
export function quietly<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  return (...args: A) => {
    fn(...args).catch((e: unknown) => {
      if (!(e as { handled?: boolean } | null)?.handled) throw e
    })
  }
}

export const keys = {
  tasks: ['tasks'] as const,
  task: (id: string) => ['task', id] as const,
  events: ['events'] as const,
  notes: ['notes'] as const,
  note: (id: string) => ['note', id] as const,
  projects: ['projects'] as const,
  links: ['links'] as const,
  profile: ['profile'] as const,
  telegram: ['telegram'] as const,
}

// ---------------------------------------------------------------- tasks

// Tasks and events also refresh every minute, so edits from your phone show up on an open laptop
// (and their in-app reminders fire) without a reload.
export function useTasks() {
  return useQuery({
    queryKey: keys.tasks,
    refetchInterval: 60_000,
    queryFn: async () =>
      must(
        await supabase
          .from('tasks')
          .select(TASK_SUMMARY_COLUMNS)
          .order('due_at', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: false }),
      ) as unknown as TaskSummary[],
  })
}

export function useTask(id: string | null) {
  return useQuery({
    queryKey: keys.task(id ?? 'none'),
    enabled: !!id,
    queryFn: async () => must(await supabase.from('tasks').select('*').eq('id', id!).single()) as unknown as Task,
  })
}

export type TaskInput = Omit<TablesInsert<'tasks'>, 'user_id' | 'reminded_at' | 'completed_at'>

export function useSaveTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: TaskInput & { id?: string }) => {
      if (id) {
        return must(await supabase.from('tasks').update(input).eq('id', id).select('id').single()).id
      }
      return must(await supabase.from('tasks').insert(input).select('id').single()).id
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: keys.tasks })
      qc.invalidateQueries({ queryKey: keys.task(id) })
    },
  })
}

/** Status changes from checkboxes and the board apply instantly and roll back on failure. */
export function useSetTaskStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
      must(await supabase.from('tasks').update({ status }).eq('id', id).select('id').single())
    },
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: keys.tasks })
      const previous = qc.getQueryData<TaskSummary[]>(keys.tasks)
      qc.setQueryData<TaskSummary[]>(keys.tasks, (old) =>
        old?.map((t) =>
          t.id === id
            ? { ...t, status, completed_at: status === 'done' ? (t.completed_at ?? new Date().toISOString()) : null }
            : t,
        ),
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(keys.tasks, ctx.previous)
    },
    onSettled: (_data, _err, { id }) => {
      qc.invalidateQueries({ queryKey: keys.tasks })
      qc.invalidateQueries({ queryKey: keys.task(id) })
    },
  })
}

export interface TaskTiming {
  id: string
  due_at: string | null
  remind_at: string | null
}

/**
 * Moves several deadlines, and their reminders, in one go. Lists update at once and roll back if a
 * save fails. Changing remind_at makes the server send that reminder again.
 */
export function useRescheduleTasks() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (changes: TaskTiming[]) => {
      await Promise.all(
        changes.map(async ({ id, due_at, remind_at }) =>
          must(await supabase.from('tasks').update({ due_at, remind_at }).eq('id', id).select('id').single()),
        ),
      )
    },
    onMutate: async (changes) => {
      await qc.cancelQueries({ queryKey: keys.tasks })
      const previous = qc.getQueryData<TaskSummary[]>(keys.tasks)
      const byId = new Map(changes.map((c) => [c.id, c]))
      qc.setQueryData<TaskSummary[]>(keys.tasks, (old) =>
        old?.map((t) => {
          const c = byId.get(t.id)
          return c ? { ...t, due_at: c.due_at, remind_at: c.remind_at } : t
        }),
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(keys.tasks, ctx.previous)
    },
    onSettled: (_data, _err, changes) => {
      qc.invalidateQueries({ queryKey: keys.tasks })
      changes.forEach((c) => qc.invalidateQueries({ queryKey: keys.task(c.id) }))
    },
  })
}

/** Puts a deleted task, event or note back exactly as it was, with the same id and dates, for Undo. */
export function useRestoreRow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ table, row }: { table: 'tasks' | 'events' | 'notes'; row: object }) => {
      must(await supabase.from(table).insert(row as never).select('id').single())
    },
    // The list caches are keyed by table name: keys.tasks, keys.events, keys.notes.
    onSuccess: (_data, { table }) => qc.invalidateQueries({ queryKey: [table] }),
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      must(await supabase.from('tasks').delete().eq('id', id))
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.tasks }),
  })
}

// ---------------------------------------------------------------- events

export function useEvents() {
  return useQuery({
    queryKey: keys.events,
    refetchInterval: 60_000,
    queryFn: async () =>
      must(await supabase.from('events').select('*').order('starts_at', { ascending: true })) as CalEvent[],
  })
}

export type EventInput = Omit<TablesInsert<'events'>, 'user_id' | 'reminded_at'>

export function useSaveEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: EventInput & { id?: string }) => {
      if (id) return must(await supabase.from('events').update(input).eq('id', id).select('id').single()).id
      return must(await supabase.from('events').insert(input).select('id').single()).id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.events }),
  })
}

export function useDeleteEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      must(await supabase.from('events').delete().eq('id', id))
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.events }),
  })
}

// ---------------------------------------------------------------- notes

export function useNotes() {
  return useQuery({
    queryKey: keys.notes,
    queryFn: async () =>
      must(
        await supabase
          .from('notes')
          .select(NOTE_SUMMARY_COLUMNS)
          .order('pinned', { ascending: false })
          .order('updated_at', { ascending: false }),
      ) as NoteSummary[],
  })
}

export function useNote(id: string | null) {
  return useQuery({
    queryKey: keys.note(id ?? 'none'),
    enabled: !!id,
    queryFn: async () => must(await supabase.from('notes').select('*').eq('id', id!).single()) as unknown as Note,
  })
}

export function useCreateNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: Omit<TablesInsert<'notes'>, 'user_id'> = {}) =>
      must(await supabase.from('notes').insert(input).select('id').single()).id,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.notes }),
  })
}

export function useUpdateNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: TablesUpdate<'notes'> & { id: string }) => {
      must(await supabase.from('notes').update(patch).eq('id', id).select('id').single())
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.notes }),
  })
}

export function useDeleteNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      must(await supabase.from('notes').delete().eq('id', id))
    },
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: keys.note(id) })
      qc.invalidateQueries({ queryKey: keys.notes })
    },
  })
}

// ---------------------------------------------------------------- projects

export function useProjects() {
  return useQuery({
    queryKey: keys.projects,
    queryFn: async () =>
      must(await supabase.from('projects').select('*').order('archived').order('name')) as Project[],
  })
}

export function useSaveProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: { id?: string; name?: string; archived?: boolean }) => {
      if (id) must(await supabase.from('projects').update(input).eq('id', id).select('id').single())
      else must(await supabase.from('projects').insert({ name: input.name! }).select('id').single())
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.projects }),
  })
}

export function useDeleteProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      must(await supabase.from('projects').delete().eq('id', id))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.projects })
      qc.invalidateQueries({ queryKey: keys.tasks })
      qc.invalidateQueries({ queryKey: keys.notes })
    },
  })
}

// ---------------------------------------------------------------- quick links

export function useQuickLinks() {
  return useQuery({
    queryKey: keys.links,
    queryFn: async () =>
      must(await supabase.from('quick_links').select('*').order('position').order('created_at')) as QuickLink[],
  })
}

export function useSaveQuickLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: { id?: string; label: string; url: string; position?: number }) => {
      if (id) must(await supabase.from('quick_links').update(input).eq('id', id).select('id').single())
      else must(await supabase.from('quick_links').insert(input).select('id').single())
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.links }),
  })
}

export function useReorderQuickLinks() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ordered: QuickLink[]) => {
      await Promise.all(
        ordered.map(async (l, position) =>
          must(await supabase.from('quick_links').update({ position }).eq('id', l.id).select('id').single()),
        ),
      )
    },
    onMutate: async (ordered) => {
      await qc.cancelQueries({ queryKey: keys.links })
      const previous = qc.getQueryData<QuickLink[]>(keys.links)
      qc.setQueryData(keys.links, ordered.map((l, position) => ({ ...l, position })))
      return { previous }
    },
    onError: (_e, _v, ctx) => ctx?.previous && qc.setQueryData(keys.links, ctx.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.links }),
  })
}

export function useDeleteQuickLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      must(await supabase.from('quick_links').delete().eq('id', id))
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.links }),
  })
}

// ---------------------------------------------------------------- profile & telegram

export function useProfile() {
  return useQuery({
    queryKey: keys.profile,
    queryFn: async () => must(await supabase.from('profiles').select('*').single()) as Profile,
  })
}

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (
      patch: Pick<
        TablesUpdate<'profiles'>,
        'display_name' | 'timezone' | 'digest_enabled' | 'digest_time' | 'weekly_enabled' | 'weekly_day' | 'weekly_time'
      >,
    ) => {
      const { data: auth } = await supabase.auth.getUser()
      must(await supabase.from('profiles').update(patch).eq('id', auth.user!.id).select('id').single())
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.profile }),
  })
}

/** Telegram has answered a token check: no token, a bot name, or an error. */
export const telegramSettled = (s: TelegramStatus | undefined) =>
  !!s && (!s.bot_configured || !!s.bot_username || !!s.bot_error)

/** With `poll`, checks every 1.5 seconds until Telegram has answered the token check, then stops. */
export function useTelegramStatus(poll = false) {
  return useQuery({
    queryKey: keys.telegram,
    queryFn: async () => must(await supabase.rpc('telegram_status')) as unknown as TelegramStatus,
    refetchInterval: (query) => (poll && !telegramSettled(query.state.data) ? 1500 : false),
  })
}

export function useTelegramAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: A) => fn(...args),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.telegram })
      qc.invalidateQueries({ queryKey: keys.profile })
    },
  })
}

export const telegram = {
  setToken: async (token: string) => must(await supabase.rpc('telegram_set_token', { p_token: token })),
  linkCode: async () => must(await supabase.rpc('telegram_link_code')) as string,
  poll: async () => must(await supabase.rpc('telegram_link_poll')) as 'pending' | 'linked' | 'not_found',
  sendTest: async () => must(await supabase.rpc('telegram_send_test')),
  unlink: async () => must(await supabase.rpc('telegram_unlink')),
}
