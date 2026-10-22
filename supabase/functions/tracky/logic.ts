// Tracky, the assistant in Daily Tracker: turns a sentence into proposed tasks and events, proposes
// changes to saved ones, and answers questions about the schedule. The model only proposes; the app
// shows every draft and change for confirmation and saves them itself, so nothing reaches the
// database unreviewed.
// No Deno or Node APIs here, so the same file runs in the Edge Function and in `node --test`.

/** Something already saved, so Tracky can advise on it and change it. Times are the device's local time. */
export interface ScheduleEntry {
  /** "T3" or "E2": how this request refers to the entry. The app maps it back to the saved row. */
  ref?: string
  kind: 'task' | 'event'
  title: string
  /** "YYYY-MM-DDTHH:mm": a task's deadline or an event's start. Null for an all-day event or a task without a deadline. */
  at: string | null
  /** An event's day, "YYYY-MM-DD". */
  day?: string
  /** An event's end, "YYYY-MM-DDTHH:mm". */
  end?: string | null
  status?: 'todo' | 'in_progress' | 'waiting' | 'done'
  priority?: 'urgent' | 'high' | 'medium' | 'low'
  project?: string | null
}

/** One message earlier in the chat with Tracky. */
export interface ChatTurn {
  role: 'you' | 'tracky'
  text: string
}

export interface TrackyRequest {
  text: string
  /** The device's local date and time, "YYYY-MM-DDTHH:mm". */
  now: string
  timezone: string
  projects: string[]
  /** The chat so far, oldest first, without the new note. */
  history?: ChatTurn[]
  /** Drafts on screen that haven't been added yet, as the person last left them. */
  drafts?: ProposedItem[]
  /** True when the note asks for a summary that will replace the chat, so the whole chat is read. */
  compact?: boolean
  /** Saved tasks and events, when the person lets Tracky see them. */
  schedule?: ScheduleEntry[]
  /** Changes to saved items on screen that haven't been applied yet, by the refs of this request. */
  changes?: ProposedChange[]
}

export interface ProposedItem {
  kind: 'task' | 'event'
  title: string
  /** Local date "YYYY-MM-DD", or null when the note gives no day. */
  date: string | null
  /** Local time "HH:mm", or null. */
  time: string | null
  end_time: string | null
  all_day: boolean
  /** How it recurs, or null. A repeating task needs a date: its first deadline. */
  repeat: RepeatRule | null
  priority: 'urgent' | 'high' | 'medium' | 'low'
  project: string | null
  remind_minutes_before: number | null
  location: string | null
}

export type RepeatRule = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly'
const REPEAT_RULES = ['daily', 'weekdays', 'weekly', 'monthly', 'yearly'] as const

type TaskStatus = 'todo' | 'in_progress' | 'waiting'

/** What a change sets on a saved item. Only the fields that change are present. */
export interface ChangeSet {
  title?: string
  /** A task's new deadline or a timed event's new start, local "YYYY-MM-DDTHH:mm". */
  at?: string
  /** An all-day event's new day, "YYYY-MM-DD". */
  day?: string
  /** A timed event's new end, or null when it no longer has one. */
  end?: string | null
  /** False when an all-day event gets a start time. */
  all_day?: boolean
  priority?: ProposedItem['priority']
  status?: TaskStatus
  remind_minutes_before?: number
  location?: string
}

/** A change to something saved, for the person to confirm. */
export interface ProposedChange {
  ref: string
  action: 'update' | 'done' | 'delete'
  kind: 'task' | 'event'
  /** The saved title, so the app can say which item it is. */
  title: string
  set: ChangeSet
}

export interface TrackyResult {
  items: ProposedItem[]
  changes: ProposedChange[]
  reply: string | null
  model: string
}

export class TrackyError extends Error {
  readonly code: 'quota' | 'busy' | 'model' | 'bad_request' | 'key'
  constructor(code: TrackyError['code'], message: string) {
    super(message)
    this.code = code
  }
}

/** Best first. Flash-Lite models have larger free daily allowances, so they catch quota overflow. */
export const DEFAULT_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']

const MAX_ITEMS = 10
const MAX_CHANGES = 20
const MAX_TURNS = 12
/** A compaction reads the whole stored chat (the app keeps 60 messages), within a size budget. */
const MAX_TURNS_COMPACT = 60
const MAX_HISTORY_CHARS = 24000

/** How a compacted chat's summary starts when it is sent back as history; it is always kept. */
export const SUMMARY_PREFIX = 'Summary of our chat so far:'
const MAX_SCHEDULE = 80
const MAX_REPLY = 1200
const PRIORITIES = ['urgent', 'high', 'medium', 'low'] as const

