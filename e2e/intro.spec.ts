import { expect, test } from '@playwright/test'

// The shared session turns the intro off (auth.setup.ts); these tests turn it back on.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('dt-intro'))
})

test('the intro plays when the app opens and ends by itself', async ({ page }) => {
  await page.goto('/')
  const intro = page.locator('.intro')
  await expect(intro).toBeVisible()
  await expect(intro).toContainText('Daily Tracker')
  await expect(intro).toHaveCount(0, { timeout: 4000 })
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Home' })).toBeVisible()
})

test('a key press skips the intro, and it plays once per session', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.intro')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.intro')).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Home' })).toBeVisible()
  await expect(page.locator('.intro')).toHaveCount(0)
})
