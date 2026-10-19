import { WarningIcon, XIcon } from '@phosphor-icons/react'
import { useQueryClient } from '@tanstack/react-query'
import { addHours, format, subMinutes } from 'date-fns'
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { ProposedItem, QuickAddResult } from '../../supabase/functions/quick-add/logic.ts'
import { deviceTimeZone, toDate } from '@/lib/dates'
import { keys, useEvents, useProjects } from '@/lib/queries'
import { must, supabase } from '@/lib/supabase'
import { PRIORITIES, type CalEvent } from '@/lib/types'
import { Dialog } from './Dialog'
import { OpenQuickAdd } from './quickAddContext'
import { Segmented } from './ui'

// ---------------------------------------------------------------- opening it from anywhere

/** Tracky, mounted once in the app shell. Cmd+K (Ctrl+K elsewhere) opens it from any page. */
export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; instant: boolean; session: number }>({
    open: false,
    instant: false,
    session: 0,
  })
  const open = useCallback(
    (opts?: { instant?: boolean }) =>
      setState((s) => (s.open ? s : { open: true, instant: !!opts?.instant, session: s.session + 1 })),
    [],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'k' || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return
      if (document.querySelector('dialog[open]')) return
      e.preventDefault()
      // Opened from the keyboard, it appears at once: a shortcut you use many times a day shouldn't animate.
      open({ instant: true })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <OpenQuickAdd.Provider value={open}>
      {children}
      <QuickAddDialog
        key={state.session}
        open={state.open}
        instant={state.instant}
        onClose={() => setState((s) => ({ ...s, open: false }))}
      />
    </OpenQuickAdd.Provider>
  )
}

// ---------------------------------------------------------------- the dialog

interface Draft extends ProposedItem {
  key: number
}

type Phase =
  | { name: 'compose' }
  | { name: 'reading' }
  | { name: 'review'; model: string; reply: string | null; found: number }

const REMINDER_OPTIONS = [
  { value: '', label: 'No reminder' },
  { value: '0', label: 'At the time' },
  { value: '10', label: '10 min before' },
  { value: '15', label: '15 min before' },
  { value: '30', label: '30 min before' },
  { value: '60', label: '1 hour before' },
  { value: '1440', label: '1 day before' },
]

const EXAMPLE = 'Sync with Dennis Tuesday 10 to 11am, remind me 15 min before. Finish the labelling sheet by Friday, high priority.'

async function readNote(text: string, projects: string[]): Promise<QuickAddResult> {
  const { data, error } = await supabase.functions.invoke<QuickAddResult>('quick-add', {
    body: { text, now: format(new Date(), "yyyy-MM-dd'T'HH:mm"), timezone: deviceTimeZone(), projects },
  })
  if (error) {
    // The function answers errors with { error, message }; show its message when there is one.
    const context = (error as { context?: Response }).context
    const body = context ? await context.json().catch(() => null) : null
    throw new Error(body?.message ?? 'Couldn’t reach the AI. Check your connection and try again.')
  }
  return data!
}

