import { test } from 'node:test'
import assert from 'node:assert/strict'
import { navigationSection, scrollNavigation, tabNavigation } from './navigation'

test('child routes retain their navigation section and unknown routes do not invent one', () => {
  for (const path of ['/dashboard', '/templates', '/templates/new', '/templates/abc/edit', '/exercises', '/exercises/global/squat', '/exercises/user/squat']) assert.equal(navigationSection(path), 'Train')
  for (const path of ['/history', '/workout/abc', '/workout-edit/abc']) assert.equal(navigationSection(path), 'History')
  assert.equal(navigationSection('/progress'), 'Progress')
  assert.equal(navigationSection('/coach'), 'Coach')
  for (const path of ['/', '/profile']) assert.equal(navigationSection(path), undefined)
})
test('scroll visibility tolerates jitter, restores upward and clamps overscroll', () => {
  let state = { y: 0, start: 0, direction: 0, hidden: false }
  for (const y of [25, 40, 55]) state = scrollNavigation(state, y, 1000, 90)
  assert.equal(state.hidden, true)
  state = scrollNavigation(state, 54, 1000, 90); assert.equal(state.hidden, true)
  state = scrollNavigation(state, 30, 1000, 90); assert.equal(state.hidden, false)
  state = scrollNavigation(state, -8, 1000, 90); assert.equal(state.y, 0); assert.equal(state.hidden, false)
})
test('hiding the bar grows the viewport, and that pull back from the end does not bring the bar back', () => {
  const bar = 90
  let state = { y: 0, start: 0, direction: 0, hidden: false }
  for (const y of [40, 120]) state = scrollNavigation(state, y, 164, bar)
  assert.equal(state.hidden, true)
  state = scrollNavigation(state, 74, 74, bar); assert.equal(state.y, 74); assert.equal(state.hidden, true)
  state = scrollNavigation(state, 60, 74, bar); assert.equal(state.hidden, true)
  state = scrollNavigation(state, 45, 74, bar); assert.equal(state.hidden, false)
})
test('the bar stays when hiding it would leave the page nothing to scroll', () => {
  let state = { y: 0, start: 0, direction: 0, hidden: false }
  for (const y of [30, 60]) state = scrollNavigation(state, y, 100, 90)
  assert.equal(state.hidden, false)
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
