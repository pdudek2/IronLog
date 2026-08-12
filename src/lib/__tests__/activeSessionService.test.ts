import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  getDocFromServer: vi.fn(),
  onSnapshot: vi.fn(),
  runTransaction: vi.fn(),
  setDoc: vi.fn(),
}))

import { doc, getDocFromServer, runTransaction, setDoc } from 'firebase/firestore'
import {
  claimActiveSession,
  hasActiveSessionWork,
  persistTemplateLaunchSession,
  saveActiveSession,
  TemplateLaunchConflictError,
} from '../activeSessionService'
import { deriveLegacySessionId } from '../sessionIdentity'
import type { ActiveWorkout } from '../../store/workoutStore'

const sessionRef = { path: 'activeSessions/user-1' }
const transactionGet = vi.fn()
const transactionSet = vi.fn()
let snapshotHandler: ((snapshot: ReturnType<typeof sessionSnapshot>) => void) | undefined

function sessionSnapshot(data?: Record<string, unknown>) {
  return {
    exists: () => data !== undefined,
    data: () => data,
  }
}

const workout: ActiveWorkout = {
  sessionId: 'session-1',
  startedAt: 123,
  templateId: 'template-1',
  label: '  Push A  ',
  exercises: [{
    clientId: 'exercise-client-id',
    exerciseId: 'bench-press',
    exerciseSource: 'global',
    name: 'Bench Press',
    sets: [{
      clientId: 'set-client-id',
      weight: '80',
      reps: '8',
      done: false,
    }],
  }],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(doc).mockReturnValue(sessionRef as never)
  vi.spyOn(Date, 'now').mockReturnValue(999)
  snapshotHandler = undefined
  vi.mocked(runTransaction).mockImplementation(async (_db, update) => (
    update({
      get: transactionGet,
      set: transactionSet,
    } as never)
  ))
})

describe('hasActiveSessionWork', () => {
  it('detects whether an active session contains resumable work', () => {
    expect(hasActiveSessionWork(null)).toBe(false)
    expect(hasActiveSessionWork({ sessionId: 'session-1', startedAt: 1, exercises: [] })).toBe(false)
    expect(hasActiveSessionWork({ sessionId: 'session-1', startedAt: 1, label: '   ', exercises: [] })).toBe(false)
    expect(hasActiveSessionWork({ sessionId: 'session-1', startedAt: 1, label: 'Push A', exercises: [] })).toBe(true)
    expect(hasActiveSessionWork({
      sessionId: 'session-1',
      startedAt: 1,
      exercises: [{
        exerciseId: 'squat',
        exerciseSource: 'global',
        name: 'Squat',
        sets: [],
      }],
    })).toBe(true)
  })
})

describe('persistTemplateLaunchSession', () => {
  it('writes the existing active-session document shape when remote work is blank', async () => {
    transactionGet.mockResolvedValue(sessionSnapshot({ label: '   ', exercises: [] }))
    const expectedDocument = expect.objectContaining({
      userId: 'user-1',
      sessionId: 'session-1',
      sessionRevision: expect.any(String),
      startedAt: 123,
      templateId: 'template-1',
      label: 'Push A',
      exercises: [{
        exerciseId: 'bench-press',
        exerciseSource: 'global',
        name: 'Bench Press',
        sets: [{ weight: '80', reps: '8', done: false }],
      }],
      updatedAt: 999,
    })

    await persistTemplateLaunchSession('user-1', workout, false)
    await saveActiveSession('user-1', workout)

    expect(transactionGet).toHaveBeenCalledWith(sessionRef)
    expect(transactionSet).toHaveBeenCalledWith(sessionRef, expectedDocument)
    expect(setDoc).toHaveBeenCalledWith(sessionRef, expectedDocument)
  })

  it('throws a typed conflict without writing when remote work exists', async () => {
    transactionGet.mockResolvedValue(sessionSnapshot({ label: null, exercises: [{ exerciseId: 'squat' }] }))

    const persistence = persistTemplateLaunchSession('user-1', workout, false)

    await expect(persistence).rejects.toBeInstanceOf(TemplateLaunchConflictError)
    expect(transactionSet).not.toHaveBeenCalled()
  })

  it('writes when replacement is explicitly allowed despite remote work', async () => {
    transactionGet.mockResolvedValue(sessionSnapshot({ label: 'Current workout', exercises: [] }))

    await persistTemplateLaunchSession('user-1', workout, true)

    expect(transactionSet).toHaveBeenCalledOnce()
  })

  it('propagates transaction read failures without writing', async () => {
    const offlineError = new Error('client is offline')
    transactionGet.mockRejectedValue(offlineError)

    await expect(
      persistTemplateLaunchSession('user-1', workout, false),
    ).rejects.toBe(offlineError)
    expect(transactionSet).not.toHaveBeenCalled()
  })
})