export const SYSTEM_PROMPT = `You are Tracky, the assistant built into Daily Tracker, a personal board for one person's tasks,
deadlines, events and notes. You run on a Gemini model made by Google. You turn short notes into
tasks and events for the tracker, change saved ones when asked, and help the person plan: you answer
questions about their schedule and give advice on what to do first and when.

A task is something to do, optionally with a deadline ("finish the report by Friday"). An event is
something that happens at a time: a meeting, call, class, appointment or trip ("sync with Dennis
Tuesday 10am").

Rules:
- Resolve relative dates ("today", "tomorrow", "besok", "Friday", "next week") against NOW and
  write them as YYYY-MM-DD. Times are 24-hour HH:mm. "next Friday" means the Friday of next week.
- A task with a day but no time gets time null. An event with a day but no time is all_day true.
- If an event gives a length or end ("10 to 11", "for an hour"), set end_time.
- repeat is set only when the note says the thing recurs: "every day" or "daily" is daily, "every
  weekday" or "Monday to Friday" is weekdays, "every Tuesday" or "weekly" is weekly, "every month" or
  "on the 5th of each month" is monthly, "every year" is yearly. Otherwise null. date is the first
  time it happens, the next matching day from NOW; a repeating task always has one.
- "remind me 15 minutes before" sets remind_minutes_before to 15. No mention means null.
- priority is "urgent" or "high" only when the note says so (urgent, ASAP, important, high
  priority, penting). Otherwise "medium".
- project must be copied exactly from PROJECTS when the note clearly refers to one; otherwise null.
- Notes are typed fast. Expect typos, missing spaces, shorthand (tmrw, nxt, mins, sm, yg, bsk, jm)
  and loose times (1500, 0930, 5.30pm, jam 2 siang), and read them for what was meant.
- Titles are short, in the note's language, and written properly: fix misspellings, spell out
  shorthand, split words run together, and capitalise the first word and people's names. For
  example "cek invoce yg baru" becomes "Cek invoice yang baru", and "prep slides fr the demo"
  becomes "Prep slides for the demo". Never copy a typo into a title. Keep codes and project names
  as written, apart from capitals. Leave dates and times out of the title.
- One item per thing to do or attend. Apart from the current drafts, never invent items the note
  doesn't mention. There can be at most 10 drafts at a time. "Remind me"
  sets remind_minutes_before on the item it refers to; it is not an item of its own, and an event
  doesn't need a separate task to go to it.
- If the note contains nothing to add and asks nothing, return the current drafts unchanged (no
  items when there are none) and use reply to say why in one sentence. Also use reply, briefly,
  when you had to guess something important.
- reply is in the note's language, in the first person, in plain text: no greetings, emoji, or
  markdown such as ** or #. For a list, start each line with "- ".
- If the note asks who or what you are, answer in reply: you are Tracky, Daily Tracker's assistant,
  running on Gemini from Google, and you turn notes into tasks and events. Never say you are
  Claude, ChatGPT, a person, or any other assistant, and never make up who built you beyond that.

This is a chat. EARLIER IN THIS CHAT and CURRENT DRAFTS, when given, are what was said so far and
the drafts on screen that are not saved yet.
- items is always the complete list of drafts as it should be after the note. Copy every current
  draft the note doesn't change exactly as it is, in the same order, and put new items after them.
- When the note changes drafts ("make it 4pm", "the second one is urgent", "drop the call"), change
  only what it asks for. When it adds something new, keep the current drafts and add the new item.
- When the note only asks a question or says thanks, return the current drafts unchanged, no
  changes, and answer in reply.
- Items already added are saved and are not in CURRENT DRAFTS. To change one, use changes (below).

Advice. SCHEDULE, when given, is what the person has already saved: tasks with their deadline,
priority and status, and events. Use it to answer questions and give advice, such as what to do
first, whether something fits, or whether work or a client meeting should come first.
- Start with a clear recommendation, then the reason, grounded in the schedule: deadlines,
  priorities, what is overdue, what clashes, how much time there is between things. Name the
  trade-off. Keep it under about 120 words.
- Use only what is in the note, the chat and SCHEDULE. Don't invent details about people, clients
  or work. If something that decides the answer is missing, say what it is and ask one question.
- Advising is not adding. For advice alone, return the current drafts unchanged. Only when the note
  asks you to plan or schedule something, put what you suggest in items as drafts.
- When a new draft clashes with a SCHEDULE event or lands on a crowded day, say so briefly in reply.
- SCHEDULE entries are saved: never return them as items. To change one, use changes.

Changes to saved items. Each SCHEDULE line starts with its reference in brackets, such as [T3] or [E2].
- When the note asks to move, reschedule, rename, reprioritise, finish or delete something saved
  ("push the budget review to Friday", "the gas bill is paid", "cancel yoga", "everything late can
  wait until Monday"), put one entry per item in changes, with its ref. Never add a draft to stand
  in for a change, and never delete a saved item to draft it again: to give it a day or time, update
  it.
- A note can ask for both. Put new things in items and changes to saved things in changes, in the
  same answer: "push my 1:1 to Thursday and add a dentist visit on Friday" is one change and one
  draft.
- action "update" gives the new value of each field the note changes, and null for every field it
  leaves alone. Moving something to another day gives the new date with time null, so its time
  stays. An event's end moves with its start unless the note gives a new end.
- action "done" finishes a task. action "delete" removes a task or event, and only when the note
  clearly says to delete, cancel, remove or drop it. Leave every other field null for both.
- status in an update is "todo", "in_progress" or "waiting"; finishing a task is action "done".
- Use only refs from SCHEDULE. When the note asks to change something saved and more than one saved
  item fits (two saved calls, for "cancel the call"), change nothing: ask which one in reply and name
  them. When it asks to change something and nothing saved fits, change nothing and say so.
- A note that says what something is and when it happens is new, reminder or not ("remind me 10 min
  before the haircut at 4"): draft it, unless SCHEDULE already holds that same thing, in which case
  change the saved one (here, its remind_minutes_before).
- PENDING CHANGES, when given, are changes on screen that are not applied yet. changes holds only what
  this note asks for; pending changes stay unless the note changes the same item again.
- Nothing changes until the person confirms. Say in reply, briefly, what you propose, and only what
  is in items and changes: never say you added, drafted or changed something that isn't there.
- Without SCHEDULE you can't see or change saved items. When the note asks to move, finish, rename
  or delete something already saved, make no change and no draft, and say in reply that you can't
  see saved items: they can turn on "Let Tracky see your schedule" in Settings, under Tracky, or
  change it in the app. Never say you moved or changed it. Draft anything else the note says is
  happening, as usual.`

