import {
  ArrowSquareOutIcon,
  BellIcon,
  CaretRightIcon,
  CheckIcon,
  DownloadSimpleIcon,
  SignOutIcon,
  TelegramLogoIcon,
} from '@phosphor-icons/react'
import { format } from 'date-fns'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { toast } from 'sonner'
import { useUserEmail } from '@/auth/sessionContext'
import { Loading, QueryError, Segmented } from '@/components/ui'
import { deviceTimeZone } from '@/lib/dates'
import {
  inMacApp,
  postToMac,
  saveFile,
  setMacBadgeEnabled,
  setMacRemindersEnabled,
  useMacBadgeEnabled,
  useMacPermission,
  useMacRemindersEnabled,
} from '@/lib/native'
import {
  quietly,
  telegram,
  telegramSettled,
  useDeleteProject,
  useProfile,
  useProjects,
  useSaveProject,
  useTelegramAction,
  useTelegramStatus,
  useUpdateProfile,
} from '@/lib/queries'
import { must, supabase } from '@/lib/supabase'
import { updateTheme, useTheme, type DarkPalette, type LightPalette, type Palette, type ThemeMode } from '@/lib/theme'
import type { Profile, TelegramStatus } from '@/lib/types'

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
          <TelegramSection profile={profile.data} />
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
  const device = deviceTimeZone()

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
      <p className="mt-4 text-ink-2">
        Time zone: <span className="font-medium text-ink">{profile.timezone}</span>
        {profile.timezone !== device && (
          <>
            {' '}
            (this device is on {device}){' '}
            <button
              type="button"
              className="font-medium text-ink underline underline-offset-2"
              onClick={() => update.mutate({ timezone: device })}
            >
              Use {device}
            </button>
          </>
        )}
      </p>
      <p className="mt-1 text-[13px] text-ink-3">Telegram reminders and the morning summary use this time zone.</p>
    </Section>
  )
}

// ---------------------------------------------------------------- telegram

function TelegramSection({ profile }: { profile: Profile }) {
  const [tokenSaved, setTokenSaved] = useState(false)
  const status = useTelegramStatus(tokenSaved)
  const s = status.data
  const checkingToken = tokenSaved && !telegramSettled(s)

  return (
    <Section
      id="telegram"
      title="Telegram reminders"
      intro="Reminders and an optional morning summary arrive as Telegram messages from your own bot, even when this app is closed."
    >
      {status.isPending ? (
        <Loading what="Telegram status" />
      ) : status.isError ? (
        <QueryError what="Telegram status" error={status.error} retry={() => status.refetch()} />
      ) : (
        <ol className="space-y-5">
          <Step n={1} title="Create your bot" done={!!s!.bot_username}>
            <BotStep status={s!} onSaved={() => setTokenSaved(true)} checking={checkingToken} />
          </Step>
          <Step n={2} title="Link your Telegram chat" done={s!.linked} disabled={!s!.bot_username}>
            <LinkStep status={s!} />
          </Step>
          <Step n={3} title="Summaries" disabled={!s!.linked}>
            <DigestStep profile={profile} enabled={s!.linked} />
          </Step>
        </ol>
      )}
    </Section>
  )
}

function Step({
  n,
  title,
  done,
  disabled,
  children,
}: {
  n: number
  title: string
  done?: boolean
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <li className="grid grid-cols-[28px_1fr] gap-3">
      <span
        aria-hidden
        className={`grid size-7 place-items-center rounded-full border text-[13px] font-semibold tnum ${
          done ? 'border-ink bg-ink text-surface' : 'border-line-strong text-ink-2'
        }`}
      >
        {n}
      </span>
      <div className={disabled ? 'opacity-60' : ''}>
        <h3 className="font-medium">
          {title}
          {done && <span className="ml-2 text-[13px] font-normal text-ok">Done</span>}
        </h3>
        <div className="mt-1.5">{children}</div>
      </div>
    </li>
  )
}

