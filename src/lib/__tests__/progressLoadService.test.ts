import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getRecentWorkouts,
  retryPendingMaterializations,
  getProgressSessions,
  getRecords,
} = vi.hoisted(() => ({
  getRecentWorkouts: vi.fn(),
  retryPendingMaterializations: vi.fn(),
  getProgressSessions: vi.fn(),
  getRecords: vi.fn(),
}))

vi.mock('../workoutService', () => ({
  getRecentWorkouts,
  retryPendingMaterializations,
}))

vi.mock('../progressService', () => ({
  getProgressSessions,
  getRecords,
}))

const NOW = new Date('2026-07-10T12:00:00Z').getTime()
const SESSION_WINDOW_MS = 180 * 86_400_000
const sessions = { sessions: [], truncated: false }
const records = { records: [], truncated: false }

async function loadProgressData(uid = 'user-1', now = NOW) {
  const service = await import('../progressLoadService')
  return service.loadProgressData(uid, now)
}

beforeEach(() => {
  vi.resetAllMocks()
  getRecentWorkouts.mockResolvedValue([])
  retryPendingMaterializations.mockResolvedValue({ attempted: 0, failed: 0 })
  getProgressSessions.mockResolvedValue(sessions)
  getRecords.mockResolvedValue(records)
})

describe('loadProgressData', () => {
  it('loads a fixed 180-day session window', async () => {
    const result = await loadProgressData()

    expect(getRecentWorkouts).toHaveBeenCalledWith('user-1', 50)
    expect(getProgressSessions).toHaveBeenCalledWith('user-1', NOW - SESSION_WINDOW_MS)
    expect(result).toMatchObject({
      sessions: { status: 'success', value: sessions },
      records: { status: 'success', value: records },
      freshness: 'fresh',
      fetchedAt: NOW,
    })
  })

  it('reports freshness warning when recent-workout lookup fails and still loads projections', async () => {
    getRecentWorkouts.mockRejectedValue(new Error('recent workouts unavailable'))

    const result = await loadProgressData()

    expect(result).toMatchObject({
      freshness: 'uncertain',
      sessions: { status: 'success', value: sessions },
      records: { status: 'success', value: records },
    })
    expect(retryPendingMaterializations).not.toHaveBeenCalled()
  })

  it('reports freshness warning when any pending materialization retry fails', async () => {
    retryPendingMaterializations.mockResolvedValue({ attempted: 2, failed: 1 })

    const result = await loadProgressData()

    expect(result.freshness).toBe('uncertain')
  })

  it('returns sessions when records fail', async () => {
    const error = new Error('records unavailable')
    getRecords.mockRejectedValue(error)

    const result = await loadProgressData()

    expect(result.sessions).toEqual({ status: 'success', value: sessions })
    expect(result.records).toEqual({ status: 'error', error })
  })

  it('returns records when sessions fail', async () => {
    const error = new Error('sessions unavailable')
    getProgressSessions.mockRejectedValue(error)

    const result = await loadProgressData()

    expect(result.sessions).toEqual({ status: 'error', error })
    expect(result.records).toEqual({ status: 'success', value: records })
  })

  it('returns independent errors when both projections fail', async () => {
    const sessionsError = new Error('sessions unavailable')
    const recordsError = new Error('records unavailable')
    getProgressSessions.mockRejectedValue(sessionsError)
    getRecords.mockRejectedValue(recordsError)

    const result = await loadProgressData()

    expect(result.sessions).toEqual({ status: 'error', error: sessionsError })
    expect(result.records).toEqual({ status: 'error', error: recordsError })
  })
})
