// Run with: npm test. The device's time zone is set to Jakarta in package.json, so local times are fixed.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { moveTo, occurrences, occurrencesBetween } from './repeatRules.ts'

const local = (s: string) => new Date(s)
const days = (dates: Date[]) => dates.map((d) => d.toString().slice(0, 21))

test('a weekly series keeps its weekday and time', () => {
  const found = occurrencesBetween(local('2026-10-19T09:00'), 'weekly', local('2026-10-19T09:00'), local('2026-11-10T00:00'))
  assert.deepEqual(days(found), ['Mon Oct 26 2026 09:00', 'Mon Nov 02 2026 09:00', 'Mon Nov 09 2026 09:00'])
})

test('a weekday series skips Saturday and Sunday', () => {
  const found = occurrencesBetween(local('2026-10-22T10:00'), 'weekdays', local('2026-10-22T10:00'), local('2026-10-28T00:00'))
  assert.deepEqual(days(found), ['Fri Oct 23 2026 10:00', 'Mon Oct 26 2026 10:00', 'Tue Oct 27 2026 10:00'])
})

test('a monthly series on the 31st goes back to the 31st after a shorter month', () => {
  const series = occurrences(local('2027-01-31T08:00'), 'monthly')
  const first = Array.from({ length: 4 }, () => series.next().value as Date)
  assert.deepEqual(days(first), ['Sun Jan 31 2027 08:00', 'Sun Feb 28 2027 08:00', 'Wed Mar 31 2027 08:00', 'Fri Apr 30 2027 08:00'])
})

test('only occurrences after the written part and before the end are returned', () => {
  const found = occurrencesBetween(local('2026-10-01T07:00'), 'daily', local('2026-10-20T07:00'), local('2026-10-23T07:00'))
  assert.deepEqual(days(found), ['Wed Oct 21 2026 07:00', 'Thu Oct 22 2026 07:00'])
})

test('a copied event keeps its length and how long before it the reminder comes', () => {
  const moved = moveTo(
    { title: 'Standup', starts_at: '2026-10-19T02:00:00.000Z', ends_at: '2026-10-19T02:15:00.000Z', remind_at: '2026-10-19T01:50:00.000Z' },
    new Date('2026-10-26T02:00:00.000Z'),
  )
  assert.deepEqual(moved, {
    title: 'Standup',
    starts_at: '2026-10-26T02:00:00.000Z',
    ends_at: '2026-10-26T02:15:00.000Z',
    remind_at: '2026-10-26T01:50:00.000Z',
  })
})
