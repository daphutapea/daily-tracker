import { useQueryClient } from '@tanstack/react-query'
import { addDays } from 'date-fns'
import { useEffect, useRef } from 'react'
import { markNew } from './motion'
import { keys, useEventSeries, useEvents } from './queries'
import { AHEAD_DAYS, moveTo, occurrencesBetween, TOP_UP_DAYS, type RepeatRule } from './repeatRules'
import { must, supabase } from './supabase'
import type { CalEvent, EventSeries } from './types'

/**
 * Repeating events. Each occurrence is an ordinary event row with the series' id, written about three
 * months ahead; the series row holds the rule, the first start every occurrence is counted from, and
 * how far it has been written. (Repeating tasks need none of this: the database adds the next task
 * when one is finished.)
 */

/** An event's own fields, as the event dialog and Tracky save them. */
export type EventValues = Pick<CalEvent, 'title' | 'all_day' | 'starts_at' | 'ends_at' | 'location' | 'details' | 'remind_at'>

const valuesOf = (e: CalEvent): EventValues => ({
  title: e.title,
  all_day: e.all_day,
  starts_at: e.starts_at,
  ends_at: e.ends_at,
  location: e.location,
  details: e.details,
  remind_at: e.remind_at,
})

/**
 * Writes the series' occurrences after what it has written so far, up to three months ahead (or its
 * end), as copies of `like`. Each occurrence is written once even when two devices do this at once.
 */
async function writeAhead(series: Pick<EventSeries, 'id' | 'repeat' | 'anchor' | 'written_until' | 'ends_before'>, like: EventValues, now: Date) {
  const horizon = addDays(now, AHEAD_DAYS)
  const until = series.ends_before && new Date(series.ends_before) < horizon ? new Date(series.ends_before) : horizon
  const slots = occurrencesBetween(new Date(series.anchor), series.repeat, new Date(series.written_until), until)
  if (slots.length === 0) return []
  const rows = slots.map((at) => ({ ...moveTo(like, at), series_id: series.id }))
  const written = must(
    await supabase.from('events').upsert(rows, { onConflict: 'series_id,starts_at', ignoreDuplicates: true }).select('id'),
  )
  const last = slots.at(-1)!.toISOString()
  must(await supabase.from('event_series').update({ written_until: last }).eq('id', series.id).lt('written_until', last).select('id'))
  return written.map((r) => r.id)
}

/** Saves a new repeating event: the series, the event itself, and the next three months of it. */
export async function createSeries(values: EventValues, rule: RepeatRule, now = new Date()): Promise<string[]> {
  const series = must(
    await supabase
      .from('event_series')
      .insert({ repeat: rule, anchor: values.starts_at, written_until: values.starts_at })
      .select('*')
      .single(),
  )
  const first = must(await supabase.from('events').insert({ ...values, series_id: series.id }).select('id').single())
  return [first.id, ...(await writeAhead(series, values, now))]
}

/**
 * Saves an event and every later occurrence of its series with the new values and rule: the old
 * series ends before this event, its later occurrences go, and this event starts a new series (or
 * stands alone, when `rule` is null). Occurrences changed one at a time after this one are rewritten.
 * Also how a single event starts repeating.
 */
export async function saveThisAndLater(event: CalEvent, values: EventValues, rule: RepeatRule | null, now = new Date()) {
  const old = event.series_id
  if (old) {
    must(await supabase.from('events').delete().eq('series_id', old).gt('starts_at', event.starts_at).select('id'))
    must(await supabase.from('event_series').update({ ends_before: event.starts_at }).eq('id', old).select('id'))
  }
  const series = rule
    ? must(
        await supabase
          .from('event_series')
          .insert({ repeat: rule, anchor: values.starts_at, written_until: values.starts_at })
          .select('*')
          .single(),
      )
    : null
  must(await supabase.from('events').update({ ...values, series_id: series?.id ?? null }).eq('id', event.id).select('id'))
  // A series with no occurrences left (this was its first) is gone.
  if (old && must(await supabase.from('events').select('id').eq('series_id', old).limit(1)).length === 0) {
    must(await supabase.from('event_series').delete().eq('id', old).select('id'))
  }
  return series ? writeAhead(series, values, now) : []
}

/**
 * Deletes an event and every later occurrence of its series, and ends the series there. Returns what
 * Undo needs to put them all back.
 */
export async function deleteThisAndLater(event: CalEvent) {
  const seriesId = event.series_id!
  const series = must(await supabase.from('event_series').select('ends_before').eq('id', seriesId).single())
  const removed = must(await supabase.from('events').delete().eq('series_id', seriesId).gte('starts_at', event.starts_at).select('*'))
  must(await supabase.from('event_series').update({ ends_before: event.starts_at }).eq('id', seriesId).select('id'))
  return {
    count: removed.length,
    undo: async () => {
      must(await supabase.from('event_series').update({ ends_before: series.ends_before }).eq('id', seriesId).select('id'))
      must(await supabase.from('events').insert(removed).select('id'))
      markNew(removed.map((r) => r.id))
    },
  }
}

/**
 * Mounted once in the app: keeps every series written about three months ahead, topping up when what
 * is written runs within a week of that. It copies each series' latest occurrence, so a change made to
 * "this and later ones" carries on.
 */
export function useKeepSeriesAhead() {
  const qc = useQueryClient()
  const series = useEventSeries()
  const events = useEvents()
  const busy = useRef(false)

  useEffect(() => {
    if (!series.data || !events.data || busy.current) return
    const now = new Date()
    const due = series.data.filter((s) => {
      const end = s.ends_before ? new Date(s.ends_before) : null
      const until = addDays(now, AHEAD_DAYS - TOP_UP_DAYS)
      return new Date(s.written_until) < until && (!end || new Date(s.written_until) < end)
    })
    if (due.length === 0) return
    busy.current = true
    ;(async () => {
      let wrote = 0
      for (const s of due) {
        const latest = events.data.filter((e) => e.series_id === s.id).sort((a, b) => b.starts_at.localeCompare(a.starts_at))[0]
        // Every occurrence deleted: nothing to copy, so the series stays as it is.
        if (latest) wrote += (await writeAhead(s, valuesOf(latest), now)).length
      }
      if (wrote) {
        await qc.invalidateQueries({ queryKey: keys.events })
        await qc.invalidateQueries({ queryKey: keys.series })
      }
    })()
      .catch(() => {
        // Tried again the next time events load; nothing on screen depends on it yet.
      })
      .finally(() => {
        busy.current = false
      })
  }, [series.data, events.data, qc])
}
