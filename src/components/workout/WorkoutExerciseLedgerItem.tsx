import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Check, ChevronDown, Plus, Trash2, X } from 'lucide-react'
import OverloadHint from '../OverloadHint'
import { useWorkoutStore, type WorkoutExercise } from '../../store/workoutStore'
import type { OverloadSuggestion } from '../../lib/overloadService'
import { getExerciseSessions, type ExerciseSession } from '../../lib/exerciseDetailService'
import type { Units } from '../../lib/userProfile'
import {
  displayWeightStringToKg,
  kgStringToDisplayWeight,
} from '../../lib/weightUnits'

import { exerciseMetrics, formatPreviousSet } from '../../shared/workoutDisplay'
import { formatCompactVolume } from '../../shared/weightUnits'

type SetField = 'weight' | 'reps'

interface WorkoutExerciseLedgerItemProps {
  exerciseAccent: string
  exerciseClientId: string
  exerciseIndex: number
  exerciseCount: number
  fallbackExercise: WorkoutExercise | null
  categoryLabel?: string
  equipmentLabel?: string
  focusSetIndex: number
  hintDismissed: boolean
  hintKey: string
  isCollapsible: boolean
  isExpanded: boolean
  isFocusedExercise: boolean
  suggestion: OverloadSuggestion | null
  units: Units
  userId?: string
  onAddSet: (exerciseIndex: number, button: HTMLButtonElement) => void
  onApplySuggestion: (exerciseIndex: number, hintKey: string, weight: number) => void
  onDismissSuggestion: (hintKey: string) => void
  onOpenOverview: () => void
  drawnSetIndex: number | null
  onExpandExercise: (exerciseClientId: string) => void
  onRemoveExercise: (exerciseIndex: number) => void
  onRemoveSet: (exerciseIndex: number, setIndex: number) => void
  onToggleSet: (exerciseIndex: number, setIndex: number) => void
  onUpdateSet: (exerciseIndex: number, setIndex: number, field: SetField, value: string) => void
}

function selectExerciseByIdentity(state: ReturnType<typeof useWorkoutStore.getState>, exerciseIndex: number, exerciseClientId: string): WorkoutExercise | null {
  const indexedExercise = state.active?.exercises[exerciseIndex]
  if (indexedExercise?.clientId === exerciseClientId) return indexedExercise
  return state.active?.exercises.find((exercise) => exercise.clientId === exerciseClientId) ?? null
}

function SetTick({ draw }: { draw: boolean }) {
  const reduced = useReducedMotion()
  if (!draw || reduced) return <Check size={16} />
  return (
    <motion.svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: [0.6, 1.18, 1], opacity: 1 }}
      transition={{ scale: { duration: 0.36, ease: [0.16, 1, 0.3, 1] }, opacity: { duration: 0.12 } }}
    >
      <motion.path
        d="M20 6 9 17l-5-5"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.28, ease: [0.65, 0, 0.35, 1] }}
      />
    </motion.svg>
  )
}

