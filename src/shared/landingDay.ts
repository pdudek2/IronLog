import { exercises as catalogue } from '../../data/exercises'
import { compressDay, type CompressionResult, type DayExercise } from './compression'
import type { ParsedPlan } from './planText'

// The landing shows „Jak dziś?” on a plan without an account: the same compression, a cold-start pace, nothing saved.
export interface LandingExercise extends DayExercise { name: string; reps: number; weight: number }
export interface LandingDay { name: string; exercises: LandingExercise[] }

const meta = new Map(catalogue.map((exercise) => [exercise.id, exercise]))

function fromCatalogue(id: string, sets: number, reps: number, weight: number): LandingExercise {
  const exercise = meta.get(id)!
  return { exerciseId: id, exerciseSource: 'global', name: exercise.name, sets, reps, weight, muscles: exercise.muscles, equipment: exercise.equipment, category: exercise.category }
}

export const EXAMPLE_DAY: LandingDay = {
  name: 'Upper',
  exercises: [
    fromCatalogue('bench-press', 4, 6, 80),
    fromCatalogue('lat-pulldown', 3, 10, 60),
    fromCatalogue('seated-cable-row', 3, 10, 55),
    fromCatalogue('ohp', 3, 8, 40),
    fromCatalogue('db-lateral-raise', 3, 15, 10),
    fromCatalogue('tricep-pushdown', 3, 12, 25),
    fromCatalogue('db-curl', 3, 12, 12),
  ],
}

// Lines the catalogue does not know still count toward the time; they just never pair.
export function landingDays(parsed: ParsedPlan): LandingDay[] {
  return parsed.days.flatMap((day) => {
    // A typo match waits for the user's look in the app; with nobody to ask, the landing keeps the written name.
    const exercises = day.exercises.map((exercise): LandingExercise => (exercise.match.status === 'matched' && exercise.match.via !== 'typo' && meta.has(exercise.match.exercise.exerciseId)
      ? fromCatalogue(exercise.match.exercise.exerciseId, exercise.sets, exercise.targetReps, exercise.targetWeight)
      : { exerciseId: `line-${exercise.line}`, exerciseSource: 'user', name: exercise.name, sets: exercise.sets, reps: exercise.targetReps, weight: exercise.targetWeight, muscles: [] }))
    return exercises.length ? [{ name: day.name, exercises }] : []
  })
}

export function landingToday(day: LandingDay, budgetMin: number | null, straight: boolean): CompressionResult {
  return compressDay({ exercises: day.exercises, budgetMin, straight })
}
