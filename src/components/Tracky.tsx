import { ArrowsInSimpleIcon, ArrowUpIcon, CaretUpIcon, NotePencilIcon, PencilSimpleIcon, StopIcon, WarningIcon, XIcon } from '@phosphor-icons/react'
import { useQueryClient } from '@tanstack/react-query'
import { addHours, format, isValid, subMinutes } from 'date-fns'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  SUMMARY_PREFIX,
  type ChatTurn,
  type ProposedChange,
  type ProposedItem,
  type ScheduleEntry,
  type TrackyResult,
} from '../../supabase/functions/tracky/logic.ts'
import { deviceTimeZone, toDate } from '@/lib/dates'
import { markNew } from '@/lib/motion'
import { keys, useEvents, useProjects, useTasks } from '@/lib/queries'
import { opensTracky } from '@/lib/platform'
import { must, supabase } from '@/lib/supabase'
import { TRACKY_CHAT_KEY } from '@/lib/trackyChat'
import { createSeries } from '@/lib/repeat'
import { REPEAT_OPTIONS, repeatLabel, type RepeatRule } from '@/lib/repeatRules'
import { describeChange, fromProposed, mergeChanges, toProposed, useApplyChanges, type Applied, type PendingChange } from '@/lib/trackyChanges'
import { scheduleForTracky, useTrackySeesSchedule, type ScheduleSource } from '@/lib/trackySchedule'
import { PRIORITIES, type CalEvent } from '@/lib/types'
import { Dialog } from './Dialog'
import { LogoMark } from './Logo'
import { OpenTracky } from './trackyContext'
import { Segmented } from './ui'

/** Tracky, mounted once in the app shell. Cmd+K (Ctrl+K elsewhere), or Cmd+T in the Mac app, opens it from any page. */
export function TrackyProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState({ open: false, instant: false })
  const open = useCallback(
    (opts?: { instant?: boolean }) => setState((s) => (s.open ? s : { open: true, instant: !!opts?.instant })),
    [],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!opensTracky(e)) return
      if (document.querySelector('dialog[open]')) {
        // Kept from the Mac app's menu too, which would otherwise open Tracky over the other dialog.
        if (e.key.toLowerCase() === 't') e.preventDefault()
        return
      }
      e.preventDefault()
      // Opened from the keyboard, it appears at once: a shortcut you use many times a day shouldn't animate.
      open({ instant: true })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // The chat stays mounted, so closing and reopening Tracky keeps the conversation until New chat.
  return (
    <OpenTracky.Provider value={open}>
      {children}
      <TrackyDialog open={state.open} instant={state.instant} onClose={() => setState((s) => ({ ...s, open: false }))} />
    </OpenTracky.Provider>
  )
}

interface Draft extends ProposedItem {
  key: number
}

type Message =
  | { id: number; role: 'you'; text: string }
  /**
   * What Tracky proposed: its reply and a copy of the drafts and changes as they were at that point.
   * `summary` marks the one message a compacted chat is reduced to.
   */
  | {
      id: number
      role: 'tracky'
      kind: 'proposal'
      text: string
      model: string
      items: Draft[]
      changes?: PendingChange[]
      summary?: boolean
    }
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
  'Besok jam 9 standup, ingatkan 10 menit sebelumnya',
  'I have a client meeting at 3 and a report due at 5. What should I do first?',
  'Move everything overdue to tomorrow',
]

/** Typed into the message box, these run instead of being sent. */
const COMMANDS = [
  { name: '/compact', hint: 'Shrink this chat to a short summary and keep going' },
  { name: '/clear', hint: 'Start a new chat' },
] as const

const COMPACT_NOTE =
  'Summarise our chat so far so it can replace the conversation. In at most six short lines starting with "- ", say what I asked for, what you advised, what was added, and what is still open. Keep the current drafts exactly as they are.'

async function readNote(
  body: {
    text: string
    projects: string[]
    history: ChatTurn[]
    drafts: ProposedItem[]
    schedule: ScheduleEntry[]
    changes?: ProposedChange[]
    compact?: boolean
  },
  signal: AbortSignal,
): Promise<TrackyResult> {
  const { data, error } = await supabase.functions.invoke<TrackyResult>('tracky', {
    body: { ...body, now: format(new Date(), "yyyy-MM-dd'T'HH:mm"), timezone: deviceTimeZone() },
    signal,
  })
  if (error) {
    // The function answers errors with { error, message }; show its message when there is one. With
    // no connection the context is the network error itself, not a response.
    const context = (error as { context?: unknown }).context
    const answer = context instanceof Response ? await context.json().catch(() => null) : null
    throw new Error(answer?.message ?? 'Couldn’t reach Tracky. Check your connection and try again.')
  }
  return data!
}

const strip = ({ key: _key, ...item }: Draft): ProposedItem => item

