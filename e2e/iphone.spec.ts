import { expect, test } from '@playwright/test'

// The iPhone app, faked: what ios/DailyTracker/DailyTracker.swift puts on window before the page runs.
// The sign-in starts in the page's storage, as it was before v1.11 kept it in the app.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const kept = new Map<string, string>()
    const w = window as unknown as Record<string, unknown>
    w.__kept = kept
    w.__posted = []
    w.dailyTrackerPlatform = 'ios'
    w.webkit = {
      messageHandlers: {
        dailyTracker: { postMessage: (m: unknown) => (w.__posted as unknown[]).push(m) },
        dailyTrackerSession: {
          postMessage: async (m: { op: string; key: string; value?: string }) => {
            if (m.op === 'get') return kept.get(m.key) ?? null
            if (m.op === 'set') kept.set(m.key, m.value ?? '')
            if (m.op === 'remove') kept.delete(m.key)
            return null
          },
        },
      },
    }
  })
})

test('in the iPhone app the sign-in moves into the app, and the page stays signed in', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Home' })).toBeVisible()

  const where = await page.evaluate(() => ({
    app: [...((window as unknown as { __kept: Map<string, string> }).__kept.keys())],
    page: Object.keys(localStorage).filter((k) => k.endsWith('-auth-token')),
  }))
  expect(where.app).toEqual([expect.stringMatching(/-auth-token$/)])
  expect(where.page).toEqual([])

  // The app is told what its background refresh needs: this phone's switches and where the data is.
  const native = await page.evaluate(() =>
    (window as unknown as { __posted: { type: string }[] }).__posted.find((m) => m.type === 'native'),
  )
  expect(native).toMatchObject({ switches: { reminders: true, badge: true }, supabaseUrl: expect.stringContaining('127.0.0.1') })

  // Settings speaks of the iPhone, not the Mac.
  await page.getByRole('link', { name: 'Settings' }).first().click()
  await expect(page.getByRole('heading', { name: 'iPhone app' })).toBeVisible()
  await expect(page.getByText('Show reminders as iPhone notifications')).toBeVisible()
  await expect(page.getByText('Also alert me on my iPhone')).toHaveCount(0)
})
