import {
  collection, addDoc, query, where, orderBy, limit,
  getDocs, getDoc, doc, deleteDoc, updateDoc,
} from 'firebase/firestore'
import { db } from './firebase'
import type { ActiveWorkout } from '../store/workoutStore'

export async function saveWorkout(uid: string, workout: ActiveWorkout): Promise<string> {
  const payload = {
    userId: uid,
    startedAt: workout.startedAt,
    finishedAt: Date.now(),
    label: workout.label ?? null,
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
  label?: string | null
  exercises: { exerciseId?: string; name: string; sets: { weight: number; reps: number }[] }[]
}

export async function getRecentWorkouts(uid: string, count = 20): Promise<WorkoutSummary[]> {
  const q = query(
    collection(db, 'workouts'),
    where('userId', '==', uid),
    orderBy('startedAt', 'desc'),
    limit(count)
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<WorkoutSummary, 'id'>) }))
}

export async function getWorkout(id: string): Promise<WorkoutSummary | null> {
  const snap = await getDoc(doc(db, 'workouts', id))
  return snap.exists() ? { id: snap.id, ...(snap.data() as Omit<WorkoutSummary, 'id'>) } : null
}

function sanitizeWorkoutExercises(exercises: WorkoutSummary['exercises']): WorkoutSummary['exercises'] {
  return exercises.map((exercise) => ({
    ...(exercise.exerciseId !== undefined && { exerciseId: exercise.exerciseId }),
    name: exercise.name,
    sets: exercise.sets.map((set) => ({
      weight: set.weight ?? 0,
      reps: set.reps ?? 0,
    })),
  }))
}

export async function updateWorkout(
  id: string,
  data: Partial<Pick<WorkoutSummary, 'label' | 'exercises'>>
): Promise<void> {
  const payload: Partial<Pick<WorkoutSummary, 'label' | 'exercises'>> = {}

  if (data.label !== undefined) payload.label = data.label ?? null
  if (data.exercises !== undefined) payload.exercises = sanitizeWorkoutExercises(data.exercises)

  if (Object.keys(payload).length === 0) return

  await updateDoc(doc(db, 'workouts', id), payload)
}

export async function deleteWorkout(id: string): Promise<void> {
  await deleteDoc(doc(db, 'workouts', id))
}

export function countWeeklyWorkouts(workouts: WorkoutSummary[]): number {
  const startOfWeek = new Date()
  startOfWeek.setHours(0, 0, 0, 0)
  startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7))
  return workouts.filter((w) => w.startedAt >= startOfWeek.getTime()).length
}

export function calcStreak(workouts: WorkoutSummary[]): number {
  if (!workouts.length) return 0
  const days = new Set(workouts.map((w) => {
    const d = new Date(w.startedAt)
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  }))
  let streak = 0
  for (let i = 0; i < 365; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    if (days.has(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)) streak++
    else break
  }
  return streak
}

export function calcVolume(workout: WorkoutSummary): number {
  return workout.exercises.reduce(
    (t, ex) => t + ex.sets.reduce((s, set) => s + set.weight * set.reps, 0), 0
  )
}
