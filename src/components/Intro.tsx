import { format } from 'date-fns'
import { useEffect, useState, type CSSProperties } from 'react'
import { greeting } from '@/lib/dates'
import { arrive, endIntro, rememberedName } from '@/lib/intro'
import { LogoMark } from './Logo'

/**
 * Plays when Daily Tracker opens, over the app while it loads: the mark, the day ruler drawing
 * itself, the "now" line travelling to the current time, then the greeting. About 1.5 seconds; a
 * click or tap fades it out early and a key press removes it at once. With reduced motion it only
 * fades. Timings live with the keyframes in index.css.
 */
export function Intro() {
  const [now] = useState(() => new Date())
  const [name] = useState(rememberedName)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const hold = window.setTimeout(() => setLeaving(true), reduce ? 900 : 1300)
    const skip = () => endIntro()
    window.addEventListener('keydown', skip, { capture: true })
    return () => {
      window.clearTimeout(hold)
      window.removeEventListener('keydown', skip, { capture: true })
    }
  }, [])

  useEffect(() => {
    if (!leaving) return
    arrive()
    const done = window.setTimeout(endIntro, 250)
    return () => window.clearTimeout(done)
  }, [leaving])

  const nowPct = ((now.getHours() * 60 + now.getMinutes()) / 1440) * 100

  return (
    <div
      aria-hidden
      onPointerDown={() => setLeaving(true)}
      // In the header band's navy, so the ruler drawn here reads as the one in Home's header.
      className={`intro hero fixed inset-0 z-[60] grid place-items-center rounded-none border-0 px-6 ${leaving ? 'is-leaving' : ''}`}
      style={{ '--now': `${nowPct}%` } as CSSProperties}
    >
      <div className="w-full max-w-md">
        <div className="intro-rise flex items-center gap-3">
          <LogoMark size={40} />
          <span className="text-xl font-semibold tracking-tight">Daily Tracker</span>
        </div>

        <div className="relative mt-10 h-10">
          <div className="intro-draw absolute inset-0">
            {Array.from({ length: 25 }, (_, h) => (
              <span
                key={h}
                className={`absolute bottom-0 w-px -translate-x-1/2 ${h % 6 === 0 ? 'h-3 bg-ruler' : 'h-1.5 bg-line'}`}
                style={{ left: `${(h / 24) * 100}%` }}
              />
            ))}
            <span className="absolute inset-x-0 bottom-0 h-px bg-ruler" />
          </div>
          {/* A full-width track, so translating it by --now carries the line to the current time. */}
          <div className="intro-now absolute inset-0">
            <span className="absolute -top-1 bottom-0 left-0 w-0.5 -translate-x-1/2 rounded-full bg-accent" />
          </div>
        </div>
        <div className="intro-draw relative mt-1 h-4 text-[12px] text-ink-3 tnum">
          <span className="absolute left-0">00:00</span>
          <span className="absolute left-1/2 -translate-x-1/2">12:00</span>
          <span className="absolute right-0">24:00</span>
        </div>

        <p className="intro-rise mt-10 text-2xl font-semibold" style={{ '--d': '500ms' } as CSSProperties}>
          {greeting(now)}
          {name ? `, ${name}` : ''}
        </p>
        <p className="intro-rise mt-1 text-ink-2 tnum" style={{ '--d': '560ms' } as CSSProperties}>
          {format(now, 'EEEE, d MMMM')} · {format(now, 'HH:mm')}
        </p>
      </div>
    </div>
  )
}
