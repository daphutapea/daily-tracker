import { toast } from 'sonner'
import { quietly, useRestoreRow } from './queries'

/**
 * After a delete, a toast with Undo instead of an "Are you sure?" before it: deleting stays one
 * click, and a slip costs one more. Undo puts the row back exactly as it was.
 */
export function useOfferUndo() {
  const restore = useRestoreRow()
  return (label: string, table: 'tasks' | 'events' | 'notes', row: object) =>
    toast(label, {
      duration: 8000,
      action: {
        label: 'Undo',
        onClick: quietly(async () => {
          await restore.mutateAsync({ table, row })
          toast.success('Restored')
        }),
      },
    })
}
