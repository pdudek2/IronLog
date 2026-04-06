import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Trash2 } from 'lucide-react'
import {
  getWorkout,
  deleteWorkout,
  updateWorkout,
  calcVolume,
  type WorkoutSummary,
} from '../lib/workoutService'
import { exercises as exerciseDb } from '../data/exercises'
import ExercisePicker from '../components/ExercisePicker'

const CATEGORY_COLORS: Record<string, string> = {
  chest: '#4D8EFF',
  back: '#9B6DFF',
  legs: '#FF5757',
  arms: '#FF9F43',
  shoulders: '#FF6B9D',
  core: '#00D4AA',
  cardio: '#FFD700',
}

const WORKOUT_LABELS = ['Push', 'Pull', 'Nogi', 'Upper Body', 'Lower Body', 'Full Body', 'Plecy & Biceps', 'Klatka & Triceps', 'Cardio', 'Crossfit', 'Mobilność'] as const
const exerciseMap = new Map(exerciseDb.map((exercise) => [exercise.id, exercise]))

function workoutAccent(workout: WorkoutSummary): string {
  const firstExercise = workout.exercises[0]
  if (!firstExercise?.exerciseId) return '#808CB3'
  return CATEGORY_COLORS[exerciseMap.get(firstExercise.exerciseId)?.category ?? ''] ?? '#808CB3'
}

