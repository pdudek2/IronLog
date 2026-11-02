import type { ReactNode } from 'react'
import type { WorkoutSet } from '../../store/workoutStore'
import type { Units } from '../../lib/userProfile'
import {
  displayWeightDeltaToKg,
  displayWeightStringToKg,
  kgStringToDisplayWeight,
} from '../../lib/weightUnits'

interface WorkoutSetPanelProps {
  exerciseIndex: number
  exerciseName: string
  set: WorkoutSet | null
  setIndex: number
  setCount: number
  units: Units
  rest: ReactNode
  openSetIndex: number
  nextExercise: { index: number; name: string } | null
  finishing: boolean
  onAdjustSet: (exerciseIndex: number, setIndex: number, field: 'weight' | 'reps', delta: number) => void
  onUpdateSet: (exerciseIndex: number, setIndex: number, field: 'weight' | 'reps', value: string) => void
  onToggleSet: (exerciseIndex: number, setIndex: number) => void
  onClearSelection: () => void
  onGoToExercise: (exerciseIndex: number) => void
  onFinish: () => void
}

function Stepper({ label, step, onStep }: { label: string; step: number; onStep: (delta: number) => void }) {
  return (
    <button type="button" className="workout-set-step" onClick={() => onStep(step)} aria-label={`Adjust ${label} by ${step}`}>
      {step > 0 ? `+${step}` : `−${-step}`}
    </button>
  )
}

export default function WorkoutSetPanel({
  exerciseIndex,
  exerciseName,
  set,
  setIndex,
  setCount,
  units,
  rest,
  openSetIndex,
  nextExercise,
  finishing,
  onAdjustSet,
  onUpdateSet,
  onToggleSet,
  onClearSelection,
  onGoToExercise,
  onFinish,
}: WorkoutSetPanelProps) {
  const setNumber = setIndex + 1

  return (
    <section className="workout-set-panel" aria-label="Current set">
      {rest ?? (
        <div className="workout-set-panel-status">
          <strong>{set ? `Set ${setNumber} of ${setCount}` : 'All sets done'}</strong>
        </div>
      )}

      {set ? (
        <>
          <div className="workout-set-panel-nums">
            <div className="workout-set-num">
              <Stepper label="weight" step={-2.5} onStep={(delta) => onAdjustSet(exerciseIndex, setIndex, 'weight', displayWeightDeltaToKg(delta, units))} />
              <label>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="0"
                  value={kgStringToDisplayWeight(set.weight, units)}
                  onChange={(event) => onUpdateSet(exerciseIndex, setIndex, 'weight', displayWeightStringToKg(event.target.value, units))}
                  onFocus={(event) => event.currentTarget.select()}
                  aria-label={`Weight, ${exerciseName}, set ${setNumber}, ${units}`}
                />
                <small>{units}</small>
              </label>
              <Stepper label="weight" step={2.5} onStep={(delta) => onAdjustSet(exerciseIndex, setIndex, 'weight', displayWeightDeltaToKg(delta, units))} />
            </div>
            <i aria-hidden="true" />
            <div className="workout-set-num">
              <Stepper label="reps" step={-1} onStep={(delta) => onAdjustSet(exerciseIndex, setIndex, 'reps', delta)} />
              <label>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="0"
                  value={set.reps}
                  onChange={(event) => onUpdateSet(exerciseIndex, setIndex, 'reps', event.target.value)}
                  onFocus={(event) => event.currentTarget.select()}
                  aria-label={`Reps, ${exerciseName}, set ${setNumber}`}
                />
                <small>reps</small>
              </label>
              <Stepper label="reps" step={1} onStep={(delta) => onAdjustSet(exerciseIndex, setIndex, 'reps', delta)} />
            </div>
          </div>
          {set.done ? (
            <button type="button" className="workout-set-panel-action" onClick={onClearSelection}>
              {openSetIndex >= 0 ? `Back to set ${openSetIndex + 1}` : 'Done'}
            </button>
          ) : (
            <button
              type="button"
              className="workout-set-panel-action"
              onClick={() => onToggleSet(exerciseIndex, setIndex)}
              aria-label={`Log set ${setNumber} for ${exerciseName}`}
            >
              Log set
            </button>
          )}
        </>
      ) : nextExercise ? (
        <button type="button" className="workout-set-panel-action" onClick={() => onGoToExercise(nextExercise.index)}>
          Go to {nextExercise.name}
        </button>
      ) : (
        <button type="button" className="workout-set-panel-action" onClick={onFinish} disabled={finishing}>
          {finishing ? 'Finishing…' : 'Finish workout'}
        </button>
      )}
    </section>
  )
}
