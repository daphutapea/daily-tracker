// The iPhone app's background refresh runs this with JavaScriptCore, without a page: it fetches your
// tasks and events itself, then asks this what to schedule. Built by `npm run build:native` into
// build/native/plan.js, which the iPhone app carries (ios/DailyTracker/DailyTracker.swift).
import { planForNative, type NativeSwitches } from '../lib/nativePlan'
import type { CalEvent, Profile, TaskSummary } from '../lib/types'

interface Input {
  tasks: TaskSummary[]
  events: CalEvent[]
  profile: Profile
  switches: NativeSwitches
  /** Milliseconds since 1970. */
  now: number
}

/** Takes and returns JSON text, so nothing has to cross between Swift and JavaScript but strings. */
export function plan(input: string): string {
  const { tasks, events, profile, switches, now } = JSON.parse(input) as Input
  return JSON.stringify(planForNative(tasks, events, profile, switches, new Date(now)))
}
