import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { useWorkoutStore } from '../store/workoutStore'
import { useAuthStore } from '../store/authStore'
import { useProfileStore } from '../store/profileStore'
import { saveWorkout } from '../lib/workoutService'
import { loadActiveSession } from '../lib/activeSessionService'
import { getUserExercises } from '../lib/userExercisesService'
import { useActiveSession } from '../hooks/useActiveSession'
import ExercisePicker from '../components/ExercisePicker'
import ConfirmDialog from '../components/ConfirmDialog'
import { LoadingState } from '../components/ui'
import type { Exercise } from '../data/exercises'

const WORKOUT_LABELS = ['Push', 'Pull', 'Nogi', 'Upper Body', 'Lower Body', 'Full Body', 'Plecy & Biceps', 'Klatka & Triceps', 'Cardio', 'Crossfit', 'Mobilność'] as const

interface LabelChipsProps {
  activeLabel: string
  onToggle: (label: string) => void
  className?: string
}

function LabelChips({ activeLabel, onToggle, className = '' }: LabelChipsProps) {
  return (
    <div className={`flex gap-1.5 overflow-x-auto no-scrollbar ${className}`}>
      {WORKOUT_LABELS.map((label) => {
        const isActive = activeLabel === label
        return (
          <motion.button
            key={label}
            onClick={() => onToggle(label)}
            className="flex-none whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-semibold"
            style={{
              backgroundColor: isActive ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
              color: isActive ? '#08061A' : 'var(--muted)',
              border: isActive ? '1px solid var(--accent)' : '1px solid var(--border)',
            }}
            whileTap={{ scale: 0.92 }}
          >
            {label}
          </motion.button>
        )
      })}
    </div>
  )
}

