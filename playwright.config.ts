import { defineConfig, devices } from '@playwright/test'

// Browser tests against the LOCAL Supabase stack (npx supabase start). The AI is faked in the tests,
// so they need no Gemini key and spend no free requests. Run with: npm run test:e2e
export default defineConfig({
  testDir: 'e2e',
  // One shared database, so one test at a time.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    // The app reads "today" from the device; pinning the zone keeps seeded dates and the page in step.
    timezoneId: 'Asia/Jakarta',
    locale: 'en-GB',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'sign in', testMatch: /auth\.setup\.ts/, use: { channel: 'chromium' } },
    {
      name: 'chromium',
      // The regular Chromium build in headless mode, so the separate headless-only browser isn't needed.
      use: { ...devices['Desktop Chrome'], channel: 'chromium', storageState: 'e2e/.auth/owner.json' },
      dependencies: ['sign in'],
    },
  ],
  webServer: {
    command: 'npx vite --mode localdb --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
})
