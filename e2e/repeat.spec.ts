import { expect, test } from '@playwright/test'
import { asOwner, jakarta, jakartaDay, PREFIX } from './helpers.ts'

test.afterEach(async ({ page }) => {
  await (await asOwner(page)).cleanUp()
})

test('finishing a repeating task adds the next one, and unticking takes it back', async ({ page }) => {
  await page.goto('/')
  const db = await asOwner(page)
  const tomorrow = jakartaDay(1)
  const title = `${PREFIX}weekly report`
  await db.addTask({ title, due_at: jakarta(tomorrow, '17:00'), remind_at: jakarta(tomorrow, '16:00'), repeat: 'weekly' } as never)

  await page.goto('/tasks')
  await page.getByRole('checkbox', { name: `Mark “${title}” as done` }).first().click()
  await expect(page.getByText(/^Done\. The next one is due /)).toBeVisible()

  const [finished, next] = await db.tasksTitledFull(title)
  expect(finished.status).toBe('done')
  expect(next.status).toBe('todo')
  expect(next.repeat).toBe('weekly')
  expect(Date.parse(next.due_at!)).toBe(Date.parse(jakarta(jakartaDay(8), '17:00')))
  // The reminder keeps its hour before the deadline.
  expect(Date.parse(next.remind_at!)).toBe(Date.parse(jakarta(jakartaDay(8), '16:00')))

  // A finished task leaves the Open list; untick it from Done.
  await page.goto('/tasks?show=done')
  await page.getByRole('checkbox', { name: `Mark “${title}” as not done` }).first().click()
  await expect.poll(async () => (await db.tasksTitledFull(title)).length).toBe(1)
})

test('a repeating event is written ahead as a series, and deleting this and later ones ends it', async ({ page }) => {
  const title = `${PREFIX}gym`
  const tomorrow = jakartaDay(1)
  await page.goto(`/calendar?date=${tomorrow}`)
  await page.getByRole('button', { name: 'Add event' }).click()
  const dialog = page.getByRole('dialog', { name: 'New event' })
  await dialog.getByLabel('Title').fill(title)
  await dialog.getByLabel('Starts').fill(`${tomorrow}T07:00`)
  await dialog.getByLabel('Repeat').selectOption({ label: 'Every week' })
  await dialog.getByRole('button', { name: 'Add event' }).click()
  await expect(page.getByText('Event added, repeating every week')).toBeVisible()

  const db = await asOwner(page)
  const written = await db.seriesEvents(title)
  // About three months ahead: thirteen or fourteen weeks.
  expect(written.length).toBeGreaterThanOrEqual(13)
  expect(written.length).toBeLessThanOrEqual(14)
  expect(new Set(written.map((e) => e.series_id)).size).toBe(1)
  expect(Date.parse(written[1].starts_at)).toBe(Date.parse(jakarta(jakartaDay(8), '07:00')))

  // Open the third occurrence and delete it with every later one.
  await page.goto(`/calendar?date=${jakartaDay(15)}`)
  await page.getByRole('button', { name: new RegExp(title) }).first().click()
  const edit = page.getByRole('dialog', { name: 'Edit event' })
  await expect(edit.getByLabel('Repeat')).toHaveValue('weekly')
  await edit.getByRole('button', { name: 'This and later ones' }).click()
  await edit.getByRole('button', { name: 'Delete this event and every later one' }).click()
  await expect(page.getByText(new RegExp(`^Deleted \\d+ of “${title}”$`))).toBeVisible()
  const left = await db.seriesEvents(title)
  expect(left).toHaveLength(2)
  const [series] = await db.series(written[0].series_id!)
  expect(Date.parse(series.ends_before!)).toBe(Date.parse(written[2].starts_at))

  // Undo brings them all back, and the series runs on again.
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect.poll(async () => (await db.seriesEvents(title)).length).toBe(written.length)
  expect((await db.series(written[0].series_id!))[0].ends_before).toBeNull()
})

test('changing this and later ones splits the series: earlier ones keep their time', async ({ page }) => {
  const title = `${PREFIX}swim`
  const tomorrow = jakartaDay(1)
  await page.goto(`/calendar?date=${tomorrow}`)
  await page.getByRole('button', { name: 'Add event' }).click()
  const dialog = page.getByRole('dialog', { name: 'New event' })
  await dialog.getByLabel('Title').fill(title)
  await dialog.getByLabel('Starts').fill(`${tomorrow}T07:00`)
  await dialog.getByLabel('Repeat').selectOption({ label: 'Every week' })
  await dialog.getByRole('button', { name: 'Add event' }).click()
  await expect(page.getByText('Event added, repeating every week')).toBeVisible()
  const db = await asOwner(page)
  const before = await db.seriesEvents(title)

  await page.goto(`/calendar?date=${jakartaDay(8)}`)
  await page.getByRole('button', { name: new RegExp(title) }).first().click()
  const edit = page.getByRole('dialog', { name: 'Edit event' })
  await edit.getByLabel('Starts').fill(`${jakartaDay(8)}T08:00`)
  await edit.getByRole('button', { name: 'This and later ones' }).click()
  await edit.getByRole('button', { name: 'Save event' }).click()
  await expect(page.getByText('Saved this event and every later one')).toBeVisible()

  const after = await db.seriesEvents(title)
  expect(after).toHaveLength(before.length)
  expect(Date.parse(after[0].starts_at)).toBe(Date.parse(jakarta(tomorrow, '07:00')))
  expect(Date.parse(after[1].starts_at)).toBe(Date.parse(jakarta(jakartaDay(8), '08:00')))
  expect(Date.parse(after[2].starts_at)).toBe(Date.parse(jakarta(jakartaDay(15), '08:00')))
  // Two series now: the first event's, ended before the change, and the new one.
  expect(after[0].series_id).not.toBe(after[1].series_id)
  expect(new Set(after.slice(1).map((e) => e.series_id)).size).toBe(1)
})
