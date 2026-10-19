import {
  CalendarBlankIcon,
  CalendarCheckIcon,
  ChatTextIcon,
  CheckSquareIcon,
  GearSixIcon,
  HouseIcon,
  LinkSimpleIcon,
  NotePencilIcon,
  SidebarSimpleIcon,
  SignOutIcon,
  type Icon,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useEffectEvent, useRef, useState, type CSSProperties } from 'react'
import { flushSync } from 'react-dom'
import { NavLink, Outlet, useLocation } from 'react-router'
import { toast } from 'sonner'
import { useUserEmail } from '@/auth/sessionContext'
import { toDate } from '@/lib/dates'
import { useDialogs } from '@/lib/dialogs'
import { inMacApp } from '@/lib/native'
import { shortcutLabel } from '@/lib/platform'
import { getSidebar, saveSidebar, setSidebar, SIDEBAR, useSidebar } from '@/lib/sidebar'
import { useEvents, useQuickLinks, useReorderQuickLinks, useTasks } from '@/lib/queries'
import { supabase } from '@/lib/supabase'
import { EventDialogHost } from './EventDialog'
import { LogoMark } from './Logo'
import { MacAppBridge } from './MacAppBridge'
import { TrackyProvider } from './Tracky'
import { useOpenTracky } from './trackyContext'
import { SortableList } from './SortableList'
import { TaskDialogHost } from './TaskDialog'
import { SiteIcon } from './ui'

const NAV: { to: string; label: string; icon: Icon; mobile: boolean }[] = [
  { to: '/', label: 'Home', icon: HouseIcon, mobile: true },
  { to: '/tasks', label: 'Tasks', icon: CheckSquareIcon, mobile: true },
  { to: '/notes', label: 'Notes', icon: NotePencilIcon, mobile: true },
  { to: '/calendar', label: 'Calendar', icon: CalendarBlankIcon, mobile: true },
  { to: '/review', label: 'Review', icon: CalendarCheckIcon, mobile: false },
  { to: '/links', label: 'Links', icon: LinkSimpleIcon, mobile: false },
  { to: '/settings', label: 'Settings', icon: GearSixIcon, mobile: true },
]

