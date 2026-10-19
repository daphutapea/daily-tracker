// Edge Function: POST { text, now, timezone, projects } -> { items, reply, model }
// Secrets (Supabase dashboard -> Edge Functions -> Secrets):
//   GEMINI_API_KEY  required, from aistudio.google.com/apikey
//   GEMINI_MODELS   optional, comma-separated, best first (defaults to DEFAULT_MODELS)

import { DEFAULT_MODELS, parseRequest, proposeItems, TrackyError } from './logic.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

/**
 * Only the signed-in owner may spend the AI allowance. Asking Supabase Auth who the token belongs to
 * also turns away the public publishable key, which is valid for the API but is not a signed-in user.
 */
async function isSignedIn(req: Request): Promise<boolean> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  const apikey = Deno.env.get('SUPABASE_ANON_KEY') ?? req.headers.get('apikey') ?? ''
  if (!token) return false
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey },
  })
  if (!res.ok) return false
  const user = (await res.json()) as { id?: string }
  return typeof user.id === 'string'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'method', message: 'Use POST.' })
  if (!(await isSignedIn(req))) return json(401, { error: 'auth', message: 'Sign in first.' })

  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) {
    return json(503, {
      error: 'not_configured',
      message: 'The AI isn’t set up yet. Add a Gemini API key to Supabase; docs/SETUP.md shows how.',
    })
  }
  const models = (Deno.env.get('GEMINI_MODELS') ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)

  try {
    const body = parseRequest(await req.json().catch(() => null))
    const result = await proposeItems(body, { apiKey, models: models.length ? models : DEFAULT_MODELS, fetch })
    return json(200, result)
  } catch (e) {
    if (e instanceof TrackyError) {
      const status = { bad_request: 400, quota: 429, busy: 503, key: 502, model: 502 }[e.code]
      return json(status, { error: e.code, message: e.message })
    }
    console.error('tracky failed', e instanceof Error ? e.message : e)
    return json(500, { error: 'internal', message: 'Something went wrong on the server. Try again.' })
  }
})
