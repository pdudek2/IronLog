import { create } from 'zustand'
import { useAuthStore } from './authStore'
import type { WorkoutSummary } from '../lib/workoutService'
import type { WorkoutTemplate } from '../lib/templateService'

interface DashboardSnapshot {
  workouts: WorkoutSummary[]
  weeklyDone: number
  streak: number
}

interface DashboardState extends DashboardSnapshot {
  uid: string | null
  ready: boolean
  plans: { uid: string; templates: WorkoutTemplate[] } | null
  setSnapshot: (uid: string, snapshot: DashboardSnapshot) => boolean
  setPlans: (uid: string, templates: WorkoutTemplate[]) => void
  clearSnapshot: () => void
}

export const useDashboardStore = create<DashboardState>((set) => ({
  workouts: [],
  weeklyDone: 0,
  streak: 0,
  uid: null,
  ready: false,
  plans: null,
  setSnapshot: (uid, snapshot) => {
    if (useAuthStore.getState().user?.uid !== uid) return false
    set({ ...snapshot, uid, ready: true })
    return true
  },
  setPlans: (uid, templates) => {
    if (useAuthStore.getState().user?.uid === uid) set({ plans: { uid, templates } })
  },
  clearSnapshot: () => set({
    plans: null,
    uid: null,
    workouts: [],
    weeklyDone: 0,
    streak: 0,
    ready: false,
  }),
}))
