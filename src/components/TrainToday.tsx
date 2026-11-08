import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { NextSessionRecommendation } from '../shared/nextSessionRecommendation'
import { templateExerciseKey, type TemplateExercise, type TemplateExerciseHistoryMap, type WorkoutTemplate } from '../lib/templateService'
import { loadTemplateExerciseHistory } from '../lib/templateLaunchService'
import { templateStartWeight } from '../shared/workoutDisplay'
import { kgStringToDisplayWeight } from '../lib/weightUnits'
import type { Units } from '../lib/userProfile'

const TIME_BUDGETS = [45, 30, 20] as const

const minutes = (sec: number) => Math.round(sec / 60)

// The dock's time row and today's line: what Start launches, before it is pressed.
export function TrainTime({ today, plannedSets, budgetMin, straight, onBudget, onStraight }: {
  today: NextSessionRecommendation
  plannedSets: number
  budgetMin: number | null
  straight: boolean
  onBudget: (budgetMin: number | null) => void
  onStraight: (straight: boolean) => void
}) {
  const approx = today.calibration.source === 'none' ? '~' : ''
  const { compression } = today
  const usual = minutes(compression.fullEstimateSec)
  const shorter = TIME_BUDGETS.filter((budget) => budget < usual)
  const kept = compression.sets.reduce((sum, sets) => sum + sets, 0)
  const grouped = compression.blocks.some((block) => block.group && block.items.filter((item) => item.sets > 0).length > 1)

  return (
    <div className="train-dock-today">
      {(shorter.length > 0 || budgetMin !== null) && (
        <div className="train-dock-time" role="radiogroup" aria-label="Time today">
          <button type="button" role="radio" aria-checked={budgetMin === null} onClick={() => onBudget(null)}>
            Usual <span>{approx}{usual} min</span>
          </button>
          {shorter.map((budget) => (
            <button key={budget} type="button" role="radio" aria-checked={budgetMin === budget} onClick={() => onBudget(budget)}>
              {budget} min
            </button>
          ))}
        </div>
      )}
      {budgetMin !== null && !compression.fits ? (
        <p className="train-dock-line" role="status">
          <strong>Doesn’t fit in {budgetMin} min.</strong> The shortest version takes {approx}{minutes(compression.estimateSec)} min.
        </p>
      ) : today.record && (
        <p className="train-dock-line">
          <strong>{approx}{minutes(compression.estimateSec)} min</strong>{' · '}{kept} of {plannedSets} sets{' · '}Same weights
        </p>
      )}
      {budgetMin !== null && compression.fits && (grouped || straight) && (
        <label className="train-time-switch">
          <span>Without supersets</span>
          <input type="checkbox" role="switch" checked={straight} onChange={(event) => onStraight(event.target.checked)} />
        </label>
      )}
    </div>
  )
}

// Today's compressed day in session order: pairs and circuits as one block, dropped exercises at the end.
export function TodayExercises({ uid, template, dayIndex, checkedIn, today, exercises, units, onOpen }: {
  uid: string
  template: WorkoutTemplate
  dayIndex: number
  // After a check-in the start takes the progression's weights; otherwise the usual day's.
  checkedIn: boolean
  today: NextSessionRecommendation
  exercises: TemplateExercise[]
  units: Units
  onOpen: (exercise: TemplateExercise) => void
}) {
  const [best, setBest] = useState<TemplateExerciseHistoryMap | null>(null)
  useEffect(() => {
    if (checkedIn) return
    let current = true
    void loadTemplateExerciseHistory(uid, template, dayIndex).then((history) => {
      if (current) setBest(history)
    })
    return () => { current = false }
  }, [uid, template, dayIndex, checkedIn])

  const row = (index: number, sets: number) => {
    const exercise = exercises[index]!
    const planned = checkedIn
      ? today.exercises[index]!
      : { reps: exercise.targetReps, weight: best ? templateStartWeight(exercise, best.get(templateExerciseKey(exercise.exerciseId, exercise.exerciseSource))) : 0 }
    return (
      <button key={`${exercise.exerciseSource}:${exercise.exerciseId}:${index}`} type="button" className="train-exercise" onClick={() => onOpen(exercise)}>
        <span>{exercise.name}</span>
        <span>
          {sets} × {planned.reps}
          {planned.weight > 0 && <>{' · '}<b>{kgStringToDisplayWeight(String(planned.weight), units)} {units}</b></>}
        </span>
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    )
  }
  const skipped = exercises.flatMap((exercise, index) => (today.compression.sets[index] === 0 ? [{ exercise, index }] : []))

  return (
    <div className="train-exercises">
      {today.compression.blocks.map((block) => {
        const live = block.items.filter((item) => item.sets > 0)
        if (!live.length) return null
        if (live.length === 1) return row(live[0]!.index, live[0]!.sets)
        const rounds = Math.max(...live.map((item) => item.sets))
        return (
          <div key={block.group ?? live[0]!.index} className="train-group" role="group" aria-label={`${live.length === 2 ? 'Superset' : 'Circuit'}, ${rounds} ${rounds === 1 ? 'round' : 'rounds'}`}>
            <p aria-hidden="true">{live.length === 2 ? 'Superset' : 'Circuit'} · {rounds} {rounds === 1 ? 'round' : 'rounds'}</p>
            {live.map((item) => row(item.index, item.sets))}
          </div>
        )
      })}
      {skipped.map(({ exercise, index }) => (
        <button key={`skipped:${exercise.exerciseSource}:${exercise.exerciseId}:${index}`} type="button" className="train-exercise train-exercise--skipped" onClick={() => onOpen(exercise)}>
          <span>{exercise.name}</span>
          <span>Skipped today</span>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}
