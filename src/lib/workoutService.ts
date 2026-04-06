import { collection, addDoc, query, where, orderBy, limit, getDocs } from 'firebase/firestore'
import { db } from './firebase'
import type { ActiveWorkout } from '../store/workoutStore'

export async function saveWorkout(uid: string, workout: ActiveWorkout): Promise<string> {
  const payload = {
    userId: uid,
    startedAt: workout.startedAt,
    finishedAt: Date.now(),
    exercises: workout.exercises.map((ex) => ({
      exerciseId: ex.exerciseId,
      name: ex.name,
      sets: ex.sets
        .filter((s) => s.done && s.reps !== '')
        .map((s) => ({
          weight: parseFloat(s.weight) || 0,
          reps: parseInt(s.reps) || 0,
        })),
    })).filter((ex) => ex.sets.length > 0),
  }
  const ref = await addDoc(collection(db, 'workouts'), payload)
  return ref.id
}

export interface WorkoutSummary {
  id: string
  startedAt: number
  finishedAt: number
  exercises: { name: string; sets: { weight: number; reps: number }[] }[]
}

export async function getRecentWorkouts(uid: string, count = 5): Promise<WorkoutSummary[]> {
  const q = query(
    collection(db, 'workouts'),
    where('userId', '==', uid),
    orderBy('startedAt', 'desc'),
    limit(count)
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<WorkoutSummary, 'id'>) }))
}

export function countWeeklyWorkouts(workouts: WorkoutSummary[]): number {
  const startOfWeek = new Date()
  startOfWeek.setHours(0, 0, 0, 0)
  startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7)) // poniedziałek
  return workouts.filter((w) => w.startedAt >= startOfWeek.getTime()).length
}