/**
 * The order Gemini writes an item's fields in. Without it, Gemini writes them alphabetically, so it
 * decided all_day before the title or the time and marked timed events as all day. Here the time
 * comes first and all_day follows from it.
 */
const ITEM_FIELDS = ['kind', 'title', 'date', 'time', 'end_time', 'all_day', 'repeat', 'remind_minutes_before', 'priority', 'project', 'location']

/** A change names its item and action first, then the new values, null where nothing changes. */
const CHANGE_FIELDS = ['ref', 'action', 'title', 'date', 'time', 'end_time', 'priority', 'status', 'remind_minutes_before', 'location']
const UPDATE_STATUSES = ['todo', 'in_progress', 'waiting'] as const

/**
 * Gemini's OpenAPI-style response schema. Every field is required, with null allowed where a field
 * can be empty: Gemini left optional fields out even when the note gave them, such as a reminder.
 */
export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          kind: { type: 'STRING', enum: ['task', 'event'] },
          title: { type: 'STRING' },
          date: { type: 'STRING', nullable: true, description: 'YYYY-MM-DD' },
          time: { type: 'STRING', nullable: true, description: 'HH:mm, 24-hour' },
          end_time: { type: 'STRING', nullable: true, description: 'HH:mm, 24-hour' },
          all_day: { type: 'BOOLEAN' },
          repeat: { type: 'STRING', enum: [...REPEAT_RULES], nullable: true },
          priority: { type: 'STRING', enum: [...PRIORITIES] },
          project: { type: 'STRING', nullable: true },
          remind_minutes_before: { type: 'INTEGER', nullable: true },
          location: { type: 'STRING', nullable: true },
        },
        required: ITEM_FIELDS,
        propertyOrdering: ITEM_FIELDS,
      },
    },
    changes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          ref: { type: 'STRING', description: 'From SCHEDULE, such as T3' },
          action: { type: 'STRING', enum: ['update', 'done', 'delete'] },
          title: { type: 'STRING', nullable: true },
          date: { type: 'STRING', nullable: true, description: 'YYYY-MM-DD' },
          time: { type: 'STRING', nullable: true, description: 'HH:mm, 24-hour' },
          end_time: { type: 'STRING', nullable: true, description: 'HH:mm, 24-hour' },
          priority: { type: 'STRING', enum: [...PRIORITIES], nullable: true },
          status: { type: 'STRING', enum: [...UPDATE_STATUSES], nullable: true },
          remind_minutes_before: { type: 'INTEGER', nullable: true },
          location: { type: 'STRING', nullable: true },
        },
        required: CHANGE_FIELDS,
        propertyOrdering: CHANGE_FIELDS,
      },
    },
    reply: { type: 'STRING', nullable: true },
  },
  required: ['items', 'changes', 'reply'],
  propertyOrdering: ['items', 'changes', 'reply'],
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-10-20T17:00" as "Tue 20 Oct 17:00", or "2026-10-20" as "Tue 20 Oct". */
function readable(local: string) {
  const [date, time] = local.split('T')
  const [, month, day] = date.split('-')
  const weekday = WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()].slice(0, 3)
  return `${weekday} ${Number(day)} ${MONTHS[Number(month) - 1]}${time ? ` ${time}` : ''}`
}

