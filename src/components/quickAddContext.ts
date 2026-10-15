import { createContext, useContext } from 'react'

/** Opens Quick add from anywhere inside QuickAddProvider. `instant` skips the dialog animation. */
export const OpenQuickAdd = createContext<(opts?: { instant?: boolean }) => void>(() => {})

export const useOpenQuickAdd = () => useContext(OpenQuickAdd)
