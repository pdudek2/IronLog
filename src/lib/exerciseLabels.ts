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
  chest: 'Klatka',
  back: 'Plecy',
  legs: 'Nogi',
  shoulders: 'Barki',
  arms: 'Ramiona',
  core: 'Core',
  cardio: 'Cardio',
}

const EQUIPMENT_LABELS: Record<Equipment | string, string> = {
  barbell: 'Sztanga',
  dumbbell: 'Hantle',
  cable: 'Wyciąg',
  machine: 'Maszyna',
  bodyweight: 'Własne ciało',
  kettlebell: 'Kettlebell',
}

const MUSCLE_LABELS: Record<MuscleGroup | string, string> = {
  chest: 'Klatka',
  back: 'Plecy',
  shoulders: 'Barki',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Przedramiona',
  quads: 'Quady',
  hamstrings: 'Dwugłowe',
  glutes: 'Pośladki',
  calves: 'Łydki',
  core: 'Core',
  lats: 'Najszersze',
  traps: 'Czworoboczne',
  abs: 'Brzuch',
  obliques: 'Skośne',
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
