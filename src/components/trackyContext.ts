import { createContext, useContext } from 'react'

/** Opens Tracky from anywhere inside TrackyProvider. `instant` skips the dialog animation. */
export const OpenTracky = createContext<(opts?: { instant?: boolean }) => void>(() => {})

export const useOpenTracky = () => useContext(OpenTracky)
