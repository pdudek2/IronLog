import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { useWorkoutStore } from '../store/workoutStore'
import { useAuthStore } from '../store/authStore'
import { useProfileStore } from '../store/profileStore'
import { saveWorkout } from '../lib/workoutService'
import { getUserExercises } from '../lib/userExercisesService'
import { useActiveSession } from '../hooks/useActiveSession'
import AppShell from '../components/AppShell'
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
              backgroundColor: isActive ? 'var(--accent-soft)' : 'rgba(255,255,255,0.06)',
              color: isActive ? 'var(--text-strong)' : 'var(--muted)',
              border: isActive ? '1px solid var(--accent-soft-strong)' : '1px solid var(--border)',
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

  const { clearSession, ready } = useActiveSession(user?.uid ?? null)
  const [showPicker, setShowPicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const [closingSession, setClosingSession] = useState(false)
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

  useEffect(() => {
    const id = setInterval(() => setTick((tick) => tick + 1), 1_000)
    return () => clearInterval(id)
  }, [])

  async function doFinish() {
    if (!active || !user || saving || closingSession) return
    setSaving(true)
    setClosingSession(true)
    setSaveError('')
    try {
      await saveWorkout(user.uid, active)
      // clearWorkout() must come before clearSession() so the debounce timer
      // is cancelled synchronously before we delete the Firestore document.
      clearWorkout()
      try {
        await clearSession()
      } catch (error) {
        console.error('[clearSession after finish error]', error)
        toast.error('Trening zapisany, ale aktywna sesja nie została jeszcze usunięta z chmury.')
      }
      navigate('/dashboard', { replace: true })
      toast.success('Trening zapisany!')
    } catch {
      setSaveError('Błąd zapisu. Spróbuj ponownie.')
      toast.error('Błąd zapisu. Spróbuj ponownie.')
      setClosingSession(false)
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
    if (closingSession) return
    setClosingSession(true)
    clearWorkout()
    try {
      await clearSession()
    } catch (error) {
      console.error('[clearSession after discard error]', error)
      toast.error('Nie udało się od razu usunąć sesji w chmurze, ale wróciłem do dashboardu.')
    }
    navigate('/dashboard', { replace: true })
  }

  if (!ready || closingSession) {
    return <LoadingState message={closingSession ? 'Zamykam sesję...' : 'Przygotowuję trening...'} />
  }

  if (!active) {
    return (
      <AppShell bottomNav={false}>
        <div style={{ maxWidth: '32rem' }}>
          <div className="surface-panel rounded-[var(--radius-xl)] px-6 py-10 text-center">
            <p className="mb-2 text-sm font-semibold text-white">Nie ma aktywnej sesji</p>
            <p className="mb-6 text-sm" style={{ color: 'var(--muted)' }}>
              Poprzednia sesja mogła zostać zakończona albo usunięta na innym urządzeniu.
            </p>
            <motion.button
              onClick={startWorkout}
              className="rounded-2xl px-6 py-3 text-sm font-semibold"
              style={{ background: 'linear-gradient(180deg, var(--accent) 0%, #3f8ff4 100%)', color: 'var(--accent-foreground)' }}
              whileTap={{ scale: 0.97 }}
            >
              Rozpocznij nową sesję
            </motion.button>
          </div>
        </div>
      </AppShell>
    )
  }

  const units = profile?.units ?? 'kg'

  const timerStr = (() => {
    const t = formatDuration(active.startedAt)
    return t.h !== '00' ? `${t.h}:${t.m}:${t.s}` : `${t.m}:${t.s}`
  })()

  return (
    <AppShell bottomNav={false}>

      {/* ── Mobile sticky header ─────────────────── */}
      <div
        className="fixed top-0 left-0 right-0 z-40 lg:hidden flex items-center gap-2"
        style={{
          paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))',
          paddingBottom: '0.75rem',
          paddingLeft: 'max(1rem, env(safe-area-inset-left, 1rem))',
          paddingRight: 'max(1rem, env(safe-area-inset-right, 1rem))',
          background: 'rgba(10, 14, 22, 0.9)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span className="text-xl font-bold tabular-nums text-white flex-none">{timerStr}</span>
        {active.label && (
          <span
            className="text-[10px] font-semibold rounded-full px-2 py-0.5 flex-none truncate max-w-[90px]"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent-soft-strong)' }}
          >
            {active.label}
          </span>
        )}
        <div className="flex-1 min-w-0" />
        <motion.button
          onClick={handleFinish}
          disabled={saving}
          className="flex-none rounded-xl px-5 py-2 text-sm font-bold"
          style={{ background: 'linear-gradient(180deg, var(--accent) 0%, #3f8ff4 100%)', color: 'var(--accent-foreground)' }}
          whileTap={{ scale: 0.93 }}
        >
          {saving ? '...' : 'Zakończ'}
        </motion.button>
      </div>

      <div className="desktop-app-grid pt-[4.5rem] lg:pt-0">

        {/* ── Desktop sidebar only ─────────────────── */}
        <aside className="hidden lg:block desktop-sticky space-y-4">
          <div className="surface-panel rounded-[var(--radius-xl)] p-5">
                <p className="eyebrow mb-4" style={{ color: 'var(--accent)' }}>
                  Aktywna sesja
                </p>

            <div
              className="rounded-2xl px-4 py-3 mb-5 flex items-center justify-between"
              style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-soft-strong)' }}
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
                  style={{ background: 'linear-gradient(180deg, var(--accent) 0%, #3f8ff4 100%)', color: 'var(--accent-foreground)' }}
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
                className="w-full rounded-[var(--radius-lg)] py-3.5 text-sm font-semibold tracking-wide"
                style={{ background: 'linear-gradient(180deg, var(--accent) 0%, #3f8ff4 100%)', color: 'var(--accent-foreground)' }}
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
              <div className="surface-panel rounded-[var(--radius-xl)] px-6 py-10 text-center">
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  Dodaj pierwsze ćwiczenie, żeby rozpocząć sesję.
                </p>
              </div>
            )}

            <AnimatePresence>
              {active.exercises.map((exercise, exerciseIndex) => (
                <motion.div
                  key={exerciseIndex}
                  className="surface-panel rounded-[var(--radius-xl)] p-4 sm:p-5"
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
                          background: set.done ? 'var(--success)' : 'var(--input-bg)',
                          color: set.done ? '#081813' : 'var(--muted)',
                          border: `1px solid ${set.done ? 'var(--success)' : 'var(--border)'}`,
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
                        className={`px-2 py-2 rounded-[var(--radius-sm)] text-sm text-center text-white outline-none ${set.done ? 'line-through opacity-55' : ''}`}
                        style={{ background: 'var(--input-bg)', border: '1px solid var(--border)' }}
                      />
                      <input
                        type="number"
                        inputMode="numeric"
                        placeholder="0"
                        value={set.reps}
                        onChange={(e) => updateSet(exerciseIndex, setIndex, 'reps', e.target.value)}
                        className={`px-2 py-2 rounded-[var(--radius-sm)] text-sm text-center text-white outline-none ${set.done ? 'line-through opacity-55' : ''}`}
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
          style={{ background: 'linear-gradient(180deg, var(--accent) 0%, #3f8ff4 100%)', color: 'var(--accent-foreground)' }}
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
    </AppShell>
  )
}