/** One saved task or event as a line the model reads, e.g. "- [T3] Task, due Tue 20 Oct 17:00 (overdue), high, ATLAS: Send the report". */
export function scheduleLine(e: ScheduleEntry, now: string): string {
  const ref = e.ref ? `[${e.ref}] ` : ''
  if (e.kind === 'event') {
    const end = e.end && e.at ? ` to ${e.end.slice(0, 10) === e.at.slice(0, 10) ? e.end.slice(11) : readable(e.end)}` : ''
    return `- ${ref}Event, ${e.at ? `${readable(e.at)}${end}` : `${readable(e.day!)}, all day`}: ${e.title}`
  }
  const details = [
    e.at ? `due ${readable(e.at)}${e.at < now ? ' (overdue)' : ''}` : 'no deadline',
    e.priority !== 'medium' && e.priority,
    e.status && e.status !== 'todo' && e.status.replace('_', ' '),
    e.project,
  ].filter(Boolean)
  return `- ${ref}Task, ${details.join(', ')}: ${e.title}`
}

/** A pending change as a line the model reads, e.g. "- [T3] update: due Fri 23 Oct 17:00, priority high". */
export function changeLine(c: ProposedChange): string {
  if (c.action !== 'update') return `- [${c.ref}] ${c.action === 'done' ? 'mark done' : 'delete'}`
  const s = c.set
  const parts = [
    s.title !== undefined && `title "${s.title}"`,
    s.at !== undefined && `${c.kind === 'task' ? 'due' : 'starts'} ${readable(s.at)}`,
    s.day !== undefined && `on ${readable(s.day)}, all day`,
    s.end !== undefined && (s.end ? `ends ${readable(s.end)}` : 'no end time'),
    s.priority !== undefined && `priority ${s.priority}`,
    s.status !== undefined && `status ${s.status.replace('_', ' ')}`,
    s.remind_minutes_before !== undefined && `reminder ${s.remind_minutes_before} min before`,
    s.location !== undefined && `at ${s.location}`,
  ].filter(Boolean)
  return `- [${c.ref}] update: ${parts.join(', ')}`
}

export function buildUserMessage(req: TrackyRequest): string {
  const weekday = WEEKDAYS[new Date(`${req.now.slice(0, 10)}T12:00:00Z`).getUTCDay()]
  const history = req.history ?? []
  const drafts = req.drafts ?? []
  const schedule = req.schedule ?? []
  const pending = req.changes ?? []
  return [
    `NOW: ${req.now.replace('T', ' ')} (${weekday})`,
    `TIMEZONE: ${req.timezone}`,
    `PROJECTS: ${req.projects.length ? req.projects.join(', ') : '(none)'}`,
    ...(schedule.length ? ['', 'SCHEDULE (already saved):', ...schedule.map((e) => scheduleLine(e, req.now))] : []),
    ...(history.length
      ? ['', 'EARLIER IN THIS CHAT:', ...history.map((t) => `${t.role === 'you' ? 'You' : 'Tracky'}: ${t.text}`)]
      : []),
    ...(drafts.length ? ['', 'CURRENT DRAFTS (not saved yet):', JSON.stringify(drafts)] : []),
    ...(pending.length ? ['', 'PENDING CHANGES (not applied yet):', ...pending.map(changeLine)] : []),
    '',
    'NOTE:',
    req.text,
  ].join('\n')
}