function workoutCategoryLabel(workout: WorkoutSummary): string {
  const categories = [...new Set(
    workout.exercises.map((exercise) => exerciseMap.get(exercise.exerciseId ?? '')?.category).filter(Boolean)
  )]
  if (categories.length === 0) return 'Trening'
  if (categories.length === 1) return categories[0]!
  return 'Trening'
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
  const minutes = Math.round((end - start) / 60_000)
  if (minutes < 1) return '< 1 min'
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

function cloneExercises(exercises: WorkoutSummary['exercises']): WorkoutSummary['exercises'] {
  return exercises.map((exercise) => ({
    ...(exercise.exerciseId !== undefined && { exerciseId: exercise.exerciseId }),
    name: exercise.name,
    sets: exercise.sets.map((set) => ({ weight: set.weight, reps: set.reps })),
  }))
}

export default function WorkoutDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [workout, setWorkout] = useState<WorkoutSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [editedLabel, setEditedLabel] = useState('')
  const [editedExercises, setEditedExercises] = useState<WorkoutSummary['exercises']>([])

  useEffect(() => {
    if (!id) return
    getWorkout(id).then((nextWorkout) => {
      setWorkout(nextWorkout)
      setLoading(false)
    })
  }, [id])

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

  function handleAddExercise(exerciseId: string, name: string) {
    setEditedExercises((prev) => [
      ...prev,
      {
        ...(exerciseId !== undefined && { exerciseId }),
        name,
        sets: [{ weight: 0, reps: 0 }],
      },
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
    const parsedValue = field === 'weight' ? parseFloat(value) : parseInt(value, 10)
    const numericValue = Number.isNaN(parsedValue) ? 0 : parsedValue

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
      alert(`Błąd zapisu: ${msg}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!workout || !confirm('Usunąć ten trening? Tej operacji nie można cofnąć.')) return
    setDeleting(true)
    try {
      await deleteWorkout(workout.id)
      navigate('/dashboard')
    } catch {
      alert('Błąd usuwania. Spróbuj ponownie.')
      setDeleting(false)
    }
  }

  if (loading) return null

  if (!workout) {
    return (
      <div className="page-shell flex items-center justify-center">
        <div className="surface-panel rounded-[2rem] p-8 text-center">
          <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>Trening nie istnieje.</p>
          <button onClick={() => navigate('/dashboard')} style={{ color: 'var(--accent)' }}>
            Wróć
          </button>
        </div>
      </div>
    )
  }

  const displayedWorkout: WorkoutSummary = isEditing
    ? { ...workout, label: editedLabel || null, exercises: editedExercises }
    : workout
  const accent = workoutAccent(displayedWorkout)
  const volume = calcVolume(displayedWorkout)
  const totalSets = displayedWorkout.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0)

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
          background: 'var(--accent)',
          border: '1px solid var(--accent)',
          color: '#08061A',
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
        disabled={deleting}
        className="flex-1 py-3 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
        style={{
          background: 'rgba(255,87,87,0.08)',
          border: '1px solid rgba(255,87,87,0.2)',
          color: '#FF5757',
        }}
        whileTap={{ scale: 0.97 }}
      >
        <Trash2 size={15} />
        {deleting ? 'Usuwanie...' : 'Usuń trening'}
      </motion.button>
    </div>
  )

  return (
    <div className="page-shell">
      <div className="page-container">
        <motion.div
          className="mb-6 flex items-center gap-3"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <button
            onClick={() => navigate('/dashboard')}
            className="surface-panel p-2 rounded-xl transition-opacity hover:opacity-70"
            style={{ color: 'var(--text)' }}
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
              Workout detail
            </p>
            <p className="mt-1 text-sm font-semibold text-white">Szczegóły treningu</p>
          </div>
        </motion.div>

        <div className="desktop-app-grid">
          <aside className="desktop-sticky space-y-4">
            <motion.div
              className="surface-panel rounded-[2rem] overflow-hidden"
              style={{ borderLeft: `4px solid ${accent}` }}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05, duration: 0.35 }}
            >
              <div className="p-5">
                {isEditing ? (
                  <div className="mb-4">
                    <p className="text-[10px] uppercase tracking-widest mb-3" style={{ color: accent }}>
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
                              background: isActive ? 'var(--accent)' : 'var(--input-bg)',
                              color: isActive ? '#08061A' : 'white',
                              border: isActive ? '1px solid var(--accent)' : '1px solid var(--border)',
                            }}
                            whileTap={{ scale: 0.97 }}
                          >
                            {label}
                          </motion.button>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs uppercase tracking-widest mb-1" style={{ color: accent }}>
                    {displayedWorkout.label ?? workoutCategoryLabel(displayedWorkout)}
                  </p>
                )}

                <h2 className="text-2xl font-bold text-white mb-4">
                  {formatDate(displayedWorkout.startedAt)}
                </h2>

                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Czas', value: formatDuration(displayedWorkout.startedAt, displayedWorkout.finishedAt) },
                    { label: 'Serie', value: String(totalSets) },
                    { label: 'Objętość', value: volume > 0 ? `${volume.toLocaleString('pl-PL')} kg` : '—' },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <p className="text-lg font-bold text-white">{stat.value}</p>
                      <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                        {stat.label}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>

            <motion.div
              className="surface-panel rounded-[2rem] p-5 hidden lg:block"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              {actionButtons}
            </motion.div>
          </aside>

          <main className="min-w-0">
            <div className="mb-4">
              <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
                Logged exercises
              </p>
              <h3 className="mt-2 text-2xl font-bold text-white">Rozpiska sesji</h3>
            </div>

            <div className="flex flex-col gap-3">
              {displayedWorkout.exercises.map((exercise, exerciseIndex) => {
                const exerciseData = exerciseMap.get(exercise.exerciseId ?? '')
                const exerciseColor = CATEGORY_COLORS[exerciseData?.category ?? ''] ?? '#808CB3'

                return (
                  <motion.div
                    key={exerciseIndex}
                    className="surface-panel rounded-[1.75rem] overflow-hidden"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + exerciseIndex * 0.06, duration: 0.3 }}
                  >
                    <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold text-white">{exercise.name}</p>
                      <div className="flex items-center gap-2">
                        <span
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: `${exerciseColor}18`, color: exerciseColor }}
                        >
                          {exerciseData?.equipment ?? ''}
                        </span>
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

                    <div className="px-4 pb-4">
                      <div className={`grid ${isEditing ? 'grid-cols-[1.5rem_1fr_1fr_1.25rem] lg:grid-cols-[1.5rem_1fr_1fr_1fr_1.25rem]' : 'grid-cols-[1.5rem_1fr_1fr] lg:grid-cols-[1.5rem_1fr_1fr_1fr]'} gap-2 mb-1`}>
                        {[...['#', 'kg', 'Powt.', 'Vol.'], ...(isEditing ? [''] : [])].map((heading, index) => (
                          <span key={`${heading}-${index}`} className="text-[10px] uppercase tracking-wide text-center" style={{ color: 'var(--muted)' }}>
                            {heading === 'Vol.' ? <span className="hidden lg:inline">{heading}</span> : heading || <span aria-hidden="true">{index === 4 ? ' ' : heading}</span>}
                          </span>
                        ))}
                      </div>

                      {exercise.sets.map((set, setIndex) => (
                        <div
                          key={setIndex}
                          className={`grid ${isEditing ? 'grid-cols-[1.5rem_1fr_1fr_1.25rem] lg:grid-cols-[1.5rem_1fr_1fr_1fr_1.25rem]' : 'grid-cols-[1.5rem_1fr_1fr] lg:grid-cols-[1.5rem_1fr_1fr_1fr]'} gap-2 py-1.5 text-center items-center`}
                          style={{ borderTop: '1px solid var(--border)' }}
                        >
                          <span className="text-xs font-bold" style={{ color: 'var(--teal)' }}>{setIndex + 1}</span>
                          {isEditing ? (
                            <>
                              <input
                                type="number"
                                inputMode="decimal"
                                step="any"
                                min="0"
                                value={set.weight}
                                onChange={(e) => handleSetChange(exerciseIndex, setIndex, 'weight', e.target.value)}
                                className="rounded-lg px-2 py-2 text-center text-sm text-white outline-none"
                                style={{ background: 'var(--input-bg)', border: '1px solid var(--border)' }}
                              />
                              <input
                                type="number"
                                inputMode="numeric"
                                step="1"
                                min="0"
                                value={set.reps}
                                onChange={(e) => handleSetChange(exerciseIndex, setIndex, 'reps', e.target.value)}
                                className="rounded-lg px-2 py-2 text-center text-sm text-white outline-none"
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
                                className="text-xs text-center transition-opacity hover:opacity-70"
                                style={{ color: 'var(--muted)' }}
                              >
                                ✕
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

            <div className="mt-8 lg:hidden">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                {actionButtons}
              </motion.div>
            </div>
          </main>
        </div>
      </div>

      {showPicker && (
        <ExercisePicker
          onSelect={handleAddExercise}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  )
}
