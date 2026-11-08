import React, { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { ChevronDown, ChevronLeft, ChevronRight, Pencil, Plus, Search, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useProfileStore } from '../store/profileStore'
import { getRecords } from '../lib/progressService'
import { kgToDisplayWeight } from '../lib/weightUnits'
import { exercises, type Category, type Equipment, type Exercise, type MuscleGroup } from '../data/exercises'
import { muscleOptions } from '../shared/exerciseInput'
import {
  createUserExercise,
  deleteUserExercise,
  updateUserExercise,
  type UserExerciseInput,
} from '../lib/userExercisesService'
import { useDialogA11y } from '../hooks/useDialogA11y'
import { useUserExercises } from '../hooks/useUserExercises'
import ConfirmDialog from '../components/ConfirmDialog'

// ─── Labels ──────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<Category | 'all', string> = {
  all: 'All',
  chest: 'Chest',
  back: 'Back',
  legs: 'Legs',
  shoulders: 'Shoulders',
  arms: 'Arms',
  core: 'Core',
  cardio: 'Cardio',
}

const EQUIPMENT_LABELS: Record<Equipment | 'all', string> = {
  all: 'All',
  barbell: 'Barbell',
  dumbbell: 'Dumbbells',
  cable: 'Cable',
  machine: 'Machine',
  bodyweight: 'Bodyweight',
  kettlebell: 'Kettlebell',
}

const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: 'Chest',
  back: 'Back',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  adductors: 'Adductors',
  shoulders: 'Shoulders',
  triceps: 'Triceps',
  biceps: 'Biceps',
  forearms: 'Forearms',
  core: 'Core',
  calves: 'Calves',
}

const CATEGORIES = (Object.keys(CATEGORY_LABELS) as (Category | 'all')[])
const EQUIPMENT_OPTIONS = (Object.keys(EQUIPMENT_LABELS) as (Equipment | 'all')[])
// Own exercises keep the muscle list Firestore rules accept; adductors is catalogue-only.
const MUSCLE_OPTIONS = muscleOptions

// ─── Create Form Modal ────────────────────────────────────────────────────────