/** Checks the request body before any model call. */
export function parseRequest(body: unknown): TrackyRequest {
  const b = (body ?? {}) as Record<string, unknown>
  const text = typeof b.text === 'string' ? b.text.trim() : ''
  if (!text) throw new TrackyError('bad_request', 'Write something to add.')
  if (text.length > 2000) throw new TrackyError('bad_request', 'That note is too long. Keep it under 2,000 characters.')
  const now = typeof b.now === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(b.now) ? b.now : null
  if (!now) throw new TrackyError('bad_request', 'Missing the current date and time.')
  const timezone = typeof b.timezone === 'string' && b.timezone.length < 64 ? b.timezone : 'UTC'
  const projects = Array.isArray(b.projects)
    ? b.projects.filter((p): p is string => typeof p === 'string' && p.length <= 60).slice(0, 50)
    : []
  const compact = b.compact === true
  const turns = Array.isArray(b.history)
    ? b.history
        .filter((t: unknown): t is ChatTurn => {
          const turn = t as Partial<ChatTurn> | null
          return (turn?.role === 'you' || turn?.role === 'tracky') && typeof turn.text === 'string' && turn.text.trim() !== ''
        })
        .map((t) => ({ role: t.role, text: t.text.trim().slice(0, 2000) }))
    : []
  const history = recentHistory(turns, compact ? MAX_TURNS_COMPACT : MAX_TURNS)
  // Drafts come back from the browser, so they go through the same checks as the model's answer.
  const drafts = validateItems({ items: b.drafts }, projects, { asTyped: true })
  const schedule = Array.isArray(b.schedule) ? b.schedule.slice(0, MAX_SCHEDULE).flatMap(parseScheduleEntry) : []
  // Pending changes come back from the browser in their checked form; they are checked again.
  const changes = Array.isArray(b.changes) ? parsePending(b.changes, schedule) : []
  return { text, now, timezone, projects, history, drafts, schedule, compact, changes }
}

/**
 * The latest turns, up to `limit` and a size budget. A compacted chat's summary opens the history,
 * and it stays however long the chat grows after it, or the gist it holds would be forgotten.
 */
function recentHistory(turns: ChatTurn[], limit: number): ChatTurn[] {
  const summary = turns[0]?.role === 'tracky' && turns[0].text.startsWith(SUMMARY_PREFIX) ? turns[0] : null
  const rest = (summary ? turns.slice(1) : turns).slice(-(summary ? limit - 1 : limit))
  let size = (summary?.text.length ?? 0) + rest.reduce((n, t) => n + t.text.length, 0)
  while (size > MAX_HISTORY_CHARS && rest.length > 1) size -= rest.shift()!.text.length
  return summary ? [summary, ...rest] : rest
}

const STATUSES = ['todo', 'in_progress', 'waiting', 'done'] as const
const isLocalTime = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(v) && isDate(v.slice(0, 10))

const isRef = (v: unknown): v is string => typeof v === 'string' && /^[TE]\d{1,3}$/.test(v)

/** Keeps a well-formed schedule entry, or drops it. */
function parseScheduleEntry(raw: unknown): ScheduleEntry[] {
  const r = (raw ?? {}) as Record<string, unknown>
  const title = typeof r.title === 'string' ? r.title.trim().slice(0, 200) : ''
  if (!title || (r.kind !== 'task' && r.kind !== 'event')) return []
  const at = isLocalTime(r.at) ? r.at : null
  const ref = isRef(r.ref) ? { ref: r.ref } : {}
  if (r.kind === 'event') {
    const day = isDate(r.day) ? r.day : at?.slice(0, 10)
    if (!day) return []
    return [{ ...ref, kind: 'event', title, at, day, end: at && isLocalTime(r.end) && r.end > at ? r.end : null }]
  }
  return [
    {
      ...ref,
      kind: 'task',
      title,
      at,
      status: STATUSES.includes(r.status as (typeof STATUSES)[number]) ? (r.status as ScheduleEntry['status']) : 'todo',
      priority: PRIORITIES.includes(r.priority as (typeof PRIORITIES)[number])
        ? (r.priority as ScheduleEntry['priority'])
        : 'medium',
      project: typeof r.project === 'string' && r.project.trim() ? r.project.trim().slice(0, 60) : null,
    },
  ]
}

const isDate = (v: unknown): v is string => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}
const isTime = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)

/**
 * Keeps only well-formed items; anything the app couldn't save safely is dropped or nulled.
 * `asTyped` is for drafts coming back from the browser: what the person typed stays as it is (an
 * empty or lower-case title, all day turned off, an end before the start), because the app already
 * blocks Add until they fix it, and dropping or repairing a draft here would renumber "the second one".
 */
