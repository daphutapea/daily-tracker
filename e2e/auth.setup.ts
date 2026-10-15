import { expect, test as setup } from '@playwright/test'
import { LOCAL_EMAIL, LOCAL_PASSWORD } from '../scripts/local-user.mjs'

// Signs in once through the real form and saves the session for every other test.
setup('sign in as the local owner', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Email').fill(LOCAL_EMAIL)
  await page.getByLabel('Password').fill(LOCAL_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Home' })).toBeVisible()
  await page.context().storageState({ path: 'e2e/.auth/owner.json' })
})
