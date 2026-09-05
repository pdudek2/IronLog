import { create } from 'zustand'
import { useAuthStore } from './authStore'
import type { WorkoutSummary } from '../lib/workoutService'

interface DashboardSnapshot {
  workouts: WorkoutSummary[]
  weeklyDone: number
  streak: number
}

interface DashboardState extends DashboardSnapshot {
  uid: string | null
  ready: boolean
  setSnapshot: (uid: string, snapshot: DashboardSnapshot) => boolean
  clearSnapshot: () => void
}

export const useDashboardStore = create<DashboardState>((set) => ({
  workouts: [],
  weeklyDone: 0,
  streak: 0,
  uid: null,
  ready: false,
  setSnapshot: (uid, snapshot) => {
    if (useAuthStore.getState().user?.uid !== uid) return false
    set({ ...snapshot, uid, ready: true })
    return true
  },
  clearSnapshot: () => set({
    uid: null,
    workouts: [],
    weeklyDone: 0,
    streak: 0,
    ready: false,
  }),
}))
