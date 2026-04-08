import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Flame, Layers3, Target } from 'lucide-react'
import { toast } from 'sonner'
import { useWorkoutStore, type WorkoutSet } from '../store/workoutStore'
import { useAuthStore } from '../store/authStore'
import { useProfileStore } from '../store/profileStore'
import { saveWorkout } from '../lib/workoutService'
import { getUserExercises } from '../lib/userExercisesService'
import { useActiveSession } from '../hooks/useActiveSession'
import AppShell from '../components/AppShell'
import ExercisePicker from '../components/ExercisePicker'
import ConfirmDialog from '../components/ConfirmDialog'
import { LoadingState } from '../components/ui'
import { exercises as exerciseDb, type Exercise } from '../data/exercises'

const WORKOUT_LABELS = ['Push', 'Pull', 'Nogi', 'Upper Body', 'Lower Body', 'Full Body', 'Plecy & Biceps', 'Klatka & Triceps', 'Cardio', 'Crossfit', 'Mobilność'] as const
const CATEGORY_LABELS: Record<string, string> = {
  chest: 'Klatka',
  back: 'Plecy',
  legs: 'Nogi',
  shoulders: 'Barki',
  arms: 'Ramiona',
  core: 'Core',
  cardio: 'Cardio',
}
const CATEGORY_COLORS: Record<string, string> = {
  chest: '#4D8EFF',
  back: '#9B6DFF',
  legs: '#FF6B6B',
  shoulders: '#FF7BC0',
  arms: '#FFB04A',
  core: '#1FD5B6',
  cardio: '#F4D35E',
}
const EQUIPMENT_LABELS: Record<string, string> = {
  barbell: 'Sztanga',
  dumbbell: 'Hantle',
  cable: 'Wyciąg',
  machine: 'Maszyna',
  bodyweight: 'BW',
  kettlebell: 'KB',
}

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