export function validateItems(raw: unknown, projects: string[], { asTyped = false } = {}): ProposedItem[] {
  const list = Array.isArray((raw as { items?: unknown })?.items) ? (raw as { items: unknown[] }).items : []
  const byLower = new Map(projects.map((p) => [p.toLowerCase(), p]))
  const items: ProposedItem[] = []

  for (const entry of list.slice(0, MAX_ITEMS)) {
    const r = (entry ?? {}) as Record<string, unknown>
    const raw = typeof r.title === 'string' ? r.title.trim().slice(0, 200) : ''
    // The model's titles start with a capital, unless the first word already has one inside it
    // ("iPhone", "eBay"). The rest is left as it is.
    const title = asTyped || /^\p{Ll}\S*\p{Lu}/u.test(raw) ? raw : raw.charAt(0).toUpperCase() + raw.slice(1)
    if (!title && !(asTyped && typeof r.title === 'string')) continue
    const kind = r.kind === 'event' ? 'event' : 'task'
    const date = isDate(r.date) ? r.date : null
    const time = isTime(r.time) ? r.time : null
    const endTime = isTime(r.end_time) && time && (asTyped || r.end_time > time) ? r.end_time : null
    const priority = PRIORITIES.includes(r.priority as (typeof PRIORITIES)[number])
      ? (r.priority as ProposedItem['priority'])
      : 'medium'
    const project = typeof r.project === 'string' ? (byLower.get(r.project.trim().toLowerCase()) ?? null) : null
    const remind =
      typeof r.remind_minutes_before === 'number' &&
      Number.isInteger(r.remind_minutes_before) &&
      r.remind_minutes_before >= 0 &&
      r.remind_minutes_before <= 10080
        ? r.remind_minutes_before
        : null
    const location = kind === 'event' && typeof r.location === 'string' && r.location.trim() ? r.location.trim().slice(0, 200) : null
    // A task can only repeat from a deadline; a draft sent back keeps what the person picked, since
    // the app asks for a date before Add.
    const rule = REPEAT_RULES.includes(r.repeat as RepeatRule) ? (r.repeat as RepeatRule) : null
    const repeat = rule && (asTyped || kind === 'event' || date !== null) ? rule : null

    items.push({
      kind,
      title,
      date,
      time,
      end_time: kind === 'event' ? endTime : null,
      // An event with a day but no time can only be all day; a task never is.
      all_day: kind === 'event' && (r.all_day === true || (!asTyped && date !== null && time === null)),
      repeat,
      priority,
      project,
      remind_minutes_before: remind,
      location,
    })
  }
  return items
}

/** Local "YYYY-MM-DDTHH:mm" as minutes, for wall-clock arithmetic that no time zone can shift. */
const minutesOf = (local: string) => Date.parse(`${local}:00Z`) / 60000
const shiftLocal = (local: string, minutes: number) => new Date((minutesOf(local) + minutes) * 60000).toISOString().slice(0, 16)

/** A saved entry as it will be once a pending update is applied, so a follow-up builds on it. */
function withPending(e: ScheduleEntry, pending: ProposedChange | undefined): ScheduleEntry {
  if (!pending || pending.action !== 'update') return e
  const s = pending.set
  const next: ScheduleEntry = { ...e }
  if (s.title !== undefined) next.title = s.title
  if (s.priority !== undefined) next.priority = s.priority
  if (s.status !== undefined) next.status = s.status
  if (s.at !== undefined) {
    next.at = s.at
    if (e.kind === 'event') next.day = s.at.slice(0, 10)
  }
  if (s.day !== undefined) next.day = s.day
  if (s.end !== undefined) next.end = s.end
  return next
}

/**
 * What a change from the model sets on a saved entry, worked out against the entry (with any pending
 * change applied): a new day keeps the time, a moved event keeps its length, and a field that ends up
 * as it already is, is left out. Returns null when nothing would change.
 */
function resolveUpdate(r: Record<string, unknown>, e: ScheduleEntry): ChangeSet | null {
  const set: ChangeSet = {}
  const rawTitle = typeof r.title === 'string' ? r.title.trim().slice(0, 200) : ''
  const title = /^\p{Ll}\S*\p{Lu}/u.test(rawTitle) ? rawTitle : rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1)
  if (title && title !== e.title) set.title = title
  const date = isDate(r.date) ? r.date : null
  const time = isTime(r.time) ? r.time : null

  if (e.kind === 'task') {
    const day = date ?? e.at?.slice(0, 10) ?? null
    if ((date || time) && day) {
      // A task without a deadline that gets only a day is due at 17:00, as in the app.
      const at = `${day}T${time ?? e.at?.slice(11) ?? '17:00'}`
      if (at !== e.at) set.at = at
    }
    if (PRIORITIES.includes(r.priority as (typeof PRIORITIES)[number]) && r.priority !== e.priority) {
      set.priority = r.priority as ProposedItem['priority']
    }
    if (UPDATE_STATUSES.includes(r.status as TaskStatus) && r.status !== e.status) set.status = r.status as TaskStatus
  } else if (e.at) {
    const start = `${date ?? e.at.slice(0, 10)}T${time ?? e.at.slice(11)}`
    const end = isTime(r.end_time) ? `${start.slice(0, 10)}T${r.end_time}` : null
    if (end && end > start) {
      if (end !== e.end) set.end = end
    } else if (e.end && start !== e.at) {
      set.end = shiftLocal(e.end, minutesOf(start) - minutesOf(e.at))
    }
    if (start !== e.at) set.at = start
  } else {
    // All day: a start time makes it a timed event; otherwise only its day can move.
    const day = date ?? e.day!
    if (time) {
      set.at = `${day}T${time}`
      set.all_day = false
      const end = isTime(r.end_time) && r.end_time > time ? `${day}T${r.end_time}` : null
      if (end) set.end = end
    } else if (day !== e.day) {
      set.day = day
    }
  }

  const remind = r.remind_minutes_before
  if (typeof remind === 'number' && Number.isInteger(remind) && remind >= 0 && remind <= 10080) {
    set.remind_minutes_before = remind
  }
  const location = e.kind === 'event' && typeof r.location === 'string' ? r.location.trim().slice(0, 200) : ''
  if (location) set.location = location
  return Object.keys(set).length ? set : null
}

