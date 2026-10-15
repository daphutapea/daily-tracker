import { CheckIcon, WarningIcon } from '@phosphor-icons/react'
import { useState, type ReactNode } from 'react'
import type { TaskPriority } from '@/lib/types'

export function TaskCheck({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        onChange(!checked)
      }}
      className="group -m-2 grid size-9 shrink-0 place-items-center rounded-[6px] pointer-coarse:size-11"
    >
      <span
        className={`grid size-[18px] place-items-center rounded-[5px] border-[1.5px] transition-colors duration-150 ${
          checked ? 'border-accent bg-accent text-on-accent' : 'border-line-strong bg-surface'
        }`}
      >
        <CheckIcon
          size={12}
          weight="bold"
          className={`transition-[opacity,scale] duration-150 ${checked ? 'scale-100 opacity-100' : 'scale-75 opacity-0'}`}
        />
      </span>
    </button>
  )
}

/** Only urgent and high get a visible marker; medium and low stay quiet so the loud ones stand out. */
export function PriorityTag({ priority, quiet = false }: { priority: TaskPriority; quiet?: boolean }) {
  if (priority === 'urgent')
    return (
      <span className="inline-flex items-center gap-1 text-[13px] font-medium text-danger">
        <WarningIcon size={13} weight="bold" aria-hidden />
        Urgent
      </span>
    )
  if (priority === 'high') return <span className="text-[13px] font-medium text-warn">High</span>
  if (quiet) return null
  return <span className="text-[13px] text-ink-3">{priority === 'medium' ? 'Medium' : 'Low'}</span>
}

export function StateMessage({
  title,
  body,
  action,
  tone = 'neutral',
}: {
  title: string
  body?: ReactNode
  action?: ReactNode
  tone?: 'neutral' | 'error'
}) {
  return (
    <div className="px-4 py-8 text-center" role={tone === 'error' ? 'alert' : undefined}>
      <p className={`font-medium ${tone === 'error' ? 'text-danger' : 'text-ink'}`}>{title}</p>
      {body && <p className="mx-auto mt-1 max-w-sm text-ink-2">{body}</p>}
      {action && <div className="mt-4 flex justify-center gap-2">{action}</div>}
    </div>
  )
}

export function Loading({ what }: { what: string }) {
  return (
    <p role="status" className="px-4 py-8 text-center text-ink-3">
      Loading {what}…
    </p>
  )
}

export function QueryError({ what, error, retry }: { what: string; error: Error | null; retry: () => void }) {
  return (
    <StateMessage
      tone="error"
      title={`Couldn’t load ${what}.`}
      body={error?.message ?? 'Check your connection, then try again.'}
      action={
        <button type="button" className="btn btn-quiet" onClick={retry}>
          Try again
        </button>
      }
    />
  )
}

/** Site icon fetched from the site itself (no third-party favicon service); falls back to the initial. */
export function SiteIcon({ url, label, size = 16 }: { url: string; label: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  let origin = ''
  try {
    origin = new URL(url).origin
  } catch {
    // invalid URL: fall through to the initial
  }
  if (failed || !origin) {
    return (
      <span
        aria-hidden
        style={{ width: size, height: size, fontSize: size * 0.62 }}
        className="grid shrink-0 place-items-center rounded-[4px] bg-surface-2 font-semibold text-ink-2"
      >
        {label.trim().charAt(0).toUpperCase() || '?'}
      </span>
    )
  }
  // Most favicons are drawn for white tabs, so they sit on a white tile in both themes.
  return (
    <span className="grid shrink-0 place-items-center rounded-[4px] bg-white ring-1 ring-line" style={{ width: size, height: size }}>
      <img
        src={`${origin}/favicon.ico`}
        alt=""
        width={size - 4}
        height={size - 4}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    </span>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[6px] border border-line bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-8 rounded-[4px] px-3 text-[13px] font-medium transition-colors duration-150 pointer-coarse:min-h-10 ${
            value === o.value ? 'bg-surface-2 text-ink' : 'text-ink-2'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
