import React, { useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { ChevronRight, Pencil, Plus, Search, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { exercises, type Category, type Equipment, type Exercise, type MuscleGroup } from '../data/exercises'
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
  all: 'Wszystkie',
  chest: 'Klatka',
  back: 'Plecy',
  legs: 'Nogi',
  shoulders: 'Barki',
  arms: 'Ramiona',
  core: 'Core',
  cardio: 'Cardio',
}

const EQUIPMENT_LABELS: Record<Equipment | 'all', string> = {
  all: 'Wszystkie',
  barbell: 'Sztanga',
  dumbbell: 'Hantle',
  cable: 'Kabel',
  machine: 'Maszyna',
  bodyweight: 'Własne ciało',
  kettlebell: 'Kettlebell',
}

const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: 'Klatka',
  back: 'Plecy',
  quads: 'Quady',
  hamstrings: 'Dwugłowe',
  glutes: 'Pośladki',
  shoulders: 'Barki',
  triceps: 'Triceps',
  biceps: 'Biceps',
  forearms: 'Przedramiona',
  core: 'Core',
  calves: 'Łydki',
}

const CATEGORIES = (Object.keys(CATEGORY_LABELS) as (Category | 'all')[])
const EQUIPMENT_OPTIONS = (Object.keys(EQUIPMENT_LABELS) as (Equipment | 'all')[])
const MUSCLE_OPTIONS = (Object.keys(MUSCLE_LABELS) as MuscleGroup[])

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
      setError({ message: 'Nazwa musi mieć co najmniej 2 znaki.', field: 'name' })
      nameInputRef.current?.focus()
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSubmit({ name: trimmed, category, equipment, muscles })
    } catch (nextError) {
      setError({
        message: nextError instanceof Error ? nextError.message : 'Błąd zapisu. Spróbuj ponownie.',
        field: null,
      })
      setSaving(false)
    }
  }

  const selectStyle = {
    background: 'var(--input-bg)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    borderRadius: '0.75rem',
    padding: '0.5rem 0.75rem',
    width: '100%',
    fontSize: '0.875rem',
    appearance: 'none' as const,
  }

  return (
    <div
      className="fixed inset-0 z-50 px-0 py-0 sm:px-6 sm:py-6"
      style={{ background: 'rgba(5,6,20,0.74)', backdropFilter: 'blur(10px)' }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="surface-panel flex flex-col overflow-hidden rounded-t-[var(--radius-xl)] sm:mx-auto sm:rounded-[var(--radius-xl)] sm:max-w-lg"
        style={{ maxHeight: '90dvh', marginTop: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top,0px))] sm:px-5 sm:pt-4"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <button
            onClick={onClose}
            className="mobile-touch-target flex h-8 w-8 flex-none items-center justify-center rounded-[var(--radius-md)] transition-opacity hover:opacity-70"
            style={{ color: 'var(--muted)' }}
            aria-label="Zamknij formularz"
          >
            <X size={16} />
          </button>
          <p id={titleId} className="text-sm font-semibold text-white">
            {mode === 'edit' ? 'Edytuj własne ćwiczenie' : 'Dodaj własne ćwiczenie'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 py-5 sm:px-5 space-y-5">
          {/* Name */}
          <div>
            <label htmlFor={nameInputId} className="block text-xs font-semibold mb-2 uppercase" style={{ color: 'var(--muted)' }}>
              Nazwa *
            </label>
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
              placeholder="np. Banded Pull-apart"
              maxLength={60}
              style={{
                background: 'var(--input-bg)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                borderRadius: '0.75rem',
                padding: '0.5rem 0.75rem',
                width: '100%',
                fontSize: '0.875rem',
              }}
            />
            {error?.field === 'name' && (
              <p id={errorId} role="alert" className="mt-2 text-xs" style={{ color: 'var(--danger)' }}>
                {error.message}
              </p>
            )}
          </div>

          {/* Category */}
          <div>
            <label htmlFor={categoryInputId} className="block text-xs font-semibold mb-2 uppercase" style={{ color: 'var(--muted)' }}>
              Kategoria ćwiczenia
            </label>
            <select id={categoryInputId} value={category} onChange={(e) => setCategory(e.target.value as Category)} style={selectStyle}>
              {(Object.keys(CATEGORY_LABELS) as (Category | 'all')[])
                .filter((c) => c !== 'all')
                .map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
            </select>
          </div>

          {/* Equipment */}
          <div>
            <label htmlFor={equipmentInputId} className="block text-xs font-semibold mb-2 uppercase" style={{ color: 'var(--muted)' }}>
              Sprzęt
            </label>
            <select id={equipmentInputId} value={equipment} onChange={(e) => setEquipment(e.target.value as Equipment)} style={selectStyle}>
              {(Object.keys(EQUIPMENT_LABELS) as (Equipment | 'all')[])
                .filter((eq) => eq !== 'all')
                .map((eq) => (
                  <option key={eq} value={eq}>{EQUIPMENT_LABELS[eq]}</option>
                ))}
            </select>
          </div>

          {/* Muscles */}
          <div>
            <p id={musclesGroupId} className="block text-xs font-semibold mb-2 uppercase" style={{ color: 'var(--muted)' }}>
              Grupy mięśniowe
            </p>
            <div className="flex flex-wrap gap-2" role="group" aria-labelledby={musclesGroupId}>
              {MUSCLE_OPTIONS.map((m) => {
                const active = muscles.includes(m)
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleMuscle(m)}
                    aria-pressed={active}
                    className="mobile-touch-target px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                    style={{
                      background: active ? 'var(--accent-soft)' : 'rgba(255,255,255,0.03)',
                      color: active ? 'var(--text-strong)' : 'var(--muted)',
                      border: `1px solid ${active ? 'var(--accent-soft-strong)' : 'var(--border)'}`,
                    }}
                  >
                    {MUSCLE_LABELS[m]}
                  </button>
                )
              })}
            </div>
          </div>

          {error && error.field === null && (
            <p id={errorId} role="alert" className="text-xs" style={{ color: 'var(--danger)' }}>
              {error.message}
            </p>
          )}

          <motion.button
            type="submit"
            disabled={saving}
            className="w-full rounded-[var(--radius-lg)] py-3.5 text-sm font-semibold disabled:opacity-50"
            style={{
              background: 'var(--primary-gradient)',
              color: 'var(--accent-foreground)',
            }}
            whileTap={{ scale: 0.97 }}
          >
            {saving ? 'Zapisuję...' : mode === 'edit' ? 'Zapisz zmiany' : 'Dodaj ćwiczenie'}
          </motion.button>

          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="exercise-form-delete mobile-touch-target"
            >
              <Trash2 size={15} aria-hidden="true" />
              Usuń ćwiczenie
            </button>
          )}
        </form>
      </div>
    </div>
  )
}

