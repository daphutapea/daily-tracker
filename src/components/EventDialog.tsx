import { TrashIcon } from '@phosphor-icons/react'
import { useQueryClient } from '@tanstack/react-query'
import { addHours, format, set, startOfHour, subDays, subHours, subMinutes } from 'date-fns'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { fromLocalInput, toDate, toDateInput, toLocalInput } from '@/lib/dates'
import { useDialogs } from '@/lib/dialogs'
import { markNew } from '@/lib/motion'
import { keys, quietly, useDeleteEvent, useEvents, useEventSeries, useSaveEvent } from '@/lib/queries'
import { createSeries, deleteThisAndLater, saveThisAndLater, type EventValues } from '@/lib/repeat'
import { REPEAT_OPTIONS, repeatLabel, type RepeatRule } from '@/lib/repeatRules'
import type { CalEvent } from '@/lib/types'
import { useOfferUndo } from '@/lib/undo'
import { Dialog } from './Dialog'
import { ReminderHint } from './ReminderHint'
import { Loading, Segmented } from './ui'

export function EventDialogHost() {
  const { eventId, date, close } = useDialogs()
  const [shown, setShown] = useState<{ id: string; date: string | null } | null>(null)
  const dirtyRef = useRef(false)
  const events = useEvents()
  const series = useEventSeries()

  // Keep the last event rendered while the dialog animates closed (see TaskDialogHost).
  if (eventId && (shown?.id !== eventId || shown.date !== date)) setShown({ id: eventId, date })

  const requestClose = () => {
    if (dirtyRef.current && !window.confirm('Discard your changes to this event?')) return
    dirtyRef.current = false
    close()
  }

  const isNew = shown?.id === 'new'
  const existing = !isNew && shown ? events.data?.find((e) => e.id === shown.id) : undefined
  // An occurrence of a series opens with its rule, so the form waits for the rules to load.
  const rule = existing?.series_id ? (series.data?.find((s) => s.id === existing.series_id)?.repeat ?? null) : null
  const waiting = !!existing?.series_id && series.isPending

  return (
    <Dialog open={!!eventId} onRequestClose={requestClose} title={isNew ? 'New event' : 'Edit event'} size="sm">
      {shown &&
        (isNew ? (
          <EventForm key={`new-${shown.date}`} event={null} rule={null} defaultDate={shown.date} dirtyRef={dirtyRef} onDone={close} />
        ) : existing && !waiting ? (
          <EventForm key={existing.id} event={existing} rule={rule} defaultDate={null} dirtyRef={dirtyRef} onDone={close} />
        ) : events.isPending || waiting ? (
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
  repeat: RepeatRule | ''
}

const PRESETS: { label: string; from: (d: Date) => Date }[] = [
  { label: 'At start', from: (d) => d },
  { label: '10 min before', from: (d) => subMinutes(d, 10) },
  { label: '1 hour before', from: (d) => subHours(d, 1) },
  { label: '1 day before', from: (d) => subDays(d, 1) },
]

function initialState(event: CalEvent | null, rule: RepeatRule | null, defaultDate: string | null): FormState {
  if (event) {
    return {
      title: event.title,
      allDay: event.all_day,
      start: event.all_day ? toDateInput(event.starts_at) : toLocalInput(event.starts_at),
      end: event.ends_at ? (event.all_day ? toDateInput(event.ends_at) : toLocalInput(event.ends_at)) : '',
      location: event.location ?? '',
      details: event.details ?? '',
      remind: toLocalInput(event.remind_at),
      repeat: rule ?? '',
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
    repeat: '',
  }
}

function EventForm({
  event,
  rule,
  defaultDate,
  dirtyRef,
  onDone,
}: {
  event: CalEvent | null
  /** The rule of the series this event belongs to, if any. */
  rule: RepeatRule | null
  defaultDate: string | null
  dirtyRef: React.RefObject<boolean>
  onDone: () => void
}) {
  const initial = useMemo(() => initialState(event, rule, defaultDate), [event, rule, defaultDate])
  const [f, setF] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  // For an occurrence of a series: whether Save and Delete apply to it alone or to it and later ones.
  const [scope, setScope] = useState<'this' | 'later'>('this')
  const [working, setWorking] = useState(false)
  const qc = useQueryClient()
  const save = useSaveEvent()
  const del = useDeleteEvent()
  const offerUndo = useOfferUndo()
  const inSeries = !!event?.series_id
  // A new rule can only apply from this event on, so that choice is made for you.
  const ruleChanged = (f.repeat || null) !== rule
  const later = inSeries && (scope === 'later' || ruleChanged)
  const refresh = () => {
    qc.invalidateQueries({ queryKey: keys.events })
    qc.invalidateQueries({ queryKey: keys.series })
  }

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

  // Moving the start keeps the event's length, the way calendars do, so the end can't end up first.
  function moveStart(next: string) {
    setF((s) => {
      const parse = (v: string) => new Date(s.allDay ? `${v}T00:00` : v)
      const end = s.start && s.end && next ? new Date(parse(s.end).getTime() + parse(next).getTime() - parse(s.start).getTime()) : null
      if (!end || Number.isNaN(end.getTime())) return { ...s, start: next }
      return { ...s, start: next, end: format(end, s.allDay ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm") }
    })
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
    const values: EventValues = {
      title,
      all_day: f.allDay,
      starts_at: startsAt!,
      ends_at: endsAt,
      location: f.location.trim() || null,
      details: f.details.trim() || null,
      remind_at: fromLocalInput(f.remind),
    }
    const repeat = f.repeat || null
    // A plain event, or one occurrence of a series changed on its own, saves as before.
    if (!ruleChanged && !later) {
      await save.mutateAsync({ id: event?.id, ...values })
      dirtyRef.current = false
      toast.success(event ? 'Event saved' : 'Event added')
      return onDone()
    }
    setWorking(true)
    try {
      if (!event) {
        markNew(await createSeries(values, repeat!))
        toast.success(`Event added, repeating ${repeatLabel(repeat).toLowerCase()}`)
      } else {
        markNew(await saveThisAndLater(event, values, repeat))
        toast.success(
          !repeat ? 'Event saved. It no longer repeats.' : inSeries ? 'Saved this event and every later one' : `Event saved, repeating ${repeatLabel(repeat).toLowerCase()}`,
        )
      }
      refresh()
      dirtyRef.current = false
      onDone()
    } catch (e) {
      setError(`Couldn’t save: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setWorking(false)
    }
  }

  async function remove() {
    if (!event) return
    if (inSeries && scope === 'later') {
      setWorking(true)
      try {
        const removed = await deleteThisAndLater(event)
        refresh()
        dirtyRef.current = false
        toast(removed.count === 1 ? `Deleted “${event.title}”` : `Deleted ${removed.count} of “${event.title}”`, {
          duration: 8000,
          action: {
            label: 'Undo',
            onClick: quietly(async () => {
              await removed.undo()
              refresh()
              toast.success('Restored')
            }),
          },
        })
        onDone()
      } catch (e) {
        setError(`Couldn’t delete: ${e instanceof Error ? e.message : String(e)}`)
      } finally {
        setWorking(false)
      }
      return
    }
    await del.mutateAsync(event.id)
    dirtyRef.current = false
    offerUndo(`Deleted “${event.title}”`, 'events', event)
    onDone()
  }

  const inputType = f.allDay ? 'date' : 'datetime-local'

  return (
    <form
      onSubmit={(e) => quietly(submit)(e)}
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
      <label className="flex min-h-9 cursor-pointer pointer-coarse:min-h-11 items-center gap-2 text-ink-2">
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
          <input id="event-start" type={inputType} className="field" value={f.start} onChange={(e) => moveStart(e.target.value)} />
        </div>
        <div>
          <label htmlFor="event-end" className="label">
            Ends <span className="font-normal text-ink-3">(optional)</span>
          </label>
          <input id="event-end" type={inputType} className="field" value={f.end} onChange={(e) => up('end', e.target.value)} />
        </div>
      </div>
      <div>
        <label htmlFor="event-repeat" className="label">
          Repeat
        </label>
        <select
          id="event-repeat"
          className="field"
          value={f.repeat}
          onChange={(e) => up('repeat', e.target.value as RepeatRule | '')}
        >
          {REPEAT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {inSeries &&
        (ruleChanged ? (
          <p className="text-[13px] text-ink-2">The new repeat applies to this event and every later one.</p>
        ) : (
          <div className="space-y-1.5">
            <Segmented<'this' | 'later'>
              label="Save or delete"
              value={scope}
              onChange={setScope}
              options={[
                { value: 'this', label: 'This event' },
                { value: 'later', label: 'This and later ones' },
              ]}
            />
            <p className="text-[13px] text-ink-3">It repeats {repeatLabel(rule).toLowerCase()}. Earlier ones stay as they are.</p>
          </div>
        ))}
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
        {f.remind && (
          <p className="mt-2 text-[13px] text-ink-3">
            <ReminderHint />
          </p>
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
      <div className="sticky -bottom-4 -mx-5 -mb-4 flex items-center gap-2 border-t border-line bg-surface px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {event && (
          <button
            type="button"
            className="btn btn-danger -ml-2"
            aria-label={inSeries && scope === 'later' ? 'Delete this event and every later one' : undefined}
            onClick={() => quietly(remove)()}
            disabled={del.isPending || working}
          >
            <TrashIcon size={16} weight="bold" />
            {inSeries && scope === 'later' ? 'Delete these' : 'Delete'}
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
          <button type="submit" className="btn btn-primary" disabled={save.isPending || working}>
            {save.isPending || working ? 'Saving…' : event ? 'Save event' : 'Add event'}
          </button>
        </div>
      </div>
    </form>
  )
}
