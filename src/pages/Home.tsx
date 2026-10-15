import { CalendarBlankIcon, NotePencilIcon, PlusIcon } from '@phosphor-icons/react'
import { addDays, format, isSameDay, startOfDay } from 'date-fns'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { Breakdown, FinishedPerDay, Meter } from '@/components/Charts'
import { DayRuler } from '@/components/DayRuler'
import { MiniMonth } from '@/components/MiniMonth'
import { TaskRow } from '@/components/TaskRow'
import { Loading, QueryError, SiteIcon, StateMessage } from '@/components/ui'
import { formatDay, greeting, lastNDays, sameDay, toDate, weekRange } from '@/lib/dates'
import { useDialogs } from '@/lib/dialogs'
import { quietly, useCreateNote, useEvents, useProfile, useProjects, useQuickLinks, useTasks } from '@/lib/queries'
import { PRIORITIES, PRIORITY_RANK, STATUSES, type CalEvent, type TaskSummary } from '@/lib/types'

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

export function HomePage() {
  const now = useNow(30_000)
  const tasks = useTasks()
  const events = useEvents()
  const projects = useProjects()
  const profile = useProfile()
  const { openTask, openEvent } = useDialogs()
  const navigate = useNavigate()
  const createNote = useCreateNote()

  const projectById = useMemo(() => new Map(projects.data?.map((p) => [p.id, p])), [projects.data])
  const d = useMemo(() => derive(tasks.data ?? [], events.data ?? [], now), [tasks.data, events.data, now])
  const name = profile.data?.display_name?.trim()
  const todayKey = format(now, 'yyyy-MM-dd')

  async function newNote() {
    const id = await createNote.mutateAsync({})
    navigate(`/notes/${id}`)
  }

  const dataState =
    tasks.isPending || events.isPending ? (
      <Loading what="your day" />
    ) : tasks.isError ? (
      <QueryError what="tasks" error={tasks.error} retry={() => tasks.refetch()} />
    ) : events.isError ? (
      <QueryError what="events" error={events.error} retry={() => events.refetch()} />
    ) : null

  return (
    <div className="space-y-6">
      <header className="panel px-5 pt-5 pb-4 md:px-6">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div>
            <h1 className="text-xl font-semibold">
              {greeting(now)}
              {name ? `, ${name}` : ''}
            </h1>
            <p className="text-ink-2">{format(now, 'EEEE, d MMMM yyyy')}</p>
          </div>
          <Clock />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
          <button
            type="button"
            aria-label="Add task"
            className="btn btn-primary px-2 sm:px-3"
            onClick={() => openTask('new', { due: todayKey })}
          >
            <PlusIcon size={16} weight="bold" />
            <span className="sm:hidden">Task</span>
            <span className="max-sm:hidden">Add task</span>
          </button>
          <button
            type="button"
            aria-label="Add event"
            className="btn btn-quiet px-2 sm:px-3"
            onClick={() => openEvent('new', { date: todayKey })}
          >
            <CalendarBlankIcon size={16} weight="bold" />
            <span className="sm:hidden">Event</span>
            <span className="max-sm:hidden">Add event</span>
          </button>
          <button
            type="button"
            aria-label="New note"
            className="btn btn-quiet px-2 sm:px-3"
            onClick={quietly(newNote)}
            disabled={createNote.isPending}
          >
            <NotePencilIcon size={16} weight="bold" />
            <span className="sm:hidden">Note</span>
            <span className="max-sm:hidden">New note</span>
          </button>
        </div>
        <div className="mt-5">
          <DayRuler now={now} tasks={d.dueToday} events={d.eventsToday} onOpenTask={openTask} onOpenEvent={openEvent} />
        </div>
      </header>

      {dataState ?? (
        <>
          <div className="grid gap-6 lg:grid-cols-12">
            <Panel
              className="lg:col-span-7"
              title="Today"
              aside={d.leftToday > 0 ? `${d.leftToday} left` : undefined}
            >
              {d.overdue.length === 0 && d.dueToday.length === 0 && d.eventsToday.length === 0 ? (
                <StateMessage
                  title="Nothing due today."
                  body="Tasks with a deadline today and today’s events show up here."
                  action={
                    <button type="button" className="btn btn-quiet" onClick={() => openTask('new', { due: todayKey })}>
                      Add a task for today
                    </button>
                  }
                />
              ) : (
                <>
                  {d.overdue.length > 0 && (
                    <>
                      <SubHead tone="danger">Overdue · {d.overdue.length}</SubHead>
                      <ul className="divide-y divide-line">
                        {d.overdue.map((t) => (
                          <TaskRow key={t.id} task={t} project={projectById.get(t.project_id ?? '')} onOpen={openTask} now={now} />
                        ))}
                      </ul>
                    </>
                  )}
                  {d.overdue.length > 0 && <SubHead>Today</SubHead>}
                  {d.todayItems.length === 0 ? (
                    <p className="px-4 py-3 text-ink-2">Nothing else is scheduled for today.</p>
                  ) : (
                    <ul className="divide-y divide-line">
                      {d.todayItems.map((item) =>
                        item.kind === 'task' ? (
                          <TaskRow
                            key={item.task.id}
                            task={item.task}
                            project={projectById.get(item.task.project_id ?? '')}
                            onOpen={openTask}
                            timeOnly
                            now={now}
                          />
                        ) : (
                          <EventRow key={item.event.id} event={item.event} onOpen={openEvent} />
                        ),
                      )}
                    </ul>
                  )}
                </>
              )}
            </Panel>

            <Panel className="lg:col-span-5" title="Next 7 days" action={<Link to="/calendar" className="text-[13px] text-ink-2 hover:text-ink">Calendar</Link>}>
              {d.upcoming.length === 0 ? (
                <StateMessage title="A clear week ahead." body="Nothing is due and no events are planned for the next 7 days." />
              ) : (
                d.upcoming.map((g) => (
                  <div key={g.day.toISOString()}>
                    <SubHead>{formatDay(g.day, now)}</SubHead>
                    <ul className="divide-y divide-line">
                      {g.items.map((item) =>
                        item.kind === 'task' ? (
                          <TaskRow
                            key={item.task.id}
                            task={item.task}
                            project={projectById.get(item.task.project_id ?? '')}
                            onOpen={openTask}
                            timeOnly
                            now={now}
                          />
                        ) : (
                          <EventRow key={item.event.id} event={item.event} onOpen={openEvent} />
                        ),
                      )}
                    </ul>
                  </div>
                ))
              )}
            </Panel>
          </div>

          <div className="grid gap-6 lg:grid-cols-12">
            <Panel
              className="lg:col-span-7"
              title="In progress and waiting"
              action={<Link to="/tasks?view=board" className="text-[13px] text-ink-2 hover:text-ink">Board</Link>}
            >
              {d.active.length === 0 ? (
                <StateMessage
                  title="Nothing in progress."
                  body="Set a task’s status to In progress or Waiting and it stays here until it’s done."
                />
              ) : (
                <ul className="divide-y divide-line">
                  {d.active.map((t) => (
                    <TaskRow key={t.id} task={t} project={projectById.get(t.project_id ?? '')} onOpen={openTask} now={now} />
                  ))}
                </ul>
              )}
            </Panel>
            <Panel className="lg:col-span-5" title="Month" bare>
              <div className="px-4 pb-4">
                <MiniMonth busy={d.busy} onPick={(day) => navigate(`/calendar?date=${format(day, 'yyyy-MM-dd')}`)} />
              </div>
            </Panel>
          </div>

          <section aria-labelledby="numbers-heading" className="space-y-4">
            <h2 id="numbers-heading" className="text-base font-semibold">
              Numbers
            </h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <Stat to="/tasks" label="Open tasks" value={d.open.length} />
              <Stat to="/tasks?show=today" label="Due today" value={d.dueToday.filter((t) => t.status !== 'done').length} />
              <Stat to="/tasks?show=overdue" label="Overdue" value={d.overdue.length} danger={d.overdue.length > 0} />
              <Stat to="/tasks?show=done" label="Done, last 7 days" value={d.finishedCounts.reduce((a, b) => a + b, 0)} />
              <Stat to={`/calendar?date=${todayKey}`} label="Events today" value={d.eventsToday.length} />
            </ul>
            <div className="grid gap-6 lg:grid-cols-12">
              <div className="panel p-4 lg:col-span-5">
                <FinishedPerDay days={d.last7} counts={d.finishedCounts} />
              </div>
              <div className="panel space-y-5 p-4 lg:col-span-3">
                <h3 className="font-medium">Deadlines met</h3>
                <Meter label="Due today" done={d.todayDone} total={d.dueToday.length} />
                <Meter label="Due this week" done={d.weekDone} total={d.weekTotal} />
              </div>
              <div className="panel space-y-5 p-4 lg:col-span-4">
                <h3 className="font-medium">
                  Open tasks <span className="font-normal text-ink-3">· {d.open.length}</span>
                </h3>
                <Breakdown
                  title="By status"
                  total={d.open.length}
                  rows={STATUSES.filter((s) => s.value !== 'done').map((s) => ({
                    label: s.label,
                    value: d.open.filter((t) => t.status === s.value).length,
                  }))}
                />
                <Breakdown
                  title="By priority"
                  total={d.open.length}
                  rows={PRIORITIES.map((p) => ({ label: p.label, value: d.open.filter((t) => t.priority === p.value).length }))}
                />
              </div>
            </div>
          </section>

          <MobileQuickLinks />
        </>
      )}
    </div>
  )
}

