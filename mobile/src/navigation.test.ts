import { test } from 'node:test'
import assert from 'node:assert/strict'
import { navigationSection, scrollNavigation, tabNavigation, workoutNavigationAction } from './navigation'

test('child routes retain their navigation section and unknown routes do not invent one', () => {
  for (const path of ['/templates', '/templates/new', '/templates/abc/edit', '/exercises', '/exercises/global/squat', '/exercises/user/squat']) assert.equal(navigationSection(path), 'Plans')
  for (const path of ['/progress', '/history', '/workout/abc']) assert.equal(navigationSection(path), 'Progress')
  assert.equal(navigationSection('/'), 'Workout')
  assert.equal(navigationSection('/coach'), 'Coach')
  assert.equal(navigationSection('/profile'), undefined)
})
test('central action resumes existing work and never starts from uncertainty', () => {
  assert.equal(workoutNavigationAction('ready', 'ready', 'retry'), 'resume')
  assert.equal(workoutNavigationAction('empty', 'ready', 'ready'), 'start')
  assert.equal(workoutNavigationAction('empty', 'ready', 'unavailable'), 'start')
  for (const state of ['loading', 'cache-miss', 'error'] as const) assert.equal(workoutNavigationAction(state, 'ready', 'ready'), 'wait')
  for (const state of ['retry', 'corrupt'] as const) assert.equal(workoutNavigationAction('empty', 'ready', state), 'recover')
  for (const state of ['loading', 'starting'] as const) assert.equal(workoutNavigationAction('empty', 'ready', state), 'wait')
  for (const state of ['loading', 'pending', 'failed']) assert.equal(workoutNavigationAction('empty', state, 'ready'), 'recover')
})
test('scroll visibility tolerates jitter, restores upward and clamps overscroll', () => {
  let state = { y: 0, start: 0, direction: 0, hidden: false }
  for (const y of [25, 40, 55]) state = scrollNavigation(state, y)
  assert.equal(state.hidden, true)
  state = scrollNavigation(state, 54); assert.equal(state.hidden, true)
  state = scrollNavigation(state, 30); assert.equal(state.hidden, false)
  state = scrollNavigation(state, -8); assert.equal(state.y, 0); assert.equal(state.hidden, false)
})

test('tabs swap each other and Home pops back, so Back never replays the tab history', () => {
  assert.deepEqual(tabNavigation('/dashboard', 'Plans'), { kind: 'navigate', href: '/templates' })
  assert.deepEqual(tabNavigation('/templates', 'Progress'), { kind: 'replace', href: '/progress' })
  assert.deepEqual(tabNavigation('/coach', 'Plans'), { kind: 'replace', href: '/templates' })
  assert.deepEqual(tabNavigation('/progress', 'Home'), { kind: 'dismissTo', href: '/dashboard' })
  // A child screen keeps its place under the next tab, as before.
  assert.deepEqual(tabNavigation('/history', 'Coach'), { kind: 'navigate', href: '/coach' })
})
