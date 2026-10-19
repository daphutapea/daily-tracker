import { useSyncExternalStore } from 'react'

// The intro plays when Daily Tracker opens: once per browser session, and on every launch of the
// Mac app. It can be turned off per device in Settings → Appearance.
const OFF_KEY = 'dt-intro'
const SEEN_KEY = 'dt-intro-seen'
const NAME_KEY = 'dt-name'

function read(storage: () => Storage, key: string) {
  try {
    return storage().getItem(key)
  } catch {
    return null
  }
}
function write(storage: () => Storage, key: string, value: string | null) {
  try {
    if (value === null) storage().removeItem(key)
    else storage().setItem(key, value)
  } catch {
    // Private mode: the preference holds for this visit only.
  }
}

const listeners = new Set<() => void>()
let playing = read(() => localStorage, OFF_KEY) !== 'off' && read(() => sessionStorage, SEEN_KEY) === null
if (playing) write(() => sessionStorage, SEEN_KEY, '1')

const emit = () => listeners.forEach((l) => l())
const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export const useIntroPlaying = () => useSyncExternalStore(subscribe, () => playing)
export function playIntro() {
  playing = true
  emit()
}
export function endIntro() {
  playing = false
  emit()
}

let enabled = read(() => localStorage, OFF_KEY) !== 'off'
export const useIntroEnabled = () => useSyncExternalStore(subscribe, () => enabled)
export function setIntroEnabled(on: boolean) {
  enabled = on
  write(() => localStorage, OFF_KEY, on ? null : 'off')
  emit()
}

/**
 * As the intro fades, Home's sections rise in one after another (`.arrive` in index.css). The
 * attribute comes off once they have finished, so later visits to Home don't animate.
 */
export function arrive() {
  const root = document.documentElement
  root.dataset.arrive = ''
  window.setTimeout(() => delete root.dataset.arrive, 900)
}

/** The greeting name, kept on this device so the intro can use it before your profile has loaded. */
export const rememberedName = () => read(() => localStorage, NAME_KEY)
export const rememberName = (name: string | undefined) => write(() => localStorage, NAME_KEY, name || null)
