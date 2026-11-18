import { test } from 'node:test'
import assert from 'node:assert/strict'
import { navigationSection, tabNavigation } from './navigation'

test('child routes retain their navigation section and unknown routes do not invent one', () => {
  for (const path of ['/dashboard', '/templates', '/templates/new', '/templates/abc/edit', '/exercises', '/exercises/global/squat', '/exercises/user/squat']) assert.equal(navigationSection(path), 'Train')
  for (const path of ['/history', '/workout/abc', '/workout-edit/abc']) assert.equal(navigationSection(path), 'History')
  assert.equal(navigationSection('/progress'), 'Progress')
  assert.equal(navigationSection('/coach'), 'Coach')
  for (const path of ['/', '/profile']) assert.equal(navigationSection(path), undefined)
})
test('tabs swap each other and Train pops back, so Back never replays the tab history', () => {
  assert.deepEqual(tabNavigation('/dashboard', 'History'), { kind: 'navigate', href: '/history' })
  assert.deepEqual(tabNavigation('/history', 'Progress'), { kind: 'replace', href: '/progress' })
  assert.deepEqual(tabNavigation('/coach', 'History'), { kind: 'replace', href: '/history' })
  assert.deepEqual(tabNavigation('/progress', 'Train'), { kind: 'dismissTo', href: '/dashboard' })
  assert.deepEqual(tabNavigation('/', 'Train'), { kind: 'replace', href: '/dashboard' })
  // A child screen keeps its place under the next tab, as before.
  assert.deepEqual(tabNavigation('/templates', 'Coach'), { kind: 'navigate', href: '/coach' })
})
