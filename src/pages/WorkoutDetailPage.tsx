import { useEffect, useState, type CSSProperties } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Clock3,
  Target,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react'
import {
  getWorkout,
  deleteWorkout,
  updateWorkout,
  calcVolume,
  type WorkoutSummary,
} from '../lib/workoutService'
import { exercises as exerciseDb } from '../data/exercises'
import { useAuthStore } from '../store/authStore'
import { useUserExercises } from '../hooks/useUserExercises'
import type { ExerciseSource } from '../store/workoutStore'
import { toast } from 'sonner'
import ExercisePicker from '../components/ExercisePicker'
import ConfirmDialog from '../components/ConfirmDialog'
import { ActionFeedback } from '../components/ActionFeedback'
import { WorkoutDetailMobileActions } from '../components/WorkoutDetailMobileActions'
import { LoadingState } from '../components/ui'
import {
  DEFAULT_EXERCISE_CATEGORY_COLOR,
  EXERCISE_CATEGORY_COLORS,
  EXERCISE_CATEGORY_LABELS,
  getEquipmentLabel,
} from '../lib/exerciseLabels'
import { getCappedWorkoutFinishedAt } from '../lib/sessionDuration'
import { getCategoryWorkloadInsight } from '../lib/workoutCopy'

const WORKOUT_LABELS = ['Push', 'Pull', 'Nogi', 'Upper Body', 'Lower Body', 'Full Body', 'Plecy & Biceps', 'Klatka & Triceps', 'Cardio', 'Crossfit', 'Mobilność'] as const
const exerciseMap = new Map(exerciseDb.map((exercise) => [exercise.id, exercise]))

