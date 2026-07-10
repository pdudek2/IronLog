import type { ActiveWorkout } from '../store/workoutStore'
import { saveActiveSession } from './activeSessionService'
import { getExerciseSessions } from './exerciseDetailService'
import {
  buildActiveWorkoutFromTemplate,
  templateExerciseKey,
  type TemplateExerciseHistoryMap,
  type WorkoutTemplate,
} from './templateService'

async function loadTemplateExerciseHistory(
  uid: string,
  template: WorkoutTemplate,
  dayIndex: number,
): Promise<TemplateExerciseHistoryMap> {
  const day = template.days[dayIndex] ?? template.days[0]
  const exercises = day?.exercises ?? []
  const uniqueExercises = Array.from(
    new Map(exercises.map((exercise) => [
      templateExerciseKey(exercise.exerciseId, exercise.exerciseSource),
      exercise,
    ])).values(),
  )

  const entries = await Promise.all(uniqueExercises.map(async (exercise) => {
    try {
      const [last] = await getExerciseSessions(
        uid,
        exercise.exerciseId,
        exercise.exerciseSource,
        1,
      )
      if (!last || last.bestSetWeight <= 0) return null
      return [
        templateExerciseKey(exercise.exerciseId, exercise.exerciseSource),
        { bestSetWeight: last.bestSetWeight, bestSetReps: last.bestSetReps },
      ] as const
    } catch {
      return null
    }
  }))

  return new Map(entries.filter((entry): entry is NonNullable<typeof entry> => entry !== null))
}

export async function createPersistedTemplateWorkout(
  uid: string,
  template: WorkoutTemplate,
  dayIndex = 0,
): Promise<ActiveWorkout> {
  const history = await loadTemplateExerciseHistory(uid, template, dayIndex)
  const workout = buildActiveWorkoutFromTemplate(template, dayIndex, history)
  await saveActiveSession(uid, workout)
  return workout
}
