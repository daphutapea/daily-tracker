// Tracky, the assistant in Daily Tracker: turns a sentence into proposed tasks and events, and
// answers questions about the schedule. The model only drafts; the app shows
// the drafts for confirmation and saves them itself, so nothing reaches the database unreviewed.
// No Deno or Node APIs here, so the same file runs in the Edge Function and in `node --test`.

/** Something already saved, so Tracky can advise on it. Times are the device's local time. */
export interface ScheduleEntry {
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

export interface QuickAddRequest {
  text: string
  /** The device's local date and time, "YYYY-MM-DDTHH:mm". */
  now: string
  timezone: string
  projects: string[]
  /** The chat so far, oldest first, without the new note. */
  history?: ChatTurn[]
  /** Drafts on screen that haven't been added yet, as the person last left them. */
  drafts?: ProposedItem[]
  /** Saved tasks and events, when the person lets Tracky see them. */
  schedule?: ScheduleEntry[]
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
  priority: 'urgent' | 'high' | 'medium' | 'low'
  project: string | null
  remind_minutes_before: number | null
  location: string | null
}

export interface QuickAddResult {
  items: ProposedItem[]
  reply: string | null
  model: string
}

export class QuickAddError extends Error {
  readonly code: 'quota' | 'busy' | 'model' | 'bad_request' | 'key'
  constructor(code: QuickAddError['code'], message: string) {
    super(message)
    this.code = code
  }
}

/** Best first. Flash-Lite models have larger free daily allowances, so they catch quota overflow. */
export const DEFAULT_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']

const MAX_ITEMS = 10
const MAX_TURNS = 12
const MAX_SCHEDULE = 80
const MAX_REPLY = 1200
const PRIORITIES = ['urgent', 'high', 'medium', 'low'] as const

export const SYSTEM_PROMPT = `You are Tracky, the assistant built into Daily Tracker, a personal board for one person's tasks,
deadlines, events and notes. You run on a Gemini model made by Google. You turn short notes into
tasks and events for the tracker, and you help the person plan: you answer questions about their
schedule and give advice on what to do first and when.

A task is something to do, optionally with a deadline ("finish the report by Friday"). An event is
something that happens at a time: a meeting, call, class, appointment or trip ("sync with Dennis
Tuesday 10am").

Rules:
- Resolve relative dates ("today", "tomorrow", "besok", "Friday", "next week") against NOW and
  write them as YYYY-MM-DD. Times are 24-hour HH:mm. "next Friday" means the Friday of next week.
- A task with a day but no time gets time null. An event with a day but no time is all_day true.
- If an event gives a length or end ("10 to 11", "for an hour"), set end_time.
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
- One item per thing to do or attend. Never invent items the note doesn't mention. "Remind me"
  sets remind_minutes_before on the item it refers to; it is not an item of its own, and an event
  doesn't need a separate task to go to it.
- If the note contains nothing to add and asks nothing, return no items and use reply to say why in
  one sentence. Also use reply, briefly, when you had to guess something important.
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
- When the note only asks a question or says thanks, return the current drafts unchanged and answer
  in reply.
- Items already added are saved and are not in CURRENT DRAFTS. If the note asks to change one, keep
  the drafts unchanged and say in reply that it is saved, so they can open it from the app to edit.

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
- SCHEDULE entries are saved: never return them as items. To change one, the person opens it in the
  app.`

/**
 * The order Gemini writes an item's fields in. Without it, Gemini writes them alphabetically, so it
 * decided all_day before the title or the time and marked timed events as all day. Here the time
 * comes first and all_day follows from it.
 */
const ITEM_FIELDS = ['kind', 'title', 'date', 'time', 'end_time', 'all_day', 'remind_minutes_before', 'priority', 'project', 'location']

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
          priority: { type: 'STRING', enum: [...PRIORITIES] },
          project: { type: 'STRING', nullable: true },
          remind_minutes_before: { type: 'INTEGER', nullable: true },
          location: { type: 'STRING', nullable: true },
        },
        required: ITEM_FIELDS,
        propertyOrdering: ITEM_FIELDS,
      },
    },
    reply: { type: 'STRING', nullable: true },
  },
  required: ['items', 'reply'],
  propertyOrdering: ['items', 'reply'],
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

/** One saved task or event as a line the model reads, e.g. "- Task, due Tue 20 Oct 17:00 (overdue), high, ATLAS: Send the report". */
export function scheduleLine(e: ScheduleEntry, now: string): string {
  if (e.kind === 'event') {
    const end = e.end && e.at ? ` to ${e.end.slice(0, 10) === e.at.slice(0, 10) ? e.end.slice(11) : readable(e.end)}` : ''
    return `- Event, ${e.at ? `${readable(e.at)}${end}` : `${readable(e.day!)}, all day`}: ${e.title}`
  }
  const details = [
    e.at ? `due ${readable(e.at)}${e.at < now ? ' (overdue)' : ''}` : 'no deadline',
    e.priority !== 'medium' && e.priority,
    e.status && e.status !== 'todo' && e.status.replace('_', ' '),
    e.project,
  ].filter(Boolean)
  return `- Task, ${details.join(', ')}: ${e.title}`
}

export function buildUserMessage(req: QuickAddRequest): string {
  const weekday = WEEKDAYS[new Date(`${req.now.slice(0, 10)}T12:00:00Z`).getUTCDay()]
  const history = req.history ?? []
  const drafts = req.drafts ?? []
  const schedule = req.schedule ?? []
  return [
    `NOW: ${req.now.replace('T', ' ')} (${weekday})`,
    `TIMEZONE: ${req.timezone}`,
    `PROJECTS: ${req.projects.length ? req.projects.join(', ') : '(none)'}`,
    ...(schedule.length ? ['', 'SCHEDULE (already saved):', ...schedule.map((e) => scheduleLine(e, req.now))] : []),
    ...(history.length
      ? ['', 'EARLIER IN THIS CHAT:', ...history.map((t) => `${t.role === 'you' ? 'You' : 'Tracky'}: ${t.text}`)]
      : []),
    ...(drafts.length ? ['', 'CURRENT DRAFTS (not saved yet):', JSON.stringify(drafts)] : []),
    '',
    'NOTE:',
    req.text,
  ].join('\n')
}

