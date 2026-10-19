import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react'
import { addDays, format, isSameDay, isSameMonth, isValid, parseISO, startOfWeek } from 'date-fns'
import { useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { FinishedPerDay } from '@/components/Charts'
import { TaskRow } from '@/components/TaskRow'
import { Loading, QueryError, StateMessage } from '@/components/ui'
import { toDate, WEEK_STARTS_ON } from '@/lib/dates'
import { useDialogs } from '@/lib/dialogs'
import { useEvents, useProjects, useTasks } from '@/lib/queries'
import { dayName, nextWeekStart, useMoveTasks } from '@/lib/reschedule'
import type { CalEvent, TaskSummary } from '@/lib/types'
import { useNow } from '@/lib/useNow'

const inRange = (iso: string | null, from: Date, to: Date) => {
  if (!iso) return false
  const d = toDate(iso)
  return d >= from && d < to
}

function weekLabel(monday: Date) {
  const sunday = addDays(monday, 6)
  return isSameMonth(monday, sunday)
    ? `${format(monday, 'd')} to ${format(sunday, 'd MMMM yyyy')}`
    : `${format(monday, 'd MMM')} to ${format(sunday, 'd MMM yyyy')}`
}

/** One week at a time: what got finished, which deadlines slipped, and what the next week holds. */
export function ReviewPage() {
  const [params, setParams] = useSearchParams()
  const tasks = useTasks()
  const events = useEvents()
  const projects = useProjects()
  const { openTask, openEvent } = useDialogs()
  const moveTasks = useMoveTasks()

  const now = useNow()
  const thisMonday = startOfWeek(now, { weekStartsOn: WEEK_STARTS_ON })
  const requested = params.get('week') ? parseISO(params.get('week')!) : null
  const monday = requested && isValid(requested) ? startOfWeek(requested, { weekStartsOn: WEEK_STARTS_ON }) : thisMonday
  const nextMonday = addDays(monday, 7)
  const isCurrent = isSameDay(monday, thisMonday)
  const notStarted = monday > now

  const [dir, setDir] = useState<'next' | 'prev'>()
  const goTo = (d: Date) => {
    setDir(d > monday ? 'next' : d < monday ? 'prev' : dir)
    setParams(isSameDay(d, thisMonday) ? {} : { week: format(d, 'yyyy-MM-dd') }, { replace: true })
  }

  const projectById = useMemo(() => new Map(projects.data?.map((p) => [p.id, p])), [projects.data])
  // A few filters over your tasks; cheap enough to run on every render.
  const week = summarizeWeek(tasks.data ?? [], events.data ?? [], monday, now)

  const n = week.finished.length
  const stillOpen = week.slipped.filter((t) => t.status !== 'done')
  const carryTo = nextWeekStart(now)
  const summary = notStarted
    ? 'This week hasn’t started yet. Deadlines and events already planned for the week after it are below.'
    : `You finished ${n} ${n === 1 ? 'task' : 'tasks'}${isCurrent ? ' so far' : ''}. ${
        week.slipped.length === 0
          ? 'No deadlines slipped.'
          : `${week.slipped.length} ${week.slipped.length === 1 ? 'deadline' : 'deadlines'} slipped.`
      }`

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Weekly review</h1>
          <p className="text-ink-2" aria-live="polite">
            {isCurrent ? 'This week, ' : ''}
            {weekLabel(monday)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Previous week" onClick={() => goTo(addDays(monday, -7))}>
            <CaretLeftIcon size={16} weight="bold" />
          </button>
          <button type="button" className="btn btn-quiet" disabled={isCurrent} onClick={() => goTo(thisMonday)}>
            This week
          </button>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Next week" onClick={() => goTo(nextMonday)}>
            <CaretRightIcon size={16} weight="bold" />
          </button>
        </div>
      </div>

      {tasks.isPending || events.isPending ? (
        <Loading what="your week" />
      ) : tasks.isError || events.isError ? (
        <QueryError
          what="your week"
          error={tasks.error ?? events.error}
          retry={() => {
            tasks.refetch()
            events.refetch()
          }}
        />
      ) : (
        <div key={format(monday, 'yyyy-MM-dd')} data-dir={dir} className="slide-in space-y-6">
          <p className="text-base">{summary}</p>

          <div className="grid gap-6 lg:grid-cols-12">
            <div className="panel p-4 lg:col-span-5">
              <FinishedPerDay days={week.days} counts={week.counts} caption={`${format(monday, 'EEE d MMM')} to ${format(addDays(monday, 6), 'EEE d MMM')}`} />
            </div>
            <ReviewPanel className="lg:col-span-7" title="Finished" count={week.finished.length}>
              {week.finished.length === 0 ? (
                <p className="px-4 py-6 text-center text-ink-2">
                  {notStarted ? 'Nothing yet.' : 'Nothing was marked done this week.'}
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {week.finished.map((t) => (
                    <TaskRow key={t.id} task={t} project={projectById.get(t.project_id ?? '')} onOpen={openTask} />
                  ))}
                </ul>
              )}
            </ReviewPanel>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <ReviewPanel
              title="Slipped"
              count={week.slipped.length}
              hint="Deadlines this week that passed before the task was done."
              action={
                stillOpen.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-quiet"
                    onClick={() => moveTasks(stillOpen, carryTo, now)}
                  >
                    Move {stillOpen.length === 1 ? 'the open one' : `${stillOpen.length} open`} to {dayName(carryTo, now)}
                  </button>
                )
              }
            >
              {week.slipped.length === 0 ? (
                <p className="px-4 py-6 text-center text-ink-2">Every deadline that has passed this week was met.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {week.slipped.map((t) => (
                    <TaskRow key={t.id} task={t} project={projectById.get(t.project_id ?? '')} onOpen={openTask} now={now} />
                  ))}
                </ul>
              )}
            </ReviewPanel>
            <ReviewPanel title={`The week after, ${format(nextMonday, 'd MMM')} on`} count={week.coming.length}>
              {week.coming.length === 0 ? (
                <StateMessage title="Nothing planned yet." body="Deadlines and events for that week will show up here." />
              ) : (
                <ul className="divide-y divide-line">
                  {week.coming.map((item) =>
                    item.kind === 'task' ? (
                      <ComingRow key={item.task.id} at={item.at} title={item.task.title} onOpen={() => openTask(item.task.id)} />
                    ) : (
                      <ComingRow
                        key={item.event.id}
                        at={item.at}
                        label={item.event.all_day ? 'All day' : undefined}
                        title={item.event.title}
                        onOpen={() => openEvent(item.event.id)}
                        event={item.event}
                      />
                    ),
                  )}
                </ul>
              )}
            </ReviewPanel>
          </div>
        </div>
      )}
    </div>
  )
}

