import type { Category, Equipment, MuscleGroup } from '../data/exercises'

// ─── Labels ──────────────────────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<Category | 'all', string> = {
  all: 'All',
  chest: 'Chest',
  back: 'Back',
  legs: 'Legs',
  shoulders: 'Shoulders',
  arms: 'Arms',
  core: 'Core',
  cardio: 'Cardio',
}

export const EQUIPMENT_LABELS: Record<Equipment | 'all', string> = {
  all: 'All',
  barbell: 'Barbell',
  dumbbell: 'Dumbbells',
  cable: 'Cable',
  machine: 'Machine',
  bodyweight: 'Bodyweight',
  kettlebell: 'Kettlebell',
}

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: 'Chest',
  back: 'Back',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  adductors: 'Adductors',
  shoulders: 'Shoulders',
  triceps: 'Triceps',
  biceps: 'Biceps',
  forearms: 'Forearms',
  core: 'Core',
  calves: 'Calves',
}

export const CATEGORIES = (Object.keys(CATEGORY_LABELS) as (Category | 'all')[])
export const EQUIPMENT_OPTIONS = (Object.keys(EQUIPMENT_LABELS) as (Equipment | 'all')[])