// ─── Exercise Card ────────────────────────────────────────────────────────────

interface CardProps {
  exercise: Exercise
  isUser: boolean
  onEdit?: () => void
  onNavigate: () => void
}

function ExerciseCard({ exercise, isUser, onEdit, onNavigate }: CardProps) {
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
        aria-label={`Otwórz ćwiczenie ${exercise.name}`}
      >
        <strong>{exercise.name}</strong>
        <small>{categoryLabel} · {EQUIPMENT_LABELS[exercise.equipment]}</small>
        {visibleMuscles.length > 0 && (
          <span className="exercise-library-muscles" aria-label={`Grupy mięśniowe: ${labeledMuscles.map((m) => MUSCLE_LABELS[m]).join(', ')}`}>
            {visibleMuscles.map((muscle) => (
              <span key={muscle}>{MUSCLE_LABELS[muscle]}</span>
            ))}
            {hiddenMuscleCount > 0 && <span>+{hiddenMuscleCount}</span>}
          </span>
        )}
      </button>

      <div className="exercise-library-row-controls">
        {isUser && (
          <button
            type="button"
            onClick={onEdit}
            className="planner-icon-action"
            aria-label={`Edytuj ćwiczenie ${exercise.name}`}
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
          className="exercise-filter-chip mobile-touch-target"
          data-active={active === option}
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
  const [formExercise, setFormExercise] = useState<Exercise | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [confirmDeleteExercise, setConfirmDeleteExercise] = useState<Exercise | null>(null)
  const currentUid = user?.uid ?? null
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
    toast.success('Ćwiczenie dodane!')
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
    toast.success('Ćwiczenie zaktualizowane!')
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
      toast.success('Ćwiczenie usunięte!')
    } catch (err) {
      if (useAuthStore.getState().user?.uid !== operationUid) return
      console.error('[userExercise delete error]', err)
      toast.error('Nie udało się usunąć ćwiczenia.')
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
          <h1>Biblioteka</h1>
        </motion.div>

        <div className="exercise-command-panel">
          <div className="exercise-search-box">
            <Search size={16} aria-hidden="true" />
            <input
              type="text"
              aria-label="Szukaj ćwiczenia"
              placeholder="Szukaj ćwiczenia..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {hasActiveFilters && (
              <button type="button" onClick={clearFilters} aria-label="Wyczyść filtry">
                <X size={15} />
                Wyczyść
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
            <span>Filtry</span>
            {activeFilterCount > 0 && (
              <strong aria-label={`${activeFilterCount} aktywne filtry`}>
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
              <span>Kategoria ćwiczenia</span>
              <ChipRow label="Kategoria ćwiczenia" options={CATEGORIES} labels={CATEGORY_LABELS} active={category} onSelect={setCategory} />
            </div>
            <div className="exercise-filter-group">
              <span>Sprzęt</span>
              <ChipRow label="Sprzęt" options={EQUIPMENT_OPTIONS} labels={EQUIPMENT_LABELS} active={equipment} onSelect={setEquipment} />
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
              Dodaj własne
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
        <section className="exercise-library-section">
          <SectionHeader
            title="Moje ćwiczenia"
            count={userExercisesState.status === 'success' ? filteredUser.length : '—'}
          />

          {userExercisesState.status === 'loading' ? (
            <div className="exercise-empty-state">
              <p>Ładowanie...</p>
            </div>
          ) : userExercisesState.status === 'error' ? (
            <div id="user-exercises-load-error" className="exercise-empty-state">
              <strong>Nie udało się wczytać Twoich ćwiczeń</strong>
              <p>Katalog globalny nadal jest dostępny. Sprawdź połączenie i spróbuj ponownie.</p>
              <button
                type="button"
                onClick={handleRetryUserExercises}
                className="planner-secondary-action"
              >
                Spróbuj ponownie
              </button>
            </div>
          ) : filteredUser.length === 0 && userExercises.length > 0 ? (
            <div className="exercise-empty-state">
              <p>Żadne z Twoich ćwiczeń nie pasuje do filtrów.</p>
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

        <section className="exercise-library-section">
          <SectionHeader title="Katalog globalny" count={filteredGlobal.length} />

          {filteredGlobal.length === 0 ? (
            hasNoResults && (
              <div className="exercise-empty-state">
                <strong>Brak wyników</strong>
                <p>Zmień filtry albo wpisz inną nazwę.</p>
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
                    <ExerciseCard exercise={ex} isUser={false} onNavigate={() => navigate(`/exercises/global/${ex.id}`)} />
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
          message={`Usunąć ćwiczenie "${confirmDeleteExercise.name}"? Nie będzie już dostępne w katalogu użytkownika.`}
          confirmLabel="Usuń"
          danger
          onConfirm={() => { void handleDeleteConfirmed() }}
          onCancel={() => setConfirmDeleteExercise(null)}
        />
      )}

    </>
  )
}
