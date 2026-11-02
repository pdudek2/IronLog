import assert from 'node:assert/strict'
import test from 'node:test'
import { exerciseMetrics, exerciseSummaryLabel, exerciseTargetLabel, focusExerciseIndex, focusSetIndex, formatPreviousSet, panelSetIndex, setPairLabel, upNextQueue, EQUIPMENT_LABELS } from '../../src/shared/workoutDisplay'
import { getAuthErrorMessage } from '../../src/shared/authErrors'
import { overloadHintLabel } from '../../src/shared/nextSessionRecommendation'
import { shouldDismissSheet } from '../../src/shared/sheetMotion'
import { parseExerciseHistory, parsePreviousSets, startRead, readStateForKey, type ReadState, type ReadResult } from './scopedRead'

const flush = () => new Promise((resolve) => setImmediate(resolve))
test('shared rules keep Max, focus and history faithful beyond the screenshot fixture', () => {
  const done = { weight: '100', reps: '', done: true }
  const open = { weight: '20', reps: '8', done: false }
  assert.deepEqual(exerciseMetrics([done, { weight: '50', reps: '5', done: true }, open]), { completed: 1, volumeKg: 250, maxKg: 100 })
  assert.equal(focusExerciseIndex([{ sets: [done] }, { sets: [open, open] }]), 1)
  assert.equal(focusExerciseIndex([{ sets: [done] }, { sets: [done] }]), 1)
  assert.equal(focusExerciseIndex([]), -1)
  assert.equal(focusSetIndex([done, open, open]), 1)
  assert.equal(EQUIPMENT_LABELS.bodyweight, 'BW')
  assert.equal(EQUIPMENT_LABELS.kettlebell, 'KB')
  assert.equal(formatPreviousSet({ weight: 65, reps: 8 }, 'lbs'), '143.3×8')
  assert.equal(formatPreviousSet(undefined, 'kg'), '—')
  assert.equal(getAuthErrorMessage({ code: 'auth/too-many-requests' }, 'login'), 'Too many attempts. Wait a moment and try again.')
})

test('the session shows one exercise: the queue, the target and the panel set agree on both platforms', () => {
  const done = { weight: '50', reps: '8', done: true }
  const open = { weight: '51.25', reps: '8', done: false }
  const exercises = [{ sets: [done] }, { sets: [open] }, { sets: [done, done] }, { sets: [open, open, open] }, { sets: [] }]
  assert.deepEqual(upNextQueue(exercises, 2), [3, 1])
  assert.deepEqual(upNextQueue(exercises, 3), [1])
  assert.deepEqual(upNextQueue(exercises, -1), [1, 3])
  assert.deepEqual(upNextQueue([], 0), [])
  assert.equal(exerciseTargetLabel([done, open, open], 'kg'), '3 × 8 · 51.25 kg')
  assert.equal(exerciseTargetLabel([{ weight: '', reps: '', done: false }], 'kg'), '1 set')
  assert.equal(exerciseTargetLabel([{ weight: '0', reps: '12', done: false }, open], 'kg'), '2 × 12')
  assert.equal(exerciseSummaryLabel([{ weight: 80, reps: 8 }, { weight: 90, reps: 5 }, { weight: 90, reps: 6 }], 'kg'), '3 sets · 90 × 6')
  assert.equal(exerciseSummaryLabel([{ weight: 0, reps: 12 }], 'kg'), '1 set · 12 reps')
  assert.equal(exerciseSummaryLabel([], 'kg'), '0 sets')
  assert.equal(setPairLabel({ weight: '51.25', reps: '8' }, 'kg'), '51.25 × 8')
  assert.equal(setPairLabel({ weight: '', reps: '' }, 'kg'), '0 × 0')
  const sets = [{ clientId: 'a', done: true }, { clientId: 'b', done: false }, { clientId: 'c', done: false }]
  assert.equal(panelSetIndex(sets, null), 1)
  assert.equal(panelSetIndex(sets, 'a'), 0)
  assert.equal(panelSetIndex(sets, 'c'), 2)
  assert.equal(panelSetIndex(sets, 'gone'), 1)
  assert.equal(panelSetIndex([{ done: true }], '0'), 0)
  assert.equal(panelSetIndex([{ clientId: 'a', done: true }], null), -1)
})

