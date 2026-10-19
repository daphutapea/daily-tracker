import { createContext, useContext } from 'react'

/** Opens Tracky from anywhere inside QuickAddProvider. `instant` skips the dialog animation. */
export const OpenQuickAdd = createContext<(opts?: { instant?: boolean }) => void>(() => {})

export const useOpenQuickAdd = () => useContext(OpenQuickAdd)