function summarizeWeek(all: TaskSummary[], events: CalEvent[], monday: Date, now: Date) {
  const nextMonday = addDays(monday, 7)
  const finished = all
    .filter((t) => inRange(t.completed_at, monday, nextMonday))
    .sort((a, b) => a.completed_at!.localeCompare(b.completed_at!))
  // A deadline slipped if it fell in this week, has passed, and the task wasn't done in time.
  const slipped = all
    .filter(
      (t) =>
        inRange(t.due_at, monday, nextMonday) &&
        toDate(t.due_at!) < now &&
        (t.status !== 'done' || (t.completed_at !== null && t.completed_at > t.due_at!)),
    )
    .sort((a, b) => a.due_at!.localeCompare(b.due_at!))
  const after = addDays(nextMonday, 7)
  const coming = [
    ...all
      .filter((t) => t.status !== 'done' && inRange(t.due_at, nextMonday, after))
      .map((t) => ({ kind: 'task' as const, at: t.due_at!, task: t })),
    ...events
      .filter((e) => inRange(e.starts_at, nextMonday, after))
      .map((e) => ({ kind: 'event' as const, at: e.starts_at, event: e })),
  ].sort((a, b) => a.at.localeCompare(b.at))
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const counts = days.map((d) => finished.filter((t) => isSameDay(toDate(t.completed_at!), d)).length)
  return { finished, slipped, coming, days, counts }
}

function ReviewPanel({
  title,
  count,
  hint,
  action,
  children,
  className = '',
}: {
  title: string
  count: number
  hint?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`panel overflow-hidden ${className}`} aria-label={title}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b border-line px-4 pt-3 pb-2">
        <div>
          <h2 className="font-semibold">
            {title} <span className="font-normal text-ink-3">· {count}</span>
          </h2>
          {hint && <p className="text-[13px] text-ink-3">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function ComingRow({
  at,
  label,
  title,
  onOpen,
  event,
}: {
  at: string
  label?: string
  title: string
  onOpen: () => void
  event?: CalEvent
}) {
  const d = toDate(at)
  return (
    <li>
      <button type="button" onClick={onOpen} className="row-hover flex w-full items-start gap-3 px-4 py-2.5 text-left">
        <span className="w-20 shrink-0 text-[13px] text-ink-2 tnum">
          {format(d, 'EEE d')}
          <span className="block text-ink-3">{label ?? format(d, 'HH:mm')}</span>
        </span>
        <span className="min-w-0">
          <span className="block break-words">{title}</span>
          <span className="text-[13px] text-ink-3">{event ? 'Event' : 'Deadline'}</span>
        </span>
      </button>
    </li>
  )
}
