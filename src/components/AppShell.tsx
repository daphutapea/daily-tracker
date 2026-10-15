import {
  CalendarBlankIcon,
  CheckSquareIcon,
  GearSixIcon,
  HouseIcon,
  LinkSimpleIcon,
  NotePencilIcon,
  SignOutIcon,
  type Icon,
} from '@phosphor-icons/react'
import { useEffect, useRef } from 'react'
import { NavLink, Outlet } from 'react-router'
import { toast } from 'sonner'
import { useUserEmail } from '@/auth/session'
import { deviceTimeZone, toDate } from '@/lib/dates'
import { useDialogs } from '@/lib/dialogs'
import { useEvents, useProfile, useQuickLinks, useReorderQuickLinks, useTasks, useUpdateProfile } from '@/lib/queries'
import { supabase } from '@/lib/supabase'
import { EventDialogHost } from './EventDialog'
import { SortableList } from './SortableList'
import { TaskDialogHost } from './TaskDialog'
import { SiteIcon } from './ui'

const NAV: { to: string; label: string; icon: Icon; mobile: boolean }[] = [
  { to: '/', label: 'Home', icon: HouseIcon, mobile: true },
  { to: '/tasks', label: 'Tasks', icon: CheckSquareIcon, mobile: true },
  { to: '/notes', label: 'Notes', icon: NotePencilIcon, mobile: true },
  { to: '/calendar', label: 'Calendar', icon: CalendarBlankIcon, mobile: true },
  { to: '/links', label: 'Links', icon: LinkSimpleIcon, mobile: false },
  { to: '/settings', label: 'Settings', icon: GearSixIcon, mobile: true },
]

export function AppShell() {
  useTimeZoneSync()
  useInAppReminders()

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 rounded-[6px] bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <Sidebar />
      <main id="main" tabIndex={-1} className="pb-24 outline-none md:pb-10 md:pl-60">
        <div className="mx-auto w-full max-w-[1200px] px-4 pt-5 md:px-8 md:pt-7">
          <Outlet />
        </div>
      </main>
      <TabBar />
      <TaskDialogHost />
      <EventDialogHost />
    </div>
  )
}

function Sidebar() {
  const email = useUserEmail()
  const links = useQuickLinks()
  const reorder = useReorderQuickLinks()

  return (
    <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-surface md:flex">
      <div className="px-5 pt-5 pb-4">
        <span className="text-[15px] font-semibold tracking-tight">Daily Tracker</span>
      </div>
      <nav aria-label="Main" className="px-3">
        <ul className="space-y-0.5">
          {NAV.map((n) => (
            <li key={n.to}>
              <NavLink
                to={n.to}
                end={n.to === '/'}
                className={({ isActive }) =>
                  `flex min-h-9 items-center gap-2.5 rounded-[6px] px-2.5 font-medium transition-colors duration-150 ${
                    isActive ? 'bg-surface-2 text-ink' : 'row-hover text-ink-2'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <n.icon size={18} weight={isActive ? 'fill' : 'bold'} className={isActive ? 'text-accent' : ''} />
                    {n.label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <section aria-labelledby="quick-links-heading" className="mt-6 min-h-0 flex-1 overflow-y-auto px-3">
        <div className="flex items-center justify-between px-2.5 pb-1">
          <h2 id="quick-links-heading" className="section-label">
            Quick links
          </h2>
          <NavLink to="/links" className="text-[13px] text-ink-3 hover:text-ink">
            Edit
          </NavLink>
        </div>
        {links.isError ? (
          <p className="px-2.5 text-[13px] text-danger">Couldn’t load links.</p>
        ) : links.data?.length === 0 ? (
          <p className="px-2.5 text-[13px] text-ink-3">
            Add the sites you open every day. <NavLink to="/links" className="underline underline-offset-2">Add a link</NavLink>
          </p>
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
                    className={`row-hover flex min-h-8 touch-manipulation items-center gap-2.5 rounded-[6px] px-2.5 text-ink-2 [-webkit-user-drag:none] ${
                      isDragging ? 'cursor-grabbing bg-surface shadow-float' : ''
                    }`}
                  >
                    <SiteIcon url={l.url} label={l.label} />
                    <span className="truncate">{l.label}</span>
                  </a>
                </li>
              )}
            </SortableList>
          </ul>
        )}
      </section>

      <div className="border-t border-line px-3 py-3">
        <p className="truncate px-2.5 text-[13px] text-ink-3" title={email}>
          {email}
        </p>
        <button
          type="button"
          className="btn btn-ghost mt-1 w-full justify-start px-2.5"
          onClick={() => supabase.auth.signOut()}
        >
          <SignOutIcon size={16} weight="bold" />
          Sign out
        </button>
      </div>
    </aside>
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
                  <n.icon size={22} weight={isActive ? 'fill' : 'bold'} className={isActive ? 'text-accent' : ''} />
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

/** Reminders and the morning digest are computed in the profile's time zone; keep it in step with this device. */
function useTimeZoneSync() {
  const profile = useProfile()
  const update = useUpdateProfile()
  const tried = useRef(false)
  useEffect(() => {
    const tz = deviceTimeZone()
    if (!profile.data || tried.current || profile.data.timezone === tz) return
    tried.current = true
    update.mutate({ timezone: tz })
  }, [profile.data, update])
}

/** While the app is open, show reminders as toasts too (Telegram covers the closed case). */
function useInAppReminders() {
  const tasks = useTasks()
  const events = useEvents()
  const { openTask, openEvent } = useDialogs()
  const lastCheck = useRef(Date.now())
  const latest = useRef({ tasks: tasks.data, events: events.data, openTask, openEvent })
  latest.current = { tasks: tasks.data, events: events.data, openTask, openEvent }

  useEffect(() => {
    const tick = () => {
      const now = Date.now()
      const from = lastCheck.current
      lastCheck.current = now
      const due = (iso: string | null) => {
        if (!iso) return false
        const t = toDate(iso).getTime()
        return t > from && t <= now
      }
      const { tasks, events, openTask, openEvent } = latest.current
      tasks
        ?.filter((t) => t.status !== 'done' && due(t.remind_at))
        .forEach((t) =>
          toast(`Reminder: ${t.title}`, { duration: 60_000, action: { label: 'Open', onClick: () => openTask(t.id) } }),
        )
      events
        ?.filter((e) => due(e.remind_at))
        .forEach((e) =>
          toast(`Coming up: ${e.title}`, { duration: 60_000, action: { label: 'Open', onClick: () => openEvent(e.id) } }),
        )
    }
    const id = window.setInterval(tick, 15_000)
    return () => window.clearInterval(id)
  }, [])
}