describe('saveActiveSession', () => {
  it('writes and returns a fresh revision for every save', async () => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000002')

    await expect(saveActiveSession('user-1', workout)).resolves.toEqual({
      sessionRevision: '00000000-0000-4000-8000-000000000001',
    })
    await expect(saveActiveSession('user-1', workout)).resolves.toEqual({
      sessionRevision: '00000000-0000-4000-8000-000000000002',
    })

    expect(vi.mocked(setDoc).mock.calls.map(([, document]) => (
      document as { sessionRevision: string }
    ).sessionRevision)).toEqual([
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    ])
  })
})

describe('claimActiveSession', () => {
  it('creates the candidate only when no server session exists', async () => {
    transactionGet.mockResolvedValue(sessionSnapshot())

    await expect(claimActiveSession('user-1', workout)).resolves.toBe(workout)

    expect(transactionSet).toHaveBeenCalledOnce()
    expect(transactionSet).toHaveBeenCalledWith(sessionRef, expect.objectContaining({
      sessionRevision: expect.any(String),
    }))
  })

  it('returns the server session instead of overwriting it', async () => {
    transactionGet.mockResolvedValue(sessionSnapshot({
      sessionId: 'server-session',
      startedAt: 456,
      templateId: null,
      label: 'Pull',
      exercises: [],
    }))

    await expect(claimActiveSession('user-1', workout)).resolves.toMatchObject({
      sessionId: 'server-session',
      startedAt: 456,
      label: 'Pull',
    })
    expect(transactionSet).not.toHaveBeenCalled()
  })
})

describe('loadActiveSessionFromServer', () => {
  it('bypasses the local cache and returns the authoritative session', async () => {
    const service = await import('../activeSessionService') as unknown as {
      loadActiveSessionFromServer: (uid: string) => Promise<ActiveWorkout | null>
    }
    expect(service.loadActiveSessionFromServer).toBeTypeOf('function')
    vi.mocked(getDocFromServer).mockResolvedValue(sessionSnapshot({
      sessionId: 'server-session',
      startedAt: 456,
      templateId: null,
      label: 'Pull',
      exercises: [],
    }) as never)

    await expect(service.loadActiveSessionFromServer('user-1')).resolves.toMatchObject({
      sessionId: 'server-session',
      label: 'Pull',
    })
    expect(getDocFromServer).toHaveBeenCalledWith(sessionRef)
  })
})

describe('active session hydration', () => {
  it('derives a deterministic session ID for a legacy remote document', async () => {
    const { onSnapshot } = await import('firebase/firestore')
    const { subscribeToActiveSession } = await import('../activeSessionService')
    vi.mocked(onSnapshot).mockImplementation(((
      _ref: unknown,
      _options: unknown,
      onNext: (snapshot: unknown) => void,
    ) => {
      snapshotHandler = onNext as typeof snapshotHandler
      return vi.fn()
    }) as never)
    const onChange = vi.fn()

    subscribeToActiveSession('user-1', onChange)
    snapshotHandler?.({
      exists: () => true,
      data: () => ({ startedAt: 500, exercises: [] }),
      metadata: { fromCache: false, hasPendingWrites: false },
    } as never)

    expect(onChange).toHaveBeenCalledWith({
      session: {
        sessionId: deriveLegacySessionId('user-1', 500),
        startedAt: 500,
        templateId: null,
        exercises: [],
      },
      fromCache: false,
      hasPendingWrites: false,
    })
  })
})
