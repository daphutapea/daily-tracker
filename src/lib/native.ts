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
  /**
   * `calendar`: also put them in the Daily Tracker calendar in iCloud, so an iPhone alerts too.
   * `openTasks`: the tasks not done yet. A snoozed reminder for any other task is cancelled.
   */
  | { type: 'reminders'; reminders: NativeReminder[]; calendar: boolean; openTasks: string[] }
  | { type: 'today'; overdue: number; badge: number; items: TodayItem[] }
  | { type: 'requestPermission' }
  | { type: 'openNotificationSettings' }
  | { type: 'openCalendarSettings' }
  | { type: 'testNotification' }
  | { type: 'save'; filename: string; content: string }
  /** A backup, written without asking to iCloud Drive (or Documents) › Daily Tracker Backups. */
  | { type: 'backup'; filename: string; content: string }
  | { type: 'showBackups' }
  /** iPhone app: what its background refresh needs to fetch and plan on its own. */
  | { type: 'native'; switches: { reminders: boolean; badge: boolean }; supabaseUrl: string; supabaseKey: string }

export type FromMac =
  | { type: 'permission'; status: 'granted' | 'denied' | 'undetermined' }
  | { type: 'open'; path: string }
  | { type: 'done'; taskId: string }
  | { type: 'tracky' }
  | { type: 'saved'; name: string }
  | { type: 'calendar'; status: CalendarStatus }
  /** `at` is an ISO time; `folder` reads like "iCloud Drive › Daily Tracker Backups". */
  | { type: 'backedUp'; at: string; folder: string }
  | { type: 'backupFailed'; message: string }

const handler = (window as { webkit?: { messageHandlers?: { dailyTracker?: { postMessage(m: unknown): void } } } }).webkit
  ?.messageHandlers?.dailyTracker

type SessionReply = (message: { op: 'get' | 'set' | 'remove'; key: string; value?: string }) => Promise<string | null>
const sessionHandler = (window as { webkit?: { messageHandlers?: { dailyTrackerSession?: { postMessage: SessionReply } } } }).webkit
  ?.messageHandlers?.dailyTrackerSession

/**
 * Where the iPhone app keeps the sign-in: in the iOS Keychain, through the app, rather than in the
 * page's storage. Its background refresh renews and uses the same session, so the two never hold
 * different refresh tokens (Supabase signs you out when a used one comes back). A session left in the
 * page's storage by an earlier version moves over the first time it's read.
 */
export const appSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const earlier = pageStorage.get(key)
    let kept: string | null
    try {
      kept = await sessionHandler!.postMessage({ op: 'get', key })
    } catch {
      return earlier
    }
    if (kept != null || earlier == null) return kept
    // Moved over only once the app has it, so a failed move never signs you out.
    try {
      await sessionHandler!.postMessage({ op: 'set', key, value: earlier })
      pageStorage.remove(key)
    } catch {
      // The Keychain refused it: it stays where it was.
    }
    return earlier
  },
  async setItem(key: string, value: string) {
    try {
      await sessionHandler!.postMessage({ op: 'set', key, value })
      pageStorage.remove(key)
    } catch {
      pageStorage.set(key, value)
    }
  },
  async removeItem(key: string) {
    pageStorage.remove(key)
    await sessionHandler!.postMessage({ op: 'remove', key }).catch(() => null)
  },
}

/** The page's own storage, which may be blocked. */
const pageStorage = {
  get(key: string) {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value)
    } catch {
      // Nowhere to keep it: the sign-in lasts until the app closes.
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key)
    } catch {
      // Nothing to remove.
    }
  },
}

/** Set by the iPhone app before the page runs; the Mac app leaves it unset. */
const platform = (window as { dailyTrackerPlatform?: string }).dailyTrackerPlatform

/** Inside one of the native apps, which keep reminders and summaries as system notifications. */
export const inNativeApp = Boolean(handler)
export const inIphoneApp = inNativeApp && platform === 'ios'
export const inMacApp = inNativeApp && !inIphoneApp
/** "Mac" or "iPhone", for the words on screen. */
export const deviceName = inIphoneApp ? 'iPhone' : 'Mac'

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

/** On until you turn it off: a copy of everything goes to iCloud Drive once a week. */
const backups = macSetting('dt-mac-backups')
export const readMacBackupsEnabled = backups.read
export const setMacBackupsEnabled = backups.write
export const useMacBackupsEnabled = backups.use

/** When and where the Mac app last saved a backup, as it reported it. Kept on this Mac. */
export interface LastBackup {
  at: string
  folder: string
}
const LAST_BACKUP = 'dt-mac-last-backup'
let lastBackup: LastBackup | null = (() => {
  try {
    return JSON.parse(localStorage.getItem(LAST_BACKUP) ?? 'null') as LastBackup | null
  } catch {
    return null
  }
})()
onMacMessage((m) => {
  if (m.type !== 'backedUp') return
  lastBackup = { at: m.at, folder: m.folder }
  try {
    localStorage.setItem(LAST_BACKUP, JSON.stringify(lastBackup))
  } catch {
    // Without storage the next launch backs up again, which does no harm.
  }
})
export const readLastBackup = () => lastBackup
export function useLastBackup() {
  return useSyncExternalStore(
    (cb) => onMacMessage((m) => m.type === 'backedUp' && cb()),
    () => lastBackup,
  )
}

/**
 * Saves a file: through a Save dialog in the Mac app, where a download link does nothing, and as a
 * download in a browser.
 */
export function saveFile(filename: string, content: string, type: string) {
  if (inNativeApp) {
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
