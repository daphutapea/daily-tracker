import { expect, test } from '@playwright/test'

test('every page opens from the sidebar', async ({ page }) => {
  await page.goto('/')
  const nav = page.getByRole('navigation').first()
  for (const [link, heading] of [
    ['Tasks', 'Tasks'],
    ['Notes', 'Notes'],
    ['Calendar', 'Calendar'],
    ['Review', 'Weekly review'],
    ['Links', 'Links'],
    ['Settings', 'Settings'],
    // Any greeting: it depends on the hour, and before 05:00 it's "Good night".
    ['Home', /^Good (night|morning|afternoon|evening)\b/],
  ] as const) {
    await nav.getByRole('link', { name: link, exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
  }
})
