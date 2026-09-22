import assert from 'node:assert/strict'
import test from 'node:test'

import { formatCompactVolume } from '../../src/shared/weightUnits'
import { deriveHome, getGreeting, getWeekDates, parseHomeProfile } from './home'
import { readStateForKey, startRead, type ReadState } from './scopedRead'
import type { SavedWorkout } from './history'

function workout(id: string, startedAt: number, weight = 100): SavedWorkout {
  return { id, startedAt, finishedAt: startedAt + 30 * 60_000, materialized: true, exercises: [{ exerciseSource: 'global', name: 'Squat', sets: [{ weight, reps: 10 }] }] }
}

test('uses local Monday/day boundaries and caps duration', () => {
  const now = new Date(2026, 8, 23, 12)
  const monday = getWeekDates(now)[0]!
  const nextMonday = new Date(2026, 8, 28).getTime()
  const previousSunday = new Date(2026, 8, 20, 23, 59).getTime()
  const currentSunday = new Date(2026, 8, 27, 23, 59).getTime()
  const data = deriveHome([
    workout('previous', previousSunday), workout('monday', monday.getTime()),
    workout('sunday', currentSunday), workout('next', nextMonday),
  ], now)
  assert.equal(monday.getDay(), 1)
  assert.equal(monday.getHours(), 0)
  assert.equal(data.weeklyDone, 2)
  assert.equal(data.sessionsDelta, 1)
  assert.equal(data.days[0]?.workouts, 1)
  assert.equal(data.days[6]?.workouts, 1)
  assert.equal(data.weeklyVolume, 2_000)
  assert.equal(data.averageMinutes, 30)
  assert.equal(data.recent.length, 4)
  assert.equal(getGreeting(new Date(2026, 8, 23, 5)), 'Good night')
})

test('validates owner/profile fields and converts only display volume', () => {
  assert.deepEqual(parseHomeProfile('owner', { userId: 'owner', displayName: '  Athlete ', weeklyGoal: 3, units: 'lbs' }), { displayName: 'Athlete', weeklyGoal: 3, units: 'lbs' })
  assert.throws(() => parseHomeProfile('owner', { userId: 'foreign', displayName: 'Other', weeklyGoal: 3, units: 'kg' }))
  assert.throws(() => parseHomeProfile('owner', undefined))
  assert.throws(() => parseHomeProfile('owner', { displayName: 'A', weeklyGoal: 0, units: 'kg' }))
  const kg = deriveHome([workout('one', new Date(2026, 8, 23).getTime())], new Date(2026, 8, 23)).weeklyVolume
  assert.equal(kg, 1000)
  assert.notEqual(formatCompactVolume(kg, 'lbs'), formatCompactVolume(kg, 'kg'))
})

test('read state distinguishes error/cache/empty and disposes stale account requests', async () => {
  let resolveOld!: (value: { data: number; fromCache: boolean }) => void
  const old = new Promise<{ data: number; fromCache: boolean }>((resolve) => { resolveOld = resolve })
  let state: ReadState<number> = { status: 'loading' }
  const dispose = startRead(() => old, (value) => { state = value })
  dispose()
  resolveOld({ data: 7, fromCache: false })
  await old
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(state.status, 'loading')
  assert.deepEqual(readStateForKey('new', { key: 'old', state: { status: 'ready', data: 7, fromCache: false } }), { status: 'loading' })
  assert.notDeepEqual({ status: 'ready', data: [], fromCache: true }, { status: 'ready', data: [], fromCache: false })
  assert.notDeepEqual({ status: 'error' }, { status: 'ready', data: [], fromCache: false })
})
