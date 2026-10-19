import {
  BellIcon,
  CaretRightIcon,
  CheckIcon,
  DownloadSimpleIcon,
  SignOutIcon,
} from '@phosphor-icons/react'
import { format } from 'date-fns'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { toast } from 'sonner'
import { useUserEmail } from '@/auth/sessionContext'
import { Loading, QueryError, Segmented } from '@/components/ui'
import {
  inMacApp,
  postToMac,
  saveFile,
  setMacBadgeEnabled,
  setMacIphoneEnabled,
  setMacRemindersEnabled,
  useMacBadgeEnabled,
  useMacCalendarStatus,
  useMacIphoneEnabled,
  useMacPermission,
  useMacRemindersEnabled,
} from '@/lib/native'
import { playIntro, setIntroEnabled, useIntroEnabled } from '@/lib/intro'
import { quietly, useDeleteProject, useProfile, useProjects, useSaveProject, useUpdateProfile } from '@/lib/queries'
import { must, supabase } from '@/lib/supabase'
import { updateTheme, useTheme, type DarkPalette, type LightPalette, type Palette, type ThemeMode } from '@/lib/theme'
import type { Profile } from '@/lib/types'

export function SettingsPage() {
  const profile = useProfile()
  const { hash } = useLocation()

  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [hash, profile.isSuccess])

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">Settings</h1>
      {profile.isPending ? (
        <Loading what="settings" />
      ) : profile.isError ? (
        <QueryError what="your settings" error={profile.error} retry={() => profile.refetch()} />
      ) : (
        <div className="fade-in space-y-6">
          <ProfileSection profile={profile.data} />
          {inMacApp && <MacAppSection />}
          <SummariesSection profile={profile.data} />
          <ProjectsSection />
          <AppearanceSection />
          <Link to="/links" className="panel row-hover flex min-h-12 items-center justify-between px-4 md:hidden">
            <span className="font-medium">Quick links</span>
            <CaretRightIcon size={16} weight="bold" className="text-ink-3" />
          </Link>
          <DataSection />
          <AccountSection />
        </div>
      )}
    </div>
  )
}

