import type { Equipment, MuscleGroup } from '../data/exercises'

export const DEFAULT_EXERCISE_CATEGORY_COLOR = '#A89F98'

export const EXERCISE_CATEGORY_COLORS: Readonly<Record<string, string>> = {
  chest: '#C9BDB0',
  back: '#B3A99F',
  legs: '#D8CDBF',
  shoulders: '#AFA59C',
  arms: '#BDB0A2',
  core: '#9C928A',
  cardio: '#8F857C',
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
  return [labels.join(', '), getEquipmentLabel(equipment)].filter(Boolean).join(' · ')
}
