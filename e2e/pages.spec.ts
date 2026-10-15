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
    ['Home', /^Good (morning|afternoon|evening)/],
  ] as const) {
    await nav.getByRole('link', { name: link, exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
  }
})
