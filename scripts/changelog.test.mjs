// The changelog and the version the app shows in Settings must agree, otherwise Settings names a
// build the changelog doesn't describe. Run with `npm test`.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const changelog = read('CHANGELOG.md')
const versions = [...changelog.matchAll(/^## v(\d+)\.(\d+) \((\d{4}-\d{2}-\d{2})\)$/gm)].map((m) => ({
  major: Number(m[1]),
  minor: Number(m[2]),
  date: m[3],
}))

test('the changelog has entries in the expected heading format', () => {
  assert.ok(versions.length > 0, 'no "## vX.Y (YYYY-MM-DD)" headings in CHANGELOG.md')
  const headings = changelog.match(/^## .*$/gm) ?? []
  assert.equal(headings.length, versions.length, `a version heading is malformed: ${headings.join(' | ')}`)
})

test('the newest entry matches the version in package.json', () => {
  const [major, minor] = JSON.parse(read('package.json')).version.split('.').map(Number)
  assert.deepEqual({ major, minor }, { major: versions[0].major, minor: versions[0].minor }, 'CHANGELOG.md and package.json disagree')
})

test('versions run newest first, and dates never go forward down the file', () => {
  for (let i = 1; i < versions.length; i++) {
    const [a, b] = [versions[i - 1], versions[i]]
    assert.ok(a.major > b.major || (a.major === b.major && a.minor > b.minor), `v${b.major}.${b.minor} is out of order`)
    assert.ok(a.date >= b.date, `v${b.major}.${b.minor} is dated after the version above it`)
  }
})

test('every entry uses only the agreed sections', () => {
  const allowed = new Set(['Added', 'Changed', 'Fixed', 'Removed', 'Known limitations'])
  for (const [, name] of changelog.matchAll(/^### (.+)$/gm)) assert.ok(allowed.has(name), `unknown section "${name}"`)
})