function BotStep({ status, onSaved, checking }: { status: TelegramStatus; onSaved: () => void; checking: boolean }) {
  const [token, setToken] = useState('')
  const [replacing, setReplacing] = useState(false)
  const save = useTelegramAction(telegram.setToken)

  async function submit(e: FormEvent) {
    e.preventDefault()
    await save.mutateAsync([token.trim()])
    setToken('')
    setReplacing(false)
    onSaved()
  }

  if (status.bot_username && !replacing) {
    return (
      <p className="text-ink-2">
        Using <span className="font-medium text-ink">@{status.bot_username}</span>.{' '}
        <button type="button" className="underline underline-offset-2" onClick={() => setReplacing(true)}>
          Use a different bot
        </button>
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <ol className="list-decimal space-y-1 pl-5 text-ink-2">
        <li>
          In Telegram, open{' '}
          <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="font-medium text-ink underline underline-offset-2">
            @BotFather
          </a>{' '}
          and send <code className="rounded bg-surface-2 px-1">/newbot</code>.
        </li>
        <li>Pick any name, then a username ending in “bot”.</li>
        <li>BotFather replies with a token. Paste it below. It’s stored encrypted in your database’s vault.</li>
      </ol>
      <form onSubmit={quietly(submit)} className="flex flex-wrap gap-2">
        <label htmlFor="bot-token" className="sr-only">
          Bot token
        </label>
        <input
          id="bot-token"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="123456789:AA…"
          className="field min-w-0 flex-1 basis-64 font-mono"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={!token.trim() || save.isPending}>
          {save.isPending ? 'Saving…' : 'Save token'}
        </button>
        {replacing && (
          <button type="button" className="btn btn-quiet" onClick={() => setReplacing(false)}>
            Cancel
          </button>
        )}
      </form>
      {checking && !status.bot_error && (
        <p role="status" className="text-ink-3">
          Checking the token with Telegram…
        </p>
      )}
      {status.bot_error && (
        <p role="alert" className="text-danger">
          Telegram didn’t accept that token ({status.bot_error}). Copy it again from BotFather.
        </p>
      )}
    </div>
  )
}

function LinkStep({ status }: { status: TelegramStatus }) {
  const [code, setCode] = useState<string | null>(status.link_code)
  const [phase, setPhase] = useState<'idle' | 'checking' | 'not_found'>('idle')
  const getCode = useTelegramAction(telegram.linkCode)
  const sendTest = useTelegramAction(telegram.sendTest)
  const unlink = useTelegramAction(telegram.unlink)
  const poll = useTelegramAction(telegram.poll)

  if (status.linked) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-2 text-ink-2">Reminders go to your Telegram chat.</p>
        <button
          type="button"
          className="btn btn-quiet"
          disabled={sendTest.isPending}
          onClick={quietly(async () => {
            await sendTest.mutateAsync([])
            toast.success('Test message sent. Check Telegram.')
          })}
        >
          <TelegramLogoIcon size={16} weight="bold" />
          Send a test message
        </button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={quietly(async () => {
            if (!window.confirm('Stop sending reminders to this Telegram chat?')) return
            await unlink.mutateAsync([])
            setCode(null)
          })}
        >
          Unlink
        </button>
      </div>
    )
  }

  if (!status.bot_username) return <p className="text-ink-3">Finish step 1 first.</p>

  async function check() {
    setPhase('checking')
    try {
      for (let i = 0; i < 10; i++) {
        const result = await poll.mutateAsync([])
        if (result === 'linked') {
          toast.success('Telegram linked')
          setPhase('idle')
          return
        }
        if (result === 'not_found') {
          setPhase('not_found')
          return
        }
        await new Promise((r) => setTimeout(r, 1200))
      }
      setPhase('not_found')
    } catch (e) {
      setPhase('idle')
      throw e
    }
  }

  if (!code) {
    return (
      <button
        type="button"
        className="btn btn-primary"
        disabled={getCode.isPending}
        onClick={quietly(async () => setCode(await getCode.mutateAsync([])))}
      >
        Get a link code
      </button>
    )
  }

  const deepLink = `https://t.me/${status.bot_username}?start=${code}`
  return (
    <div className="space-y-3">
      <p className="text-ink-2">
        Open your bot and press <span className="font-medium text-ink">Start</span>. That sends your code{' '}
        <code className="rounded bg-surface-2 px-1 font-semibold text-ink">{code}</code> to it. You can also type the code
        as a message.
      </p>
      <div className="flex flex-wrap gap-2">
        <a href={deepLink} target="_blank" rel="noreferrer" className="btn btn-quiet">
          <ArrowSquareOutIcon size={16} weight="bold" />
          Open @{status.bot_username}
        </a>
        <button type="button" className="btn btn-primary" onClick={quietly(check)} disabled={phase === 'checking'}>
          {phase === 'checking' ? 'Checking…' : 'I’ve sent it'}
        </button>
      </div>
      {phase === 'not_found' && (
        <p role="alert" className="text-warn">
          Didn’t find {code} in your bot’s recent messages yet. Send it, wait a few seconds, then press “I’ve sent it” again.
        </p>
      )}
    </div>
  )
}

