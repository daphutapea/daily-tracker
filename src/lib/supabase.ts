import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { appSessionStorage, inIphoneApp } from './native'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.local.')
}

/** The project's address and publishable key: public, and the same in every copy of the app. */
export const supabaseUrl: string = url
export const supabaseKey: string = key

export const supabase = createClient<Database>(url, key, {
  // In the iPhone app the sign-in is kept by the app (lib/native.ts), so its background refresh and
  // the page share one session and never hold a used refresh token.
  auth: { persistSession: true, autoRefreshToken: true, ...(inIphoneApp ? { storage: appSessionStorage } : {}) },
})

/** Unwraps a Supabase response, throwing its error so React Query can surface it. */
export function must<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message)
  return res.data as NonNullable<T>
}