function QuickAddDialog({ open, instant, onClose }: { open: boolean; instant: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const projects = useProjects()
  const events = useEvents()
  const [text, setText] = useState('')
  const [phase, setPhase] = useState<Phase>({ name: 'compose' })
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Set when Edit note brings the note back, so it fades in then but not on first open.
  const [returned, setReturned] = useState(false)
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const reviewRef = useRef<HTMLDivElement>(null)
  const editNoteRef = useRef<HTMLButtonElement>(null)
  const focusAfterRemove = useRef<number | null>(null)

  const activeProjects = (projects.data ?? []).filter((p) => !p.archived)
  const ready = drafts.length > 0 && drafts.every((d) => draftProblem(d) === null)

  async function read() {
    if (!text.trim() || phase.name === 'reading') return
    setError(null)
    setPhase({ name: 'reading' })
    try {
      const result = await readNote(text, activeProjects.map((p) => p.name))
      setDrafts(result.items.map((item, i) => ({ ...item, key: i })))
      setPhase({ name: 'review', model: result.model, reply: result.reply, found: result.items.length })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase({ name: 'compose' })
    }
  }

  async function save() {
    setSaving(true)
    try {
      const projectId = (name: string | null) => activeProjects.find((p) => p.name === name)?.id ?? null
      const tasks = drafts.filter((d) => d.kind === 'task').map((d) => toTaskRow(d, projectId(d.project)))
      const evs = drafts.filter((d) => d.kind === 'event').map(toEventRow)
      if (tasks.length) must(await supabase.from('tasks').insert(tasks))
      if (evs.length) must(await supabase.from('events').insert(evs))
      qc.invalidateQueries({ queryKey: keys.tasks })
      qc.invalidateQueries({ queryKey: keys.events })
      toast.success(drafts.length === 1 ? `Added “${drafts[0].title}”` : `Added ${drafts.length} items`)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const update = (key: number, patch: Partial<ProposedItem>) =>
    setDrafts((ds) => ds.map((d) => (d.key === key ? normalise({ ...d, ...patch }) : d)))

  function remove(key: number) {
    focusAfterRemove.current = drafts.findIndex((d) => d.key === key)
    setDrafts((ds) => ds.filter((d) => d.key !== key))
  }

  // Removing a card removes the button that had focus. Move it to the card that took its place, the
  // one above if it was the last, or Edit note when none are left.
  useEffect(() => {
    const index = focusAfterRemove.current
    if (index === null) return
    focusAfterRemove.current = null
    const buttons = reviewRef.current?.querySelectorAll<HTMLButtonElement>('[data-remove]') ?? []
    ;(buttons[Math.min(index, buttons.length - 1)] ?? editNoteRef.current)?.focus()
  }, [drafts])

  // Switching views removes the element that had focus. The review starts from the top, so Tab
  // reaches the first card; Edit note puts you back in the note.
  useEffect(() => {
    if (phase.name === 'review') reviewRef.current?.focus({ preventScroll: true })
    if (phase.name === 'compose' && returned) noteRef.current?.focus()
  }, [phase.name, returned])

  function editNote() {
    setReturned(true)
    setPhase({ name: 'compose' })
  }

  const reading = phase.name === 'reading'

  const footer =
    phase.name === 'review' ? (
      <>
        <span className="text-[12px] text-ink-3">Read by Tracky, running on {phase.model}</span>
        <div className="ml-auto flex gap-2">
          <button ref={editNoteRef} type="button" className="btn btn-quiet" onClick={editNote}>
            Edit note
          </button>
          <button type="button" className="btn btn-primary" disabled={!ready || saving} onClick={save}>
            {saving
              ? 'Adding…'
              : drafts.length === 0
                ? 'Add'
                : drafts.length === 1
                  ? 'Add 1 item'
                  : `Add ${drafts.length} items`}
          </button>
        </div>
      </>
    ) : (
      <>
        <span className="text-[12px] text-ink-3 max-sm:hidden">Nothing is saved until you confirm.</span>
        <button
          type="button"
          className="btn btn-primary ml-auto"
          disabled={!text.trim() || reading}
          onClick={read}
        >
          {reading ? 'Reading…' : 'Read it'}
        </button>
      </>
    )

  return (
    <Dialog open={open} onRequestClose={onClose} title="Tracky" footer={footer} instant={instant} placement="top">
      <p className="sr-only" aria-live="polite">
        {reading
          ? 'Reading your note.'
          : phase.name === 'review'
            ? phase.found === 0
              ? 'No items found.'
              : `Found ${phase.found} ${phase.found === 1 ? 'item' : 'items'}. Check them, then add.`
            : ''}
      </p>
      {phase.name === 'review' ? (
        <div ref={reviewRef} tabIndex={-1} className="space-y-3 outline-none">
          {phase.reply && <p className="draft-in text-ink-2">{phase.reply}</p>}
          {drafts.length === 0 ? (
            <p className="draft-in py-6 text-center text-ink-2">
              {phase.found > 0
                ? 'You removed every item. Edit the note to try again, or close this.'
                : phase.reply
                  ? 'Nothing to add yet.'
                  : 'I couldn’t find a task or event in that note. Say what it is and when.'}
            </p>
          ) : (
            drafts.map((d, i) => (
              <DraftCard
                key={d.key}
                index={phase.reply ? i + 1 : i}
                draft={d}
                projects={activeProjects.map((p) => p.name)}
                clash={d.kind === 'event' ? findClash(d, events.data ?? []) : null}
                onChange={(patch) => update(d.key, patch)}
                onRemove={() => remove(d.key)}
              />
            ))
          )}
          {error && (
            <p role="alert" className="text-danger">
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className={`space-y-2 ${returned ? 'fade-in' : ''}`}>
          <label htmlFor="quick-add-text" className="label">
            What’s coming up?
          </label>
          {/* Read-only rather than disabled while reading, so focus stays in the note. */}
          <div className="relative">
            <textarea
              ref={noteRef}
              id="quick-add-text"
              data-autofocus
              rows={4}
              maxLength={2000}
              className={`field block ${reading ? 'resize-none text-ink-2' : 'resize-y'}`}
              placeholder={EXAMPLE}
              value={text}
              readOnly={reading}
              aria-busy={reading}
              onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                read()
              }
            }}
            />
            {reading && <span aria-hidden className="working-line" />}
          </div>
          <p className="text-[13px] text-ink-3">
            Write it the way you’d say it, in English or Bahasa Indonesia. Several things at once is fine.
            <span className="pointer-coarse:hidden"> Cmd+Enter reads it.</span>
          </p>
          {error && (
            <p role="alert" className="text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </Dialog>
  )
}

// ---------------------------------------------------------------- one proposed item

function DraftCard({
  index,
  draft: d,
  projects,
  clash,
  onChange,
  onRemove,
}: {
  index: number
  draft: Draft
  projects: string[]
  clash: CalEvent | null
  onChange: (patch: Partial<ProposedItem>) => void
  onRemove: () => void
}) {
  const id = `draft-${d.key}`
  const problem = draftProblem(d)
  const reminderOptions = REMINDER_OPTIONS.some((o) => o.value === String(d.remind_minutes_before ?? ''))
    ? REMINDER_OPTIONS
    : [...REMINDER_OPTIONS, { value: String(d.remind_minutes_before), label: `${d.remind_minutes_before} min before` }]

  return (
    <section
      aria-label={d.title}
      className="draft-in rounded-[10px] border border-line p-3"
      style={{ '--i': index } as CSSProperties}
    >
      <div className="flex items-center gap-2">
        <Segmented<ProposedItem['kind']>
          label="Type"
          value={d.kind}
          onChange={(kind) => onChange({ kind })}
          options={[
            { value: 'task', label: 'Task' },
            { value: 'event', label: 'Event' },
          ]}
        />
        <button
          type="button"
          data-remove
          className="btn btn-ghost btn-icon ml-auto"
          aria-label={`Remove ${d.title}`}
          onClick={onRemove}
        >
          <XIcon size={16} weight="bold" />
        </button>
      </div>

      <label htmlFor={`${id}-title`} className="sr-only">
        Title
      </label>
      <input
        id={`${id}-title`}
        className="field mt-2 font-medium"
        maxLength={200}
        value={d.title}
        onChange={(e) => onChange({ title: e.target.value })}
      />

      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div>
          <label htmlFor={`${id}-date`} className="label">
            {d.kind === 'task' ? 'Deadline' : 'Day'}
          </label>
          <input
            id={`${id}-date`}
            type="date"
            className="field"
            value={d.date ?? ''}
            onChange={(e) => onChange({ date: e.target.value || null })}
          />
        </div>
        {!(d.kind === 'event' && d.all_day) && (
          <div>
            <label htmlFor={`${id}-time`} className="label">
              {d.kind === 'task' ? 'Time' : 'Starts'}
            </label>
            <input
              id={`${id}-time`}
              type="time"
              className="field"
              value={d.time ?? ''}
              placeholder="17:00"
              onChange={(e) => onChange({ time: e.target.value || null })}
            />
          </div>
        )}
        {d.kind === 'event' && !d.all_day && (
          <div>
            <label htmlFor={`${id}-end`} className="label">
              Ends <span className="font-normal text-ink-3">(optional)</span>
            </label>
            <input
              id={`${id}-end`}
              type="time"
              className="field"
              value={d.end_time ?? ''}
              onChange={(e) => onChange({ end_time: e.target.value || null })}
            />
          </div>
        )}
        <div>
          <label htmlFor={`${id}-remind`} className="label">
            Reminder
          </label>
          <select
            id={`${id}-remind`}
            className="field"
            value={String(d.remind_minutes_before ?? '')}
            onChange={(e) => onChange({ remind_minutes_before: e.target.value === '' ? null : Number(e.target.value) })}
          >
            {reminderOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {d.kind === 'task' ? (
          <div>
            <label htmlFor={`${id}-priority`} className="label">
              Priority
            </label>
            <select
              id={`${id}-priority`}
              className="field"
              value={d.priority}
              onChange={(e) => onChange({ priority: e.target.value as ProposedItem['priority'] })}
            >
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <label className="flex min-h-10 items-end gap-2 pb-2 text-ink-2">
            <input
              type="checkbox"
              className="size-4 accent-[var(--ink)]"
              checked={d.all_day}
              onChange={(e) => onChange({ all_day: e.target.checked })}
            />
            All day
          </label>
        )}
        {/* Events have no project in this app, so only tasks offer one. */}
        {projects.length > 0 && d.kind === 'task' && (
          <div>
            <label htmlFor={`${id}-project`} className="label">
              Project
            </label>
            <select
              id={`${id}-project`}
              className="field"
              value={d.project ?? ''}
              onChange={(e) => onChange({ project: e.target.value || null })}
            >
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {d.kind === 'event' && (
        <div className="mt-2">
          <label htmlFor={`${id}-location`} className="label">
            Where <span className="font-normal text-ink-3">(optional)</span>
          </label>
          <input
            id={`${id}-location`}
            className="field"
            maxLength={200}
            placeholder="Room, address or meeting link"
            value={d.location ?? ''}
            onChange={(e) => onChange({ location: e.target.value || null })}
          />
        </div>
      )}

      {d.kind === 'task' && d.date && !d.time && (
        <p className="mt-2 text-[13px] text-ink-3">No time given, so it’s due at 17:00.</p>
      )}
      {problem && <p className="mt-2 text-[13px] text-danger">{problem}</p>}
      {clash && (
        <p className="mt-2 flex items-center gap-1.5 text-[13px] text-warn">
          <WarningIcon size={14} weight="bold" aria-hidden />
          Overlaps with “{clash.title}” at {format(toDate(clash.starts_at), 'HH:mm')}
        </p>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- turning drafts into rows

/** Keeps a draft consistent after an edit: tasks are never all day; all-day events have no times. */
function normalise(d: Draft): Draft {
  if (d.kind === 'task') return { ...d, all_day: false, end_time: null, location: null }
  if (d.all_day) return { ...d, time: null, end_time: null }
  return d
}

function draftProblem(d: Draft): string | null {
  if (!d.title.trim()) return 'Give it a title.'
  if (d.kind === 'event' && !d.date) return 'Pick a day for this event.'
  if (d.kind === 'event' && !d.all_day && !d.time) return 'Pick a start time, or mark it all day.'
  if (d.kind === 'event' && !d.all_day && d.time && d.end_time && d.end_time <= d.time) return 'The end is before the start.'
  return null
}

const at = (date: string, time: string) => new Date(`${date}T${time}`)

/** A deadline with a day but no time defaults to 17:00, the same as tasks added by hand. */
function toTaskRow(d: Draft, projectId: string | null) {
  const due = d.date ? at(d.date, d.time ?? '17:00') : null
  return {
    title: d.title.trim(),
    priority: d.priority,
    project_id: projectId,
    due_at: due?.toISOString() ?? null,
    remind_at: due && d.remind_minutes_before !== null ? subMinutes(due, d.remind_minutes_before).toISOString() : null,
  }
}

function toEventRow(d: Draft) {
  const start = at(d.date!, d.all_day ? '00:00' : d.time!)
  const end = !d.all_day && d.end_time ? at(d.date!, d.end_time) : null
  return {
    title: d.title.trim(),
    all_day: d.all_day,
    starts_at: start.toISOString(),
    ends_at: end?.toISOString() ?? null,
    location: d.location?.trim() || null,
    remind_at: d.remind_minutes_before !== null ? subMinutes(start, d.remind_minutes_before).toISOString() : null,
  }
}

/** The first existing timed event that overlaps this draft; events without an end count as an hour. */
function findClash(d: Draft, events: CalEvent[]): CalEvent | null {
  if (!d.date || d.all_day || !d.time) return null
  const start = at(d.date, d.time)
  const end = d.end_time ? at(d.date, d.end_time) : addHours(start, 1)
  return (
    events.find((e) => {
      if (e.all_day) return false
      const s = toDate(e.starts_at)
      const en = e.ends_at ? toDate(e.ends_at) : addHours(s, 1)
      return s < end && start < en
    }) ?? null
  )
}
