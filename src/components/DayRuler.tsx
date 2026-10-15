import { format } from 'date-fns'
import type { CalEvent, TaskSummary } from '@/lib/types'
import { toDate } from '@/lib/dates'

/**
 * The identity motif from DESIGN.md: today as a 24-hour ruler. Hour ticks, a mark for every
 * deadline and timed event, and the "now" line. Marks are buttons, so the ruler is also a way in.
 */
export function DayRuler({
  now,
  tasks,
  events,
  onOpenTask,
  onOpenEvent,
}: {
  now: Date
  tasks: TaskSummary[]
  events: CalEvent[]
  onOpenTask: (id: string) => void
  onOpenEvent: (id: string) => void
}) {
  const minutes = (d: Date) => d.getHours() * 60 + d.getMinutes()
  const pct = (d: Date) => `${(minutes(d) / 1440) * 100}%`

  const marks = [
    ...tasks
      .filter((t) => t.due_at)
      .map((t) => ({
        kind: 'task' as const,
        id: t.id,
        at: toDate(t.due_at!),
        label: t.title,
        done: t.status === 'done',
        late: t.status !== 'done' && toDate(t.due_at!) < now,
      })),
    ...events
      .filter((e) => !e.all_day)
      .map((e) => ({ kind: 'event' as const, id: e.id, at: toDate(e.starts_at), label: e.title, done: false, late: false })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime())

  return (
    <div className="select-none" aria-label="Today, hour by hour">
      <div className="relative h-10">
        {/* hour ticks */}
        {Array.from({ length: 25 }, (_, h) => (
          <span
            key={h}
            aria-hidden
            className={`absolute bottom-0 w-px -translate-x-1/2 bg-line ${h % 6 === 0 ? 'h-3' : 'h-1.5'}`}
            style={{ left: `${(h / 24) * 100}%` }}
          />
        ))}
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-line" />

        {marks.map((m) => (
          <button
            key={`${m.kind}-${m.id}`}
            type="button"
            title={`${format(m.at, 'HH:mm')} ${m.label}`}
            aria-label={`${m.kind === 'task' ? 'Deadline' : 'Event'} at ${format(m.at, 'HH:mm')}: ${m.label}`}
            onClick={() => (m.kind === 'task' ? onOpenTask(m.id) : onOpenEvent(m.id))}
            className="group absolute bottom-0 grid h-8 w-5 -translate-x-1/2 place-items-end justify-center pb-1"
            style={{ left: pct(m.at) }}
          >
            {m.kind === 'task' ? (
              <span
                className={`block size-2.5 rotate-45 border-[1.5px] ${
                  m.done ? 'border-ink-3 bg-ink-3' : m.late ? 'border-danger bg-danger' : 'border-ink bg-surface'
                }`}
              />
            ) : (
              <span className="block h-4 w-1 rounded-full bg-ink-2" />
            )}
          </button>
        ))}

        <span
          aria-hidden
          className="pointer-events-none absolute -top-1 bottom-0 w-0.5 -translate-x-1/2 rounded-full bg-accent"
          style={{ left: pct(now) }}
        />
      </div>
      <div className="relative mt-1 h-4 text-[12px] text-ink-3 tnum" aria-hidden>
        {[0, 6, 12, 18, 24].map((h) => (
          <span
            key={h}
            className={`absolute ${h === 0 ? '' : h === 24 ? '-translate-x-full' : '-translate-x-1/2'}`}
            style={{ left: `${(h / 24) * 100}%` }}
          >
            {String(h % 24).padStart(2, '0')}:00
          </span>
        ))}
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-3">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="block size-2 rotate-45 border-[1.5px] border-ink bg-surface" /> Deadline
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="block h-3 w-1 rounded-full bg-ink-2" /> Event
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="block h-3 w-0.5 rounded-full bg-accent" /> Now
        </span>
      </p>
    </div>
  )
}
