import type { ProposedItem } from '../logic.ts'

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
  priority?: ProposedItem['priority'] | ProposedItem['priority'][]
  project?: string | null
  remind_minutes_before?: number | null
}

export interface GoldCase {
  id: string
  kind: string
  text: string
  expected: ExpectedItem[]
  note: string
}

export interface CaseResult {
  id: string
  passed: boolean
  /** Why it failed, one line per problem, in words a person can check against the note. */
  problems: string[]
}

const GRADED = ['kind', 'date', 'time', 'end_time', 'all_day', 'priority', 'project', 'remind_minutes_before'] as const

const titleMatches = (title: string, words: string[]) => words.every((w) => title.toLowerCase().includes(w.toLowerCase()))

const show = (v: unknown) => (v === null ? 'null' : JSON.stringify(v))

/**
 * Grades one case. It passes only when the model returned exactly the expected number of items
 * and every expected item has a partner whose graded fields all match.
 */
export function gradeCase(c: GoldCase, items: ProposedItem[]): CaseResult {
  const problems: string[] = []
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