const WorkoutExerciseLedgerItem = React.memo(function WorkoutExerciseLedgerItem({
  exerciseAccent,
  exerciseClientId,
  exerciseIndex,
  exerciseCount,
  fallbackExercise,
  categoryLabel,
  equipmentLabel,
  focusSetIndex,
  hintDismissed,
  onOpenOverview,
  drawnSetIndex,
  hintKey,
  isCollapsible,
  isExpanded,
  isFocusedExercise,
  suggestion,
  units,
  userId,
  onAddSet,
  onApplySuggestion,
  onDismissSuggestion,
  onExpandExercise,
  onRemoveExercise,
  onRemoveSet,
  onToggleSet,
  onUpdateSet,
}: WorkoutExerciseLedgerItemProps) {
  const liveExercise = useWorkoutStore((state) => selectExerciseByIdentity(state, exerciseIndex, exerciseClientId))
  // AnimatePresence keeps exiting children mounted after the selector loses the exercise.
  const exercise = liveExercise ?? fallbackExercise
  const historyExerciseId = exercise?.exerciseId
  const historyExerciseSource = exercise?.exerciseSource
  const [previousSets, setPreviousSets] = React.useState<ExerciseSession['sets']>([])

  React.useEffect(() => {
    let active = true
    setPreviousSets([])
    if (!userId || !isExpanded || !historyExerciseId || !historyExerciseSource) return () => { active = false }

    getExerciseSessions(userId, historyExerciseId, historyExerciseSource, 1)
      .then(([session]) => {
        if (active) setPreviousSets(session?.sets ?? [])
      })
      .catch(() => {
        if (active) setPreviousSets([])
      })

    return () => { active = false }
  }, [historyExerciseId, historyExerciseSource, isExpanded, userId])

  if (!exercise) return null

  const { volumeKg: exerciseVolume, completed: exerciseCompleted } = exerciseMetrics(exercise.sets)
  const exerciseComplete = exercise.sets.length > 0 && exerciseCompleted === exercise.sets.length

  return (
    <motion.div
      className="workout-exercise-card"
      data-expanded={isExpanded}
      style={{ '--exercise-accent': exerciseAccent } as React.CSSProperties}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      {isCollapsible && isExpanded && (
        <button type="button" className="workout-exercise-position" aria-haspopup="dialog" onClick={onOpenOverview}>
          Exercise {exerciseIndex + 1} of {exerciseCount}
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      )}
      <div className="workout-exercise-head mb-4 flex items-start justify-between gap-2">
        {isCollapsible ? (
          <button
            type="button"
            className="workout-exercise-toggle"
            onClick={() => onExpandExercise(exerciseClientId)}
            aria-expanded={isExpanded}
            aria-controls={`workout-exercise-body-${exerciseIndex}`}
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} exercise ${exercise.name}`}
          >
            <span className="min-w-0 text-left">
              {(categoryLabel || equipmentLabel) && (
                <span className="workout-exercise-meta block">
                  {categoryLabel && (
                    <span style={{ color: exerciseAccent }}>
                      {categoryLabel}
                    </span>
                  )}
                  {categoryLabel && equipmentLabel && ' · '}
                  {equipmentLabel}
                </span>
              )}
              <span className="workout-exercise-name mt-1.5 block text-lg font-semibold text-white">{exercise.name}</span>
              <span className="workout-exercise-compact-summary tabular-nums">
                {exerciseCompleted}/{exercise.sets.length} sets · {formatCompactVolume(exerciseVolume, units)}
              </span>
            </span>
            <ChevronDown className="workout-exercise-chevron" size={18} aria-hidden="true" />
          </button>
        ) : (
          <div className="min-w-0">
          {(categoryLabel || equipmentLabel || isFocusedExercise) && (
            <p className="workout-exercise-meta">
              {categoryLabel && (
                <span style={{ color: exerciseAccent }}>
                  {categoryLabel}
                </span>
              )}
              {categoryLabel && equipmentLabel && ' · '}
              {equipmentLabel}
              {isFocusedExercise && <span className="workout-exercise-next">{(categoryLabel || equipmentLabel) && ' · '}Up next</span>}
            </p>
          )}
          <p className="mt-1.5 text-lg font-semibold text-white">{exercise.name}</p>
          </div>
        )}
        <button
          type="button"
          onClick={() => onRemoveExercise(exerciseIndex)}
          className="workout-danger-action"
          style={{ color: 'var(--muted)' }}
          aria-label={`Remove exercise ${exercise.name}`}
        >
          <Trash2 size={14} />
          <span>Delete</span>
        </button>
      </div>

      <div id={`workout-exercise-body-${exerciseIndex}`} className="workout-exercise-body">
      {suggestion && !hintDismissed && !exerciseComplete && (
        <OverloadHint
          suggestion={suggestion}
          units={units}
          onApply={(weight) => onApplySuggestion(exerciseIndex, hintKey, weight)}
          onDismiss={() => onDismissSuggestion(hintKey)}
        />
      )}

      <div className="workout-set-header">
        <span aria-hidden="true" />
        <span>Last</span>
        <span>{units}</span>
        <span>Reps</span>
        <span />
      </div>

      <div className="workout-set-list">
        {exercise.sets.map((set, setIndex) => {
          const showSetControls = !set.done
            && isExpanded
            && setIndex === focusSetIndex
          const previousSet = previousSets[setIndex]

          return (
            <div
              key={set.clientId ?? setIndex}
              className="workout-set-row"
              data-done={set.done || undefined}
              data-current={showSetControls || undefined}
            >
              <div className="workout-set-grid">
                <motion.button
                  type="button"
                  onClick={() => onToggleSet(exerciseIndex, setIndex)}
                  className="workout-set-toggle"
                  whileTap={{ scale: 0.9 }}
                  animate={set.done ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                  transition={{ duration: 0.25 }}
                  aria-label={set.done
                    ? `Unmark set ${setIndex + 1} for ${exercise.name}`
                    : `Mark set ${setIndex + 1} for ${exercise.name}`}
                >
                  {set.done ? <SetTick draw={drawnSetIndex === setIndex} /> : setIndex + 1}
                </motion.button>
                <span
                  className="workout-set-previous tabular-nums"
                  aria-label={`Previous set result ${setIndex + 1}`}
                >
                  {formatPreviousSet(previousSet, units)}
                </span>
                {showSetControls ? (
                  <span className="workout-set-now tabular-nums">
                    {kgStringToDisplayWeight(set.weight, units) || 0} × {set.reps || 0}
                  </span>
                ) : (
                  <>
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="0"
                      value={kgStringToDisplayWeight(set.weight, units)}
                      onChange={(event) => onUpdateSet(
                        exerciseIndex,
                        setIndex,
                        'weight',
                        displayWeightStringToKg(event.target.value, units),
                      )}
                      onFocus={(event) => event.currentTarget.select()}
                      aria-label={`Weight, ${exercise.name}, set ${setIndex + 1}, ${units}`}
                      className={`workout-set-input ${set.done ? 'opacity-70' : ''}`}
                    />
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="0"
                      value={set.reps}
                      onChange={(event) => onUpdateSet(exerciseIndex, setIndex, 'reps', event.target.value)}
                      onFocus={(event) => event.currentTarget.select()}
                      aria-label={`Reps, ${exercise.name}, set ${setIndex + 1}`}
                      className={`workout-set-input ${set.done ? 'opacity-70' : ''}`}
                    />
                  </>
                )}
                <button
                  type="button"
                  onClick={() => onRemoveSet(exerciseIndex, setIndex)}
                  className="workout-set-remove"
                  style={{ color: 'var(--muted-soft)' }}
                  aria-label={`Remove set ${setIndex + 1}`}
                >
                  <X size={15} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={(event) => onAddSet(exerciseIndex, event.currentTarget)}
        className="workout-add-set mt-1 w-full"
      >
        <span className="inline-flex items-center justify-center gap-2">
          <Plus size={15} strokeWidth={2.4} />
          Add set
        </span>
      </button>
      </div>
    </motion.div>
  )
})

WorkoutExerciseLedgerItem.displayName = 'WorkoutExerciseLedgerItem'

export default WorkoutExerciseLedgerItem
