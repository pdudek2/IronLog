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
  const s = Math.floor((Date.now() - startedAt) / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m`
  return `${m}m`
}

export default function WorkoutPage() {
  const { user } = useAuthStore()
  const { profile } = useProfileStore()
  const { active, startWorkout, setLabel, addExercise, addSet, removeSet, updateSet, toggleSetDone, removeExercise, clearWorkout } = useWorkoutStore()
  const navigate = useNavigate()

  const [showPicker, setShowPicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!active) startWorkout()
  }, [])

  // Clock tick every 30s to update duration display
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  const [saveError, setSaveError] = useState('')

  async function handleFinish() {
    if (!active || !user || saving) return
    const hasSets = active.exercises.some((ex) => ex.sets.some((s) => s.done))
    if (!hasSets) {
      if (!confirm('Nie zaznaczono żadnych serii. Zakończyć trening?')) return
    }
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

  const units = profile?.units ?? 'kg'

  if (!active) return null

  return (
    <div className="min-h-screen pb-32 max-w-lg mx-auto">
      {/* Header */}
      <div
        className="sticky top-0 z-10 flex items-center justify-between px-4 py-3"
        style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}
      >
        <div>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            {formatDuration(active.startedAt)}
          </p>
          <p className="text-sm font-semibold text-white">Aktywny trening</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleDiscard}
            className="px-3 py-1.5 rounded-lg text-xs transition-opacity hover:opacity-70"
            style={{ background: 'var(--card)', color: 'var(--muted)', border: '1px solid var(--border)' }}
          >
            Anuluj
          </button>
          <button
            onClick={handleFinish}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity disabled:opacity-50 hover:opacity-90"
            style={{ background: 'var(--accent)', color: '#08061A' }}
          >
            {saving ? 'Zapisywanie...' : 'Zakończ'}
          </button>
        </div>
      </div>
      {saveError && (
        <p className="text-xs text-center py-2" style={{ color: '#FF4B4B' }}>{saveError}</p>
      )}

      {/* Workout label picker */}
      <div className="px-4 pt-4">
        <p className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>
          RODZAJ TRENINGU
        </p>
        <div className="grid grid-cols-4 gap-2">
          {WORKOUT_LABELS.map((label) => {
            const isActive = active.label === label
            return (
              <motion.button
                key={label}
                onClick={() => setLabel(isActive ? '' : label)}
                className="text-xs font-semibold rounded-lg py-2 w-full"
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

      {/* Exercise list */}
      <div className="px-4 py-4 flex flex-col gap-4">
        {active.exercises.length === 0 && (
          <p className="text-center py-8 text-sm" style={{ color: 'var(--muted)' }}>
            Dodaj pierwsze ćwiczenie
          </p>
        )}

        <AnimatePresence>
        {active.exercises.map((ex, ei) => (
          <motion.div
            key={ei}
            className="rounded-2xl p-4"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            {/* Exercise header */}
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>{ex.name}</p>
              <button
                onClick={() => removeExercise(ei)}
                className="text-xs transition-opacity hover:opacity-70"
                style={{ color: 'var(--muted)' }}
              >
                Usuń
              </button>
            </div>

            {/* Sets header */}
            <div className="grid grid-cols-[1.75rem_1fr_1fr_1.75rem] gap-1.5 mb-1">
              <span className="text-xs text-center" style={{ color: 'var(--muted)' }}>#</span>
              <span className="text-xs text-center" style={{ color: 'var(--muted)' }}>{units}</span>
              <span className="text-xs text-center" style={{ color: 'var(--muted)' }}>Powt.</span>
              <span />
            </div>

            {/* Sets */}
            {ex.sets.map((st, si) => (
              <div key={si} className="grid grid-cols-[1.75rem_1fr_1fr_1.75rem] gap-1.5 mb-2 items-center">
                <motion.button
                  onClick={() => toggleSetDone(ei, si)}
                  className="w-7 h-7 rounded-md text-xs font-bold"
                  style={{
                    background: st.done ? 'var(--teal)' : 'var(--input-bg)',
                    color: st.done ? '#08061A' : 'var(--muted)',
                    border: `1px solid ${st.done ? 'var(--teal)' : 'var(--border)'}`,
                  }}
                  whileTap={{ scale: 0.85 }}
                  animate={st.done ? { scale: [1, 1.18, 1] } : { scale: 1 }}
                  transition={{ duration: 0.25 }}
                >
                  {si + 1}
                </motion.button>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="0"
                  value={st.weight}
                  onChange={(e) => updateSet(ei, si, 'weight', e.target.value)}
                  className="px-2 py-2 rounded-lg text-sm text-center text-white outline-none"
                  style={{ background: 'var(--input-bg)', border: '1px solid var(--border)' }}
                />
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="0"
                  value={st.reps}
                  onChange={(e) => updateSet(ei, si, 'reps', e.target.value)}
                  className="px-2 py-2 rounded-lg text-sm text-center text-white outline-none"
                  style={{ background: 'var(--input-bg)', border: '1px solid var(--border)' }}
                />
                <button
                  onClick={() => removeSet(ei, si)}
                  className="text-xs text-center transition-opacity hover:opacity-70"
                  style={{ color: 'var(--muted)' }}
                >
                  ✕
                </button>
              </div>
            ))}

            <button
              onClick={() => addSet(ei)}
              className="mt-1 w-full py-2 rounded-lg text-xs transition-opacity hover:opacity-70"
              style={{ background: 'var(--input-bg)', color: 'var(--muted)', border: '1px solid var(--border)' }}
            >
              + Dodaj serię
            </button>
          </motion.div>
        ))}
        </AnimatePresence>
      </div>

      {/* Add exercise FAB */}
      <div
        className="fixed bottom-0 left-0 right-0 flex justify-center px-4"
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
