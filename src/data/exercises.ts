export type Category = 'chest' | 'back' | 'legs' | 'shoulders' | 'arms' | 'core' | 'cardio'
export type Equipment = 'barbell' | 'dumbbell' | 'cable' | 'machine' | 'bodyweight' | 'kettlebell'
export type MuscleGroup =
  | 'chest' | 'back' | 'quads' | 'hamstrings' | 'glutes'
  | 'shoulders' | 'triceps' | 'biceps' | 'forearms' | 'core' | 'calves'

export interface Exercise {
  id: string
  name: string
  category: Category
  equipment: Equipment
  muscles: MuscleGroup[]
}

export const exercises: Exercise[] = [
  // --- CHEST ---
  { id: 'bench-press',        name: 'Bench Press',              category: 'chest',     equipment: 'barbell',    muscles: ['chest', 'triceps', 'shoulders'] },
  { id: 'incline-bench',      name: 'Incline Bench Press',      category: 'chest',     equipment: 'barbell',    muscles: ['chest', 'shoulders'] },
  { id: 'db-fly',             name: 'Dumbbell Fly',             category: 'chest',     equipment: 'dumbbell',   muscles: ['chest'] },
  { id: 'cable-crossover',    name: 'Cable Crossover',          category: 'chest',     equipment: 'cable',      muscles: ['chest'] },
  { id: 'push-up',            name: 'Push-up',                  category: 'chest',     equipment: 'bodyweight', muscles: ['chest', 'triceps'] },

  // --- BACK ---
  { id: 'deadlift',           name: 'Deadlift',                 category: 'back',      equipment: 'barbell',    muscles: ['back', 'glutes', 'hamstrings'] },
  { id: 'pull-up',            name: 'Pull-up',                  category: 'back',      equipment: 'bodyweight', muscles: ['back', 'biceps'] },
  { id: 'barbell-row',        name: 'Barbell Row',              category: 'back',      equipment: 'barbell',    muscles: ['back', 'biceps'] },
  { id: 'lat-pulldown',       name: 'Lat Pulldown',             category: 'back',      equipment: 'cable',      muscles: ['back', 'biceps'] },
  { id: 'seated-cable-row',   name: 'Seated Cable Row',         category: 'back',      equipment: 'cable',      muscles: ['back', 'biceps'] },
  { id: 'db-row',             name: 'Dumbbell Row',             category: 'back',      equipment: 'dumbbell',   muscles: ['back', 'biceps'] },

  // --- LEGS ---
  { id: 'squat',              name: 'Squat',                    category: 'legs',      equipment: 'barbell',    muscles: ['quads', 'glutes'] },
  { id: 'romanian-dl',        name: 'Romanian Deadlift',        category: 'legs',      equipment: 'barbell',    muscles: ['hamstrings', 'glutes'] },
  { id: 'leg-press',          name: 'Leg Press',                category: 'legs',      equipment: 'machine',    muscles: ['quads', 'glutes'] },
  { id: 'leg-curl',           name: 'Leg Curl',                 category: 'legs',      equipment: 'machine',    muscles: ['hamstrings'] },
  { id: 'leg-extension',      name: 'Leg Extension',            category: 'legs',      equipment: 'machine',    muscles: ['quads'] },
  { id: 'lunge',              name: 'Lunge',                    category: 'legs',      equipment: 'dumbbell',   muscles: ['quads', 'glutes'] },
  { id: 'calf-raise',         name: 'Calf Raise',               category: 'legs',      equipment: 'machine',    muscles: ['calves'] },

  // --- SHOULDERS ---
  { id: 'ohp',                name: 'Overhead Press',           category: 'shoulders', equipment: 'barbell',    muscles: ['shoulders', 'triceps'] },
  { id: 'db-lateral-raise',   name: 'Lateral Raise',            category: 'shoulders', equipment: 'dumbbell',   muscles: ['shoulders'] },
  { id: 'face-pull',          name: 'Face Pull',                category: 'shoulders', equipment: 'cable',      muscles: ['shoulders', 'back'] },
  { id: 'db-shoulder-press',  name: 'Dumbbell Shoulder Press',  category: 'shoulders', equipment: 'dumbbell',   muscles: ['shoulders', 'triceps'] },
  { id: 'front-raise',        name: 'Front Raise',              category: 'shoulders', equipment: 'dumbbell',   muscles: ['shoulders'] },

  // --- ARMS ---
  { id: 'barbell-curl',       name: 'Barbell Curl',             category: 'arms',      equipment: 'barbell',    muscles: ['biceps'] },
  { id: 'db-curl',            name: 'Dumbbell Curl',            category: 'arms',      equipment: 'dumbbell',   muscles: ['biceps'] },
  { id: 'hammer-curl',        name: 'Hammer Curl',              category: 'arms',      equipment: 'dumbbell',   muscles: ['biceps', 'forearms'] },
  { id: 'tricep-pushdown',    name: 'Tricep Pushdown',          category: 'arms',      equipment: 'cable',      muscles: ['triceps'] },
  { id: 'skull-crusher',      name: 'Skull Crusher',            category: 'arms',      equipment: 'barbell',    muscles: ['triceps'] },
  { id: 'overhead-tri-ext',   name: 'Overhead Tricep Extension',category: 'arms',      equipment: 'dumbbell',   muscles: ['triceps'] },

  // --- CORE ---
  { id: 'plank',              name: 'Plank',                    category: 'core',      equipment: 'bodyweight', muscles: ['core'] },
  { id: 'crunch',             name: 'Crunch',                   category: 'core',      equipment: 'bodyweight', muscles: ['core'] },
  { id: 'hanging-leg-raise',  name: 'Hanging Leg Raise',        category: 'core',      equipment: 'bodyweight', muscles: ['core'] },
  { id: 'ab-wheel',           name: 'Ab Wheel Rollout',         category: 'core',      equipment: 'bodyweight', muscles: ['core'] },

  // --- CARDIO ---
  { id: 'treadmill',          name: 'Treadmill',                category: 'cardio',    equipment: 'machine',    muscles: [] },
  { id: 'rowing-machine',     name: 'Rowing Machine',           category: 'cardio',    equipment: 'machine',    muscles: [] },
  { id: 'jump-rope',          name: 'Jump Rope',                category: 'cardio',    equipment: 'bodyweight', muscles: [] },
]

export function searchExercises(query: string, category?: Category): Exercise[] {
  const q = query.toLowerCase()
  return exercises.filter(ex =>
    (category ? ex.category === category : true) &&
    (q ? ex.name.toLowerCase().includes(q) : true)
  )
}
