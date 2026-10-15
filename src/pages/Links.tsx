import { ArrowSquareOutIcon, DotsSixVerticalIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from '@phosphor-icons/react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { SortableList } from '@/components/SortableList'
import { Loading, QueryError, SiteIcon, StateMessage } from '@/components/ui'
import { quietly, useDeleteQuickLink, useQuickLinks, useReorderQuickLinks, useSaveQuickLink } from '@/lib/queries'
import type { QuickLink } from '@/lib/types'

/** Services that show up in the owner's own projects (FinChat on Vercel, Topic Pulse on Supabase, Spaces on Hugging Face). */
const SUGGESTED = [
  { label: 'Gmail', url: 'https://mail.google.com/' },
  { label: 'GitHub', url: 'https://github.com/' },
  { label: 'Vercel', url: 'https://vercel.com/dashboard' },
  { label: 'Supabase', url: 'https://supabase.com/dashboard' },
  { label: 'Hugging Face', url: 'https://huggingface.co/' },
]

function normalize(url: string) {
  const v = url.trim()
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`
  try {
    return new URL(withScheme).toString()
  } catch {
    return null
  }
}

export function LinksPage() {
  const links = useQuickLinks()
  const save = useSaveQuickLink()
  const reorder = useReorderQuickLinks()
  const del = useDeleteQuickLink()
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)

  const nextPosition = (links.data?.length ?? 0) + 1

  async function add(e: FormEvent) {
    e.preventDefault()
    const clean = normalize(url)
    if (!label.trim()) return setError('Give the link a name.')
    if (!url.trim() || !clean) return setError('That address doesn’t look like a web link.')
    setError(null)
    await save.mutateAsync({ label: label.trim(), url: clean, position: nextPosition })
    setLabel('')
    setUrl('')
    toast.success('Link added')
    document.getElementById('link-label')?.focus()
  }

  const existing = new Set(links.data?.map((l) => new URL(l.url).hostname))
  const suggestions = SUGGESTED.filter((s) => !existing.has(new URL(s.url).hostname))

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Links</h1>
        <p className="text-ink-2">Sites you open every day. They sit in the sidebar, and on Home on your phone.</p>
      </div>

      <form onSubmit={quietly(add)} className="panel space-y-3 p-4" noValidate>
        <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
          <div>
            <label htmlFor="link-label" className="label">
              Name
            </label>
            <input id="link-label" className="field" maxLength={40} value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div>
            <label htmlFor="link-url" className="label">
              Address
            </label>
            <input
              id="link-url"
              className="field"
              inputMode="url"
              placeholder="https://"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
        </div>
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={save.isPending}>
          <PlusIcon size={16} weight="bold" />
          Add link
        </button>
        {suggestions.length > 0 && (
          <div className="border-t border-line pt-3">
            <p className="text-[13px] text-ink-3">Suggested from the tools your projects use:</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s.url}
                  type="button"
                  className="chip gap-1.5"
                  onClick={quietly(async () => {
                    await save.mutateAsync({ ...s, position: nextPosition })
                    toast.success(`${s.label} added`)
                  })}
                >
                  <PlusIcon size={12} weight="bold" aria-hidden />
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </form>

      {links.isPending ? (
        <Loading what="links" />
      ) : links.isError ? (
        <QueryError what="links" error={links.error} retry={() => links.refetch()} />
      ) : links.data.length === 0 ? (
        <div className="panel">
          <StateMessage title="No links yet." body="Add one above and it appears in the sidebar right away." />
        </div>
      ) : (
        <ul className="panel fade-in divide-y divide-line">
          <SortableList items={links.data} getLabel={(l) => l.label} onReorder={(next) => reorder.mutate(next)} keyboard>
            {(l, { setNodeRef, style, isDragging, handle, handleAttributes }) =>
              editing === l.id ? (
                <li ref={setNodeRef} style={style}>
                  <EditRow link={l} onDone={() => setEditing(null)} />
                </li>
              ) : (
                <li
                  ref={setNodeRef}
                  style={style}
                  className={`flex items-center gap-2 bg-surface py-2 pr-3 pl-1 ${isDragging ? 'rounded-[6px] shadow-float' : ''}`}
                >
                  <button
                    type="button"
                    {...handleAttributes}
                    {...handle}
                    aria-label={`Reorder ${l.label}`}
                    className={`btn btn-ghost btn-icon touch-none text-ink-3 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                  >
                    <DotsSixVerticalIcon size={18} weight="bold" />
                  </button>
                  <SiteIcon url={l.url} label={l.label} size={20} />
                  <div className="ml-1 min-w-0 flex-1">
                    <p className="truncate font-medium">{l.label}</p>
                    <p className="truncate text-[13px] text-ink-3">{l.url}</p>
                  </div>
                  <a href={l.url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-icon" aria-label={`Open ${l.label}`}>
                    <ArrowSquareOutIcon size={16} weight="bold" />
                  </a>
                  <button type="button" className="btn btn-ghost btn-icon" aria-label={`Edit ${l.label}`} onClick={() => setEditing(l.id)}>
                    <PencilSimpleIcon size={16} weight="bold" />
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-icon"
                    aria-label={`Delete ${l.label}`}
                    onClick={quietly(async () => {
                      if (!window.confirm(`Remove ${l.label} from your links?`)) return
                      await del.mutateAsync(l.id)
                      toast.success(`${l.label} removed`)
                    })}
                  >
                    <TrashIcon size={16} weight="bold" />
                  </button>
                </li>
              )
            }
          </SortableList>
        </ul>
      )}
    </div>
  )
}

function EditRow({ link, onDone }: { link: QuickLink; onDone: () => void }) {
  const save = useSaveQuickLink()
  const [label, setLabel] = useState(link.label)
  const [url, setUrl] = useState(link.url)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const clean = normalize(url)
    if (!label.trim() || !clean) return setError('Both a name and a valid address are needed.')
    await save.mutateAsync({ id: link.id, label: label.trim(), url: clean })
    onDone()
  }

  return (
    <div className="px-3 py-3">
      <form onSubmit={quietly(submit)} className="space-y-2" onKeyDown={(e) => e.key === 'Escape' && onDone()}>
        <div className="grid gap-2 sm:grid-cols-[160px_1fr]">
          <input aria-label="Name" className="field" maxLength={40} value={label} autoFocus onChange={(e) => setLabel(e.target.value)} />
          <input aria-label="Address" className="field" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary" disabled={save.isPending}>
            Save link
          </button>
          <button type="button" className="btn btn-quiet" onClick={onDone}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
