import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Check,
  X,
} from 'lucide-react'
import {
  getWorkout,
  deleteWorkout,
  updateWorkout,
  calcVolume,
  type WorkoutSummary,
} from '../lib/workoutService'
import { readWorkoutDeleteRecovery } from '../lib/workoutDeleteRecovery'
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
import { useProfileStore } from '../store/profileStore'
import {
  displayWeightStringToKg,
  formatCompactVolume,
  kgToDisplayWeight,
} from '../lib/weightUnits'

const WORKOUT_LABELS = ['Push', 'Pull', 'Legs', 'Upper Body', 'Lower Body', 'Full Body', 'Back & Biceps', 'Chest & Triceps', 'Cardio', 'Crossfit', 'Mobility'] as const
const exerciseMap = new Map(exerciseDb.map((exercise) => [exercise.id, exercise]))

interface WorkoutReadState {
  uid: string | null
  workoutId: string | undefined
  status: 'loading' | 'ready' | 'error'
  workout: WorkoutSummary | null
}

interface WorkoutDeleteOperation {
  workoutId: string
  uid: string
  status: 'pending' | 'cleanup_pending' | 'unknown' | 'error'
}

interface WorkoutResultState {
  workoutId: string
  status: 'materialized' | 'projection_pending'
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', {
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

function readWorkoutResult(state: unknown, workoutId: string | undefined): WorkoutResultState | null {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null

  const result = (state as { workoutResult?: unknown }).workoutResult
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null

  const { workoutId: resultWorkoutId, status } = result as Record<string, unknown>
  if (
    typeof resultWorkoutId !== 'string'
    || resultWorkoutId !== workoutId
    || (status !== 'materialized' && status !== 'projection_pending')
  ) return null

  return { workoutId: resultWorkoutId, status }
}

function parseSetDraftValue(field: 'weight' | 'reps', value: string): number {
  if (value.trim() === '') return 0

  const parsedValue = field === 'weight' ? Number.parseFloat(value) : Number.parseInt(value, 10)
  if (!Number.isFinite(parsedValue)) return 0

  return Math.max(0, parsedValue)
}

function getWorkoutEditError(exercises: WorkoutSummary['exercises']): string | null {
  if (exercises.length === 0) return 'A workout must contain at least one exercise.'
  if (exercises.some((exercise) => exercise.sets.length === 0)) {
    return 'Each exercise must contain at least one set.'
  }
  if (exercises.some((exercise) => exercise.sets.some((set) => set.reps <= 0))) {
    return 'Each set must contain at least one rep.'
  }
  return null
}

export default function WorkoutDetailPage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const units = useProfileStore((state) => state.profile?.units ?? 'kg')
  const previewWorkout = readWorkoutPreview(location.state, id)
  const [workoutResultScope, setWorkoutResultScope] = useState(() => ({
    workoutId: id,
    result: readWorkoutResult(location.state, id),
  }))
  const ownsWorkoutResult = workoutResultScope.workoutId === id
  const workoutResult = ownsWorkoutResult ? workoutResultScope.result : null
  if (!ownsWorkoutResult) {
    setWorkoutResultScope({ workoutId: id, result: readWorkoutResult(location.state, id) })
  }
  const [workoutResource, setWorkoutResource] = useState<WorkoutReadState>(() => ({
    uid: user?.uid ?? null,
    workoutId: id,
    status: 'loading',
    workout: previewWorkout,
  }))
  const [readAttempt, setReadAttempt] = useState(0)
  const ownsWorkoutResource = workoutResource.uid === (user?.uid ?? null) && workoutResource.workoutId === id
  const workout = ownsWorkoutResource ? workoutResource.workout : null
  const readStatus = ownsWorkoutResource ? workoutResource.status : 'loading'
  const {
    state: userExercisesState,
    exercises: userExercises,
    retry: retryUserExercises,
  } = useUserExercises(user?.uid ?? null)
  const [transientDeleteOperation, setTransientDeleteOperation] = useState<WorkoutDeleteOperation | null>(null)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [editedLabel, setEditedLabel] = useState('')
  const [editedExercises, setEditedExercises] = useState<WorkoutSummary['exercises']>([])
  if (!ownsWorkoutResource) {
    setWorkoutResource({ uid: user?.uid ?? null, workoutId: id, status: 'loading', workout: null })
    setIsEditing(false)
    setShowPicker(false)
    setConfirmDeleteOpen(false)
  }
  useEffect(() => {
    if (!workoutResult) return
    navigate(location.pathname, { replace: true, state: null })
  }, [location.pathname, navigate, workoutResult])
  const deleteScopeRef = useRef<object | null>(null)
  useEffect(() => {
    deleteScopeRef.current = {}
    return () => { deleteScopeRef.current = null }
  }, [user?.uid, id])
  if (transientDeleteOperation
    && (transientDeleteOperation.uid !== user?.uid || transientDeleteOperation.workoutId !== id)) {
    setTransientDeleteOperation(null)
  }
  const persistedDeleteRecovery = user?.uid ? readWorkoutDeleteRecovery(user.uid) : null
  const persistedDeleteWorkoutId = persistedDeleteRecovery?.workoutId
  const deleteOperation = (transientDeleteOperation?.uid === user?.uid ? transientDeleteOperation : null)
    ?? (
      user && persistedDeleteWorkoutId && persistedDeleteWorkoutId === id
        ? { uid: user.uid, workoutId: persistedDeleteWorkoutId, status: persistedDeleteRecovery.status ?? 'cleanup_pending' as const }
        : null
    )

