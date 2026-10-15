import { ArrowLeftIcon, MagnifyingGlassIcon, PlusIcon, PushPinIcon, TrashIcon } from '@phosphor-icons/react'
import type { JSONContent } from '@tiptap/react'
import { format, isToday } from 'date-fns'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { RichEditor } from '@/components/LazyRichEditor'
import { Loading, QueryError, StateMessage } from '@/components/ui'
import type { Json } from '@/lib/database.types'
import { toDate } from '@/lib/dates'
import { quietly, useCreateNote, useDeleteNote, useNote, useNotes, useProjects, useUpdateNote } from '@/lib/queries'
import type { Note, NoteSummary } from '@/lib/types'

export function NotesPage() {
  const { noteId } = useParams()
  const navigate = useNavigate()
  const notes = useNotes()
  const create = useCreateNote()
  const [q, setQ] = useState('')

  async function newNote() {
    const id = await create.mutateAsync({})
    navigate(`/notes/${id}`)
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return notes.data ?? []
    return (notes.data ?? []).filter(
      (n) => n.title.toLowerCase().includes(needle) || n.content_text.toLowerCase().includes(needle),
    )
  }, [notes.data, q])

  return (
    <div className="space-y-5">
      <div className={`flex flex-wrap items-center justify-between gap-3 ${noteId ? 'max-md:hidden' : ''}`}>
        <h1 className="text-xl font-semibold">Notes</h1>
        <button type="button" className="btn btn-primary" onClick={quietly(newNote)} disabled={create.isPending}>
          <PlusIcon size={16} weight="bold" />
          New note
        </button>
      </div>

      {notes.isPending ? (
        <Loading what="notes" />
      ) : notes.isError ? (
        <QueryError what="notes" error={notes.error} retry={() => notes.refetch()} />
      ) : notes.data.length === 0 ? (
        <div className="panel">
          <StateMessage
            title="No notes yet."
            body="Meeting minutes, ideas, checklists. Notes save as you type and can hold tables."
            action={
              <button type="button" className="btn btn-primary" onClick={quietly(newNote)}>
                Write your first note
              </button>
            }
          />
        </div>
      ) : (
        <div className="fade-in grid gap-4 md:grid-cols-[300px_1fr]">
          <aside className={`space-y-3 ${noteId ? 'max-md:hidden' : ''}`} aria-label="All notes">
            <div className="relative">
              <MagnifyingGlassIcon
                size={16}
                weight="bold"
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-3"
              />
              <label htmlFor="note-search" className="sr-only">
                Search notes
              </label>
              <input
                id="note-search"
                type="search"
                placeholder="Search notes"
                className="field pl-8"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            {filtered.length === 0 ? (
              <p className="px-1 text-ink-2">No notes match “{q}”.</p>
            ) : (
              <ul className="panel divide-y divide-line overflow-hidden">
                {filtered.map((n) => (
                  <NoteListItem key={n.id} note={n} active={n.id === noteId} />
                ))}
              </ul>
            )}
          </aside>

          <section className={noteId ? '' : 'max-md:hidden'} aria-label="Note">
            {noteId ? (
              <NoteLoader id={noteId} />
            ) : (
              <div className="panel">
                <StateMessage title="Pick a note on the left, or start a new one." />
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function NoteListItem({ note, active }: { note: NoteSummary; active: boolean }) {
  const updated = toDate(note.updated_at)
  const snippet = note.content_text.split('\n').find((l) => l.trim()) ?? ''
  return (
    <li>
      <Link
        to={`/notes/${note.id}`}
        aria-current={active ? 'page' : undefined}
        className={`block px-3.5 py-3 transition-colors duration-150 ${active ? 'bg-surface-2' : 'row-hover'}`}
      >
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0 truncate font-medium">{note.title.trim() || 'Untitled note'}</span>
          {note.pinned && <PushPinIcon size={14} weight="fill" className="mt-1 shrink-0 text-ink-2" aria-label="Pinned" />}
        </span>
        {snippet && <span className="mt-0.5 line-clamp-2 block text-[13px] text-ink-2">{snippet}</span>}
        <span className="mt-1 block text-[12px] text-ink-3">
          {isToday(updated) ? format(updated, 'HH:mm') : format(updated, 'd MMM yyyy')}
        </span>
      </Link>
    </li>
  )
}

function NoteLoader({ id }: { id: string }) {
  const note = useNote(id)
  if (note.isPending) return <Loading what="note" />
  if (note.isError)
    return (
      <div className="panel">
        <QueryError what="this note" error={note.error} retry={() => note.refetch()} />
      </div>
    )
  return <NoteEditor key={note.data.id} note={note.data} />
}

type SaveState = 'saved' | 'pending' | 'saving' | 'error'

function NoteEditor({ note }: { note: Note }) {
  const navigate = useNavigate()
  const update = useUpdateNote()
  const del = useDeleteNote()
  const projects = useProjects()
  const [title, setTitle] = useState(note.title)
  const [pinned, setPinned] = useState(note.pinned)
  const [projectId, setProjectId] = useState(note.project_id ?? '')
  const [state, setState] = useState<SaveState>('saved')
  const [savedAt, setSavedAt] = useState(toDate(note.updated_at))

  const pending = useRef<{ title?: string; content?: JSONContent; content_text?: string }>({})
  const timer = useRef<number | undefined>(undefined)
  const mutate = update.mutateAsync

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current)
    const patch = pending.current
    if (Object.keys(patch).length === 0) return
    pending.current = {}
    setState('saving')
    try {
      await mutate({ id: note.id, ...patch, content: patch.content as Json | undefined })
      setSavedAt(new Date())
      setState(Object.keys(pending.current).length ? 'pending' : 'saved')
    } catch {
      pending.current = { ...patch, ...pending.current }
      setState('error')
    }
  }, [mutate, note.id])

  const queue = (patch: typeof pending.current) => {
    pending.current = { ...pending.current, ...patch }
    setState('pending')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, 800)
  }

  // Save whatever is left when leaving the note or closing the tab.
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length) e.preventDefault()
    }
    window.addEventListener('beforeunload', onUnload)
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      flush()
    }
  }, [flush])

  async function remove() {
    if (!window.confirm('Delete this note? This can’t be undone.')) return
    pending.current = {}
    window.clearTimeout(timer.current)
    await del.mutateAsync(note.id)
    toast.success('Note deleted')
    navigate('/notes')
  }

  const status =
    state === 'saving'
      ? 'Saving…'
      : state === 'pending'
        ? 'Unsaved changes'
        : state === 'error'
          ? 'Couldn’t save.'
          : `Saved ${isToday(savedAt) ? format(savedAt, 'HH:mm') : format(savedAt, 'd MMM, HH:mm')}`

  return (
    <article className="panel overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <Link to="/notes" className="btn btn-ghost btn-icon md:hidden" aria-label="Back to all notes">
          <ArrowLeftIcon size={18} weight="bold" />
        </Link>
        <p className={`text-[13px] ${state === 'error' ? 'text-danger' : 'text-ink-3'}`} role="status">
          {status}
          {state === 'error' && (
            <button type="button" className="ml-2 font-medium text-ink underline underline-offset-2" onClick={flush}>
              Retry
            </button>
          )}
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {!!projects.data?.length && (
            <>
              <label htmlFor="note-project" className="sr-only">
                Project
              </label>
              <select
                id="note-project"
                className="field !min-h-9 w-auto max-w-44 py-1"
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value)
                  update.mutate({ id: note.id, project_id: e.target.value || null })
                }}
              >
                <option value="">No project</option>
                {projects.data.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </>
          )}
          <button
            type="button"
            className="btn btn-ghost"
            aria-pressed={pinned}
            onClick={() => {
              setPinned(!pinned)
              update.mutate({ id: note.id, pinned: !pinned })
            }}
          >
            <PushPinIcon size={16} weight={pinned ? 'fill' : 'bold'} />
            {pinned ? 'Pinned' : 'Pin'}
          </button>
          <button type="button" className="btn btn-danger" onClick={quietly(remove)} disabled={del.isPending}>
            <TrashIcon size={16} weight="bold" />
            <span className="max-sm:sr-only">Delete</span>
          </button>
        </div>
      </div>
      <div className="space-y-3 p-4">
        <label htmlFor="note-title" className="sr-only">
          Title
        </label>
        <input
          id="note-title"
          className="w-full rounded-[4px] bg-transparent text-lg font-semibold placeholder:text-ink-3 focus-visible:outline-offset-4"
          placeholder="Untitled note"
          maxLength={200}
          value={title}
          autoFocus={!note.title && !note.content_text}
          onChange={(e) => {
            setTitle(e.target.value)
            queue({ title: e.target.value })
          }}
        />
        <RichEditor
          label="Note"
          initial={note.content}
          minHeight={360}
          placeholder="Start writing…"
          onChange={({ json, text }) => queue({ content: json, content_text: text })}
        />
      </div>
    </article>
  )
}
