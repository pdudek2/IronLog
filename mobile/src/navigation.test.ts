import { test } from 'node:test'
import assert from 'node:assert/strict'
import { navigationSection, scrollNavigation, workoutNavigationAction } from './navigation'

test('child routes retain their navigation section and unknown routes do not invent one', () => {
  for (const path of ['/templates', '/templates/new', '/templates/abc/edit']) assert.equal(navigationSection(path), 'Plans')
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
