import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { asOwner, PREFIX } from './helpers.ts'

test.afterEach(async ({ page }) => {
  await (await asOwner(page)).cleanUp()
})

test('Download a copy saves everything as one JSON file', async ({ page }) => {
  await page.goto('/')
  const task = await (await asOwner(page)).addTask({ title: `${PREFIX}task to export` })

  await page.goto('/settings')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download a copy' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^daily-tracker-\d{4}-\d{2}-\d{2}\.json$/)

  const data = JSON.parse(await readFile(await download.path(), 'utf8'))
  expect(Object.keys(data)).toEqual(
    expect.arrayContaining(['version', 'exported_at', 'tasks', 'events', 'notes', 'projects', 'quick_links', 'settings']),
  )
  expect(data.tasks.map((t: { title: string }) => t.title)).toContain(task.title)
  // Only preferences, nothing that identifies the account beyond your display name.
  expect(Object.keys(data.settings).sort()).toEqual(
    ['created_at', 'digest_enabled', 'digest_time', 'display_name', 'timezone', 'weekly_day', 'weekly_enabled', 'weekly_time'],
  )
})

test('Restore from a backup adds back only what is missing, and a finished task keeps when it was finished', async ({ page }) => {
  await page.goto('/')
  const db = await asOwner(page)
  const done = await db.addTask({ title: `${PREFIX}finished before the backup`, status: 'done' })
  const [before] = (await db.tasksTitled(done.title)) as (typeof done & { completed_at: string })[]

  await page.goto('/settings')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download a copy' }).click()])
  const file = await download.path()

  // Lose the task, and add one the backup doesn't know about.
  await db.cleanUp()
  const newer = await db.addTask({ title: `${PREFIX}added after the backup` })

  await page.getByLabel('Backup file').setInputFiles(file)
  const panel = page.getByRole('region', { name: 'Restore from a backup' })
  await expect(panel).toContainText('1 task isn’t in your tracker now')
  await panel.getByRole('button', { name: 'Restore 1 item' }).click()
  await expect(page.getByText('Restored 1 task')).toBeVisible()
  await expect(panel).toHaveCount(0)

  const [restored] = (await db.tasksTitled(done.title)) as (typeof done & { completed_at: string })[]
  expect(restored.id).toBe(done.id)
  expect(restored.status).toBe('done')
  expect(Date.parse(restored.completed_at)).toBe(Date.parse(before.completed_at))
  // What was added since is left alone.
  expect(await db.tasksTitled(newer.title)).toHaveLength(1)

  // The same file again has nothing left to add.
  await page.getByLabel('Backup file').setInputFiles(file)
  await expect(panel).toContainText('Everything in it is already in your tracker')
})

test('Restore says plainly when a file is not a backup', async ({ page }) => {
  await page.goto('/settings')
  await page.getByLabel('Backup file').setInputFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"hello": 1}') })
  await expect(page.getByRole('alert')).toContainText('That file isn’t a Daily Tracker backup')
})
