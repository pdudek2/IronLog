import { useEffect, useState } from 'react'
import { getExerciseSessions, type ExerciseSession } from '../lib/exerciseDetailService'
import { kgStringToDisplayWeight, type WeightUnits } from '../shared/weightUnits'
import { mainExercise, stepsNote, workoutSteps } from '../shared/workoutMoments'
import type { WorkoutSummary } from '../lib/workoutService'

const SESSION_LIMIT = 40

export function WorkoutSteps({ uid, workout, units }: { uid: string, workout: WorkoutSummary, units: WeightUnits }) {
  const exercise = mainExercise(workout)
  const exerciseId = exercise?.exerciseId
  const source = exercise?.exerciseSource ?? 'global'
  const key = `${uid}:${source}:${exerciseId}`
  const [loaded, setLoaded] = useState<{ key: string, sessions: ExerciseSession[] } | null>(null)

  useEffect(() => {
    if (!exerciseId) return
    let current = true
    void getExerciseSessions(uid, exerciseId, source, SESSION_LIMIT)
      // The steps only add to the result, so a failed read leaves the rest of the screen as it is.
      .catch((): ExerciseSession[] => [])
      .then((sessions) => { if (current) setLoaded({ key, sessions }) })
    return () => { current = false }
  }, [exerciseId, key, source, uid])

  if (!exerciseId) return null
  if (loaded?.key !== key) return <div className="workout-steps" aria-hidden="true" />

  const steps = workoutSteps(workout, loaded.sessions)
  if (!steps) return null

  const formatWeight = (kg: number) => `${kgStringToDisplayWeight(String(kg), units)} ${units}`
  return (
    <section className="workout-steps" aria-label={`${steps.exerciseName} progress`}>
      <div className="workout-steps-head">
        <span>{steps.exerciseName}</span>
        <span>{formatWeight(steps.top.weight)} × {steps.top.reps}</span>
      </div>
      <div
        className="workout-steps-bars"
        role="img"
        aria-label={`Top weight in the last ${steps.bars.length} sessions: ${steps.bars.map((bar) => formatWeight(bar.weight)).join(', ')}`}
      >
        {steps.bars.map((bar) => (
          <i
            key={bar.key}
            style={{ height: `${bar.height * 100}%` }}
            data-current={bar.current || undefined}
            data-record={(bar.current && steps.best) || undefined}
          />
        ))}
      </div>
      <p className="workout-steps-note">{stepsNote(steps, formatWeight)}</p>
    </section>
  )
}