interface CreateFormProps {
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

function CreateExerciseForm({ mode, initialValue, onSubmit, onDelete, onClose }: CreateFormProps) {
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
              {MUSCLE_OPTIONS.map((m) => (
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

// ─── Exercise Card ────────────────────────────────────────────────────────────

interface CardProps {
  bestSet?: string
  exercise: Exercise
  isUser: boolean
  onEdit?: () => void
  onNavigate: () => void
}

function ExerciseCard({ exercise, isUser, bestSet, onEdit, onNavigate }: CardProps) {
  const categoryLabel = CATEGORY_LABELS[exercise.category]
  const labeledMuscles = exercise.muscles.filter(
    (muscle) => Boolean(MUSCLE_LABELS[muscle]) && MUSCLE_LABELS[muscle] !== categoryLabel,
  )
  const visibleMuscles = labeledMuscles.slice(0, 2)
  const hiddenMuscleCount = Math.max(labeledMuscles.length - visibleMuscles.length, 0)

  return (
    <article className="exercise-library-row" data-user={isUser}>
      <button
        type="button"
        onClick={onNavigate}
        className="exercise-library-row-main"
        aria-label={`Open exercise ${exercise.name}`}
      >
        <strong>{exercise.name}</strong>
        <small>{categoryLabel} · {EQUIPMENT_LABELS[exercise.equipment]}</small>
        {visibleMuscles.length > 0 && (
          <span className="exercise-library-muscles" aria-label={`Muscle groups: ${labeledMuscles.map((m) => MUSCLE_LABELS[m]).join(', ')}`}>
            {visibleMuscles.map((muscle) => (
              <span key={muscle}>{MUSCLE_LABELS[muscle]}</span>
            ))}
            {hiddenMuscleCount > 0 && <span>+{hiddenMuscleCount}</span>}
          </span>
        )}
      </button>

      <div className="exercise-library-row-controls">
        {bestSet && <span className="exercise-library-best tabular-nums">{bestSet}</span>}
        {isUser && (
          <button
            type="button"
            onClick={onEdit}
            className="planner-icon-action"
            aria-label={`Edit exercise ${exercise.name}`}
          >
            <Pencil size={14} />
          </button>
        )}

        {!isUser && (
          <span className="exercise-library-open" aria-hidden="true">
            <ChevronRight size={16} />
          </span>
        )}
      </div>
    </article>
  )
}

// ─── Filter Chips (horizontal scroll row) ────────────────────────────────────

interface ChipRowProps<T extends string> {
  label: string
  options: T[]
  labels: Record<T, string>
  active: T
  onSelect: (v: T) => void
}

function ChipRow<T extends string>({ label, options, labels, active, onSelect }: ChipRowProps<T>) {
  return (
    <div className="exercise-chip-row" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onSelect(option)}
          className="filter-chip"
          aria-pressed={active === option}
        >
          {labels[option]}
        </button>
      ))}
    </div>
  )
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({
  title,
  count,
}: {
  title: string
  count: number | string
}) {
  return (
    <div className="exercise-section-head">
      <h2>{title}</h2>
      <span>{count}</span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExercisesPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category | 'all'>('all')
  const [equipment, setEquipment] = useState<Equipment | 'all'>('all')
  const [filtersExpanded, setFiltersExpanded] = useState(false)
  const {
    state: userExercisesState,
    exercises: userExercises,
    retry: handleRetryUserExercises,
    updateExercises,
  } = useUserExercises(user?.uid ?? null)
  const [bestSets, setBestSets] = useState<Map<string, number>>(new Map())
  const [formExercise, setFormExercise] = useState<Exercise | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [confirmDeleteExercise, setConfirmDeleteExercise] = useState<Exercise | null>(null)
  const currentUid = user?.uid ?? null
  const units = useProfileStore((state) => state.profile?.units) ?? 'kg'
  const bestSetLabel = (source: 'global' | 'user', id: string) => {
    const weight = bestSets.get(`${source}:${id}`)
    return weight ? `${kgToDisplayWeight(weight, units)} ${units}` : undefined
  }

  useEffect(() => {
    if (!currentUid) return
    let live = true
    getRecords(currentUid)
      .then(({ records }) => {
        if (live) setBestSets(new Map(records.map((record) => [`${record.exerciseSource}:${record.exerciseId}`, record.maxWeight])))
      })
      .catch(() => {})
    return () => { live = false }
  }, [currentUid])
  const [interactionUid, setInteractionUid] = useState(currentUid)

  if (interactionUid !== currentUid) {
    setInteractionUid(currentUid)
    setShowForm(false)
    setFormExercise(null)
    setConfirmDeleteExercise(null)
  }

  const q = query.toLowerCase()

  function matchesFilters(ex: Exercise) {
    return (
      (!q || ex.name.toLowerCase().includes(q)) &&
      (category === 'all' || ex.category === category) &&
      (equipment === 'all' || ex.equipment === equipment)
    )
  }

  const filteredUser = userExercises.filter(matchesFilters)
  const filteredGlobal = exercises.filter(matchesFilters)
  const hasNoResults = filteredUser.length === 0 && filteredGlobal.length === 0
  const hasActiveFilters = query.trim().length > 0 || category !== 'all' || equipment !== 'all'
  const activeFilterCount = Number(category !== 'all') + Number(equipment !== 'all')
  const clearFilters = () => {
    setQuery('')
    setCategory('all')
    setEquipment('all')
  }

  async function handleCreate(input: UserExerciseInput) {
    if (!user) return
    const operationUid = user.uid
    const created = await createUserExercise(operationUid, input)
    if (useAuthStore.getState().user?.uid !== operationUid) return
    updateExercises(operationUid, (current) => [created, ...current])
    setShowForm(false)
    setFormExercise(null)
    toast.success('Exercise added!')
  }

  async function handleUpdate(input: UserExerciseInput) {
    if (!user || !formExercise) return
    const operationUid = user.uid
    const updatingId = formExercise.id
    await updateUserExercise(updatingId, input)
    if (useAuthStore.getState().user?.uid !== operationUid) return
    updateExercises(operationUid, (current) => (
      current.map((exercise) => (
        exercise.id === updatingId
          ? { ...exercise, ...input }
          : exercise
      ))
    ))
    setShowForm(false)
    setFormExercise(null)
    toast.success('Exercise updated!')
  }

  async function handleDeleteConfirmed() {
    if (!user || !confirmDeleteExercise) return

    const operationUid = user.uid
    const deletingId = confirmDeleteExercise.id
    setConfirmDeleteExercise(null)

    try {
      await deleteUserExercise(deletingId)
      if (useAuthStore.getState().user?.uid !== operationUid) return
      updateExercises(operationUid, (current) => (
        current.filter((exercise) => exercise.id !== deletingId)
      ))
      toast.success('Exercise deleted!')
    } catch (err) {
      if (useAuthStore.getState().user?.uid !== operationUid) return
      console.error('[userExercise delete error]', err)
      toast.error('Could not delete exercise.')
    }
  }

  function openCreateForm() {
    setFormExercise(null)
    setShowForm(true)
  }

  function openEditForm(exercise: Exercise) {
    setFormExercise(exercise)
    setShowForm(true)
  }

  return (
    <>
      <div className="workbench-page">
        <section className="exercise-library-header">
        <motion.div
          className="exercise-library-header-copy"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <button type="button" className="template-editor-back" onClick={() => navigate('/templates')}>
            <ChevronLeft size={16} aria-hidden="true" />
            Plans
          </button>
          <h1>Exercises</h1>
        </motion.div>

        <div className="exercise-command-panel">
          <div className="exercise-search-box">
            <Search size={16} aria-hidden="true" />
            <input
              type="text"
              aria-label="Search exercises"
              placeholder="Search exercises..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {hasActiveFilters && (
              <button type="button" onClick={clearFilters} aria-label="Clear filters">
                <X size={15} />
                Clear
              </button>
            )}
          </div>

          <button
            type="button"
            className="exercise-filter-toggle"
            aria-expanded={filtersExpanded}
            aria-controls="exercise-filter-board"
            onClick={() => setFiltersExpanded((expanded) => !expanded)}
          >
            <SlidersHorizontal size={16} aria-hidden="true" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <strong aria-label={`${activeFilterCount} active filters`}>
                {activeFilterCount}
              </strong>
            )}
            <ChevronRight size={16} aria-hidden="true" />
          </button>

