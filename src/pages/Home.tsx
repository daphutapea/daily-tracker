import {
  CalendarBlankIcon,
  CalendarDotsIcon,
  ChatTextIcon,
  CheckCircleIcon,
  ListChecksIcon,
  NotePencilIcon,
  PlusIcon,
  TimerIcon,
  WarningIcon,
  type Icon,
} from '@phosphor-icons/react'
import { addDays, format, isSameDay, startOfDay } from 'date-fns'
import { Fragment, useEffect, useId, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { Breakdown, FinishedPerDay, Meter } from '@/components/Charts'
import { DayRuler } from '@/components/DayRuler'
import { MiniMonth } from '@/components/MiniMonth'
import { useOpenTracky } from '@/components/trackyContext'
import { MoveAllToTomorrow, TaskRow } from '@/components/TaskRow'
import { Loading, QueryError, Segmented, SiteIcon, StateMessage } from '@/components/ui'
import { formatDay, greeting, lastNDays, sameDay, toDate, weekRange } from '@/lib/dates'
import { useDialogs } from '@/lib/dialogs'
import { PRIORITY_COLOR, STATUS_COLOR } from '@/lib/hues'
import { rememberName } from '@/lib/intro'
import { rowIn } from '@/lib/motion'
import { shortcutKeys, shortcutLabel } from '@/lib/platform'
import { quietly, useCreateNote, useEvents, useProfile, useProjects, useQuickLinks, useTasks } from '@/lib/queries'
import {
  PRIORITIES,
  PRIORITY_RANK,
  STATUSES,
  type CalEvent,
  type Project,
  type TaskStatus,
  type TaskSummary,
} from '@/lib/types'
import { useNow } from '@/lib/useNow'

export function HomePage() {
  const now = useNow(30_000)
  const tasks = useTasks()
  const events = useEvents()
  const projects = useProjects()
  const profile = useProfile()
  const { openTask, openEvent } = useDialogs()
  const navigate = useNavigate()
  const createNote = useCreateNote()
  const openTracky = useOpenTracky()

  const projectById = useMemo(() => new Map(projects.data?.map((p) => [p.id, p])), [projects.data])
  const d = useMemo(() => derive(tasks.data ?? [], events.data ?? [], now), [tasks.data, events.data, now])
  const name = profile.data?.display_name?.trim()
  const todayKey = format(now, 'yyyy-MM-dd')

  useEffect(() => {
    if (profile.isSuccess) rememberName(name)
  }, [profile.isSuccess, name])

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
    // On a computer with room for it, Home is one board that fits the window: each panel is as tall
    // as what it holds, up to the space left, and scrolls inside. Narrower or shorter windows, and
    // phones, get the same panels one under another, with long lists cut short behind "Show more".
    <div className="@container">
      <div className="flex flex-col gap-4 board:h-[calc(100dvh-4.25rem)] board:min-h-0">
        <header className="arrive hero shrink-0 px-4 pt-4 pb-3 md:px-5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {/* The clock comes first on screen; the greeting stays first for screen readers. */}
            <div className="mr-auto flex flex-row-reverse items-center gap-4">
              <div className="min-w-0">
                <h1 className="text-lg leading-tight font-semibold">
                  {greeting(now)}
                  {name ? `, ${name}` : ''}
                </h1>
                <p className="text-[13px] text-ink-2">{format(now, 'EEEE, d MMMM yyyy')}</p>
              </div>
              <Clock />
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 @3xl:w-auto">
              <div className="grid flex-1 grid-cols-3 gap-2 @3xl:flex @3xl:flex-none">
                <button
                  type="button"
                  aria-label="Add task"
                  className="btn btn-primary px-2 @3xl:px-3"
                  onClick={() => openTask('new', { due: todayKey })}
                >
                  <PlusIcon size={16} weight="bold" />
                  <span>Task</span>
                </button>
                <button
                  type="button"
                  aria-label="Add event"
                  className="btn btn-quiet px-2 @3xl:px-3"
                  onClick={() => openEvent('new', { date: todayKey })}
                >
                  <CalendarBlankIcon size={16} weight="bold" />
                  <span>Event</span>
                </button>
                <button
                  type="button"
                  aria-label="New note"
                  className="btn btn-quiet px-2 @3xl:px-3"
                  onClick={quietly(newNote)}
                  disabled={createNote.isPending}
                >
                  <NotePencilIcon size={16} weight="bold" />
                  <span>Note</span>
                </button>
              </div>
              {/* Looks like a text field because that's what it opens: write a sentence, get items back. */}
              <button
                type="button"
                onClick={() => openTracky()}
                aria-label="Ask Tracky: describe tasks or events in a sentence"
                aria-keyshortcuts={shortcutKeys()}
                className="field flex min-h-9 w-full items-center gap-2 text-left text-ink-3 @3xl:w-72"
              >
                <ChatTextIcon size={16} weight="bold" aria-hidden className="shrink-0" />
                <span className="truncate">Tell Tracky what’s coming up</span>
                <kbd className="ml-auto shrink-0 font-sans text-[12px] max-sm:hidden">{shortcutLabel()}</kbd>
              </button>
            </div>
          </div>
          <div className="mt-3">
            <DayRuler now={now} tasks={d.dueToday} events={d.eventsToday} onOpenTask={openTask} onOpenEvent={openEvent} />
          </div>
        </header>

        {dataState ?? (
          <>
            {/* Phones: three tiles over two, both rows full. Wider: one row of five. */}
            <ul aria-label="Numbers at a glance" className="arrive grid shrink-0 grid-cols-6 gap-2 @3xl:grid-cols-5 @3xl:gap-3" style={{ '--i': 1 } as CSSProperties}>
              <Stat to="/tasks" icon={ListChecksIcon} tone="neutral" label="Open tasks" value={d.open.length} strip={d.openByStatus} />
              <Stat to="/tasks?show=today" icon={TimerIcon} tone="today" label="Due today" value={d.dueToday.filter((t) => t.status !== 'done').length} />
              <Stat to="/tasks?show=overdue" icon={WarningIcon} tone={d.overdue.length > 0 ? 'danger' : 'quiet'} label="Overdue" value={d.overdue.length} />
              <Stat to="/tasks?show=done" icon={CheckCircleIcon} tone="ok" label="Done, 7 days" value={d.finishedCounts.reduce((a, b) => a + b, 0)} wide />
              <Stat to={`/calendar?date=${todayKey}`} icon={CalendarDotsIcon} tone="event" label="Events today" value={d.eventsToday.length} wide />
            </ul>

            <div
              className="home-split arrive fade-in grid gap-4 board:min-h-0 board:flex-1 board:grid-cols-[minmax(0,5fr)_minmax(0,4fr)_minmax(16rem,3fr)] board:grid-rows-[minmax(0,1fr)]"
              style={{ '--i': 2 } as CSSProperties}
            >
              <div className="flex min-h-0 flex-col gap-4">
                <TodayPanel d={d} now={now} todayKey={todayKey} projectById={projectById} />
                <Panel
                  title="In progress and waiting"
                  aside={d.active.length > 0 ? String(d.active.length) : undefined}
                  action={<Link to="/tasks?view=board" className="hit text-[13px] text-ink-2 hover:text-ink">Board</Link>}
                >
                  {d.active.length === 0 ? (
                    <StateMessage
                      title="Nothing in progress."
                      body="Set a task’s status to In progress or Waiting and it stays here until it’s done."
                    />
                  ) : (
                    <Capped limit={4} total={d.active.length}>
                      {(extra) => (
                        <ul className="divide-y divide-line">
                          {d.active.map((t, i) => (
                            <TaskRow key={t.id} task={t} project={projectById.get(t.project_id ?? '')} onOpen={openTask} now={now} extra={extra(i)} />
                          ))}
                        </ul>
                      )}
                    </Capped>
                  )}
                </Panel>
              </div>

              <div className="flex min-h-0 flex-col gap-4">
                <Panel
                  title="Next 7 days"
                  aside={d.upcomingCount > 0 ? String(d.upcomingCount) : undefined}
                  action={<Link to="/calendar" className="hit text-[13px] text-ink-2 hover:text-ink">Calendar</Link>}
                >
                  {d.upcoming.length === 0 ? (
                    <StateMessage title="A clear week ahead." body="Nothing is due and no events are planned for the next 7 days." />
                  ) : (
                    <Capped limit={6} total={d.upcomingCount}>
                      {(extra) =>
                        d.upcoming.map((g) => (
                          <div key={g.day.toISOString()} data-extra={extra(g.first) || undefined}>
                            <SubHead>{formatDay(g.day, now)}</SubHead>
                            <ul className="divide-y divide-line">
                              {g.items.map((item, i) => (
                                <AgendaRow key={itemKey(item)} item={item} projectById={projectById} now={now} extra={extra(g.first + i)} />
                              ))}
                            </ul>
                          </div>
                        ))
                      }
                    </Capped>
                  )}
                </Panel>
              </div>

              <div className="flex min-h-0 flex-col gap-4">
                <Panel title="Month" bare fixed>
                  <div className="px-3 pb-2">
                    <MiniMonth busy={d.busy} onPick={(day) => navigate(`/calendar?date=${format(day, 'yyyy-MM-dd')}`)} />
                  </div>
                </Panel>
                <NumbersPanel d={d} />
              </div>
            </div>

            <MobileQuickLinks />
          </>
        )}
      </div>
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

type Derived = ReturnType<typeof derive>

/** Overdue tasks, then today's deadlines and events in time order. */
function TodayPanel({
  d,
  now,
  todayKey,
  projectById,
}: {
  d: Derived
  now: Date
  todayKey: string
  projectById: Map<string, Project>
}) {
  const { openTask } = useDialogs()
  const empty = d.overdue.length === 0 && d.dueToday.length === 0 && d.eventsToday.length === 0
  // The day ruler's now line, carried into the list: between what is past and what is next. Only
  // when there is something on both sides. All-day events count as past (their time is -1).
  const firstAhead = d.todayItems.findIndex((item) => item.at > now.getTime())
  const nowAt = firstAhead > 0 ? firstAhead : -1
  return (
    <Panel title="Today" aside={d.leftToday > 0 ? `${d.leftToday} left` : undefined}>
      {empty ? (
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
        <Capped limit={6} total={d.overdue.length + d.todayItems.length}>
          {(extra) => (
            <>
              {d.overdue.length > 0 && (
                <>
                  <SubHead tone="danger" action={<MoveAllToTomorrow tasks={d.overdue} now={now} />}>
                    Overdue · {d.overdue.length}
                  </SubHead>
                  <ul className="divide-y divide-line">
                    {d.overdue.map((t, i) => (
                      <TaskRow key={t.id} task={t} project={projectById.get(t.project_id ?? '')} onOpen={openTask} now={now} extra={extra(i)} />
                    ))}
                  </ul>
                </>
              )}
              {d.overdue.length > 0 && <SubHead extra={extra(d.overdue.length)}>Today</SubHead>}
              {d.todayItems.length === 0 ? (
                <p className="px-4 py-3 text-ink-2">Nothing else is scheduled for today.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {d.todayItems.map((item, i) => (
                    <Fragment key={itemKey(item)}>
                      {i === nowAt && <NowRule now={now} extra={extra(d.overdue.length + i)} />}
                      <AgendaRow item={item} projectById={projectById} now={now} extra={extra(d.overdue.length + i)} />
                    </Fragment>
                  ))}
                </ul>
              )}
            </>
          )}
        </Capped>
      )}
    </Panel>
  )
}

function NowRule({ now, extra }: { now: Date; extra: boolean }) {
  return (
    <li
      role="separator"
      aria-label={`Now, ${format(now, 'HH:mm')}`}
      data-extra={extra || undefined}
      className="flex items-center gap-2 px-4 py-1"
    >
      <span aria-hidden className="text-[12px] font-medium text-accent tnum">
        Now {format(now, 'HH:mm')}
      </span>
      <span aria-hidden className="h-0.5 flex-1 rounded-full bg-accent" />
    </li>
  )
}

const itemKey = (item: AgendaItem) => (item.kind === 'task' ? `t-${item.task.id}` : `e-${item.event.id}`)

function AgendaRow({
  item,
  projectById,
  now,
  extra,
}: {
  item: AgendaItem
  projectById: Map<string, Project>
  now: Date
  extra: boolean
}) {
  const { openTask, openEvent } = useDialogs()
  return item.kind === 'task' ? (
    <TaskRow
      task={item.task}
      project={projectById.get(item.task.project_id ?? '')}
      onOpen={openTask}
      timeOnly
      now={now}
      extra={extra}
    />
  ) : (
    <EventRow event={item.event} onOpen={openEvent} extra={extra} />
  )
}

/**
 * A list that shows its first `limit` rows and a "Show n more" button where the page scrolls. On
 * the one-screen board every row shows and the panel scrolls instead (the CSS for .capped in
 * index.css). Rows past the limit are marked with data-extra.
 */
function Capped({
  limit,
  total,
  children,
}: {
  limit: number
  total: number
  children: (extra: (index: number) => boolean) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  // Hiding a single row saves nothing over the button that would replace it, so it shows.
  const cut = total - limit > 1 ? limit : total
  const hidden = total - cut
  return (
    <div id={id} className={`capped ${open ? 'expanded' : ''}`}>
      {children((i) => i >= cut)}
      {hidden > 0 && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          className="show-more row-hover w-full border-t border-line px-4 py-2 text-left text-[13px] font-medium text-ink-2 pointer-coarse:min-h-11"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Show fewer' : `Show ${hidden} more`}
        </button>
      )}
    </div>
  )
}

type NumbersView = 'done' | 'deadlines' | 'open'
const NUMBERS_KEY = 'dt-home-numbers'

/** The charts, one at a time, so the board fits the window. The choice is kept on this device. */
function NumbersPanel({ d }: { d: Derived }) {
  const [view, setView] = useState<NumbersView>(() => {
    try {
      const saved = localStorage.getItem(NUMBERS_KEY)
      return saved === 'deadlines' || saved === 'open' ? saved : 'done'
    } catch {
      return 'done'
    }
  })
  const choose = (next: NumbersView) => {
    setView(next)
    try {
      localStorage.setItem(NUMBERS_KEY, next)
    } catch {
      // Blocked storage: the choice holds for this visit.
    }
  }
  return (
    <Panel title="Numbers" action={<Link to="/review" className="hit text-[13px] text-ink-2 hover:text-ink">Weekly review</Link>}>
      <div className="space-y-3 px-4 pt-1 pb-4">
        <Segmented
          label="Numbers to show"
          value={view}
          onChange={choose}
          options={[
            { value: 'done', label: 'Finished' },
            { value: 'deadlines', label: 'Deadlines' },
            { value: 'open', label: 'Open' },
          ]}
        />
        {view === 'done' ? (
          <FinishedPerDay days={d.last7} counts={d.finishedCounts} compact />
        ) : view === 'deadlines' ? (
          <div className="space-y-4">
            <h3 className="font-medium">Deadlines met</h3>
            <Meter label="Due today" done={d.todayDone} total={d.dueToday.length} />
            <Meter label="Due this week" done={d.weekDone} total={d.weekTotal} />
          </div>
        ) : (
          <div className="space-y-4">
            <h3 className="font-medium">
              Open tasks <span className="font-normal text-ink-3">· {d.open.length}</span>
            </h3>
            <Breakdown
              title="By status"
              total={d.open.length}
              rows={STATUSES.filter((s) => s.value !== 'done').map((s) => ({
                label: s.label,
                value: d.open.filter((t) => t.status === s.value).length,
                color: STATUS_COLOR[s.value],
              }))}
            />
            <Breakdown
              title="By priority"
              total={d.open.length}
              rows={PRIORITIES.map((p) => ({
                label: p.label,
                value: d.open.filter((t) => t.priority === p.value).length,
                color: PRIORITY_COLOR[p.value],
              }))}
            />
          </div>
        )}
      </div>
    </Panel>
  )
}

/**
 * A panel on the board. It is as tall as what it holds; on the one-screen board it gives way when
 * the column runs out of room and its body scrolls. `fixed` keeps its full height (the month).
 */
function Panel({
  title,
  aside,
  action,
  children,
  bare = false,
  fixed = false,
}: {
  title: string
  aside?: string
  action?: ReactNode
  children: ReactNode
  bare?: boolean
  fixed?: boolean
}) {
  return (
    <section
      className={`panel flex flex-col overflow-hidden ${fixed ? 'shrink-0' : 'min-h-0 board:min-h-36'}`}
      aria-label={title}
    >
      <div className={`flex shrink-0 items-baseline justify-between gap-3 px-4 pt-3 ${bare ? 'pb-1' : 'pb-2'}`}>
        <h2 className="font-semibold">
          {title}
          {aside && <span className="ml-2 font-normal text-ink-3">{aside}</span>}
        </h2>
        {action}
      </div>
      <div className={fixed ? '' : 'min-h-0 flex-1 board:overflow-y-auto board:overscroll-contain'}>{children}</div>
    </section>
  )
}

function SubHead({
  children,
  tone,
  action,
  extra = false,
}: {
  children: ReactNode
  tone?: 'danger'
  action?: ReactNode
  extra?: boolean
}) {
  return (
    <div
      data-extra={extra || undefined}
      className="flex items-center justify-between gap-2 border-t border-line bg-surface-2/50 px-4 py-1.5"
    >
      <h3 className={`text-[13px] font-medium ${tone === 'danger' ? 'text-danger' : 'text-ink-2'}`}>{children}</h3>
      {action}
    </div>
  )
}

function EventRow({ event, onOpen, extra = false }: { event: CalEvent; onOpen: (id: string) => void; extra?: boolean }) {
  const start = toDate(event.starts_at)
  const end = event.ends_at ? toDate(event.ends_at) : null
  return (
    <li className={rowIn(event.id)} data-extra={extra || undefined}>
      <button type="button" onClick={() => onOpen(event.id)} className="row-hover flex w-full items-start gap-3 px-4 py-2.5 text-left">
        <span aria-hidden className="flex w-5 shrink-0 justify-center pt-1">
          <span className="block h-4 w-1 rounded-full bg-event" />
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

/** What a count's icon square says: today is teal, done green, events indigo, overdue red while above 0. */
type Tone = 'neutral' | 'quiet' | 'today' | 'danger' | 'ok' | 'event'

/** A count that opens its list. `strip` splits it by status under the label (open tasks). */
function Stat({
  to,
  icon: Glyph,
  tone,
  label,
  value,
  strip,
  wide = false,
}: {
  to: string
  icon: Icon
  tone: Tone
  label: string
  value: number
  strip?: { status: TaskStatus; label: string; value: number }[]
  /** On a phone, the two tiles of the second row are wider. */
  wide?: boolean
}) {
  const parts = strip?.filter((p) => p.value > 0) ?? []
  return (
    <li className={`${wide ? 'col-span-3' : 'col-span-2'} @3xl:col-span-1`}>
      {/* Wide: the icon beside the number and label. Narrow: icon and number on one line, the label under them. */}
      <Link
        to={to}
        className="panel row-hover press grid h-full grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 gap-y-0.5 px-3 py-2 @3xl:gap-x-3 @3xl:py-2.5"
      >
        <span aria-hidden data-tone={tone} className="stat-icon grid size-7 place-items-center rounded-[6px] @3xl:row-span-2 @3xl:size-8">
          <Glyph size={16} weight="bold" />
        </span>
        <span className={`text-xl leading-tight font-semibold tnum ${tone === 'danger' ? 'text-danger' : ''}`}>{value}</span>
        <span className="col-span-2 text-[13px] leading-snug text-ink-2 @3xl:col-span-1 @3xl:col-start-2">
          {label}
          {parts.length > 0 && <span className="sr-only">: {parts.map((p) => `${p.value} ${p.label.toLowerCase()}`).join(', ')}</span>}
        </span>
        {parts.length > 0 && (
          <span aria-hidden className="col-span-2 mt-1 flex h-1 gap-0.5 @3xl:col-span-1 @3xl:col-start-2">
            {parts.map((p) => (
              <span key={p.status} className={`rounded-full ${STATUS_COLOR[p.status]}`} style={{ flexGrow: p.value }} />
            ))}
          </span>
        )}
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
        <Link to="/links" className="hit text-[13px] text-ink-2">
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
  // Where each day starts in the list as a whole, so a cut-short list can hide what comes after.
  let seen = 0
  const upcomingGroups = upcoming.map((g) => {
    const first = seen
    seen += g.items.length
    return { ...g, first }
  })

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
    upcoming: upcomingGroups,
    upcomingCount: seen,
    openByStatus: STATUSES.filter((st) => st.value !== 'done').map((st) => ({
      status: st.value,
      label: st.label,
      value: open.filter((t) => t.status === st.value).length,
    })),
    active,
    last7,
    finishedCounts,
    busy: (day: Date) => ({
      deadlines: tasks.filter((t) => t.show_on_calendar && t.due_at && sameDay(t.due_at, day)).length,
      events: events.filter((e) => sameDay(e.starts_at, day)).length,
    }),
  }
}
