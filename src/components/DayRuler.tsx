import { format } from 'date-fns'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { CalEvent, TaskSummary } from '@/lib/types'
import { toDate } from '@/lib/dates'

interface Mark {
  kind: 'task' | 'event'
  id: string
  at: Date
  label: string
  done: boolean
  late: boolean
}

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
  const rulerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const coarse = useCoarsePointer()
  const [openGroup, setOpenGroup] = useState<string | null>(null)

  useLayoutEffect(() => {
    const el = rulerRef.current
    if (!el) return
    setWidth(el.clientWidth)
    const observer = new ResizeObserver(() => setWidth(el.clientWidth))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const marks: Mark[] = [
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

  // Marks closer together than one hit area would sit on top of each other, so they share one mark
  // that lists them. A hit area is 20px with a mouse and 44px with a finger.
  const hit = coarse ? 44 : 20
  const groups: Mark[][] = []
  for (const m of marks) {
    const last = groups.at(-1)
    const x = (minutes(m.at) / 1440) * width
    if (last && x - (minutes(last[0].at) / 1440) * width < hit) last.push(m)
    else groups.push([m])
  }

  const open = (m: Mark) => (m.kind === 'task' ? onOpenTask(m.id) : onOpenEvent(m.id))

  return (
    <div role="group" className="relative select-none" aria-label="Today, hour by hour">
      <div ref={rulerRef} className="relative h-10">
        {Array.from({ length: 25 }, (_, h) => (
          <span
            key={h}
            aria-hidden
            className={`absolute bottom-0 w-px -translate-x-1/2 bg-line ${h % 6 === 0 ? 'h-3' : 'h-1.5'}`}
            style={{ left: `${(h / 24) * 100}%` }}
          />
        ))}
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-line" />

        {groups.map((g) => {
          const key = `${g[0].kind}-${g[0].id}`
          return g.length === 1 ? (
            <button
              key={key}
              type="button"
              title={`${format(g[0].at, 'HH:mm')} ${g[0].label}`}
              aria-label={`${g[0].kind === 'task' ? 'Deadline' : 'Event'} at ${format(g[0].at, 'HH:mm')}: ${g[0].label}`}
              onClick={() => open(g[0])}
              className="absolute bottom-0 grid h-8 w-5 -translate-x-1/2 place-items-end justify-center pb-1 pointer-coarse:h-11 pointer-coarse:w-11"
              style={{ left: pct(g[0].at) }}
            >
              <MarkGlyph marks={g} />
            </button>
          ) : (
            <MarkGroup
              key={key}
              marks={g}
              left={pct(g[0].at)}
              alignEnd={minutes(g[0].at) > 720}
              open={openGroup === key}
              onToggle={(next) => setOpenGroup(next ? key : null)}
              onPick={(m) => {
                setOpenGroup(null)
                open(m)
              }}
            />
          )
        })}

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
            className={`absolute ${h === 0 ? '' : h === 24 ? '-translate-x-full @4xl:hidden' : '-translate-x-1/2'}`}
            style={{ left: `${(h / 24) * 100}%` }}
          >
            {String(h % 24).padStart(2, '0')}:00
          </span>
        ))}
      </div>
      {/* On a wide Home the key sits at the end of the hour labels, where midnight would be, to save a line. */}
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-3 @4xl:absolute @4xl:right-0 @4xl:bottom-0 @4xl:mt-0 @4xl:leading-4">
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

/** A deadline is a diamond, an event a bar. A shared mark takes a deadline's shape if it holds one. */
function MarkGlyph({ marks }: { marks: Mark[] }) {
  const tasks = marks.filter((m) => m.kind === 'task')
  if (tasks.length === 0) return <span className="block h-4 w-1 rounded-full bg-ink-2" />
  const tone = tasks.some((m) => m.late)
    ? 'border-danger bg-danger'
    : tasks.every((m) => m.done)
      ? 'border-ink-3 bg-ink-3'
      : 'border-ink bg-surface'
  return <span className={`block size-2.5 rotate-45 border-[1.5px] ${tone}`} />
}

/** Several marks at nearly the same time: one mark with a count, opening a short list of them. */
function MarkGroup({
  marks,
  left,
  alignEnd,
  open,
  onToggle,
  onPick,
}: {
  marks: Mark[]
  left: string
  alignEnd: boolean
  open: boolean
  onToggle: (open: boolean) => void
  onPick: (m: Mark) => void
}) {
  const listId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const first = format(marks[0].at, 'HH:mm')
  const last = format(marks.at(-1)!.at, 'HH:mm')
  const when = first === last ? `at ${first}` : `from ${first} to ${last}`

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) onToggle(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open, onToggle])

  return (
    <div
      ref={wrapRef}
      className="absolute bottom-0"
      style={{ left }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation()
          onToggle(false)
          triggerRef.current?.focus()
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${marks.length} items ${when}`}
        onClick={() => onToggle(!open)}
        className="absolute bottom-0 grid h-8 w-5 -translate-x-1/2 place-items-end justify-center pb-1 pointer-coarse:h-11 pointer-coarse:w-11"
      >
        <span aria-hidden className="absolute top-0 left-1/2 -translate-x-1/2 text-[11px] leading-none font-semibold text-ink-2 tnum">
          {marks.length}
        </span>
        <MarkGlyph marks={marks} />
      </button>
      {open && (
        <ul
          id={listId}
          className={`pop-in absolute top-2 z-20 w-64 max-w-[calc(100vw-48px)] rounded-[10px] border border-line bg-surface py-1 shadow-float select-text ${
            alignEnd ? 'right-0 origin-top-right' : 'left-0 origin-top-left'
          }`}
        >
          {marks.map((m) => (
            <li key={`${m.kind}-${m.id}`}>
              <button
                type="button"
                onClick={() => onPick(m)}
                className="row-hover flex min-h-9 w-full items-center gap-2.5 px-3 py-1.5 text-left pointer-coarse:min-h-11"
              >
                <span aria-hidden className="flex w-3 shrink-0 justify-center">
                  <MarkGlyph marks={[m]} />
                </span>
                <span className="w-11 shrink-0 text-[13px] text-ink-2 tnum">{format(m.at, 'HH:mm')}</span>
                <span className={`min-w-0 truncate ${m.done ? 'text-ink-3 line-through' : ''}`}>{m.label}</span>
                <span className="sr-only">{m.kind === 'task' ? ', deadline' : ', event'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function useCoarsePointer() {
  const [coarse, setCoarse] = useState(() => matchMedia('(pointer: coarse)').matches)
  useEffect(() => {
    const query = matchMedia('(pointer: coarse)')
    const onChange = () => setCoarse(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return coarse
}
