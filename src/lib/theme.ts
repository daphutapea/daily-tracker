import { useSyncExternalStore } from 'react'

export type ThemeMode = 'system' | 'light' | 'dark'
export type LightPalette = 'sage' | 'white'
export type DarkPalette = 'navy' | 'charcoal'
export type Palette = LightPalette | DarkPalette

export interface ThemeState {
  mode: ThemeMode
  light: LightPalette
  dark: DarkPalette
  /** What is on screen right now, after resolving "system". */
  palette: Palette
  scheme: 'light' | 'dark'
}

// Same keys and resolution rules as the inline script in index.html, which applies them before first paint.
const KEYS = { mode: 'dt-theme', light: 'dt-light', dark: 'dt-dark' } as const
const systemDark = window.matchMedia('(prefers-color-scheme: dark)')
const listeners = new Set<() => void>()

function stored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return allowed.includes(v as T) ? (v as T) : fallback
  } catch {
    return fallback
  }
}

function resolve(mode: ThemeMode, light: LightPalette, dark: DarkPalette): ThemeState {
  const scheme = mode === 'system' ? (systemDark.matches ? 'dark' : 'light') : mode
  return { mode, light, dark, scheme, palette: scheme === 'dark' ? dark : light }
}

let state = resolve(
  stored(KEYS.mode, ['system', 'light', 'dark'], 'system'),
  stored(KEYS.light, ['sage', 'white'], 'sage'),
  stored(KEYS.dark, ['navy', 'charcoal'], 'navy'),
)

function apply(next: ThemeState) {
  const root = document.documentElement
  if (root.dataset.palette !== next.palette) {
    // Swap colors in one frame instead of letting every hover transition animate the change.
    root.classList.add('theme-switching')
    root.dataset.palette = next.palette
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')))
  }
  state = next
  listeners.forEach((l) => l())
}

/** Per-device preference: kept in localStorage. */
export function updateTheme(patch: Partial<Pick<ThemeState, 'mode' | 'light' | 'dark'>>) {
  const mode = patch.mode ?? state.mode
  const light = patch.light ?? state.light
  const dark = patch.dark ?? state.dark
  try {
    localStorage.setItem(KEYS.mode, mode)
    localStorage.setItem(KEYS.light, light)
    localStorage.setItem(KEYS.dark, dark)
  } catch {
    // Private mode: the choice still applies for this visit.
  }
  apply(resolve(mode, light, dark))
}

systemDark.addEventListener('change', () => apply(resolve(state.mode, state.light, state.dark)))
apply(state)

export function useTheme(): ThemeState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
  )
}