/** Checks the request body before any model call. */
export function parseRequest(body: unknown): QuickAddRequest {
  const b = (body ?? {}) as Record<string, unknown>
  const text = typeof b.text === 'string' ? b.text.trim() : ''
  if (!text) throw new QuickAddError('bad_request', 'Write something to add.')
  if (text.length > 2000) throw new QuickAddError('bad_request', 'That note is too long. Keep it under 2,000 characters.')
  const now = typeof b.now === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(b.now) ? b.now : null
  if (!now) throw new QuickAddError('bad_request', 'Missing the current date and time.')
  const timezone = typeof b.timezone === 'string' && b.timezone.length < 64 ? b.timezone : 'UTC'
  const projects = Array.isArray(b.projects)
    ? b.projects.filter((p): p is string => typeof p === 'string' && p.length <= 60).slice(0, 50)
    : []
  const history = Array.isArray(b.history)
    ? b.history
        .filter((t: unknown): t is ChatTurn => {
          const turn = t as Partial<ChatTurn> | null
          return (turn?.role === 'you' || turn?.role === 'tracky') && typeof turn.text === 'string' && turn.text.trim() !== ''
        })
        .slice(-MAX_TURNS)
        .map((t) => ({ role: t.role, text: t.text.trim().slice(0, 2000) }))
    : []
  // Drafts come back from the browser, so they go through the same checks as the model's answer.
  const drafts = validateItems({ items: b.drafts }, projects)
  const schedule = Array.isArray(b.schedule) ? b.schedule.slice(0, MAX_SCHEDULE).flatMap(parseScheduleEntry) : []
  return { text, now, timezone, projects, history, drafts, schedule }
}

const STATUSES = ['todo', 'in_progress', 'waiting', 'done'] as const
const isLocalTime = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(v) && isDate(v.slice(0, 10))

/** Keeps a well-formed schedule entry, or drops it. */
function parseScheduleEntry(raw: unknown): ScheduleEntry[] {
  const r = (raw ?? {}) as Record<string, unknown>
  const title = typeof r.title === 'string' ? r.title.trim().slice(0, 200) : ''
  if (!title || (r.kind !== 'task' && r.kind !== 'event')) return []
  const at = isLocalTime(r.at) ? r.at : null
  if (r.kind === 'event') {
    const day = isDate(r.day) ? r.day : at?.slice(0, 10)
    if (!day) return []
    return [{ kind: 'event', title, at, day, end: at && isLocalTime(r.end) && r.end > at ? r.end : null }]
  }
  return [
    {
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

/** Keeps only well-formed items; anything the app couldn't save safely is dropped or nulled. */
export function validateItems(raw: unknown, projects: string[]): ProposedItem[] {
  const list = Array.isArray((raw as { items?: unknown })?.items) ? (raw as { items: unknown[] }).items : []
  const byLower = new Map(projects.map((p) => [p.toLowerCase(), p]))
  const items: ProposedItem[] = []

  for (const entry of list.slice(0, MAX_ITEMS)) {
    const r = (entry ?? {}) as Record<string, unknown>
    const raw = typeof r.title === 'string' ? r.title.trim().slice(0, 200) : ''
    // A title starts with a capital whatever the model wrote; the rest is left as it is.
    const title = raw.charAt(0).toUpperCase() + raw.slice(1)
    if (!title) continue
    const kind = r.kind === 'event' ? 'event' : 'task'
    const date = isDate(r.date) ? r.date : null
    const time = isTime(r.time) ? r.time : null
    const endTime = isTime(r.end_time) && time && r.end_time > time ? r.end_time : null
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

    items.push({
      kind,
      title,
      date,
      time,
      end_time: kind === 'event' ? endTime : null,
      // An event with a day but no time can only be all day; a task never is.
      all_day: kind === 'event' && (r.all_day === true || (date !== null && time === null)),
      priority,
      project,
      remind_minutes_before: remind,
      location,
    })
  }
  return items
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
  req: QuickAddRequest,
  opts: { apiKey: string; models: string[]; fetch: FetchLike },
): Promise<QuickAddResult> {
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
        throw new QuickAddError('key', 'Google rejected the Gemini API key. Check the GEMINI_API_KEY secret in Supabase.')
      }
      throw new QuickAddError('model', `The AI service returned an error (${res.status}). Try rephrasing the note.`)
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
      throw new QuickAddError('model', `The AI service returned an error (${res.status}). Try again in a moment.`)
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]
    }
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new QuickAddError('model', 'The AI sent back something unreadable. Try rephrasing the note.')
    }
    const reply = (parsed as { reply?: unknown }).reply
    return {
      items: validateItems(parsed, req.projects),
      reply: typeof reply === 'string' && reply.trim() ? reply.trim().slice(0, MAX_REPLY) : null,
      model,
    }
  }

  // A busy model or a per-minute limit may clear in a minute; a used-up daily allowance won't.
  if (failures.has('busy') || failures.has('minute')) {
    throw new QuickAddError('busy', 'The AI is busy right now. Try again in a minute.')
  }
  if (failures.has('day')) {
    throw new QuickAddError('quota', "Today's free AI allowance is used up. Add items by hand, or try again tomorrow.")
  }
  throw new QuickAddError('model', 'None of the configured AI models are available to this API key.')
}
