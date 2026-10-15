import { useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { LogoMark } from '@/components/Logo'

export function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) {
      setError(
        error.message === 'Invalid login credentials'
          ? 'That email and password don’t match. Check both and try again.'
          : error.message,
      )
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <LogoMark size={40} />
        <h1 className="mt-4 text-xl font-semibold">Daily Tracker</h1>
        <p className="mt-1 text-ink-2">Sign in to see your day.</p>

        <form onSubmit={submit} className="panel mt-6 space-y-4 p-5" noValidate>
          <div>
            <label htmlFor="email" className="label">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              className="field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="password" className="label">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              className="field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary w-full" disabled={busy || !email || !password}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-4 text-[13px] text-ink-3">
          This tracker has one owner. You create that account once in the Supabase dashboard; docs/SETUP.md in
          the project shows how.
        </p>
      </div>
    </main>
  )
}
