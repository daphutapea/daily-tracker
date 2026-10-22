import { expect, test } from '@playwright/test'
import { asOwner, jakarta, jakartaDay, PREFIX } from './helpers.ts'

test.afterEach(async ({ page }) => {
  await (await asOwner(page)).cleanUp()
})

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }

test('Tracky turns a note into drafts and saves only the ones you keep', async ({ page }) => {
  const day = jakartaDay(5)
  const draft = (patch: object) => ({
    kind: 'task',
    title: '',
    date: day,
    time: null,
    end_time: null,
    all_day: false,
    priority: 'medium',
    project: null,
    remind_minutes_before: null,
    location: null,
    ...patch,
  })
  const event = draft({ kind: 'event', title: `${PREFIX}sync with Dennis`, time: '10:00', end_time: '11:00', remind_minutes_before: 15 })
  const task = draft({ title: `${PREFIX}finish the labelling sheet`, priority: 'high' })
  const extra = draft({ title: `${PREFIX}something misread` })

  // The AI is faked: the test checks what the app does with an answer, not the model.
  let sentText = ''
  await page.route('**/functions/v1/tracky', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    sentText = route.request().postDataJSON().text
    await route.fulfill({ headers: CORS, json: { model: 'fake-model', reply: null, items: [event, task, extra] } })
  })

  await page.goto('/')
  await page.keyboard.press('ControlOrMeta+k')
  const dialog = page.getByRole('dialog', { name: 'Tracky' })
  await expect(dialog.getByRole('heading', { name: 'What’s coming up?' })).toBeVisible()
  const box = dialog.getByLabel('Message Tracky')
  await box.fill('Sync with Dennis 10 to 11, remind me 15 min before.')
  // Shift+Enter starts a new line; Enter sends.
  await box.press('Shift+Enter')
  await box.pressSequentially('Labelling sheet, high priority.')
  await box.press('Enter')

  await expect(dialog.getByRole('region', { name: event.title as string })).toBeVisible()
  expect(sentText).toBe('Sync with Dennis 10 to 11, remind me 15 min before.\nLabelling sheet, high priority.')
  await expect(box).toHaveValue('')
  await dialog.getByRole('button', { name: `Remove ${extra.title}` }).click()
  await dialog.getByRole('button', { name: 'Add 2 items' }).click()
  await expect(dialog.getByText(/^Added 2 items/)).toBeVisible()

  const db = await asOwner(page)
  const [savedEvent] = await db.eventsTitled(event.title as string)
  expect(Date.parse(savedEvent.starts_at)).toBe(Date.parse(jakarta(day, '10:00')))
  expect(Date.parse(savedEvent.ends_at!)).toBe(Date.parse(jakarta(day, '11:00')))
  expect(Date.parse(savedEvent.remind_at!)).toBe(Date.parse(jakarta(day, '09:45')))
  const [savedTask] = await db.tasksTitled(task.title as string)
  // A drafted task with a day but no time is due at 17:00.
  expect(Date.parse(savedTask.due_at!)).toBe(Date.parse(jakarta(day, '17:00')))
  expect(savedTask.priority).toBe('high')
  expect(await db.tasksTitled(extra.title as string)).toHaveLength(0)
})

