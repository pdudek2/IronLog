import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { auth } = vi.hoisted(() => ({
  auth: {
    currentUser: null as { uid: string; getIdToken: () => Promise<string> } | null,
  },
}))

vi.mock('../firebase', () => ({ db: {}, auth }))
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
}))

import {
  buildActiveWorkoutFromTemplate,
  createTemplate,
  templateExerciseKey,
  updateTemplate,
  type WorkoutTemplate,
} from '../templateService'

function template(overrides: Partial<WorkoutTemplate> = {}): WorkoutTemplate {
  return {
    id: 'template-1',
    userId: 'user-1',
    name: 'Upper',
    createdAt: 1,
    updatedAt: 2,
    days: [{
      name: 'Day 1',
      exercises: [{
        exerciseId: 'incline-bench-press',
        exerciseSource: 'global',
        name: 'Incline Bench Press',
        sets: 3,
        targetReps: 8,
        targetWeight: 0,
      }],
    }],
    ...overrides,
  }
}

describe('buildActiveWorkoutFromTemplate', () => {
  it('uses recent exercise history before template targets', () => {
    const workout = buildActiveWorkoutFromTemplate(
      template(),
      0,
      new Map([
        [templateExerciseKey('incline-bench-press', 'global'), {
          bestSetWeight: 42.5,
          bestSetReps: 6,
        }],
      ]),
    )

    expect(workout.exercises[0].sets).toEqual([
      { weight: '42.5', reps: '6', done: false },
      { weight: '42.5', reps: '6', done: false },
      { weight: '42.5', reps: '6', done: false },
    ])
  })

  it('falls back to template targets when there is no recent history', () => {
    const workout = buildActiveWorkoutFromTemplate(template({
      days: [{
        name: 'Day 1',
        exercises: [{
          exerciseId: 'squat',
          exerciseSource: 'global',
          name: 'Squat',
          sets: 2,
          targetReps: 5,
          targetWeight: 100,
        }],
      }],
    }))

    expect(workout.sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/)

    expect(workout.exercises[0].sets).toEqual([
      { weight: '100', reps: '5', done: false },
      { weight: '100', reps: '5', done: false },
    ])
  })

  it('applies a recommendation over history without replacing unchanged fields', () => {
    const workout = buildActiveWorkoutFromTemplate(
      template(),
      0,
      new Map([
        [templateExerciseKey('incline-bench-press', 'global'), {
          bestSetWeight: 42.5,
          bestSetReps: 6,
        }],
      ]),
      new Map([
        [templateExerciseKey('incline-bench-press', 'global'), {
          sets: 2,
          weight: 45,
        }],
      ]),
    )

    expect(workout.exercises[0].sets).toEqual([
      { weight: '45', reps: '6', done: false },
      { weight: '45', reps: '6', done: false },
    ])
  })
})

describe('template saves', () => {
  beforeEach(() => {
    auth.currentUser = {
      uid: 'user-1',
      getIdToken: vi.fn().mockResolvedValue('id-token'),
    }
  })

  afterEach(() => {
    auth.currentUser = null
    vi.unstubAllGlobals()
  })

  it('creates through the authenticated endpoint and preserves the multi-day response', async () => {
    const input = {
      name: 'Three day plan',
      days: [
        template().days[0],
        { name: 'Lower', exercises: [] },
        { name: 'Rest', exercises: [] },
      ],
    }
    const saved = { id: 'template-2', userId: 'user-1', createdAt: 10, updatedAt: 10, ...input }
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ template: saved }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(createTemplate('user-1', input)).resolves.toEqual(saved)
    expect(fetchMock).toHaveBeenCalledWith('/api/save-template', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer id-token' }),
      body: JSON.stringify(input),
    }))
  })

  it('updates through the endpoint with the template id', async () => {
    const saved = template()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ template: saved }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await updateTemplate(saved.id, { name: saved.name, days: saved.days })
    expect(fetchMock).toHaveBeenCalledWith('/api/save-template', expect.objectContaining({
      body: JSON.stringify({ id: saved.id, name: saved.name, days: saved.days }),
    }))
  })

  it('does not send a request when token acquisition fails', async () => {
    auth.currentUser!.getIdToken = vi.fn().mockRejectedValue(new Error('token unavailable'))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(createTemplate('user-1', { name: 'Plan', days: template().days }))
      .rejects.toThrow('token unavailable')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not send a request after the account changes while obtaining a token', async () => {
    auth.currentUser!.getIdToken = async () => {
      auth.currentUser = { uid: 'user-2', getIdToken: async () => 'token-2' }
      return 'token-1'
    }
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(createTemplate('user-1', { name: 'Plan', days: template().days }))
      .rejects.toThrow('The user account has changed.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('surfaces a server rejection instead of returning a saved template', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Invalid template sets.' }),
    }))

    await expect(createTemplate('user-1', { name: 'Plan', days: template().days }))
      .rejects.toThrow('Invalid template sets.')
  })
})
