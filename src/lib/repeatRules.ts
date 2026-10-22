// When repeating events happen. No app imports here, so `node --test` can check it directly.
import { addDays, addMonths, addWeeks, addYears } from 'date-fns'

export type RepeatRule = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly'

export const REPEAT_OPTIONS: { value: RepeatRule | ''; label: string }[] = [
  { value: '', label: 'Doesn’t repeat' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Every weekday' },
  { value: 'weekly', label: 'Every week' },
  { value: 'monthly', label: 'Every month' },
  { value: 'yearly', label: 'Every year' },
]

/** "Every week", or an empty string for something that doesn't repeat. */
export const repeatLabel = (rule: RepeatRule | null | undefined) =>
  rule ? (REPEAT_OPTIONS.find((o) => o.value === rule)?.label ?? '') : ''

/** How far ahead an event series is written, and how close its end may get before more is added. */
export const AHEAD_DAYS = 92
export const TOP_UP_DAYS = 7
/** At most this many occurrences are written at once, so a daily series can't flood the calendar. */
const MAX_AT_ONCE = 120

/**
 * Every occurrence of a series, from its first. Each is counted from the first rather than from the
 * one before, so a monthly event on the 31st is back on the 31st after a shorter month.
 */
export function* occurrences(anchor: Date, rule: RepeatRule): Generator<Date> {
  if (rule === 'weekdays') {
    yield anchor
    for (let day = addDays(anchor, 1); ; day = addDays(day, 1)) {
      if (day.getDay() !== 0 && day.getDay() !== 6) yield day
    }
  }
  const step = { daily: addDays, weekly: addWeeks, monthly: addMonths, yearly: addYears }[rule]
  for (let k = 0; ; k++) yield step(anchor, k)
}

/** The occurrences after `after` that start before `until`. */
export function occurrencesBetween(anchor: Date, rule: RepeatRule, after: Date, until: Date): Date[] {
  const found: Date[] = []
  for (const at of occurrences(anchor, rule)) {
    if (at >= until || found.length >= MAX_AT_ONCE) break
    if (at > after) found.push(at)
  }
  return found
}

/** What an event needs to be copied to another time. */
export interface EventTimes {
  starts_at: string
  ends_at: string | null
  remind_at: string | null
}

/** The same event starting at `at`: its end and reminder keep their distance from the start. */
export function moveTo<T extends EventTimes>(event: T, at: Date): T {
  const start = new Date(event.starts_at).getTime()
  const by = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - start + at.getTime()).toISOString() : null)
  return { ...event, starts_at: at.toISOString(), ends_at: by(event.ends_at), remind_at: by(event.remind_at) }
}
