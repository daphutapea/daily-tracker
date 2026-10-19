import type { TaskPriority, TaskStatus } from './types'

/** One color per status, the same on Home, the board and the charts (DESIGN.md, Color). */
export const STATUS_COLOR: Record<TaskStatus, string> = {
  todo: 'bg-ink-3',
  in_progress: 'bg-progress',
  waiting: 'bg-waiting',
  done: 'bg-ok',
}

/** Hottest to coolest: the same order the priority tags use. */
export const PRIORITY_COLOR: Record<TaskPriority, string> = {
  urgent: 'bg-danger',
  high: 'bg-warn',
  medium: 'bg-ink-2',
  low: 'bg-ink-3',
}
