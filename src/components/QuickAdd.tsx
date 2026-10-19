import { ArrowUpIcon, CaretUpIcon, NotePencilIcon, PencilSimpleIcon, StopIcon, WarningIcon, XIcon } from '@phosphor-icons/react'
import { useQueryClient } from '@tanstack/react-query'
import { addHours, format, subMinutes } from 'date-fns'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { ChatTurn, ProposedItem, QuickAddResult } from '../../supabase/functions/quick-add/logic.ts'
import { deviceTimeZone, toDate } from '@/lib/dates'
import { markNew } from '@/lib/motion'
import { keys, useEvents, useProjects } from '@/lib/queries'
import { must, supabase } from '@/lib/supabase'
import { PRIORITIES, type CalEvent } from '@/lib/types'
import { Dialog } from './Dialog'
import { LogoMark } from './Logo'
import { OpenQuickAdd } from './quickAddContext'
import { Segmented } from './ui'

/** Tracky, mounted once in the app shell. Cmd+K (Ctrl+K elsewhere) opens it from any page. */
export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState({ open: false, instant: false })
  const open = useCallback(
    (opts?: { instant?: boolean }) => setState((s) => (s.open ? s : { open: true, instant: !!opts?.instant })),
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

  // The chat stays mounted, so closing and reopening Tracky keeps the conversation until New chat.
  return (
    <OpenQuickAdd.Provider value={open}>
      {children}
      <QuickAddDialog open={state.open} instant={state.instant} onClose={() => setState((s) => ({ ...s, open: false }))} />
    </OpenQuickAdd.Provider>
  )
}

interface Draft extends ProposedItem {
  key: number
}

type Message =
  | { id: number; role: 'you'; text: string }
  /** What Tracky proposed: its reply and a copy of the drafts as they were at that point. */
  | { id: number; role: 'tracky'; kind: 'proposal'; text: string; model: string; items: Draft[] }
  | { id: number; role: 'tracky'; kind: 'added' | 'note'; text: string }
  | { id: number; role: 'tracky'; kind: 'error'; text: string; retry: string }
/** A message before it gets its id. */
type Unsent = Message extends infer M ? (M extends unknown ? Omit<M, 'id'> : never) : never

const REMINDER_OPTIONS = [
  { value: '', label: 'No reminder' },
  { value: '0', label: 'At the time' },
  { value: '10', label: '10 min before' },
  { value: '15', label: '15 min before' },
  { value: '30', label: '30 min before' },
  { value: '60', label: '1 hour before' },
  { value: '1440', label: '1 day before' },
]

const EXAMPLES = [
  'Sync with Dennis Tuesday 10 to 11am, remind me 15 min before',
  'Finish the labelling sheet by Friday, high priority',
  'Besok jam 9 standup, ingatkan 10 menit sebelumnya',
]

async function readNote(
  body: { text: string; projects: string[]; history: ChatTurn[]; drafts: ProposedItem[] },
  signal: AbortSignal,
): Promise<QuickAddResult> {
  const { data, error } = await supabase.functions.invoke<QuickAddResult>('quick-add', {
    body: { ...body, now: format(new Date(), "yyyy-MM-dd'T'HH:mm"), timezone: deviceTimeZone() },
    signal,
  })
  if (error) {
    // The function answers errors with { error, message }; show its message when there is one.
    const context = (error as { context?: Response }).context
    const answer = context ? await context.json().catch(() => null) : null
    throw new Error(answer?.message ?? 'Couldn’t reach Tracky. Check your connection and try again.')
  }
  return data!
}

const strip = ({ key: _key, ...item }: Draft): ProposedItem => item

function replyFor(found: number, hadDrafts: boolean) {
  if (found === 0) return hadDrafts ? 'Nothing is left to add.' : 'I couldn’t find a task or event in that. Say what it is and when.'
  if (hadDrafts) return 'Here’s the updated list. Check it, then add.'
  return found === 1 ? 'I found one item. Check it, then add it.' : `I found ${found} items. Check them, then add them.`
}

function addedText(titles: string[]) {
  if (titles.length === 1) return `Added “${titles[0]}”.`
  const list = `${titles.slice(0, -1).map((t) => `“${t}”`).join(', ')} and “${titles.at(-1)}”`
  return `Added ${titles.length} items: ${list}.`
}

