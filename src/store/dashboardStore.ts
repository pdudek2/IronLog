import { create } from 'zustand'
import type { WorkoutSummary } from '../lib/workoutService'

interface DashboardSnapshot {
  workouts: WorkoutSummary[]
  weeklyDone: number
  streak: number
}

interface DashboardState extends DashboardSnapshot {
  ready: boolean
  setSnapshot: (snapshot: DashboardSnapshot) => void
  clearSnapshot: () => void
}

export const useDashboardStore = create<DashboardState>((set) => ({
  workouts: [],
  weeklyDone: 0,
  streak: 0,
  ready: false,
  setSnapshot: (snapshot) => set({ ...snapshot, ready: true }),
  clearSnapshot: () => set({
    workouts: [],
    weeklyDone: 0,
    streak: 0,
    ready: false,
  }),
}))
