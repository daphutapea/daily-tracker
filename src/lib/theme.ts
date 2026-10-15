import { useSyncExternalStore } from 'react'

export type ThemeChoice = 'system' | 'light' | 'dark'
const STORAGE_KEY = 'dt-theme'
const listeners = new Set<() => void>()

function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

let current: ThemeChoice = read()

/** Per-device preference: kept in localStorage, applied as data-theme on <html>. */
export function setTheme(next: ThemeChoice) {
  current = next
  const root = document.documentElement
  // Swap colors in one frame instead of letting every hover transition animate the change.
  root.classList.add('theme-switching')
  if (next === 'system') delete root.dataset.theme
  else root.dataset.theme = next
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')))
  try {
    if (next === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Private mode: the choice still applies for this visit.
  }
  listeners.forEach((l) => l())
}

export function useTheme(): ThemeChoice {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => current,
  )
}
