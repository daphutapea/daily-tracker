// Run with: npm run test:functions
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildUserMessage,
  parseRequest,
  proposeItems,
  QuickAddError,
  RESPONSE_SCHEMA,
  SYSTEM_PROMPT,
  validateItems,
  type QuickAddRequest,
} from './logic.ts'

const req: QuickAddRequest = {
  text: 'sync with Dennis Tuesday 10am, remind me 15 min before; finish labelling by Friday, high priority',
  now: '2026-10-15T09:30',
  timezone: 'Asia/Jakarta',
  projects: ['ATLAS', 'FinChat'],
}

function fakeFetch(responses: { status: number; body?: unknown }[]) {
  const calls: string[] = []
  const fetch = async (url: string) => {
    calls.push(url)
    const r = responses.shift() ?? { status: 500 }
    return {
      status: r.status,
      ok: r.status >= 200 && r.status < 300,
      json: async () => r.body,
      text: async () => JSON.stringify(r.body),
    }
  }
  return { fetch, calls }
}

const geminiReply = (payload: unknown) => ({
  candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
})

test('the prompt carries the date, weekday, time zone and projects', () => {
  const msg = buildUserMessage(req)
  assert.match(msg, /NOW: 2026-10-15 09:30 \(Thursday\)/)
  assert.match(msg, /TIMEZONE: Asia\/Jakarta/)
  assert.match(msg, /PROJECTS: ATLAS, FinChat/)
  assert.ok(msg.endsWith(req.text))
})

test('parseRequest rejects empty notes and bad timestamps', () => {
  assert.throws(() => parseRequest({ text: '  ', now: '2026-10-15T09:30' }), QuickAddError)
  assert.throws(() => parseRequest({ text: 'x', now: 'yesterday' }), QuickAddError)
  assert.deepEqual(parseRequest({ text: ' hi ', now: '2026-10-15T09:30', projects: ['A', 3] }).projects, ['A'])
})

test('validateItems keeps good items and repairs or drops bad fields', () => {
  const items = validateItems(
    {
      items: [
        { kind: 'event', title: 'Sync with Dennis', date: '2026-10-20', time: '10:00', end_time: '09:00', all_day: false, priority: 'medium', project: 'atlas', remind_minutes_before: 15 },
        { kind: 'task', title: 'Finish labelling', date: '2026-10-16', time: null, all_day: true, priority: 'HIGH', project: 'Unknown' },
        { kind: 'task', title: '   ', date: '2026-10-16' },
        { kind: 'event', title: 'Offsite', date: '2026-02-30', time: '25:00', all_day: false, priority: 'low' },
        { kind: 'event', title: 'Review', date: '2026-10-21', time: null, all_day: false, priority: 'low', remind_minutes_before: -5 },
      ],
    },
    ['ATLAS', 'FinChat'],
  )
  assert.equal(items.length, 4)
  const [sync, task, offsite, review] = items
  assert.equal(sync.project, 'ATLAS', 'project matched case-insensitively')
  assert.equal(sync.end_time, null, 'an end before the start is dropped')
  assert.equal(sync.remind_minutes_before, 15)
  assert.equal(task.priority, 'medium', 'unknown priority falls back to medium')
  assert.equal(task.project, null, 'projects outside the list are dropped')
  assert.equal(task.all_day, false, 'tasks are never all day')
  assert.equal(offsite.date, null, 'impossible dates are dropped')
  assert.equal(offsite.time, null)
  assert.equal(review.all_day, true, 'an event with a day and no time is all day')
  assert.equal(review.remind_minutes_before, null)
})

test('proposeItems returns validated items from the first model that answers', async () => {
  const { fetch, calls } = fakeFetch([
    { status: 200, body: geminiReply({ items: [{ kind: 'task', title: 'Finish labelling', date: '2026-10-16', all_day: false, priority: 'high' }], reply: null }) },
  ])
  const result = await proposeItems(req, { apiKey: 'k', models: ['m1', 'm2'], fetch })
  assert.equal(result.model, 'm1')
  assert.equal(result.items[0].title, 'Finish labelling')
  assert.equal(calls.length, 1)
})

