import { expect, test } from '@playwright/test'
import { asOwner, jakarta, jakartaDay, PREFIX } from './helpers.ts'

test.afterEach(async ({ page }) => {
  await (await asOwner(page)).cleanUp()
})

test('a task added from Home can be ticked done', async ({ page }) => {
  const title = `${PREFIX}send the weekly report`
  await page.goto('/')
  await page.getByRole('button', { name: 'Add task' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'New task' })
  await dialog.getByLabel('Title').fill(title)
  await dialog.getByRole('button', { name: 'Add task' }).click()
  await expect(dialog).toBeHidden()

  await page.getByRole('checkbox', { name: `Mark “${title}” as done` }).first().click()
  await expect(page.getByRole('checkbox', { name: `Mark “${title}” as not done` }).first()).toBeVisible()
  await expect.poll(async () => (await (await asOwner(page)).tasksTitled(title))[0]?.status).toBe('done')
})

test('Tomorrow moves an overdue task with its reminder, and Undo puts both back', async ({ page }) => {
  await page.goto('/')
  const db = await asOwner(page)
  const yesterday = jakartaDay(-1)
  const tomorrow = jakartaDay(1)
  const task = await db.addTask({
    title: `${PREFIX}send the vendor invoice`,
    due_at: jakarta(yesterday, '16:00'),
    remind_at: jakarta(yesterday, '15:30'),
  })
  await page.reload()

  await page.getByRole('button', { name: `Move “${task.title}” to tomorrow` }).first().click()
  await expect(page.getByText(`Moved “${task.title}” to tomorrow`)).toBeVisible()
  let row = await db.task(task.id)
  expect(Date.parse(row.due_at!)).toBe(Date.parse(jakarta(tomorrow, '16:00')))
  expect(Date.parse(row.remind_at!)).toBe(Date.parse(jakarta(tomorrow, '15:30')))

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByText('Moved it back')).toBeVisible()
  row = await db.task(task.id)
  expect(Date.parse(row.due_at!)).toBe(Date.parse(task.due_at!))
  expect(Date.parse(row.remind_at!)).toBe(Date.parse(task.remind_at!))
})

test('Move all to tomorrow moves every overdue task at once', async ({ page }) => {
  await page.goto('/')
  const db = await asOwner(page)
  const tomorrow = jakartaDay(1)
  const a = await db.addTask({ title: `${PREFIX}first overdue`, due_at: jakarta(jakartaDay(-2), '09:00') })
  const b = await db.addTask({ title: `${PREFIX}second overdue`, due_at: jakarta(jakartaDay(-1), '17:30') })
  await page.reload()

  await page.getByRole('button', { name: 'Move all to tomorrow' }).first().click()
  await expect(page.getByText(/^Moved \d+ tasks to tomorrow$/)).toBeVisible()
  expect(Date.parse((await db.task(a.id)).due_at!)).toBe(Date.parse(jakarta(tomorrow, '09:00')))
  expect(Date.parse((await db.task(b.id)).due_at!)).toBe(Date.parse(jakarta(tomorrow, '17:30')))
  // Put back anything else that was overdue in the local database.
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByText('Moved them back')).toBeVisible()
})

test('a deleted task comes back exactly as it was with Undo', async ({ page }) => {
  await page.goto('/')
  const db = await asOwner(page)
  const task = await db.addTask({
    title: `${PREFIX}task to delete`,
    priority: 'high',
    due_at: jakarta(jakartaDay(2), '11:00'),
    remind_at: jakarta(jakartaDay(2), '10:00'),
  })

  await page.goto(`/?task=${task.id}`)
  const dialog = page.getByRole('dialog', { name: 'Edit task' })
  await dialog.getByRole('button', { name: 'Delete' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText(`Deleted “${task.title}”`)).toBeVisible()
  expect(await db.task(task.id)).toBeUndefined()

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByText('Restored')).toBeVisible()
  expect(await db.task(task.id)).toEqual(task)
})
