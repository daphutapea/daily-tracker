import { TrashIcon } from '@phosphor-icons/react'
import { addHours, format, set, startOfHour, subDays, subHours, subMinutes } from 'date-fns'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { fromLocalInput, toDate, toDateInput, toLocalInput } from '@/lib/dates'
import { useDialogs } from '@/lib/dialogs'
import { quietly, useDeleteEvent, useEvents, useProfile, useSaveEvent } from '@/lib/queries'
import type { CalEvent } from '@/lib/types'
import { Dialog } from './Dialog'
import { Loading } from './ui'

export function EventDialogHost() {
  const { eventId, date, close } = useDialogs()
  const [shown, setShown] = useState<{ id: string; date: string | null } | null>(null)
  const dirtyRef = useRef(false)
  const events = useEvents()

  useEffect(() => {
    if (eventId) setShown({ id: eventId, date })
  }, [eventId, date])

  const requestClose = () => {
    if (dirtyRef.current && !window.confirm('Discard your changes to this event?')) return
    dirtyRef.current = false
    close()
  }

  const isNew = shown?.id === 'new'
  const existing = !isNew && shown ? events.data?.find((e) => e.id === shown.id) : undefined

  return (
    <Dialog open={!!eventId} onRequestClose={requestClose} title={isNew ? 'New event' : 'Edit event'} size="sm">
      {shown &&
        (isNew ? (
          <EventForm key={`new-${shown.date}`} event={null} defaultDate={shown.date} dirtyRef={dirtyRef} onDone={close} />
        ) : existing ? (
          <EventForm key={existing.id} event={existing} defaultDate={null} dirtyRef={dirtyRef} onDone={close} />
        ) : events.isPending ? (
          <Loading what="event" />
        ) : (
          <p className="py-6 text-center text-ink-2">This event no longer exists. It may have been deleted on another device.</p>
        ))}
    </Dialog>
  )
}

interface FormState {
  title: string
  allDay: boolean
  start: string
  end: string
  location: string
  details: string
  remind: string
}

const PRESETS: { label: string; from: (d: Date) => Date }[] = [
  { label: 'At start', from: (d) => d },
  { label: '10 min before', from: (d) => subMinutes(d, 10) },
  { label: '1 hour before', from: (d) => subHours(d, 1) },
  { label: '1 day before', from: (d) => subDays(d, 1) },
]

function initialState(event: CalEvent | null, defaultDate: string | null): FormState {
  if (event) {
    return {
      title: event.title,
      allDay: event.all_day,
      start: event.all_day ? toDateInput(event.starts_at) : toLocalInput(event.starts_at),
      end: event.ends_at ? (event.all_day ? toDateInput(event.ends_at) : toLocalInput(event.ends_at)) : '',
      location: event.location ?? '',
      details: event.details ?? '',
      remind: toLocalInput(event.remind_at),
    }
  }
  // Today defaults to the next full hour; any other day defaults to 09:00.
  const start =
    defaultDate && defaultDate !== format(new Date(), 'yyyy-MM-dd')
      ? set(new Date(`${defaultDate}T00:00`), { hours: 9 })
      : startOfHour(addHours(new Date(), 1))
  return {
    title: '',
    allDay: false,
    start: format(start, "yyyy-MM-dd'T'HH:mm"),
    end: format(addHours(start, 1), "yyyy-MM-dd'T'HH:mm"),
    location: '',
    details: '',
    remind: '',
  }
}

