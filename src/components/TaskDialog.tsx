import { PlusIcon, TrashIcon, XIcon } from '@phosphor-icons/react'
import type { JSONContent } from '@tiptap/react'
import { format, set, subDays, subHours, subMinutes } from 'date-fns'
import type { Json } from '@/lib/database.types'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { fromLocalInput, toDate, toLocalInput } from '@/lib/dates'
import { useDialogs } from '@/lib/dialogs'
import { quietly, useDeleteTask, useProjects, useSaveTask, useTask } from '@/lib/queries'
import { useOfferUndo } from '@/lib/undo'
import { useNow } from '@/lib/useNow'
import { PRIORITIES, STATUSES, type Task, type TaskLink, type TaskPriority, type TaskStatus } from '@/lib/types'
import { Dialog } from './Dialog'
import { ReminderHint } from './ReminderHint'
import { RichEditor } from './LazyRichEditor'
import { Loading, QueryError } from './ui'

/** Mounted once in the app shell; opens whenever the URL carries ?task=. */
export function TaskDialogHost() {
  const { taskId, due, close } = useDialogs()
  const [shown, setShown] = useState<{ id: string; due: string | null } | null>(null)
  const dirtyRef = useRef(false)

  // Keep the last task rendered while the dialog animates closed. Adjusting state during render
  // (rather than in an effect) avoids rendering the old task once more first.
  if (taskId && (shown?.id !== taskId || shown.due !== due)) setShown({ id: taskId, due })

  const requestClose = () => {
    if (dirtyRef.current && !window.confirm('Discard your changes to this task?')) return
    dirtyRef.current = false
    close()
  }

  const isNew = shown?.id === 'new'
  return (
    <Dialog open={!!taskId} onRequestClose={requestClose} title={isNew ? 'New task' : 'Edit task'}>
      {shown &&
        (isNew ? (
          <TaskForm key={`new-${shown.due}`} task={null} defaultDue={shown.due} dirtyRef={dirtyRef} onDone={close} />
        ) : (
          <ExistingTask key={shown.id} id={shown.id} dirtyRef={dirtyRef} onDone={close} />
        ))}
    </Dialog>
  )
}

function ExistingTask({ id, dirtyRef, onDone }: { id: string; dirtyRef: React.RefObject<boolean>; onDone: () => void }) {
  const q = useTask(id)
  if (q.isPending) return <Loading what="task" />
  if (q.isError) return <QueryError what="this task" error={q.error} retry={() => q.refetch()} />
  return <TaskForm task={q.data} defaultDue={null} dirtyRef={dirtyRef} onDone={onDone} />
}

interface FormState {
  title: string
  status: TaskStatus
  priority: TaskPriority
  projectId: string
  due: string
  remind: string
  showOnCalendar: boolean
  links: TaskLink[]
  notes: JSONContent | null
  notesText: string
}

const REMIND_PRESETS: { label: string; from: (due: Date) => Date }[] = [
  { label: 'At deadline', from: (d) => d },
  { label: '15 min before', from: (d) => subMinutes(d, 15) },
  { label: '1 hour before', from: (d) => subHours(d, 1) },
  { label: '1 day before', from: (d) => subDays(d, 1) },
]

function initialState(task: Task | null, defaultDue: string | null): FormState {
  const due = task?.due_at
    ? toLocalInput(task.due_at)
    : defaultDue
      ? format(set(new Date(`${defaultDue}T00:00`), { hours: 17 }), "yyyy-MM-dd'T'HH:mm")
      : ''
  return {
    title: task?.title ?? '',
    status: task?.status ?? 'todo',
    priority: task?.priority ?? 'medium',
    projectId: task?.project_id ?? '',
    due,
    remind: toLocalInput(task?.remind_at),
    showOnCalendar: task?.show_on_calendar ?? true,
    links: task?.links ?? [],
    notes: task?.notes ?? null,
    notesText: task?.notes_text ?? '',
  }
}

function normalizeUrl(raw: string) {
  const v = raw.trim()
  if (!v) return ''
  return /^https?:\/\//i.test(v) ? v : `https://${v}`
}

