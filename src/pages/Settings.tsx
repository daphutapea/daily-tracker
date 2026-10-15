import { ArrowSquareOutIcon, CaretRightIcon, SignOutIcon, TelegramLogoIcon } from '@phosphor-icons/react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { toast } from 'sonner'
import { useUserEmail } from '@/auth/session'
import { Loading, QueryError, Segmented } from '@/components/ui'
import { deviceTimeZone } from '@/lib/dates'
import {
  quietly,
  telegram,
  useDeleteProject,
  useProfile,
  useProjects,
  useSaveProject,
  useTelegramAction,
  useTelegramStatus,
  useUpdateProfile,
} from '@/lib/queries'
import { supabase } from '@/lib/supabase'
import { setTheme, useTheme, type ThemeChoice } from '@/lib/theme'
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
        <>
          <ProfileSection profile={profile.data} />
          <TelegramSection profile={profile.data} />
          <ProjectsSection />
          <AppearanceSection />
          <Link to="/links" className="panel row-hover flex min-h-12 items-center justify-between px-4 md:hidden">
            <span className="font-medium">Quick links</span>
            <CaretRightIcon size={16} weight="bold" className="text-ink-3" />
          </Link>
          <AccountSection />
        </>
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
  const [checkingToken, setCheckingToken] = useState(false)
  const status = useTelegramStatus(checkingToken)
  const s = status.data

  useEffect(() => {
    // Stop polling once Telegram has answered the token check.
    if (s && (!s.bot_configured || s.bot_username || s.bot_error)) setCheckingToken(false)
  }, [s])

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
            <BotStep status={s!} onSaved={() => setCheckingToken(true)} checking={checkingToken} />
          </Step>
          <Step n={2} title="Link your Telegram chat" done={s!.linked} disabled={!s!.bot_username}>
            <LinkStep status={s!} />
          </Step>
          <Step n={3} title="Morning summary" disabled={!s!.linked}>
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

function DigestStep({ profile, enabled }: { profile: Profile; enabled: boolean }) {
  const update = useUpdateProfile()
  const [time, setTime] = useState(profile.digest_time.slice(0, 5))

  return (
    <div className="space-y-2">
      <p className="text-ink-2">A message each morning with what’s overdue, what’s due today, and today’s events.</p>
      <label className="flex min-h-9 cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          className="size-4 accent-[var(--accent)]"
          disabled={!enabled}
          checked={profile.digest_enabled}
          onChange={(e) => update.mutate({ digest_enabled: e.target.checked })}
        />
        Send me a morning summary
      </label>
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
      {!enabled && <p className="text-[13px] text-ink-3">Link Telegram first.</p>}
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

function AppearanceSection() {
  const theme = useTheme()
  return (
    <Section title="Appearance" intro="Saved on this device only.">
      <Segmented<ThemeChoice>
        label="Theme"
        value={theme}
        onChange={setTheme}
        options={[
          { value: 'system', label: 'Match system' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
      />
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
    </Section>
  )
}
