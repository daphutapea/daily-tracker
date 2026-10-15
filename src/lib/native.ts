// The bridge to the Mac app (macos/main.swift). In a browser none of this exists and every call is
// a no-op, so the web version is unchanged.
import { useSyncExternalStore } from 'react'

/** One reminder handed to macOS. It fires at `at` even if the window is closed or the app has quit. */
export interface NativeReminder {
  /** Changes when the reminder time changes, so macOS replaces rather than duplicates it. */
  id: string
  kind: 'task' | 'event'
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
  | { type: 'reminders'; reminders: NativeReminder[] }
  | { type: 'today'; overdue: number; badge: number; items: TodayItem[] }
  | { type: 'requestPermission' }
  | { type: 'openNotificationSettings' }
  | { type: 'testNotification' }
  | { type: 'save'; filename: string; content: string }

export type FromMac =
  | { type: 'permission'; status: 'granted' | 'denied' | 'undetermined' }
  | { type: 'open'; path: string }
  | { type: 'done'; taskId: string }
  | { type: 'quickAdd' }
  | { type: 'saved'; name: string }

const handler = (window as { webkit?: { messageHandlers?: { dailyTracker?: { postMessage(m: unknown): void } } } }).webkit
  ?.messageHandlers?.dailyTracker

export const inMacApp = Boolean(handler)

export function postToMac(message: ToMac) {
  handler?.postMessage(message)
}

const listeners = new Set<(m: FromMac) => void>()
let permission: 'granted' | 'denied' | 'undetermined' | null = null

/** The Mac app calls this with evaluateJavaScript. Messages that arrive before the page says hello are held there. */
;(window as { dailyTrackerNative?: (m: FromMac) => void }).dailyTrackerNative = (m) => {
  if (m.type === 'permission') permission = m.status
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

/** An on/off preference for the Mac app, saved on this Mac and on by default. */
function macSetting(key: string) {
  const read = () => {
    try {
      return localStorage.getItem(key) !== 'off'
    } catch {
      return true
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