  useEffect(() => {
    const uid = user?.uid
    if (!id || !uid) return
    let cancelled = false
    const isCurrent = () => !cancelled && useAuthStore.getState().user?.uid === uid

    getWorkout(id)
      .then((nextWorkout) => {
        if (!isCurrent()) return
        setWorkoutResource({ uid, workoutId: id, status: 'ready', workout: nextWorkout })
      })
      .catch(() => {
        if (!isCurrent()) return
        setWorkoutResource((current) => ({ ...current, status: 'error' }))
      })

    return () => {
      cancelled = true
    }
  }, [id, user?.uid, readAttempt])

  function retryWorkoutRead() {
    if (readStatus === 'loading') return
    setWorkoutResource((current) => ({ ...current, status: 'loading' }))
    setReadAttempt((attempt) => attempt + 1)
  }

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
      const result = await updateWorkout(workout.id, { label: nextLabel, exercises: nextExercises })
      setWorkoutResource((current) => current.uid === user?.uid && current.workoutId === id
        ? { ...current, workout: { ...workout, label: nextLabel, exercises: nextExercises } }
        : current)
      setEditedLabel(nextLabel ?? '')
      setEditedExercises(cloneExercises(nextExercises))
      setShowPicker(false)
      setIsEditing(false)
      if (result.status === 'projection_pending') {
        toast.success('Workout saved. Stats will be synced.')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[updateWorkout error]', err)
      toast.error(`Save error: ${msg}`)
    } finally {
      setSaving(false)
    }
  }

  async function runWorkoutDelete(workoutId: string) {
    if (!user) return
    const scope = deleteScopeRef.current
    const isCurrent = () => scope !== null && deleteScopeRef.current === scope
      && useAuthStore.getState().user?.uid === user.uid
    const recoveryStatus = deleteOperation?.workoutId === workoutId
      && (deleteOperation.status === 'cleanup_pending' || deleteOperation.status === 'unknown')
      ? deleteOperation.status
      : 'error'
    setTransientDeleteOperation({ uid: user.uid, workoutId, status: 'pending' })
    try {
      const result = await deleteWorkout(workoutId)
      if (!isCurrent()) return
      if (result.status !== 'deleted') {
        setTransientDeleteOperation({ uid: user.uid, workoutId, status: result.status })
        return
      }
      setTransientDeleteOperation(null)
      navigate('/history', { replace: true })
      toast.success('Workout deleted')
    } catch {
      if (!isCurrent()) return
      setTransientDeleteOperation((current) => (
        current?.workoutId === workoutId
          ? { uid: user.uid, workoutId, status: recoveryStatus }
          : current
      ))
      toast.error('Could not delete the workout.')
    }
  }

  function doDelete() {
    if (!workout || persistedDeleteRecovery || deleteOperation?.status === 'pending') return
    void runWorkoutDelete(workout.id)
  }

  function retryWorkoutDelete() {
    if (!deleteOperation || deleteOperation.status === 'pending') return
    void runWorkoutDelete(deleteOperation.workoutId)
  }

  function handleDelete() {
    if (persistedDeleteRecovery || deleteOperation?.status === 'pending') return
    setConfirmDeleteOpen(true)
  }

  function handleBack() {
    if (workoutResult) {
      navigate('/dashboard', { replace: true })
      return
    }
    if (location.key !== 'default' && window.history.length > 1) {
      navigate(-1)
      return
    }
    navigate('/history')
  }

  if (!workout && !deleteOperation && readStatus === 'loading') {
    return <LoadingState message="Loading workout..." />
  }

  if (!workout) {
    if (deleteOperation && deleteOperation.workoutId === id) {
      return (
        <div className="flex items-center justify-center">
          <div className="puls-panel rounded-[var(--radius-sm)] p-8 text-center">
            <ActionFeedback
              status={deleteOperation.status === 'pending' ? 'pending' : 'error'}
              message={deleteOperation.status === 'pending'
                ? 'Deleting workout…'
                : deleteOperation.status === 'cleanup_pending'
                  ? 'Workout deleted. Could not refresh stats.'
                  : 'Could not confirm workout deletion. Retry deletion.'}
              onRetry={deleteOperation.status !== 'pending' ? retryWorkoutDelete : undefined}
              className="workout-detail-delete-feedback"
            />
            <button onClick={handleBack} className="mt-4" style={{ color: 'var(--accent)' }}>
              Back
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="flex items-center justify-center">
        <div className="puls-panel rounded-[var(--radius-sm)] p-8 text-center">
          {readStatus === 'error' ? (
            <ActionFeedback
              status="error"
              message={workoutResult
                ? 'Workout saved, but its summary could not load.'
                : 'Could not load workout.'}
              onRetry={retryWorkoutRead}
              className="mb-4"
            />
          ) : (
            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>Workout not found.</p>
          )}
          <button onClick={handleBack} style={{ color: 'var(--accent)' }}>
            {workoutResult ? 'Back to Home' : 'Back'}
          </button>
        </div>
      </div>
    )
  }

  const displayedWorkout: WorkoutSummary = isEditing
    ? { ...workout, label: editedLabel || null, exercises: editedExercises }
    : workout
  const exerciseCatalog = new Map([...exerciseDb, ...userExercises].map((exercise) => [exercise.id, exercise]))
  const volume = calcVolume(displayedWorkout)
  const totalSets = displayedWorkout.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0)
  const totalReps = displayedWorkout.exercises.reduce((sum, exercise) => (
    sum + exercise.sets.reduce((innerSum, set) => innerSum + set.reps, 0)
  ), 0)
  const focusEntries = Object.entries(displayedWorkout.exercises.reduce<Record<string, number>>((acc, exercise) => {
    const category = exercise.exerciseId ? exerciseCatalog.get(exercise.exerciseId)?.category : null
    if (!category) return acc
    acc[category] = (acc[category] ?? 0) + 1
    return acc
  }, {})).sort((a, b) => b[1] - a[1])
  const topFocus = focusEntries[0]
  const mobileEditGrid = 'grid-cols-[1.75rem_minmax(0,1fr)_minmax(0,1fr)_1.75rem] lg:grid-cols-[1.5rem_1fr_1fr_1fr_1.25rem]'
  const isDeleting = deleteOperation?.status === 'pending'
  const isWorkoutUnavailable = isDeleting || (deleteOperation?.status === 'cleanup_pending' || deleteOperation?.status === 'unknown')
  const deleteFeedbackId = `workout-detail-delete-feedback-${workout.id}`

  const actionButtons = isEditing ? (
    <div className="workout-detail-session-actions">
      <motion.button
        onClick={handleCancelEditing}
        disabled={saving}
        className="workout-detail-action workout-detail-action-secondary disabled:opacity-40"
        whileTap={{ scale: 0.97 }}
      >
        Cancel
      </motion.button>
      <motion.button
        onClick={handleSave}
        disabled={saving}
        className="workout-detail-action workout-detail-action-primary disabled:opacity-40"
        whileTap={{ scale: 0.97 }}
      >
        {saving ? 'Saving...' : 'Save'}
      </motion.button>
    </div>
  ) : (
    <div className="workout-detail-session-actions">
      <motion.button
        onClick={handleStartEditing}
        disabled={isWorkoutUnavailable}
        className="workout-detail-action workout-detail-action-secondary"
        whileTap={{ scale: 0.97 }}
      >
        Edit workout
      </motion.button>
      <motion.button
        onClick={handleDelete}
        disabled={isWorkoutUnavailable || persistedDeleteRecovery !== null}
        aria-describedby={deleteOperation?.status === 'error' || (deleteOperation?.status === 'cleanup_pending' || deleteOperation?.status === 'unknown')
          ? deleteFeedbackId
          : undefined}
        aria-label="Delete workout"
        className="workout-detail-action workout-detail-action-delete disabled:opacity-40"
        whileTap={{ scale: 0.97 }}
      >
        {isDeleting ? 'Deleting…' : 'Delete'}
      </motion.button>
    </div>
  )

  const heroLabel = displayedWorkout.label
    ?? (topFocus ? (EXERCISE_CATEGORY_LABELS[topFocus[0]] ?? 'Workout') : 'Workout')
  return (
    <>
      <div className="workout-detail-page workout-detail-content">
        <motion.button
          onClick={handleBack}
          className="workout-detail-back"
          initial={false}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18 }}
          whileTap={{ scale: 0.97 }}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          {workoutResult ? 'Back to Home' : 'Back'}
        </motion.button>

        {workoutResult && (
          <section className="workout-result-confirmation" aria-labelledby="workout-result-title">
            <span className="workout-result-confirmation-icon" aria-hidden="true">
              <Check size={18} strokeWidth={2.5} />
            </span>
            <div>
              <h2 id="workout-result-title">Workout saved</h2>
              <p>Your completed session is ready below.</p>
            </div>
          </section>
        )}

        <header className="workout-detail-session-head">
          <div className="min-w-0">
            <p className="workout-detail-session-kicker">
              {formatDate(displayedWorkout.startedAt)}
            </p>
            <h1>{heroLabel}</h1>
          </div>
          <div className="workout-detail-desktop-actions" role="group" aria-label="Workout actions">
            {actionButtons}
          </div>
        </header>

        {readStatus !== 'ready' && !deleteOperation && (
          <ActionFeedback
            status={readStatus === 'loading' ? 'pending' : 'error'}
            message={readStatus === 'loading'
              ? 'Refreshing workout…'
              : 'Could not refresh workout. Showing the last available data.'}
            onRetry={readStatus === 'error' ? retryWorkoutRead : undefined}
            className="mb-4"
          />
        )}

        <WorkoutDetailMobileActions>
          <motion.div
            className={`workout-detail-mobile-action-panel${deleteOperation ? ' has-feedback' : ''}`}
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
          >
            {persistedDeleteRecovery && persistedDeleteRecovery.workoutId !== id && (
              <p className="mb-3 text-sm" style={{ color: 'var(--muted)' }}>
                The previous workout deletion needs to be retried.{' '}
                <button type="button" onClick={() => navigate('/dashboard')} className="underline" style={{ color: 'var(--accent)' }}>
                  Go to recovery on the dashboard
                </button>
              </p>
            )}
            {deleteOperation && (
              <ActionFeedback
                id={deleteFeedbackId}
                status={deleteOperation.status === 'pending' ? 'pending' : 'error'}
                message={deleteOperation.status === 'pending'
                  ? 'Deleting workout…'
                  : deleteOperation.status === 'cleanup_pending'
                    ? 'Workout deleted. Could not refresh stats.'
                    : deleteOperation.status === 'unknown'
                      ? 'Could not confirm workout deletion. Retry deletion.'
                      : 'Could not delete the workout.'}
                onRetry={deleteOperation.status !== 'pending'
                  ? retryWorkoutDelete
                  : undefined}
                onDismiss={deleteOperation.status === 'error'
                  ? () => setTransientDeleteOperation(null)
                  : undefined}
                className="workout-detail-delete-feedback"
              />
            )}
            <div className={deleteOperation ? 'workout-detail-mobile-action-controls mt-3' : 'workout-detail-mobile-action-controls'}>
              {actionButtons}
            </div>
          </motion.div>
        </WorkoutDetailMobileActions>

        <dl className="workout-summary-panel workout-detail-session-facts" aria-label="Workout summary">
          <div>
            <dt>Time</dt>
            <dd>{formatDuration(displayedWorkout.startedAt, displayedWorkout.finishedAt)}</dd>
          </div>
          <div>
            <dt>Sets</dt>
            <dd>{totalSets}</dd>
          </div>
          <div>
            <dt aria-label="Reps">Reps</dt>
            <dd>{totalReps}</dd>
          </div>
          <div>
            <dt>Volume</dt>
            <dd>{formatCompactVolume(volume, units)}</dd>
          </div>
        </dl>

        {!displayedWorkout.materialized && (
          <p className="workout-result-projection-status" role="status">
            Stats are still syncing.
          </p>
        )}

        {isEditing && (
          <section className="workout-detail-label-editor">
            <label htmlFor="workout-detail-label">Session type</label>
            <select
              id="workout-detail-label"
              value={editedLabel}
              onChange={(event) => setEditedLabel(event.target.value)}
            >
              <option value="">No label</option>
              {editedLabel && !WORKOUT_LABELS.some((label) => label === editedLabel) && (
                <option value={editedLabel}>{editedLabel}</option>
              )}
              {WORKOUT_LABELS.map((label) => (
                <option key={label} value={label}>{label}</option>
              ))}
            </select>
          </section>
        )}

        <div className="workout-exercise-list">
          {displayedWorkout.exercises.map((exercise, exerciseIndex) => {
            const exerciseData = exerciseCatalog.get(exercise.exerciseId ?? '') ?? exerciseMap.get(exercise.exerciseId ?? '')
            const exerciseColor = EXERCISE_CATEGORY_COLORS[exerciseData?.category ?? '']
              ?? DEFAULT_EXERCISE_CATEGORY_COLOR
            const categoryLabel = exerciseData?.category
              ? (EXERCISE_CATEGORY_LABELS[exerciseData.category] ?? exerciseData.category)
              : null
            const equipmentLabel = exerciseData?.equipment
              ? getEquipmentLabel(exerciseData.equipment).toLocaleLowerCase('en-US')
              : null
            const exerciseReps = exercise.sets.reduce((sum, set) => sum + set.reps, 0)
            const exerciseHeadingId = `workout-exercise-${exerciseIndex}`

            return (
              <motion.section
                key={`${exercise.exerciseSource ?? 'global'}-${exercise.exerciseId ?? exercise.name}-${exerciseIndex}`}
                className="workout-exercise-panel"
                style={{ '--exercise-accent': exerciseColor } as CSSProperties}
                aria-labelledby={exerciseHeadingId}
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
              >
                <header className="workout-exercise-header">
                  <div className="workout-exercise-title-row">
                    <h2 id={exerciseHeadingId}>{exercise.name}</h2>
                    <div className="workout-exercise-tools">
                      <span
                        className="workout-exercise-sequence"
                        aria-label={`Exercise ${exerciseIndex + 1} of ${displayedWorkout.exercises.length}`}
                      >
                        {exerciseIndex + 1} / {displayedWorkout.exercises.length}
                      </span>
                      {isEditing && (
                        <button
                          type="button"
                          onClick={() => handleRemoveExercise(exerciseIndex)}
                          className="workout-exercise-remove mobile-touch-target"
                          aria-label={`Remove exercise ${exercise.name}`}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>

                  {(categoryLabel || equipmentLabel) && (
                    <p className="workout-exercise-taxonomy">
                      {categoryLabel && <strong>{categoryLabel}</strong>}
                      {categoryLabel && equipmentLabel && <span aria-hidden="true"> · </span>}
                      {equipmentLabel}
                    </p>
                  )}

                  <p className="workout-exercise-totals">
                    {exercise.sets.length} {exercise.sets.length === 1 ? 'set' : 'sets'}
                    <span>{exerciseReps} reps</span>
                  </p>
                </header>

                <div className="workout-exercise-body">
                  {!isEditing ? (
                    <table className="workout-detail-set-table" aria-label={`Sets: ${exercise.name}`}>
                      <thead>
                        <tr>
                          <th scope="col">Streak</th>
                          <th scope="col">Weight {units}</th>
                          <th scope="col">Reps</th>
                          <th scope="col">Vol. {units}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {exercise.sets.map((set, setIndex) => (
                          <tr key={setIndex}>
                            <td className="workout-detail-set-index">{setIndex + 1}</td>
                            <td>{kgToDisplayWeight(set.weight, units)}</td>
                            <td>{set.reps}</td>
                            <td>{kgToDisplayWeight(set.weight * set.reps, units).toLocaleString('en-US')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="workout-detail-set-editor">
                      <div className={`workout-detail-set-editor-head grid ${mobileEditGrid} gap-1.5`}>
                        <span>#</span>
                        <span>{units}</span>
                        <span>Reps</span>
                        <span className="hidden lg:block">Vol.</span>
                        <span aria-hidden="true" />
                      </div>

                      {exercise.sets.map((set, setIndex) => (
                        <div
                          key={setIndex}
                          className={`workout-detail-set-editor-row grid ${mobileEditGrid} gap-1.5`}
                        >
                          <span className="workout-detail-set-index">{setIndex + 1}</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            step="any"
                            min="0"
                            value={set.weight === 0 ? '' : kgToDisplayWeight(set.weight, units)}
                            onChange={(event) => handleSetChange(
                              exerciseIndex,
                              setIndex,
                              'weight',
                              displayWeightStringToKg(event.target.value, units),
                            )}
                            placeholder="0"
                            aria-label={`Weight, ${exercise.name}, set ${setIndex + 1}, ${units}`}
                          />
                          <input
                            type="number"
                            inputMode="numeric"
                            step="1"
                            min="0"
                            value={set.reps === 0 ? '' : set.reps}
                            onChange={(event) => handleSetChange(exerciseIndex, setIndex, 'reps', event.target.value)}
                            placeholder="0"
                            aria-label={`Reps, ${exercise.name}, set ${setIndex + 1}`}
                          />
                          <span className="hidden lg:block">
                            {kgToDisplayWeight(set.weight * set.reps, units).toLocaleString('en-US')}
                          </span>
                          {exercise.sets.length > 1 ? (
                            <button
                              type="button"
                              onClick={() => handleRemoveSet(exerciseIndex, setIndex)}
                              className="workout-detail-remove-set mobile-touch-target"
                              aria-label={`Remove set ${setIndex + 1}`}
                            >
                              <X size={14} aria-hidden="true" />
                            </button>
                          ) : (
                            <span aria-hidden="true" />
                          )}
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={() => handleAddSet(exerciseIndex)}
                        className="workout-detail-add-set"
                      >
                        + Set
                      </button>
                    </div>
                  )}
                </div>
              </motion.section>
            )
          })}
        </div>

        {isEditing && (
          <motion.button
            type="button"
            onClick={() => setShowPicker(true)}
            className="workout-detail-add-exercise"
            whileTap={{ scale: 0.97 }}
          >
            + Add exercise
          </motion.button>
        )}
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
          title="Delete workout?"
          message={`„${heroLabel}” · ${formatDate(displayedWorkout.startedAt)}. This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => { setConfirmDeleteOpen(false); doDelete() }}
          onCancel={() => setConfirmDeleteOpen(false)}
        />
      )}
    </>
  )
}
