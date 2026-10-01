import type { Category, Equipment, Exercise, MuscleGroup } from '../../data/exercises'

export const categories = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'cardio'] as Category[]
export const equipmentOptions: Equipment[] = ['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight', 'kettlebell']
export const muscleOptions: MuscleGroup[] = ['chest', 'back', 'quads', 'hamstrings', 'glutes', 'shoulders', 'triceps', 'biceps', 'forearms', 'core', 'calves']
export type ExerciseInput = Omit<Exercise, 'id'>

export function validateExerciseInput(input: ExerciseInput): ExerciseInput {
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (name.length < 2 || name.length > 120) throw new Error('Name must contain 2–120 characters.')
  if (!categories.includes(input.category) || !equipmentOptions.includes(input.equipment)
    || !Array.isArray(input.muscles) || input.muscles.length > 12
    || input.muscles.some(muscle => !muscleOptions.includes(muscle))) throw new Error('Choose a supported category, equipment and muscle group.')
  return { name, category: input.category, equipment: input.equipment, muscles: [...new Set(input.muscles)] }
}

export function sameExerciseInput(data: Record<string, unknown>, input: ExerciseInput): boolean {
  return data.name === input.name && data.category === input.category && data.equipment === input.equipment
    && JSON.stringify(data.muscles) === JSON.stringify(input.muscles)
}
