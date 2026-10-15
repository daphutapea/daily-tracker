import { XIcon } from '@phosphor-icons/react'
import { useEffect, useId, useRef, type ReactNode } from 'react'

/**
 * Native <dialog>: focus trap, Escape and the top layer come from the browser. The element stays
 * mounted so CSS can animate the close; callers keep their content rendered until it finishes.
 */
export function Dialog({
  open,
  onRequestClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onRequestClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md'
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const closeRef = useRef(onRequestClose)
  closeRef.current = onRequestClose

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onCancel = (e: Event) => {
      e.preventDefault()
      closeRef.current()
    }
    el.addEventListener('cancel', onCancel)
    return () => el.removeEventListener('cancel', onCancel)
  }, [])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`sheet ${size === 'sm' ? 'sheet-sm' : ''}`}
      onClick={(e) => {
        // A click whose target is the <dialog> itself landed on the backdrop.
        if (e.target === e.currentTarget) onRequestClose()
      }}
    >
      <div className="flex max-h-[inherit] flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 id={titleId} className="text-base font-semibold">
            {title}
          </h2>
          <button type="button" className="btn btn-ghost btn-icon -mr-2" onClick={onRequestClose} aria-label="Close">
            <XIcon size={18} weight="bold" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {footer && (
          <footer className="safe-bottom flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">{footer}</footer>
        )}
      </div>
    </dialog>
  )
}
