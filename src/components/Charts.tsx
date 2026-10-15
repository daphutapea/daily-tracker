import { format, isSameDay } from 'date-fns'
import { useState } from 'react'

/** Columns for "tasks finished per day". One series, so no legend; the title names it. */
export function FinishedPerDay({ days, counts }: { days: Date[]; counts: number[] }) {
  const [asTable, setAsTable] = useState(false)
  const max = Math.max(1, ...counts)
  const total = counts.reduce((a, b) => a + b, 0)
  const today = new Date()

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-medium">Tasks finished per day</h3>
        <button type="button" className="text-[13px] text-ink-3 underline-offset-2 hover:underline" onClick={() => setAsTable((v) => !v)}>
          {asTable ? 'Show chart' : 'Show table'}
        </button>
      </div>
      <p className="text-[13px] text-ink-3">
        Last 7 days · {total} {total === 1 ? 'task' : 'tasks'}
      </p>

      {asTable ? (
        <table className="mt-3 w-full text-left text-[13px]">
          <thead>
            <tr className="text-ink-3">
              <th className="py-1 font-medium">Day</th>
              <th className="py-1 text-right font-medium">Finished</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d, i) => (
              <tr key={d.toISOString()} className="border-t border-line">
                <td className="py-1.5">{isSameDay(d, today) ? 'Today' : format(d, 'EEE d MMM')}</td>
                <td className="py-1.5 text-right tnum">{counts[i]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="mt-4 flex gap-2">
          <div className="flex h-[120px] flex-col justify-between pb-0 text-right text-[12px] text-ink-3 tnum" aria-hidden>
            <span>{max}</span>
            <span>0</span>
          </div>
          <div className="relative flex-1">
            <div aria-hidden className="absolute inset-x-0 top-[7px] h-px bg-line" />
            <div aria-hidden className="absolute inset-x-0 top-[120px] h-px bg-line-strong/60" />
            <ul className="relative grid h-[128px] grid-cols-7">
              {days.map((d, i) => {
                const n = counts[i]
                const h = Math.round((n / max) * 113)
                const isToday = isSameDay(d, today)
                const label = `${isToday ? 'Today' : format(d, 'EEEE d MMM')}: ${n} ${n === 1 ? 'task' : 'tasks'} finished`
                return (
                  <li key={d.toISOString()} className="group relative flex flex-col items-center justify-end pb-2">
                    <div
                      tabIndex={0}
                      aria-label={label}
                      className="flex h-full w-full items-end justify-center rounded-[4px] focus-visible:outline-offset-0"
                    >
                      <span
                        className="block w-full max-w-6 rounded-t-[4px] bg-ink-2"
                        style={{ height: n === 0 ? 0 : Math.max(h, 3) }}
                      />
                    </div>
                    <span
                      role="tooltip"
                      className="pointer-events-none absolute bottom-full z-10 mb-1 rounded-[6px] border border-line bg-surface px-2 py-1 text-[12px] whitespace-nowrap opacity-0 shadow-float transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
                    >
                      {label}
                    </span>
                  </li>
                )
              })}
            </ul>
            <div className="mt-1 grid grid-cols-7 text-center text-[12px] text-ink-3" aria-hidden>
              {days.map((d) => (
                <span key={d.toISOString()} className={isSameDay(d, today) ? 'font-medium text-ink' : ''}>
                  {isSameDay(d, today) ? 'Today' : format(d, 'EEE')}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Horizontal bars with the count at the tip; labels in text tokens, the bar in one neutral hue. */
export function Breakdown({ title, rows, total }: { title: string; rows: { label: string; value: number }[]; total: number }) {
  return (
    <div>
      <h4 className="section-label">{title}</h4>
      <dl className="mt-2 space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[88px_1fr_28px] items-center gap-3">
            <dt className="text-[13px] text-ink-2">{r.label}</dt>
            <dd className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <span
                className="block h-full rounded-full bg-ink-2"
                style={{ width: total ? `${(r.value / total) * 100}%` : 0 }}
              />
            </dd>
            <dd className="text-right text-[13px] tnum">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export function Meter({ label, done, total }: { label: string; done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-ink-2">{label}</span>
        <span className="font-medium tnum">{total ? `${pct}%` : '–'}</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2"
      >
        <span className="block h-full rounded-full bg-ink-2" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-[13px] text-ink-3">
        {total ? `${done} of ${total} done` : 'No deadlines in this window'}
      </p>
    </div>
  )
}
