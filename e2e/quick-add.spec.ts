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
  await page.route('**/functions/v1/quick-add', async (route) => {
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
  await page.route('**/functions/v1/quick-add', async (route) => {
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

test('Tracky answers a planning question from your schedule, and the schedule stays home when turned off', async ({ page }) => {
  await page.goto('/')
  const db = await asOwner(page)
  const today = jakartaDay(0)
  await db.addTask({ title: `${PREFIX}send the report`, due_at: jakarta(today, '23:00'), priority: 'high' })

  const bodies: { schedule: { title: string; priority?: string }[] }[] = []
  await page.route('**/functions/v1/quick-add', async (route) => {
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
