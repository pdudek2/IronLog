import { useEffect, useState, type MouseEvent, type PointerEvent } from 'react'
import type { WorkoutExercise } from '../../store/workoutStore'
import { getExerciseSessions, type ExerciseSession } from '../../lib/exerciseDetailService'

export const MEMBER_LETTERS = 'ABCDEF'

type ExerciseRef = Pick<WorkoutExercise, 'exerciseId' | 'exerciseSource'>

// A tap on a field that already has focus fires no focus event (Android Chrome keeps focus after Back hides the
// keyboard), so the caret would land inside the number; selecting it again makes typing replace it.
let retapped: EventTarget | null = null
export const selectOnRetap = {
  onPointerDown: (event: PointerEvent<HTMLInputElement>) => { retapped = document.activeElement === event.currentTarget ? event.currentTarget : null },
  onClick: (event: MouseEvent<HTMLInputElement>) => { if (retapped === event.currentTarget) event.currentTarget.select(); retapped = null },
}

// Last session's sets for each exercise, in order; empty while they load or when there are none.
export function usePreviousSets(userId: string | undefined, exercises: ExerciseRef[]): ExerciseSession['sets'][] {
  const key = exercises.map((exercise) => `${exercise.exerciseSource}:${exercise.exerciseId}`).join('|')
  const [loaded, setLoaded] = useState<{ key: string; sets: ExerciseSession['sets'][] } | null>(null)

  useEffect(() => {
    if (!userId || !key) return
    let current = true
    const refs = key.split('|').map((entry) => {
      const at = entry.indexOf(':')
      return { exerciseSource: entry.slice(0, at) as ExerciseRef['exerciseSource'], exerciseId: entry.slice(at + 1) }
    })
    void Promise.all(refs.map((ref) => getExerciseSessions(userId, ref.exerciseId, ref.exerciseSource, 1)
      .then(([session]) => session?.sets ?? [], () => [])))
      .then((sets) => { if (current) setLoaded({ key, sets }) })
    return () => { current = false }
  }, [key, userId])

  return loaded?.key === key ? loaded.sets : exercises.map(() => [])
}