test('a follow-up sends the chat so far and the drafts as you left them, and Tracky updates them', async ({ page }) => {
  const day = jakartaDay(3)
  const sync = {
    kind: 'event',
    title: `${PREFIX}sync with Dennis`,
    date: day,
    time: '10:00',
    end_time: null,
    all_day: false,
    priority: 'medium',
    project: null,
    remind_minutes_before: null,
    location: null,
  }
  const bodies: { text: string; history: { role: string; text: string }[]; drafts: { title: string; location: string | null }[] }[] = []
  await page.route('**/functions/v1/tracky', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const body = route.request().postDataJSON()
    bodies.push(body)
    const items = bodies.length === 1 ? [sync] : [{ ...body.drafts[0], time: '16:00' }]
    await route.fulfill({ headers: CORS, json: { model: 'fake-model', reply: bodies.length === 1 ? null : 'Moved it to 16:00.', items } })
  })

  await page.goto('/')
  await page.keyboard.press('ControlOrMeta+k')
  const dialog = page.getByRole('dialog', { name: 'Tracky' })
  const box = dialog.getByLabel('Message Tracky')
  await box.fill('sync with Dennis 10am')
  await box.press('Enter')
  const card = dialog.getByRole('region', { name: sync.title })
  await expect(card).toBeVisible()
  // An edit made on the card travels with the next message.
  await card.getByRole('button', { name: `Edit ${sync.title}` }).click()
  await card.getByLabel(/Where/).fill('Room 4')
  await box.fill('make it 4pm')
  await box.press('Enter')

  await expect(dialog.getByText('Moved it to 16:00.', { exact: true })).toBeVisible()
  expect(bodies[1].text).toBe('make it 4pm')
  expect(bodies[1].history.map((t) => t.role)).toEqual(['you', 'tracky'])
  expect(bodies[1].history[0].text).toBe('sync with Dennis 10am')
  expect(bodies[1].drafts).toHaveLength(1)
  expect(bodies[1].drafts[0].location).toBe('Room 4')
  await expect(dialog.getByRole('region', { name: sync.title })).toContainText('16:00 · Room 4')

  await dialog.getByRole('button', { name: 'Add 1 item' }).click()
  await expect(dialog.getByText(/^Added “/)).toBeVisible()
  const [saved] = await (await asOwner(page)).eventsTitled(sync.title)
  expect(Date.parse(saved.starts_at)).toBe(Date.parse(jakarta(day, '16:00')))
  expect(saved.location).toBe('Room 4')
})