/**
 * Keeps the model's changes that name a saved entry and would change something, at most one per
 * entry: two updates to one entry merge, and finishing or deleting replaces an update.
 */
export function validateChanges(raw: unknown, schedule: ScheduleEntry[], pending: ProposedChange[] = []): ProposedChange[] {
  const list = Array.isArray(raw) ? raw : []
  const byRef = new Map(schedule.filter((e) => e.ref).map((e) => [e.ref!, e]))
  const pendingByRef = new Map(pending.map((c) => [c.ref, c]))
  const changes = new Map<string, ProposedChange>()

  for (const entry of list) {
    const r = (entry ?? {}) as Record<string, unknown>
    const saved = isRef(r.ref) ? byRef.get(r.ref) : undefined
    if (!saved) continue
    const ref = saved.ref!
    const base = { ref, kind: saved.kind, title: saved.title }
    if (r.action === 'delete' || (r.action === 'done' && saved.kind === 'task')) {
      changes.set(ref, { ...base, action: r.action, set: {} })
      continue
    }
    if (r.action !== 'update') continue
    const earlier = changes.get(ref)
    const set = resolveUpdate(r, withPending(withPending(saved, pendingByRef.get(ref)), earlier))
    if (!set) continue
    changes.set(ref, { ...base, action: 'update', set: earlier?.action === 'update' ? { ...earlier.set, ...set } : set })
  }
  return [...changes.values()].slice(0, MAX_CHANGES)
}

/** Pending changes sent back by the app: kept when their entry is still in the schedule and their fields check out. */
function parsePending(raw: unknown[], schedule: ScheduleEntry[]): ProposedChange[] {
  const byRef = new Map(schedule.filter((e) => e.ref).map((e) => [e.ref!, e]))
  return raw.slice(0, MAX_CHANGES).flatMap((entry): ProposedChange[] => {
    const r = (entry ?? {}) as Record<string, unknown>
    const saved = isRef(r.ref) ? byRef.get(r.ref) : undefined
    if (!saved) return []
    const base = { ref: saved.ref!, kind: saved.kind, title: saved.title }
    if (r.action === 'delete' || (r.action === 'done' && saved.kind === 'task')) return [{ ...base, action: r.action, set: {} }]
    const s = (r.set ?? {}) as Record<string, unknown>
    const set: ChangeSet = {}
    if (typeof s.title === 'string' && s.title.trim()) set.title = s.title.trim().slice(0, 200)
    if (isLocalTime(s.at)) set.at = s.at
    if (isDate(s.day)) set.day = s.day
    if (s.end === null || isLocalTime(s.end)) set.end = s.end
    if (s.all_day === false) set.all_day = false
    if (PRIORITIES.includes(s.priority as (typeof PRIORITIES)[number])) set.priority = s.priority as ProposedItem['priority']
    if (UPDATE_STATUSES.includes(s.status as TaskStatus)) set.status = s.status as TaskStatus
    const remind = s.remind_minutes_before
    if (typeof remind === 'number' && Number.isInteger(remind) && remind >= 0 && remind <= 10080) set.remind_minutes_before = remind
    if (typeof s.location === 'string' && s.location.trim()) set.location = s.location.trim().slice(0, 200)
    return r.action === 'update' && Object.keys(set).length ? [{ ...base, action: 'update', set }] : []
  })
}

const sameTitle = (a: string, b: string) => a.trim().toLowerCase().replace(/\s+/g, ' ') === b.trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * Deleting a saved item and drafting one with the same title is a move done the wrong way round: the
 * saved item's notes, links and history would go with it. It becomes an update of the saved item to
 * the draft's day and time, and the draft is dropped.
 */