function replyFor(found: number, hadDrafts: boolean, changed: number) {
  if (changed > 0 && found === 0) return changed === 1 ? 'Here’s the change. Check it, then confirm.' : 'Here are the changes. Check them, then confirm.'
  if (found === 0) return hadDrafts ? 'Nothing is left to add.' : 'I couldn’t find a task or event in that. Say what it is and when.'
  if (hadDrafts) return 'Here’s the updated list. Check it, then add.'
  return found === 1 ? 'I found one item. Check it, then add it.' : `I found ${found} items. Check them, then add them.`
}

function addedText(titles: string[]) {
  if (titles.length === 1) return `Added “${titles[0]}”.`
  const list = `${titles.slice(0, -1).map((t) => `“${t}”`).join(', ')} and “${titles.at(-1)}”`
  return `Added ${titles.length} items: ${list}.`
}

/** What Tracky needs to follow the chat: what was said, minus errors, with a compacted chat as its summary. */
const toHistory = (messages: Message[]): ChatTurn[] =>
  messages
    .filter((m) => m.role === 'you' || m.kind !== 'error')
    .map((m) => ({
      role: m.role,
      text: m.role === 'tracky' && m.kind === 'proposal' && m.summary ? `${SUMMARY_PREFIX}\n${m.text}` : m.text,
    }))

// The chat is kept on this device, so it survives closing the app, until New chat or /clear. Only the
// last 60 messages are kept; /compact shrinks it to one.
const KEEP = 60
interface SavedChat {
  messages: Message[]
  drafts: Draft[]
  /** Changes to saved items waiting for Confirm. Chats kept before v1.11 have none. */
  changes: PendingChange[]
  liveId: number | null
}

function loadChat(): SavedChat {
  try {
    const saved = JSON.parse(localStorage.getItem(TRACKY_CHAT_KEY) ?? 'null') as Partial<SavedChat> | null
    if (saved && Array.isArray(saved.messages) && Array.isArray(saved.drafts)) {
      return { messages: saved.messages, drafts: saved.drafts, changes: Array.isArray(saved.changes) ? saved.changes : [], liveId: saved.liveId ?? null }
    }
  } catch {
    // Unreadable or blocked storage: start a fresh chat.
  }
  return { messages: [], drafts: [], changes: [], liveId: null }
}

function saveChat(chat: SavedChat) {
  try {
    if (chat.messages.length === 0 && chat.drafts.length === 0 && chat.changes.length === 0) localStorage.removeItem(TRACKY_CHAT_KEY)
    else {
      // The message holding the drafts on screen is kept even when it is older than the last 60.
      const kept = chat.messages.slice(-KEEP)
      const live = chat.messages.find((m) => m.id === chat.liveId)
      const messages = live && !kept.includes(live) ? [live, ...kept.slice(1)] : kept
      localStorage.setItem(TRACKY_CHAT_KEY, JSON.stringify({ ...chat, messages }))
    }
  } catch {
    // Full or blocked storage: the chat still works for this visit.
  }
}

/**
 * How long an answer takes to appear word by word: about 25ms a word, never more than 650ms, so a long
 * answer is never slower to read than it would be all at once.
 */
const typingPace = (text: string) => {
  const words = text.split(/\s+/).filter(Boolean).length
  const perWord = Math.min(25, 650 / Math.max(words, 1))
  return { perWord, total: Math.round(words * perWord + 180) }
}

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

type Busy = false | 'reading' | 'compacting'

