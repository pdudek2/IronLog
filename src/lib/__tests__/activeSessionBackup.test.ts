import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readActiveSessionBackup, writeActiveSessionBackup } from '../activeSessionBackup'

const uid = 'user-1'
const storageKey = `ironlog-active-session-backup:${uid}`

beforeEach(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  })
  vi.spyOn(Date, 'now').mockReturnValue(1_000)
})

describe('active session backup identity', () => {
  it('preserves the session id when writing and reading a backup', () => {
    writeActiveSessionBackup(uid, {
      sessionId: 'session-1',
      startedAt: 500,
      exercises: [],
    })

    expect(readActiveSessionBackup(uid)?.sessionId).toBe('session-1')
  })

  it('derives a deterministic session id for an old local backup', () => {
    window.localStorage.setItem(storageKey, JSON.stringify({
      uid,
      savedAt: 900,
      session: { startedAt: 500, exercises: [] },
    }))

    expect(readActiveSessionBackup(uid)).toEqual({
      sessionId: 'legacy-500',
      startedAt: 500,
      exercises: [],
    })
  })
})
