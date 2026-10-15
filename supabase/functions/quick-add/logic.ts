// Quick add: turns a sentence into proposed tasks and events. The model only drafts; the app shows
// the drafts for confirmation and saves them itself, so nothing reaches the database unreviewed.
// No Deno or Node APIs here, so the same file runs in the Edge Function and in `node --test`.

export interface QuickAddRequest {
  text: string
  /** The device's local date and time, "YYYY-MM-DDTHH:mm". */
  now: string
  timezone: string
  projects: string[]
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
const PRIORITIES = ['urgent', 'high', 'medium', 'low'] as const

export const SYSTEM_PROMPT = `You turn a short note into tasks and events for a personal tracker.

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
- Titles are short and keep the note's language. Leave dates and times out of the title.
- One item per thing to do or attend. Never invent items the note doesn't mention. "Remind me"
  sets remind_minutes_before on the item it refers to; it is not an item of its own, and an event
  doesn't need a separate task to go to it.
- If the note contains nothing to add, return no items and use reply to say why in one sentence.
  Also use reply, briefly, when you had to guess something important.`

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

export function buildUserMessage(req: QuickAddRequest): string {
  const weekday = WEEKDAYS[new Date(`${req.now.slice(0, 10)}T12:00:00Z`).getUTCDay()]
  return [
    `NOW: ${req.now.replace('T', ' ')} (${weekday})`,
    `TIMEZONE: ${req.timezone}`,
    `PROJECTS: ${req.projects.length ? req.projects.join(', ') : '(none)'}`,
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
  return { text, now, timezone, projects }
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
    const title = typeof r.title === 'string' ? r.title.trim().slice(0, 200) : ''
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
      reply: typeof reply === 'string' && reply.trim() ? reply.trim().slice(0, 300) : null,
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
