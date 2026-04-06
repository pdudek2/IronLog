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
  chest: '#4D8EFF', back: '#9B6DFF', legs: '#FF5757',
  arms: '#FF9F43', shoulders: '#FF6B9D', core: '#00D4AA', cardio: '#FFD700',
}
const WORKOUT_LABELS = ['Push', 'Pull', 'Nogi', 'Upper Body', 'Lower Body', 'Full Body', 'Plecy & Biceps', 'Klatka & Triceps', 'Cardio', 'Crossfit', 'Mobilność'] as const
const exerciseMap = new Map(exerciseDb.map((e) => [e.id, e]))

function workoutAccent(w: WorkoutSummary): string {
  const ex = w.exercises[0]
  if (!ex?.exerciseId) return '#808CB3'
  return CATEGORY_COLORS[exerciseMap.get(ex.exerciseId)?.category ?? ''] ?? '#808CB3'
}

function workoutCategoryLabel(w: WorkoutSummary): string {
  const cats = [...new Set(
    w.exercises.map((e) => exerciseMap.get(e.exerciseId ?? '')?.category).filter(Boolean)
  )]
  if (cats.length === 0) return 'Trening'
  if (cats.length === 1) return cats[0]!
  return 'Trening'
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('pl-PL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function formatDuration(start: number, end: number): string {
  const m = Math.round((end - start) / 60_000)
  if (m < 1) return '< 1 min'
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)}h ${m % 60}m`
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
    getWorkout(id).then((w) => { setWorkout(w); setLoading(false) })
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
    setEditedExercises((prev) => prev.map((ex, i) =>
      i === exerciseIndex
        ? { ...ex, sets: [...ex.sets, { weight: 0, reps: 0 }] }
        : ex
    ))
  }

  function handleRemoveSet(exerciseIndex: number, setIndex: number) {
    setEditedExercises((prev) => prev.map((ex, i) =>
      i === exerciseIndex
        ? { ...ex, sets: ex.sets.filter((_, si) => si !== setIndex) }
        : ex
    ))
  }

  function handleSetChange(
    exerciseIndex: number,
    setIndex: number,
    field: 'weight' | 'reps',
    value: string
  ) {
    const parsedValue = field === 'weight' ? parseFloat(value) : parseInt(value, 10)
    const numericValue = Number.isNaN(parsedValue) ? 0 : parsedValue

    setEditedExercises((current) => current.map((exercise, ei) => {
      if (ei !== exerciseIndex) return exercise
      return {
        ...exercise,
        sets: exercise.sets.map((set, si) => {
          if (si !== setIndex) return set
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
      alert('Błąd zapisu: ' + msg)
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
      alert('Błąd usuwania. Sprawdź reguły Firestore (usuń warunek finishedAt == null).')
      setDeleting(false)
    }
  }

  if (loading) return null

  if (!workout) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
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
  const totalSets = displayedWorkout.exercises.reduce((s, e) => s + e.sets.length, 0)

  return (
    <div className="min-h-screen max-w-lg mx-auto pb-10">

      {/* Header */}
      <motion.div
        className="flex items-center gap-3 px-5 pt-8 pb-6"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <button
          onClick={() => navigate('/dashboard')}
          className="p-2 rounded-xl transition-opacity hover:opacity-70"
          style={{ background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--border)' }}
        >
          <ArrowLeft size={16} />
        </button>
        <p className="text-sm font-semibold text-white">Szczegóły treningu</p>
      </motion.div>

      {/* Summary card */}
      <motion.div
        className="mx-5 mb-5 rounded-2xl overflow-hidden"
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderLeft: `4px solid ${accent}`,
        }}
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
              <div className="grid grid-cols-4 gap-2">
                {WORKOUT_LABELS.map((label) => {
                  const isActive = editedLabel === label
                  return (
                    <motion.button
                      key={label}
                      onClick={() => setEditedLabel(isActive ? '' : label)}
                      className="rounded-lg px-2 py-2 text-[11px] font-semibold leading-tight"
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
          <h2 className="text-xl font-bold text-white mb-3">
            {formatDate(displayedWorkout.startedAt)}
          </h2>
          <div className="flex gap-4">
            {[
              { label: 'Czas', value: formatDuration(displayedWorkout.startedAt, displayedWorkout.finishedAt) },
              { label: 'Serie', value: String(totalSets) },
              { label: 'Objętość', value: volume > 0 ? `${volume.toLocaleString('pl-PL')} kg` : '—' },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-lg font-bold text-white">{s.value}</p>
                <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Exercises */}
      <div className="px-5 flex flex-col gap-3">
        {displayedWorkout.exercises.map((ex, ei) => {
          const exData = exerciseMap.get(ex.exerciseId ?? '')
          const exColor = CATEGORY_COLORS[exData?.category ?? ''] ?? '#808CB3'
          return (
            <motion.div
              key={ei}
              className="rounded-2xl overflow-hidden"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + ei * 0.06, duration: 0.3 }}
            >
              <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-white">{ex.name}</p>
                <div className="flex items-center gap-2">
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: `${exColor}18`, color: exColor }}
                  >
                    {exData?.equipment ?? ''}
                  </span>
                  {isEditing && (
                    <button
                      onClick={() => handleRemoveExercise(ei)}
                      className="text-xs transition-opacity hover:opacity-70"
                      style={{ color: 'var(--muted)' }}
                    >
                      Usuń
                    </button>
                  )}
                </div>
              </div>

              {/* Sets table */}
              <div className="px-4 pb-4">
                <div className={`grid ${isEditing ? 'grid-cols-[1.5rem_1fr_1fr_1fr_1.25rem]' : 'grid-cols-[1.5rem_1fr_1fr_1fr]'} gap-2 mb-1`}>
                  {[...['#', 'kg', 'Powt.', 'Vol.'], ...(isEditing ? [''] : [])].map((h, index) => (
                    <span key={h} className="text-[10px] uppercase tracking-wide text-center" style={{ color: 'var(--muted)' }}>
                      {h || <span aria-hidden="true">{index === 4 ? ' ' : h}</span>}
                    </span>
                  ))}
                </div>
                {ex.sets.map((set, si) => (
                  <div
                    key={si}
                    className={`grid ${isEditing ? 'grid-cols-[1.5rem_1fr_1fr_1fr_1.25rem]' : 'grid-cols-[1.5rem_1fr_1fr_1fr]'} gap-2 py-1.5 text-center items-center`}
                    style={{ borderTop: '1px solid var(--border)' }}
                  >
                    <span className="text-xs font-bold" style={{ color: 'var(--teal)' }}>{si + 1}</span>
                    {isEditing ? (
                      <>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          min="0"
                          value={set.weight}
                          onChange={(e) => handleSetChange(ei, si, 'weight', e.target.value)}
                          className="rounded-lg px-2 py-2 text-center text-sm text-white outline-none"
                          style={{ background: 'var(--input-bg)', border: '1px solid var(--border)' }}
                        />
                        <input
                          type="number"
                          inputMode="numeric"
                          step="1"
                          min="0"
                          value={set.reps}
                          onChange={(e) => handleSetChange(ei, si, 'reps', e.target.value)}
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
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>
                      {(set.weight * set.reps).toLocaleString('pl-PL')}
                    </span>
                    {isEditing && (
                      ex.sets.length > 1 ? (
                        <button
                          onClick={() => handleRemoveSet(ei, si)}
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
                {isEditing && (
                  <button
                    onClick={() => handleAddSet(ei)}
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
        <div className="px-5 mt-4">
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

      {/* Delete */}
      <motion.div
        className="px-5 mt-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        {isEditing ? (
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
        )}
      </motion.div>

      {showPicker && (
        <ExercisePicker
          onSelect={handleAddExercise}
          onClose={() => setShowPicker(false)}
        />
      )}

    </div>
  )
}
