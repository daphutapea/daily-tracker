import { inMacApp } from './native'

const onApple = () => /Mac|iPhone|iPad/.test(navigator.platform)

/**
 * The shortcut that opens Tracky, as this keyboard shows it. The Mac app uses ⌘T; a browser keeps
 * ⌘T for a new tab and never hands it to the page, so there it is ⌘K (Ctrl K off Apple keyboards).
 * ⌘K works in the Mac app too.
 */
export const shortcutLabel = () => (inMacApp ? '⌘T' : onApple() ? '⌘K' : 'Ctrl K')

/** The same shortcut for aria-keyshortcuts. */
export const shortcutKeys = () => (inMacApp ? 'Meta+T Meta+K' : 'Meta+K Control+K')

/** True for the key press that opens Tracky: ⌘K or Ctrl+K anywhere, and ⌘T in the Mac app. */
export function opensTracky(e: KeyboardEvent) {
  if (e.altKey || e.shiftKey) return false
  const key = e.key.toLowerCase()
  if (key === 'k') return e.metaKey || e.ctrlKey
  return key === 't' && inMacApp && e.metaKey
}
