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

function queuePages(docs: Array<{ id: string; data: () => Record<string, unknown> }>) {
  for (let offset = 0; offset <= docs.length; offset += 1_000) {
    snapshots.push(snapshot(docs.slice(offset, offset + 1_000)))
  }
}

describe('progress queries', () => {
  it.each([0, 999, 1_000, 1_001, 5_000, 5_001])('pages %i sessions in batches of 1000 and preserves cap/order', async (count) => {
    const docs = Array.from({ length: count }, (_, index) => progressSessionDocument(count - index))
    queuePages(docs)

    const result = await getProgressSessions('user-1', 123)

    expect(result.truncated).toBe(count > 5_000)
    expect(result.sessions).toHaveLength(Math.min(count, 5_000))
    expect(result.sessions.map((session) => session.finishedAt)).toEqual(
      Array.from({ length: Math.min(count, 5_000) }, (_, index) => count - index),
    )
    const pageCount = Math.floor(count / 1_000) + 1
    expect(firestore.getDocs).toHaveBeenCalledTimes(pageCount)
    for (let page = 0; page < pageCount; page++) {
      expect(firestore.getDocs).toHaveBeenNthCalledWith(page + 1, {
        type: 'query',
        tokens: [
          { type: 'collection', name: 'exerciseSessions' },
          { type: 'where', field: 'userId', operator: '==', value: 'user-1' },
          { type: 'where', field: 'finishedAt', operator: '>=', value: 123 },
          { type: 'orderBy', field: 'finishedAt', direction: 'desc' },
          ...(page > 0 ? [{ type: 'startAfter', cursor: docs[page * 1_000 - 1] }] : []),
          { type: 'limit', count: Math.min(1_000, 5_001 - page * 1_000) },
        ],
      })
    }
  })

  it.each([0, 999, 1_000, 1_001])('pages %i records and excludes the cap probe before sorting', async (count) => {
    const docs = Array.from({ length: count }, (_, index) => recordDocument(
      `record-${String(index + 1).padStart(4, '0')}`,
      { maxWeight: index + 1 },
    ))
    queuePages(docs)

    const result = await getRecords('user-1')

    expect(result.truncated).toBe(count > 1_000)
    expect(result.records).toHaveLength(Math.min(count, 1_000))
    expect(result.records.some((record) => record.id === 'record-1001')).toBe(false)
    expect(result.records.map((record) => record.maxWeight)).toEqual(
      Array.from({ length: Math.min(count, 1_000) }, (_, index) => Math.min(count, 1_000) - index),
    )
    const pageCount = Math.floor(count / 1_000) + 1
    expect(firestore.getDocs).toHaveBeenCalledTimes(pageCount)
    for (let page = 0; page < pageCount; page++) {
      expect(firestore.getDocs).toHaveBeenNthCalledWith(page + 1, {
        type: 'query',
        tokens: [
          { type: 'collection', name: 'records' },
          { type: 'where', field: 'userId', operator: '==', value: 'user-1' },
          ...(page > 0 ? [{ type: 'startAfter', cursor: docs[page * 1_000 - 1] }] : []),
          { type: 'limit', count: page === 0 ? 1_000 : 1 },
        ],
      })
    }
  })

  it('sorts more than 500 records deterministically by weight, volume, reps, name and ID', async () => {
    const fillers = Array.from({ length: 498 }, (_, index) => recordDocument(`record-filler-${String(index).padStart(3, '0')}`))
    snapshots.push(snapshot([
      ...fillers,
      recordDocument('record-zeta', { exerciseName: 'Zeta', maxWeight: 100, maxReps: 5, bestVolume: 500 }),
      recordDocument('record-alpha-2', { exerciseName: 'Alpha', maxWeight: 100, maxReps: 5, bestVolume: 500 }),
      recordDocument('record-alpha-1', { exerciseName: 'Alpha', maxWeight: 100, maxReps: 5, bestVolume: 500 }),
      recordDocument('record-reps', { exerciseName: 'Reps', maxWeight: 100, maxReps: 10, bestVolume: 500 }),
      recordDocument('record-volume', { exerciseName: 'Volume', maxWeight: 100, maxReps: 1, bestVolume: 600 }),
      recordDocument('record-weight', { exerciseName: 'Weight', maxWeight: 120, maxReps: 1, bestVolume: 1 }),
    ]))

    const result = await getRecords('user-1')

    expect(result.truncated).toBe(false)
    expect(result.records).toHaveLength(504)
    expect(result.records.slice(0, 6).map((record) => record.id)).toEqual([
      'record-weight',
      'record-volume',
      'record-reps',
      'record-alpha-1',
      'record-alpha-2',
      'record-zeta',
    ])
    expect(firestore.getDocs).toHaveBeenCalledTimes(1)
  })

  it('loads both cap-sized datasets with eight total reads including probes', async () => {
    queuePages(Array.from({ length: 5_001 }, (_, index) => progressSessionDocument(index)))
    const sessions = await getProgressSessions('user-1', 0)
    queuePages(Array.from({ length: 1_001 }, (_, index) => recordDocument(`record-${index}`)))
    const records = await getRecords('user-1')

    expect(sessions).toMatchObject({ truncated: true })
    expect(records).toMatchObject({ truncated: true })
    expect(firestore.getDocs).toHaveBeenCalledTimes(8)
  })
})