function Clock() {
  const now = useNow(1000)
  return (
    <p className="leading-none" aria-label={`Time ${format(now, 'HH:mm')}`}>
      {/* Tabular digits so the clock doesn't shift width every second. */}
      <time dateTime={now.toISOString()} className="tnum text-[40px] font-semibold tracking-tight md:text-[56px]">
        {format(now, 'HH:mm')}
      </time>
      <span className="tnum ml-1 text-xl text-ink-3 md:text-2xl" aria-hidden>
        {format(now, 'ss')}
      </span>
    </p>
  )
}

function Panel({
  title,
  aside,
  action,
  children,
  className = '',
  bare = false,
}: {
  title: string
  aside?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  bare?: boolean
}) {
  return (
    <section className={`panel flex flex-col overflow-hidden ${className}`} aria-label={title}>
      <div className={`flex items-baseline justify-between gap-3 px-4 pt-3 ${bare ? 'pb-1' : 'pb-2'}`}>
        <h2 className="font-semibold">
          {title}
          {aside && <span className="ml-2 font-normal text-ink-3">{aside}</span>}
        </h2>
        {action}
      </div>
      <div className="flex-1">{children}</div>
    </section>
  )
}

function SubHead({ children, tone }: { children: ReactNode; tone?: 'danger' }) {
  return (
    <h3
      className={`border-t border-line bg-surface-2/50 px-4 py-1.5 text-[13px] font-medium ${
        tone === 'danger' ? 'text-danger' : 'text-ink-2'
      }`}
    >
      {children}
    </h3>
  )
}

