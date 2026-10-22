import type { NativeReminder, TodayItem } from './native'
import { todaySummary, upcomingReminders, upcomingSummaries } from './reminders'
import type { CalEvent, Profile, TaskSummary } from './types'

/** The Mac or iPhone app's own switches, which live on that device (Settings → Mac app or iPhone app). */
export interface NativeSwitches {
  reminders: boolean
  badge: boolean
}

export interface NativePlan {
  /** Reminders and the next summaries, nearest first, for the system to keep. */
  reminders: NativeReminder[]
  /** Tasks not done yet: a snoozed reminder for any other task is cancelled. */
  openTasks: string[]
  /** The number on the app icon. */
  badge: number
  overdue: number
  today: TodayItem[]
}

/**
 * What a native app should hand to the system, worked out from your tasks and events. The page runs
 * it while it's open (components/MacAppBridge.tsx), and the iPhone app runs the same code in the
 * background (src/native/plan.ts), so both always schedule the same reminders.
 */
export function planForNative(
  tasks: TaskSummary[],
  events: CalEvent[],
  profile: Profile,
  switches: NativeSwitches,
  now: Date,
): NativePlan {
  const list = switches.reminders
    ? [...upcomingReminders(tasks, events, now), ...upcomingSummaries(tasks, events, profile, now)]
    : []
  const { overdue, items } = todaySummary(tasks, events, now)
  return {
    reminders: list.sort((a, b) => a.at - b.at),
    openTasks: switches.reminders ? tasks.filter((t) => t.status !== 'done').map((t) => t.id) : [],
    badge: switches.badge ? overdue : 0,
    overdue,
    today: items,
  }
}
