import { create } from 'zustand'
import type { UserProfile } from '../lib/userProfile'

interface ProfileState {
  profile: UserProfile | null
  loading: boolean
  setProfile: (profile: UserProfile | null) => void
  setLoading: (loading: boolean) => void
}

export const useProfileStore = create<ProfileState>((set) => ({
  profile: null,
  loading: true,
  setProfile: (profile) => set({ profile, loading: false }),
  setLoading: (loading) => set({ loading }),
}))