test('Tracky changes saved tasks only after you confirm, and Undo puts them back', async ({ page }) => {
  await page.goto('/')
  const db = await asOwner(page)
  const yesterday = jakartaDay(-1)
  const tomorrow = jakartaDay(1)
  const report = await db.addTask({
    title: `${PREFIX}send the report`,
    due_at: jakarta(yesterday, '17:00'),
    remind_at: jakarta(yesterday, '16:00'),
    priority: 'high',
  })
  const invoice = await db.addTask({ title: `${PREFIX}pay the invoice`, due_at: jakarta(jakartaDay(0), '23:00') })

  type Entry = { ref: string; title: string }
  const bodies: { schedule: Entry[]; changes: { ref: string; action: string; set: { at?: string } }[] }[] = []
  await page.route('**/functions/v1/tracky', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const body = route.request().postDataJSON()
    bodies.push(body)
    // The server's answer, already checked: changes name entries by the refs this request sent.
    const ref = (title: string) => body.schedule.find((e: Entry) => e.title === title).ref
    const changes =
      bodies.length === 1
        ? [
            { ref: ref(report.title), action: 'update', kind: 'task', title: report.title, set: { at: `${tomorrow}T17:00` } },
            { ref: ref(invoice.title), action: 'done', kind: 'task', title: invoice.title, set: {} },
          ]
        : [{ ref: ref(report.title), action: 'update', kind: 'task', title: report.title, set: { priority: 'urgent' } }]
    await route.fulfill({ headers: CORS, json: { model: 'fake-model', reply: null, items: [], changes } })
  })

  await page.reload()
  await expect(page.getByText(report.title).first()).toBeVisible()
  await page.keyboard.press('ControlOrMeta+k')
  const dialog = page.getByRole('dialog', { name: 'Tracky' })
  const box = dialog.getByLabel('Message Tracky')
  await box.fill('move the report to tomorrow, and the invoice is paid')
  await box.press('Enter')

  const reportCard = dialog.getByRole('region', { name: `Change to ${report.title}` })
  await expect(reportCard).toContainText('Deadline')
  await expect(reportCard).toContainText('→')
  await expect(dialog.getByRole('region', { name: `Change to ${invoice.title}` })).toContainText('Mark done')
  // Nothing has changed yet.
  expect((await db.task(report.id)).due_at).toBe(report.due_at)

  // A follow-up builds on the change on screen: the server is told about it by this request's ref.
  await box.fill('and make it urgent')
  await box.press('Enter')
  await expect(reportCard).toContainText('Priority High → Urgent')
  expect(bodies[1].changes).toContainEqual(expect.objectContaining({ action: 'update', set: { at: `${tomorrow}T17:00` } }))
  await expect(reportCard).toContainText('Deadline')

  await dialog.getByRole('button', { name: 'Make 2 changes' }).click()
  await expect(dialog.getByText(/^Moved “e2e send the report” to .+ with a new priority and marked “e2e pay the invoice” done\.$/)).toBeVisible()
  const moved = await db.task(report.id)
  expect(Date.parse(moved.due_at!)).toBe(Date.parse(jakarta(tomorrow, '17:00')))
  // The reminder moved with the deadline, still an hour before it.
  expect(Date.parse(moved.remind_at!)).toBe(Date.parse(jakarta(tomorrow, '16:00')))
  expect(moved.priority).toBe('urgent')
  expect((await db.task(invoice.id)).status).toBe('done')

  // Undo sits in the chat, where it can be reached while Tracky is open.
  await dialog.getByRole('button', { name: 'Undo' }).click()
  await expect(dialog.getByText('Undone. They’re back as they were.', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Undo' })).toHaveCount(0)
  const back = await db.task(report.id)
  expect(Date.parse(back.due_at!)).toBe(Date.parse(report.due_at!))
  expect(Date.parse(back.remind_at!)).toBe(Date.parse(report.remind_at!))
  expect(back.priority).toBe('high')
  expect((await db.task(invoice.id)).status).toBe('todo')
})

test('Tracky answers a planning question from your schedule, and the schedule stays home when turned off', async ({ page }) => {
  await page.goto('/')
  const db = await asOwner(page)
  const today = jakartaDay(0)
  await db.addTask({ title: `${PREFIX}send the report`, due_at: jakarta(today, '23:00'), priority: 'high' })

  const bodies: { schedule: { title: string; priority?: string }[] }[] = []
  await page.route('**/functions/v1/tracky', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    bodies.push(route.request().postDataJSON())
    await route.fulfill({
      headers: CORS,
      json: { model: 'fake-model', items: [], reply: 'Do the report first.\n- It is due tonight and marked high.' },
    })
  })

  await page.reload()
  await expect(page.getByText(`${PREFIX}send the report`).first()).toBeVisible()
  await page.keyboard.press('ControlOrMeta+k')
  const dialog = page.getByRole('dialog', { name: 'Tracky' })
  const box = dialog.getByLabel('Message Tracky')
  await box.fill('Client meeting or the report first?')
  await box.press('Enter')

  const answer = dialog.locator('p.whitespace-pre-wrap', { hasText: 'Do the report first.' })
  await expect(answer).toBeVisible()
  // Line breaks in an answer are kept.
  expect(await answer.evaluate((el) => (el as HTMLElement).innerText)).toBe('Do the report first.\n- It is due tonight and marked high.')
  await expect(dialog.getByRole('button', { name: /^Add / })).toHaveCount(0)
  expect(bodies[0].schedule).toContainEqual(expect.objectContaining({ title: `${PREFIX}send the report`, priority: 'high' }))

  await page.keyboard.press('Escape')
  await page.goto('/settings')
  await page.getByLabel('Let Tracky see your schedule').uncheck()
  await page.getByRole('link', { name: 'Home' }).first().click()
  await page.keyboard.press('ControlOrMeta+k')
  await box.fill('And tomorrow?')
  await box.press('Enter')
  await expect.poll(() => bodies.length).toBe(2)
  expect(bodies[1].schedule).toEqual([])
  await page.evaluate(() => localStorage.removeItem('dt-tracky-schedule'))
})

