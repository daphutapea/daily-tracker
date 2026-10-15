import { XIcon } from '@phosphor-icons/react'
import { useEffect, useEffectEvent, useId, useRef, type ReactNode } from 'react'

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
  instant = false,
  placement = 'center',
}: {
  open: boolean
  onRequestClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md'
  /** Skip the open/close animation, for dialogs opened by a keyboard shortcut. */
  instant?: boolean
  /**
   * 'top' pins the dialog near the top on a computer, so content that grows it extends downward
   * instead of re-centering the whole dialog. Phones always get the bottom sheet.
   */
  placement?: 'center' | 'top'
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  // Escape fires 'cancel'; the listener is added once and always calls the newest onRequestClose.
  const onCancel = useEffectEvent((e: Event) => {
    e.preventDefault()
    onRequestClose()
  })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) {
      el.showModal()
      // showModal() focuses the first control (the close button). Content can name a better first stop
      // with data-autofocus; React's autoFocus only works for content mounted after the dialog opens.
      el.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    }
    if (!open && el.open) el.close()
  }, [open])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const listener = (e: Event) => onCancel(e)
    el.addEventListener('cancel', listener)
    return () => el.removeEventListener('cancel', listener)
  }, [])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`sheet ${size === 'sm' ? 'sheet-sm' : ''} ${instant ? 'sheet-instant' : ''} ${placement === 'top' ? 'sheet-top' : ''}`}
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
