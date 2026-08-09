import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserProfile } from '../lib/userProfile'
import { useProfileStore } from './profileStore'

const mocks = vi.hoisted(() => ({ getProfile: vi.fn() }))

vi.mock('../lib/userProfile', () => ({ getProfile: mocks.getProfile }))

const lbsProfile: UserProfile = {
  displayName: 'Patryk',
  weeklyGoal: 3,
  primaryGoal: 'strength',
  units: 'lbs',
  createdAt: 1,
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve })
  return { promise, resolve }
}

describe('profileStore readiness', () => {
  beforeEach(() => {
    mocks.getProfile.mockReset()
    useProfileStore.setState({
      profileUid: null,
      profile: null,
      status: 'loading',
    })
  })

  it('loads the authenticated account profile with its preferred units', async () => {
    mocks.getProfile.mockResolvedValue(lbsProfile)

    await useProfileStore.getState().loadProfile('user-1')

    expect(useProfileStore.getState()).toMatchObject({
      profileUid: 'user-1',
      profile: lbsProfile,
      status: 'ready',
    })
  })

  it('keeps a failed profile read distinct from a missing profile', async () => {
    mocks.getProfile.mockRejectedValue(new Error('offline'))

    await useProfileStore.getState().loadProfile('user-1')

    expect(useProfileStore.getState()).toMatchObject({
      profileUid: 'user-1',
      profile: null,
      status: 'error',
    })
  })

  it('ignores a stale response after the authenticated account changes', async () => {
    const oldRequest = deferred<UserProfile | null>()
    mocks.getProfile
      .mockReturnValueOnce(oldRequest.promise)
      .mockResolvedValueOnce({ ...lbsProfile, displayName: 'New account' })

    const firstLoad = useProfileStore.getState().loadProfile('user-1')
    await useProfileStore.getState().loadProfile('user-2')
    oldRequest.resolve(lbsProfile)
    await firstLoad

    expect(useProfileStore.getState()).toMatchObject({
      profileUid: 'user-2',
      profile: { displayName: 'New account' },
      status: 'ready',
    })
  })
})
