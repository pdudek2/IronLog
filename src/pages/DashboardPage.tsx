import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import ReadinessWidget from '../components/ReadinessWidget'
import NextSessionCard from '../components/NextSessionCard'
import TemplateLaunchConfirmDialog from '../components/TemplateLaunchConfirmDialog'
import WorkoutPickerDialog, { type WorkoutSelectionKey } from '../components/WorkoutPickerDialog'
import { ActionFeedback } from '../components/ActionFeedback'
import { Bone, Button, PageSkeleton } from '../components/ui'
import {
  getTemplates,
  type TemplateExerciseOverrideMap,
  type WorkoutTemplate,
} from '../lib/templateService'
import type { ReadinessEntry } from '../lib/readinessService'
import { useTemplateWorkoutLaunch } from '../hooks/useTemplateWorkoutLaunch'
import { usePassiveActiveSessionSync } from '../hooks/usePassiveActiveSessionSync'
import { preloadRouteByPath } from '../router/pageLoaders'
import {
  getRecentWorkouts, retryWorkoutMaterialization, countWeeklyWorkouts,
  calcStreak, calcVolume, type WorkoutSummary,
} from '../lib/workoutService'
import { getCappedWorkoutFinishedAt } from '../lib/sessionDuration'
import { pluralize } from '../lib/pluralize'
import { workoutTitle } from '../lib/workoutCopy'
import { useAuthStore } from '../store/authStore'
import { useDashboardStore } from '../store/dashboardStore'
import { useProfileStore } from '../store/profileStore'
import { useWorkoutStore } from '../store/workoutStore'
import type { DataState } from '../types/dataState'
import { formatCompactVolume, kgStringToDisplayWeight } from '../lib/weightUnits'
import { TrainCoverMedia } from '../components/TrainCoverMedia'
import { WORKOUT_COVERS, workoutCover } from '../shared/workoutCover'
import { WEEK_LABELS, addLocalDays, firstLaunchableWorkout, getGreeting, getWeekDates } from '../shared/week'

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
for (const cover of WORKOUT_COVERS) for (const file of [cover, `${cover}-start`]) new Image().src = `/covers/${file}.jpg`

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

