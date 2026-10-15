import { lazy, Suspense, type ComponentProps } from 'react'

// The editor (TipTap + ProseMirror) is the heaviest part of the app, so it loads on first use.
const Editor = lazy(() => import('./RichEditor').then((m) => ({ default: m.RichEditor })))

export function RichEditor(props: ComponentProps<typeof Editor>) {
  return (
    <Suspense
      fallback={
        <div
          role="status"
          className="grid place-items-center rounded-[6px] border border-line-strong text-ink-3"
          style={{ minHeight: (props.minHeight ?? 180) + 44 }}
        >
          Loading editor…
        </div>
      }
    >
      <Editor {...props} />
    </Suspense>
  )
}
