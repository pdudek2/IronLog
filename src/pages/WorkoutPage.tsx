import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useWorkoutStore } from '../store/workoutStore'
import { useAuthStore } from '../store/authStore'
import { useProfileStore } from '../store/profileStore'
import { saveWorkout } from '../lib/workoutService'
import ExercisePicker from '../components/ExercisePicker'

const WORKOUT_LABELS = ['Push', 'Pull', 'Nogi', 'Upper Body', 'Lower Body', 'Full Body', 'Plecy & Biceps', 'Klatka & Triceps', 'Cardio', 'Crossfit', 'Mobilność'] as const

function formatDuration(startedAt: number): string {
  const seconds = Math.floor((Date.now() - startedAt) / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  return `${minutes}m`
}

export default function WorkoutPage() {
  const { user } = useAuthStore()
  const { profile } = useProfileStore()
  const {
    active,
    startWorkout,
    setLabel,
    addExercise,
    addSet,
    removeSet,
    updateSet,
    toggleSetDone,
    removeExercise,
    clearWorkout,
  } = useWorkoutStore()
  const navigate = useNavigate()

  const [showPicker, setShowPicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const [, setTick] = useState(0)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    if (!active) startWorkout()
  }, [active, startWorkout])

  useEffect(() => {
    const id = setInterval(() => setTick((tick) => tick + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  async function handleFinish() {
    if (!active || !user || saving) return
    const hasSets = active.exercises.some((exercise) => exercise.sets.some((set) => set.done))
    if (!hasSets && !confirm('Nie zaznaczono żadnych serii. Zakończyć trening?')) return

    setSaving(true)
    setSaveError('')

    try {
      await saveWorkout(user.uid, active)
      clearWorkout()
      navigate('/dashboard')
    } catch {
      setSaveError('Błąd zapisu. Spróbuj ponownie.')
      setSaving(false)
    }
  }

  function handleDiscard() {
    if (!confirm('Anulować trening? Dane zostaną utracone.')) return
    clearWorkout()
    navigate('/dashboard')
  }

  if (!active) return null

  const units = profile?.units ?? 'kg'

  return (
    <div className="page-shell">
      <div className="page-container desktop-app-grid">
        <aside className="desktop-sticky space-y-4">
          <div className="surface-panel rounded-[2rem] p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em]" style={{ color: 'var(--accent)' }}>
                  Active Session
                </p>
                <p className="mt-2 text-2xl font-bold text-white">Aktywny trening</p>
                <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
                  {formatDuration(active.startedAt)}
                </p>
              </div>

              <div className="hidden gap-2 lg:flex">
                <button
                  onClick={handleDiscard}
                  className="rounded-xl px-3 py-2 text-xs font-semibold transition-opacity hover:opacity-70"
                  style={{ background: 'var(--card)', color: 'var(--muted)', border: '1px solid var(--border)' }}
                >
                  Anuluj
                </button>
                <button
                  onClick={handleFinish}
                  disabled={saving}
                  className="rounded-xl px-3 py-2 text-xs font-semibold transition-opacity disabled:opacity-50 hover:opacity-90"
                  style={{ background: 'var(--accent)', color: '#08061A' }}
                >
                  {saving ? 'Zapisywanie...' : 'Zakończ'}
                </button>
              </div>
            </div>

            {saveError && (
              <p className="mb-4 text-xs" style={{ color: '#FF4B4B' }}>{saveError}</p>
            )}

            <div>
              <p className="mb-3 text-[10px] uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
                Rodzaj treningu
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
                {WORKOUT_LABELS.map((label) => {
                  const isActive = active.label === label
                  return (
                    <motion.button
                      key={label}
                      onClick={() => setLabel(isActive ? '' : label)}
                      className="text-xs font-semibold rounded-xl py-2.5 w-full"
                      style={{
                        backgroundColor: isActive ? 'var(--accent)' : 'var(--card)',
                        color: isActive ? '#08061A' : 'var(--muted)',
                        border: isActive ? '1px solid var(--accent)' : '1px solid var(--border)',
                      }}
                      whileTap={{ scale: 0.92 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                    >
                      {label}
                    </motion.button>
                  )
                })}
              </div>
            </div>

            <div className="mt-5 hidden lg:block">
              <motion.button
                onClick={() => setShowPicker(true)}
                className="w-full rounded-[1.4rem] py-3.5 text-sm font-semibold tracking-wide"
                style={{ background: 'var(--accent)', color: '#08061A' }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
              >
                + Dodaj ćwiczenie
              </motion.button>
            </div>
          </div>

          <div className="surface-panel rounded-[2rem] p-5 lg:hidden">
            <div className="flex gap-2">
              <button
                onClick={handleDiscard}
                className="flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition-opacity hover:opacity-70"
                style={{ background: 'var(--card)', color: 'var(--muted)', border: '1px solid var(--border)' }}
              >
                Anuluj
              </button>
              <button
                onClick={handleFinish}
                disabled={saving}
                className="flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition-opacity disabled:opacity-50 hover:opacity-90"
                style={{ background: 'var(--accent)', color: '#08061A' }}
              >
                {saving ? 'Zapisywanie...' : 'Zakończ'}
              </button>
            </div>
          </div>
        </aside>

        <main className="min-w-0 pb-28 lg:pb-0">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
                Exercises
              </p>
              <h2 className="mt-2 text-2xl font-bold text-white">Bieżąca rozpiska</h2>
            </div>
            <p className="hidden text-sm lg:block" style={{ color: 'var(--muted)' }}>
              Wpisuj sety na bieżąco, a gotowe serie oznaczaj przyciskiem po lewej.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            {active.exercises.length === 0 && (
              <div className="surface-panel rounded-[2rem] px-6 py-10 text-center">
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  Dodaj pierwsze ćwiczenie, żeby rozpocząć sesję.
                </p>
              </div>
            )}

            <AnimatePresence>
              {active.exercises.map((exercise, exerciseIndex) => (
                <motion.div
                  key={exerciseIndex}
                  className="surface-panel rounded-[2rem] p-4 sm:p-5"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                >
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>{exercise.name}</p>
                      <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                        Uzupełniaj ciężar i powtórzenia, potem oznacz set jako wykonany.
                      </p>
                    </div>
                    <button
                      onClick={() => removeExercise(exerciseIndex)}
                      className="text-xs transition-opacity hover:opacity-70"
                      style={{ color: 'var(--muted)' }}
                    >
                      Usuń
                    </button>
                  </div>

                  <div className="grid grid-cols-[1.75rem_1fr_1fr_1.75rem] gap-1.5 mb-1">
                    <span className="text-xs text-center" style={{ color: 'var(--muted)' }}>#</span>
                    <span className="text-xs text-center" style={{ color: 'var(--muted)' }}>{units}</span>
                    <span className="text-xs text-center" style={{ color: 'var(--muted)' }}>Powt.</span>
                    <span />
                  </div>

                  {exercise.sets.map((set, setIndex) => (
                    <div key={setIndex} className="grid grid-cols-[1.75rem_1fr_1fr_1.75rem] gap-1.5 mb-2 items-center">
                      <motion.button
                        onClick={() => toggleSetDone(exerciseIndex, setIndex)}
                        className="w-7 h-7 rounded-md text-xs font-bold"
                        style={{
                          background: set.done ? 'var(--teal)' : 'var(--input-bg)',
                          color: set.done ? '#08061A' : 'var(--muted)',
                          border: `1px solid ${set.done ? 'var(--teal)' : 'var(--border)'}`,
                        }}
                        whileTap={{ scale: 0.85 }}
                        animate={set.done ? { scale: [1, 1.18, 1] } : { scale: 1 }}
                        transition={{ duration: 0.25 }}
                      >
                        {setIndex + 1}
                      </motion.button>
                      <input
                        type="number"
                        inputMode="decimal"
                        placeholder="0"
                        value={set.weight}
                        onChange={(e) => updateSet(exerciseIndex, setIndex, 'weight', e.target.value)}
                        className="px-2 py-2 rounded-lg text-sm text-center text-white outline-none"
                        style={{ background: 'var(--input-bg)', border: '1px solid var(--border)' }}
                      />
                      <input
                        type="number"
                        inputMode="numeric"
                        placeholder="0"
                        value={set.reps}
                        onChange={(e) => updateSet(exerciseIndex, setIndex, 'reps', e.target.value)}
                        className="px-2 py-2 rounded-lg text-sm text-center text-white outline-none"
                        style={{ background: 'var(--input-bg)', border: '1px solid var(--border)' }}
                      />
                      <button
                        onClick={() => removeSet(exerciseIndex, setIndex)}
                        className="text-xs text-center transition-opacity hover:opacity-70"
                        style={{ color: 'var(--muted)' }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}

                  <button
                    onClick={() => addSet(exerciseIndex)}
                    className="mt-2 w-full py-2.5 rounded-xl text-xs transition-opacity hover:opacity-70"
                    style={{ background: 'var(--input-bg)', color: 'var(--muted)', border: '1px solid var(--border)' }}
                  >
                    + Dodaj serię
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </main>
      </div>

      <div
        className="fixed bottom-0 left-0 right-0 flex justify-center px-4 lg:hidden"
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <motion.button
          onClick={() => setShowPicker(true)}
          className="w-full max-w-sm py-3.5 rounded-2xl font-semibold text-sm tracking-wide"
          style={{ background: 'var(--accent)', color: '#08061A' }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
        >
          + Dodaj ćwiczenie
        </motion.button>
      </div>

      {showPicker && (
        <ExercisePicker
          onSelect={(id, name) => {
            addExercise(id, name)
            setShowPicker(false)
          }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  )
}
