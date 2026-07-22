import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AI_CONTEXT_DOCUMENT_READ_BUDGET,
  AI_CONTEXT_READ_LIMITS,
  loadAiUserContext,
  type AiContextReaders,
} from '../aiContextLoader'

const emptyReaders = (): AiContextReaders => ({
  profile: vi.fn().mockResolvedValue(null),
  readiness: vi.fn().mockResolvedValue([]),
  workouts: vi.fn().mockResolvedValue([]),
  records: vi.fn().mockResolvedValue([]),
})

describe('loadAiUserContext', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('keeps the accepted document-read budget at or below 70', () => {
    expect(AI_CONTEXT_READ_LIMITS).toEqual({ profile: 1, readiness: 31, workouts: 31, records: 6 })
    expect(AI_CONTEXT_DOCUMENT_READ_BUDGET).toBe(69)
    expect(AI_CONTEXT_DOCUMENT_READ_BUDGET).toBeLessThanOrEqual(70)
  })

  it('keeps fulfilled empty sources available', async () => {
    const context = await loadAiUserContext('user-1', emptyReaders())

    expect(context.sources).toEqual({
      profile: 'available',
      readiness: 'available',
      workouts: 'available',
      records: 'available',
    })
  })

  it.each(['profile', 'readiness', 'workouts', 'records'] as const)(
    'keeps the other fulfilled sources when %s fails',
    async (source) => {
      const readers = emptyReaders()
      vi.mocked(readers[source]).mockRejectedValueOnce(new Error('private source error'))
      vi.spyOn(console, 'error').mockImplementation(() => undefined)

      const context = await loadAiUserContext('user-secret', readers)

      expect(context.sources[source]).toBe('unavailable')
      for (const otherSource of ['profile', 'readiness', 'workouts', 'records'] as const) {
        if (otherSource !== source) expect(context.sources[otherSource]).toBe('available')
      }
      expect(console.error).toHaveBeenCalledWith('[ai-chat context source unavailable]', {
        source,
        errorName: 'Error',
      })
      expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('user-secret')
      expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('private source error')
    },
  )

  it('preserves the remaining sources when several readers fail', async () => {
    const readers = emptyReaders()
    vi.mocked(readers.profile).mockRejectedValueOnce(new Error('private'))
    vi.mocked(readers.records).mockRejectedValueOnce(new Error('private'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const context = await loadAiUserContext('user-1', readers)

    expect(context.sources).toEqual({
      profile: 'unavailable',
      readiness: 'available',
      workouts: 'available',
      records: 'unavailable',
    })
  })

  it('throws a retryable 503 before model work when every source fails', async () => {
    const failure = () => Promise.reject(new Error('private'))
    const readers: AiContextReaders = {
      profile: failure,
      readiness: failure,
      workouts: failure,
      records: failure,
    }
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(loadAiUserContext('user-1', readers)).rejects.toMatchObject({
      name: 'ApiError',
      status: 503,
      code: 'ai_context_unavailable',
      message: 'Nie udało się załadować kontekstu. Spróbuj ponownie.',
    })
  })
})
