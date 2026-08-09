import { create } from 'zustand'
import { getProfile, type UserProfile } from '../lib/userProfile'

export type ProfileStatus = 'loading' | 'ready' | 'missing' | 'error'

interface ProfileState {
  profileUid: string | null
  profile: UserProfile | null
  status: ProfileStatus
  loadProfile: (uid: string) => Promise<void>
  setProfile: (uid: string, profile: UserProfile) => void
  resetProfile: () => void
}

let profileRequestVersion = 0

export const useProfileStore = create<ProfileState>((set, get) => ({
  profileUid: null,
  profile: null,
  status: 'loading',
  loadProfile: async (uid) => {
    const requestVersion = ++profileRequestVersion
    set({ profileUid: uid, profile: null, status: 'loading' })

    try {
      const profile = await getProfile(uid)
      if (requestVersion !== profileRequestVersion || get().profileUid !== uid) return
      set({ profile, status: profile ? 'ready' : 'missing' })
    } catch {
      if (requestVersion !== profileRequestVersion || get().profileUid !== uid) return
      set({ profile: null, status: 'error' })
    }
  },
  setProfile: (uid, profile) => {
    profileRequestVersion += 1
    set({ profileUid: uid, profile, status: 'ready' })
  },
  resetProfile: () => {
    profileRequestVersion += 1
    set({ profileUid: null, profile: null, status: 'loading' })
  },
}))
