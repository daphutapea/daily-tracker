import {
  addDays,
  differenceInCalendarDays,
  endOfWeek,
  format,
  isSameDay,
  isValid,
  parseISO,
  startOfDay,
  startOfWeek,
} from 'date-fns'

export const WEEK_STARTS_ON = 1 as const

export const toDate = (iso: string) => parseISO(iso)

/** "Today 14:00", "Tomorrow 09:30", "Mon 12 Oct, 14:00" */
export function formatWhen(iso: string, now = new Date()): string {
  const d = toDate(iso)
  const days = differenceInCalendarDays(d, now)
  const time = format(d, 'HH:mm')
  if (days === 0) return `Today ${time}`
  if (days === 1) return `Tomorrow ${time}`
  if (days === -1) return `Yesterday ${time}`
  if (Math.abs(days) < 7 && days > 0) return `${format(d, 'EEE')} ${time}`
  return `${format(d, 'EEE d MMM')}, ${time}`
}

export function formatDay(d: Date, now = new Date()): string {
  const days = differenceInCalendarDays(d, now)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  return format(d, 'EEE d MMM')
}

/** Value for <input type="datetime-local"> in the device's time zone. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  return format(toDate(iso), "yyyy-MM-dd'T'HH:mm")
}

export function fromLocalInput(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return isValid(d) ? d.toISOString() : null
}

export function toDateInput(iso: string | null | undefined): string {
  if (!iso) return ''
  return format(toDate(iso), 'yyyy-MM-dd')
}

export const sameDay = (iso: string, d: Date) => isSameDay(toDate(iso), d)

export function weekRange(now = new Date()) {
  return {
    start: startOfWeek(now, { weekStartsOn: WEEK_STARTS_ON }),
    end: endOfWeek(now, { weekStartsOn: WEEK_STARTS_ON }),
  }
}

export function lastNDays(n: number, now = new Date()): Date[] {
  const today = startOfDay(now)
  return Array.from({ length: n }, (_, i) => addDays(today, i - (n - 1)))
}

export function greeting(now = new Date()): string {
  const h = now.getHours()
  if (h < 5) return 'Good night'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone
