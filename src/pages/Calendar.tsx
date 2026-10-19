import { CaretLeftIcon, CaretRightIcon, PlusIcon } from '@phosphor-icons/react'
import { addMonths, format, isSameDay, isSameMonth, isValid, parseISO, startOfMonth } from 'date-fns'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { monthGrid, WEEKDAYS } from '@/lib/month'
import { TaskRow } from '@/components/TaskRow'
import { Loading, QueryError, StateMessage } from '@/components/ui'
import { sameDay, toDate } from '@/lib/dates'
import { useDialogs } from '@/lib/dialogs'
import { rowIn } from '@/lib/motion'
import { useEvents, useProjects, useTasks } from '@/lib/queries'
import { useNow } from '@/lib/useNow'
import type { CalEvent, Project, TaskSummary } from '@/lib/types'

export function CalendarPage() {
  const [params, setParams] = useSearchParams()
  const today = useNow()
  const parsed = params.get('date') ? parseISO(params.get('date')!) : null
  const selected = parsed && isValid(parsed) ? parsed : today
  const [month, setMonth] = useState(() => startOfMonth(selected))
  const [dir, setDir] = useState<'next' | 'prev'>()
  const goToMonth = (next: Date) => {
    setDir(next > month ? 'next' : next < month ? 'prev' : dir)
    setMonth(next)
  }
  const tasks = useTasks()
  const events = useEvents()
  const projects = useProjects()
  const { openTask, openEvent } = useDialogs()
  const selectedKey = format(selected, 'yyyy-MM-dd')

  const days = useMemo(() => monthGrid(month), [month])
  const calTasks = useMemo(() => (tasks.data ?? []).filter((t) => t.show_on_calendar && t.due_at), [tasks.data])
  const projectById = useMemo(() => new Map(projects.data?.map((p) => [p.id, p])), [projects.data])

  const itemsOn = (day: Date) => {
    const evs = (events.data ?? [])
      .filter((e) => sameDay(e.starts_at, day))
      .sort((a, b) => Number(b.all_day) - Number(a.all_day) || a.starts_at.localeCompare(b.starts_at))
    const ts = calTasks.filter((t) => sameDay(t.due_at!, day)).sort((a, b) => a.due_at!.localeCompare(b.due_at!))
    return { evs, ts }
  }

  const select = (day: Date) => {
    setParams({ date: format(day, 'yyyy-MM-dd') }, { replace: true })
    if (!isSameMonth(day, month)) goToMonth(startOfMonth(day))
  }

  const sel = itemsOn(selected)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Calendar</h1>
        <div className="flex gap-2">
          <button type="button" className="btn btn-quiet" onClick={() => openTask('new', { due: selectedKey })}>
            <PlusIcon size={16} weight="bold" />
            Task
          </button>
          <button type="button" className="btn btn-primary" onClick={() => openEvent('new', { date: selectedKey })}>
            <PlusIcon size={16} weight="bold" />
            Add event
          </button>
        </div>
      </div>

      {tasks.isPending || events.isPending ? (
        <Loading what="calendar" />
      ) : tasks.isError || events.isError ? (
        <QueryError
          what="the calendar"
          error={tasks.error ?? events.error}
          retry={() => {
            tasks.refetch()
            events.refetch()
          }}
        />
      ) : (
        <div className="fade-in grid gap-5 xl:grid-cols-[1fr_320px]">
          <section className="panel overflow-hidden" aria-label={format(month, 'MMMM yyyy')}>
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
              <h2 className="text-base font-semibold" aria-live="polite">
                {format(month, 'MMMM yyyy')}
              </h2>
              <div className="flex items-center gap-1">
                <button type="button" className="btn btn-ghost btn-icon" aria-label="Previous month" onClick={() => goToMonth(addMonths(month, -1))}>
                  <CaretLeftIcon size={16} weight="bold" />
                </button>
                <button type="button" className="btn btn-quiet" onClick={() => select(new Date())}>
                  Today
                </button>
                <button type="button" className="btn btn-ghost btn-icon" aria-label="Next month" onClick={() => goToMonth(addMonths(month, 1))}>
                  <CaretRightIcon size={16} weight="bold" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-7 border-b border-line text-center text-[12px] text-ink-3" aria-hidden>
              {WEEKDAYS.map((d) => (
                <span key={d} className="py-1.5">
                  <span className="sm:hidden">{d.charAt(0)}</span>
                  <span className="max-sm:hidden">{d}</span>
                </span>
              ))}
            </div>
            <div key={format(month, 'yyyy-MM')} data-dir={dir} className="slide-in grid grid-cols-7">
              {days.map((d, i) => {
                const { evs, ts } = itemsOn(d)
                const isSel = isSameDay(d, selected)
                const isToday = isSameDay(d, today)
                const inMonth = isSameMonth(d, month)
                const all = [
                  ...evs.map((e) => ({ key: `e-${e.id}`, text: e.all_day ? e.title : `${format(toDate(e.starts_at), 'HH:mm')} ${e.title}`, done: false, kind: 'event' as const })),
                  ...ts.map((t) => ({ key: `t-${t.id}`, text: t.title, done: t.status === 'done', kind: 'task' as const })),
                ]
                const label = [
                  format(d, 'EEEE d MMMM'),
                  ts.length ? `${ts.length} due` : '',
                  evs.length ? `${evs.length} ${evs.length === 1 ? 'event' : 'events'}` : '',
                ]
                  .filter(Boolean)
                  .join(', ')
                return (
                  <button
                    key={d.toISOString()}
                    type="button"
                    onClick={() => select(d)}
                    aria-label={label}
                    aria-pressed={isSel}
                    aria-current={isToday ? 'date' : undefined}
                    className={`flex min-h-14 flex-col items-stretch gap-1 border-line p-1 text-left transition-colors duration-150 sm:min-h-28 sm:p-1.5 ${
                      i % 7 !== 6 ? 'border-r' : ''
                    } ${i < days.length - 7 ? 'border-b' : ''} ${isSel ? 'bg-surface-2' : 'row-hover'}`}
                  >
                    <span
                      className={`grid size-7 place-items-center self-center rounded-full text-[13px] tnum sm:self-start ${
                        isToday ? 'bg-ink font-semibold text-surface' : inMonth ? 'text-ink' : 'text-ink-3'
                      } ${isSel && !isToday ? 'ring-1 ring-ink' : ''}`}
                    >
                      {format(d, 'd')}
                    </span>
                    {/* Phones: marks only. Wider screens: the first three items. */}
                    <span className="flex justify-center gap-0.5 sm:hidden" aria-hidden>
                      {ts.length > 0 && <span className="block size-1.5 rotate-45 bg-ink-2" />}
                      {evs.length > 0 && <span className="block h-1.5 w-[3px] rounded-full bg-ink-2" />}
                    </span>
                    <span className="hidden min-w-0 flex-col gap-0.5 sm:flex" aria-hidden>
                      {all.slice(0, 3).map((it) => (
                        <span
                          key={it.key}
                          className={`flex min-w-0 items-center gap-1 rounded-[4px] px-1 text-[12px] leading-5 ${
                            it.kind === 'event' ? 'bg-surface-2 text-ink' : 'text-ink-2'
                          } ${it.done ? 'line-through opacity-70' : ''}`}
                        >
                          {it.kind === 'task' && <span className="block size-1.5 shrink-0 rotate-45 border border-current" />}
                          <span className="truncate">{it.text}</span>
                        </span>
                      ))}
                      {all.length > 3 && <span className="px-1 text-[12px] text-ink-3">+{all.length - 3} more</span>}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="panel self-start overflow-hidden" aria-labelledby="day-heading">
            <h2 id="day-heading" className="border-b border-line px-4 py-2.5 text-base font-semibold">
              {format(selected, 'EEEE d MMMM')}
            </h2>
            {sel.evs.length === 0 && sel.ts.length === 0 ? (
              <StateMessage
                title="Nothing on this day."
                action={
                  <button type="button" className="btn btn-quiet" onClick={() => openEvent('new', { date: selectedKey })}>
                    Add an event
                  </button>
                }
              />
            ) : (
              <>
                {sel.evs.length > 0 && <DayEvents events={sel.evs} onOpen={openEvent} />}
                {sel.ts.length > 0 && <DayTasks tasks={sel.ts} onOpen={openTask} projectById={projectById} />}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function DayEvents({ events, onOpen }: { events: CalEvent[]; onOpen: (id: string) => void }) {
  return (
    <div>
      <h3 className="bg-surface-2/50 px-4 py-1.5 text-[13px] font-medium text-ink-2">Events</h3>
      <ul className="divide-y divide-line">
        {events.map((e) => (
          <li key={e.id} className={rowIn(e.id)}>
            <button type="button" onClick={() => onOpen(e.id)} className="row-hover block w-full px-4 py-2.5 text-left">
              <span className="block break-words">{e.title}</span>
              <span className="text-[13px] text-ink-2 tnum">
                {e.all_day
                  ? 'All day'
                  : `${format(toDate(e.starts_at), 'HH:mm')}${e.ends_at ? `–${format(toDate(e.ends_at), 'HH:mm')}` : ''}`}
                {e.location && <span className="text-ink-3"> · {e.location}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function DayTasks({
  tasks,
  onOpen,
  projectById,
}: {
  tasks: TaskSummary[]
  onOpen: (id: string) => void
  projectById: Map<string, Project>
}) {
  return (
    <div>
      <h3 className="border-t border-line bg-surface-2/50 px-4 py-1.5 text-[13px] font-medium text-ink-2">Deadlines</h3>
      <ul className="divide-y divide-line">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} project={projectById.get(t.project_id ?? '')} onOpen={onOpen} timeOnly />
        ))}
      </ul>
    </div>
  )
}
