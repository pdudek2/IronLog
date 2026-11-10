import type { ExerciseRef, MatchCandidate } from './exerciseMatch'
import { parsePlanText, resolvedPlan, type ParsedExercise, type ParsedPlan, type SkipReason } from './planText'
import { STARTER_PLAN_TEXT } from './starterPlan'

// What the plan editor shows for a pasted plan: recognised lines become plan exercises, the rest wait for the user.
export interface ImportedRow {
  name: string
  sets: number
  targetReps: number
  targetWeight: number
  // Muted line under the exercise: what was written when it differs from the exercise it became.
  detail: string | null
  exercise: ExerciseRef | null
  unmatched: { line: string; reason: 'generic' | 'unknown' | 'duplicate'; suggestions: ExerciseRef[] } | null
}
export interface ImportedPlan { name: string; days: { name: string; rows: ImportedRow[] }[]; skipped: { line: string; reason: string }[] }

export const PASTED_PLAN_NAME = 'Pasted plan'

const SKIP_LABELS: Record<Exclude<SkipReason, 'comment'>, string> = {
  warmUp: 'Warm-up, left out of the plan',
  emptyDay: 'Day without exercises',
  tooManyDays: 'More than 14 days',
  tooManyExercises: 'More than 20 exercises in a day',
  outOfRange: 'Sets, reps or weight could not be read',
}

function detailOf(exercise: ParsedExercise): string | null {
  const match = exercise.match
  const parts = [
    match.status === 'matched' && match.via === 'typo' ? exercise.name : null,
    match.status === 'matched' ? match.variant : null,
    exercise.note,
    exercise.simplified ? 'Simplified' : null,
  ]
  return parts.filter(Boolean).join(' · ') || null
}

export function importedPlan(parsed: ParsedPlan): ImportedPlan {
  return {
    name: parsed.name ?? PASTED_PLAN_NAME,
    days: parsed.days.map((day) => ({
      name: day.name,
      rows: day.exercises.map((exercise) => {
        const { match } = exercise
        const base = { name: exercise.name, sets: exercise.sets, targetReps: exercise.targetReps, targetWeight: exercise.targetWeight }
        if (match.status === 'matched' && !exercise.duplicate) {
          return { ...base, name: match.exercise.name, detail: detailOf(exercise), exercise: match.exercise, unmatched: null }
        }
        return {
          ...base, detail: detailOf(exercise), exercise: null,
          unmatched: match.status === 'matched'
            ? { line: exercise.source.trim(), reason: 'duplicate' as const, suggestions: [] }
            : { line: exercise.source.trim(), reason: match.status, suggestions: match.suggestions },
        }
      }),
    })),
    skipped: parsed.skipped.flatMap(({ source, reason }) => (reason === 'comment' ? [] : [{ line: source.trim(), reason: SKIP_LABELS[reason] }])),
  }
}

export function importPlanText(text: string, userExercises: MatchCandidate[] = []): ImportedPlan | null {
  const plan = importedPlan(parsePlanText(text, userExercises))
  return plan.days.length ? plan : null
}

export const unmatchedHint: Record<'generic' | 'unknown' | 'duplicate', string> = {
  generic: 'Which exercise?',
  unknown: 'Not in the library',
  duplicate: 'Already in this day',
}

export function starterPlanInput() {
  const plan = resolvedPlan(parsePlanText(STARTER_PLAN_TEXT))
  if (!plan) throw new Error('The starter plan has an unmatched exercise.')
  return plan
}
