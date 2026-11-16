import { describe, expect, it, vi } from 'vitest'

vi.mock('../firebase', () => ({ auth: {}, db: {} }))
import { clearLocalAccountData } from '../accountDeletionService'

function memory(entries: Record<string, string>): Storage {
  const map = new Map(Object.entries(entries))
  return {
    get length() { return map.size },
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value) },
    removeItem: (key: string) => { map.delete(key) },
    clear: () => map.clear(),
  }
}

describe('clearLocalAccountData', () => {
  it("removes this account's keys and the shared ones, and keeps another account's recovery keys", () => {
    const local = memory({
      'ironlog-active-session-backup:me': '1', 'ironlog:workout-closure:me': '1', 'ironlog:workout-delete-recovery:me': '1',
      'ironlog.openrouterApiKey:me': 'k', 'ironlog.openrouterModel': 'm', 'ironlog:landing-plan': 'p',
      'ironlog-active-session-backup:other': '1', 'ironlog:workout-closure:other': '1', 'ironlog.openrouterApiKey:other': 'k',
    })
    const session = memory({ 'ironlog:template-draft': 'd' })
    clearLocalAccountData('me', local, session)
    expect(Array.from({ length: local.length }, (_, i) => local.key(i)).sort()).toEqual([
      'ironlog-active-session-backup:other', 'ironlog.openrouterApiKey:other', 'ironlog:workout-closure:other',
    ])
    expect(session.length).toBe(0)
  })
})