function formatDuration(startedAt: number): { h: string; m: string; s: string } {
  const total = Math.floor((Date.now() - startedAt) / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return {
    h: String(h).padStart(2, '0'),
    m: String(m).padStart(2, '0'),
    s: String(s).padStart(2, '0'),
  }
}

export default function WorkoutPage() {
  const { user } = useAuthStore()
  const { profile } = useProfileStore()
  const {
    active,
    startWorkout,
    hydrateFromDoc,
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

  // Must be declared before init useEffect so the subscription is active
  // before any store mutations happen during initialization.
  const { clearSession } = useActiveSession(user?.uid ?? null)

  // True when no in-memory session exists yet — avoids setState in effect body
  const [initializing, setInitializing] = useState(() => useWorkoutStore.getState().active === null)
  const [showPicker, setShowPicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const [, setTick] = useState(0)
  const [saveError, setSaveError] = useState('')
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [confirmFinishEmpty, setConfirmFinishEmpty] = useState(false)
  const [userExercises, setUserExercises] = useState<Exercise[]>([])

  // Load user's custom exercises for the picker
  useEffect(() => {
    if (!user) return
    getUserExercises(user.uid).then(setUserExercises).catch(() => {})
  }, [user])

  // Init: recover from Firestore or start a new session
  useEffect(() => {
    if (!user) return

    // Already have an in-memory session (navigated back without refreshing)
    if (useWorkoutStore.getState().active) return

    loadActiveSession(user.uid)
      .then((session) => {
        if (session) {
          hydrateFromDoc(session)
        } else {
          startWorkout()
        }
      })
      .catch(() => startWorkout())
      .finally(() => setInitializing(false))
  }, [user, hydrateFromDoc, startWorkout])

  useEffect(() => {
    const id = setInterval(() => setTick((tick) => tick + 1), 1_000)
    return () => clearInterval(id)
  }, [])

  async function doFinish() {
    if (!active || !user || saving) return
    setSaving(true)
    setSaveError('')
    try {
      await saveWorkout(user.uid, active)
      // clearWorkout() must come before clearSession() so the debounce timer
      // is cancelled synchronously before we delete the Firestore document.
      clearWorkout()
      await clearSession()
      navigate('/dashboard')
      toast.success('Trening zapisany!')
    } catch {
      setSaveError('Błąd zapisu. Spróbuj ponownie.')
      toast.error('Błąd zapisu. Spróbuj ponownie.')
      setSaving(false)
    }
  }

  function handleFinish() {
    if (!active || !user || saving) return
    const hasSets = active.exercises.some((exercise) => exercise.sets.some((set) => set.done))
    if (!hasSets) { setConfirmFinishEmpty(true); return }
    void doFinish()
  }

  function handleDiscard() {
    setConfirmDiscard(true)
  }

  async function handleConfirmDiscard() {
    clearWorkout()
    await clearSession()
    navigate('/dashboard')
  }

  if (initializing || !active) return <LoadingState message="Przygotowuję trening..." />

  const units = profile?.units ?? 'kg'

  const timerStr = (() => {
    const t = formatDuration(active.startedAt)
    return t.h !== '00' ? `${t.h}:${t.m}:${t.s}` : `${t.m}:${t.s}`
  })()

  return (
    <div className="page-shell">

      {/* ── Mobile sticky header ─────────────────── */}
      <div
        className="fixed top-0 left-0 right-0 z-40 lg:hidden flex items-center gap-2"
        style={{
          paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))',
          paddingBottom: '0.75rem',
          paddingLeft: 'max(1rem, env(safe-area-inset-left, 1rem))',
          paddingRight: 'max(1rem, env(safe-area-inset-right, 1rem))',
          background: 'rgba(8,6,26,0.9)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(128,140,179,0.12)',
        }}
      >
        <span className="text-xl font-bold tabular-nums text-white flex-none">{timerStr}</span>
        {active.label && (
          <span
            className="text-[10px] font-semibold rounded-full px-2 py-0.5 flex-none truncate max-w-[90px]"
            style={{ background: 'rgba(232,255,87,0.15)', color: 'var(--accent)', border: '1px solid rgba(232,255,87,0.25)' }}
          >
            {active.label}
          </span>
        )}
        <div className="flex-1 min-w-0" />
        <motion.button
          onClick={handleFinish}
          disabled={saving}
          className="flex-none rounded-xl px-5 py-2 text-sm font-bold"
          style={{ background: 'var(--accent)', color: '#08061A' }}
          whileTap={{ scale: 0.93 }}
        >
          {saving ? '...' : 'Zakończ'}
        </motion.button>
      </div>

      <div className="page-container desktop-app-grid pt-[4.5rem] lg:pt-0">

        {/* ── Desktop sidebar only ─────────────────── */}
        <aside className="hidden lg:block desktop-sticky space-y-4">
          <div className="surface-panel rounded-[2rem] p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] mb-4" style={{ color: 'var(--accent)' }}>
                  Aktywna sesja
                </p>

            <div
              className="rounded-2xl px-4 py-3 mb-5 flex items-center justify-between"
              style={{ background: 'rgba(232,255,87,0.06)', border: '1px solid rgba(232,255,87,0.12)' }}
            >
              <span className="text-4xl font-bold tabular-nums tracking-tight text-white">
                {timerStr}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={handleDiscard}
                  className="rounded-xl px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-70"
                  style={{ background: 'var(--card)', color: 'var(--muted)', border: '1px solid var(--border)' }}
                >
                  Anuluj
                </button>
                <button
                  onClick={handleFinish}
                  disabled={saving}
                  className="rounded-xl px-3 py-1.5 text-xs font-semibold disabled:opacity-50 hover:opacity-90"
                  style={{ background: 'var(--accent)', color: '#08061A' }}
                >
                  {saving ? '...' : 'Zakończ'}
                </button>
              </div>
            </div>

            {saveError && <p className="mb-4 text-xs" style={{ color: '#FF4B4B' }}>{saveError}</p>}

            <div>
              <p className="mb-3 text-[10px] uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
                Rodzaj treningu
              </p>
              <LabelChips
                activeLabel={active.label ?? ''}
                onToggle={(label) => setLabel(active.label === label ? '' : label)}
                className="flex-wrap"
              />
            </div>

            <div className="mt-5">
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
        </aside>

        <main className="min-w-0 pb-28 lg:pb-0">
          {/* Mobile label chips */}
          <div className="lg:hidden mb-4">
            <LabelChips
              activeLabel={active.label ?? ''}
              onToggle={(label) => setLabel(active.label === label ? '' : label)}
            />
          </div>

          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
                Ćwiczenia
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
                  <div className="mb-4 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>{exercise.name}</p>
                    <button
                      onClick={() => removeExercise(exerciseIndex)}
                      className="flex-none text-xs transition-opacity hover:opacity-70"
                      style={{ color: 'var(--muted)' }}
                    >
                      Usuń
                    </button>
                  </div>

                  <div className="grid grid-cols-[1.75rem_minmax(0,1fr)_minmax(0,1fr)_1.75rem] gap-1.5 mb-1">
                    <span className="text-xs text-center" style={{ color: 'var(--muted)' }}>#</span>
                    <span className="text-xs text-center" style={{ color: 'var(--muted)' }}>{units}</span>
                    <span className="text-xs text-center" style={{ color: 'var(--muted)' }}>Powt.</span>
                    <span />
                  </div>

                  {exercise.sets.map((set, setIndex) => (
                    <div key={setIndex} className="grid grid-cols-[1.75rem_minmax(0,1fr)_minmax(0,1fr)_1.75rem] gap-1.5 mb-2 items-center">
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
          onSelect={(id, name, source) => {
            addExercise(id, name, source)
            setShowPicker(false)
          }}
          onClose={() => setShowPicker(false)}
          userExercises={userExercises}
        />
      )}

      {confirmDiscard && (
        <ConfirmDialog
          message="Anulować trening? Wszystkie dane sesji zostaną utracone."
          confirmLabel="Anuluj trening"
          danger
          onConfirm={() => { setConfirmDiscard(false); void handleConfirmDiscard() }}
          onCancel={() => setConfirmDiscard(false)}
        />
      )}

      {confirmFinishEmpty && (
        <ConfirmDialog
          message="Nie zaznaczono żadnych serii jako wykonanych. Zakończyć i zapisać trening?"
          confirmLabel="Zapisz"
          onConfirm={() => { setConfirmFinishEmpty(false); void doFinish() }}
          onCancel={() => setConfirmFinishEmpty(false)}
        />
      )}
    </div>
  )
}
