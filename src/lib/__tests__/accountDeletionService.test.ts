import { beforeEach, describe, expect, it, vi } from 'vitest'

const authMock = vi.hoisted(() => ({ reauthenticateWithCredential: vi.fn(), reload: vi.fn(), signOut: vi.fn() }))
const api = vi.hoisted(() => ({ callAuthedApi: vi.fn() }))
const user = vi.hoisted(() => ({ uid: 'me', email: 'me@shear.local', getIdToken: vi.fn() }))

vi.mock('../firebase', () => ({ auth: { currentUser: user }, db: {} }))
vi.mock('../authedApi', () => api)
vi.mock('firebase/auth', () => ({ ...authMock, EmailAuthProvider: { credential: vi.fn() } }))
vi.mock('firebase/firestore', () => ({ terminate: vi.fn(async () => undefined), clearIndexedDbPersistence: vi.fn(async () => undefined) }))

import { clearLocalAccountData, deleteAccount } from '../accountDeletionService'

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

const failure = (code: string) => Object.assign(new Error(code), { code })

describe('clearLocalAccountData', () => {
  it("removes this account's keys and the shared ones, and keeps another account's recovery keys", () => {
    const local = memory({
      'ironlog-active-session-backup:me': '1', 'ironlog:workout-closure:me': '1', 'ironlog:workout-delete-recovery:me': '1',
      'ironlog.openrouterApiKey:me': 'k', 'ironlog.openrouterModel': 'm', 'ironlog:landing-plan': 'p', 'ironlog:train-cover-played': '1',
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

describe('deleteAccount', () => {
  let local: Storage
  const replace = vi.fn()
  beforeEach(() => {
    vi.clearAllMocks()
    local = memory({ 'ironlog:workout-closure:me': '1' })
    vi.stubGlobal('window', { localStorage: local, sessionStorage: memory({}), location: { replace } })
    authMock.reauthenticateWithCredential.mockResolvedValue(undefined)
    authMock.reload.mockResolvedValue(undefined)
    authMock.signOut.mockResolvedValue(undefined)
    user.getIdToken.mockResolvedValue('token')
    api.callAuthedApi.mockResolvedValue({ ok: true })
  })

  it('treats a lost response as done once the account is gone, and still clears this browser', async () => {
    api.callAuthedApi.mockRejectedValue(new Error('The server did not answer in time. Try again.'))
    authMock.reload.mockRejectedValue(failure('auth/user-token-expired'))
    await deleteAccount('secret')
    expect(api.callAuthedApi).toHaveBeenCalledWith('/api/delete-account', { deleteAccount: true }, 'me', 65_000)
    expect(local.getItem('ironlog:workout-closure:me')).toBeNull()
    expect(replace).toHaveBeenCalledWith('/login?deleted=1')
  })

  it('finishes the cleanup when a retry after a lost response finds the user deleted', async () => {
    authMock.reauthenticateWithCredential.mockRejectedValue(failure('auth/user-mismatch'))
    authMock.reload.mockRejectedValue(failure('auth/user-not-found'))
    await deleteAccount('secret')
    expect(api.callAuthedApi).not.toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith('/login?deleted=1')
  })

  it('keeps everything when the password is wrong or the server fails while the account still exists', async () => {
    authMock.reauthenticateWithCredential.mockRejectedValueOnce(failure('auth/invalid-credential'))
    await expect(deleteAccount('wrong')).rejects.toMatchObject({ code: 'auth/invalid-credential' })
    expect(api.callAuthedApi).not.toHaveBeenCalled()

    api.callAuthedApi.mockRejectedValueOnce(new Error('Could not delete your account. Try again.'))
    await expect(deleteAccount('secret')).rejects.toThrow('Could not delete your account. Try again.')

    authMock.reload.mockRejectedValue(failure('auth/network-request-failed'))
    api.callAuthedApi.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(deleteAccount('secret')).rejects.toThrow('Failed to fetch')

    expect(local.getItem('ironlog:workout-closure:me')).toBe('1')
    expect(replace).not.toHaveBeenCalled()
  })
})
