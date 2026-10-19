import { BellIcon } from '@phosphor-icons/react'
import { addDays, startOfDay } from 'date-fns'
import { formatWhen, toDate } from '@/lib/dates'
import { useSetTaskStatus } from '@/lib/queries'
import { rowIn } from '@/lib/motion'
import { useMoveTasks } from '@/lib/reschedule'
import { useNow } from '@/lib/useNow'
import { statusLabel, type Project, type TaskSummary } from '@/lib/types'
import { PriorityTag, TaskCheck } from './ui'

export function TaskRow({
  task,
  project,
  onOpen,
  showStatus = true,
  timeOnly = false,
  now: nowProp,
}: {
  task: TaskSummary
  project?: Project
  onOpen: (id: string) => void
  showStatus?: boolean
  timeOnly?: boolean
  now?: Date
}) {
  const setStatus = useSetTaskStatus()
  const moveTasks = useMoveTasks()
  const ticking = useNow()
  const now = nowProp ?? ticking
  const done = task.status === 'done'
  const overdue = !done && task.due_at && toDate(task.due_at) < now
  const when = task.due_at
    ? timeOnly
      ? toDate(task.due_at).toTimeString().slice(0, 5)
      : formatWhen(task.due_at, now)
    : null

  return (
    <li className={`row-hover group flex items-start gap-3 px-4 py-2.5 transition-colors duration-150 ${rowIn(task.id)}`}>
      <div className="pt-px">
        <TaskCheck
          checked={done}
          label={done ? `Mark “${task.title}” as not done` : `Mark “${task.title}” as done`}
          onChange={(next) => setStatus.mutate({ id: task.id, status: next ? 'done' : 'todo' })}
        />
      </div>
      <button
        type="button"
        onClick={() => onOpen(task.id)}
        className="min-w-0 flex-1 text-left focus-visible:outline-offset-4 pointer-coarse:min-h-11"
      >
        <span
          className={`block break-words transition-colors duration-150 ${done ? 'text-ink-3 line-through' : 'text-ink'}`}
        >
          {task.title}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px]">
          {done && task.completed_at && !timeOnly && (
            <span className="tnum text-ink-3">Done {formatWhen(task.completed_at, now)}</span>
          )}
          {when && !(done && !timeOnly) && (
            <span className={`tnum ${overdue ? 'font-medium text-danger' : 'text-ink-2'}`}>
              {overdue ? `Overdue · ${when}` : when}
            </span>
          )}
          {task.remind_at && !done && (
            <span className="inline-flex items-center gap-1 text-ink-3" title="Reminder set">
              <BellIcon size={12} weight="bold" aria-hidden />
              <span className="sr-only">Reminder set</span>
            </span>
          )}
          {project && <span className="text-ink-3">{project.name}</span>}
          {showStatus && !done && task.status !== 'todo' && <span className="text-ink-2">{statusLabel(task.status)}</span>}
          {!done && <PriorityTag priority={task.priority} quiet />}
        </span>
      </button>
      {overdue && (
        <button
          type="button"
          className="press hit row-hover -my-0.5 shrink-0 rounded-[6px] px-2 py-1 text-[13px] font-medium text-ink-2"
          aria-label={`Move “${task.title}” to tomorrow`}
          onClick={() => moveTasks([task], addDays(startOfDay(now), 1), now)}
        >
          Tomorrow
        </button>
      )}
    </li>
  )
}

/** For the heading of an overdue list: moves every task in it to tomorrow, with Undo. */
export function MoveAllToTomorrow({ tasks, now }: { tasks: TaskSummary[]; now: Date }) {
  const moveTasks = useMoveTasks()
  if (tasks.length < 2) return null
  return (
    <button
      type="button"
      className="press hit row-hover-surface -my-1 shrink-0 rounded-[6px] px-2 py-1 text-[13px] font-medium text-ink-2"
      onClick={() => moveTasks(tasks, addDays(startOfDay(now), 1), now)}
    >
      Move all to tomorrow
    </button>
  )
}
