import { useSyncExternalStore } from 'react'

/** Widths in px. Dragging the edge narrower than `snap` folds the sidebar into the icon rail. */
export const SIDEBAR = { min: 200, max: 360, standard: 240, rail: 60, snap: 150 } as const

export interface SidebarState {
  collapsed: boolean
  width: number
}

const KEY = 'dt-sidebar'
const clamp = (w: number) => Math.round(Math.min(SIDEBAR.max, Math.max(SIDEBAR.min, w)))
const listeners = new Set<() => void>()

let state: SidebarState = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<SidebarState> | null
    return {
      collapsed: saved?.collapsed === true,
      width: typeof saved?.width === 'number' ? clamp(saved.width) : SIDEBAR.standard,
    }
  } catch {
    return { collapsed: false, width: SIDEBAR.standard }
  }
})()

export const useSidebar = () =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
  )

/** Per device, like the theme. */
export function saveSidebar() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // Private mode: the layout holds for this visit only.
  }
}

/** `save: false` while the edge is being dragged; saveSidebar() keeps the last width on release. */
export function setSidebar(patch: Partial<SidebarState>, { save = true } = {}) {
  const next = { ...state, ...patch, width: clamp(patch.width ?? state.width) }
  if (next.collapsed === state.collapsed && next.width === state.width) return
  state = next
  if (save) saveSidebar()
  listeners.forEach((l) => l())
}

export const getSidebar = () => state
