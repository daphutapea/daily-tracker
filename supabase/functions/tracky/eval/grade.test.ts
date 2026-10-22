import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { ProposedChange, ProposedItem } from '../logic.ts'
import { gradeCase, type GoldCase } from './grade.ts'

const item = (patch: Partial<ProposedItem>): ProposedItem => ({
  kind: 'task',
  title: 'Untitled',
  date: null,
  time: null,
  end_time: null,
  all_day: false,
  priority: 'medium',
  project: null,
  remind_minutes_before: null,
  location: null,
  ...patch,
})

const twoItems: GoldCase = {
  id: 'two',
  kind: 'multi',
  text: '',
  note: '',
  expected: [
    { title_has: ['dennis'], title_lacks: ['tuesday'], kind: 'event', date: '2026-10-20', time: '10:00', end_time: null },
    { title_has: ['labelling'], kind: 'task', priority: ['high', 'urgent'], date: ['2026-10-16', null] },
  ],
}

test('a correct answer passes, whatever order the items come back in', () => {
  const r = gradeCase(twoItems, [
    item({ title: 'Finish the labelling sheet', priority: 'urgent' }),
    item({ kind: 'event', title: 'Sync with Dennis', date: '2026-10-20', time: '10:00' }),
  ])
  assert.deepEqual(r, { id: 'two', passed: true, problems: [] })
})

test('a wrong field fails and says which field and what was expected', () => {
  const r = gradeCase(twoItems, [
    item({ kind: 'event', title: 'Sync with Dennis', date: '2026-10-21', time: '10:00' }),
    item({ title: 'Labelling sheet', priority: 'medium' }),
  ])
  assert.equal(r.passed, false)
  assert.deepEqual(r.problems, [
    '"Sync with Dennis": date is "2026-10-21", expected "2026-10-20"',
    '"Labelling sheet": priority is "medium", expected "high" or "urgent"',
  ])
})

test('null in the gold set means the field must be null', () => {
  const r = gradeCase(twoItems, [
    item({ kind: 'event', title: 'Dennis sync', date: '2026-10-20', time: '10:00', end_time: '11:00' }),
    item({ title: 'labelling', priority: 'high' }),
  ])
  assert.deepEqual(r.problems, ['"Dennis sync": end_time is "11:00", expected null'])
})

test('a missing item, an extra item and a title with the day in it all fail', () => {
  const missing = gradeCase(twoItems, [item({ kind: 'event', title: 'Sync with Dennis Tuesday', date: '2026-10-20', time: '10:00' })])
  assert.deepEqual(missing.problems, [
    'expected 2 item(s), got 1: "Sync with Dennis Tuesday"',
    '"Sync with Dennis Tuesday": title should leave out "tuesday"',
    'no item with a title containing "labelling"',
  ])

  const invented = gradeCase({ id: 'none', kind: 'refusal', text: '', note: '', expected: [] }, [item({ title: 'Say thanks' })])
  assert.deepEqual(invented.problems, ['expected 0 item(s), got 1: "Say thanks"'])
})

test('every gold case is well formed', () => {
  const gold = JSON.parse(readFileSync(new URL('./gold_set.json', import.meta.url), 'utf8')) as { cases: GoldCase[] }
  const ids = new Set<string>()
  for (const c of gold.cases) {
    assert.ok(!ids.has(c.id), `duplicate id ${c.id}`)
    ids.add(c.id)
    assert.ok(c.text.trim() && c.note.trim(), `${c.id} needs text and a note`)
    for (const e of c.expected) {
      assert.ok(e.title_has.length > 0, `${c.id}: every expected item needs title words to pair it by`)
      for (const d of [e.date].flat()) assert.ok(d === undefined || d === null || /^\d{4}-\d{2}-\d{2}$/.test(d), `${c.id}: bad date ${d}`)
      for (const t of [e.time, e.end_time].flat()) assert.ok(t === undefined || t === null || /^\d{2}:\d{2}$/.test(t), `${c.id}: bad time ${t}`)
    }
  }
  assert.ok(gold.cases.length >= 20)
})

const change = (patch: Partial<ProposedChange>): ProposedChange => ({ ref: 'T1', action: 'update', kind: 'task', title: 'Report', set: {}, ...patch })

test('changes pair by ref, and their action and named fields must match', () => {
  const c: GoldCase = {
    id: 'move', kind: 'change', text: '', note: '', expected: [],
    changes: [{ ref: 'T1', action: 'update', set: { at: '2026-10-16T17:00', priority: null } }, { ref: 'T2', action: 'done' }],
  }
  const right = gradeCase(c, [], { changes: [change({ ref: 'T2', action: 'done' }), change({ set: { at: '2026-10-16T17:00' } })] })
  assert.equal(right.passed, true)
  const wrong = gradeCase(c, [], { changes: [change({ set: { at: '2026-10-19T17:00', priority: 'high' } })] })
  assert.deepEqual(wrong.problems, [
    'expected 2 change(s) (T1 update, T2 done), got 1 (T1 update)',
    'T1: at is "2026-10-19T17:00", expected "2026-10-16T17:00"',
    'T1: priority is "high", expected left alone',
    'no change to T2',
  ])
})

test('a case without changes fails when the answer changes something anyway', () => {
  const r = gradeCase({ id: 'note', kind: 'task', text: '', note: '', expected: [] }, [], { changes: [change({ action: 'delete' })] })
  assert.deepEqual(r.problems, ['expected 0 change(s) (none), got 1 (T1 delete)'])
})

test('a reply must name one word from each group, none of the banned ones, and a summary stays short', () => {
  const c: GoldCase = { id: 'r', kind: 'advice', text: '', note: '', expected: [], reply_has: [['dentist', '09:30']], reply_lacks: ['claude'] }
  assert.equal(gradeCase(c, [], { reply: 'You have the dentist at 09:30.' }).passed, true)
  assert.equal(gradeCase(c, [], { reply: 'Monday is free. I am Claude.' }).problems.length, 2)
  const summary: GoldCase = { id: 's', kind: 'compact', text: '', note: '', expected: [], reply_lines_max: 2 }
  assert.equal(gradeCase(summary, [], { reply: '- One\n- Two' }).passed, true)
  assert.deepEqual(gradeCase(summary, [], { reply: '- One\nTwo\n- Three' }).problems, [
    'summary has 3 lines, at most 2',
    'every summary line should start with "- "',
  ])
})