function EventRow({ event, onOpen }: { event: CalEvent; onOpen: (id: string) => void }) {
  const start = toDate(event.starts_at)
  const end = event.ends_at ? toDate(event.ends_at) : null
  return (
    <li>
      <button type="button" onClick={() => onOpen(event.id)} className="row-hover flex w-full items-start gap-3 px-4 py-2.5 text-left">
        <span aria-hidden className="flex w-5 shrink-0 justify-center pt-1">
          <span className="block h-4 w-1 rounded-full bg-ink-2" />
        </span>
        <span className="min-w-0">
          <span className="block break-words">{event.title}</span>
          <span className="mt-0.5 block text-[13px] text-ink-2 tnum">
            {event.all_day ? 'All day' : `${format(start, 'HH:mm')}${end && isSameDay(start, end) ? `–${format(end, 'HH:mm')}` : ''}`}
            {event.location && <span className="text-ink-3"> · {event.location}</span>}
          </span>
        </span>
      </button>
    </li>
  )
}

function Stat({ to, label, value, danger }: { to: string; label: string; value: number; danger?: boolean }) {
  return (
    <li>
      <Link to={to} className="panel row-hover block px-4 py-3 transition-colors duration-150">
        <span className={`block text-2xl font-semibold ${danger ? 'text-danger' : ''}`}>{value}</span>
        <span className="text-[13px] text-ink-2">{label}</span>
      </Link>
    </li>
  )
}