test('the chat survives a reload, /compact shrinks it to a summary that keeps the drafts, and /clear empties it', async ({ page }) => {
  const day = jakartaDay(4)
  const call = {
    kind: 'event',
    title: `${PREFIX}call the supplier`,
    date: day,
    time: '09:00',
    end_time: null,
    all_day: false,
    priority: 'medium',
    project: null,
    remind_minutes_before: null,
    location: null,
  }
  const bodies: {
    text: string
    compact?: boolean
    history: { role: string; text: string }[]
    drafts: { title: string }[]
  }[] = []
  // The first compaction comes back without a summary, as a confused model's answer might.
  let summaries = 0
  await page.route('**/functions/v1/tracky', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const body = route.request().postDataJSON()
    bodies.push(body)
    const compacting = body.text.startsWith('Summarise our chat')
    const summary = compacting && summaries++ > 0
    await route.fulfill({
      headers: CORS,
      json: summary
        ? { model: 'fake-model', reply: '- You asked for a supplier call.\n- It is drafted, not added yet.', items: [] }
        : { model: 'fake-model', reply: null, items: [call] },
    })
  })

  await page.goto('/')
  await page.keyboard.press('ControlOrMeta+k')
  const dialog = page.getByRole('dialog', { name: 'Tracky' })
  const box = dialog.getByLabel('Message Tracky')
  await box.fill('call the supplier Thursday 9am')
  await box.press('Enter')
  await expect(dialog.getByRole('region', { name: call.title })).toBeVisible()

  // Kept on this device: a reload brings back the message and the unsaved draft.
  await page.reload()
  await page.keyboard.press('ControlOrMeta+k')
  await expect(dialog.getByText('call the supplier Thursday 9am')).toBeVisible()
  await expect(dialog.getByRole('region', { name: call.title })).toBeVisible()

  // Typing / lists the commands. "/c" could be either, so Enter fills in the highlighted one rather
  // than sending it; the arrow keys move the highlight.
  await box.fill('/c')
  const commands = dialog.getByRole('listbox', { name: 'Commands' })
  await expect(commands.getByRole('option')).toHaveText([/\/compact/, /\/clear/])
  await box.press('ArrowDown')
  await expect(commands.getByRole('option', { selected: true })).toContainText('/clear')
  await box.press('ArrowUp')
  await box.press('Enter')
  await expect(box).toHaveValue('/compact')
  expect(bodies).toHaveLength(1)

  // A compaction that brings back no summary leaves the chat as it was.
  await box.press('Enter')
  await expect(
    dialog.getByText('Couldn’t compact the chat, so it’s unchanged. Tracky didn’t send a summary.', { exact: true }),
  ).toBeVisible()
  await expect(dialog.getByText('call the supplier Thursday 9am')).toBeVisible()
  expect(bodies.at(-1)!.compact).toBe(true)

  // /compact runs instead of being sent as a message; Tab finishes the name. A draft opened for
  // editing stays open through it.
  await dialog.getByRole('button', { name: `Edit ${call.title}` }).click()
  await box.fill('/co')
  await box.press('Tab')
  await expect(box).toHaveValue('/compact')
  await box.press('Enter')
  await expect(dialog.getByText('Earlier chat, compacted')).toBeVisible()
  await expect(dialog.getByText('call the supplier Thursday 9am')).toHaveCount(0)
  expect(bodies.at(-1)!.text).toMatch(/^Summarise our chat/)
  expect(bodies.at(-1)!.drafts.map((d) => d.title)).toEqual([call.title])
  // The drafts survive the compaction, and the summary is what Tracky remembers next time.
  await expect(dialog.getByRole('region', { name: call.title })).toBeVisible()
  await expect(dialog.getByRole('button', { name: `Done editing ${call.title}` })).toHaveAttribute('aria-expanded', 'true')
  await box.fill('thanks')
  await box.press('Enter')
  await expect.poll(() => bodies.length).toBe(4)
  expect(bodies[3].history[0]).toEqual({
    role: 'tracky',
    text: 'Summary of our chat so far:\n- You asked for a supplier call.\n- It is drafted, not added yet.',
  })

  await expect(dialog.getByRole('region', { name: call.title })).toBeVisible()
  page.once('dialog', (d) => d.accept())
  await box.fill('/clear')
  await box.press('Enter')
  await expect(dialog.getByRole('heading', { name: 'What’s coming up?' })).toBeVisible()
  await page.reload()
  await page.keyboard.press('ControlOrMeta+k')
  await expect(dialog.getByRole('heading', { name: 'What’s coming up?' })).toBeVisible()
})
