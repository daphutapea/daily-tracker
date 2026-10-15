import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { ProposedItem } from '../logic.ts'
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
