import type { Equipment, MuscleGroup } from '../data/exercises'

export const DEFAULT_EXERCISE_CATEGORY_COLOR = '#A09AA0'

export const EXERCISE_CATEGORY_COLORS: Readonly<Record<string, string>> = {
  chest: '#D97B91',
  back: '#9BB7C8',
  legs: '#D6A06F',
  shoulders: '#A898C8',
  arms: '#C38B73',
  core: '#A7A0B5',
  cardio: '#76ADB1',
}

export const EXERCISE_CATEGORY_LABELS: Readonly<Record<string, string>> = {
  chest: 'Chest',
  back: 'Back',
  legs: 'Legs',
  shoulders: 'Shoulders',
  arms: 'Arms',
  core: 'Core',
  cardio: 'Cardio',
}

const EQUIPMENT_LABELS: Record<Equipment | string, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbells',
  cable: 'Cable',
  machine: 'Machine',
  bodyweight: 'Bodyweight',
  kettlebell: 'Kettlebell',
}

const MUSCLE_LABELS: Record<MuscleGroup | string, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  core: 'Core',
  lats: 'Lats',
  traps: 'Traps',
  abs: 'Abs',
  obliques: 'Obliques',
}

export function getEquipmentLabel(equipment: string): string {
  return EQUIPMENT_LABELS[equipment] ?? equipment
}

export function getMuscleLabel(muscle: string): string {
  return MUSCLE_LABELS[muscle] ?? muscle
}

export function formatExerciseMeta(equipment: string, muscles: string[]): string {
  const labels = muscles.map(getMuscleLabel)
  return [getEquipmentLabel(equipment), labels.join(', ')].filter(Boolean).join(' · ')
}