function Section({ id, title, intro, children }: { id?: string; title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id ?? title}-h`} className="panel scroll-mt-6 p-4 md:p-5">
      <h2 id={`${id ?? title}-h`} className="text-base font-semibold">
        {title}
      </h2>
      {intro && <p className="mt-0.5 text-ink-2">{intro}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function ProfileSection({ profile }: { profile: Profile }) {
  const update = useUpdateProfile()
  const [name, setName] = useState(profile.display_name ?? '')

  async function save(e: FormEvent) {
    e.preventDefault()
    await update.mutateAsync({ display_name: name.trim() || null })
    toast.success('Name saved')
  }

  return (
    <Section title="You">
      <form onSubmit={quietly(save)} className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 basis-56">
          <label htmlFor="display-name" className="label">
            Name for the greeting
          </label>
          <input
            id="display-name"
            className="field"
            maxLength={40}
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-quiet" disabled={update.isPending || name === (profile.display_name ?? '')}>
          Save name
        </button>
      </form>
    </Section>
  )
}

// ---------------------------------------------------------------- summaries

const ISO_WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/**
 * When the morning summary and the weekly review arrive. Saved with your account, so every device
 * agrees; the Mac app turns them into notifications (and, with iPhone alerts on, calendar alerts).
 */
function SummariesSection({ profile }: { profile: Profile }) {
  const update = useUpdateProfile()
  const [time, setTime] = useState(profile.digest_time.slice(0, 5))
  const [weeklyTime, setWeeklyTime] = useState(profile.weekly_time.slice(0, 5))

  return (
    <Section
      id="summaries"
      title="Summaries"
      intro={
        inMacApp
          ? 'They arrive as notifications from this Mac app, at the times you pick.'
          : 'They arrive as notifications from the Daily Tracker app on your Mac, at the times you pick.'
      }
    >
    <div className="space-y-5">
      <div className="space-y-2">
        <label className="flex min-h-9 cursor-pointer pointer-coarse:min-h-11 items-center gap-2 font-medium">
          <input
            type="checkbox"
            className="size-4 accent-[var(--ink)]"
            checked={profile.digest_enabled}
            onChange={(e) => update.mutate({ digest_enabled: e.target.checked })}
          />
          Morning summary
        </label>
        <p className="text-ink-2">Each morning: what’s overdue, what’s due today, and today’s events.</p>
        <div className="flex items-center gap-2">
          <label htmlFor="digest-time" className="text-ink-2">
            At
          </label>
          <input
            id="digest-time"
            type="time"
            className="field w-32"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            onBlur={() => time && time !== profile.digest_time.slice(0, 5) && update.mutate({ digest_time: time })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="flex min-h-9 cursor-pointer pointer-coarse:min-h-11 items-center gap-2 font-medium">
          <input
            type="checkbox"
            className="size-4 accent-[var(--ink)]"
            checked={profile.weekly_enabled}
            onChange={(e) => update.mutate({ weekly_enabled: e.target.checked })}
          />
          Weekly review
        </label>
        <p className="text-ink-2">Once a week: what you finished, which deadlines slipped, and what’s due next week.</p>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="weekly-day" className="text-ink-2">
            Every
          </label>
          <select
            id="weekly-day"
            className="field w-auto"
            value={profile.weekly_day}
            onChange={(e) => update.mutate({ weekly_day: Number(e.target.value) })}
          >
            {ISO_WEEKDAYS.map((d, i) => (
              <option key={d} value={i + 1}>
                {d}
              </option>
            ))}
          </select>
          <label htmlFor="weekly-time" className="text-ink-2">
            at
          </label>
          <input
            id="weekly-time"
            type="time"
            className="field w-32"
            value={weeklyTime}
            onChange={(e) => setWeeklyTime(e.target.value)}
            onBlur={() =>
              weeklyTime && weeklyTime !== profile.weekly_time.slice(0, 5) && update.mutate({ weekly_time: weeklyTime })
            }
          />
        </div>
      </div>
      <p className="text-[13px] text-ink-3">The same review is always on the Review page.</p>
    </div>
    </Section>
  )
}

// ---------------------------------------------------------------- projects

function ProjectsSection() {
  const projects = useProjects()
  const save = useSaveProject()
  const del = useDeleteProject()
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await save.mutateAsync({ name: name.trim() })
    setName('')
  }

  return (
    <Section title="Projects" intro="Group tasks and notes, for example ATLAS, FinChat, or Personal. Filter by them on the Tasks page.">
      <form onSubmit={quietly(add)} className="flex gap-2">
        <label htmlFor="project-name" className="sr-only">
          New project name
        </label>
        <input
          id="project-name"
          className="field min-w-0 flex-1"
          placeholder="New project name"
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="btn btn-quiet" disabled={!name.trim() || save.isPending}>
          Add project
        </button>
      </form>
      {projects.isPending ? (
        <Loading what="projects" />
      ) : projects.isError ? (
        <QueryError what="projects" error={projects.error} retry={() => projects.refetch()} />
      ) : projects.data.length === 0 ? (
        <p className="mt-3 text-ink-3">No projects yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line rounded-[6px] border border-line">
          {projects.data.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              {editing?.id === p.id ? (
                <form
                  className="flex min-w-0 flex-1 gap-2"
                  onSubmit={quietly(async (e: FormEvent) => {
                    e.preventDefault()
                    if (!editing.name.trim()) return
                    await save.mutateAsync({ id: p.id, name: editing.name.trim() })
                    setEditing(null)
                  })}
                >
                  <input
                    aria-label="Project name"
                    autoFocus
                    className="field min-w-0 flex-1"
                    maxLength={60}
                    value={editing.name}
                    onChange={(e) => setEditing({ id: p.id, name: e.target.value })}
                    onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
                  />
                  <button type="submit" className="btn btn-primary">
                    Save
                  </button>
                </form>
              ) : (
                <>
                  <span className={`min-w-0 flex-1 truncate ${p.archived ? 'text-ink-3' : ''}`}>
                    {p.name}
                    {p.archived && <span className="ml-2 text-[13px]">Archived</span>}
                  </span>
                  <button type="button" className="btn btn-ghost" onClick={() => setEditing({ id: p.id, name: p.name })}>
                    Rename
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => save.mutate({ id: p.id, archived: !p.archived })}>
                    {p.archived ? 'Restore' : 'Archive'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={quietly(async () => {
                      if (!window.confirm(`Delete “${p.name}”? Its tasks and notes stay, without a project.`)) return
                      await del.mutateAsync(p.id)
                    })}
                  >
                    Delete
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

const LIGHT_PALETTES: { value: LightPalette; label: string; note: string }[] = [
  { value: 'sage', label: 'Sage', note: 'Soft green-grey paper' },
  { value: 'white', label: 'White', note: 'Plain white and grey' },
]
const DARK_PALETTES: { value: DarkPalette; label: string; note: string }[] = [
  { value: 'navy', label: 'Navy', note: 'Deep blue ink' },
  { value: 'charcoal', label: 'Charcoal', note: 'Neutral near-black' },
]

function AppearanceSection() {
  const theme = useTheme()
  const intro = useIntroEnabled()
  return (
    <Section title="Appearance" intro="Saved on this device only.">
      <div className="space-y-5">
        <Segmented<ThemeMode>
          label="Mode"
          value={theme.mode}
          onChange={(mode) => updateTheme({ mode })}
          options={[
            { value: 'system', label: 'Match system' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
        <PaletteGroup
          title="Light colours"
          hint={theme.mode === 'dark' ? 'Used when you switch to Light.' : undefined}
          options={LIGHT_PALETTES}
          value={theme.light}
          onChange={(light) => updateTheme({ light })}
        />
        <PaletteGroup
          title="Dark colours"
          hint={theme.mode === 'light' ? 'Used when you switch to Dark.' : undefined}
          options={DARK_PALETTES}
          value={theme.dark}
          onChange={(dark) => updateTheme({ dark })}
        />
        <div className="space-y-1">
          <label className="flex min-h-9 cursor-pointer pointer-coarse:min-h-11 items-center gap-2 font-medium">
            <input
              type="checkbox"
              className="size-4 accent-[var(--ink)]"
              checked={intro}
              onChange={(e) => setIntroEnabled(e.target.checked)}
            />
            Play the intro when Daily Tracker opens
          </label>
          <p className="pl-6 text-[13px] text-ink-2">
            About a second and a half: the day ruler draws itself, then your greeting. A click or any key skips it.{' '}
            <button type="button" className="hit font-medium text-ink underline underline-offset-2" onClick={playIntro}>
              Play it now
            </button>
          </p>
        </div>
      </div>
    </Section>
  )
}

function PaletteGroup<T extends Palette>({
  title,
  hint,
  options,
  value,
  onChange,
}: {
  title: string
  hint?: string
  options: { value: T; label: string; note: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <fieldset>
      <legend className="label">
        {title}
        {hint && <span className="ml-2 font-normal text-ink-3">{hint}</span>}
      </legend>
      <div role="radiogroup" aria-label={title} className="grid gap-3 sm:grid-cols-2">
        {options.map((o) => {
          const selected = o.value === value
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(o.value)}
              className={`press group rounded-[10px] border p-2 text-left ${
                selected ? 'border-ink' : 'border-line row-hover'
              }`}
            >
              <PalettePreview palette={o.value} />
              <span className="mt-2 flex items-center justify-between gap-2 px-1">
                <span>
                  <span className="block font-medium">{o.label}</span>
                  <span className="block text-[13px] text-ink-3">{o.note}</span>
                </span>
                <span
                  aria-hidden
                  className={`grid size-5 shrink-0 place-items-center rounded-full border-[1.5px] ${
                    selected ? 'border-ink bg-ink text-surface' : 'border-line-strong'
                  }`}
                >
                  {selected && <CheckIcon size={11} weight="bold" />}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

/** A miniature of the Home header in the palette's own colors: panel, text lines and the day ruler. */
function PalettePreview({ palette }: { palette: Palette }) {
  return (
    <span data-palette={palette} aria-hidden className="block overflow-hidden rounded-[6px] border border-line bg-bg p-2">
      <span className="block rounded-[4px] border border-line bg-surface p-2">
        <span className="block h-2 w-16 rounded-full bg-ink" />
        <span className="mt-1.5 block h-1.5 w-24 rounded-full bg-ink-3" />
        <span className="relative mt-3 block h-3">
          <span className="absolute inset-x-0 bottom-0 h-px bg-line-strong" />
          <span className="absolute bottom-0 left-[62%] h-3 w-0.5 rounded-full bg-accent" />
          <span className="absolute bottom-1 left-[38%] size-1.5 rotate-45 border border-ink" />
        </span>
      </span>
    </span>
  )
}

function MacAppSection() {
  const permission = useMacPermission()
  const enabled = useMacRemindersEnabled()
  const badge = useMacBadgeEnabled()
  const iphone = useMacIphoneEnabled()
  const calendar = useMacCalendarStatus()
  return (
    <Section
      id="mac"
      title="Mac app"
      intro="Reminders and summaries for the next two weeks are handed to macOS, so they arrive even when the window is closed or the app has quit. Each reminder can be marked done or snoozed for 10 minutes from the notification."
    >
      <div className="space-y-3">
        <p className="text-ink-2">
          Press <kbd className="font-sans font-medium text-ink">⌥⌘T</kbd> in any app to ask Tracky. The menu bar icon
          lists what’s left today.
        </p>
        <label className="flex min-h-9 cursor-pointer pointer-coarse:min-h-11 items-center gap-2 font-medium">
          <input
            type="checkbox"
            className="size-4 accent-[var(--ink)]"
            checked={enabled}
            onChange={(e) => setMacRemindersEnabled(e.target.checked)}
          />
          Show reminders as Mac notifications
        </label>
        <label className="flex min-h-9 cursor-pointer pointer-coarse:min-h-11 items-center gap-2 font-medium">
          <input
            type="checkbox"
            className="size-4 accent-[var(--ink)]"
            checked={badge}
            onChange={(e) => setMacBadgeEnabled(e.target.checked)}
          />
          Show how many tasks are overdue on the Dock icon
        </label>
        <div className="space-y-1">
          <label className="flex min-h-9 cursor-pointer pointer-coarse:min-h-11 items-center gap-2 font-medium">
            <input
              type="checkbox"
              className="size-4 accent-[var(--ink)]"
              checked={iphone}
              disabled={!enabled}
              onChange={(e) => setMacIphoneEnabled(e.target.checked)}
            />
            Also alert me on my iPhone
          </label>
          <p className="pl-6 text-[13px] text-ink-2">
            Puts each reminder and summary in a “Daily Tracker” calendar in your iCloud, and iCloud brings its alerts to
            your iPhone. Your Mac then gets the calendar’s alert instead of its own, so you never get two.
          </p>
          {iphone && calendar === 'granted' && (
            <p className="pl-6 text-[13px] text-ok">On. Check that Calendar alerts are allowed on your iPhone.</p>
          )}
          {iphone && calendar === 'undetermined' && (
            <p className="pl-6 text-[13px] text-ink-2">macOS will ask once whether Daily Tracker may use Calendar.</p>
          )}
          {iphone && calendar === 'denied' && (
            <div className="space-y-2 pl-6">
              <p className="text-[13px] text-warn">
                Calendar access is off for Daily Tracker, so nothing reaches your iPhone. Reminders still show on this Mac.
              </p>
              <button type="button" className="btn btn-quiet" onClick={() => postToMac({ type: 'openCalendarSettings' })}>
                Open System Settings
              </button>
            </div>
          )}
          {iphone && calendar === 'local' && (
            <p className="pl-6 text-[13px] text-warn">
              This Mac has no iCloud calendar account, so the calendar stays on this Mac. Turn on Calendars in System
              Settings → your name → iCloud.
            </p>
          )}
          {iphone && calendar === 'error' && (
            <p className="pl-6 text-[13px] text-warn">The calendar couldn’t be updated. Reminders still show on this Mac.</p>
          )}
        </div>
        {permission === 'denied' && (
          <div className="space-y-2">
            <p className="text-warn">Notifications are turned off for Daily Tracker in System Settings, so none will show.</p>
            <button type="button" className="btn btn-quiet" onClick={() => postToMac({ type: 'openNotificationSettings' })}>
              Open System Settings
            </button>
          </div>
        )}
        {permission === 'undetermined' && enabled && (
          <div className="space-y-2">
            <p className="text-ink-2">macOS hasn’t been asked yet. It asks once, when the first reminder is coming up, or now:</p>
            <button type="button" className="btn btn-quiet" onClick={() => postToMac({ type: 'requestPermission' })}>
              Allow notifications
            </button>
          </div>
        )}
        {permission === 'granted' && enabled && (
          <button type="button" className="btn btn-quiet" onClick={() => postToMac({ type: 'testNotification' })}>
            <BellIcon size={16} weight="bold" />
            Send a test notification
          </button>
        )}
        <p className="text-[13px] text-ink-3">
          Closing the window keeps Daily Tracker in the menu bar, so reminders stay up to date. Changes made on another
          device reach this Mac the next time the app is running.
        </p>
      </div>
    </Section>
  )
}

/** Everything you've added, as one file. */
function DataSection() {
  const [busy, setBusy] = useState(false)

  async function download() {
    setBusy(true)
    try {
      const [tasks, events, notes, projects, quickLinks, settings] = await Promise.all([
        supabase.from('tasks').select('*').order('created_at'),
        supabase.from('events').select('*').order('starts_at'),
        supabase.from('notes').select('*').order('created_at'),
        supabase.from('projects').select('*').order('created_at'),
        supabase.from('quick_links').select('*').order('position'),
        supabase
          .from('profiles')
          .select('display_name,timezone,digest_enabled,digest_time,weekly_enabled,weekly_day,weekly_time,created_at')
          .single(),
      ])
      const data = {
        app: 'Daily Tracker',
        version: __APP_VERSION__,
        exported_at: new Date().toISOString(),
        tasks: must(tasks),
        events: must(events),
        notes: must(notes),
        projects: must(projects),
        quick_links: must(quickLinks),
        settings: must(settings),
      }
      saveFile(`daily-tracker-${format(new Date(), 'yyyy-MM-dd')}.json`, JSON.stringify(data, null, 2), 'application/json')
      if (!inMacApp) toast.success('Downloaded a copy of your data')
    } catch (e) {
      toast.error(`Couldn’t make the copy: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section
      title="Your data"
      intro="A copy of everything you’ve added: tasks, notes, events, projects, quick links and your settings, as one JSON file. Keep one somewhere safe now and then; Supabase holds the only other copy."
    >
      <button type="button" className="btn btn-quiet" disabled={busy} onClick={download}>
        <DownloadSimpleIcon size={16} weight="bold" />
        {busy ? 'Preparing…' : 'Download a copy'}
      </button>
    </Section>
  )
}

function AccountSection() {
  const email = useUserEmail()
  return (
    <Section title="Account">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 truncate text-ink-2">
          Signed in as <span className="font-medium text-ink">{email}</span>
        </p>
        <button type="button" className="btn btn-quiet" onClick={() => supabase.auth.signOut()}>
          <SignOutIcon size={16} weight="bold" />
          Sign out
        </button>
      </div>
      <p className="mt-3 text-[13px] text-ink-3">Daily Tracker v{__APP_VERSION__.split('.').slice(0, 2).join('.')}</p>
    </Section>
  )
}