const perDay = { error: { details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }] } }
const perMinute = { error: { details: [{ violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] }] } }

test('quota, busy and unavailable models fall through to the next model', async () => {
  const { fetch, calls } = fakeFetch([
    { status: 429, body: perDay },
    { status: 503 },
    { status: 404 },
    { status: 200, body: geminiReply({ items: [], reply: 'Nothing to add in that note.' }) },
  ])
  const result = await proposeItems(req, { apiKey: 'k', models: ['best', 'busy', 'missing', 'lite'], fetch })
  assert.equal(result.model, 'lite')
  assert.equal(result.reply, 'Nothing to add in that note.')
  assert.equal(calls.length, 4)
})

test('every daily allowance used up is a quota error', async () => {
  const { fetch } = fakeFetch([{ status: 429, body: perDay }, { status: 429, body: perDay }])
  await assert.rejects(proposeItems(req, { apiKey: 'k', models: ['a', 'b'], fetch }), (e: QuickAddError) => e.code === 'quota')
})

test('a per-minute limit or a busy model is reported as busy, not as the day being used up', async () => {
  const minute = fakeFetch([{ status: 429, body: perDay }, { status: 429, body: perMinute }])
  await assert.rejects(proposeItems(req, { apiKey: 'k', models: ['a', 'b'], fetch: minute.fetch }), (e: QuickAddError) => e.code === 'busy')
  const busy = fakeFetch([{ status: 503 }, { status: 500 }])
  await assert.rejects(proposeItems(req, { apiKey: 'k', models: ['a', 'b'], fetch: busy.fetch }), (e: QuickAddError) => e.code === 'busy')
})

test('a bad request stops instead of sending it to more models', async () => {
  const { fetch, calls } = fakeFetch([{ status: 400, body: { error: { message: 'Invalid schema' } } }, { status: 200 }])
  await assert.rejects(proposeItems(req, { apiKey: 'k', models: ['a', 'b'], fetch }), (e: QuickAddError) => e.code === 'model')
  assert.equal(calls.length, 1)
})

test('titles start with a capital letter, and the rest is left alone', () => {
  const [item] = validateItems({ items: [{ kind: 'task', title: 'kirim laporan ke Pak Budi', all_day: false, priority: 'medium' }] }, [])
  assert.equal(item.title, 'Kirim laporan ke Pak Budi')
})

test('the prompt asks for typos to be read through and kept out of titles', () => {
  assert.match(SYSTEM_PROMPT, /typos/)
  assert.match(SYSTEM_PROMPT, /Never copy a typo into a title/)
})

test('the prompt names the assistant Tracky and says what it runs on', () => {
  assert.match(SYSTEM_PROMPT, /You are Tracky/)
  assert.match(SYSTEM_PROMPT, /Gemini/)
  assert.match(SYSTEM_PROMPT, /Never say you are Claude, ChatGPT/)
})

test('every item field is required and written in an order that settles the time before all_day', () => {
  const item = RESPONSE_SCHEMA.properties.items.items
  assert.deepEqual([...item.required].sort(), Object.keys(item.properties).sort())
  assert.deepEqual(item.propertyOrdering, item.required)
  assert.ok(item.propertyOrdering.indexOf('time') < item.propertyOrdering.indexOf('all_day'))
})

test('a rejected API key is reported as a key problem', async () => {
  const { fetch, calls } = fakeFetch([{ status: 400, body: { error: { message: 'API key not valid. Please pass a valid API key.' } } }])
  await assert.rejects(proposeItems(req, { apiKey: 'bad', models: ['a', 'b'], fetch }), (e: QuickAddError) => e.code === 'key')
  assert.equal(calls.length, 1)
})

test('unreadable model output is a clear error, not a crash', async () => {
  const { fetch } = fakeFetch([{ status: 200, body: { candidates: [{ content: { parts: [{ text: 'not json' }] } }] } }])
  await assert.rejects(proposeItems(req, { apiKey: 'k', models: ['a'], fetch }), (e: QuickAddError) => e.code === 'model')
})
