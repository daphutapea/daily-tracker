import { expect, test } from '@playwright/test'

test('the sidebar folds into a rail and back, resizes by its edge, and remembers both', async ({ page }) => {
  await page.goto('/')
  const sidebar = page.locator('aside')
  const width = async () => Math.round((await sidebar.boundingBox())!.width)
  await expect.poll(width).toBe(240)

  await page.getByRole('button', { name: 'Close sidebar' }).click()
  await expect.poll(width).toBe(60)
  // The rail keeps every destination, by name, but not the Edit link it has no room to show.
  await expect(page.getByRole('navigation', { name: 'Main' }).first().getByRole('link', { name: 'Tasks' })).toBeVisible()
  await expect(sidebar.getByRole('link', { name: 'Edit' })).toHaveCount(0)
  await page.reload()
  await expect.poll(width).toBe(60)

  await page.keyboard.press('ControlOrMeta+Backslash')
  await expect.poll(width).toBe(240)

  const edge = page.getByRole('separator', { name: 'Sidebar width' })
  const box = (await edge.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + 300)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + 300, { steps: 5 })
  await page.mouse.up()
  await expect.poll(width).toBe(320)
  await page.reload()
  await expect.poll(width).toBe(320)

  // Keyboard: the edge is a separator the arrow keys move; double-click puts the standard width back.
  await edge.focus()
  await page.keyboard.press('ArrowLeft')
  await expect.poll(width).toBe(304)
  await page.keyboard.press('Home')
  await expect.poll(width).toBe(60)
  await page.keyboard.press('ArrowLeft')
  await expect.poll(width).toBe(60)
  await page.keyboard.press('ArrowRight')
  await expect.poll(width).toBe(304)
  await edge.dblclick()
  await expect.poll(width).toBe(240)

  // A wide sidebar gives way to the page: it is never more than 28% of the window (358px of 1280).
  await page.keyboard.press('End')
  await expect.poll(width).toBe(358)
  await page.setViewportSize({ width: 900, height: 720 })
  await expect.poll(width).toBe(252)
  await page.keyboard.press('ArrowLeft')
  await expect.poll(width).toBe(236)
})