export function AppShell() {
  useInAppReminders()
  // Keyed by the first part of the path, so moving between notes or task filters doesn't count as a page change.
  const section = useLocation().pathname.split('/')[1]
  const sidebar = useSidebar()
  const contentRef = useRef<HTMLDivElement>(null)

  /**
   * Folds the sidebar into its icon rail or opens it again. From a click the page slides into its new
   * place (200ms): the layout changes at once and a transform carries the content from where it was,
   * so nothing but the transform animates. From the keyboard, or with reduced motion, it just changes.
   */
  const toggleSidebar = useCallback((animate: boolean) => {
    const content = contentRef.current
    // Measured mid-slide when one is still running, so a quick second toggle starts from where the
    // content is on screen. The old slide is dropped either way, or it would pull the content back.
    const before = content?.getBoundingClientRect().left ?? 0
    content?.getAnimations().forEach((a) => a.cancel())
    flushSync(() => setSidebar({ collapsed: !getSidebar().collapsed }))
    const shift = before - (content?.getBoundingClientRect().left ?? 0)
    if (!content || !animate || shift === 0 || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    content.animate([{ transform: `translateX(${shift}px)` }, { transform: 'none' }], {
      duration: 200,
      easing: 'cubic-bezier(0.77, 0, 0.175, 1)',
    })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '\\' || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return
      if (document.querySelector('dialog[open]')) return
      e.preventDefault()
      toggleSidebar(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleSidebar])

  return (
    <TrackyProvider>
      <div
        className="min-h-dvh"
        // On a narrow window a wide sidebar gives way to the page: never more than 28% of the window.
        style={
          {
            '--sidebar-w': sidebar.collapsed
              ? `${SIDEBAR.rail}px`
              : `min(${sidebar.width}px, max(${SIDEBAR.min}px, 28vw))`,
          } as CSSProperties
        }
      >
        <a
          href="#main"
          className="sr-only z-50 rounded-[6px] bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Skip to content
        </a>
        {/* A click slides the page; Enter or Space on the button (detail 0) changes it at once. */}
        <Sidebar collapsed={sidebar.collapsed} width={sidebar.width} onToggle={(e) => toggleSidebar(e.detail !== 0)} />
        {/* Clipped so the page sliding in from the right never adds a horizontal scrollbar. */}
        <main id="main" tabIndex={-1} className="overflow-x-clip pb-24 outline-none md:pb-10 md:pl-(--sidebar-w)">
          <div ref={contentRef} className="mx-auto w-full max-w-[1200px] px-4 pt-5 md:px-8 md:pt-7">
            <div key={section} className="route-in">
              <Outlet />
            </div>
          </div>
        </main>
        <TabBar />
        <TaskDialogHost />
        <EventDialogHost />
        {inMacApp && <MacAppBridge />}
      </div>
    </TrackyProvider>
  )
}

function Sidebar({
  collapsed,
  width,
  onToggle,
}: {
  collapsed: boolean
  width: number
  onToggle: (e: React.MouseEvent) => void
}) {
  const email = useUserEmail()
  const links = useQuickLinks()
  const reorder = useReorderQuickLinks()
  const openTracky = useOpenTracky()
  // In the rail every label is there for screen readers and as a tooltip, and the icons stand alone.
  // Keyed, so opening the sidebar makes new labels, which fade in.
  const label = (text: string) =>
    collapsed ? (
      <span key="sr" className="sr-only">
        {text}
      </span>
    ) : (
      <span key="label" className="label-in truncate">
        {text}
      </span>
    )
  const row = collapsed ? 'justify-center px-0 pointer-coarse:min-h-11' : 'px-2.5'

  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-(--sidebar-w) flex-col border-r border-line bg-surface md:flex">
      <div className={`flex items-center gap-2.5 pt-4 pb-3 ${collapsed ? 'justify-center px-0' : 'pr-3 pl-5'}`}>
        {!collapsed && (
          <>
            <LogoMark size={22} />
            <span className="label-in min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight">Daily Tracker</span>
          </>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-icon shrink-0"
          aria-label={collapsed ? 'Open sidebar' : 'Close sidebar'}
          aria-expanded={!collapsed}
          aria-keyshortcuts="Meta+Backslash Control+Backslash"
          title={`${collapsed ? 'Open' : 'Close'} sidebar (${sidebarShortcut()})`}
          onClick={onToggle}
        >
          <SidebarSimpleIcon size={18} weight="bold" />
        </button>
      </div>
      <nav aria-label="Main" className={collapsed ? 'px-2' : 'px-3'}>
        <ul className="space-y-0.5">
          {NAV.map((n) => (
            <li key={n.to}>
              <NavLink
                to={n.to}
                end={n.to === '/'}
                title={collapsed ? n.label : undefined}
                className={({ isActive }) =>
                  `flex min-h-9 items-center gap-2.5 rounded-[6px] font-medium transition-colors duration-150 ${row} ${
                    isActive ? 'bg-accent-soft text-ink' : 'row-hover text-ink-2'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <n.icon size={18} weight={isActive ? 'fill' : 'bold'} className={`shrink-0 ${isActive ? 'text-accent' : ''}`} />
                    {label(n.label)}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => openTracky()}
          title={collapsed ? `Ask Tracky (${shortcutLabel()})` : undefined}
          className={`press row-hover mt-2 flex min-h-9 w-full items-center gap-2.5 rounded-[6px] border border-line font-medium text-ink-2 ${row}`}
        >
          <ChatTextIcon size={18} weight="bold" className="shrink-0" />
          {label('Ask Tracky')}
          {!collapsed && <kbd className="label-in ml-auto font-sans text-[12px] font-normal text-ink-3">{shortcutLabel()}</kbd>}
        </button>
      </nav>

      <section
        aria-labelledby="quick-links-heading"
        className={`mt-6 min-h-0 flex-1 overflow-x-hidden overflow-y-auto ${collapsed ? 'px-2' : 'px-3'}`}
      >
        {/* The rail keeps the heading for screen readers, but not the Edit link: it can't be seen there. */}
        {collapsed ? (
          <h2 id="quick-links-heading" className="sr-only">
            Quick links
          </h2>
        ) : (
          <div className="flex items-center justify-between px-2.5 pb-1">
            <h2 id="quick-links-heading" className="section-label">
              Quick links
            </h2>
            <NavLink to="/links" className="text-[13px] text-ink-3 hover:text-ink">
              Edit
            </NavLink>
          </div>
        )}
        {links.isError ? (
          !collapsed && <p className="px-2.5 text-[13px] text-danger">Couldn’t load links.</p>
        ) : links.data?.length === 0 ? (
          !collapsed && (
            <p className="px-2.5 text-[13px] text-ink-3">
              Add the sites you open every day. <NavLink to="/links" className="underline underline-offset-2">Add a link</NavLink>
            </p>
          )
        ) : (
          // Drag a link up or down to reorder; a plain click still opens it. Keyboard reordering lives
          // on the Links page, so Enter on a link here always opens the site.
          <ul className="space-y-0.5">
            <SortableList items={links.data ?? []} getLabel={(l) => l.label} onReorder={(next) => reorder.mutate(next)}>
              {(l, { setNodeRef, style, isDragging, handle }) => (
                <li ref={setNodeRef} style={style}>
                  <a
                    {...handle}
                    href={l.url}
                    target="_blank"
                    rel="noreferrer"
                    draggable={false}
                    title={collapsed ? l.label : undefined}
                    className={`row-hover flex min-h-8 touch-manipulation items-center gap-2.5 rounded-[6px] text-ink-2 [-webkit-user-drag:none] ${row} ${
                      isDragging ? 'cursor-grabbing bg-surface shadow-float' : ''
                    }`}
                  >
                    <SiteIcon url={l.url} label={l.label} />
                    {label(l.label)}
                  </a>
                </li>
              )}
            </SortableList>
          </ul>
        )}
      </section>

      <div className={`border-t border-line py-3 ${collapsed ? 'px-2' : 'px-3'}`}>
        {!collapsed && (
          <p className="label-in truncate px-2.5 text-[13px] text-ink-3" title={email}>
            {email}
          </p>
        )}
        <button
          type="button"
          title={collapsed ? `Sign out of ${email}` : undefined}
          className={`btn btn-ghost mt-1 w-full ${collapsed ? '' : 'justify-start px-2.5'}`}
          onClick={() => supabase.auth.signOut()}
        >
          <SignOutIcon size={16} weight="bold" className="shrink-0" />
          {label('Sign out')}
        </button>
      </div>

      <ResizeEdge collapsed={collapsed} width={width} />
    </aside>
  )
}

/** The sidebar's width on screen, from its edge. */
const shownWidth = (edge: Element) => Math.round(edge.parentElement?.getBoundingClientRect().width ?? SIDEBAR.standard)

const sidebarShortcut = () => (shortcutLabel().startsWith('⌘') ? '⌘\\' : 'Ctrl+\\')

/**
 * The sidebar's right edge. Drag it to set the width; drag it narrower than the snap point and the
 * sidebar folds into the icon rail, or drag the rail's edge out to open it again. Double-click puts
 * the standard width back. From the keyboard it is a separator: the arrow keys change the width by
 * 16px (Right opens the rail at its last width), Home folds it into the rail, End makes it as wide as
 * it goes, and Enter folds or opens it. Widths are measured from the sidebar on screen, since a narrow
 * window can show it narrower than the width you set.
 */
function ResizeEdge({ collapsed, width }: { collapsed: boolean; width: number }) {
  const [dragging, setDragging] = useState(false)

  // The drag is followed on the whole window, so it keeps going when the pointer outruns the edge.
  function startDrag(e: React.PointerEvent) {
    if (e.button !== 0) return
    e.preventDefault()
    const startX = e.clientX
    const startWidth = shownWidth(e.currentTarget)
    setDragging(true)
    const move = (ev: PointerEvent) => {
      const next = startWidth + ev.clientX - startX
      if (next < SIDEBAR.snap) setSidebar({ collapsed: true }, { save: false })
      else setSidebar({ collapsed: false, width: next }, { save: false })
    }
    const end = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      setDragging(false)
      saveSidebar()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Sidebar width"
      aria-valuemin={SIDEBAR.rail}
      aria-valuemax={SIDEBAR.max}
      aria-valuenow={collapsed ? SIDEBAR.rail : width}
      tabIndex={0}
      title="Drag to resize. Double-click for the standard width."
      data-dragging={dragging || undefined}
      className="group absolute inset-y-0 -right-1.5 w-3 cursor-col-resize touch-none outline-none pointer-coarse:-right-9.5 pointer-coarse:w-11"
      onPointerDown={startDrag}
      onDoubleClick={() => setSidebar({ collapsed: false, width: SIDEBAR.standard })}
      onKeyDown={(e) => {
        const step = { ArrowLeft: -16, ArrowRight: 16 }[e.key]
        if (step) {
          e.preventDefault()
          if (collapsed) {
            if (step > 0) setSidebar({ collapsed: false })
            return
          }
          const next = shownWidth(e.currentTarget) + step
          setSidebar(next < SIDEBAR.min ? { collapsed: true } : { width: next })
        } else if (e.key === 'Home') {
          e.preventDefault()
          setSidebar({ collapsed: true })
        } else if (e.key === 'End') {
          e.preventDefault()
          setSidebar({ collapsed: false, width: SIDEBAR.max })
        } else if (e.key === 'Enter') {
          e.preventDefault()
          setSidebar({ collapsed: !collapsed })
        }
      }}
    >
      {/* On the border itself. For a finger the edge is 44px wide and reaches out over the page's
          margin rather than over the sidebar, where it would cover the rail's icons. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-1.5 w-0.5 -translate-x-1/2 transition-colors duration-150 group-hover:bg-line-strong group-focus-visible:bg-accent group-data-dragging:bg-accent"
      />
    </div>
  )
}

function TabBar() {
  return (
    <nav
      aria-label="Main"
      className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface md:hidden"
    >
      <ul className="grid grid-cols-5">
        {NAV.filter((n) => n.mobile).map((n) => (
          <li key={n.to}>
            <NavLink
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `press flex min-h-14 flex-col items-center justify-center gap-0.5 text-[12px] font-medium ${
                  isActive ? 'text-ink' : 'text-ink-3'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {/* The active tab's icon sits on a teal pill, as the sidebar's active row does. */}
                  <span className={`grid h-7 w-14 place-items-center rounded-[6px] ${isActive ? 'bg-accent-soft' : ''}`}>
                    <n.icon size={22} weight={isActive ? 'fill' : 'bold'} className={isActive ? 'text-accent' : ''} />
                  </span>
                  {n.label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/**
 * While the app is open, show reminders as toasts too. The Mac app's notifications cover the closed
 * case.
 */
function useInAppReminders() {
  const tasks = useTasks()
  const events = useEvents()
  const { openTask, openEvent } = useDialogs()

  // Toasts every reminder whose time fell between two checks.
  const showDue = useEffectEvent((from: number, to: number) => {
    const due = (iso: string | null) => {
      if (!iso) return false
      const t = toDate(iso).getTime()
      return t > from && t <= to
    }
    tasks.data
      ?.filter((t) => t.status !== 'done' && due(t.remind_at))
      .forEach((t) =>
        toast(`Reminder: ${t.title}`, { duration: 60_000, action: { label: 'Open', onClick: () => openTask(t.id) } }),
      )
    events.data
      ?.filter((e) => due(e.remind_at))
      .forEach((e) =>
        toast(`Coming up: ${e.title}`, { duration: 60_000, action: { label: 'Open', onClick: () => openEvent(e.id) } }),
      )
  })

  useEffect(() => {
    let last = Date.now()
    const id = window.setInterval(() => {
      const now = Date.now()
      showDue(last, now)
      last = now
    }, 15_000)
    return () => window.clearInterval(id)
  }, [])
}
