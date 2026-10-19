import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react'
import { addMonths, format, isSameDay, isSameMonth, startOfMonth } from 'date-fns'
import { useMemo, useState } from 'react'
import { monthGrid, WEEKDAYS } from '@/lib/month'
import { useNow } from '@/lib/useNow'

/** Small month view; a mark under a day means something is due or scheduled. */
export function MiniMonth({
  busy,
  onPick,
}: {
  busy: (day: Date) => { deadlines: number; events: number }
  onPick: (day: Date) => void
}) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [dir, setDir] = useState<'next' | 'prev'>()
  const goToMonth = (next: Date) => {
    setDir(next > month ? 'next' : next < month ? 'prev' : dir)
    setMonth(next)
  }
  const days = useMemo(() => monthGrid(month), [month])
  const today = useNow()

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="font-medium" aria-live="polite">
          {format(month, 'MMMM yyyy')}
        </h3>
        <div className="flex items-center gap-1">
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Previous month" onClick={() => goToMonth(addMonths(month, -1))}>
            <CaretLeftIcon size={16} weight="bold" />
          </button>
          <button type="button" className="btn btn-ghost px-2 text-[13px]" onClick={() => goToMonth(startOfMonth(new Date()))}>
            Today
          </button>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Next month" onClick={() => goToMonth(addMonths(month, 1))}>
            <CaretRightIcon size={16} weight="bold" />
          </button>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-7 text-center text-[12px] text-ink-3" aria-hidden>
        {WEEKDAYS.map((d) => (
          <span key={d} className="py-1">
            {d.charAt(0)}
          </span>
        ))}
      </div>
      <div key={format(month, 'yyyy-MM')} data-dir={dir} className="slide-in grid grid-cols-7">
        {days.map((d) => {
          const b = busy(d)
          const isToday = isSameDay(d, today)
          const inMonth = isSameMonth(d, month)
          const parts = [
            format(d, 'EEEE d MMMM'),
            b.deadlines ? `${b.deadlines} due` : '',
            b.events ? `${b.events} ${b.events === 1 ? 'event' : 'events'}` : '',
          ].filter(Boolean)
          return (
            <button
              key={d.toISOString()}
              type="button"
              aria-label={parts.join(', ')}
              aria-current={isToday ? 'date' : undefined}
              onClick={() => onPick(d)}
              className={`row-hover press flex h-11 flex-col items-center justify-center rounded-[6px] text-[13px] tnum board:pointer-fine:h-9 ${
                inMonth ? 'text-ink' : 'text-ink-3'
              }`}
            >
              <span
                className={`grid size-7 place-items-center rounded-full ${isToday ? 'bg-accent font-semibold text-on-accent' : ''}`}
              >
                {format(d, 'd')}
              </span>
              <span className="flex h-1.5 items-center gap-0.5" aria-hidden>
                {b.deadlines > 0 && <span className="block size-1.5 rotate-45 bg-ink-2" />}
                {b.events > 0 && <span className="block h-1.5 w-[3px] rounded-full bg-event" />}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
