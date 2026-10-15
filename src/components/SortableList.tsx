import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
  type Modifier,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CSSProperties, ReactNode } from 'react'

const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 })
const SHIFT = { duration: 200, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }

export interface SortableItemProps {
  setNodeRef: (el: HTMLElement | null) => void
  style: CSSProperties
  isDragging: boolean
  /** Spread on the element you drag by: the whole row, or a grip handle. */
  handle: NonNullable<DraggableSyntheticListeners> & { ref: (el: HTMLElement | null) => void }
  /** Button role, focus and screen-reader wiring for a dedicated grip. Leave these off a link. */
  handleAttributes: DraggableAttributes
}

/**
 * A vertical list you can reorder by dragging. Neighbours slide out of the way as you drag, and the
 * dropped item settles into place. With `keyboard`, the handle also works with Space, the arrow keys
 * and Space again; leave it off when the handle is a link, so Enter still opens it.
 */
export function SortableList<T extends { id: string }>({
  items,
  getLabel,
  onReorder,
  keyboard = false,
  children,
}: {
  items: T[]
  getLabel: (item: T) => string
  onReorder: (next: T[]) => void
  keyboard?: boolean
  children: (item: T, sortable: SortableItemProps) => ReactNode
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: keyboard
        ? { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] }
        : { start: [], cancel: ['Escape'], end: [] },
    }),
  )
  const label = (id: string | number) => {
    const item = items.find((i) => i.id === id)
    return item ? getLabel(item) : 'item'
  }
  const position = (id: string | number | undefined) => items.findIndex((i) => i.id === id) + 1

  function onDragEnd(e: DragEndEvent) {
    swallowNextClick()
    if (!e.over || e.active.id === e.over.id) return
    const from = items.findIndex((i) => i.id === e.active.id)
    const to = items.findIndex((i) => i.id === e.over!.id)
    onReorder(arrayMove(items, from, to))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[verticalOnly]}
      onDragEnd={onDragEnd}
      onDragCancel={swallowNextClick}
      accessibility={{
        screenReaderInstructions: {
          draggable: 'To reorder, press Space to pick this up, use the arrow keys to move it, then press Space again to drop it. Escape cancels.',
        },
        announcements: {
          onDragStart: ({ active }) => `Picked up ${label(active.id)}, position ${position(active.id)} of ${items.length}.`,
          onDragOver: ({ active, over }) =>
            over ? `${label(active.id)} is now at position ${position(over.id)} of ${items.length}.` : undefined,
          onDragEnd: ({ active, over }) =>
            over ? `Dropped ${label(active.id)} at position ${position(over.id)} of ${items.length}.` : `Dropped ${label(active.id)}.`,
          onDragCancel: ({ active }) => `Cancelled. ${label(active.id)} stayed where it was.`,
        },
      }}
    >
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        {items.map((item) => (
          <SortableItem key={item.id} id={item.id}>
            {(sortable) => children(item, sortable)}
          </SortableItem>
        ))}
      </SortableContext>
    </DndContext>
  )
}

/**
 * The browser fires a click when the mouse is released at the end of a drag, and on a link that
 * click opens the site. The drag library stops the click from reaching React but not the browser's
 * default action, so cancel it at the window, ahead of everything else. The listener lives only until
 * the current event finishes, so a drag that ends without a click (keyboard, drop elsewhere) can't eat
 * a later, real click.
 */
function swallowNextClick() {
  const block = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }
  window.addEventListener('click', block, { capture: true })
  setTimeout(() => window.removeEventListener('click', block, { capture: true }), 0)
}

function SortableItem({ id, children }: { id: string; children: (sortable: SortableItemProps) => ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    transition: SHIFT,
  })
  return children({
    setNodeRef,
    isDragging,
    style: { transform: CSS.Translate.toString(transform), transition, position: 'relative', zIndex: isDragging ? 10 : undefined },
    handle: { ...listeners, ref: setActivatorNodeRef },
    handleAttributes: attributes,
  })
}