interface WorkoutDeleteOperation {
  workoutId: string
  status: 'pending' | 'error'
}
function workoutAccent(workout: WorkoutSummary): string {
  const firstExercise = workout.exercises[0]
  if (!firstExercise?.exerciseId) return DEFAULT_EXERCISE_CATEGORY_COLOR
  return EXERCISE_CATEGORY_COLORS[exerciseMap.get(firstExercise.exerciseId)?.category ?? '']
    ?? DEFAULT_EXERCISE_CATEGORY_COLOR
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatDuration(start: number, end: number): string {
  const cappedEnd = getCappedWorkoutFinishedAt(start, end)
  const minutes = Math.round((cappedEnd - start) / 60_000)
  if (minutes < 1) return '< 1 min'
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

function formatCompactVolume(volume: number): string {
  if (!volume) return '0 kg'
  if (volume >= 10_000) return `${Math.round(volume / 1_000)}k kg`
  if (volume >= 1_000) return `${(volume / 1_000).toFixed(1)}k kg`
  return `${Math.round(volume).toLocaleString('pl-PL')} kg`
}

function cloneExercises(exercises: WorkoutSummary['exercises']): WorkoutSummary['exercises'] {
  return exercises.map((exercise) => ({
    ...(exercise.exerciseId !== undefined && { exerciseId: exercise.exerciseId }),
    exerciseSource: exercise.exerciseSource ?? 'global',
    name: exercise.name,
    sets: exercise.sets.map((set) => ({ weight: set.weight, reps: set.reps })),
  }))
}

function readWorkoutPreview(state: unknown, workoutId: string | undefined): WorkoutSummary | null {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null

  const preview = (state as { workoutPreview?: WorkoutSummary }).workoutPreview
  if (!preview || preview.id !== workoutId) return null

  return preview
}

function parseSetDraftValue(field: 'weight' | 'reps', value: string): number {
  if (value.trim() === '') return 0

  const parsedValue = field === 'weight' ? Number.parseFloat(value) : Number.parseInt(value, 10)
  if (!Number.isFinite(parsedValue)) return 0

  return Math.max(0, parsedValue)
}

function getWorkoutEditError(exercises: WorkoutSummary['exercises']): string | null {
  if (exercises.length === 0) return 'Trening musi zawierać co najmniej jedno ćwiczenie.'
  if (exercises.some((exercise) => exercise.sets.length === 0)) {
    return 'Każde ćwiczenie musi zawierać co najmniej jedną serię.'
  }
  if (exercises.some((exercise) => exercise.sets.some((set) => set.reps <= 0))) {
    return 'Każda seria musi zawierać co najmniej jedno powtórzenie.'
  }
  return null
}

export default function WorkoutDetailPage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const previewWorkout = readWorkoutPreview(location.state, id)
  const [workout, setWorkout] = useState<WorkoutSummary | null>(() => previewWorkout)
  const {
    state: userExercisesState,
    exercises: userExercises,
    retry: retryUserExercises,
  } = useUserExercises(user?.uid ?? null)
  const [loading, setLoading] = useState(() => previewWorkout === null)
  const [deleteOperation, setDeleteOperation] = useState<WorkoutDeleteOperation | null>(null)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [editedLabel, setEditedLabel] = useState('')
  const [editedExercises, setEditedExercises] = useState<WorkoutSummary['exercises']>([])

  useEffect(() => {
    if (!id) return
    let cancelled = false

    if (!previewWorkout) setLoading(true)

    getWorkout(id)
      .then((nextWorkout) => {
        if (cancelled) return
        setWorkout(nextWorkout)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setLoading(false)
        toast.error('Nie udało się wczytać treningu.')
      })

    return () => {
      cancelled = true
    }
  }, [id, previewWorkout])

  function handleStartEditing() {
    if (!workout) return
    setEditedLabel(workout.label ?? '')
    setEditedExercises(cloneExercises(workout.exercises))
    setIsEditing(true)
  }

  function handleCancelEditing() {
    if (!workout) return
    setEditedLabel(workout.label ?? '')
    setEditedExercises(cloneExercises(workout.exercises))
    setShowPicker(false)
    setIsEditing(false)
  }

  function handleAddExercise(exerciseId: string, name: string, source: ExerciseSource) {
    setEditedExercises((prev) => [
      ...prev,
      { exerciseId, exerciseSource: source, name, sets: [{ weight: 0, reps: 0 }] },
    ])
    setShowPicker(false)
  }

  function handleRemoveExercise(exerciseIndex: number) {
    setEditedExercises((prev) => prev.filter((_, index) => index !== exerciseIndex))
  }

  function handleAddSet(exerciseIndex: number) {
    setEditedExercises((prev) => prev.map((exercise, index) =>
      index === exerciseIndex
        ? { ...exercise, sets: [...exercise.sets, { weight: 0, reps: 0 }] }
        : exercise
    ))
  }

  function handleRemoveSet(exerciseIndex: number, setIndex: number) {
    setEditedExercises((prev) => prev.map((exercise, index) =>
      index === exerciseIndex
        ? { ...exercise, sets: exercise.sets.filter((_, innerIndex) => innerIndex !== setIndex) }
        : exercise
    ))
  }

  function handleSetChange(exerciseIndex: number, setIndex: number, field: 'weight' | 'reps', value: string) {
    const numericValue = parseSetDraftValue(field, value)

    setEditedExercises((current) => current.map((exercise, currentExerciseIndex) => {
      if (currentExerciseIndex !== exerciseIndex) return exercise

      return {
        ...exercise,
        sets: exercise.sets.map((set, currentSetIndex) => {
          if (currentSetIndex !== setIndex) return set
          return field === 'weight'
            ? { ...set, weight: numericValue }
            : { ...set, reps: numericValue }
        }),
      }
    }))
  }

  async function handleSave() {
    if (!workout || saving) return
    const validationError = getWorkoutEditError(editedExercises)
    if (validationError) {
      toast.error(validationError)
      return
    }
    const nextLabel = editedLabel || null
    const nextExercises = cloneExercises(editedExercises)

    setSaving(true)
    try {
      await updateWorkout(workout.id, { label: nextLabel, exercises: nextExercises })
      setWorkout({ ...workout, label: nextLabel, exercises: nextExercises })
      setEditedLabel(nextLabel ?? '')
      setEditedExercises(cloneExercises(nextExercises))
      setShowPicker(false)
      setIsEditing(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[updateWorkout error]', err)
      toast.error(`Błąd zapisu: ${msg}`)
    } finally {
      setSaving(false)
    }
  }

  async function runWorkoutDelete(workoutId: string) {
    setDeleteOperation({ workoutId, status: 'pending' })
    try {
      await deleteWorkout(workoutId)
      navigate('/history', { replace: true })
      toast.success('Trening usunięty')
    } catch {
      setDeleteOperation((current) => (
        current?.workoutId === workoutId
          ? { workoutId, status: 'error' }
          : current
      ))
      toast.error('Nie udało się usunąć treningu.')
    }
  }

  function doDelete() {
    if (!workout) return
    void runWorkoutDelete(workout.id)
  }

  function retryWorkoutDelete() {
    if (!deleteOperation || deleteOperation.status !== 'error') return
    void runWorkoutDelete(deleteOperation.workoutId)
  }

  function handleDelete() {
    setConfirmDeleteOpen(true)
  }

  function handleBack() {
    if (location.key !== 'default' && window.history.length > 1) {
      navigate(-1)
      return
    }
    navigate('/history')
  }

  if (loading) return <LoadingState message="Ładowanie treningu..." />

  if (!workout) {
    return (
      <div className="flex items-center justify-center">
        <div className="puls-panel rounded-[var(--radius-sm)] p-8 text-center">
          <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>Trening nie istnieje.</p>
          <button onClick={handleBack} style={{ color: 'var(--accent)' }}>
            Wróć
          </button>
        </div>
      </div>
    )
  }

  const displayedWorkout: WorkoutSummary = isEditing
    ? { ...workout, label: editedLabel || null, exercises: editedExercises }
    : workout
  const exerciseCatalog = new Map([...exerciseDb, ...userExercises].map((exercise) => [exercise.id, exercise]))
  const accent = workoutAccent(displayedWorkout)
  const volume = calcVolume(displayedWorkout)
  const totalSets = displayedWorkout.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0)
  const totalExercises = displayedWorkout.exercises.length
  const totalReps = displayedWorkout.exercises.reduce((sum, exercise) => (
    sum + exercise.sets.reduce((innerSum, set) => innerSum + set.reps, 0)
  ), 0)
  const topSetWeight = displayedWorkout.exercises.reduce((top, exercise) => (
    Math.max(top, ...exercise.sets.map((set) => set.weight), 0)
  ), 0)
  const focusEntries = Object.entries(displayedWorkout.exercises.reduce<Record<string, number>>((acc, exercise) => {
    const category = exercise.exerciseId ? exerciseCatalog.get(exercise.exerciseId)?.category : null
    if (!category) return acc
    acc[category] = (acc[category] ?? 0) + 1
    return acc
  }, {})).sort((a, b) => b[1] - a[1])
  const topFocus = focusEntries[0]
  const mobileReadGrid = 'grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[1.5rem_1fr_1fr_1fr]'
  const mobileEditGrid = 'grid-cols-[1.75rem_minmax(0,1fr)_minmax(0,1fr)_1.75rem] lg:grid-cols-[1.5rem_1fr_1fr_1fr_1.25rem]'
  const isDeleting = deleteOperation?.status === 'pending'
  const deleteFeedbackId = `workout-detail-delete-feedback-${workout.id}`

  const actionButtons = isEditing ? (
    <div className="flex gap-3">
      <motion.button
        onClick={handleCancelEditing}
        disabled={saving}
        className="flex-1 py-3 rounded-2xl text-sm font-semibold disabled:opacity-40"
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          color: 'white',
        }}
        whileTap={{ scale: 0.97 }}
      >
        Anuluj
      </motion.button>
      <motion.button
        onClick={handleSave}
        disabled={saving}
        className="flex-1 py-3 rounded-2xl text-sm font-semibold disabled:opacity-40"
        style={{
          background: 'var(--primary-gradient)',
          border: '1px solid var(--accent)',
          color: 'var(--accent-foreground)',
        }}
        whileTap={{ scale: 0.97 }}
      >
        {saving ? 'Zapisywanie...' : 'Zapisz'}
      </motion.button>
    </div>
  ) : (
    <div className="flex gap-3">
      <motion.button
        onClick={handleStartEditing}
        className="flex-1 py-3 rounded-2xl text-sm font-semibold"
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          color: 'white',
        }}
        whileTap={{ scale: 0.97 }}
      >
        Edytuj
      </motion.button>
      <motion.button
        onClick={handleDelete}
        disabled={isDeleting}
        aria-describedby={deleteOperation?.status === 'error' ? deleteFeedbackId : undefined}
        className="flex-1 py-3 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
        style={{
          background: 'var(--danger-soft)',
          border: '1px solid var(--danger-soft-strong)',
          color: 'var(--danger)',
        }}
        whileTap={{ scale: 0.97 }}
      >
        <Trash2 size={15} />
        {isDeleting ? 'Usuwanie...' : 'Usuń trening'}
      </motion.button>
    </div>
  )

  const heroLabel = displayedWorkout.label
    ?? (topFocus ? (EXERCISE_CATEGORY_LABELS[topFocus[0]] ?? 'Trening') : 'Trening')
  const heroInsight = topFocus
    ? getCategoryWorkloadInsight(topFocus[0], EXERCISE_CATEGORY_LABELS[topFocus[0]] ?? topFocus[0])
    : 'Pierwsza pełna sesja pokaże dominujący fokus treningu.'

  return (
    <>
      <motion.button
        onClick={handleBack}
        className="workout-detail-back puls-link-button mb-4 px-3 py-2 text-xs font-semibold"
        style={{ color: 'var(--text)', border: '1px solid var(--border)' }}
        initial={false}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.18 }}
        whileTap={{ scale: 0.97 }}
      >
        <ArrowLeft size={14} />
        Wróć
      </motion.button>

      <section className="hero-editorial">
        <div className="flex flex-col gap-5">
          <p className="hero-editorial-date">
            Trening · {formatDate(displayedWorkout.startedAt)}
          </p>

          <div>
            <h1 className="hero-editorial-name">{heroLabel}</h1>
          </div>

          <p className="hero-editorial-sub">{heroInsight}</p>
        </div>
      </section>

        <div className="desktop-app-grid">
          <aside className="desktop-sticky space-y-4 hidden lg:block">
            <motion.div
              className="workout-detail-side-panel puls-panel overflow-hidden"
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="p-5">
                {isEditing && (
                  <div className="mb-4">
                    <p className="text-[10px] uppercase mb-3" style={{ color: accent }}>
                      Rodzaj treningu
                    </p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
                      {WORKOUT_LABELS.map((label) => {
                        const isActive = editedLabel === label
                        return (
                          <motion.button
                            key={label}
                            onClick={() => setEditedLabel(isActive ? '' : label)}
                            className="rounded-xl px-2 py-2 text-[11px] font-semibold leading-tight"
                            style={{
                              background: isActive ? 'var(--accent-soft)' : 'var(--input-bg)',
                              color: isActive ? 'var(--text-strong)' : 'white',
                              border: isActive ? '1px solid var(--accent-soft-strong)' : '1px solid var(--border)',
                            }}
                            whileTap={{ scale: 0.97 }}
                          >
                            {label}
                          </motion.button>
                        )
                      })}
                    </div>
                  </div>
                )}

                <p className="eyebrow mb-3" style={{ color: accent }}>Statystyki sesji</p>

                <div className="workout-detail-stat-ledger puls-ledger">
                  {[
                    { label: 'Czas', value: formatDuration(displayedWorkout.startedAt, displayedWorkout.finishedAt) },
                    { label: 'Serie', value: String(totalSets) },
                    { label: 'Ćwiczenia', value: String(totalExercises) },
                  ].map((stat) => (
                    <div key={stat.label}>
                      <p className="text-lg font-bold text-white">{stat.value}</p>
                      <p className="text-[10px] uppercase" style={{ color: 'var(--muted)' }}>
                        {stat.label}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  {actionButtons}
                </div>
              </div>
            </motion.div>
          </aside>

          <div className="workout-detail-content min-w-0">
            <motion.section
              className="workout-summary-panel puls-panel mb-5 p-4 sm:p-5"
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="eyebrow">Podsumowanie sesji</p>
                  <h3 className="section-title mt-2">Rozpiska sesji</h3>
                  <p className="mt-3 max-w-2xl text-sm leading-6" style={{ color: 'var(--muted)' }}>
                    Ćwiczenia, serie i obciążenia z tego treningu.
                  </p>
                </div>
                <div className="workout-summary-ledger puls-ledger w-full xl:w-[32rem]">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="stat-meta">Objętość</span>
                      <Target size={14} style={{ color: accent }} />
                    </div>
                    <p className="mt-2 text-2xl font-semibold text-white tabular-nums">{formatCompactVolume(volume)}</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="stat-meta">Top set</span>
                      <TrendingUp size={14} style={{ color: accent }} />
                    </div>
                    <p className="mt-2 text-2xl font-semibold text-white tabular-nums">{topSetWeight ? `${topSetWeight} kg` : '—'}</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="stat-meta">Powt.</span>
                      <Clock3 size={14} style={{ color: accent }} />
                    </div>
                    <p className="mt-2 text-2xl font-semibold text-white tabular-nums">{totalReps}</p>
                  </div>
                </div>
              </div>
            </motion.section>

            <WorkoutDetailMobileActions>
              <motion.div
                className={`workout-detail-mobile-action-panel surface-panel rounded-[1.75rem] p-3${deleteOperation ? ' has-feedback' : ''}`}
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
              >
                {deleteOperation && (
                  <ActionFeedback
                    id={deleteFeedbackId}
                    status={deleteOperation.status}
                    message={deleteOperation.status === 'pending'
                      ? 'Usuwanie treningu…'
                      : 'Nie udało się usunąć treningu.'}
                    onRetry={deleteOperation.status === 'error' ? retryWorkoutDelete : undefined}
                    onDismiss={deleteOperation.status === 'error'
                      ? () => setDeleteOperation(null)
                      : undefined}
                    className="workout-detail-delete-feedback"
                  />
                )}
                <div className={deleteOperation ? 'workout-detail-mobile-action-controls mt-3' : 'workout-detail-mobile-action-controls'}>
                  {actionButtons}
                </div>
              </motion.div>
            </WorkoutDetailMobileActions>

            <div className="workout-exercise-list">
              {displayedWorkout.exercises.map((exercise, exerciseIndex) => {
                const exerciseData = exerciseCatalog.get(exercise.exerciseId ?? '') ?? exerciseMap.get(exercise.exerciseId ?? '')
                const exerciseColor = EXERCISE_CATEGORY_COLORS[exerciseData?.category ?? '']
                  ?? DEFAULT_EXERCISE_CATEGORY_COLOR
                const exerciseVolume = exercise.sets.reduce((sum, set) => sum + set.weight * set.reps, 0)
                const topExerciseSet = exercise.sets.reduce((top, set) => Math.max(top, set.weight), 0)
                const exerciseReps = exercise.sets.reduce((sum, set) => sum + set.reps, 0)

                return (
                  <motion.div
                    key={exerciseIndex}
                    className="workout-exercise-panel"
                    style={{ '--exercise-accent': exerciseColor } as CSSProperties}
                    initial={false}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18 }}
                  >
                    <div className="workout-exercise-header">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {exerciseData?.equipment && (
                            <span
                              className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                              style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--muted)', border: '1px solid var(--border)' }}
                            >
                              {getEquipmentLabel(exerciseData.equipment)}
                            </span>
                          )}
                          {exerciseData?.category && (
                            <span
                              className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                              style={{ background: `${exerciseColor}18`, color: exerciseColor }}
                            >
                              {EXERCISE_CATEGORY_LABELS[exerciseData.category] ?? exerciseData.category}
                            </span>
                          )}
                        </div>
                        <p className="mt-3 text-base font-semibold text-white">{exercise.name}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isEditing && (
                          <button
                            onClick={() => handleRemoveExercise(exerciseIndex)}
                            className="text-xs transition-opacity hover:opacity-70"
                            style={{ color: 'var(--muted)' }}
                          >
                            Usuń
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="workout-exercise-body">
                      <div className="workout-exercise-metrics puls-ledger">
                        <div>
                          <p className="stat-meta">Serie</p>
                          <p className="mt-2 text-lg font-semibold text-white tabular-nums">{exercise.sets.length}</p>
                        </div>
                        <div>
                          <p className="stat-meta">Objętość</p>
                          <p className="mt-2 text-lg font-semibold text-white tabular-nums">{formatCompactVolume(exerciseVolume)}</p>
                        </div>
                        <div>
                          <p className="stat-meta">Top set</p>
                          <p className="mt-2 text-lg font-semibold text-white tabular-nums">{topExerciseSet ? `${topExerciseSet} kg` : '—'}</p>
                        </div>
                      </div>

                      <div className={`workout-set-head grid ${isEditing ? mobileEditGrid : mobileReadGrid} gap-1.5 mb-1`}>
                        {[...['#', 'kg', 'Powt.', 'Vol.'], ...(isEditing ? [''] : [])].map((heading, index) => (
                          <span key={`${heading}-${index}`} className="text-[10px] uppercase text-center" style={{ color: 'var(--muted)' }}>
                            {heading === 'Vol.' ? <span className="hidden lg:inline">{heading}</span> : heading || <span aria-hidden="true">{index === 4 ? ' ' : heading}</span>}
                          </span>
                        ))}
                      </div>

                      {exercise.sets.map((set, setIndex) => (
                        <div
                          key={setIndex}
                          className={`workout-set-row grid ${isEditing ? mobileEditGrid : mobileReadGrid} gap-1.5 text-center items-center`}
                          style={{ borderTop: '1px solid var(--border)' }}
                        >
                          <span
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold"
                            style={{ color: 'var(--success)' }}
                          >
                            {setIndex + 1}
                          </span>
                          {isEditing ? (
                            <>
                              <input
                                type="number"
                                inputMode="decimal"
                                step="any"
                                min="0"
                                value={set.weight === 0 ? '' : set.weight}
                                onChange={(e) => handleSetChange(exerciseIndex, setIndex, 'weight', e.target.value)}
                                placeholder="0"
                                aria-label={`Ciężar, ${exercise.name}, seria ${setIndex + 1}, kg`}
                                className="w-full min-w-0 rounded-lg px-2 py-2 text-center text-sm text-white outline-none"
                                style={{ background: 'var(--input-bg)', border: '1px solid var(--border)' }}
                              />
                              <input
                                type="number"
                                inputMode="numeric"
                                step="1"
                                min="0"
                                value={set.reps === 0 ? '' : set.reps}
                                onChange={(e) => handleSetChange(exerciseIndex, setIndex, 'reps', e.target.value)}
                                placeholder="0"
                                aria-label={`Powtórzenia, ${exercise.name}, seria ${setIndex + 1}`}
                                className="w-full min-w-0 rounded-lg px-2 py-2 text-center text-sm text-white outline-none"
                                style={{ background: 'var(--input-bg)', border: '1px solid var(--border)' }}
                              />
                            </>
                          ) : (
                            <>
                              <span className="text-xs text-white">{set.weight}</span>
                              <span className="text-xs text-white">{set.reps}</span>
                            </>
                          )}
                          <span className="hidden text-xs lg:block" style={{ color: 'var(--muted)' }}>
                            {(set.weight * set.reps).toLocaleString('pl-PL')}
                          </span>
                          {isEditing && (
                            exercise.sets.length > 1 ? (
                              <button
                                onClick={() => handleRemoveSet(exerciseIndex, setIndex)}
                                className="mobile-touch-target flex h-7 w-7 items-center justify-center rounded-md text-xs text-center transition-opacity hover:opacity-70"
                                style={{ color: 'var(--muted)' }}
                                aria-label={`Usuń serię ${setIndex + 1}`}
                              >
                                <X size={14} />
                              </button>
                            ) : (
                              <span aria-hidden="true" />
                            )
                          )}
                        </div>
                      ))}

                      <div className="mt-1 space-y-1 lg:hidden">
                        {exercise.sets.map((set, setIndex) => (
                          <div
                            key={`mobile-volume-${setIndex}`}
                            className="flex justify-end text-[11px]"
                            style={{ color: 'var(--muted)' }}
                          >
                            Seria {setIndex + 1}: {(set.weight * set.reps).toLocaleString('pl-PL')} kg
                          </div>
                        ))}
                      </div>

                      {!isEditing && (
                        <div className="mt-3 flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border px-3 py-2 text-sm" style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'var(--border)' }}>
                          <span style={{ color: 'var(--muted)' }}>Powtórzenia łącznie</span>
                          <span className="font-semibold text-white tabular-nums">{exerciseReps}</span>
                        </div>
                      )}

                      {isEditing && (
                        <button
                          onClick={() => handleAddSet(exerciseIndex)}
                          className="mt-2 w-full py-1.5 rounded-lg text-xs transition-opacity hover:opacity-70"
                          style={{
                            background: 'var(--input-bg)',
                            color: 'var(--muted)',
                            border: '1px solid var(--border)',
                          }}
                        >
                          + Seria
                        </button>
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </div>

            {isEditing && (
              <div className="mt-4">
                <motion.button
                  onClick={() => setShowPicker(true)}
                  className="w-full py-3 rounded-2xl text-sm font-semibold"
                  style={{
                    background: 'var(--input-bg)',
                    color: 'var(--muted)',
                    border: '1px solid var(--border)',
                  }}
                  whileTap={{ scale: 0.97 }}
                >
                  + Dodaj ćwiczenie
                </motion.button>
              </div>
            )}

          </div>
        </div>
      {showPicker && (
        <ExercisePicker
          onSelect={handleAddExercise}
          onClose={() => setShowPicker(false)}
          userExercisesState={userExercisesState}
          onRetryUserExercises={retryUserExercises}
        />
      )}

      {confirmDeleteOpen && (
        <ConfirmDialog
          message="Usunąć ten trening? Tej operacji nie można cofnąć."
          confirmLabel="Usuń"
          danger
          onConfirm={() => { setConfirmDeleteOpen(false); doDelete() }}
          onCancel={() => setConfirmDeleteOpen(false)}
        />
      )}
    </>
  )
}
