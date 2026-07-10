import { beforeEach, describe, expect, it, vi } from 'vitest'

const { firestore, snapshots } = vi.hoisted(() => {
  const snapshots: Array<{ docs: Array<{ id: string; data: () => Record<string, unknown> }> }> = []
  const firestore = {
    collection: vi.fn((_: unknown, name: string) => ({ type: 'collection', name })),
    getDocs: vi.fn(),
    limit: vi.fn((count: number) => ({ type: 'limit', count })),
    orderBy: vi.fn((field: string, direction: string) => ({ type: 'orderBy', field, direction })),
    query: vi.fn((...tokens: unknown[]) => ({ type: 'query', tokens })),
    startAfter: vi.fn((cursor: unknown) => ({ type: 'startAfter', cursor })),
    where: vi.fn((field: string, operator: string, value: unknown) => ({ type: 'where', field, operator, value })),
  }

  return { firestore, snapshots }
})

vi.mock('../firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => firestore)

import { getProgressSessions, getRecords } from '../progressService'

function snapshot(docs: Array<{ id: string; data: () => Record<string, unknown> }>) {
  return { docs }
}

function progressSessionDocument(index: number) {
  return {
    id: `session-${String(index).padStart(4, '0')}`,
    data: () => ({
      workoutId: `workout-${index}`,
      exerciseId: `exercise-${index}`,
      exerciseSource: 'global',
      finishedAt: index,
      totalVolume: index * 10,
      totalSets: 3,
      bestSetWeight: 80,
      exerciseName: `Exercise ${index}`,
      muscleGroups: ['chest'],
    }),
  }
}

function recordDocument(
  id: string,
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    id,
    data: () => ({
      exerciseId: id,
      exerciseSource: 'global',
      exerciseName: id,
      maxWeight: 10,
      maxReps: 1,
      bestVolume: 10,
      totalSessions: 1,
      lastPerformedAt: 1,
      ...overrides,
    }),
  }
}

beforeEach(() => {
  snapshots.length = 0
  firestore.getDocs.mockReset()
  firestore.getDocs.mockImplementation(async () => {
    const next = snapshots.shift()
    if (!next) throw new Error('Unexpected Firestore query')
    return next
  })
})

describe('progress queries', () => {
  it('returns exactly 5000 sessions with truncated false when no 5001st document exists', async () => {
    for (let page = 0; page < 10; page++) {
      snapshots.push(snapshot(Array.from({ length: 500 }, (_, offset) => progressSessionDocument(page * 500 + offset + 1))))
    }
    snapshots.push(snapshot([]))

    const result = await getProgressSessions('user-1', 0)

    expect(result.truncated).toBe(false)
    expect(result.sessions).toHaveLength(5_000)
    expect(result.sessions[0]?.id).toBe('session-0001')
    expect(result.sessions.at(-1)?.id).toBe('session-5000')
  })

  it('reads the 5001st session and returns truncated true without exposing it', async () => {
    for (let page = 0; page < 10; page++) {
      snapshots.push(snapshot(Array.from({ length: 500 }, (_, offset) => progressSessionDocument(page * 500 + offset + 1))))
    }
    snapshots.push(snapshot([progressSessionDocument(5_001)]))

    const result = await getProgressSessions('user-1', 0)

    expect(result).toMatchObject({ truncated: true })
    expect(result.sessions).toHaveLength(5_000)
    expect(result.sessions.some((session) => session.id === 'session-5001')).toBe(false)
    expect(firestore.getDocs).toHaveBeenCalledTimes(11)
  })

  it('paginates records past the 500-row PAGE_SIZE and sorts the complete result deterministically', async () => {
    const fillers = Array.from({ length: 498 }, (_, index) => recordDocument(`record-filler-${String(index).padStart(3, '0')}`))
    snapshots.push(snapshot([
      ...fillers,
      recordDocument('record-zeta', { exerciseName: 'Zeta', maxWeight: 100, maxReps: 5, bestVolume: 500 }),
      recordDocument('record-alpha', { exerciseName: 'Alpha', maxWeight: 100, maxReps: 5, bestVolume: 500 }),
    ]))
    snapshots.push(snapshot([
      recordDocument('record-reps', { exerciseName: 'Reps', maxWeight: 100, maxReps: 10, bestVolume: 500 }),
      recordDocument('record-volume', { exerciseName: 'Volume', maxWeight: 100, maxReps: 1, bestVolume: 600 }),
      recordDocument('record-weight', { exerciseName: 'Weight', maxWeight: 120, maxReps: 1, bestVolume: 1 }),
    ]))

    const result = await getRecords('user-1')

    expect(result.truncated).toBe(false)
    expect(result.records).toHaveLength(503)
    expect(result.records.slice(0, 5).map((record) => record.id)).toEqual([
      'record-weight',
      'record-volume',
      'record-reps',
      'record-alpha',
      'record-zeta',
    ])
  })

  it('reads the 1001st record and returns only 1000 with truncated true', async () => {
    snapshots.push(snapshot(Array.from({ length: 500 }, (_, index) => recordDocument(`record-${String(index + 1).padStart(4, '0')}`))))
    snapshots.push(snapshot(Array.from({ length: 500 }, (_, index) => recordDocument(`record-${String(index + 501).padStart(4, '0')}`))))
    snapshots.push(snapshot([recordDocument('record-1001')]))

    const result = await getRecords('user-1')

    expect(result.truncated).toBe(true)
    expect(result.records).toHaveLength(1_000)
    expect(result.records.some((record) => record.id === 'record-1001')).toBe(false)
    expect(firestore.getDocs).toHaveBeenCalledTimes(3)
  })
})