function MobileQuickLinks() {
  const links = useQuickLinks()
  if (!links.data?.length) return null
  return (
    <section aria-labelledby="mobile-links" className="md:hidden">
      <div className="flex items-baseline justify-between">
        <h2 id="mobile-links" className="text-base font-semibold">
          Quick links
        </h2>
        <Link to="/links" className="text-[13px] text-ink-2">
          Edit
        </Link>
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-2">
        {links.data.map((l) => (
          <li key={l.id}>
            <a href={l.url} target="_blank" rel="noreferrer" className="panel flex min-h-11 items-center gap-2 px-3">
              <SiteIcon url={l.url} label={l.label} />
              <span className="truncate">{l.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

type AgendaItem = { kind: 'task'; at: number; task: TaskSummary } | { kind: 'event'; at: number; event: CalEvent }

function derive(tasks: TaskSummary[], events: CalEvent[], now: Date) {
  const today = startOfDay(now)
  const open = tasks.filter((t) => t.status !== 'done')
  const overdue = open
    .filter((t) => t.due_at && toDate(t.due_at) < today)
    .sort((a, b) => a.due_at!.localeCompare(b.due_at!))
  const dueToday = tasks.filter((t) => t.due_at && sameDay(t.due_at, now))
  const eventsToday = events.filter((e) => sameDay(e.starts_at, now))

  const agenda = (ts: TaskSummary[], es: CalEvent[]): AgendaItem[] =>
    [
      ...ts.map((t) => ({ kind: 'task' as const, at: toDate(t.due_at!).getTime(), task: t })),
      ...es.map((e) => ({ kind: 'event' as const, at: e.all_day ? -1 : toDate(e.starts_at).getTime(), event: e })),
    ].sort((a, b) => a.at - b.at)

  const upcoming = Array.from({ length: 7 }, (_, i) => addDays(today, i + 1))
    .map((day) => ({
      day,
      items: agenda(
        open.filter((t) => t.due_at && sameDay(t.due_at, day)),
        events.filter((e) => sameDay(e.starts_at, day)),
      ),
    }))
    .filter((g) => g.items.length > 0)

  const active = open
    .filter((t) => t.status === 'in_progress' || t.status === 'waiting')
    .sort(
      (a, b) =>
        (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999') || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
    )

  const last7 = lastNDays(7, now)
  const finishedCounts = last7.map((day) => tasks.filter((t) => t.completed_at && sameDay(t.completed_at, day)).length)

  const { start, end } = weekRange(now)
  const dueThisWeek = tasks.filter((t) => t.due_at && toDate(t.due_at) >= start && toDate(t.due_at) <= end)

  return {
    open,
    overdue,
    dueToday,
    eventsToday,
    todayItems: agenda(dueToday, eventsToday),
    leftToday: overdue.length + dueToday.filter((t) => t.status !== 'done').length,
    todayDone: dueToday.filter((t) => t.status === 'done').length,
    weekTotal: dueThisWeek.length,
    weekDone: dueThisWeek.filter((t) => t.status === 'done').length,
    upcoming,
    active,
    last7,
    finishedCounts,
    busy: (day: Date) => ({
      deadlines: tasks.filter((t) => t.show_on_calendar && t.due_at && sameDay(t.due_at, day)).length,
      events: events.filter((e) => sameDay(e.starts_at, day)).length,
    }),
  }
}
