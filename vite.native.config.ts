import path from 'node:path'
import { defineConfig } from 'vite'

// The reminder planner as one plain script for the iPhone app's background refresh (src/native/plan.ts).
// It exposes DailyTrackerPlan.plan(json) as a global, which JavaScriptCore can call.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  // Only the script; the web build's icons belong to the page.
  publicDir: false,
  build: {
    outDir: 'build/native',
    emptyOutDir: true,
    lib: {
      entry: 'src/native/plan.ts',
      name: 'DailyTrackerPlan',
      formats: ['iife'],
      fileName: () => 'plan.js',
    },
  },
})
