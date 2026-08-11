import React from 'react'
import { motion } from 'framer-motion'
import { Check, ChevronDown, Plus, Trash2, X } from 'lucide-react'
import OverloadHint from '../OverloadHint'
import { useWorkoutStore, type WorkoutExercise, type WorkoutSet } from '../../store/workoutStore'
import type { OverloadSuggestion } from '../../lib/overloadService'
import type { Units } from '../../lib/userProfile'
import {
  displayWeightDeltaToKg,
  displayWeightStringToKg,
  kgStringToDisplayWeight,
  kgToDisplayWeight,
} from '../../lib/weightUnits'

type SetField = 'weight' | 'reps'

interface WorkoutExerciseLedgerItemProps {
  exerciseAccent: string
  exerciseClientId: string
  exerciseIndex: number
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
  onAddSet: (exerciseIndex: number, button: HTMLButtonElement) => void
  onAdjustSet: (exerciseIndex: number, setIndex: number, field: SetField, delta: number) => void
  onApplySuggestion: (exerciseIndex: number, hintKey: string, weight: number) => void
  onDismissSuggestion: (hintKey: string) => void
  onExpandExercise: (exerciseClientId: string) => void
  onRemoveExercise: (exerciseIndex: number) => void
  onRemoveSet: (exerciseIndex: number, setIndex: number) => void
  onToggleSet: (exerciseIndex: number, setIndex: number) => void
  onUpdateSet: (exerciseIndex: number, setIndex: number, field: SetField, value: string) => void
}

