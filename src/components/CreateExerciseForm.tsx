import React, { useId, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown, Trash2, X } from 'lucide-react'
import type { Category, Equipment, MuscleGroup } from '../data/exercises'
import { CATEGORY_LABELS, EQUIPMENT_LABELS, MUSCLE_LABELS } from '../lib/exerciseFormOptions'
// Own exercises keep the muscle list Firestore rules accept; adductors is catalogue-only.
import { muscleOptions } from '../shared/exerciseInput'
import type { UserExerciseInput } from '../lib/userExercisesService'
import { useDialogA11y } from '../hooks/useDialogA11y'

// ─── Create Form Modal ────────────────────────────────────────────────────────

export interface CreateFormProps {
  mode: 'create' | 'edit'
  initialValue?: UserExerciseInput
  onSubmit: (input: UserExerciseInput) => Promise<void>
  onDelete?: () => void
  onClose: () => void
}

interface ExerciseFormError {
  message: string
  field: 'name' | null
}

export default function CreateExerciseForm({ mode, initialValue, onSubmit, onDelete, onClose }: CreateFormProps) {
  const [name, setName] = useState(initialValue?.name ?? '')
  const [category, setCategory] = useState<Category>(initialValue?.category ?? 'chest')
  const [equipment, setEquipment] = useState<Equipment>(initialValue?.equipment ?? 'barbell')
  const [muscles, setMuscles] = useState<MuscleGroup[]>(initialValue?.muscles ?? [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<ExerciseFormError | null>(null)

  const dialogRef = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const errorId = useId()
  const nameInputId = useId()
  const categoryInputId = useId()
  const equipmentInputId = useId()
  const musclesGroupId = useId()

  useDialogA11y({ containerRef: dialogRef, onClose, initialFocusRef: nameInputRef })

  function toggleMuscle(m: MuscleGroup) {
    setMuscles((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed.length < 2) {
      setError({ message: 'Name must contain at least 2 characters.', field: 'name' })
      nameInputRef.current?.focus()
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSubmit({ name: trimmed, category, equipment, muscles })
    } catch (nextError) {
      setError({
        message: nextError instanceof Error ? nextError.message : 'Could not save. Try again.',
        field: null,
      })
      setSaving(false)
    }
  }

  return (
    <div className="exercise-form-layer" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="exercise-form"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="exercise-form-head">
          <h2 id={titleId}>{mode === 'edit' ? 'Edit custom exercise' : 'Add custom exercise'}</h2>
          <button type="button" onClick={onClose} aria-label="Close form">
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="exercise-form-body">
          <div className="exercise-form-field">
            <label htmlFor={nameInputId}>Name</label>
            <input
              id={nameInputId}
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                if (error?.field === 'name') setError(null)
              }}
              aria-invalid={error?.field === 'name' ? true : undefined}
              aria-describedby={error?.field === 'name' ? errorId : undefined}
              placeholder="E.g. Banded Pull-apart"
              maxLength={60}
            />
            {error?.field === 'name' && (
              <p id={errorId} role="alert" className="exercise-form-error">{error.message}</p>
            )}
          </div>

          <div className="exercise-form-pair">
            <div className="exercise-form-field">
              <label htmlFor={categoryInputId}>Category</label>
              <span className="exercise-form-select">
                <select id={categoryInputId} value={category} onChange={(e) => setCategory(e.target.value as Category)}>
                  {(Object.keys(CATEGORY_LABELS) as (Category | 'all')[])
                    .filter((c) => c !== 'all')
                    .map((c) => (
                      <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                    ))}
                </select>
                <ChevronDown size={14} aria-hidden="true" />
              </span>
            </div>
            <div className="exercise-form-field">
              <label htmlFor={equipmentInputId}>Equipment</label>
              <span className="exercise-form-select">
                <select id={equipmentInputId} value={equipment} onChange={(e) => setEquipment(e.target.value as Equipment)}>
                  {(Object.keys(EQUIPMENT_LABELS) as (Equipment | 'all')[])
                    .filter((eq) => eq !== 'all')
                    .map((eq) => (
                      <option key={eq} value={eq}>{EQUIPMENT_LABELS[eq]}</option>
                    ))}
                </select>
                <ChevronDown size={14} aria-hidden="true" />
              </span>
            </div>
          </div>

          <div className="exercise-form-field">
            <p id={musclesGroupId}>Muscle groups</p>
            <div className="exercise-form-chips" role="group" aria-labelledby={musclesGroupId}>
              {muscleOptions.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleMuscle(m)}
                  aria-pressed={muscles.includes(m)}
                >
                  {MUSCLE_LABELS[m]}
                </button>
              ))}
            </div>
          </div>

          {error && error.field === null && (
            <p id={errorId} role="alert" className="exercise-form-error">{error.message}</p>
          )}

          <div className="exercise-form-foot">
            <motion.button type="submit" disabled={saving} className="dialog-action" whileTap={{ scale: 0.97 }}>
              {saving ? 'Saving...' : mode === 'edit' ? 'Save changes' : 'Add exercise'}
            </motion.button>
            {onDelete && (
              <button type="button" onClick={onDelete} className="exercise-form-delete mobile-touch-target">
                <Trash2 size={15} aria-hidden="true" />
                Remove exercise
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