export function repairStandIns(
  items: ProposedItem[],
  changes: ProposedChange[],
  schedule: ScheduleEntry[],
  pending: ProposedChange[] = [],
): { items: ProposedItem[]; changes: ProposedChange[] } {
  const kept = [...items]
  const fixed = changes.flatMap((c): ProposedChange[] => {
    const saved = schedule.find((e) => e.ref === c.ref)
    const at = c.action === 'delete' && saved ? kept.findIndex((d) => d.kind === saved.kind && sameTitle(d.title, saved.title)) : -1
    if (at === -1 || !saved) return [c]
    const [draft] = kept.splice(at, 1)
    const set = resolveUpdate(
      {
        date: draft.date,
        time: draft.time,
        end_time: draft.end_time,
        priority: draft.priority,
        remind_minutes_before: draft.remind_minutes_before,
        location: draft.location,
      },
      withPending(saved, pending.find((p) => p.ref === c.ref)),
    )
    return set ? [{ ...c, action: 'update', set }] : []
  })
  return { items: kept, changes: fixed }
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  status: number
  ok: boolean
  json(): Promise<unknown>
  text(): Promise<string>
}>

/**
 * Tries each model in order. A model that is out of quota (429), busy (500, 502, 503, 504) or not
 * available to this key (403, 404) moves on to the next one. A bad request stops, because the next
 * model would be sent the same request.
 */
export async function proposeItems(
  req: TrackyRequest,
  opts: { apiKey: string; models: string[]; fetch: FetchLike },
): Promise<TrackyResult> {
  const failures = new Set<'day' | 'minute' | 'busy' | 'unavailable'>()
  for (const model of opts.models) {
    const res = await opts.fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': opts.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: buildUserMessage(req) }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
      }),
    })

    if (res.status === 400 || res.status === 401) {
      const detail = await res.text()
      if (/api[ _]?key/i.test(detail)) {
        throw new TrackyError('key', 'Google rejected the Gemini API key. Check the GEMINI_API_KEY secret in Supabase.')
      }
      throw new TrackyError('model', `The AI service returned an error (${res.status}). Try rephrasing the note.`)
    }
    if (res.status === 429) {
      // Google sends 429 for its per-minute and its per-day limits alike; only the quota id differs.
      failures.add(/PerDay/i.test(String(await res.text())) ? 'day' : 'minute')
      continue
    }
    if (res.status === 500 || res.status === 502 || res.status === 503 || res.status === 504) {
      failures.add('busy')
      continue
    }
    if (res.status === 403 || res.status === 404) {
      failures.add('unavailable')
      continue
    }
    if (!res.ok) {
      throw new TrackyError('model', `The AI service returned an error (${res.status}). Try again in a moment.`)
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]
    }
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new TrackyError('model', 'The AI sent back something unreadable. Try rephrasing the note.')
    }
    const reply = (parsed as { reply?: unknown }).reply
    const said = typeof reply === 'string' && reply.trim() ? reply.trim().slice(0, MAX_REPLY) : null
    // Past ten drafts the rest are cut; say so rather than let them vanish.
    const found = (parsed as { items?: unknown }).items
    const cut = Array.isArray(found) && found.length > MAX_ITEMS
      ? `I can hold ${MAX_ITEMS} drafts at a time, so I kept the first ${MAX_ITEMS}. Add these, then ask me for the rest.`
      : null
    const proposed = (parsed as { changes?: unknown }).changes
    const checked = validateChanges(proposed, req.schedule ?? [], req.changes ?? [])
    const cutChanges = Array.isArray(proposed) && proposed.length > MAX_CHANGES && checked.length === MAX_CHANGES
      ? `I can propose ${MAX_CHANGES} changes at a time, so I kept the first ${MAX_CHANGES}. Apply these, then ask me again.`
      : null
    const { items, changes } = repairStandIns(validateItems(parsed, req.projects), checked, req.schedule ?? [], req.changes ?? [])
    return {
      items,
      changes,
      reply: [said, cut, cutChanges].filter(Boolean).join('\n') || null,
      model,
    }
  }

  // A busy model or a per-minute limit may clear in a minute; a used-up daily allowance won't.
  if (failures.has('busy') || failures.has('minute')) {
    throw new TrackyError('busy', 'The AI is busy right now. Try again in a minute.')
  }
  if (failures.has('day')) {
    throw new TrackyError('quota', "Today's free AI allowance is used up. Add items by hand, or try again tomorrow.")
  }
  throw new TrackyError('model', 'None of the configured AI models are available to this API key.')
}
