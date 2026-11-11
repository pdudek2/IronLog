import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import ReadinessWidget from '../components/ReadinessWidget'
import { TodayExercises, TrainTime } from '../components/TrainToday'
import { buildNextSessionRecommendation, type TodayOptions } from '../shared/nextSessionRecommendation'
import type { CompressionProposal } from '../shared/compressionRecord'
import { planDayId as planDayIdOf } from '../shared/planDay'
import { useUserExercises } from '../hooks/useUserExercises'
import { recordPlanSkip } from '../lib/planSkipService'
import TemplateLaunchConfirmDialog from '../components/TemplateLaunchConfirmDialog'
import WorkoutPickerDialog, { type WorkoutSelectionKey } from '../components/WorkoutPickerDialog'
import { ActionFeedback } from '../components/ActionFeedback'
import { Bone, Button, PageSkeleton } from '../components/ui'
import {
  getTemplates,
  templateExerciseKey,
  type TemplateExercise,
  type TemplateExerciseHistoryMap,
  type TemplateLaunch,
  type WorkoutTemplate,
} from '../lib/templateService'
import type { ReadinessEntry } from '../lib/readinessService'
import { useTemplateWorkoutLaunch } from '../hooks/useTemplateWorkoutLaunch'
import { usePassiveActiveSessionSync } from '../hooks/usePassiveActiveSessionSync'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { preloadRouteByPath } from '../router/pageLoaders'
import {
  getRecentWorkouts, retryWorkoutMaterialization, countWeeklyWorkouts,
  calcStreak, calcVolume, type WorkoutSummary,
} from '../lib/workoutService'
import { getCappedWorkoutFinishedAt, hasRecordedDuration } from '../lib/sessionDuration'
import { pluralize } from '../lib/pluralize'
import { workoutTitle } from '../lib/workoutCopy'
import { useAuthStore } from '../store/authStore'
import { useDashboardStore } from '../store/dashboardStore'
import { useProfileStore } from '../store/profileStore'
import { useWorkoutStore } from '../store/workoutStore'
import type { DataState } from '../types/dataState'
import { formatCompactVolume, kgStringToDisplayWeight } from '../lib/weightUnits'
import type { Units } from '../lib/userProfile'
import { ElapsedSessionTimer } from '../components/ActiveWorkoutReturnBar'
import { TrainCoverMedia } from '../components/TrainCoverMedia'
import { latestRecord, recordLine } from '../shared/workoutMoments'
import { templateStartWeight } from '../shared/workoutDisplay'
import { loadTemplateExerciseHistory } from '../lib/templateLaunchService'
import { WORKOUT_COVERS, workoutCover } from '../shared/workoutCover'
import { WEEK_LABELS, addLocalDays, getGreeting, getWeekDates, nextPlanWorkout, weekdayLabel } from '../shared/week'
import PastePlanSheet from '../components/PastePlanSheet'
import { useStarterPlan } from '../hooks/useStarterPlan'

interface TemplatesResource {
  uid: string | null
  state: DataState<WorkoutTemplate[]>
}

interface ReadinessResource {
  uid: string | null
  state: DataState<ReadinessEntry | null>
}

interface WorkoutSelectionResource {
  uid: string | null
  initialized: boolean
  target: WorkoutSelectionKey | null
  unavailable: boolean
}

function resolveWorkoutSelection(
  templates: WorkoutTemplate[],
  selection: WorkoutSelectionKey | null,
): { template: WorkoutTemplate, dayIndex: number } | null {
  if (!selection) return null
  const template = templates.find((candidate) => candidate.id === selection.templateId)
  const day = template?.days[selection.dayIndex]
  return template && day && day.exercises.length > 0
    ? { template, dayIndex: selection.dayIndex }
    : null
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

function fadeUp(delay: number) {
  return {
    initial: false,
    animate: { opacity: 1, y: 0 },
    transition: { delay: delay > 0 ? 0.04 : 0, duration: 0.22 },
  }
}

// Decoded before Train renders, so a cover never pops in behind its title.
for (const file of ['week', ...WORKOUT_COVERS.flatMap((cover) => [cover, `${cover}-start`])]) new Image().src = `/covers/${file}.jpg`

function DashboardLoadingSkeleton() {
  return (
    <PageSkeleton label="Loading dashboard..." className="dashboard-page">
      <section className="train-hero">
        <div className="train-cover" />
        <div className="train-plan">
          <TrainPlanBones />
        </div>
      </section>
    </PageSkeleton>
  )
}

function TrainPlanBones() {
  return (
    <div className="train-exercises" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((row) => <Bone key={row} height="1rem" style={{ margin: '0.75rem 0' }} />)}
    </div>
  )
}

