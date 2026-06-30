import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Dumbbell, Flame, History, Layers3, LayoutDashboard, Sparkles, Target, Timer, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { useWorkoutStore, type ActiveWorkout, type WorkoutSet } from '../store/workoutStore'
import { useAuthStore } from '../store/authStore'
import { useProfileStore } from '../store/profileStore'
import { saveWorkout, getRecentWorkouts } from '../lib/workoutService'
import { getUserExercises } from '../lib/userExercisesService'
import { getExerciseSessions } from '../lib/exerciseDetailService'
import { useActiveSession } from '../hooks/useActiveSession'
import ExercisePicker from '../components/ExercisePicker'
import ConfirmDialog from '../components/ConfirmDialog'
import OverloadHint from '../components/OverloadHint'
import { LoadingState } from '../components/ui'
import { suggestNextSession, type OverloadSuggestion } from '../lib/overloadService'
import { exercises as exerciseDb, type Exercise } from '../data/exercises'
import { navigateWithAppTransition } from '../lib/viewTransitions'
import { preloadRouteByPath } from '../router/pageLoaders'

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

const SESSION_QUICK_LINKS: Array<{
  label: string
  to: string
  icon: typeof LayoutDashboard
}> = [
  { label: 'Start', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Historia', to: '/history', icon: History },
  { label: 'Postępy', to: '/progress', icon: TrendingUp },
  { label: 'Plany', to: '/templates', icon: Layers3 },
  { label: 'Ćwiczenia', to: '/exercises', icon: Dumbbell },
  { label: 'AI', to: '/chat', icon: Sparkles },
]

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

interface SessionQuickLinksProps {
  onNavigate: (to: string) => void
  variant?: 'mobile' | 'desktop'
  className?: string
}

function SessionQuickLinks({ onNavigate, variant = 'mobile', className = '' }: SessionQuickLinksProps) {
  const isDesktop = variant === 'desktop'

  return (
    <div className={className}>
      {isDesktop && (
        <p className="mb-3 text-[10px] uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
          Szybki podgląd
        </p>
      )}
      <div className={isDesktop ? 'grid grid-cols-2 gap-2' : 'no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1'}>
        {SESSION_QUICK_LINKS.map(({ label, to, icon: Icon }) => (
          <motion.button
            key={to}
            type="button"
            onClick={() => onNavigate(to)}
            onPointerEnter={() => { void preloadRouteByPath(to) }}
            onFocus={() => { void preloadRouteByPath(to) }}
            className={
              isDesktop
                ? 'flex min-h-11 items-center gap-2 rounded-[var(--radius-lg)] border px-3 text-left text-xs font-semibold transition-colors hover:bg-white/5'
                : 'flex h-11 flex-none items-center gap-2 rounded-[var(--radius-lg)] border px-3 text-xs font-semibold transition-colors hover:bg-white/5'
            }
            style={{
              background: 'rgba(255,255,255,0.035)',
              borderColor: 'var(--border)',
              color: 'var(--text-strong)',
            }}
            whileTap={{ scale: 0.94 }}
            aria-label={`Przejdź do: ${label}`}
          >
            <Icon size={15} strokeWidth={2.2} style={{ color: 'var(--accent)' }} />
            <span className="whitespace-nowrap">{label}</span>
          </motion.button>
        ))}
      </div>
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
    hydrateFromDoc,
    setLabel,
    addExercise,
    addSet,
    removeSet,
    updateSet,
    adjustSet,
    toggleSetDone,
    removeExercise,
    clearWorkout,
  } = useWorkoutStore()
  const navigate = useNavigate()
  const location = useLocation()
  const goQuick = (to: string) => navigateWithAppTransition(navigate, to)
  const appliedTemplateRef = useRef<string | null>(null)

  const { clearSession, ready } = useActiveSession(user?.uid ?? null)
  const [showPicker, setShowPicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const [closingSession, setClosingSession] = useState(false)
  const [, setTick] = useState(0)
  const [saveError, setSaveError] = useState('')
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [confirmFinishEmpty, setConfirmFinishEmpty] = useState(false)
  const [pendingExerciseRemovalIndex, setPendingExerciseRemovalIndex] = useState<number | null>(null)
  const [userExercises, setUserExercises] = useState<Exercise[]>([])
  const [suggestions, setSuggestions] = useState<Record<string, OverloadSuggestion | null>>({})
  const [dismissedHints, setDismissedHints] = useState<Set<string>>(new Set())
  const fetchedKeys = useRef(new Set<string>())

  // Rest timer state
  const [rest, setRest] = useState<{ startedAt: number; totalSec: number } | null>(null)
  const [restNow, setRestNow] = useState(() => Date.now())
  const restFiredRef = useRef(false)

  useEffect(() => {
    if (rest === null) return
    const interval = setInterval(() => setRestNow(Date.now()), 250)
    return () => clearInterval(interval)
  }, [rest])

  const restEndsAt = rest ? rest.startedAt + rest.totalSec * 1000 : null
  const restRemainingMs = restEndsAt !== null ? Math.max(0, restEndsAt - restNow) : 0
  const restRemainingSec = Math.ceil(restRemainingMs / 1000)
  const restProgress = rest ? restRemainingMs / (rest.totalSec * 1000) : 0

  useEffect(() => {
    if (rest === null) {
      restFiredRef.current = false
      return
    }
    if (restRemainingMs === 0 && !restFiredRef.current) {
      restFiredRef.current = true
      if ('vibrate' in navigator) navigator.vibrate([120, 60, 120])
      const timeout = setTimeout(() => setRest(null), 3500)
      return () => clearTimeout(timeout)
    }
  }, [rest, restRemainingMs])

  const handleToggleSet = (exerciseIndex: number, setIndex: number) => {
    const currentSet = active?.exercises[exerciseIndex]?.sets[setIndex]
    const wasNotDone = currentSet && !currentSet.done
    toggleSetDone(exerciseIndex, setIndex)
    if (wasNotDone) {
      restFiredRef.current = false
      setRest({ startedAt: Date.now(), totalSec: 90 })
      if ('vibrate' in navigator) navigator.vibrate(12)
    } else {
      setRest(null)
    }
  }

  const handleAddRestTime = (deltaSec: number) => {
    setRest((prev) => prev ? { ...prev, totalSec: prev.totalSec + deltaSec } : prev)
  }

  const handleSkipRest = () => setRest(null)

  // Quick picks — top exercises from recent sessions, shown when live session is empty
  const [quickPicks, setQuickPicks] = useState<Array<{ id: string; name: string; source: 'global' | 'user'; count: number }>>([])

  useEffect(() => {
    if (!user) return
    getRecentWorkouts(user.uid, 10)
      .then((wks) => {
        const map = new Map<string, { id: string; name: string; source: 'global' | 'user'; count: number }>()
        for (const w of wks) {
          for (const ex of w.exercises) {
            if (!ex.exerciseId) continue
            const source: 'global' | 'user' = ex.exerciseSource === 'user' ? 'user' : 'global'
            const key = `${source}:${ex.exerciseId}`
            const existing = map.get(key)
            if (existing) existing.count += 1
            else map.set(key, { id: ex.exerciseId, name: ex.name, source, count: 1 })
          }
        }
        const top = Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 6)
        setQuickPicks(top)
      })
      .catch(() => {})
  }, [user])

  const handlePickExercise = async (id: string, name: string, source: 'global' | 'user') => {
    addExercise(id, name, source)
    if (!user) return
    fetchSuggestion(id, source, user.uid)
    try {
      const sessions = await getExerciseSessions(user.uid, id, source, 1)
      const last = sessions[0]
      if (!last || last.bestSetWeight <= 0) return
      const state = useWorkoutStore.getState()
      if (!state.active) return
      const idx = state.active.exercises.findIndex(
        (ex) => ex.exerciseId === id && ex.exerciseSource === source,
      )
      if (idx === -1) return
      const firstSet = state.active.exercises[idx].sets[0]
      if (!firstSet || firstSet.weight || firstSet.reps) return
      state.updateSet(idx, 0, 'weight', String(last.bestSetWeight))
      if (last.bestSetReps > 0) state.updateSet(idx, 0, 'reps', String(last.bestSetReps))
    } catch { /* silent */ }
  }

  // Load user's custom exercises for the picker
  useEffect(() => {
    if (!user) return
    getUserExercises(user.uid)
      .then(setUserExercises)
      .catch(() => toast.error('Nie udało się wczytać Twoich ćwiczeń.'))
  }, [user])

  function fetchSuggestion(exerciseId: string, source: string, uid: string) {
    const key = `${source}:${exerciseId}`
    if (fetchedKeys.current.has(key)) return
    fetchedKeys.current.add(key)
    suggestNextSession(uid, exerciseId, source as 'global' | 'user')
      .then((suggestion) => setSuggestions((prev) => ({ ...prev, [key]: suggestion })))
      .catch(() => { fetchedKeys.current.delete(key) })
  }

  // Fetch suggestions for exercises loaded from template on mount
  useEffect(() => {
    if (!user || !active) return
    for (const ex of active.exercises) {
      fetchSuggestion(ex.exerciseId, ex.exerciseSource, user.uid)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, active?.exercises.length])

  useEffect(() => {
    const id = setInterval(() => setTick((tick) => tick + 1), 1_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const routeState = location.state as { templateWorkout?: ActiveWorkout; templateName?: string } | null
    const templateWorkout = routeState?.templateWorkout

    if (!ready || !templateWorkout) return

    const signature = `${templateWorkout.templateId ?? 'adhoc'}:${templateWorkout.startedAt}`
    if (appliedTemplateRef.current === signature) return

    appliedTemplateRef.current = signature
    hydrateFromDoc(templateWorkout)
    navigate(location.pathname, { replace: true, state: null })
    toast.success(routeState?.templateName ? `Szablon „${routeState.templateName}” gotowy do startu` : 'Szablon gotowy do startu')
  }, [ready, location.state, location.pathname, hydrateFromDoc, navigate])

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

  function exerciseHasEnteredSets(exerciseIndex: number): boolean {
    const exercise = active?.exercises[exerciseIndex]
    if (!exercise) return false
    return exercise.sets.some((set) => set.done || set.weight.trim() !== '' || set.reps.trim() !== '')
  }

  function handleRemoveExercise(exerciseIndex: number) {
    if (exerciseHasEnteredSets(exerciseIndex)) {
      setPendingExerciseRemovalIndex(exerciseIndex)
      return
    }
    removeExercise(exerciseIndex)
  }

  function handleConfirmRemoveExercise() {
    if (pendingExerciseRemovalIndex === null) return
    removeExercise(pendingExerciseRemovalIndex)
    setPendingExerciseRemovalIndex(null)
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
    ? 'Dodaj pierwsze ćwiczenie, żeby zacząć sesję.'
    : completedSets === 0
      ? 'Pierwsze serie jeszcze przed Tobą. Zacznij od głównego ruchu dnia.'
      : completionPct >= 100
        ? 'Cała rozpiska jest oznaczona jako wykonana. Możesz domknąć sesję albo dorzucić kolejne serie.'
        : `${completedSets} z ${totalSets} serii masz już zamknięte.`

  const timerStr = (() => {
    const t = formatDuration(active.startedAt)
    return t.h !== '00' ? `${t.h}:${t.m}:${t.s}` : `${t.m}:${t.s}`
  })()

  return (
    <>

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
              Aktywna sesja
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

            <SessionQuickLinks
              variant="desktop"
              className="mb-5"
              onNavigate={goQuick}
            />

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
                Typ sesji
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
                  <span className="stat-meta">Stan sesji</span>
                  <Target size={14} style={{ color: 'var(--accent)' }} />
                </div>
                <p className="mt-2 text-sm font-semibold text-white">
                  {totalReps > 0 ? `${totalReps} powtórzeń zapisanych w tej sesji.` : 'Jeszcze bez zapisanych powtórzeń.'}
                </p>
              </div>
              <motion.button
                onClick={() => setShowPicker(true)}
                className="w-full rounded-[var(--radius-lg)] py-3.5 text-sm font-semibold tracking-wide mb-3"
                style={{ background: 'linear-gradient(180deg, var(--accent) 0%, #3f8ff4 100%)', color: 'var(--accent-foreground)' }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
              >
                + Dodaj ćwiczenie
              </motion.button>
              <div className="grid grid-cols-2 gap-2">
                <motion.button
                  onClick={handleDiscard}
                  className="rounded-[var(--radius-lg)] py-3 text-sm font-semibold"
                  style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--muted)', border: '1px solid var(--border)' }}
                  whileTap={{ scale: 0.97 }}
                >
                  Anuluj
                </motion.button>
                <motion.button
                  onClick={handleFinish}
                  disabled={saving}
                  className="rounded-[var(--radius-lg)] py-3 text-sm font-bold"
                  style={{ background: 'linear-gradient(180deg, var(--accent) 0%, #3f8ff4 100%)', color: 'var(--accent-foreground)', opacity: saving ? 0.6 : 1 }}
                  whileTap={{ scale: 0.97 }}
                >
                  {saving ? '...' : 'Zakończ'}
                </motion.button>
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 pb-48 lg:pb-0">
          <SessionQuickLinks
            className="mb-4 lg:hidden"
            onNavigate={goQuick}
          />

          <motion.section
            className="surface-panel-hero mb-4 rounded-[var(--radius-xl)] p-4 sm:p-5"
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="eyebrow">Aktywna sesja</p>
                <h2 className="section-title mt-2">{activeLabel}</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6" style={{ color: 'var(--muted)' }}>
                  {sessionSignal}
                </p>
                <div className="lg:hidden mt-4">
                  <LabelChips
                    activeLabel={active.label ?? ''}
                    onToggle={(label) => setLabel(active.label === label ? '' : label)}
                  />
                </div>
              </div>
              <div className="hidden w-full gap-2 sm:grid sm:grid-cols-3 xl:w-[32rem]">
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

          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
                Ćwiczenia
              </p>
              <h2 className="mt-2 text-2xl font-bold text-white">Bieżąca rozpiska</h2>
            </div>
            <p className="hidden text-sm lg:block" style={{ color: 'var(--muted)' }}>
              Wpisuj sety na bieżąco i oznaczaj gotowe serie przyciskiem po lewej.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            {active.exercises.length === 0 && (
              <>
                <div
                  className="surface-panel rounded-[var(--radius-xl)] p-5 sm:p-6"
                  style={{ borderColor: 'rgba(90,166,255,0.14)' }}
                >
                  <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(16rem,0.95fr)] lg:items-start">
                    <div>
                      <p className="eyebrow mb-2" style={{ color: 'var(--accent)' }}>Start sesji</p>
                      <h3 className="text-2xl font-semibold tracking-[-0.04em] text-white">Dodaj pierwszy ruch</h3>
                      <p className="mt-3 max-w-2xl text-sm leading-6" style={{ color: 'var(--muted)' }}>
                        Dodaj ćwiczenie, a potem loguj serie na bieżąco. Obok od razu zobaczysz objętość, postęp i top set.
                      </p>

                      <div className="mt-5 grid gap-2 sm:grid-cols-3">
                        {[
                          { label: '1', text: 'Wybierz ruch główny dnia' },
                          { label: '2', text: 'Wpisz ciężar i powtórzenia' },
                          { label: '3', text: 'Zamykaj serie po wykonaniu' },
                        ].map((step) => (
                          <div
                            key={step.label}
                            className="rounded-[var(--radius-lg)] border px-4 py-3"
                            style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'var(--border)' }}
                          >
                            <span className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>Krok {step.label}</span>
                            <p className="mt-2 text-sm leading-6 text-white">{step.text}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div
                      className="rounded-[var(--radius-xl)] border p-4"
                      style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--border)' }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="eyebrow mb-2">Sygnał sesji</p>
                          <p className="text-lg font-semibold tracking-[-0.03em] text-white">Jeszcze bez ćwiczeń</p>
                        </div>
                        <div
                          className="rounded-[var(--radius-pill)] border px-3 py-1.5 text-xs font-semibold"
                          style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'var(--border)', color: 'var(--muted)' }}
                        >
                          0/{totalSets || 0} serii
                        </div>
                      </div>
                      <p className="mt-3 text-sm leading-6" style={{ color: 'var(--muted)' }}>
                        Jeśli chcesz wejść szybciej, skorzystaj z szybkiego startu poniżej albo dodaj ruch ręcznie.
                      </p>
                    </div>
                  </div>
                </div>
                {quickPicks.length > 0 && (
                  <div>
                    <p className="eyebrow mb-3" style={{ color: 'var(--muted)' }}>Szybki start</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {quickPicks.map(({ id, name, source, count }) => {
                        const meta = exerciseCatalog.get(id)
                        const exerciseAccent = CATEGORY_COLORS[meta?.category ?? ''] ?? 'var(--accent)'
                        return (
                          <motion.button
                            key={`${source}:${id}`}
                            type="button"
                            onClick={() => handlePickExercise(id, name, source)}
                            className="rounded-[var(--radius-lg)] border p-3.5 text-left transition-all hover:bg-white/5"
                            style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.02)' }}
                            whileTap={{ scale: 0.98 }}
                          >
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <p className="text-sm font-semibold text-white truncate">{name}</p>
                              {meta?.category && (
                                <span
                                  className="flex-none text-[9px] font-semibold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-full"
                                  style={{ background: `${exerciseAccent}18`, color: exerciseAccent }}
                                >
                                  {CATEGORY_LABELS[meta.category] ?? meta.category}
                                </span>
                              )}
                            </div>
                            <p className="text-xs" style={{ color: 'var(--muted)' }}>
                              Użyte {count}× w ostatnich sesjach
                            </p>
                          </motion.button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
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
                          onClick={() => handleRemoveExercise(exerciseIndex)}
                          className="flex-none text-xs transition-opacity hover:opacity-70"
                          style={{ color: 'var(--muted)' }}
                        >
                          Usuń
                        </button>
                      </div>

                      <div className="sm:hidden mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--muted)' }}>
                        <span>Postęp <b className="tabular-nums text-white">{exerciseCompleted}/{exercise.sets.length}</b></span>
                        <span>Objętość <b className="tabular-nums text-white">{formatCompactVolume(exerciseVolume)}</b></span>
                        <span>Top <b className="tabular-nums text-white">{bestSet ? `${bestSet} ${units}` : '—'}</b></span>
                      </div>

                      <div className="hidden sm:grid mb-4 gap-2 sm:grid-cols-3">
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

                      {(() => {
                        const hintKey = `${exercise.exerciseSource}:${exercise.exerciseId}`
                        const suggestion = suggestions[hintKey]
                        if (!suggestion || dismissedHints.has(hintKey)) return null
                        return (
                          <OverloadHint
                            suggestion={suggestion}
                            onApply={(weight) => {
                              updateSet(exerciseIndex, 0, 'weight', String(weight))
                              setDismissedHints((prev) => new Set(prev).add(hintKey))
                            }}
                            onDismiss={() => setDismissedHints((prev) => new Set(prev).add(hintKey))}
                          />
                        )
                      })()}

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
                                background: set.done ? 'rgba(25,213,159,0.12)' : 'rgba(255,255,255,0.025)',
                                borderColor: set.done ? 'rgba(25,213,159,0.42)' : 'var(--border)',
                                boxShadow: set.done ? 'inset 0 1px 0 rgba(25,213,159,0.08)' : undefined,
                              }}
                            >
                              <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,1fr)_2.5rem] gap-2 items-center">
                                <motion.button
                                  onClick={() => handleToggleSet(exerciseIndex, setIndex)}
                                  className="flex h-10 w-9 items-center justify-center rounded-[var(--radius-md)] text-xs font-bold"
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
                                  {set.done ? <Check size={16} /> : setIndex + 1}
                                </motion.button>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  placeholder="0"
                                  value={set.weight}
                                  onChange={(e) => updateSet(exerciseIndex, setIndex, 'weight', e.target.value)}
                                  aria-label={`Ciężar, ${exercise.name}, seria ${setIndex + 1}, ${units}`}
                                  className={`px-3 py-2.5 rounded-[var(--radius-sm)] text-sm text-center text-white outline-none ${set.done ? 'opacity-70' : ''}`}
                                  style={{ background: 'var(--input-bg)', border: '1px solid var(--border)' }}
                                />
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  placeholder="0"
                                  value={set.reps}
                                  onChange={(e) => updateSet(exerciseIndex, setIndex, 'reps', e.target.value)}
                                  aria-label={`Powtórzenia, ${exercise.name}, seria ${setIndex + 1}`}
                                  className={`px-3 py-2.5 rounded-[var(--radius-sm)] text-sm text-center text-white outline-none ${set.done ? 'opacity-70' : ''}`}
                                  style={{ background: 'var(--input-bg)', border: '1px solid var(--border)' }}
                                />
                                <button
                                  onClick={() => removeSet(exerciseIndex, setIndex)}
                                  className="flex h-10 w-full items-center justify-center rounded-[var(--radius-md)] text-base transition-colors hover:bg-white/5 active:bg-white/10"
                                  style={{ color: 'var(--muted-soft)' }}
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
                              {!set.done && (
                                <div className="set-stepper-row sm:hidden mt-2 grid grid-cols-4 gap-1.5">
                                  {[
                                    { label: '−2.5 kg', delta: -2.5, field: 'weight' as const },
                                    { label: '+2.5 kg', delta: +2.5, field: 'weight' as const },
                                    { label: '−1 rep', delta: -1, field: 'reps' as const },
                                    { label: '+1 rep', delta: +1, field: 'reps' as const },
                                  ].map(({ label, delta, field }) => (
                                    <button
                                      key={label}
                                      type="button"
                                      onClick={() => {
                                        adjustSet(exerciseIndex, setIndex, field, delta)
                                        if ('vibrate' in navigator) navigator.vibrate(6)
                                      }}
                                      className="set-stepper-btn"
                                      aria-label={`Dostosuj ${field === 'weight' ? 'wagę' : 'powtórzenia'} o ${delta}`}
                                    >
                                      {label}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>

                      <button
                        onClick={(e) => {
                          addSet(exerciseIndex)
                          if ('vibrate' in navigator) navigator.vibrate(8)
                          const btn = e.currentTarget
                          setTimeout(() => btn.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
                        }}
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

          <AnimatePresence initial={false}>
            {rest !== null && (
              <motion.div
                key="rest-timer-bar"
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: 'auto', marginBottom: 12 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
                className="rest-timer-bar"
                data-finished={restRemainingMs === 0}
              >
                <div className="rest-timer-progress" aria-hidden="true">
                  <div className="rest-timer-progress-fill" style={{ width: `${restProgress * 100}%` }} />
                </div>
                <div className="rest-timer-content">
                  <Timer size={16} strokeWidth={2.2} className="flex-none" />
                  <div className="rest-timer-label">
                    {restRemainingMs === 0 ? (
                      <span>Gotowe — czas na kolejną serię</span>
                    ) : (
                      <>
                        <span style={{ color: 'var(--muted)' }}>Przerwa</span>
                        <span className="tabular-nums font-bold ml-2">
                          {Math.floor(restRemainingSec / 60)}:{String(restRemainingSec % 60).padStart(2, '0')}
                        </span>
                      </>
                    )}
                  </div>
                  {restRemainingMs > 0 ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleAddRestTime(30)}
                        className="rest-timer-action"
                        aria-label="Dodaj 30 sekund"
                      >
                        +30s
                      </button>
                      <button
                        type="button"
                        onClick={handleSkipRest}
                        className="rest-timer-action rest-timer-action--icon"
                        aria-label="Pomiń przerwę"
                      >
                        ✕
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSkipRest}
                      className="rest-timer-action"
                      aria-label="Zamknij"
                    >
                      OK
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

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
            setShowPicker(false)
            void handlePickExercise(id, name, source)
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
          onCancel={() => {
            setConfirmDiscard(false)
          }}
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

      {pendingExerciseRemovalIndex !== null && (
        <ConfirmDialog
          title="Usunąć ćwiczenie?"
          message="To usunie ćwiczenie wraz z wpisanymi seriami z aktywnej sesji."
          confirmLabel="Usuń ćwiczenie"
          cancelLabel="Zostaw"
          danger
          onConfirm={handleConfirmRemoveExercise}
          onCancel={() => setPendingExerciseRemovalIndex(null)}
        />
      )}
    </>
  )
}
