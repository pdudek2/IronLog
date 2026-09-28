import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inspectPlanForDelete } from './planDeleteFlow'
import type { WorkoutTemplate } from './workoutLaunch'

const plan = (name: string): WorkoutTemplate => ({ id: 'plan-1', userId: 'alice', name, updatedAt: 1, days: [{ name: 'Day 1', exercises: [] }] })

test('delete error Retry performs a fresh check and can complete confirmed deletion', async () => {
  let reads = 0
  let deletes = 0
  const current = plan('Current name')
  const result = await inspectPlanForDelete(current, { id: current.id, status: 'error' }, true, async () => { reads++; return current })
  assert.equal(result.kind, 'confirm')
  assert.equal(reads, 1)
  if (result.kind === 'confirm') { assert.equal(result.current.name, 'Current name'); deletes++ }
  assert.equal(deletes, 1)
  const blocked = await inspectPlanForDelete(current, { id: current.id, status: 'deleting' }, true, async () => { reads++; return current })
  assert.equal(blocked.kind, 'busy')
  assert.equal(reads, 1)
})

test('delete Retry refuses a changed baseline until the refreshed plan is reviewed', async () => {
  const old = plan('Old name')
  const changed = plan('External name')
  const stale = await inspectPlanForDelete(old, { id: old.id, status: 'error' }, true, async () => changed)
  assert.equal(stale.kind, 'changed')
  const refreshed = await inspectPlanForDelete(changed, { id: changed.id, status: 'error' }, true, async () => changed)
  assert.equal(refreshed.kind, 'confirm')
})