function TrainExercises({ uid, template, dayIndex, units, onOpen }: {
  uid: string
  template: WorkoutTemplate
  dayIndex: number
  units: Units
  onOpen: (exercise: TemplateExercise) => void
}) {
  const [best, setBest] = useState<TemplateExerciseHistoryMap | null>(null)

  useEffect(() => {
    let current = true
    void loadTemplateExerciseHistory(uid, template, dayIndex).then((history) => {
      if (current) setBest(history)
    })
    return () => { current = false }
  }, [uid, template, dayIndex])

  return (
    <div className="train-exercises">
      {template.days[dayIndex]?.exercises.map((exercise) => {
        const weight = best ? templateStartWeight(exercise, best.get(templateExerciseKey(exercise.exerciseId, exercise.exerciseSource))) : 0
        return (
          <button
            key={`${exercise.exerciseSource}:${exercise.exerciseId}`}
            type="button"
            className="train-exercise"
            onClick={() => onOpen(exercise)}
          >
            <span>{exercise.name}</span>
            <span>
              {exercise.sets} × {exercise.targetReps}
              {weight > 0 && (
                <>
                  {' · '}
                  <b>{kgStringToDisplayWeight(String(weight), units)} {units}</b>
                </>
              )}
            </span>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}

interface TodayChoice { key: string | null; budgetMin: number | null; straight: boolean; proposals: CompressionProposal[] }

export default function DashboardPage() {
  const { user } = useAuthStore()
  usePassiveActiveSessionSync(user?.uid)
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const { profile } = useProfileStore()
  const units = profile?.units ?? 'kg'
  const active = useWorkoutStore((state) => state.active)
  const navigate = useNavigate()
  const {
    workouts: snapshotWorkouts,
    weeklyDone: snapshotWeeklyDone,
    uid: snapshotUid,
    ready: snapshotReady,
    setSnapshot,
  } = useDashboardStore()
  const ownsSnapshot = snapshotUid === user?.uid
  const workouts = ownsSnapshot ? snapshotWorkouts : []
  const weeklyDone = ownsSnapshot ? snapshotWeeklyDone : 0
  const dashboardReady = ownsSnapshot && snapshotReady
  const [openingWorkout, setOpeningWorkout] = useState(false)
  // The last plans keep Train still on return; loadTemplates refreshes them behind it.
  const [cachedPlans] = useState(() => {
    const plans = useDashboardStore.getState().plans
    return plans?.uid === user?.uid ? plans : null
  })
  const [templatesResource, setTemplatesResource] = useState<TemplatesResource>({
    uid: user?.uid ?? null,
    state: cachedPlans ? { status: 'success', data: cachedPlans.templates } : { status: 'loading' },
  })
  const [workoutSelection, setWorkoutSelection] = useState<WorkoutSelectionResource>({
    uid: cachedPlans?.uid ?? null,
    initialized: false,
    target: cachedPlans ? nextPlanWorkout(cachedPlans.templates, ownsSnapshot ? snapshotWorkouts : []) : null,
    unavailable: false,
  })
  const [workoutPickerOpen, setWorkoutPickerOpen] = useState(false)
  const [todayChoice, setTodayChoice] = useState<TodayChoice>({ key: null, budgetMin: null, straight: false, proposals: [] })
  const [skipping, setSkipping] = useState(false)
  const [pasting, setPasting] = useState(false)
  const starter = useStarterPlan(() => handleRetryTemplates())
  const { exercises: userExerciseList } = useUserExercises(user?.uid ?? null)
  const [workoutPicked, setWorkoutPicked] = useState(false)
  const workoutPickedRef = useRef(false)
  const {
    pendingLaunch,
    launchOperation,
    launchingTemplateId,
    requestTemplateLaunch,
    confirmTemplateLaunch,
    cancelTemplateLaunch,
    retryTemplateLaunch,
    dismissTemplateLaunchError,
  } = useTemplateWorkoutLaunch(user?.uid, (target, currentTemplates) => {
    if (!user) return
    setWorkoutSelection((current) => (
      current.uid === user.uid
        && current.target?.templateId === target.template.id
        && current.target.dayIndex === target.dayIndex
        ? { ...current, target: null, unavailable: true }
        : current
    ))
    setTemplatesResource({ uid: user.uid, state: { status: 'success', data: currentTemplates } })
  })
  const [readinessResource, setReadinessResource] = useState<ReadinessResource>({
    uid: user?.uid ?? null,
    state: { status: 'loading' },
  })
  const [dashboardError, setDashboardError] = useState(false)
  const [dashboardLoadAttempt, setDashboardLoadAttempt] = useState(0)
  const workoutsRef = useRef<WorkoutSummary[]>([])
  const snapshotRequestRef = useRef(0)
  const dashboardScopeRef = useRef<{ uid: string } | null>(null)
  const materializationRetriesRef = useRef(new Map<string, Promise<void>>())
  const templatesMountedRef = useRef(false)
  const templatesRequestRef = useRef(0)
  const requestedTemplatesUserRef = useRef<string | null>(null)
  const inFlightTemplatesUserRef = useRef<string | null>(null)

  useEffect(() => {
    dashboardScopeRef.current = user?.uid ? { uid: user.uid } : null
    const snapshot = useDashboardStore.getState()
    workoutsRef.current = snapshot.uid === user?.uid ? snapshot.workouts : []
    const retries = materializationRetriesRef.current
    return () => {
      dashboardScopeRef.current = null
      retries.clear()
    }
  }, [user?.uid])

  const captureDashboardScope = useCallback((uid: string) => {
    const scope = dashboardScopeRef.current
    return () => scope !== null
      && scope.uid === uid
      && dashboardScopeRef.current === scope
      && useAuthStore.getState().user?.uid === uid
  }, [])

  const loadTemplates = useCallback((uid: string) => {
    if (inFlightTemplatesUserRef.current === uid) return
    const requestId = ++templatesRequestRef.current
    inFlightTemplatesUserRef.current = uid

    getTemplates(uid)
      .then((data) => {
        if (!templatesMountedRef.current || requestId !== templatesRequestRef.current) return
        setTemplatesResource({ uid, state: { status: 'success', data } })
        useDashboardStore.getState().setPlans(uid, data)
        setWorkoutSelection((current) => {
          if (current.uid !== uid || !current.initialized) {
            return {
              uid,
              initialized: true,
              target: nextPlanWorkout(data, workoutsRef.current),
              unavailable: false,
            }
          }
          // A first plan added on Train (the starter plan) becomes today's workout.
          if (!current.target) return current.unavailable ? current : { ...current, target: nextPlanWorkout(data, workoutsRef.current) }
          if (resolveWorkoutSelection(data, current.target)) return current
          return { ...current, target: null, unavailable: true }
        })
      })
      .catch((error: unknown) => {
        if (!templatesMountedRef.current || requestId !== templatesRequestRef.current) return
        console.error('[DashboardPage] getTemplates failed', error)
        toast.error('Could not load plans.')
        setTemplatesResource({ uid, state: { status: 'error', error } })
      })
      .finally(() => {
        if (requestId === templatesRequestRef.current) inFlightTemplatesUserRef.current = null
      })
  }, [])

  const retryProjectionOnce = useCallback((workoutId: string): Promise<void> => {
    const existingRetry = materializationRetriesRef.current.get(workoutId)
    if (existingRetry) return existingRetry

    const retry = Promise.resolve()
      .then(() => retryWorkoutMaterialization(workoutId))
      .finally(() => {
        if (materializationRetriesRef.current.get(workoutId) === retry) {
          materializationRetriesRef.current.delete(workoutId)
        }
      })
    materializationRetriesRef.current.set(workoutId, retry)
    return retry
  }, [])

  const refreshDashboardSnapshot = useCallback(async (uid: string): Promise<WorkoutSummary[] | null> => {
    const isCurrent = captureDashboardScope(uid)
    if (!isCurrent()) return null
    const requestId = ++snapshotRequestRef.current
    let all: WorkoutSummary[]
    try {
      all = await getRecentWorkouts(uid, 50)
    } catch (error) {
      if (!isCurrent() || requestId !== snapshotRequestRef.current) return null
      throw error
    }
    if (!isCurrent() || requestId !== snapshotRequestRef.current) return null

    if (setSnapshot(uid, {
      workouts: all,
      weeklyDone: countWeeklyWorkouts(all),
      streak: calcStreak(all),
    })) {
      workoutsRef.current = all
      // The queue moves on once the finished workout is in; a day the user picked stays.
      const plans = useDashboardStore.getState().plans
      if (plans?.uid === uid && !workoutPickedRef.current) {
        setWorkoutSelection((current) => (current.uid === uid && current.initialized && !current.unavailable
          ? { ...current, target: nextPlanWorkout(plans.templates, all) }
          : current))
      }
    }
    return all
  }, [captureDashboardScope, setSnapshot])

  const retryPendingProjections = useCallback(async (
    uid: string,
    all: WorkoutSummary[],
  ) => {
    const isCurrent = captureDashboardScope(uid)
    if (!isCurrent()) return
    const pending = all.filter((workout) => !workout.materialized)
    if (pending.length === 0) return

    const results = await Promise.allSettled(
      pending.map((workout) => retryProjectionOnce(workout.id)),
    )

    if (!isCurrent() || !results.some((result) => result.status === 'fulfilled')) return
    await refreshDashboardSnapshot(uid).catch(() => undefined)
  }, [captureDashboardScope, refreshDashboardSnapshot, retryProjectionOnce])

  const fetchData = useCallback(async (uid: string) => {
    const isCurrent = captureDashboardScope(uid)
    if (!isCurrent()) return
    setDashboardError(false)
    try {
      const all = await refreshDashboardSnapshot(uid)
      if (all && isCurrent()) void retryPendingProjections(uid, all)
    } catch (error) {
      if (!isCurrent()) return
      console.error('[DashboardPage] getRecentWorkouts failed', error)
      setDashboardError(true)
      toast.error('Could not load workouts. Try again.')
    }
  }, [captureDashboardScope, refreshDashboardSnapshot, retryPendingProjections])

  useEffect(() => {
    if (!user) return
    void Promise.resolve()
      .then(() => fetchData(user.uid))
  }, [dashboardLoadAttempt, user, fetchData])

  useEffect(() => {
    function handleOnline() {
      if (user) void retryPendingProjections(user.uid, workoutsRef.current)
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [retryPendingProjections, user])

  useEffect(() => {
    if (!user) return
    templatesMountedRef.current = true
    if (requestedTemplatesUserRef.current !== user.uid) {
      requestedTemplatesUserRef.current = user.uid
      loadTemplates(user.uid)
    }
    return () => {
      templatesMountedRef.current = false
    }
  }, [loadTemplates, user])

  const hasActiveSession = active !== null
  const handleReadinessStateChange = useCallback((state: DataState<ReadinessEntry | null>) => {
    setReadinessResource({ uid: user?.uid ?? null, state })
  }, [user?.uid])

  async function handleOpenWorkout() {
    if (openingWorkout) return
    setOpeningWorkout(true)
    try {
      await preloadRouteByPath('/workout/new')
    } finally {
      if (hasActiveSession) navigate('/workout/new')
      else navigate('/workout/new', { state: { startNew: true } })
      setOpeningWorkout(false)
    }
  }

  if (dashboardError && !dashboardReady) {
    return (
      <div className="dashboard-load-state" role="alert">
        <div>
          <p className="text-lg font-semibold text-white">Could not load the dashboard</p>
          <p className="mt-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>
            Workout data did not load. Check your connection and try again.
          </p>
          <Button
            type="button"
            className="mt-5 min-w-[12rem]"
            onClick={() => setDashboardLoadAttempt((value) => value + 1)}
          >
            Try again
          </Button>
        </div>
      </div>
    )
  }

  if (!dashboardReady && !!user) {
    return <DashboardLoadingSkeleton />
  }

  const weeklyGoal = profile?.weeklyGoal ?? 3
  const weekDates = getWeekDates(new Date())
  const today = new Date()
  const templatesState: DataState<WorkoutTemplate[]> =
    templatesResource.uid === user?.uid
      ? templatesResource.state
      : { status: 'loading' }
  const templates = templatesState.status === 'success' ? templatesState.data : []
  // A new account has nothing to start from a plan, so an empty workout is the main action.
  const noPlans = templatesState.status === 'success' && templates.length === 0
  const plansLoading = templatesState.status === 'loading' && !hasActiveSession
  const selectedWorkout = workoutSelection.uid === user?.uid
    ? resolveWorkoutSelection(templates, workoutSelection.target)
    : null
  const quickTemplate = selectedWorkout?.template ?? null
  const quickTemplateDayIndex = selectedWorkout?.dayIndex ?? -1
  const quickTemplateDay = quickTemplateDayIndex >= 0
    ? quickTemplate?.days[quickTemplateDayIndex] ?? null
    : null
  const quickTemplateRequestKey = quickTemplate
    ? `dashboard:${quickTemplate.id}:selection:${quickTemplateDayIndex}`
    : null
  const quickTemplateLaunchOperation = quickTemplateRequestKey
    && launchOperation?.target.requestKey === quickTemplateRequestKey
    ? launchOperation
    : null
  const quickTemplateLaunchErrorId = quickTemplate
    ? `dashboard-quick-template-launch-error-${quickTemplate.id}`
    : undefined
  const readinessState: DataState<ReadinessEntry | null> =
    readinessResource.uid === user?.uid
      ? readinessResource.state
      : { status: 'loading' }
  const quickTemplateHasExercises = Boolean(quickTemplateDay)
  // The time chosen today belongs to the day on screen; another day starts from Usual.
  const choice: TodayChoice = todayChoice.key === quickTemplateRequestKey ? todayChoice : { key: quickTemplateRequestKey, budgetMin: null, straight: false, proposals: [] }
  const userExerciseMeta = new Map(userExerciseList.map((exercise) => [`user:${exercise.id}`, exercise]))
  const todayOptions = (budgetMin: number | null, straight: boolean): TodayOptions => ({
    budgetMin, straight, userExercises: userExerciseMeta,
    templateId: quickTemplate?.id ?? null, planDayId: quickTemplateDay ? planDayIdOf(quickTemplateDay, quickTemplateDayIndex) : null,
  })
  const readinessEntry = readinessState.status === 'success' ? readinessState.data : null
  const planToday = (budgetMin: number | null, straight: boolean) => quickTemplate && quickTemplateDay?.exercises.length
    ? buildNextSessionRecommendation(quickTemplate, quickTemplateDayIndex, readinessEntry, workouts, Date.now(), units, todayOptions(budgetMin, straight))
    : null
  const todayPlan = hasActiveSession ? null : planToday(choice.budgetMin, choice.straight)
  // Start launches today's version once the user gave a time or checked in; an untouched day starts the plan as written.
  const todayLaunch: TemplateLaunch | undefined = todayPlan && (choice.budgetMin !== null || choice.proposals.length > 0 || readinessEntry)
    // Without a check-in, today's version keeps the usual day's weights, so a shorter day never changes a load.
    ? { items: readinessEntry ? todayPlan.launch : todayPlan.launch.map((item) => ({ dayExerciseIndex: item.dayExerciseIndex, sets: item.sets, ...(item.group ? { group: item.group } : {}) })), ...(todayPlan.record ? { compression: todayPlan.record } : {}), ...(choice.proposals.length ? { proposals: choice.proposals } : {}) }
    : undefined
  function chooseTime(budgetMin: number | null, straight: boolean) {
    const proposal = planToday(budgetMin, straight)
    const mode: CompressionProposal['mode'] = budgetMin === null ? 'usual' : proposal?.record?.mode ?? 'usual'
    setTodayChoice({ key: quickTemplateRequestKey, budgetMin, straight, proposals: [...choice.proposals, { budgetMin, mode }].slice(-12) })
  }
  async function skipToday() {
    if (!user || !quickTemplate || !quickTemplateDay || skipping) return
    setSkipping(true)
    try {
      await recordPlanSkip(user.uid, quickTemplate.id, planDayIdOf(quickTemplateDay, quickTemplateDayIndex))
      toast.success(`Skipped today. ${quickTemplateDay.name} stays next.`)
      setTodayChoice({ key: quickTemplateRequestKey, budgetMin: null, straight: false, proposals: [] })
    } catch {
      toast.error('Could not skip today. Try again.')
    } finally {
      setSkipping(false)
    }
  }
  function handleRetryTemplates() {
    if (!user) return
    requestedTemplatesUserRef.current = user.uid
    setTemplatesResource({ uid: user.uid, state: { status: 'loading' } })
    loadTemplates(user.uid)
  }

  function chooseWorkout(selection: WorkoutSelectionKey) {
    if (!user || !resolveWorkoutSelection(templates, selection)) return
    dismissTemplateLaunchError()
    setWorkoutSelection({
      uid: user.uid,
      initialized: true,
      target: selection,
      unavailable: false,
    })
    setWorkoutPicked(true)
    workoutPickedRef.current = true
    setWorkoutPickerOpen(false)
  }

  function editPickerPlan(templateId: string) {
    setWorkoutPickerOpen(false)
    navigate(`/templates/${templateId}/edit`)
  }

  function launchSelectedWorkout(launch?: TemplateLaunch) {
    if (!user || workoutSelection.uid !== user.uid || !workoutSelection.target) return
    const resolved = resolveWorkoutSelection(templates, workoutSelection.target)
    if (!resolved) {
      dismissTemplateLaunchError()
      setWorkoutSelection((current) => ({ ...current, target: null, unavailable: true }))
      return
    }
    const requestKey = `dashboard:${resolved.template.id}:selection:${resolved.dayIndex}`
    if (launch) {
      void requestTemplateLaunch(resolved.template, resolved.dayIndex, requestKey, launch)
    } else {
      void requestTemplateLaunch(resolved.template, resolved.dayIndex, requestKey)
    }
  }
  const weekStart = weekDates[0]?.getTime() ?? 0
  const weekEnd = addLocalDays(weekDates[6] ?? new Date(weekStart), 1).getTime()
  const previousWeekStart = addLocalDays(weekDates[0] ?? new Date(weekStart), -7).getTime()
  const weeklyWorkouts = workouts.filter((workout) => workout.startedAt >= weekStart && workout.startedAt < weekEnd)
  const previousWeekWorkouts = workouts.filter((workout) => workout.startedAt >= previousWeekStart && workout.startedAt < weekStart)
  const weeklyVolume = weeklyWorkouts.reduce((sum, workout) => sum + calcVolume(workout), 0)
  const previousWeeklyVolume = previousWeekWorkouts.reduce((sum, workout) => sum + calcVolume(workout), 0)
  // Imported workouts carry no time, so they are left out of the average.
  const timedWorkouts = weeklyWorkouts.filter((workout) => hasRecordedDuration(workout.startedAt, workout.finishedAt))
  const avgMinutes = timedWorkouts.length
    ? Math.round(timedWorkouts.reduce((sum, workout) => (
      sum + (getCappedWorkoutFinishedAt(workout.startedAt, workout.finishedAt) - workout.startedAt)
    ), 0) / timedWorkouts.length / 60_000)
    : 0
  const avgVolumePerSession = weeklyWorkouts.length ? Math.round(weeklyVolume / weeklyWorkouts.length) : 0
  const weeklySessionsDelta = weeklyDone - previousWeekWorkouts.length
  const weeklyVolumeDelta = previousWeeklyVolume > 0 && weeklyWorkouts.length > 0
    ? Math.round(((weeklyVolume - previousWeeklyVolume) / previousWeeklyVolume) * 100)
    : null
  const weekDailyStats = weekDates.map((date, index) => {
    const dayStart = date.getTime()
    const dayEnd = addLocalDays(date, 1).getTime()
    const dayWorkouts = weeklyWorkouts.filter((workout) => workout.startedAt >= dayStart && workout.startedAt < dayEnd)
    const volume = dayWorkouts.reduce((sum, workout) => sum + calcVolume(workout), 0)
    const sets = dayWorkouts.reduce((sum, workout) => (
      sum + workout.exercises.reduce((innerSum, exercise) => innerSum + exercise.sets.length, 0)
    ), 0)
    return {
      label: WEEK_LABELS[index],
      date,
      volume,
      sets,
      workouts: dayWorkouts.length,
      isToday: isSameDay(date, today),
    }
  })
  const activeDays = weekDailyStats.filter((day) => day.workouts > 0).length
  const peakDay = [...weekDailyStats].sort((a, b) => b.volume - a.volume)[0]
  const latestWorkout = workouts[0] ?? null
  const supportLine = !hasActiveSession && latestWorkout
    ? `Last: ${workoutTitle(latestWorkout)} · ${formatDate(latestWorkout.startedAt)}`
    : null
  const weekDetails = [
    {
      label: 'Schedule',
      value: `${activeDays}/7 days`,
      copy: weeklySessionsDelta >= 0
        ? `${weeklySessionsDelta === 0 ? 'No change' : `+${weeklySessionsDelta}`} compared with last week`
        : `${weeklySessionsDelta} compared with last week`,
    },
    {
      label: 'Strong day',
      value: peakDay?.volume ? peakDay.label : 'None',
      copy: peakDay?.volume ? `${formatCompactVolume(peakDay.volume, units)} • ${peakDay.sets} ${pluralize(peakDay.sets, 'set', 'sets')}` : 'No workouts this week',
    },
    {
      label: 'Average session',
      value: avgMinutes ? `${avgMinutes} min` : '—',
      copy: avgVolumePerSession ? `${formatCompactVolume(avgVolumePerSession, units)} per workout` : 'No average this week',
    },
    {
      label: 'Volume',
      value: formatCompactVolume(weeklyVolume, units),
      copy: weeklyVolumeDelta === null ? 'No change data yet' : `${weeklyVolumeDelta >= 0 ? '+' : ''}${weeklyVolumeDelta}% vs last week`,
    },
  ]

  // Picking a workout means the next session matters more than the finished week.
  const weekClosed = !plansLoading && !hasActiveSession && !workoutPicked && weeklyDone >= weeklyGoal
  const sessionLabel = active ? active.label?.trim() || 'Workout' : null
  const coverName = active ? workoutCover(active.label) : weekClosed ? 'week' : workoutCover(quickTemplateDay?.name ?? quickTemplate?.name)
  const record = latestRecord(workouts, today.getTime())

  const todayControls = !hasActiveSession && todayPlan && quickTemplateDay
  const dock = !hasActiveSession && (
    <section className="train-dock" aria-label="Today">
      {/* The check-in stays without a plan day too: Coach reads it. */}
      {!hasActiveSession && (
        <ReadinessWidget onStateChange={handleReadinessStateChange} editSaved />
      )}
      {todayControls && (
        <TrainTime
          today={todayPlan}
          plannedSets={quickTemplateDay.exercises.reduce((sum, exercise) => sum + exercise.sets, 0)}
          budgetMin={choice.budgetMin}
          straight={choice.straight}
          onBudget={(budgetMin) => chooseTime(budgetMin, budgetMin === null ? false : choice.straight)}
          onStraight={(straight) => chooseTime(choice.budgetMin, straight)}
        />
      )}
      <div className="train-dock-actions">
        {plansLoading ? <Bone height="3.25rem" style={{ borderRadius: '0.9375rem' }} /> : quickTemplateDay && quickTemplateHasExercises && quickTemplateRequestKey ? (
          <>
            {todayControls && choice.budgetMin !== null && !todayPlan.compression.fits && (
              <button type="button" className="workout-set-panel-action" data-quiet onClick={() => { void skipToday() }} disabled={skipping}>
                {skipping ? 'Skipping…' : 'Skip today'}
              </button>
            )}
            <button
              type="button"
              onClick={() => launchSelectedWorkout(todayLaunch)}
              disabled={launchingTemplateId !== null}
              aria-busy={quickTemplateLaunchOperation?.status === 'pending' ? 'true' : undefined}
              aria-describedby={quickTemplateLaunchOperation?.status === 'error'
                ? quickTemplateLaunchErrorId
                : undefined}
              className="workout-set-panel-action"
            >
              {quickTemplateLaunchOperation?.status === 'pending' ? 'Starting…' : `Start ${quickTemplateDay.name}`}
            </button>
          </>
        ) : noPlans ? (
          <div className="train-dock-start">
            <button type="button" className="workout-set-panel-action" onClick={() => setPasting(true)}>
              Paste a plan
            </button>
            <button type="button" className="workout-set-panel-action" data-quiet onClick={() => { void starter.create() }} disabled={starter.saving}>
              {starter.saving ? 'Adding…' : 'Use the starter plan'}
            </button>
            <button type="button" className="workout-set-panel-action" data-quiet onClick={() => navigate('/templates/new')}>
              Build a plan
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { void handleOpenWorkout().catch(() => undefined) }}
            disabled={openingWorkout}
            className="workout-set-panel-action"
          >
            {openingWorkout ? 'Opening workout…' : 'Start empty workout'}
          </button>
        )}
      </div>
    </section>
  )

  return (
    <div className="dashboard-page">
        <section className="train-hero">
          <motion.div
            className="train-cover"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.22 }}
          >
            {!plansLoading && <TrainCoverMedia key={coverName} cover={coverName} />}
            <div className="train-cover-copy">
              <p className="train-date">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <h1 className="train-title">
                {plansLoading
                  ? <Bone width="9rem" height="2.25rem" />
                  : sessionLabel ?? (weekClosed
                    ? 'Week done'
                    : quickTemplateDay?.name ?? `${getGreeting(new Date())}, ${profile?.displayName ?? 'athlete'}`)}
              </h1>
              {plansLoading
                ? <Bone width="11rem" height="0.875rem" />
                : active ? null : weekClosed
                ? <p className="train-meta">{weeklyDone} of {weeklyGoal} workouts · {formatCompactVolume(weeklyVolume, units)}</p>
                : quickTemplate && quickTemplateDay
                ? <p className="train-meta">{quickTemplate.name} · Day {quickTemplateDayIndex + 1} of {quickTemplate.days.length}</p>
                : supportLine && <p className="train-meta">{supportLine}</p>}
            </div>
            {record && <i className="train-record-seam" aria-hidden="true" />}
          </motion.div>

          <div className="train-plan">
            {record && (
              <p className="train-record">
                {recordLine(record, today, (kg) => `${kgStringToDisplayWeight(String(kg), units)} ${units}`)}
              </p>
            )}
            {plansLoading ? <TrainPlanBones /> : weekClosed ? (
              <div className="train-exercises">
                {[...weeklyWorkouts].reverse().map((workout) => (
                  <button
                    key={workout.id}
                    type="button"
                    className="train-exercise"
                    onClick={() => navigate(`/workout/${workout.id}`, { state: { from: 'train' } })}
                  >
                    <span>{weekdayLabel(workout.startedAt)} · {workoutTitle(workout)}</span>
                    <span>{formatCompactVolume(calcVolume(workout), units)}</span>
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                ))}
              </div>
            ) : !hasActiveSession && user && quickTemplate && quickTemplateHasExercises && todayPlan && (todayPlan.record || readinessEntry) ? (
              <TodayExercises
                uid={user.uid}
                template={quickTemplate}
                dayIndex={quickTemplateDayIndex}
                checkedIn={readinessEntry !== null}
                today={todayPlan}
                exercises={quickTemplateDay?.exercises ?? []}
                units={units}
                onOpen={(exercise) => navigate(`/exercises/${exercise.exerciseSource}/${exercise.exerciseId}`)}
              />
            ) : !hasActiveSession && user && quickTemplate && quickTemplateHasExercises ? (
              <TrainExercises
                key={quickTemplateRequestKey}
                uid={user.uid}
                template={quickTemplate}
                dayIndex={quickTemplateDayIndex}
                units={units}
                onOpen={(exercise) => navigate(`/exercises/${exercise.exerciseSource}/${exercise.exerciseId}`)}
              />
            ) : !hasActiveSession && (
              <div className="dashboard-workout-choice-empty">
                <strong>
                  {templatesState.status === 'error'
                      ? 'Plans unavailable'
                      : workoutSelection.unavailable
                        ? 'Workout no longer available'
                        : templates.length === 0 ? 'No plans yet' : 'No workouts in your plans'}
                </strong>
                <span>
                  {workoutSelection.unavailable
                    ? 'Choose another workout before starting.'
                    : noPlans
                      ? 'Paste the plan you already follow, or start from ours.'
                      : 'You can still start an empty workout.'}
                </span>
                {templatesState.status === 'error' && (
                  <button type="button" className="dashboard-planned-start-change" onClick={handleRetryTemplates}>
                    Try again
                  </button>
                )}
              </div>
            )}

            {quickTemplateLaunchOperation?.status === 'error'
              && quickTemplateLaunchErrorId && (
              <ActionFeedback
                id={quickTemplateLaunchErrorId}
                status="error"
                message={quickTemplateLaunchOperation.errorMessage ?? 'Could not start the plan.'}
                onRetry={() => { void retryTemplateLaunch() }}
                onDismiss={dismissTemplateLaunchError}
                className="dashboard-quick-plan-feedback"
              />
            )}

            {!isDesktop && dock}

            {active && (
              <section className="train-start" role="region" aria-label="Active workout">
                <button
                  type="button"
                  onClick={() => navigate('/workout/new')}
                  className="dashboard-planned-start-primary"
                  aria-label="Return to workout"
                >
                  Resume <span>{sessionLabel}</span> · <ElapsedSessionTimer startedAt={active.startedAt} className="tabular-nums" />
                </button>
              </section>
            )}

            <div className="train-links">
              <button type="button" className="train-link" onClick={() => navigate('/templates')}>Plans</button>
              {!hasActiveSession && templatesState.status === 'success' && templates.some((template) => template.days.some((day) => day.exercises.length > 0)) && (
                <button
                  type="button"
                  className="train-link dashboard-planned-start-change"
                  onClick={() => setWorkoutPickerOpen(true)}
                  disabled={launchingTemplateId !== null}
                >
                  Change workout
                </button>
              )}
              {!hasActiveSession && (
                <button
                  type="button"
                  className="train-link dashboard-ad-hoc-action"
                  onClick={() => { void handleOpenWorkout().catch(() => undefined) }}
                  disabled={openingWorkout}
                >
                  {openingWorkout ? 'Opening workout…' : noPlans ? 'Start empty workout' : 'Empty workout'}
                </button>
              )}
            </div>
          </div>

          <div className="train-side">
            {isDesktop && dock}
            <motion.div className="train-week" {...fadeUp(0.09)}>
              <div className="train-week-head">
                <h2>This week</h2>
                <span>
                  {weeklyDone} of {weeklyGoal}
                  {weeklyVolume > 0 && ` · ${formatCompactVolume(weeklyVolume, units)}`}
                </span>
              </div>
              <div className="train-days" aria-label="Days of the current week">
                {weekDailyStats.map((day) => (
                  <span key={day.label} data-done={day.workouts > 0} data-today={day.isToday} title={day.label}>
                    {day.label.charAt(0)}
                  </span>
                ))}
              </div>
              <details className="train-week-more">
                <summary>Week details<ChevronDown size={14} aria-hidden="true" /></summary>
                <dl>
                  {weekDetails.map((detail) => (
                    <div key={detail.label}>
                      <dt>{detail.label}</dt>
                      <dd>{detail.value}</dd>
                      <dd>{detail.copy}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            </motion.div>

          </div>
        </section>

      {workoutPickerOpen && templatesState.status === 'success' && (
        <WorkoutPickerDialog
          templates={templates}
          selected={workoutSelection.uid === user?.uid ? workoutSelection.target : null}
          onChoose={chooseWorkout}
          onCancel={() => setWorkoutPickerOpen(false)}
          onEdit={editPickerPlan}
        />
      )}

      <AnimatePresence>
        {pasting && <PastePlanSheet key="paste-plan" onClose={() => setPasting(false)} />}
      </AnimatePresence>

      <TemplateLaunchConfirmDialog
        open={pendingLaunch !== null}
        onConfirm={() => { void confirmTemplateLaunch() }}
        onCancel={cancelTemplateLaunch}
      />
    </div>
  )
}
