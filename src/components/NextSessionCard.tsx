import { useId, useMemo, useRef } from 'react'
import { ChevronRight, X } from 'lucide-react'
import { buildNextSessionRecommendation } from '../lib/nextSessionRecommendation'
import type { ReadinessEntry } from '../lib/readinessService'
import type {
  TemplateExerciseOverrideMap,
  WorkoutTemplate,
} from '../lib/templateService'
import type { Units } from '../lib/userProfile'
import { kgToDisplayWeight } from '../lib/weightUnits'
import type { WorkoutSummary } from '../lib/workoutService'
import { pluralize } from '../lib/pluralize'

interface NextSessionCardProps {
  template: WorkoutTemplate
  dayIndex: number
  readiness: ReadinessEntry
  workouts: WorkoutSummary[]
  units: Units
  launching: boolean
  describedBy?: string
  onStart: (overrides: TemplateExerciseOverrideMap) => void
  onEdit: () => void
}

function formatDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return date
  const label = parsed.toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return `${label.charAt(0).toLocaleUpperCase('en-US')}${label.slice(1)}`
}

function formatWeight(weightKg: number, units: Units): string {
  if (weightKg <= 0) return 'no weight'
  return `${kgToDisplayWeight(weightKg, units).toLocaleString('en-US', {
    maximumFractionDigits: 1,
  })} ${units}`
}

function formatWeightDelta(deltaKg: number, units: Units): string {
  const delta = kgToDisplayWeight(Math.abs(deltaKg), units).toLocaleString('en-US', {
    maximumFractionDigits: 1,
  })
  return `${deltaKg > 0 ? '+' : '−'}${delta} ${units}`
}

export default function NextSessionCard({
  template,
  dayIndex,
  readiness,
  workouts,
  units,
  launching,
  describedBy,
  onStart,
  onEdit,
}: NextSessionCardProps) {
  const id = useId()
  const popoverId = `${id}-plan`
  const popoverTitleId = `${id}-plan-title`
  const popoverRef = useRef<HTMLElement>(null)
  const recommendation = useMemo(() => buildNextSessionRecommendation(
    template,
    dayIndex,
    readiness,
    workouts,
  ), [dayIndex, readiness, template, workouts])

  function closePopover() {
    const popover = popoverRef.current
    if (!popover || typeof popover.hidePopover !== 'function') return
    try {
      popover.hidePopover()
    } catch {
      // Already closed or not supported by the current browser implementation.
    }
  }

  function handleStart() {
    if (launching) return
    closePopover()
    onStart(recommendation.overrides)
  }

  function handleEdit() {
    closePopover()
    onEdit()
  }

  const count = recommendation.exercises.length
  const readinessLabel = recommendation.tone === 'high'
    ? 'high'
    : recommendation.tone === 'mid' ? 'moderate' : 'low'
  const reducedSets = recommendation.exercises.reduce((sum, exercise) => (
    sum + Math.max(0, -exercise.setsDelta)
  ), 0)
  const changedWeights = recommendation.exercises.filter((exercise) => exercise.weightDelta !== 0).length
  const hasAdjustments = reducedSets > 0 || changedWeights > 0
  const adjustmentLabel = [
    reducedSets > 0
      ? `${reducedSets} fewer ${pluralize(reducedSets, 'set', 'sets')}`
      : null,
    changedWeights > 0
      ? `${changedWeights} ${pluralize(changedWeights, 'weight', 'weights')} adjusted`
      : null,
  ].filter(Boolean).join(' · ') || 'Plan unchanged'

  return (
    <>
      <section
        className="dashboard-today-card"
        role="region"
        aria-label="Today’s workout"
      >
        <p className="dashboard-today-date">{formatDate(readiness.date)}</p>

        <header className="dashboard-today-head">
          <div>
            <p className="dashboard-today-plan-name">From plan · {template.name}</p>
            <h1>{recommendation.dayName}</h1>
            <p>{count} {pluralize(count, 'exercise', 'exercises')}</p>
          </div>
        </header>

        <p
          className="dashboard-today-adjustment"
          data-tone={recommendation.tone}
          data-adjusted={hasAdjustments}
          aria-label={`Readiness ${readinessLabel}, ${recommendation.score} out of 100. ${adjustmentLabel}`}
        >
          <span>Readiness {readinessLabel}</span>
          <strong>{adjustmentLabel}</strong>
        </p>

        <div className="dashboard-today-actions">
          <button
            type="button"
            className="dashboard-today-start"
            disabled={launching}
            aria-busy={launching || undefined}
            aria-describedby={describedBy}
            onClick={handleStart}
          >
            {launching ? 'Starting…' : `Start ${recommendation.dayName}`}
          </button>

          <button
            type="button"
            className="dashboard-today-trigger"
            popoverTarget={popoverId}
            aria-label="View plan exercises"
          >
            <span>View exercises</span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
      </section>

      <article
        ref={popoverRef}
        id={popoverId}
        className="dashboard-plan-popover"
        popover="auto"
        role="dialog"
        aria-labelledby={popoverTitleId}
      >
        <header className="dashboard-plan-popover-head">
          <div>
            <h2 id={popoverTitleId}>{recommendation.dayName}</h2>
            <p>{count} {pluralize(count, 'exercise', 'exercises')}</p>
          </div>
          <button
            type="button"
            className="dashboard-plan-popover-close"
            popoverTarget={popoverId}
            popoverTargetAction="hide"
            aria-label="Close plan"
            autoFocus
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <ol className="dashboard-plan-exercises" aria-label="Today’s plan">
          {recommendation.exercises.map((exercise, index) => (
            <li key={`${exercise.exerciseSource}:${exercise.exerciseId}:${index}`}>
              <div>
                <strong>{exercise.name}</strong>
                <span>{exercise.sets} × {exercise.reps}</span>
              </div>
              <div className="dashboard-plan-target">
                <strong>{formatWeight(exercise.weight, units)}</strong>
                {(exercise.weightDelta !== 0 || exercise.setsDelta !== 0) && (
                  <span data-tone={exercise.weightDelta > 0 ? 'up' : 'down'}>
                    {[
                      exercise.weightDelta !== 0
                        ? formatWeightDelta(exercise.weightDelta, units)
                        : null,
                      exercise.setsDelta !== 0
                        ? `−${Math.abs(exercise.setsDelta)} ${pluralize(Math.abs(exercise.setsDelta), 'set', 'sets')}`
                        : null,
                    ].filter(Boolean).join(' · ')}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ol>

        <div className="dashboard-plan-popover-actions">
          <button
            type="button"
            className="dashboard-today-start"
            disabled={launching}
            onClick={handleStart}
          >
            {launching ? 'Starting…' : 'Start'}
          </button>
          <button
            type="button"
            className="dashboard-plan-edit"
            onClick={handleEdit}
          >
            Edit
          </button>
        </div>
      </article>
    </>
  )
}
