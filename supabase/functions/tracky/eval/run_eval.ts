/**
 * Runs the gold set against Gemini and grades every answer.
 *
 *   npm run eval:tracky -- --model gemini-3.6-flash --runs 3 --pause 6
 *   npm run eval:tracky -- --part 1/2     (then --part 2/2 on another day)
 *   npm run eval:tracky -- --remaining    (only the cases this model has no graded answer for yet)
 *
 * A model whose free allowance is smaller than the set (gemini-3.6-flash allows 20 requests a day)
 * can be measured in parts. --part, --only and --remaining merge into that model's results file
 * instead of replacing it, so the parts add up to one score.
 *
 * Each results file records which prompt it measured. Parts only merge with results from the same
 * prompt; after the prompt changes, the first run starts the file over.
 *
 * It sends each case through the same parseRequest() and proposeItems() the server function uses,
 * against one model with no fallback, so the score belongs to that model. The key comes from
 * GEMINI_API_KEY in the environment or in supabase/functions/.env. Each case is one request, so a full
 * run uses as many of the day's free requests as there are cases, more when Google is busy, because
 * retries count too.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import {
  DEFAULT_MODELS,
  parseRequest,
  proposeItems,
  RESPONSE_SCHEMA,
  SYSTEM_PROMPT,
  TrackyError,
  type ProposedChange,
  type ProposedItem,
} from '../logic.ts'
import { gradeCase, type GoldCase } from './grade.ts'

const here = (file: string) => new URL(file, import.meta.url)

const { values: args } = parseArgs({
  options: {
    model: { type: 'string', default: DEFAULT_MODELS[0] },
    runs: { type: 'string', default: '1' },
    pause: { type: 'string', default: '6' },
    only: { type: 'string' },
    part: { type: 'string' },
    remaining: { type: 'boolean', default: false },
  },
})
const runs = Math.max(1, Number(args.runs))
const pauseMs = Math.max(0, Number(args.pause)) * 1000

function apiKey(): string {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY
  const envFile = here('../../.env')
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split('\n')) {
      const m = line.match(/^\s*GEMINI_API_KEY\s*=\s*["']?([^"'\s#]+)/)
      if (m) return m[1]
    }
  }
  console.error('No GEMINI_API_KEY. Put it in supabase/functions/.env or the environment; docs/SETUP.md shows how.')
  process.exit(1)
}

const gold = JSON.parse(readFileSync(here('./gold_set.json'), 'utf8')) as {
  now: string
  timezone: string
  projects: string[]
  cases: GoldCase[]
}
/** Which prompt a result measured: the instructions and the answer format the model was given. */
const promptId = createHash('sha256').update(SYSTEM_PROMPT).update(JSON.stringify(RESPONSE_SCHEMA)).digest('hex').slice(0, 12)

/** The model's earlier results, when they measured this same prompt. */
function earlierResults(): { id: string; attempts: number }[] {
  const path = here(`./results-${args.model}.json`)
  if (!existsSync(path)) return []
  const saved = JSON.parse(readFileSync(path, 'utf8')) as { prompt?: string; cases?: { id: string; attempts: number }[] }
  return saved.prompt === promptId ? (saved.cases ?? []) : []
}
function graded(): Set<string> {
  return new Set(earlierResults().filter((c) => c.attempts > 0).map((c) => c.id))
}
function pick(): GoldCase[] {
  if (args.remaining) {
    const done = graded()
    return gold.cases.filter((c) => !done.has(c.id))
  }
  if (args.only) return gold.cases.filter((c) => args.only!.split(',').includes(c.id))
  if (args.part) {
    const [i, n] = args.part.split('/').map(Number)
    if (!(n >= 1 && i >= 1 && i <= n)) throw new Error(`--part takes the form 2/3, not ${args.part}`)
    const size = Math.ceil(gold.cases.length / n)
    return gold.cases.slice((i - 1) * size, i * size)
  }
  return gold.cases
}
const cases = pick()
const partial = cases.length < gold.cases.length
const key = apiKey()

interface Answer {
  items: ProposedItem[]
  changes: ProposedChange[]
  reply: string | null
}
interface Tally {
  attempts: number
  passes: number
  problems: string[]
  last: Answer | null
}
const tally = new Map<string, Tally>(cases.map((c) => [c.id, { attempts: 0, passes: 0, problems: [], last: null }]))

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let first = true
const resultsFile = `results-${args.model}.json`

