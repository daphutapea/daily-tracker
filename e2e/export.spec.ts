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
  // Telegram link details stay out of the file.
  expect(Object.keys(data.settings)).not.toContain('telegram_chat_id')
})
