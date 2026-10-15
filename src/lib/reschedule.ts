import { format, isSameDay, nextMonday, set } from 'date-fns'
import { toast } from 'sonner'
import { toDate } from './dates'
import { quietly, useRescheduleTasks, type TaskTiming } from './queries'
import type { TaskSummary } from './types'

/** The same time of day on `day`. A reminder keeps its distance from the deadline. */
export function moveToDay(task: TaskTiming, day: Date): TaskTiming {
  if (!task.due_at) return task
  const due = toDate(task.due_at)
  const next = set(day, { hours: due.getHours(), minutes: due.getMinutes(), seconds: 0, milliseconds: 0 })
  const shift = next.getTime() - due.getTime()
  return {
    id: task.id,
    due_at: next.toISOString(),
    remind_at: task.remind_at ? new Date(toDate(task.remind_at).getTime() + shift).toISOString() : null,
  }
}

/** The Monday after `now`, for carrying a week's leftovers into the next one. */
export const nextWeekStart = (now: Date) => nextMonday(now)

/** "tomorrow", or "Monday 19 Oct". */
export function dayName(day: Date, now: Date) {
  return isSameDay(day, new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)) ? 'tomorrow' : format(day, 'EEEE d MMM')
}

/**
 * Moves tasks to another day and offers Undo, which puts every deadline and reminder back exactly
 * as it was. It waits on the save's promise rather than mutate()'s callbacks, because the row that
 * asked usually unmounts as its task moves to another list, and those callbacks die with it.
 */
export function useMoveTasks() {
  const reschedule = useRescheduleTasks()
  return (tasks: TaskSummary[], day: Date, now = new Date()) => {
    const movable = tasks.filter((t) => t.due_at)
    if (movable.length === 0) return
    const before = movable.map(({ id, due_at, remind_at }) => ({ id, due_at, remind_at }))
    const label =
      movable.length === 1 ? `Moved “${movable[0].title}” to ${dayName(day, now)}` : `Moved ${movable.length} tasks to ${dayName(day, now)}`
    const undo = quietly(async () => {
      await reschedule.mutateAsync(before)
      toast(movable.length === 1 ? 'Moved it back' : 'Moved them back')
    })
    quietly(async () => {
      await reschedule.mutateAsync(movable.map((t) => moveToDay(t, day)))
      // Long enough to notice the move and reach the button; Sonner's default is 4 seconds.
      toast.success(label, { duration: 8000, action: { label: 'Undo', onClick: undo } })
    })()
  }
}