/** A busy model (503) is Google's problem, not the model's answer, so it is retried twice and then left ungraded. */
async function askWithRetry(c: GoldCase) {
  for (let attempt = 1; ; attempt++) {
    try {
      // Through parseRequest, as in the server function, so history, drafts and pending changes are
      // checked and trimmed the same way.
      const body = parseRequest({
        text: c.text,
        now: gold.now,
        timezone: gold.timezone,
        projects: gold.projects,
        history: c.history,
        drafts: c.drafts,
        schedule: c.schedule,
        changes: c.pending,
        compact: c.compact,
      })
      return await proposeItems(body, { apiKey: key, models: [args.model!], fetch })
    } catch (e) {
      if (!(e instanceof TrackyError && e.code === 'busy') || attempt === 3) throw e
      console.log(`busy  ${c.id}, retrying in 20s`)
      await sleep(20_000)
    }
  }
}

outer: for (let run = 1; run <= runs; run++) {
  console.log(`\nRun ${run} of ${runs}, ${args.model}, ${cases.length} cases`)
  for (const c of cases) {
    if (!first) await sleep(pauseMs)
    first = false
    const t = tally.get(c.id)!
    try {
      const result = await askWithRetry(c)
      const graded = gradeCase(c, result.items, result)
      t.attempts++
      t.last = { items: result.items, changes: result.changes, reply: result.reply }
      if (graded.passed) t.passes++
      else t.problems.push(...graded.problems.map((p) => `run ${run}: ${p}`))
      console.log(`${graded.passed ? 'pass' : 'FAIL'}  ${c.id}${graded.passed ? '' : `\n      ${graded.problems.join('\n      ')}`}`)
    } catch (e) {
      if (e instanceof TrackyError && (e.code === 'quota' || e.code === 'key')) {
        console.error(`\nStopped: ${e.message}`)
        break outer
      }
      if (e instanceof TrackyError && e.code === 'busy') {
        console.log(`skip  ${c.id}, Google stayed busy, so it is not graded`)
        continue
      }
      t.attempts++
      t.problems.push(`run ${run}: error: ${e instanceof Error ? e.message : String(e)}`)
      console.log(`FAIL  ${c.id}\n      error: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}

interface CaseResult {
  id: string
  kind: string
  passes: number
  attempts: number
  problems: string[]
  last_answer: Answer | null
  ran_at: string
}

const ranAt = new Date().toISOString()
const fresh: CaseResult[] = cases.map((c) => {
  const t = tally.get(c.id)!
  return { id: c.id, kind: c.kind, passes: t.passes, attempts: t.attempts, problems: t.problems, last_answer: t.last, ran_at: ranAt }
})

// A part, or a rerun of some cases, replaces only those cases in the model's earlier results, as long
// as they measured the same prompt.
const resultsPath = here(`./${resultsFile}`)
const earlier = (partial ? earlierResults() : []) as CaseResult[]
if (partial && existsSync(resultsPath) && earlier.length === 0) {
  console.log('The earlier results measured a different prompt, so this run starts the results over.')
}
const byId = new Map(earlier.map((c) => [c.id, c]))
for (const c of fresh) if (c.attempts > 0 || !byId.has(c.id)) byId.set(c.id, c)
const rows = gold.cases.map((c) => byId.get(c.id)).filter((c): c is CaseResult => !!c && c.attempts > 0)

const passed = rows.reduce((n, r) => n + r.passes, 0)
const attempted = rows.reduce((n, r) => n + r.attempts, 0)
const flaky = rows.filter((r) => r.passes > 0 && r.passes < r.attempts).map((r) => r.id)
const byKind: Record<string, { passed: number; attempted: number }> = {}
for (const r of rows) {
  const k = (byKind[r.kind] ??= { passed: 0, attempted: 0 })
  k.passed += r.passes
  k.attempted += r.attempts
}
const missing = gold.cases.filter((c) => !rows.some((r) => r.id === c.id)).map((c) => c.id)

const thisRun = fresh.filter((r) => r.attempts > 0)
console.log(
  `\nThis run: ${thisRun.reduce((n, r) => n + r.passes, 0)}/${thisRun.reduce((n, r) => n + r.attempts, 0)} passed on ${args.model}`,
)
console.log(`All results so far: ${passed}/${attempted} passed (${attempted ? Math.round((passed / attempted) * 100) : 0}%)`)
for (const [k, v] of Object.entries(byKind)) console.log(`  ${k.padEnd(8)} ${v.passed}/${v.attempted}`)
if (flaky.length) console.log(`Flaky (passed some runs, failed others): ${flaky.join(', ')}`)
if (missing.length) console.log(`Not run yet: ${missing.length} of ${gold.cases.length} cases (${missing.join(', ')})`)

writeFileSync(
  resultsPath,
  JSON.stringify({ model: args.model, prompt: promptId, updated_at: ranAt, runs, passed, attempted, by_kind: byKind, flaky, not_run: missing, cases: rows }, null, 2) +
    '\n',
)
console.log(`Details written to supabase/functions/tracky/eval/${resultsFile}`)