function parseWeight(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseReps(value: string): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function calcSetVolume(set: Pick<WorkoutSet, 'weight' | 'reps'>): number {
  return parseWeight(set.weight) * parseReps(set.reps)
}

function formatCompactVolume(volume: number): string {
  if (!volume) return '0 kg'
  if (volume >= 10_000) return `${Math.round(volume / 1_000)}k kg`
  if (volume >= 1_000) return `${(volume / 1_000).toFixed(1)}k kg`
  return `${Math.round(volume).toLocaleString('pl-PL')} kg`
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
  const exerciseCatalog = new Map([...exerciseDb, ...userExercises].map((exercise) => [exercise.id, exercise]))
  const totalExercises = active.exercises.length
  const totalSets = active.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0)
  const completedSets = active.exercises.reduce((sum, exercise) => (
    sum + exercise.sets.filter((set) => set.done && parseReps(set.reps) > 0).length
  ), 0)
  const totalVolume = active.exercises.reduce((sum, exercise) => (
    sum + exercise.sets.reduce((innerSum, set) => (
      set.done ? innerSum + calcSetVolume(set) : innerSum
    ), 0)
  ), 0)
  const totalReps = active.exercises.reduce((sum, exercise) => (
    sum + exercise.sets.reduce((innerSum, set) => (
      set.done ? innerSum + parseReps(set.reps) : innerSum
    ), 0)
  ), 0)
  const strongestSet = active.exercises.reduce((top, exercise) => {
    const next = exercise.sets.reduce((currentTop, set) => (
      set.done ? Math.max(currentTop, parseWeight(set.weight)) : currentTop
    ), 0)
    return Math.max(top, next)
  }, 0)
  const completionPct = totalSets > 0 ? Math.round((completedSets / totalSets) * 100) : 0
  const activeLabel = active.label?.trim() || 'Sesja w toku'
  const sessionSignal = totalExercises === 0
    ? 'Dodaj pierwsze ćwiczenie, żeby rozpocząć logowanie sesji.'
    : completedSets === 0
      ? 'Pierwsze serie jeszcze przed Tobą. Zacznij od najmocniejszego ruchu dnia.'
      : completionPct >= 100
        ? 'Cała rozpiska jest oznaczona jako wykonana. Możesz domknąć sesję lub dodać kolejne serie.'
        : `Masz zamknięte ${completedSets} z ${totalSets} serii. Kolejne wejście utrzyma tempo sesji.`

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
        <motion.button
          onClick={handleDiscard}
          className="flex-none rounded-xl px-3 py-2 text-xs font-semibold"
          style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--muted)', border: '1px solid var(--border)' }}
          whileTap={{ scale: 0.93 }}
        >
          Anuluj
        </motion.button>
        <span className="text-xl font-bold tabular-nums text-white flex-none">{timerStr}</span>
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
              Active workout
            </p>

            <div
              className="rounded-[var(--radius-xl)] p-4 mb-5"
              style={{ background: 'linear-gradient(180deg, rgba(90,166,255,0.16) 0%, rgba(90,166,255,0.05) 100%)', border: '1px solid var(--accent-soft-strong)' }}
            >
              <p className="stat-meta mb-2">Czas sesji</p>
              <div className="flex items-end justify-between gap-3">
                <span className="text-[3rem] font-bold tabular-nums tracking-[-0.06em] leading-none text-white">
                  {timerStr}
                </span>
                <span
                  className="rounded-full px-2.5 py-1 text-[10px] font-semibold"
                  style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text-strong)', border: '1px solid rgba(255,255,255,0.12)' }}
                >
                  {activeLabel}
                </span>
              </div>
              <div className="mt-4 h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(totalSets ? completionPct : 12, totalSets ? 12 : 0)}%`,
                    background: completionPct >= 100
                      ? 'linear-gradient(90deg, var(--success) 0%, #0fb781 100%)'
                      : 'linear-gradient(90deg, var(--accent) 0%, #3f8ff4 100%)',
                  }}
                />
              </div>
              <p className="mt-3 text-sm leading-6" style={{ color: 'var(--muted)' }}>
                {sessionSignal}
              </p>
            </div>

            {saveError && <p className="mb-4 text-xs" style={{ color: '#FF4B4B' }}>{saveError}</p>}

            <div className="grid grid-cols-2 gap-2 mb-5">
              <div className="rounded-[var(--radius-lg)] border p-3" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--border)' }}>
                <p className="stat-meta">Ćwiczenia</p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white tabular-nums">{totalExercises}</p>
              </div>
              <div className="rounded-[var(--radius-lg)] border p-3" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--border)' }}>
                <p className="stat-meta">Serie</p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white tabular-nums">{completedSets}/{totalSets}</p>
              </div>
              <div className="rounded-[var(--radius-lg)] border p-3" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--border)' }}>
                <p className="stat-meta">Objętość</p>
                <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-white tabular-nums">{formatCompactVolume(totalVolume)}</p>
              </div>
              <div className="rounded-[var(--radius-lg)] border p-3" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--border)' }}>
                <p className="stat-meta">Najcięższy set</p>
                <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-white tabular-nums">{strongestSet ? `${strongestSet} ${units}` : '—'}</p>
              </div>
            </div>

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
              <div className="mb-3 rounded-[var(--radius-lg)] border p-3" style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between gap-3">
                  <span className="stat-meta">Puls sesji</span>
                  <Target size={14} style={{ color: 'var(--accent)' }} />
                </div>
                <p className="mt-2 text-sm font-semibold text-white">
                  {totalReps > 0 ? `${totalReps} powtórzeń zapisanych w tej sesji.` : 'Jeszcze bez zapisanych powtórzeń.'}
                </p>
              </div>
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
          <motion.section
            className="surface-panel mb-4 rounded-[var(--radius-xl)] p-4 sm:p-5"
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="eyebrow">Live session</p>
                <h2 className="section-title mt-2">{activeLabel}</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6" style={{ color: 'var(--muted)' }}>
                  {sessionSignal}
                </p>
              </div>
              <div className="grid w-full gap-2 sm:grid-cols-3 xl:w-[32rem]">
                <div className="rounded-[var(--radius-lg)] border p-3" style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'var(--border)' }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="stat-meta">Serie</span>
                    <Check size={14} style={{ color: completedSets > 0 ? 'var(--success)' : 'var(--accent)' }} />
                  </div>
                  <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white tabular-nums">{completedSets}/{totalSets || 0}</p>
                </div>
                <div className="rounded-[var(--radius-lg)] border p-3" style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'var(--border)' }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="stat-meta">Objętość</span>
                    <Flame size={14} style={{ color: 'var(--accent)' }} />
                  </div>
                  <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white tabular-nums">{formatCompactVolume(totalVolume)}</p>
                </div>
                <div className="rounded-[var(--radius-lg)] border p-3" style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'var(--border)' }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="stat-meta">Ćwiczenia</span>
                    <Layers3 size={14} style={{ color: 'var(--accent)' }} />
                  </div>
                  <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white tabular-nums">{totalExercises}</p>
                </div>
              </div>
            </div>
          </motion.section>

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
                <p className="mb-2 text-sm font-semibold text-white">Sesja gotowa do startu</p>
                <p className="text-sm leading-6" style={{ color: 'var(--muted)' }}>
                  Dodaj pierwsze ćwiczenie i zacznij budować wolumen tej sesji. Pasek postępu i insighty będą rosnąć razem z kolejnymi seriami.
                </p>
              </div>
            )}

            <AnimatePresence>
              {active.exercises.map((exercise, exerciseIndex) => (
                (() => {
                  const exerciseMeta = exerciseCatalog.get(exercise.exerciseId)
                  const exerciseVolume = exercise.sets.reduce((sum, set) => (
                    set.done ? sum + calcSetVolume(set) : sum
                  ), 0)
                  const exerciseCompleted = exercise.sets.filter((set) => set.done && parseReps(set.reps) > 0).length
                  const bestSet = exercise.sets.reduce((top, set) => (
                    set.done ? Math.max(top, parseWeight(set.weight)) : top
                  ), 0)
                  const exerciseAccent = CATEGORY_COLORS[exerciseMeta?.category ?? ''] ?? 'var(--accent)'

                  return (
                    <motion.div
                      key={exerciseIndex}
                      className="surface-panel rounded-[var(--radius-xl)] p-4 sm:p-5"
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                    >
                      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            {exerciseMeta?.equipment && (
                              <span
                                className="rounded-full px-2.5 py-1 text-[10px] font-semibold"
                                style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--muted)', border: '1px solid var(--border)' }}
                              >
                                {EQUIPMENT_LABELS[exerciseMeta.equipment] ?? exerciseMeta.equipment}
                              </span>
                            )}
                            {exerciseMeta?.category && (
                              <span
                                className="rounded-full px-2.5 py-1 text-[10px] font-semibold"
                                style={{ background: `${exerciseAccent}18`, color: exerciseAccent, border: `1px solid ${exerciseAccent}30` }}
                              >
                                {CATEGORY_LABELS[exerciseMeta.category] ?? exerciseMeta.category}
                              </span>
                            )}
                          </div>
                          <p className="mt-3 text-lg font-semibold tracking-[-0.03em] text-white">{exercise.name}</p>
                        </div>
                        <button
                          onClick={() => removeExercise(exerciseIndex)}
                          className="flex-none text-xs transition-opacity hover:opacity-70"
                          style={{ color: 'var(--muted)' }}
                        >
                          Usuń
                        </button>
                      </div>

                      <div className="mb-4 grid gap-2 sm:grid-cols-3">
                        <div className="rounded-[var(--radius-lg)] border p-3" style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'var(--border)' }}>
                          <p className="stat-meta">Postęp</p>
                          <p className="mt-2 text-lg font-semibold text-white tabular-nums">{exerciseCompleted}/{exercise.sets.length}</p>
                        </div>
                        <div className="rounded-[var(--radius-lg)] border p-3" style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'var(--border)' }}>
                          <p className="stat-meta">Objętość</p>
                          <p className="mt-2 text-lg font-semibold text-white tabular-nums">{formatCompactVolume(exerciseVolume)}</p>
                        </div>
                        <div className="rounded-[var(--radius-lg)] border p-3" style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'var(--border)' }}>
                          <p className="stat-meta">Top set</p>
                          <p className="mt-2 text-lg font-semibold text-white tabular-nums">{bestSet ? `${bestSet} ${units}` : '—'}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,1fr)_1.75rem] gap-2 mb-2">
                        <span className="text-[10px] uppercase tracking-[0.16em] text-center" style={{ color: 'var(--muted)' }}>#</span>
                        <span className="text-[10px] uppercase tracking-[0.16em] text-center" style={{ color: 'var(--muted)' }}>{units}</span>
                        <span className="text-[10px] uppercase tracking-[0.16em] text-center" style={{ color: 'var(--muted)' }}>Powt.</span>
                        <span />
                      </div>

                      <div className="space-y-2">
                        {exercise.sets.map((set, setIndex) => {
                          const setVolume = calcSetVolume(set)
                          return (
                            <div
                              key={setIndex}
                              className="rounded-[var(--radius-lg)] border p-2.5"
                              style={{
                                background: set.done ? 'rgba(25,213,159,0.08)' : 'rgba(255,255,255,0.025)',
                                borderColor: set.done ? 'rgba(25,213,159,0.18)' : 'var(--border)',
                                opacity: set.done ? 0.88 : 1,
                              }}
                            >
                              <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,1fr)_1.75rem] gap-2 items-center">
                                <motion.button
                                  onClick={() => toggleSetDone(exerciseIndex, setIndex)}
                                  className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] text-xs font-bold"
                                  style={{
                                    background: set.done ? 'var(--success)' : 'var(--input-bg)',
                                    color: set.done ? '#081813' : 'var(--muted)',
                                    border: `1px solid ${set.done ? 'var(--success)' : 'var(--border)'}`,
                                  }}
                                  whileTap={{ scale: 0.85 }}
                                  animate={set.done ? { scale: [1, 1.12, 1] } : { scale: 1 }}
                                  transition={{ duration: 0.25 }}
                                  aria-label={set.done ? `Odznacz serię ${setIndex + 1}` : `Oznacz serię ${setIndex + 1}`}
                                >
                                  {set.done ? <Check size={14} /> : setIndex + 1}
                                </motion.button>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  placeholder="0"
                                  value={set.weight}
                                  onChange={(e) => updateSet(exerciseIndex, setIndex, 'weight', e.target.value)}
                                  className={`px-3 py-2.5 rounded-[var(--radius-sm)] text-sm text-center text-white outline-none ${set.done ? 'line-through opacity-60' : ''}`}
                                  style={{ background: 'var(--input-bg)', border: '1px solid var(--border)' }}
                                />
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  placeholder="0"
                                  value={set.reps}
                                  onChange={(e) => updateSet(exerciseIndex, setIndex, 'reps', e.target.value)}
                                  className={`px-3 py-2.5 rounded-[var(--radius-sm)] text-sm text-center text-white outline-none ${set.done ? 'line-through opacity-60' : ''}`}
                                  style={{ background: 'var(--input-bg)', border: '1px solid var(--border)' }}
                                />
                                <button
                                  onClick={() => removeSet(exerciseIndex, setIndex)}
                                  className="text-xs text-center transition-opacity hover:opacity-70"
                                  style={{ color: 'var(--muted)' }}
                                  aria-label={`Usuń serię ${setIndex + 1}`}
                                >
                                  ✕
                                </button>
                              </div>
                              <div className="mt-2 flex items-center justify-between gap-3 text-[11px]">
                                <span style={{ color: 'var(--muted)' }}>
                                  Objętość: <span className="tabular-nums text-white">{formatCompactVolume(setVolume)}</span>
                                </span>
                                <span style={{ color: set.done ? 'var(--success)' : 'var(--muted-soft)' }}>
                                  {set.done ? 'Zapisana' : 'Robocza seria'}
                                </span>
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      <button
                        onClick={() => addSet(exerciseIndex)}
                        className="mt-3 w-full py-2.5 rounded-[var(--radius-lg)] text-sm font-semibold transition-opacity hover:opacity-80"
                        style={{ background: 'var(--input-bg)', color: 'var(--text)', border: '1px solid var(--border)' }}
                      >
                        + Dodaj serię
                      </button>
                    </motion.div>
                  )
                })()
              ))}
            </AnimatePresence>
          </div>
        </main>
      </div>

      <div
        className="fixed bottom-0 left-0 right-0 flex justify-center px-4 lg:hidden"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="surface-panel w-full max-w-sm rounded-[var(--radius-xl)] p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="stat-meta">Postęp sesji</p>
              <p className="mt-1 text-sm font-semibold text-white tabular-nums">
                {completedSets}/{totalSets || 0} serii • {formatCompactVolume(totalVolume)}
              </p>
            </div>
            <div className="rounded-[var(--radius-lg)] border px-3 py-2 text-right" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.03)' }}>
              <p className="text-[10px] uppercase tracking-[0.18em]" style={{ color: 'var(--muted)' }}>Tempo</p>
              <p className="mt-1 text-sm font-semibold text-white tabular-nums">{timerStr}</p>
            </div>
          </div>
          <motion.button
            onClick={() => setShowPicker(true)}
            className="w-full py-3.5 rounded-[var(--radius-lg)] font-semibold text-sm tracking-wide"
            style={{ background: 'linear-gradient(180deg, var(--accent) 0%, #3f8ff4 100%)', color: 'var(--accent-foreground)' }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
          >
            + Dodaj ćwiczenie
          </motion.button>
        </div>
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