test('history validates owner/source and row order instead of manufacturing missing values', () => {
  const data = { userId: 'a', exerciseId: 'same-id', exerciseSource: 'user', sets: [{ weight: 65, reps: 8 }, { weight: 60, reps: 10 }] }
  assert.equal(formatPreviousSet(parsePreviousSets(data, 'a', 'same-id', 'user')[1], 'kg'), '60×10')
  assert.throws(() => parsePreviousSets(data, 'b', 'same-id', 'user'))
  assert.throws(() => parsePreviousSets(data, 'a', 'same-id', 'global'))
  assert.throws(() => parsePreviousSets({ ...data, sets: [{ weight: 'bad', reps: 8 }] }, 'a', 'same-id', 'user'))
})

test('the last session fills Last, and three sessions earn the same suggestion as web', () => {
  const now = 1_000_000_000_000
  const session = (bestSetWeight: number, daysAgo: number) => ({ userId: 'a', exerciseId: 'bench', exerciseSource: 'global', bestSetWeight, finishedAt: now - daysAgo * 86_400_000, sets: [{ weight: bestSetWeight, reps: 6 }] })
  const fresh = parseExerciseHistory([session(85, 2), session(82.5, 9), session(80, 16)], 'a', 'bench', 'global', now)
  assert.deepEqual(fresh.sets, [{ weight: 85, reps: 6 }])
  assert.equal(fresh.suggestion?.suggestedWeight, 87.5)
  assert.equal(overloadHintLabel(fresh.suggestion!, 'kg'), 'Suggested +2.5 kg')
  const stale = parseExerciseHistory([session(85, 30), session(82.5, 37), session(80, 44)], 'a', 'bench', 'global', now)
  assert.equal(overloadHintLabel(stale.suggestion!, 'kg'), 'Long break: suggested −2.5 kg')
  assert.equal(parseExerciseHistory([session(85, 2)], 'a', 'bench', 'global', now).suggestion, null)
  assert.equal(parseExerciseHistory([session(88.75, 2), session(86.25, 9), session(85, 16)], 'a', 'bench', 'global', now).suggestion?.suggestedWeight, 91.25)
  assert.deepEqual(parseExerciseHistory([], 'a', 'bench', 'global', now), { sets: [], suggestion: null })
})

test('a sheet closes on a long or fast pull and springs back otherwise', () => {
  assert.equal(shouldDismissSheet(97, 0), true)
  assert.equal(shouldDismissSheet(40, 501), true)
  assert.equal(shouldDismissSheet(96, 500), false)
  assert.equal(shouldDismissSheet(-200, -900), false)
})

test('auxiliary reads mask old identities and reject late completion after disposal', async () => {
  let finish!: (result: ReadResult<string[]>) => void
  const seen: ReadState<string[]>[] = []
  const cancel = startRead(() => new Promise<ReadResult<string[]>>((resolve) => { finish = resolve }), (state) => seen.push(state))
  await flush()
  cancel()
  finish({ data: ['private A'], fromCache: false })
  await flush()
  assert.deepEqual(seen, [{ status: 'loading' }])
  assert.deepEqual(readStateForKey('b:global:id', { key: 'a:user:id', state: { status: 'ready', data: ['private A'], fromCache: false } }), { status: 'loading' })
  startRead<string[]>(async () => { throw new Error('permission-denied') }, (state) => seen.push(state))
  await flush()
  assert.equal(seen.at(-1)?.status, 'error')
  startRead(async () => ({ data: [], fromCache: false }), (state) => seen.push(state))
  await flush()
  assert.deepEqual(seen.at(-1), { status: 'ready', data: [], fromCache: false })
})