          <div
            id="exercise-filter-board"
            className="exercise-filter-board"
            data-expanded={filtersExpanded}
          >
            <div className="exercise-filter-group">
              <span>Exercise category</span>
              <ChipRow label="Exercise category" options={CATEGORIES} labels={CATEGORY_LABELS} active={category} onSelect={setCategory} />
            </div>
            <div className="exercise-filter-group">
              <span>Equipment</span>
              <ChipRow label="Equipment" options={EQUIPMENT_OPTIONS} labels={EQUIPMENT_LABELS} active={equipment} onSelect={setEquipment} />
            </div>
          </div>

          <div className="exercise-library-create-action">
            <motion.button
              type="button"
              onClick={openCreateForm}
              disabled={userExercisesState.status !== 'success'}
              aria-describedby={userExercisesState.status === 'error' ? 'user-exercises-load-error' : undefined}
              className="planner-secondary-action"
              whileTap={{ scale: 0.97 }}
            >
              <Plus size={16} strokeWidth={2.5} />
              Add custom
            </motion.button>
          </div>
        </div>
        </section>

        <div
          className="exercise-library-content"
          data-testid="exercises-page"
          data-load-state={
            userExercisesState.status === 'success'
              ? 'ready'
              : userExercisesState.status
          }
        >
        {!(userExercisesState.status === 'success' && userExercises.length === 0) && (
        <section className="exercise-library-section">
          <SectionHeader
            title="My exercises"
            count={userExercisesState.status === 'success' ? filteredUser.length : '—'}
          />

          {userExercisesState.status === 'loading' ? (
            <div className="exercise-empty-state">
              <p>Loading...</p>
            </div>
          ) : userExercisesState.status === 'error' ? (
            <div id="user-exercises-load-error" className="exercise-empty-state">
              <strong>Could not load your exercises</strong>
              <p>The shared library is still available. Check your connection and try again.</p>
              <button
                type="button"
                onClick={handleRetryUserExercises}
                className="planner-secondary-action"
              >
                Try again
              </button>
            </div>
          ) : filteredUser.length === 0 && userExercises.length > 0 ? (
            <div className="exercise-empty-state">
              <p>None of your exercises match these filters.</p>
            </div>
          ) : filteredUser.length > 0 ? (
            <AnimatePresence initial={false}>
              <div className="exercise-library-list">
                {filteredUser.map((ex) => (
                  <motion.div
                    key={ex.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ExerciseCard
                      bestSet={bestSetLabel('user', ex.id)}
                      exercise={ex}
                      isUser
                      onEdit={() => openEditForm(ex)}
                      onNavigate={() => navigate(`/exercises/user/${ex.id}`)}
                    />
                  </motion.div>
                ))}
              </div>
            </AnimatePresence>
          ) : null}
        </section>
        )}

        <section className="exercise-library-section">
          <SectionHeader title="Shared library" count={filteredGlobal.length} />

          {filteredGlobal.length === 0 ? (
            hasNoResults && (
              <div className="exercise-empty-state">
                <strong>No results</strong>
                <p>Change filters or enter another name.</p>
              </div>
            )
          ) : (
            <div className="exercise-library-list">
              <AnimatePresence initial={false}>
                {filteredGlobal.map((ex) => (
                  <motion.div
                    key={ex.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18 }}
                  >
                    <ExerciseCard exercise={ex} isUser={false} bestSet={bestSetLabel('global', ex.id)} onNavigate={() => navigate(`/exercises/global/${ex.id}`)} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </section>
        </div>
      </div>

      {/* Create form modal */}
      {showForm && (
        <CreateExerciseForm
          mode={formExercise ? 'edit' : 'create'}
          initialValue={formExercise ? {
            name: formExercise.name,
            category: formExercise.category,
            equipment: formExercise.equipment,
            muscles: formExercise.muscles,
          } : undefined}
          onSubmit={formExercise ? handleUpdate : handleCreate}
          onDelete={formExercise ? () => {
            setShowForm(false)
            setConfirmDeleteExercise(formExercise)
            setFormExercise(null)
          } : undefined}
          onClose={() => {
            setShowForm(false)
            setFormExercise(null)
          }}
        />
      )}

      {confirmDeleteExercise && (
        <ConfirmDialog
          message={`Delete exercise "${confirmDeleteExercise.name}"? It will no longer be available in your exercise library.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => { void handleDeleteConfirmed() }}
          onCancel={() => setConfirmDeleteExercise(null)}
        />
      )}

    </>
  )
}
