import React from 'react'
import { motion } from 'framer-motion'
import { Check, Plus, Trash2, X } from 'lucide-react'
import OverloadHint from '../OverloadHint'
import { useWorkoutStore, type WorkoutExercise, type WorkoutSet } from '../../store/workoutStore'
import type { OverloadSuggestion } from '../../lib/overloadService'

type SetField = 'weight' | 'reps'

interface WorkoutExerciseLedgerItemProps {
  exerciseAccent: string
  exerciseClientId: string
  exerciseIndex: number
  categoryLabel?: string
  equipmentLabel?: string
  focusSetIndex: number
  hintDismissed: boolean
  hintKey: string
  isFocusedExercise: boolean
  suggestion: OverloadSuggestion | null
  units: string
  onAddSet: (exerciseIndex: number, button: HTMLButtonElement) => void
  onAdjustSet: (exerciseIndex: number, setIndex: number, field: SetField, delta: number) => void
  onApplySuggestion: (exerciseIndex: number, hintKey: string, weight: number) => void
  onDismissSuggestion: (hintKey: string) => void
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

function formatCompactVolume(volume: number): string {
  if (!volume) return '0 kg'
  if (volume >= 10_000) return `${Math.round(volume / 1_000)}k kg`
  if (volume >= 1_000) return `${(volume / 1_000).toFixed(1)}k kg`
  return `${Math.round(volume).toLocaleString('pl-PL')} kg`
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
  categoryLabel,
  equipmentLabel,
  focusSetIndex,
  hintDismissed,
  hintKey,
  isFocusedExercise,
  suggestion,
  units,
  onAddSet,
  onAdjustSet,
  onApplySuggestion,
  onDismissSuggestion,
  onRemoveExercise,
  onRemoveSet,
  onToggleSet,
  onUpdateSet,
}: WorkoutExerciseLedgerItemProps) {
  const exercise = useWorkoutStore((state) => selectExerciseByIdentity(state, exerciseIndex, exerciseClientId))
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
      style={{ '--exercise-accent': exerciseAccent } as React.CSSProperties}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <div className="workout-exercise-head mb-4 flex flex-wrap items-start justify-between gap-3">
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

      <div className="workout-exercise-ledger" aria-label={`Podsumowanie ćwiczenia ${exercise.name}`}>
        <div>
          <span>Postęp</span>
          <strong className="tabular-nums">{exerciseCompleted}/{exercise.sets.length}</strong>
        </div>
        <div>
          <span>Objętość</span>
          <strong className="tabular-nums">{formatCompactVolume(exerciseVolume)}</strong>
        </div>
        <div>
          <span>Top set</span>
          <strong className="tabular-nums">{bestSet ? `${bestSet} ${units}` : '—'}</strong>
        </div>
      </div>

      {suggestion && !hintDismissed && (
        <OverloadHint
          suggestion={suggestion}
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
            && isFocusedExercise
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
                  value={set.weight}
                  onChange={(event) => onUpdateSet(exerciseIndex, setIndex, 'weight', event.target.value)}
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
                  {setVolume > 0 ? formatCompactVolume(setVolume) : '—'}
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
                <div className="set-stepper-row sm:hidden mt-2 grid grid-cols-4 gap-1.5">
                  {[
                    { label: '−2.5 kg', delta: -2.5, field: 'weight' as const },
                    { label: '+2.5 kg', delta: +2.5, field: 'weight' as const },
                    { label: '−1 rep', delta: -1, field: 'reps' as const },
                    { label: '+1 rep', delta: +1, field: 'reps' as const },
                  ].map(({ label, delta, field }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => onAdjustSet(exerciseIndex, setIndex, field, delta)}
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
    </motion.div>
  )
})

WorkoutExerciseLedgerItem.displayName = 'WorkoutExerciseLedgerItem'

export default WorkoutExerciseLedgerItem
