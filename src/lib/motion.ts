/**
 * Shared motion state. Two small things the CSS in index.css reads:
 *
 * - `data-input` on <html> says whether the last thing you did was a key press or a pointer press.
 *   Page and month transitions skip their animation after a key press: keyboard actions stay instant.
 * - Items marked new (just added, restored with Undo, or moved to another day) rise into their list
 *   once, so you can see where they landed.
 */

const root = document.documentElement
const setInput = (kind: 'key' | 'pointer') => {
  if (root.dataset.input !== kind) root.dataset.input = kind
}
window.addEventListener('keydown', () => setInput('key'), { capture: true })
window.addEventListener('pointerdown', () => setInput('pointer'), { capture: true })

const fresh = new Set<string>()

/** Marks rows to animate in the next time they mount, for the next few seconds. */
export function markNew(ids: string[]) {
  for (const id of ids) {
    fresh.add(id)
    window.setTimeout(() => fresh.delete(id), 3000)
  }
}

/** The class for a row that should rise into place, or nothing. */
export const rowIn = (id: string) => (fresh.has(id) ? 'row-in' : '')