export default function DashboardPage() {
  const { user } = useAuthStore()
  usePassiveActiveSessionSync(user?.uid)
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
    initialized: cachedPlans !== null,
    target: cachedPlans ? firstLaunchableWorkout(cachedPlans.templates) : null,
    unavailable: false,
  })
  const [workoutPickerOpen, setWorkoutPickerOpen] = useState(false)
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
              target: firstLaunchableWorkout(data),
              unavailable: false,
            }
          }
          if (!current.target || resolveWorkoutSelection(data, current.target)) return current
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
    })) workoutsRef.current = all
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
  const showTodayRecommendation = !hasActiveSession
    && quickTemplateHasExercises
    && readinessState.status === 'success'
    && readinessState.data !== null
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
    setWorkoutPickerOpen(false)
  }

  function editPickerPlan(templateId: string) {
    setWorkoutPickerOpen(false)
    navigate(`/templates/${templateId}/edit`)
  }

  function launchSelectedWorkout(overrides?: TemplateExerciseOverrideMap) {
    if (!user || workoutSelection.uid !== user.uid || !workoutSelection.target) return
    const resolved = resolveWorkoutSelection(templates, workoutSelection.target)
    if (!resolved) {
      dismissTemplateLaunchError()
      setWorkoutSelection((current) => ({ ...current, target: null, unavailable: true }))
      return
    }
    const requestKey = `dashboard:${resolved.template.id}:selection:${resolved.dayIndex}`
    if (overrides) {
      void requestTemplateLaunch(resolved.template, resolved.dayIndex, requestKey, overrides)
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
  const avgMinutes = weeklyWorkouts.length
    ? Math.round(weeklyWorkouts.reduce((sum, workout) => (
      sum + (getCappedWorkoutFinishedAt(workout.startedAt, workout.finishedAt) - workout.startedAt)
    ), 0) / weeklyWorkouts.length / 60_000)
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

  const coverName = workoutCover(quickTemplateDay?.name ?? quickTemplate?.name)

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
                  : quickTemplateDay?.name ?? `${getGreeting(new Date())}, ${profile?.displayName ?? 'athlete'}`}
              </h1>
              {plansLoading
                ? <Bone width="11rem" height="0.875rem" />
                : quickTemplate && quickTemplateDay
                ? <p className="train-meta">{quickTemplate.name} · Day {quickTemplateDayIndex + 1} of {quickTemplate.days.length}</p>
                : supportLine && <p className="train-meta">{supportLine}</p>}
            </div>
          </motion.div>

          <div className="train-plan">
            {plansLoading ? <TrainPlanBones /> : quickTemplateDay && quickTemplateHasExercises ? (
              <div className="train-exercises">
                {quickTemplateDay.exercises.map((exercise) => (
                  <button
                    key={`${exercise.exerciseSource}:${exercise.exerciseId}`}
                    type="button"
                    className="train-exercise"
                    onClick={() => navigate(`/exercises/${exercise.exerciseSource}/${exercise.exerciseId}`)}
                  >
                    <span>{exercise.name}</span>
                    <span>
                      {exercise.sets} × {exercise.targetReps}
                      {exercise.targetWeight > 0 && (
                        <>
                          {' · '}
                          <b>{kgStringToDisplayWeight(String(exercise.targetWeight), units)} {units}</b>
                        </>
                      )}
                    </span>
                  </button>
                ))}
              </div>
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
                    : 'You can still start an empty workout.'}
                </span>
                {templatesState.status === 'error' && (
                  <button type="button" className="dashboard-planned-start-change" onClick={handleRetryTemplates}>
                    Try again
                  </button>
                )}
              </div>
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
              {!hasActiveSession && !noPlans && (
                <button
                  type="button"
                  className="train-link dashboard-ad-hoc-action"
                  onClick={() => { void handleOpenWorkout().catch(() => undefined) }}
                  disabled={openingWorkout}
                >
                  {openingWorkout ? 'Opening workout…' : 'Empty workout'}
                </button>
              )}
            </div>

            {!showTodayRecommendation
              && quickTemplateLaunchOperation?.status === 'error'
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

            {!hasActiveSession && (
              <div className="train-start">
                {plansLoading ? <Bone height="3.25rem" style={{ borderRadius: '0.9375rem' }} /> : quickTemplateDay && quickTemplateHasExercises && quickTemplateRequestKey ? (
                  <button
                    type="button"
                    onClick={() => launchSelectedWorkout()}
                    disabled={launchingTemplateId !== null}
                    aria-busy={quickTemplateLaunchOperation?.status === 'pending' ? 'true' : undefined}
                    aria-describedby={quickTemplateLaunchOperation?.status === 'error'
                      ? quickTemplateLaunchErrorId
                      : undefined}
                    className="dashboard-planned-start-primary"
                  >
                    {quickTemplateLaunchOperation?.status === 'pending' ? 'Starting…' : `Start ${quickTemplateDay.name}`}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => { void handleOpenWorkout().catch(() => undefined) }}
                    disabled={openingWorkout}
                    className="dashboard-ad-hoc-action--primary"
                  >
                    {openingWorkout ? 'Opening workout…' : 'Start empty workout'}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="train-side">
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
                <summary>Week details</summary>
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

            {!hasActiveSession && (
              <ReadinessWidget
                onStateChange={handleReadinessStateChange}
                renderSaved={(entry) => (
                  quickTemplate && quickTemplateHasExercises && quickTemplateRequestKey
                    ? (
                        <NextSessionCard
                          template={quickTemplate}
                          dayIndex={quickTemplateDayIndex}
                          readiness={entry}
                          workouts={workouts}
                          units={profile?.units ?? 'kg'}
                          launching={launchingTemplateId === quickTemplate.id}
                          describedBy={quickTemplateLaunchOperation?.status === 'error'
                            ? quickTemplateLaunchErrorId
                            : undefined}
                          onStart={(overrides) => {
                            launchSelectedWorkout(overrides)
                          }}
                          onEdit={() => navigate(`/templates/${quickTemplate.id}/edit`)}
                        />
                      )
                    : null
                )}
              />
            )}

            {showTodayRecommendation
              && quickTemplateLaunchOperation?.status === 'error'
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

      <TemplateLaunchConfirmDialog
        open={pendingLaunch !== null}
        onConfirm={() => { void confirmTemplateLaunch() }}
        onCancel={cancelTemplateLaunch}
      />
    </div>
  )
}