function TaskForm({
  task,
  defaultDue,
  dirtyRef,
  onDone,
}: {
  task: Task | null
  defaultDue: string | null
  dirtyRef: React.RefObject<boolean>
  onDone: () => void
}) {
  const initial = useMemo(() => initialState(task, defaultDue), [task, defaultDue])
  const [f, setF] = useState<FormState>(initial)
  const [error, setError] = useState<string | null>(null)
  const save = useSaveTask()
  const del = useDeleteTask()
  const offerUndo = useOfferUndo()
  const projects = useProjects()
  const formRef = useRef<HTMLFormElement>(null)

  const dirty = JSON.stringify(f) !== JSON.stringify(initial)
  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty, dirtyRef])

  const up = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }))
  const dueDate = f.due ? new Date(f.due) : null
  const remindDate = f.remind ? new Date(f.remind) : null
  const now = useNow(30_000)
  const remindInPast = remindDate && remindDate.getTime() < now.getTime() - 60_000

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    const title = f.title.trim()
    if (!title) {
      setError('Give the task a title.')
      return
    }
    const links = f.links
      .map((l) => ({ label: l.label.trim(), url: normalizeUrl(l.url) }))
      .filter((l) => l.url)
    const bad = links.find((l) => {
      try {
        new URL(l.url)
        return false
      } catch {
        return true
      }
    })
    if (bad) {
      setError(`“${bad.url}” isn’t a valid link.`)
      return
    }
    setError(null)
    await save.mutateAsync({
      id: task?.id,
      title,
      status: f.status,
      priority: f.priority,
      project_id: f.projectId || null,
      due_at: fromLocalInput(f.due),
      remind_at: fromLocalInput(f.remind),
      show_on_calendar: f.showOnCalendar,
      links: links as unknown as NonNullable<Json>,
      notes: f.notes as Json,
      notes_text: f.notesText,
    })
    dirtyRef.current = false
    toast.success(task ? 'Task saved' : 'Task added')
    onDone()
  }

  async function remove() {
    if (!task) return
    await del.mutateAsync(task.id)
    dirtyRef.current = false
    offerUndo(`Deleted “${task.title}”`, 'tasks', task)
    onDone()
  }

  return (
    <form
      ref={formRef}
      onSubmit={(e) => quietly(submit)(e)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          quietly(submit)()
        }
      }}
      className="space-y-5"
      noValidate
    >
      <div>
        <label htmlFor="task-title" className="sr-only">
          Title
        </label>
        <input
          id="task-title"
          autoFocus={!task}
          placeholder="What needs doing?"
          className="field !min-h-11 text-base font-medium"
          value={f.title}
          maxLength={200}
          onChange={(e) => up('title', e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="task-status" className="label">
            Status
          </label>
          <select id="task-status" className="field" value={f.status} onChange={(e) => up('status', e.target.value as TaskStatus)}>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="task-priority" className="label">
            Priority
          </label>
          <select
            id="task-priority"
            className="field"
            value={f.priority}
            onChange={(e) => up('priority', e.target.value as TaskPriority)}
          >
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="task-project" className="label">
            Project
          </label>
          <select id="task-project" className="field" value={f.projectId} onChange={(e) => up('projectId', e.target.value)}>
            <option value="">No project</option>
            {projects.data
              ?.filter((p) => !p.archived || p.id === f.projectId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="task-due" className="label">
            Deadline
          </label>
          <input
            id="task-due"
            type="datetime-local"
            className="field"
            value={f.due}
            onChange={(e) => up('due', e.target.value)}
          />
          <label className="mt-2 flex min-h-9 cursor-pointer items-center gap-2 text-ink-2">
            <input
              type="checkbox"
              className="size-4 accent-[var(--ink)]"
              checked={f.showOnCalendar}
              onChange={(e) => up('showOnCalendar', e.target.checked)}
            />
            Show on calendar
          </label>
        </div>
        <div>
          <label htmlFor="task-remind" className="label">
            Remind me
          </label>
          <input
            id="task-remind"
            type="datetime-local"
            className="field"
            value={f.remind}
            onChange={(e) => up('remind', e.target.value)}
          />
          <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Reminder shortcuts">
            {REMIND_PRESETS.map((p) => {
              const value = dueDate ? format(p.from(dueDate), "yyyy-MM-dd'T'HH:mm") : ''
              return (
                <button
                  key={p.label}
                  type="button"
                  className="chip"
                  disabled={!dueDate}
                  title={dueDate ? undefined : 'Set a deadline first'}
                  aria-pressed={!!value && value === f.remind}
                  onClick={() => up('remind', value)}
                >
                  {p.label}
                </button>
              )
            })}
            {f.remind && (
              <button type="button" className="chip !text-danger" onClick={() => up('remind', '')}>
                No reminder
              </button>
            )}
          </div>
          {f.remind && (
            <p className="mt-2 text-[13px] text-ink-3">
              {remindInPast ? (
                <span className="text-warn">That time has passed, so no reminder will be sent.</span>
              ) : (
                <ReminderHint />
              )}
            </p>
          )}
        </div>
      </div>

      <fieldset>
        <legend className="label">Links</legend>
        <div className="space-y-2">
          {f.links.map((l, i) => (
            <div key={i} className="flex gap-2">
              <input
                aria-label={`Link ${i + 1} label`}
                placeholder="Label"
                className="field w-36 shrink-0 sm:w-44"
                value={l.label}
                onChange={(e) => up('links', f.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              />
              <input
                aria-label={`Link ${i + 1} URL`}
                placeholder="https://"
                inputMode="url"
                className="field min-w-0"
                value={l.url}
                onChange={(e) => up('links', f.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
              />
              <button
                type="button"
                className="btn btn-ghost btn-icon shrink-0"
                aria-label={`Remove link ${i + 1}`}
                onClick={() => up('links', f.links.filter((_, j) => j !== i))}
              >
                <XIcon size={16} weight="bold" />
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-quiet" onClick={() => up('links', [...f.links, { label: '', url: '' }])}>
            <PlusIcon size={14} weight="bold" />
            Add link
          </button>
        </div>
      </fieldset>

      <div>
        <span className="label" id="task-notes-label">
          Notes
        </span>
        <RichEditor
          label="Task notes"
          initial={f.notes}
          onChange={({ json, text }) => setF((s) => ({ ...s, notes: json, notesText: text }))}
        />
      </div>

      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}

      {/* -bottom-4 cancels the scroll area's bottom padding so the bar sits flush with the dialog edge. */}
      <div className="safe-bottom sticky -bottom-4 -mx-5 -mb-4 flex flex-wrap items-center gap-2 border-t border-line bg-surface px-5 py-3">
        {task && (
          <button type="button" className="btn btn-danger -ml-2" onClick={() => quietly(remove)()} disabled={del.isPending}>
            <TrashIcon size={16} weight="bold" />
            Delete
          </button>
        )}
        <span className="hidden text-[13px] text-ink-3 sm:inline">
          {task ? `Created ${format(toDate(task.created_at), 'd MMM yyyy')}` : ''}
        </span>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              if (dirty && !window.confirm('Discard your changes to this task?')) return
              dirtyRef.current = false
              onDone()
            }}
          >
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : task ? 'Save task' : 'Add task'}
          </button>
        </div>
      </div>
    </form>
  )
}