const ISO_WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function DigestStep({ profile, enabled }: { profile: Profile; enabled: boolean }) {
  const update = useUpdateProfile()
  const [time, setTime] = useState(profile.digest_time.slice(0, 5))
  const [weeklyTime, setWeeklyTime] = useState(profile.weekly_time.slice(0, 5))

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label className="flex min-h-9 cursor-pointer items-center gap-2 font-medium">
          <input
            type="checkbox"
            className="size-4 accent-[var(--ink)]"
            disabled={!enabled}
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
            disabled={!enabled}
            value={time}
            onChange={(e) => setTime(e.target.value)}
            onBlur={() => time && time !== profile.digest_time.slice(0, 5) && update.mutate({ digest_time: time })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="flex min-h-9 cursor-pointer items-center gap-2 font-medium">
          <input
            type="checkbox"
            className="size-4 accent-[var(--ink)]"
            disabled={!enabled}
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
            disabled={!enabled}
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
            disabled={!enabled}
            value={weeklyTime}
            onChange={(e) => setWeeklyTime(e.target.value)}
            onBlur={() =>
              weeklyTime && weeklyTime !== profile.weekly_time.slice(0, 5) && update.mutate({ weekly_time: weeklyTime })
            }
          />
        </div>
      </div>
      {!enabled && (
        <p className="text-[13px] text-ink-3">
          Link Telegram first. The same review is always on the Review page in the app.
        </p>
      )}
    </div>
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
  return (
    <Section
      id="mac"
      title="Mac app"
      intro="Reminders for the next two weeks are handed to macOS, so they arrive even when the window is closed or the app has quit. Each one can be marked done or snoozed for 10 minutes from the notification."
    >
      <div className="space-y-3">
        <p className="text-ink-2">
          Press <kbd className="font-sans font-medium text-ink">⌥⌘T</kbd> in any app to open Quick add. The menu bar icon
          lists what’s left today.
        </p>
        <label className="flex min-h-9 cursor-pointer items-center gap-2 font-medium">
          <input
            type="checkbox"
            className="size-4 accent-[var(--ink)]"
            checked={enabled}
            onChange={(e) => setMacRemindersEnabled(e.target.checked)}
          />
          Show reminders as Mac notifications
        </label>
        <label className="flex min-h-9 cursor-pointer items-center gap-2 font-medium">
          <input
            type="checkbox"
            className="size-4 accent-[var(--ink)]"
            checked={badge}
            onChange={(e) => setMacBadgeEnabled(e.target.checked)}
          />
          Show how many tasks are overdue on the Dock icon
        </label>
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

/** Everything you've added, as one file. The Telegram bot token stays in Supabase Vault. */
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
      <p className="mt-2 text-[13px] text-ink-3">Your Telegram bot token isn’t included; it stays encrypted in Supabase.</p>
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
