import { ChevronRight } from 'lucide-react'
import type { NextSessionRecommendation } from '../shared/nextSessionRecommendation'
import type { TemplateExercise } from '../lib/templateService'
import { kgStringToDisplayWeight } from '../lib/weightUnits'
import type { Units } from '../lib/userProfile'

const TIME_BUDGETS = [45, 30, 20] as const

const minutes = (sec: number) => Math.round(sec / 60)

export function TrainTime({ today, budgetMin, straight, onBudget, onStraight, onSkip, skipping }: {
  today: NextSessionRecommendation
  budgetMin: number | null
  straight: boolean
  onBudget: (budgetMin: number | null) => void
  onStraight: (straight: boolean) => void
  onSkip: () => void
  skipping: boolean
}) {
  const approx = today.calibration.source === 'none' ? '~' : ''
  const usual = minutes(today.compression.fullEstimateSec)
  const shorter = TIME_BUDGETS.filter((budget) => budget < usual)
  if (!shorter.length && budgetMin === null) return null
  const { compression } = today
  const planned = today.exercises.reduce((sum, exercise) => sum + exercise.sets, 0)
  const kept = compression.sets.reduce((sum, sets) => sum + sets, 0)
  const grouped = compression.blocks.some((block) => block.group && block.items.filter((item) => item.sets > 0).length > 1)

  return (
    <div className="train-time">
      <div className="train-time-options" role="radiogroup" aria-label="Time today">
        <button type="button" role="radio" aria-checked={budgetMin === null} onClick={() => onBudget(null)}>
          Usual <span>{approx}{usual} min</span>
        </button>
        {shorter.map((budget) => (
          <button key={budget} type="button" role="radio" aria-checked={budgetMin === budget} onClick={() => onBudget(budget)}>
            {budget} min
          </button>
        ))}
      </div>
      {budgetMin !== null && (compression.fits ? (
        <div className="train-time-summary">
          <p>
            <strong>{approx}{minutes(compression.estimateSec)} min</strong>
            {' · '}{kept} of {planned} sets{' · '}Same weights
          </p>
          {(grouped || straight) && (
            <label className="train-time-switch">
              <input type="checkbox" role="switch" checked={straight} onChange={(event) => onStraight(event.target.checked)} />
              <span>Without supersets</span>
            </label>
          )}
        </div>
      ) : (
        <div className="train-time-summary" role="status">
          <p>
            <strong>Doesn’t fit in {budgetMin} min.</strong> The shortest version takes {approx}{minutes(compression.estimateSec)} min.
          </p>
          <button type="button" className="train-link" onClick={onSkip} disabled={skipping}>
            {skipping ? 'Skipping…' : 'Skip today'}
          </button>
        </div>
      ))}
    </div>
  )
}

// Today's compressed day in session order: pairs and circuits as one block, dropped exercises at the end.
export function TodayExercises({ today, exercises, units, onOpen }: {
  today: NextSessionRecommendation
  exercises: TemplateExercise[]
  units: Units
  onOpen: (exercise: TemplateExercise) => void
}) {
  const row = (index: number, sets: number) => {
    const exercise = exercises[index]!
    const planned = today.exercises[index]!
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
