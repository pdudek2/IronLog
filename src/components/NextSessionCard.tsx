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
import { polishPlural } from '../lib/polishPlural'

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
  const label = parsed.toLocaleDateString('pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return `${label.charAt(0).toLocaleUpperCase('pl-PL')}${label.slice(1)}`
}

function formatWeight(weightKg: number, units: Units): string {
  if (weightKg <= 0) return 'bez ciężaru'
  return `${kgToDisplayWeight(weightKg, units).toLocaleString('pl-PL', {
    maximumFractionDigits: 1,
  })} ${units}`
}

function formatWeightDelta(deltaKg: number, units: Units): string {
  const delta = kgToDisplayWeight(Math.abs(deltaKg), units).toLocaleString('pl-PL', {
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
    ? 'wysoka'
    : recommendation.tone === 'mid' ? 'umiarkowana' : 'niska'
  const reducedSets = recommendation.exercises.reduce((sum, exercise) => (
    sum + Math.max(0, -exercise.setsDelta)
  ), 0)
  const changedWeights = recommendation.exercises.filter((exercise) => exercise.weightDelta !== 0).length
  const hasAdjustments = reducedSets > 0 || changedWeights > 0
  const adjustmentLabel = [
    reducedSets > 0
      ? `${reducedSets} ${polishPlural(reducedSets, 'seria', 'serie', 'serii')} mniej`
      : null,
    changedWeights > 0
      ? `${changedWeights} ${polishPlural(changedWeights, 'obciążenie', 'obciążenia', 'obciążeń')} dopasowane`
      : null,
  ].filter(Boolean).join(' · ') || 'Plan bez zmian'

  return (
    <>
      <section
        className="dashboard-today-card"
        role="region"
        aria-label="Dzisiejszy trening"
      >
        <p className="dashboard-today-date">{formatDate(readiness.date)}</p>

        <header className="dashboard-today-head">
          <div>
            <p className="dashboard-today-plan-name">Z planu · {template.name}</p>
            <h1>{recommendation.dayName}</h1>
            <p>{count} {polishPlural(count, 'ćwiczenie', 'ćwiczenia', 'ćwiczeń')}</p>
          </div>
        </header>

        <p
          className="dashboard-today-adjustment"
          data-tone={recommendation.tone}
          data-adjusted={hasAdjustments}
          aria-label={`Gotowość ${readinessLabel}, ${recommendation.score} na 100. ${adjustmentLabel}`}
        >
          <span>Gotowość {readinessLabel}</span>
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
            {launching ? 'Uruchamiam…' : `Rozpocznij ${recommendation.dayName}`}
          </button>

          <button
            type="button"
            className="dashboard-today-trigger"
            popoverTarget={popoverId}
            aria-label="Zobacz ćwiczenia w planie"
          >
            <span>Zobacz ćwiczenia</span>
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
            <p>{count} {polishPlural(count, 'ćwiczenie', 'ćwiczenia', 'ćwiczeń')}</p>
          </div>
          <button
            type="button"
            className="dashboard-plan-popover-close"
            popoverTarget={popoverId}
            popoverTargetAction="hide"
            aria-label="Zamknij plan"
            autoFocus
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <ol className="dashboard-plan-exercises" aria-label="Dzisiejszy plan">
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
                        ? `−${Math.abs(exercise.setsDelta)} ${polishPlural(Math.abs(exercise.setsDelta), 'seria', 'serie', 'serii')}`
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
            {launching ? 'Uruchamiam…' : 'Rozpocznij'}
          </button>
          <button
            type="button"
            className="dashboard-plan-edit"
            onClick={handleEdit}
          >
            Edytuj
          </button>
        </div>
      </article>
    </>
  )
}
