import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Check, ChevronDown, Plus, X } from 'lucide-react'
import OverloadHint from '../OverloadHint'
import { useWorkoutStore, type WorkoutExercise } from '../../store/workoutStore'
import type { SessionHint } from '../../shared/progression'
import { getExerciseSessions, type ExerciseSession } from '../../lib/exerciseDetailService'
import type { Units } from '../../lib/userProfile'

import { exerciseMetrics, formatPreviousSet, setPairLabel } from '../../shared/workoutDisplay'

interface WorkoutExerciseLedgerItemProps {
  exerciseClientId: string
  exerciseIndex: number
  exerciseCount: number
  fallbackExercise: WorkoutExercise | null
  categoryLabel?: string
  equipmentLabel?: string
  panelSetIndex: number
  inlinePanel?: React.ReactNode
  hintDismissed: boolean
  hintKey: string
  suggestion: SessionHint | null
  units: Units
  userId?: string
  onAddSet: (exerciseIndex: number, button: HTMLButtonElement) => void
  onApplySuggestion: (exerciseIndex: number, hintKey: string, values: { weight?: number; reps?: number }) => void
  onDismissSuggestion: (hintKey: string) => void
  onOpenOverview: () => void
  drawnSetIndex: number | null
  onRemoveSet: (exerciseIndex: number, setIndex: number) => void
  onSelectSet: (setIndex: number) => void
  onToggleSet: (exerciseIndex: number, setIndex: number) => void
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
  exerciseClientId,
  exerciseIndex,
  exerciseCount,
  fallbackExercise,
  categoryLabel,
  equipmentLabel,
  panelSetIndex,
  inlinePanel,
  hintDismissed,
  onOpenOverview,
  drawnSetIndex,
  hintKey,
  suggestion,
  units,
  userId,
  onAddSet,
  onApplySuggestion,
  onDismissSuggestion,
  onRemoveSet,
  onSelectSet,
  onToggleSet,
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
    if (!userId || !historyExerciseId || !historyExerciseSource) return () => { active = false }

    getExerciseSessions(userId, historyExerciseId, historyExerciseSource, 1)
      .then(([session]) => {
        if (active) setPreviousSets(session?.sets ?? [])
      })
      .catch(() => {
        if (active) setPreviousSets([])
      })

    return () => { active = false }
  }, [historyExerciseId, historyExerciseSource, userId])

  if (!exercise) return null

  const { completed: exerciseCompleted } = exerciseMetrics(exercise.sets)
  const exerciseComplete = exercise.sets.length > 0 && exerciseCompleted === exercise.sets.length

  const setRows = exercise.sets.map((set, setIndex) => (
    <div
      key={set.clientId ?? setIndex}
      className="workout-set-row"
      data-done={set.done || undefined}
      data-current={setIndex === panelSetIndex || undefined}
    >
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
      <button
        type="button"
        className="workout-set-values tabular-nums"
        onClick={() => onSelectSet(setIndex)}
        aria-pressed={setIndex === panelSetIndex}
        aria-label={`Edit set ${setIndex + 1}: last ${formatPreviousSet(previousSets[setIndex], units)}, today ${setPairLabel(set, units)}`}
      >
        <span className="workout-set-previous">{formatPreviousSet(previousSets[setIndex], units)}</span>
        <span className="workout-set-today">{setPairLabel(set, units)}</span>
      </button>
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
  ))
  if (inlinePanel) {
    setRows.splice(panelSetIndex < 0 ? setRows.length : panelSetIndex + 1, 0, (
      <motion.div key="set-panel" layout="position" transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}>
        {inlinePanel}
      </motion.div>
    ))
  }

  return (
    <motion.div
      className="workout-exercise-card"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.1 } }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      <button type="button" className="workout-exercise-position" aria-haspopup="dialog" onClick={onOpenOverview}>
        Exercise {exerciseIndex + 1} of {exerciseCount}
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      <div className="workout-exercise-head">
        <div className="min-w-0">
          <h2 className="workout-exercise-name">{exercise.name}</h2>
          {(categoryLabel || equipmentLabel) && (
            <p className="workout-exercise-meta">
              {categoryLabel}
              {categoryLabel && equipmentLabel && ' · '}
              {equipmentLabel}
            </p>
          )}
        </div>
      </div>

      {suggestion && !hintDismissed && !exerciseComplete && (
        <OverloadHint
          hint={suggestion}
          onApply={() => onApplySuggestion(exerciseIndex, hintKey, { weight: suggestion.weight, reps: suggestion.reps })}
          onDismiss={() => onDismissSuggestion(hintKey)}
        />
      )}

      <div className="workout-set-header">
        <span>Set</span>
        <span>Last</span>
        <span>Today</span>
        <span />
      </div>

      <div className="workout-set-list">{setRows}</div>

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
    </motion.div>
  )
})

WorkoutExerciseLedgerItem.displayName = 'WorkoutExerciseLedgerItem'

export default WorkoutExerciseLedgerItem