function parseWeight(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseReps(value: string): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function calcSetVolume(set: Pick<WorkoutSet, 'weight' | 'reps'>): number {
  return parseWeight(set.weight) * parseReps(set.reps)
}

function formatCompactVolume(volumeKg: number, units: Units): string {
  const volume = kgToDisplayWeight(volumeKg, units)
  if (!volume) return `0 ${units}`
  if (volume >= 10_000) return `${Math.round(volume / 1_000)}k ${units}`
  if (volume >= 1_000) return `${(volume / 1_000).toFixed(1)}k ${units}`
  return `${Math.round(volume).toLocaleString('pl-PL')} ${units}`
}

function selectExerciseByIdentity(state: ReturnType<typeof useWorkoutStore.getState>, exerciseIndex: number, exerciseClientId: string): WorkoutExercise | null {
  const indexedExercise = state.active?.exercises[exerciseIndex]
  if (indexedExercise?.clientId === exerciseClientId) return indexedExercise
  return state.active?.exercises.find((exercise) => exercise.clientId === exerciseClientId) ?? null
}

const WorkoutExerciseLedgerItem = React.memo(function WorkoutExerciseLedgerItem({
  exerciseAccent,
  exerciseClientId,
  exerciseIndex,
  fallbackExercise,
  categoryLabel,
  equipmentLabel,
  focusSetIndex,
  hintDismissed,
  hintKey,
  isCollapsible,
  isExpanded,
  isFocusedExercise,
  suggestion,
  units,
  onAddSet,
  onAdjustSet,
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
  if (!exercise) return null

  const exerciseVolume = exercise.sets.reduce((sum, set) => (
    set.done ? sum + calcSetVolume(set) : sum
  ), 0)
  const exerciseCompleted = exercise.sets.filter((set) => set.done && parseReps(set.reps) > 0).length
  const bestSet = exercise.sets.reduce((top, set) => (
    set.done ? Math.max(top, parseWeight(set.weight)) : top
  ), 0)

  return (
    <motion.div
      className="workout-exercise-card"
      data-active={isFocusedExercise}
      data-expanded={isExpanded}
      style={{ '--exercise-accent': exerciseAccent } as React.CSSProperties}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <div className="workout-exercise-head mb-4 flex items-start justify-between gap-2">
        {isCollapsible ? (
          <button
            type="button"
            className="workout-exercise-toggle"
            onClick={() => onExpandExercise(exerciseClientId)}
            aria-expanded={isExpanded}
            aria-controls={`workout-exercise-body-${exerciseIndex}`}
            aria-label={`${isExpanded ? 'Zwiń' : 'Rozwiń'} ćwiczenie ${exercise.name}`}
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
                {exerciseCompleted}/{exercise.sets.length} serii · {formatCompactVolume(exerciseVolume, units)}
              </span>
            </span>
            <ChevronDown className="workout-exercise-chevron" size={18} aria-hidden="true" />
          </button>
        ) : (
          <div className="min-w-0">
          {(categoryLabel || equipmentLabel) && (
            <p className="workout-exercise-meta">
              {categoryLabel && (
                <span style={{ color: exerciseAccent }}>
                  {categoryLabel}
                </span>
              )}
              {categoryLabel && equipmentLabel && ' · '}
              {equipmentLabel}
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
          aria-label={`Usuń ćwiczenie ${exercise.name}`}
        >
          <Trash2 size={14} />
          <span>Usuń</span>
        </button>
      </div>

      <div id={`workout-exercise-body-${exerciseIndex}`} className="workout-exercise-body">
      <div className="workout-exercise-ledger" aria-label={`Podsumowanie ćwiczenia ${exercise.name}`}>
        <div>
          <span>Postęp</span>
          <strong className="tabular-nums">{exerciseCompleted}/{exercise.sets.length}</strong>
        </div>
        <div>
          <span>Objętość</span>
          <strong className="tabular-nums">{formatCompactVolume(exerciseVolume, units)}</strong>
        </div>
        <div>
          <span>Top set</span>
          <strong className="tabular-nums">{bestSet ? `${kgToDisplayWeight(bestSet, units)} ${units}` : '—'}</strong>
        </div>
      </div>

      {suggestion && !hintDismissed && (
        <OverloadHint
          suggestion={suggestion}
          units={units}
          onApply={(weight) => onApplySuggestion(exerciseIndex, hintKey, weight)}
          onDismiss={() => onDismissSuggestion(hintKey)}
        />
      )}

      <div className="workout-set-header">
        <span>#</span>
        <span>{units}</span>
        <span>Powt.</span>
        <span>Obj.</span>
        <span />
      </div>

      <div className="workout-set-list">
        {exercise.sets.map((set, setIndex) => {
          const setVolume = calcSetVolume(set)
          const showMobileSteppers = !set.done
            && isExpanded
            && setIndex === focusSetIndex

          return (
            <div
              key={set.clientId ?? setIndex}
              className="workout-set-row"
              data-done={set.done || undefined}
            >
              <div className="workout-set-grid">
                <motion.button
                  type="button"
                  onClick={() => onToggleSet(exerciseIndex, setIndex)}
                  className="workout-set-toggle"
                  style={{
                    background: set.done ? 'var(--success)' : 'var(--input-bg)',
                    color: set.done ? 'var(--success-foreground)' : 'var(--muted)',
                    border: `1px solid ${set.done ? 'var(--success)' : 'var(--border)'}`,
                  }}
                  whileTap={{ scale: 0.9 }}
                  animate={set.done ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                  transition={{ duration: 0.25 }}
                  aria-label={set.done ? `Odznacz serię ${setIndex + 1}` : `Oznacz serię ${setIndex + 1}`}
                >
                  {set.done ? <Check size={16} /> : setIndex + 1}
                </motion.button>
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
                  aria-label={`Ciężar, ${exercise.name}, seria ${setIndex + 1}, ${units}`}
                  className={`workout-set-input ${set.done ? 'opacity-70' : ''}`}
                />
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="0"
                  value={set.reps}
                  onChange={(event) => onUpdateSet(exerciseIndex, setIndex, 'reps', event.target.value)}
                  aria-label={`Powtórzenia, ${exercise.name}, seria ${setIndex + 1}`}
                  className={`workout-set-input ${set.done ? 'opacity-70' : ''}`}
                />
                <span className="workout-set-vol tabular-nums" aria-label={`Objętość serii ${setIndex + 1}`}>
                  {setVolume > 0 ? formatCompactVolume(setVolume, units) : '—'}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveSet(exerciseIndex, setIndex)}
                  className="workout-set-remove"
                  style={{ color: 'var(--muted-soft)' }}
                  aria-label={`Usuń serię ${setIndex + 1}`}
                >
                  <X size={15} />
                </button>
              </div>
              {showMobileSteppers && (
                <div
                  className="set-stepper-row sm:hidden mt-2 grid grid-cols-4 gap-1.5"
                  role="group"
                  aria-label={`Szybka korekta serii ${setIndex + 1}`}
                >
                  {[
                    { label: `−2.5 ${units}`, delta: -2.5, field: 'weight' as const },
                    { label: `+2.5 ${units}`, delta: 2.5, field: 'weight' as const },
                    { label: '−1 rep', delta: -1, field: 'reps' as const },
                    { label: '+1 rep', delta: +1, field: 'reps' as const },
                  ].map(({ label, delta, field }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => onAdjustSet(
                        exerciseIndex,
                        setIndex,
                        field,
                        field === 'weight' ? displayWeightDeltaToKg(delta, units) : delta,
                      )}
                      className="set-stepper-btn"
                      aria-label={`Dostosuj ${field === 'weight' ? 'wagę' : 'powtórzenia'} o ${delta}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
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
          Dodaj serię
        </span>
      </button>
      </div>
    </motion.div>
  )
})

WorkoutExerciseLedgerItem.displayName = 'WorkoutExerciseLedgerItem'

export default WorkoutExerciseLedgerItem
