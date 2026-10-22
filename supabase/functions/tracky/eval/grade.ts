import type { ChangeSet, ChatTurn, ProposedChange, ProposedItem, ScheduleEntry } from '../logic.ts'

/**
 * One expected item. A field that is left out is not graded. A field set to null must come back
 * null. A field set to an array accepts any of its values.
 */
export interface ExpectedItem {
  /** Words the title must contain, case-insensitive. Also how expected and returned items are paired. */
  title_has: string[]
  /** Words the title must not contain, such as the day it was given. */
  title_lacks?: string[]
  kind?: ProposedItem['kind'] | ProposedItem['kind'][]
  date?: string | null | (string | null)[]
  time?: string | null | (string | null)[]
  end_time?: string | null
  all_day?: boolean
  repeat?: ProposedItem['repeat'] | ProposedItem['repeat'][]
  priority?: ProposedItem['priority'] | ProposedItem['priority'][]
  project?: string | null
  remind_minutes_before?: number | null
}

/**
 * One expected change to a saved entry, by its ref. `set` names the fields to check: a field left out
 * is not graded, null means the change must leave it alone, and an array accepts any of its values.
 */
export interface ExpectedChange {
  ref: string
  action: ProposedChange['action']
  set?: { [K in keyof ChangeSet]?: ChangeSet[K] | null | ChangeSet[K][] }
}

export interface GoldCase {
  id: string
  kind: string
  text: string
  expected: ExpectedItem[]
  note: string
  /** What came before the note, for follow-ups: the chat, and the drafts still on screen. */
  history?: ChatTurn[]
  drafts?: ProposedItem[]
  /** Saved tasks and events with their refs, for advice and changes. */
  schedule?: ScheduleEntry[]
  /** Changes on screen, not applied yet, by the refs in `schedule`. */
  pending?: ProposedChange[]
  /** The note is the /compact request. */
  compact?: boolean
  /** The changes the answer must hold. Left out, it must hold none. */
  changes?: ExpectedChange[]
  /** For answers in words: the reply must contain one word from each group, case-insensitive. */
  reply_has?: string[][]
  /** Words the reply must not contain, such as another assistant's name. */
  reply_lacks?: string[]
  /** For /compact: at most this many lines, each a "- " list line. */
  reply_lines_max?: number
}

export interface CaseResult {
  id: string
  passed: boolean
  /** Why it failed, one line per problem, in words a person can check against the note. */
  problems: string[]
}

const GRADED = ['kind', 'date', 'time', 'end_time', 'all_day', 'repeat', 'priority', 'project', 'remind_minutes_before'] as const

const titleMatches = (title: string, words: string[]) => words.every((w) => title.toLowerCase().includes(w.toLowerCase()))

const show = (v: unknown) => (v === null ? 'null' : JSON.stringify(v))

/**
 * Grades one case. It passes only when the model returned exactly the expected number of items
 * and every expected item has a partner whose graded fields all match; the same for changes, which
 * pair by ref; and when the reply says what the case asks of it.
 */
export function gradeCase(
  c: GoldCase,
  items: ProposedItem[],
  answer: { changes?: ProposedChange[]; reply?: string | null } = {},
): CaseResult {
  const problems: string[] = []
  problems.push(...gradeChanges(c.changes ?? [], answer.changes ?? []))
  problems.push(...gradeReply(c, answer.reply ?? null))
  if (items.length !== c.expected.length) {
    problems.push(`expected ${c.expected.length} item(s), got ${items.length}: ${items.map((i) => `"${i.title}"`).join(', ') || 'none'}`)
  }

  const unused = [...items]
  for (const exp of c.expected) {
    const at = unused.findIndex((i) => titleMatches(i.title, exp.title_has))
    if (at === -1) {
      problems.push(`no item with a title containing ${exp.title_has.map((w) => `"${w}"`).join(' and ')}`)
      continue
    }
    const [item] = unused.splice(at, 1)
    for (const word of exp.title_lacks ?? []) {
      if (item.title.toLowerCase().includes(word.toLowerCase())) problems.push(`"${item.title}": title should leave out "${word}"`)
    }
    for (const field of GRADED) {
      if (!(field in exp)) continue
      const want = exp[field]
      const got = item[field]
      const ok = Array.isArray(want) ? (want as unknown[]).includes(got) : want === got
      if (!ok) problems.push(`"${item.title}": ${field} is ${show(got)}, expected ${Array.isArray(want) ? want.map(show).join(' or ') : show(want)}`)
    }
  }
  return { id: c.id, passed: problems.length === 0, problems }
}

function gradeChanges(expected: ExpectedChange[], changes: ProposedChange[]): string[] {
  const problems: string[] = []
  const said = (list: { ref: string; action: string }[]) => list.map((x) => `${x.ref} ${x.action}`).join(', ') || 'none'
  if (changes.length !== expected.length) {
    problems.push(`expected ${expected.length} change(s) (${said(expected)}), got ${changes.length} (${said(changes)})`)
  }
  for (const exp of expected) {
    const got = changes.find((x) => x.ref === exp.ref)
    if (!got) {
      problems.push(`no change to ${exp.ref}`)
      continue
    }
    if (got.action !== exp.action) problems.push(`${exp.ref}: action is ${got.action}, expected ${exp.action}`)
    for (const [field, want] of Object.entries(exp.set ?? {})) {
      const value = got.set[field as keyof ChangeSet]
      const ok =
        want === null ? value === undefined : Array.isArray(want) ? (want as unknown[]).includes(value) : value === want
      if (!ok) {
        const expectedText = want === null ? 'left alone' : Array.isArray(want) ? want.map(show).join(' or ') : show(want)
        problems.push(`${exp.ref}: ${field} is ${value === undefined ? 'left alone' : show(value)}, expected ${expectedText}`)
      }
    }
  }
  return problems
}

function gradeReply(c: GoldCase, reply: string | null): string[] {
  const problems: string[] = []
  const text = (reply ?? '').toLowerCase()
  for (const group of c.reply_has ?? []) {
    if (!group.some((w) => text.includes(w.toLowerCase()))) {
      problems.push(`reply mentions none of ${group.map((w) => `"${w}"`).join(', ')}: ${show(reply)}`)
    }
  }
  for (const word of c.reply_lacks ?? []) {
    if (text.includes(word.toLowerCase())) problems.push(`reply says "${word}": ${show(reply)}`)
  }
  if (c.reply_lines_max !== undefined) {
    const lines = (reply ?? '').split('\n').filter((l) => l.trim())
    if (lines.length === 0) problems.push('no summary in the reply')
    if (lines.length > c.reply_lines_max) problems.push(`summary has ${lines.length} lines, at most ${c.reply_lines_max}`)
    if (lines.some((l) => !l.trimStart().startsWith('- '))) problems.push('every summary line should start with "- "')
  }
  return problems
}
