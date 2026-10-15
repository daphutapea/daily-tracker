import { expect, test } from '@playwright/test'
import { asOwner, jakarta, jakartaDay, PREFIX } from './helpers.ts'

test.afterEach(async ({ page }) => {
  await (await asOwner(page)).cleanUp()
})

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }

test('Quick add turns a note into drafts and saves only the ones you keep', async ({ page }) => {
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
  const dialog = page.getByRole('dialog', { name: 'Quick add' })
  await dialog.getByLabel('What’s coming up?').fill('Sync with Dennis 10 to 11, remind me 15 min before. Labelling sheet, high priority.')
  await dialog.getByRole('button', { name: 'Read it' }).click()

  await expect(dialog.getByRole('region', { name: event.title as string })).toBeVisible()
  expect(sentText).toContain('Dennis')
  await dialog.getByRole('button', { name: `Remove ${extra.title}` }).click()
  await dialog.getByRole('button', { name: 'Add 2 items' }).click()
  await expect(page.getByText('Added 2 items')).toBeVisible()

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
