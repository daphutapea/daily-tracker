// The bridge to the Mac app (macos/main.swift). In a browser none of this exists and every call is
// a no-op, so the web version is unchanged.
import { useSyncExternalStore } from 'react'

/** One reminder handed to macOS. It fires at `at` even if the window is closed or the app has quit. */
export interface NativeReminder {
  /** Changes when the reminder time changes, so macOS replaces rather than duplicates it. */
  id: string
  kind: 'task' | 'event' | 'summary'
  taskId: string | null
  title: string
  body: string
  /** Milliseconds since 1970. */
  at: number
  /** Where clicking the notification opens, for example "/?task=<id>". */
  path: string
}

/** One line in the menu bar's list of what's left today. */
export interface TodayItem {
  /** "09:30", "All day", or "Overdue" for a task whose time today has passed. */
  when: string
  title: string
  path: string
}

type ToMac =
  | { type: 'hello' }
  /** `calendar`: also put them in the Daily Tracker calendar in iCloud, so an iPhone alerts too. */
  | { type: 'reminders'; reminders: NativeReminder[]; calendar: boolean }
  | { type: 'today'; overdue: number; badge: number; items: TodayItem[] }
  | { type: 'requestPermission' }
  | { type: 'openNotificationSettings' }
  | { type: 'openCalendarSettings' }
  | { type: 'testNotification' }
  | { type: 'save'; filename: string; content: string }

export type FromMac =
  | { type: 'permission'; status: 'granted' | 'denied' | 'undetermined' }
  | { type: 'open'; path: string }
  | { type: 'done'; taskId: string }
  | { type: 'tracky' }
  | { type: 'saved'; name: string }
  | { type: 'calendar'; status: CalendarStatus }

const handler = (window as { webkit?: { messageHandlers?: { dailyTracker?: { postMessage(m: unknown): void } } } }).webkit
  ?.messageHandlers?.dailyTracker

export const inMacApp = Boolean(handler)

export function postToMac(message: ToMac) {
  handler?.postMessage(message)
}

/** Where the iPhone alerts stand: Calendar access, and whether the calendar landed in iCloud. */
export type CalendarStatus = 'off' | 'granted' | 'denied' | 'undetermined' | 'local' | 'error'

const listeners = new Set<(m: FromMac) => void>()
let permission: 'granted' | 'denied' | 'undetermined' | null = null
let calendarStatus: CalendarStatus | null = null

/** The Mac app calls this with evaluateJavaScript. Messages that arrive before the page says hello are held there. */
;(window as { dailyTrackerNative?: (m: FromMac) => void }).dailyTrackerNative = (m) => {
  if (m.type === 'permission') permission = m.status
  if (m.type === 'calendar') calendarStatus = m.status
  listeners.forEach((l) => l(m))
}

export function onMacMessage(listener: (m: FromMac) => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** macOS's notification permission for the app, or null in a browser or before the app has answered. */
export function useMacPermission() {
  return useSyncExternalStore(
    (cb) => onMacMessage((m) => m.type === 'permission' && cb()),
    () => permission,
  )
}

/** The iPhone alerts' state as the Mac app last reported it, or null before it has. */
export function useMacCalendarStatus() {
  return useSyncExternalStore(
    (cb) => onMacMessage((m) => m.type === 'calendar' && cb()),
    () => calendarStatus,
  )
}

/** An on/off preference for the Mac app, saved on this Mac. */
function macSetting(key: string, byDefault = true) {
  const read = () => {
    try {
      const saved = localStorage.getItem(key)
      return saved === null ? byDefault : saved === 'on'
    } catch {
      return byDefault
    }
  }
  const write = (on: boolean) => {
    try {
      localStorage.setItem(key, on ? 'on' : 'off')
    } catch {
      // Without storage the setting lasts until the app closes, which is still useful.
    }
    window.dispatchEvent(new Event(key))
  }
  const use = () =>
    useSyncExternalStore((cb) => {
      window.addEventListener(key, cb)
      return () => window.removeEventListener(key, cb)
    }, read)
  return { read, write, use }
}

const reminders = macSetting('dt-mac-reminders')
export const setMacRemindersEnabled = reminders.write
export const useMacRemindersEnabled = reminders.use

const badge = macSetting('dt-mac-badge')
export const setMacBadgeEnabled = badge.write
export const useMacBadgeEnabled = badge.use

/** Off until you turn it on: it asks for Calendar access and adds a calendar to your iCloud. */
const iphone = macSetting('dt-mac-iphone', false)
export const setMacIphoneEnabled = iphone.write
export const useMacIphoneEnabled = iphone.use

/**
 * Saves a file: through a Save dialog in the Mac app, where a download link does nothing, and as a
 * download in a browser.
 */
export function saveFile(filename: string, content: string, type: string) {
  if (inMacApp) {
    postToMac({ type: 'save', filename, content })
    return
  }
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