function QuickAddDialog({ open, instant, onClose }: { open: boolean; instant: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const projects = useProjects()
  const events = useEvents()
  const [messages, setMessages] = useState<Message[]>([])
  const [drafts, setDrafts] = useState<Draft[]>([])
  // The proposal whose drafts are still on screen to edit; older proposals show a summary.
  const [liveId, setLiveId] = useState<number | null>(null)
  const [input, setInput] = useState('')
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nextId = useRef(1)
  const abort = useRef<AbortController | null>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const threadRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const focusAfterRemove = useRef<number | null>(null)

  const activeProjects = (projects.data ?? []).filter((p) => !p.archived)
  const ready = drafts.length > 0 && drafts.every((d) => draftProblem(d) === null)
  const id = () => nextId.current++
  const say = (message: Unsent) => setMessages((m) => [...m, { ...message, id: id() } as Message])

  async function send(raw: string) {
    const text = raw.trim()
    if (!text || reading) return
    // What Tracky needs to follow the chat: what was said, and the drafts as you left them.
    const history: ChatTurn[] = messages
      .filter((m) => m.role === 'you' || m.kind !== 'error')
      .map((m) => ({ role: m.role, text: m.text }))
    const hadDrafts = drafts.length > 0
    say({ role: 'you', text })
    setInput('')
    setError(null)
    setReading(true)
    const controller = new AbortController()
    abort.current = controller
    try {
      const result = await readNote(
        { text, projects: activeProjects.map((p) => p.name), history, drafts: drafts.map(strip) },
        controller.signal,
      )
      if (controller.signal.aborted) return
      const items = result.items.map((item) => ({ ...item, key: id() }))
      const proposalId = id()
      setMessages((m) => [
        ...m,
        {
          id: proposalId,
          role: 'tracky',
          kind: 'proposal',
          text: result.reply ?? replyFor(items.length, hadDrafts),
          model: result.model,
          items,
        },
      ])
      setDrafts(items)
      setLiveId(items.length ? proposalId : null)
    } catch (e) {
      if (controller.signal.aborted) {
        // Stop keeps the chat and hands the message back; New chat (which lets go of the request first) says nothing.
        if (abort.current !== controller) return
        say({ role: 'tracky', kind: 'note', text: 'Stopped. Your message is back in the box if you want to change it.' })
        setInput((current) => current || text)
      } else {
        say({ role: 'tracky', kind: 'error', text: e instanceof Error ? e.message : String(e), retry: text })
      }
    } finally {
      // A request New chat let go of must not end the reading state of one sent after it.
      if (abort.current === controller) {
        abort.current = null
        setReading(false)
      }
    }
  }

  async function add() {
    setSaving(true)
    setError(null)
    try {
      const projectId = (name: string | null) => activeProjects.find((p) => p.name === name)?.id ?? null
      const tasks = drafts.filter((d) => d.kind === 'task').map((d) => toTaskRow(d, projectId(d.project)))
      const evs = drafts.filter((d) => d.kind === 'event').map(toEventRow)
      const added = [
        ...(tasks.length ? must(await supabase.from('tasks').insert(tasks).select('id')) : []),
        ...(evs.length ? must(await supabase.from('events').insert(evs).select('id')) : []),
      ]
      markNew(added.map((row) => row.id))
      qc.invalidateQueries({ queryKey: keys.tasks })
      qc.invalidateQueries({ queryKey: keys.events })
      say({ role: 'tracky', kind: 'added', text: addedText(drafts.map((d) => d.title.trim())) })
      setDrafts([])
      setLiveId(null)
      composerRef.current?.focus()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  function discard() {
    setDrafts([])
    setLiveId(null)
    say({ role: 'tracky', kind: 'note', text: 'Discarded. Nothing was added.' })
    composerRef.current?.focus()
  }

  function newChat() {
    if (drafts.length && !window.confirm('Start a new chat? The drafts you haven’t added will be lost.')) return
    const pending = abort.current
    abort.current = null
    pending?.abort()
    setReading(false)
    setMessages([])
    setDrafts([])
    setLiveId(null)
    setInput('')
    setError(null)
    composerRef.current?.focus()
  }

  const update = (key: number, patch: Partial<ProposedItem>) =>
    setDrafts((ds) => ds.map((d) => (d.key === key ? normalise({ ...d, ...patch }) : d)))

  function remove(key: number) {
    focusAfterRemove.current = drafts.findIndex((d) => d.key === key)
    setDrafts((ds) => ds.filter((d) => d.key !== key))
  }

  // Removing a card removes the button that had focus. Move it to the card that took its place, the
  // one above if it was the last, or the message box when none are left.
  useEffect(() => {
    const index = focusAfterRemove.current
    if (index === null) return
    focusAfterRemove.current = null
    const buttons = threadRef.current?.querySelectorAll<HTMLButtonElement>('[data-remove]') ?? []
    ;(buttons[Math.min(index, buttons.length - 1)] ?? composerRef.current)?.focus()
  }, [drafts])

  // After you send, your message moves to the top of the view with Tracky's answer under it, as in
  // other chat apps; anything else new (Added, Stopped) scrolls to the end. Instant, because most
  // messages are sent with Enter.
  useEffect(() => {
    if (!open) return
    const last = messages.at(-1)
    const asked = last?.role === 'you' || (last?.role === 'tracky' && last.kind === 'proposal')
    const you = [...(threadRef.current?.querySelectorAll<HTMLElement>('[data-you]') ?? [])].at(-1)
    if (asked && you) you.scrollIntoView({ block: 'start' })
    else endRef.current?.scrollIntoView({ block: 'end' })
  }, [open, messages, reading])

  // The message box grows with what you type, up to about eight lines, then scrolls.
  useLayoutEffect(() => {
    const el = composerRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 192)}px`
  }, [input])

  const lastTracky = messages.findLast((m) => m.role === 'tracky')

  return (
    <Dialog
      open={open}
      onRequestClose={onClose}
      title="Tracky"
      size="chat"
      instant={instant}
      actions={
        messages.length > 0 && (
          <button type="button" className="btn btn-ghost px-2.5 text-[13px]" onClick={newChat}>
            <NotePencilIcon size={16} weight="bold" />
            New chat
          </button>
        )
      }
      footer={
        <Composer
          ref={composerRef}
          value={input}
          reading={reading}
          onChange={setInput}
          onSend={() => send(input)}
          onStop={() => abort.current?.abort()}
        />
      }
    >
      <p className="sr-only" aria-live="polite">
        {reading ? 'Tracky is reading.' : lastTracky ? `Tracky: ${lastTracky.text}` : ''}
      </p>
      <div ref={threadRef} className="flex min-h-full flex-col">
        {messages.length === 0 && !reading ? (
          <EmptyChat
            onPick={(example) => {
              setInput(example)
              composerRef.current?.focus()
            }}
          />
        ) : (
          <div className="mx-auto w-full max-w-[640px] space-y-6 pb-2">
            {messages.map((m) =>
              m.role === 'you' ? (
                <p
                  key={m.id}
                  data-you
                  className="ml-auto w-fit max-w-[85%] scroll-mt-2 rounded-[16px] bg-surface-2 px-4 py-2.5 break-words whitespace-pre-wrap"
                >
                  <span className="sr-only">You: </span>
                  {m.text}
                </p>
              ) : (
                <TrackyMessage key={m.id}>
                  {m.kind === 'error' ? (
                    <div className="space-y-2">
                      <p role="alert" className="text-danger">
                        {m.text}
                      </p>
                      <button type="button" className="btn btn-quiet" disabled={reading} onClick={() => send(m.retry)}>
                        Try again
                      </button>
                    </div>
                  ) : m.kind === 'proposal' ? (
                    <>
                      <p className="draft-in">{m.text}</p>
                      {m.id === liveId && drafts.length > 0 ? (
                        <div className="space-y-3">
                          {drafts.map((d, i) => (
                            <DraftCard
                              key={d.key}
                              index={i + 1}
                              draft={d}
                              projects={activeProjects.map((p) => p.name)}
                              clash={d.kind === 'event' ? findClash(d, events.data ?? []) : null}
                              onChange={(patch) => update(d.key, patch)}
                              onRemove={() => remove(d.key)}
                            />
                          ))}
                          {error && (
                            <p role="alert" className="text-danger">
                              {error}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-2">
                            <button type="button" className="btn btn-primary" disabled={!ready || saving} onClick={add}>
                              {saving ? 'Adding…' : drafts.length === 1 ? 'Add 1 item' : `Add ${drafts.length} items`}
                            </button>
                            <button type="button" className="btn btn-quiet" disabled={saving} onClick={discard}>
                              Discard
                            </button>
                            <span className="text-[12px] text-ink-3">Read by Tracky, running on {m.model}</span>
                          </div>
                        </div>
                      ) : (
                        m.items.length > 0 && <DraftSummary items={m.items} />
                      )}
                    </>
                  ) : (
                    <p className={m.kind === 'note' ? 'text-ink-2' : ''}>{m.text}</p>
                  )}
                </TrackyMessage>
              ),
            )}
            {reading && (
              <TrackyMessage>
                <p className="text-ink-2">Reading…</p>
                <span aria-hidden className="relative block h-[3px] w-32 overflow-hidden rounded-full">
                  <span className="working-line" />
                </span>
              </TrackyMessage>
            )}
          </div>
        )}
        <div ref={endRef} />
      </div>
    </Dialog>
  )
}

/** Tracky's side of the chat: the mark and its name, then what it says. */
function TrackyMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <LogoMark size={24} className="mt-0.5" />
      <div className="min-w-0 flex-1 space-y-3">
        <p className="text-[13px] font-medium text-ink-2">Tracky</p>
        {children}
      </div>
    </div>
  )
}

function EmptyChat({ onPick }: { onPick: (example: string) => void }) {
  return (
    <div className="my-auto flex flex-col items-center px-2 py-8 text-center">
      <LogoMark size={36} />
      <h3 className="mt-4 text-xl font-semibold">What’s coming up?</h3>
      <p className="mt-1 max-w-md text-ink-2">
        Tell Tracky the way you’d say it, in English or Bahasa Indonesia. It drafts the tasks and events, and nothing is
        saved until you add them.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {EXAMPLES.map((example) => (
          <button key={example} type="button" className="chip text-left" onClick={() => onPick(example)}>
            {example}
          </button>
        ))}
      </div>
    </div>
  )
}

/** An earlier proposal, once a newer one has replaced it or its drafts were added: one line each. */
function DraftSummary({ items }: { items: Draft[] }) {
  return (
    <ul className="space-y-1 text-[13px] text-ink-2">
      {items.map((d) => (
        <li key={d.key} className="flex gap-2">
          <span className="text-ink-3">{d.kind === 'task' ? 'Task' : 'Event'}</span>
          <span className="min-w-0 truncate">
            {d.title}
            {d.date && <span className="text-ink-3 tnum"> · {draftWhen(d)}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

const draftWhen = (d: Draft) =>
  d.date
    ? format(new Date(`${d.date}T${d.time ?? '00:00'}`), d.time ? 'EEE d MMM, HH:mm' : 'EEE d MMM') +
      (d.kind === 'event' && d.all_day ? ', all day' : '')
    : ''

/**
 * Enter sends and Shift+Enter starts a new line. On a phone, Return starts a new line and the send
 * button sends, as in other chat apps, because there is no Shift key to reach for.
 */
function Composer({
  ref,
  value,
  reading,
  onChange,
  onSend,
  onStop,
}: {
  ref: React.Ref<HTMLTextAreaElement>
  value: string
  reading: boolean
  onChange: (value: string) => void
  onSend: () => void
  onStop: () => void
}) {
  const canSend = value.trim() !== '' && !reading
  return (
    <form
      className="w-full"
      onSubmit={(e) => {
        e.preventDefault()
        if (canSend) onSend()
      }}
    >
      <div className="flex items-end gap-2 rounded-[16px] border border-line-strong bg-surface py-1.5 pr-1.5 pl-4 focus-within:outline-2 focus-within:outline-offset-0 focus-within:outline-accent">
        <label htmlFor="tracky-message" className="sr-only">
          Message Tracky
        </label>
        <textarea
          ref={ref}
          id="tracky-message"
          data-autofocus
          rows={1}
          maxLength={2000}
          placeholder="Message Tracky"
          className="block min-h-8 flex-1 resize-none self-center bg-transparent py-1 leading-6 outline-none placeholder:text-ink-3"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
            if (matchMedia('(pointer: coarse)').matches && !(e.metaKey || e.ctrlKey)) return
            e.preventDefault()
            if (canSend) onSend()
          }}
        />
        {reading ? (
          <button
            type="button"
            aria-label="Stop"
            onClick={onStop}
            className="press grid size-8 shrink-0 place-items-center rounded-full bg-ink text-surface pointer-coarse:size-11"
          >
            <StopIcon size={14} weight="fill" />
          </button>
        ) : (
          <button
            type="submit"
            aria-label="Send"
            disabled={!canSend}
            className="press grid size-8 shrink-0 place-items-center rounded-full bg-accent text-on-accent disabled:bg-surface-2 disabled:text-ink-3 pointer-coarse:size-11"
          >
            <ArrowUpIcon size={16} weight="bold" />
          </button>
        )}
      </div>
      <p className="mt-1.5 text-center text-[12px] text-ink-3">
        <span className="pointer-coarse:hidden">Enter sends, Shift+Enter starts a new line. </span>
        Tracky only drafts; nothing is saved until you add it.
      </p>
    </form>
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
  // A draft starts as one summary line, like a chat answer; Edit opens every field. One that can't be
  // added as it is opens straight away.
  const [editing, setEditing] = useState(problem !== null)
  const reminderOptions = REMINDER_OPTIONS.some((o) => o.value === String(d.remind_minutes_before ?? ''))
    ? REMINDER_OPTIONS
    : [...REMINDER_OPTIONS, { value: String(d.remind_minutes_before), label: `${d.remind_minutes_before} min before` }]

  return (
    <section
      aria-label={d.title}
      className="draft-in rounded-[10px] border border-line p-3"
      style={{ '--i': index } as CSSProperties}
    >
      <div className="flex items-start gap-3">
        {/* The day ruler's marks: a diamond for a deadline, a bar for an event. */}
        <span aria-hidden className="flex h-6 w-3 shrink-0 items-center justify-center">
          {d.kind === 'task' ? (
            <span className="block size-2.5 rotate-45 border-[1.5px] border-ink" />
          ) : (
            <span className="block h-4 w-1 rounded-full bg-ink-2" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium break-words">{d.title.trim() || 'Untitled'}</p>
          <p className="text-[13px] text-ink-2 tnum">{draftDetails(d)}</p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-icon -my-1 shrink-0"
          aria-label={`${editing ? 'Done editing' : 'Edit'} ${d.title}`}
          aria-expanded={editing}
          aria-controls={`${id}-fields`}
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? <CaretUpIcon size={16} weight="bold" /> : <PencilSimpleIcon size={16} weight="bold" />}
        </button>
        <button
          type="button"
          data-remove
          className="btn btn-ghost btn-icon -my-1 -mr-1 shrink-0"
          aria-label={`Remove ${d.title}`}
          onClick={onRemove}
        >
          <XIcon size={16} weight="bold" />
        </button>
      </div>

      {editing && (
        <div id={`${id}-fields`} className="mt-3 border-t border-line pt-3">
          <Segmented<ProposedItem['kind']>
            label="Type"
            value={d.kind}
            onChange={(kind) => onChange({ kind })}
            options={[
              { value: 'task', label: 'Task' },
              { value: 'event', label: 'Event' },
            ]}
          />

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

/** "Event · Tue 20 Oct, 15:00 to 16:00 · Client office · Reminder 15 min before · High · ATLAS" */
function draftDetails(d: Draft) {
  const when = !d.date
    ? 'No date'
    : d.kind === 'event' && d.all_day
      ? `${format(at(d.date, '00:00'), 'EEE d MMM')}, all day`
      : `${format(at(d.date, d.time ?? '17:00'), 'EEE d MMM, HH:mm')}${d.kind === 'event' && d.end_time ? ` to ${d.end_time}` : ''}`
  const reminder = REMINDER_OPTIONS.find((o) => o.value === String(d.remind_minutes_before ?? ''))?.label
  return [
    d.kind === 'task' ? 'Task, due' : 'Event',
    when,
    d.kind === 'event' && d.location,
    d.remind_minutes_before !== null && `Reminder ${reminder ? reminder.toLowerCase() : `${d.remind_minutes_before} min before`}`,
    d.kind === 'task' && d.priority !== 'medium' && PRIORITIES.find((p) => p.value === d.priority)?.label,
    d.kind === 'task' && d.project,
  ]
    .filter(Boolean)
    .join(' · ')
    .replace('Task, due · ', 'Task, due ')
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
