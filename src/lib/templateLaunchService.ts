import type { ActiveWorkout } from '../store/workoutStore'
import { writeActiveSessionBackup } from './activeSessionBackup'
import { loadActiveSessionFromServer, persistTemplateLaunchSession } from './activeSessionService'
import { discardWorkoutSession } from './workoutClosureService'
import { getExerciseSessions } from './exerciseDetailService'
import {
  buildActiveWorkoutFromTemplate,
  templateExerciseKey,
  type TemplateExerciseHistoryMap,
  type TemplateExerciseOverrideMap,
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
  dayIndex: number,
  replaceExisting: boolean,
  overrides?: TemplateExerciseOverrideMap,
): Promise<ActiveWorkout> {
  const history = await loadTemplateExerciseHistory(uid, template, dayIndex)
  const workout = buildActiveWorkoutFromTemplate(template, dayIndex, history, overrides)
  if (replaceExisting) {
    // The replaced session is closed through the server first, so its tombstone stops a late write from another
    // device from reviving it.
    const current = await loadActiveSessionFromServer(uid)
    if (current.session) await discardWorkoutSession(current.session.sessionId)
  }
  const sessionRevision = await persistTemplateLaunchSession(uid, workout, replaceExisting)
  // The workout screen trusts a cached copy only with a known base revision; without it the first edit conflicts.
  writeActiveSessionBackup(uid, workout, { baseRevision: sessionRevision, unsynced: false })
  return workout
}