function TrackyDialog({ open, instant, onClose }: { open: boolean; instant: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const projects = useProjects()
  const tasks = useTasks()
  const events = useEvents()
  const seesSchedule = useTrackySeesSchedule()
  const [saved] = useState(loadChat)
  const [messages, setMessages] = useState<Message[]>(saved.messages)
  const [drafts, setDrafts] = useState<Draft[]>(saved.drafts)
  const [changes, setChanges] = useState<PendingChange[]>(saved.changes)
  const applyChanges = useApplyChanges()
  // Undo for the changes just made. It sits on the message that says what changed, inside the chat,
  // because a toast would be behind this dialog. It goes once anything newer is said, and isn't kept
  // on the device.
  const [undo, setUndo] = useState<{ messageId: number; applied: Applied; alsoAdded: boolean } | null>(null)
  const [undoing, setUndoing] = useState(false)
  // The proposal whose drafts and changes are still on screen; older proposals show a summary.
  const [liveId, setLiveId] = useState<number | null>(saved.liveId)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState<Busy>(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Answers that arrived in this visit and are still typing out. Older ones, and anything restored
  // from the device, show at once.
  const [typing, setTyping] = useState<ReadonlySet<number>>(new Set())
  const nextId = useRef(
    Math.max(0, ...saved.messages.map((m) => m.id), ...saved.drafts.map((d) => d.key), ...saved.changes.map((c) => c.key)) + 1,
  )
  const abort = useRef<AbortController | null>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const threadRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const focusAfterRemove = useRef<number | null>(null)

  const activeProjects = (projects.data ?? []).filter((p) => !p.archived)
  const pending = drafts.length + changes.length
  const ready = pending > 0 && drafts.every((d) => draftProblem(d) === null)
  const reading = busy !== false
  const id = () => nextId.current++

  useEffect(() => saveChat({ messages, drafts, changes, liveId }), [messages, drafts, changes, liveId])

  /** Adds Tracky's message and marks it as just arrived: it types out, and its drafts rise in. */
  function trackySays(message: Message) {
    setMessages((m) => [...m, message])
    setTyping((t) => new Set(t).add(message.id))
    window.setTimeout(
      () =>
        setTyping((t) => {
          const next = new Set(t)
          next.delete(message.id)
          return next
        }),
      typingPace(message.text).total + 400,
    )
  }
  const say = (message: Unsent) => {
    const full = { ...message, id: id() } as Message
    if (full.role === 'you') setMessages((m) => [...m, full])
    else trackySays(full)
  }

  async function send(raw: string, { fromBox = true } = {}) {
    const text = raw.trim()
    if (!text || reading || saving) return
    const command = text.startsWith('/') ? matchCommand(text) : null
    if (command === 'unclear') return
    if (command) {
      if (fromBox) setInput('')
      return command === '/clear' ? newChat() : compact()
    }
    const history = toHistory(messages)
    const hadDrafts = drafts.length > 0
    say({ role: 'you', text })
    if (fromBox) setInput('')
    setError(null)
    setBusy('reading')
    composerRef.current?.focus()
    const controller = new AbortController()
    abort.current = controller
    try {
      const { entries, sources } = seesSchedule
        ? scheduleForTracky(tasks.data ?? [], events.data ?? [], projects.data ?? [], new Date())
        : { entries: [], sources: new Map<string, ScheduleSource>() }
      const result = await readNote(
        {
          text,
          projects: activeProjects.map((p) => p.name),
          history,
          drafts: drafts.map(strip),
          schedule: entries,
          changes: toProposed(changes, sources),
        },
        controller.signal,
      )
      if (controller.signal.aborted) return
      const items = result.items.map((item) => ({ ...item, key: id() }))
      // A server from before v1.11 sends no changes.
      const incoming = fromProposed(result.changes ?? [], sources, id)
      const nextChanges = mergeChanges(changes, incoming)
      const proposalId = id()
      trackySays({
        id: proposalId,
        role: 'tracky',
        kind: 'proposal',
        text: result.reply ?? replyFor(items.length, hadDrafts, incoming.length),
        model: result.model,
        items,
        changes: nextChanges,
      })
      setDrafts(items)
      setChanges(nextChanges)
      setLiveId(items.length || nextChanges.length ? proposalId : null)
    } catch (e) {
      if (controller.signal.aborted) {
        // Stop keeps the chat and hands the message back; New chat (which lets go of the request first) says nothing.
        if (abort.current !== controller) return
        say({ role: 'tracky', kind: 'note', text: 'Stopped. Your message is back in the box if you want to change it.' })
        setInput((current) => current || text)
        composerRef.current?.focus()
      } else {
        say({ role: 'tracky', kind: 'error', text: e instanceof Error ? e.message : String(e), retry: text })
      }
    } finally {
      // A request New chat let go of must not end the busy state of one sent after it.
      if (abort.current === controller) {
        abort.current = null
        setBusy(false)
      }
    }
  }

  /**
   * Like Claude Code's /compact: Tracky sums up the chat in a few lines, and that summary replaces the
   * conversation. Drafts on screen stay as they are, and later messages still have the context.
   */
  async function compact() {
    if (reading || saving || messages.length < 2) return
    // The Compact button disables itself while it works; the message box keeps the focus.
    composerRef.current?.focus()
    setError(null)
    setBusy('compacting')
    const controller = new AbortController()
    abort.current = controller
    try {
      const result = await readNote(
        {
          text: COMPACT_NOTE,
          projects: activeProjects.map((p) => p.name),
          history: toHistory(messages),
          drafts: drafts.map(strip),
          schedule: [],
          compact: true,
        },
        controller.signal,
      )
      if (controller.signal.aborted) return
      // Without a summary there is nothing to replace the chat with, so it stays as it is.
      if (!result.reply) throw new Error('Tracky didn’t send a summary.')
      // The summary takes over the live proposal's id, so the drafts and changes under it keep their
      // place and any fields you had open, instead of being rebuilt.
      const summaryId = pending && liveId !== null ? liveId : id()
      setMessages([])
      trackySays({
        id: summaryId,
        role: 'tracky',
        kind: 'proposal',
        summary: true,
        text: result.reply,
        model: result.model,
        items: drafts,
        changes,
      })
      setLiveId(pending ? summaryId : null)
    } catch (e) {
      if (!controller.signal.aborted) {
        say({ role: 'tracky', kind: 'note', text: `Couldn’t compact the chat, so it’s unchanged. ${e instanceof Error ? e.message : ''}`.trim() })
      }
    } finally {
      if (abort.current === controller) {
        abort.current = null
        setBusy(false)
      }
    }
  }

  /** Adds the drafts and applies the changes. Changes come with Undo, as moves and deletes do elsewhere. */
  async function confirm() {
    if (reading) return
    setSaving(true)
    setError(null)
    const said: string[] = []
    let applied: Applied | null = null
    try {
      if (drafts.length) {
        const projectId = (name: string | null) => activeProjects.find((p) => p.name === name)?.id ?? null
        const newTasks = drafts.filter((d) => d.kind === 'task').map((d) => toTaskRow(d, projectId(d.project)))
        const evs = drafts.filter((d) => d.kind === 'event' && !d.repeat).map(toEventRow)
        const added = [
          ...(newTasks.length ? must(await supabase.from('tasks').insert(newTasks).select('id')) : []).map((r) => r.id),
          ...(evs.length ? must(await supabase.from('events').insert(evs).select('id')) : []).map((r) => r.id),
        ]
        // A repeating event is a series: the event and the next three months of it.
        for (const d of drafts.filter((d) => d.kind === 'event' && d.repeat)) {
          added.push(...(await createSeries(toEventRow(d), d.repeat!)))
        }
        markNew(added)
        qc.invalidateQueries({ queryKey: keys.tasks })
        qc.invalidateQueries({ queryKey: keys.events })
        qc.invalidateQueries({ queryKey: keys.series })
        said.push(addedText(drafts.map((d) => d.title.trim())))
        // Gone from the screen at once, so a failed change below can't add them a second time.
        setDrafts([])
      }
      if (changes.length) {
        applied = await applyChanges(changes, tasks.data ?? [], events.data ?? [])
        said.push(applied.text)
      }
      const messageId = id()
      trackySays({ id: messageId, role: 'tracky', kind: 'added', text: said.join(' ') })
      setUndo(applied && applied.count > 0 ? { messageId, applied, alsoAdded: said.length > 1 } : null)
      setDrafts([])
      setChanges([])
      setLiveId(null)
      composerRef.current?.focus()
    } catch (e) {
      if (said.length) say({ role: 'tracky', kind: 'added', text: said.join(' ') })
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function undoChanges() {
    if (!undo || undoing) return
    const { applied } = undo
    setUndoing(true)
    try {
      await applied.undo()
      setUndo(null)
      say({ role: 'tracky', kind: 'note', text: applied.count === 1 ? 'Undone. It’s back as it was.' : 'Undone. They’re back as they were.' })
    } catch (e) {
      say({ role: 'tracky', kind: 'note', text: `Couldn’t undo. ${e instanceof Error ? e.message : ''}`.trim() })
    } finally {
      setUndoing(false)
      composerRef.current?.focus()
    }
  }

  function discard() {
    const nothing = drafts.length && changes.length ? 'added or changed' : drafts.length ? 'added' : 'changed'
    setDrafts([])
    setChanges([])
    setLiveId(null)
    say({ role: 'tracky', kind: 'note', text: `Discarded. Nothing was ${nothing}.` })
    composerRef.current?.focus()
  }

  function newChat() {
    if (saving) return
    const lost = drafts.length && changes.length ? 'drafts and changes' : drafts.length ? 'drafts' : 'changes'
    if (pending && !window.confirm(`Start a new chat? The ${lost} you haven’t confirmed will be lost.`)) return
    const request = abort.current
    abort.current = null
    request?.abort()
    setBusy(false)
    setMessages([])
    setDrafts([])
    setChanges([])
    setLiveId(null)
    setUndo(null)
    setTyping(new Set())
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

  function removeChange(key: number) {
    focusAfterRemove.current = drafts.length + changes.findIndex((c) => c.key === key)
    setChanges((cs) => cs.filter((c) => c.key !== key))
  }

  // Removing a card removes the button that had focus. Move it to the card that took its place, the
  // one above if it was the last, or the message box when none are left.
  useEffect(() => {
    const index = focusAfterRemove.current
    if (index === null) return
    focusAfterRemove.current = null
    const buttons = threadRef.current?.querySelectorAll<HTMLButtonElement>('[data-remove]') ?? []
    ;(buttons[Math.min(index, buttons.length - 1)] ?? composerRef.current)?.focus()
  }, [drafts, changes])

  const sourceOf = (c: PendingChange): ScheduleSource | undefined => {
    if (c.kind === 'task') {
      const row = tasks.data?.find((t) => t.id === c.id)
      return row ? { kind: 'task', row } : undefined
    }
    const row = events.data?.find((e) => e.id === c.id)
    return row ? { kind: 'event', row } : undefined
  }

  // After you send, your message moves to the top of the view with Tracky's answer under it, as in
  // other chat apps; anything else new (Added, Stopped) scrolls to the end. Instant, because most
  // messages are sent with Enter.
  useEffect(() => {
    if (!open) return
    const last = messages.at(-1)
    const asked = last?.role === 'you' || (last?.role === 'tracky' && last.kind === 'proposal' && !last.summary)
    const you = [...(threadRef.current?.querySelectorAll<HTMLElement>('[data-you]') ?? [])].at(-1)
    if (asked && you) you.scrollIntoView({ block: 'start' })
    else endRef.current?.scrollIntoView({ block: 'end' })
  }, [open, messages, busy])

  // The message box grows with what you type, up to about eight lines, then scrolls.
  useLayoutEffect(() => {
    const el = composerRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 192)}px`
  }, [input])

  const lastTracky = messages.findLast((m) => m.role === 'tracky')
  const reduce = reducedMotion()
  const canCompact = messages.length >= 2 && !reading && !saving

  return (
    <Dialog
      open={open}
      onRequestClose={onClose}
      title="Tracky"
      size="chat"
      instant={instant}
      actions={
        messages.length > 0 && (
          <>
            <button
              type="button"
              className="btn btn-ghost px-2.5 text-[13px] pointer-coarse:min-w-11"
              disabled={!canCompact}
              title="Shrink this chat to a short summary and keep going (/compact)"
              onClick={compact}
            >
              <ArrowsInSimpleIcon size={16} weight="bold" />
              <span className="max-sm:sr-only">Compact</span>
            </button>
            <button
              type="button"
              className="btn btn-ghost px-2.5 text-[13px] pointer-coarse:min-w-11"
              disabled={saving}
              title="Start a new chat (/clear)"
              onClick={newChat}
            >
              <NotePencilIcon size={16} weight="bold" />
              <span className="max-sm:sr-only">New chat</span>
            </button>
          </>
        )
      }
      footer={
        <Composer
          ref={composerRef}
          value={input}
          busy={reading}
          blocked={saving}
          onChange={setInput}
          onSend={() => send(input)}
          onStop={() => abort.current?.abort()}
        />
      }
    >
      <p className="sr-only" aria-live="polite">
        {busy === 'compacting'
          ? 'Tracky is compacting the chat.'
          : busy
            ? 'Tracky is reading.'
            : lastTracky
              ? `Tracky: ${lastTracky.text}`
              : ''}
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
            {messages.map((m) => {
              if (m.role === 'you')
                return (
                  <p
                    key={m.id}
                    data-you
                    className="ml-auto w-fit max-w-[85%] scroll-mt-2 rounded-[16px] bg-surface-2 px-4 py-2.5 break-words whitespace-pre-wrap"
                  >
                    <span className="sr-only">You: </span>
                    {m.text}
                  </p>
                )
              // Just arrived: the drafts rise in. Typed out word by word too, unless reduced motion is on.
              const fresh = typing.has(m.id)
              const typed = fresh && !reduce
              const after = typed ? typingPace(m.text).total : 0
              const arriving = fresh && !(m.kind === 'proposal' && m.summary)
              return (
                <TrackyMessage key={m.id}>
                  {m.kind === 'error' ? (
                    <div className="space-y-2">
                      <p className="text-danger">{m.text}</p>
                      <button
                        type="button"
                        className="btn btn-quiet"
                        disabled={reading || saving}
                        onClick={() => send(m.retry, { fromBox: false })}
                      >
                        Try again
                      </button>
                    </div>
                  ) : m.kind === 'proposal' ? (
                    <>
                      {m.summary && <p className="text-[12px] font-medium text-ink-3">Earlier chat, compacted</p>}
                      <p className="break-words whitespace-pre-wrap">
                        <TypedText text={m.text} animate={typed} />
                      </p>
                      {m.id === liveId && pending > 0 ? (
                        // Frozen while Tracky reads a follow-up, whose answer replaces these drafts.
                        <div
                          className={`space-y-3 transition-opacity duration-150 ${reading ? 'opacity-60' : ''}`}
                          inert={reading}
                          style={{ '--after': `${after}ms` } as CSSProperties}
                        >
                          {drafts.map((d, i) => (
                            <DraftCard
                              key={d.key}
                              index={i + 1}
                              arriving={arriving}
                              draft={d}
                              projects={activeProjects.map((p) => p.name)}
                              clash={d.kind === 'event' ? findClash(d, events.data ?? []) : null}
                              onChange={(patch) => update(d.key, patch)}
                              onRemove={() => remove(d.key)}
                            />
                          ))}
                          {changes.map((c, i) => (
                            <ChangeCard
                              key={c.key}
                              index={drafts.length + i + 1}
                              arriving={arriving}
                              change={c}
                              source={sourceOf(c)}
                              onRemove={() => removeChange(c.key)}
                            />
                          ))}
                          {error && (
                            <p role="alert" className="text-danger">
                              {error}
                            </p>
                          )}
                          <div
                            className={`flex flex-wrap items-center gap-2 ${arriving ? 'draft-in' : ''}`}
                            style={{ '--i': pending + 1 } as CSSProperties}
                          >
                            <button type="button" className="btn btn-primary" disabled={!ready || saving} onClick={confirm}>
                              {saving ? (changes.length ? 'Saving…' : 'Adding…') : confirmLabel(drafts.length, changes.length)}
                            </button>
                            <button type="button" className="btn btn-quiet" disabled={saving} onClick={discard}>
                              Discard
                            </button>
                            <span className="text-[12px] text-ink-3">Tracky, running on {m.model}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3" style={{ '--after': `${after}ms` } as CSSProperties}>
                          {m.items.length > 0 && <DraftSummary items={m.items} />}
                          {m.changes && m.changes.length > 0 && <ChangeSummary changes={m.changes} />}
                          <p className={`text-[12px] text-ink-3 ${fresh ? 'draft-in' : ''}`}>Tracky, running on {m.model}</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <p className={`break-words whitespace-pre-wrap ${m.kind === 'note' ? 'text-ink-2' : ''}`}>
                        <TypedText text={m.text} animate={typed} />
                      </p>
                      {undo?.messageId === m.id && m === messages.at(-1) && (
                        <div className={fresh ? 'draft-in' : ''} style={{ '--after': `${after}ms`, '--i': 0 } as CSSProperties}>
                          <button type="button" className="btn btn-quiet" disabled={undoing || reading} onClick={undoChanges}>
                            {/* Undo reverses the changes only; when drafts were added too, it says so. */}
                            {undoing
                              ? 'Undoing…'
                              : undo.alsoAdded
                                ? undo.applied.count === 1
                                  ? 'Undo the change'
                                  : 'Undo the changes'
                                : 'Undo'}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </TrackyMessage>
              )
            })}
            {reading && (
              <TrackyMessage>
                <Thinking label={busy === 'compacting' ? 'Compacting the chat' : 'Reading'} />
              </TrackyMessage>
            )}
          </div>
        )}
        <div ref={endRef} />
      </div>
    </Dialog>
  )
}

/**
 * The command a message box starting with "/" asks for: an exact name, or the only one it begins.
 * "unclear" when it begins more than one ("/c"), so it is neither run nor sent as a message.
 */
function matchCommand(text: string): (typeof COMMANDS)[number]['name'] | 'unclear' | null {
  const typed = text.trim().toLowerCase()
  const matches = COMMANDS.filter((c) => c.name.startsWith(typed))
  const exact = COMMANDS.find((c) => c.name === typed)
  if (exact) return exact.name
  return matches.length === 1 ? matches[0].name : matches.length > 1 ? 'unclear' : null
}

const commandId = (name: string) => `tracky-command-${name.slice(1)}`

/**
 * Tracky's answers appear word by word, the way Claude's do, at a pace capped so a long answer never
 * takes more than about two thirds of a second. Each word fades in from a slight blur; the text is
 * all there from the start, so screen readers and copying get it whole.
 */
function TypedText({ text, animate }: { text: string; animate: boolean }) {
  if (!animate) return text
  const { perWord } = typingPace(text)
  let word = 0
  return text.split(/(\s+)/).map((part, i) =>
    part.trim() ? (
      <span key={i} className="type-in" style={{ '--d': `${Math.round(word++ * perWord)}ms` } as CSSProperties}>
        {part}
      </span>
    ) : (
      part
    ),
  )
}

/**
 * While Tracky works: its status with a light sweeping across the words, as Claude shows when it
 * thinks. After four seconds it says it is still going, so a slow answer doesn't look stuck.
 */
function Thinking({ label }: { label: string }) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 4000)
    return () => window.clearTimeout(timer)
  }, [])
  return <p className="thinking">{slow ? 'Still working on it…' : `${label}…`}</p>
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
        Tell Tracky what’s coming up, ask it to move or finish something, or ask it to help you plan your day, in
        English or Bahasa Indonesia. Nothing is saved or changed until you confirm.
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
            {d.repeat && <span className="text-ink-3"> · {repeatLabel(d.repeat).toLowerCase()}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** "Tue 20 Oct, 15:00", "Tue 20 Oct, all day", or the raw text when the date can't be read. */
function draftWhen(d: Draft) {
  if (!d.date) return ''
  const day = at(d.date, '00:00')
  if (!isValid(day)) return d.date
  if (d.kind === 'event' && d.all_day) return `${format(day, 'EEE d MMM')}, all day`
  if (d.kind === 'event' && !d.time) return `${format(day, 'EEE d MMM')}, no start time`
  return format(at(d.date, d.time ?? '17:00'), 'EEE d MMM, HH:mm')
}

/**
 * Enter sends and Shift+Enter starts a new line. On a phone, Return starts a new line and the send
 * button sends, as in other chat apps, because there is no Shift key to reach for. A message box that
 * starts with "/" lists the commands it can run: the arrow keys pick one, and Tab or Enter fills in
 * its name, so a second Enter runs it.
 */
function Composer({
  ref,
  value,
  busy,
  blocked,
  onChange,
  onSend,
  onStop,
}: {
  ref: React.RefObject<HTMLTextAreaElement | null>
  value: string
  busy: boolean
  /** True while drafts are being added: sending would race the save. */
  blocked: boolean
  onChange: (value: string) => void
  onSend: () => void
  onStop: () => void
}) {
  const typedCommand = value.startsWith('/') && !value.includes('\n') ? value.trim().toLowerCase() : null
  const commands = typedCommand !== null ? COMMANDS.filter((c) => c.name.startsWith(typedCommand)) : []
  const [picked, setPicked] = useState<string | null>(null)
  const active = commands.find((c) => c.name === picked) ?? commands[0]
  // "/c" could be either command, so it waits for you to pick one rather than going to Tracky.
  const canSend = value.trim() !== '' && !busy && !blocked && !(commands.length > 1 && active.name !== typedCommand)
  const move = (step: number) => {
    const at = commands.indexOf(active)
    setPicked(commands[(at + step + commands.length) % commands.length].name)
  }
  return (
    <form
      className="relative w-full"
      onSubmit={(e) => {
        e.preventDefault()
        if (canSend) onSend()
      }}
    >
      {commands.length > 0 && (
        // Focus stays in the message box; it points at the highlighted command (aria-activedescendant).
        <ul
          id="tracky-commands"
          role="listbox"
          aria-label="Commands"
          className="pop-in absolute right-0 bottom-full left-0 mb-2 origin-bottom-left rounded-[10px] border border-line bg-surface py-1 shadow-float"
        >
          {commands.map((c) => (
            <li
              key={c.name}
              id={commandId(c.name)}
              role="option"
              aria-selected={c === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onChange(c.name)}
              className={`row-hover flex min-h-9 cursor-pointer items-baseline gap-3 px-3 py-1.5 pointer-coarse:min-h-11 ${
                c === active ? 'bg-surface-2' : ''
              }`}
            >
              <span className="font-medium tnum">{c.name}</span>
              <span className="text-[13px] text-ink-2">{c.hint}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="sr-only" aria-live="polite">
        {commands.length > 1
          ? `${commands.length} commands. Up and down arrows choose, Tab fills one in.`
          : commands.length === 1 && value.trim() !== active.name
            ? `${active.name}: ${active.hint}. Tab fills it in.`
            : ''}
      </p>
      {/* A tap anywhere on the box, not just on the line of text, puts the cursor in it. */}
      <div
        className="flex cursor-text items-end gap-2 rounded-[16px] border border-line-strong bg-surface py-1.5 pr-1.5 pl-4 focus-within:outline-2 focus-within:outline-offset-0 focus-within:outline-accent"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault()
            ref.current?.focus()
          }
        }}
      >
        <label htmlFor="tracky-message" className="sr-only">
          Message Tracky
        </label>
        <textarea
          ref={ref}
          id="tracky-message"
          data-autofocus
          rows={1}
          maxLength={2000}
          placeholder="Message Tracky, or type / for commands"
          aria-describedby="tracky-hint"
          aria-controls={commands.length ? 'tracky-commands' : undefined}
          aria-activedescendant={commands.length ? commandId(active.name) : undefined}
          aria-autocomplete="list"
          className="block max-h-[min(192px,30dvh)] min-h-8 flex-1 resize-none self-center bg-transparent py-1 leading-6 outline-none placeholder:text-ink-3"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (commands.length > 0) {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                move(e.key === 'ArrowDown' ? 1 : -1)
                return
              }
              // Tab, or Enter before the name is whole, fills in the highlighted command, the way a
              // terminal finishes one. Enter on a whole name runs it.
              const fill = (e.key === 'Tab' && !e.shiftKey) || (e.key === 'Enter' && !e.shiftKey)
              if (fill && value.trim() !== active.name && !e.nativeEvent.isComposing) {
                e.preventDefault()
                onChange(active.name)
                return
              }
            }
            // keyCode 229 is the Enter that confirms an input-method word in Safari; it must not send.
            if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return
            if (matchMedia('(pointer: coarse)').matches && !(e.metaKey || e.ctrlKey)) return
            e.preventDefault()
            if (canSend) onSend()
          }}
        />
        {/* One button that changes between Send and Stop, so focus never falls off it, and it never takes focus from the box. */}
        <button
          type="button"
          aria-label={busy ? 'Stop' : 'Send'}
          disabled={!busy && !canSend}
          onMouseDown={(e) => e.preventDefault()}
          onClick={busy ? onStop : onSend}
          className={`press grid size-8 shrink-0 place-items-center rounded-full pointer-coarse:size-11 ${
            busy ? 'bg-ink text-surface' : 'bg-accent text-on-accent disabled:bg-surface-2 disabled:text-ink-3'
          }`}
        >
          {busy ? <StopIcon size={14} weight="fill" /> : <ArrowUpIcon size={16} weight="bold" />}
        </button>
      </div>
      <p id="tracky-hint" className="mt-1.5 text-center text-[12px] text-ink-3">
        <span className="pointer-coarse:hidden">Enter sends, Shift+Enter starts a new line. </span>
        Nothing is saved until you confirm.
      </p>
    </form>
  )
}

// One proposed item

function DraftCard({
  index,
  arriving,
  draft: d,
  projects,
  clash,
  onChange,
  onRemove,
}: {
  index: number
  /** True for drafts that just arrived; they rise into place once. */
  arriving: boolean
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
      className={`rounded-[10px] border border-line p-3 ${arriving ? 'draft-in' : ''}`}
      style={{ '--i': index } as CSSProperties}
    >
      <div className="flex items-start gap-3">
        {/* The day ruler's marks: a diamond for a deadline, a bar for an event. */}
        <span aria-hidden className="flex h-6 w-3 shrink-0 items-center justify-center">
          {d.kind === 'task' ? (
            <span className="block size-2.5 rotate-45 border-[1.5px] border-ink" />
          ) : (
            <span className="block h-4 w-1 rounded-full bg-event" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium break-words">{d.title.trim() || 'Untitled'}</p>
          <p className="text-[13px] break-words text-ink-2 tnum">{draftDetails(d)}</p>
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
                max="9999-12-31"
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
            <div>
              <label htmlFor={`${id}-repeat`} className="label">
                Repeat
              </label>
              <select
                id={`${id}-repeat`}
                className="field"
                value={d.repeat ?? ''}
                onChange={(e) => onChange({ repeat: (e.target.value || null) as RepeatRule | null })}
              >
                {REPEAT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
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
        <p className="mt-2 flex items-start gap-1.5 text-[13px] text-warn">
          <WarningIcon size={14} weight="bold" aria-hidden className="mt-0.5 shrink-0" />
          <span className="min-w-0 break-words">
            Overlaps with “{clash.title}” at {format(toDate(clash.starts_at), 'HH:mm')}
          </span>
        </p>
      )}
    </section>
  )
}

/** "Event · Tue 20 Oct, 15:00 to 16:00 · Client office · Reminder 15 min before · High · ATLAS" */
function draftDetails(d: Draft) {
  const reminder = REMINDER_OPTIONS.find((o) => o.value === String(d.remind_minutes_before ?? ''))?.label
  const time = d.kind === 'task' ? (d.date ? `Task, due ${draftWhen(d)}` : 'Task, no deadline') : `Event · ${d.date ? draftWhen(d) : 'no day'}`
  return [
    d.kind === 'event' && d.time && d.end_time ? `${time} to ${d.end_time}` : time,
    d.repeat && `Repeats ${repeatLabel(d.repeat).toLowerCase()}`,
    d.kind === 'event' && d.location,
    d.remind_minutes_before !== null && `Reminder ${reminder ? reminder.toLowerCase() : `${d.remind_minutes_before} min before`}`,
    d.kind === 'task' && d.priority !== 'medium' && PRIORITIES.find((p) => p.value === d.priority)?.label,
    d.kind === 'task' && d.project,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** "Add 2 items", "Make 1 change", or "Add 2, change 1" when there are both. */
function confirmLabel(drafts: number, changes: number) {
  if (!changes) return drafts === 1 ? 'Add 1 item' : `Add ${drafts} items`
  if (!drafts) return changes === 1 ? 'Make 1 change' : `Make ${changes} changes`
  return `Add ${drafts}, change ${changes}`
}

// A proposed change to something saved

function ChangeCard({
  index,
  arriving,
  change: c,
  source,
  onRemove,
}: {
  index: number
  arriving: boolean
  change: PendingChange
  /** The saved row as it is now; missing when it was deleted since. */
  source: ScheduleSource | undefined
  onRemove: () => void
}) {
  const title = source?.row.title ?? c.title
  return (
    <section
      aria-label={`Change to ${title}`}
      className={`rounded-[10px] border border-line p-3 ${arriving ? 'draft-in' : ''}`}
      style={{ '--i': index } as CSSProperties}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex h-6 w-3 shrink-0 items-center justify-center">
          {c.kind === 'task' ? (
            <span className="block size-2.5 rotate-45 border-[1.5px] border-ink" />
          ) : (
            <span className="block h-4 w-1 rounded-full bg-event" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-ink-3">{c.kind === 'task' ? 'Saved task' : 'Saved event'}</p>
          <p className="font-medium break-words">{title}</p>
          <p className={`text-[13px] break-words tnum ${c.action === 'delete' ? 'text-danger' : 'text-ink-2'}`}>
            {source ? describeChange(c, source) : 'It isn’t saved any more, so this change will be skipped.'}
          </p>
        </div>
        <button
          type="button"
          data-remove
          className="btn btn-ghost btn-icon -my-1 -mr-1 shrink-0"
          aria-label={`Don’t change ${title}`}
          onClick={onRemove}
        >
          <XIcon size={16} weight="bold" />
        </button>
      </div>
    </section>
  )
}

/** Changes in an earlier proposal, one line each. */
function ChangeSummary({ changes }: { changes: PendingChange[] }) {
  return (
    <ul className="space-y-1 text-[13px] text-ink-2">
      {changes.map((c) => (
        <li key={c.key} className="flex gap-2">
          <span className="text-ink-3">{c.action === 'done' ? 'Done' : c.action === 'delete' ? 'Delete' : 'Change'}</span>
          <span className="min-w-0 truncate">{c.title}</span>
        </li>
      ))}
    </ul>
  )
}

// Turning drafts into rows

/** Keeps a draft consistent after an edit: tasks are never all day; all-day events have no times. */
function normalise(d: Draft): Draft {
  if (d.kind === 'task') return { ...d, all_day: false, end_time: null, location: null }
  if (d.all_day) return { ...d, time: null, end_time: null }
  return d
}

function draftProblem(d: Draft): string | null {
  if (!d.title.trim()) return 'Give it a title.'
  if (d.kind === 'task' && d.repeat && !d.date) return 'A repeating task needs a deadline. Pick its first day.'
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
    repeat: due ? (d.repeat ?? null) : null,
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
    details: null,
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