function EventForm({
  event,
  defaultDate,
  dirtyRef,
  onDone,
}: {
  event: CalEvent | null
  defaultDate: string | null
  dirtyRef: React.RefObject<boolean>
  onDone: () => void
}) {
  const initial = useMemo(() => initialState(event, defaultDate), [event, defaultDate])
  const [f, setF] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const save = useSaveEvent()
  const del = useDeleteEvent()
  const profile = useProfile()

  const dirty = JSON.stringify(f) !== JSON.stringify(initial)
  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty, dirtyRef])

  const up = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }))

  function toggleAllDay(allDay: boolean) {
    setF((s) => ({
      ...s,
      allDay,
      start: s.start ? (allDay ? s.start.slice(0, 10) : `${s.start.slice(0, 10)}T09:00`) : '',
      end: s.end ? (allDay ? s.end.slice(0, 10) : `${s.end.slice(0, 10)}T10:00`) : '',
    }))
  }

  const startDate = f.start ? new Date(f.allDay ? `${f.start}T00:00` : f.start) : null

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    const title = f.title.trim()
    if (!title) return setError('Give the event a title.')
    if (!f.start) return setError('Pick when it starts.')
    const startsAt = f.allDay ? new Date(`${f.start}T00:00`).toISOString() : fromLocalInput(f.start)
    const endsAt = f.end ? (f.allDay ? new Date(`${f.end}T23:59`).toISOString() : fromLocalInput(f.end)) : null
    if (startsAt && endsAt && endsAt < startsAt) return setError('The end is before the start.')
    setError(null)
    await save.mutateAsync({
      id: event?.id,
      title,
      all_day: f.allDay,
      starts_at: startsAt!,
      ends_at: endsAt,
      location: f.location.trim() || null,
      details: f.details.trim() || null,
      remind_at: fromLocalInput(f.remind),
    })
    dirtyRef.current = false
    toast.success(event ? 'Event saved' : 'Event added')
    onDone()
  }

  async function remove() {
    if (!event || !window.confirm('Delete this event? This can’t be undone.')) return
    await del.mutateAsync(event.id)
    dirtyRef.current = false
    toast.success('Event deleted')
    onDone()
  }

  const inputType = f.allDay ? 'date' : 'datetime-local'

  return (
    <form
      onSubmit={quietly(submit)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          quietly(submit)()
        }
      }}
      className="space-y-4"
      noValidate
    >
      <div>
        <label htmlFor="event-title" className="label">
          Title
        </label>
        <input
          id="event-title"
          autoFocus={!event}
          className="field"
          maxLength={200}
          value={f.title}
          onChange={(e) => up('title', e.target.value)}
        />
      </div>
      <label className="flex min-h-9 cursor-pointer items-center gap-2 text-ink-2">
        <input
          type="checkbox"
          className="size-4 accent-[var(--ink)]"
          checked={f.allDay}
          onChange={(e) => toggleAllDay(e.target.checked)}
        />
        All day
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="event-start" className="label">
            Starts
          </label>
          <input id="event-start" type={inputType} className="field" value={f.start} onChange={(e) => up('start', e.target.value)} />
        </div>
        <div>
          <label htmlFor="event-end" className="label">
            Ends <span className="font-normal text-ink-3">(optional)</span>
          </label>
          <input id="event-end" type={inputType} className="field" value={f.end} onChange={(e) => up('end', e.target.value)} />
        </div>
      </div>
      <div>
        <label htmlFor="event-location" className="label">
          Where <span className="font-normal text-ink-3">(optional)</span>
        </label>
        <input
          id="event-location"
          className="field"
          maxLength={200}
          placeholder="Room, address or meeting link"
          value={f.location}
          onChange={(e) => up('location', e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="event-remind" className="label">
          Remind me
        </label>
        <input id="event-remind" type="datetime-local" className="field" value={f.remind} onChange={(e) => up('remind', e.target.value)} />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PRESETS.map((p) => {
            const value = startDate ? format(p.from(startDate), "yyyy-MM-dd'T'HH:mm") : ''
            return (
              <button
                key={p.label}
                type="button"
                className="chip"
                disabled={!startDate}
                aria-pressed={!!value && value === f.remind}
                onClick={() => up('remind', value)}
              >
                {p.label}
              </button>
            )
          })}
          {f.remind && (
            <button type="button" className="chip !text-danger" onClick={() => up('remind', '')}>
              No reminder
            </button>
          )}
        </div>
        {f.remind && !profile.data?.telegram_chat_id && (
          <p className="mt-2 text-[13px] text-ink-3">Telegram isn’t linked yet, so this only shows while the app is open.</p>
        )}
      </div>
      <div>
        <label htmlFor="event-details" className="label">
          Details <span className="font-normal text-ink-3">(optional)</span>
        </label>
        <textarea
          id="event-details"
          rows={3}
          maxLength={4000}
          className="field resize-y"
          value={f.details}
          onChange={(e) => up('details', e.target.value)}
        />
      </div>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {/* -bottom-4 cancels the scroll area's bottom padding so the bar sits flush with the dialog edge. */}
      <div className="safe-bottom sticky -bottom-4 -mx-5 -mb-4 flex items-center gap-2 border-t border-line bg-surface px-5 py-3">
        {event && (
          <button type="button" className="btn btn-danger -ml-2" onClick={quietly(remove)} disabled={del.isPending}>
            <TrashIcon size={16} weight="bold" />
            Delete
          </button>
        )}
        {event && (
          <span className="hidden text-[13px] text-ink-3 sm:inline">Added {format(toDate(event.created_at), 'd MMM')}</span>
        )}
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              if (dirty && !window.confirm('Discard your changes to this event?')) return
              dirtyRef.current = false
              onDone()
            }}
          >
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : event ? 'Save event' : 'Add event'}
          </button>
        </div>
      </div>
    </form>
  )
}
