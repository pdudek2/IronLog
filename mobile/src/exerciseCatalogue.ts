import type { Category, Equipment, Exercise, MuscleGroup } from '../../data/exercises'
import { EXERCISE_CATEGORY_LABELS, getEquipmentLabel, getMuscleLabel } from '../../src/lib/exerciseLabels'
import { parsePreviousSets } from './scopedRead'
import { parseProgressRecord } from './progressData'
import type { ExerciseSource } from './session'

export const categories = Object.keys(EXERCISE_CATEGORY_LABELS) as Category[]
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

export function filterExercises<T extends { name: string; category: string; equipment: string }>(list: T[], search: string, category: string = 'all', equipment: string = 'all'): T[] {
  const q = search.toLowerCase()
  return list.filter(exercise => (!q || exercise.name.toLowerCase().includes(q))
    && (category === 'all' || exercise.category === category) && (equipment === 'all' || exercise.equipment === equipment))
}

export function exerciseRowMuscles(exercise: Exercise): string {
  const muscles = exercise.muscles.map(getMuscleLabel).filter(label => label !== EXERCISE_CATEGORY_LABELS[exercise.category])
  return [...muscles.slice(0, 2), ...(muscles.length > 2 ? [`+${muscles.length - 2}`] : [])].join(' · ')
}
export function exerciseTaxonomy(exercise: Exercise): string { return `${EXERCISE_CATEGORY_LABELS[exercise.category]} · ${getEquipmentLabel(exercise.equipment)}` }

export async function exerciseClaimId(uid: string, name: string, sha256: (value: string) => Promise<string>): Promise<string> {
  const hash = await sha256(name.trim())
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error('Invalid name digest.')
  return `${uid}_${hash}`
}

export type ExerciseMutation = { kind: 'create' | 'update'; id: string; source: ExerciseSource; input: ExerciseInput } | { kind: 'delete'; id: string; source: ExerciseSource }
type Data = Record<string, unknown>
export interface ExerciseTransaction {
  read: (collection: 'userExercises' | 'userExerciseNames', id: string) => Promise<Data | null>
  set: (collection: 'userExercises' | 'userExerciseNames', id: string, data: Data) => void
  update: (id: string, data: Data) => void
  remove: (collection: 'userExercises' | 'userExerciseNames', id: string) => void
}
const duplicate = (name: string) => new Error(`An exercise named "${name}" already exists.`)
export function sameExerciseInput(data: Data, input: ExerciseInput): boolean {
  return data.name === input.name && data.category === input.category && data.equipment === input.equipment
    && JSON.stringify(data.muscles) === JSON.stringify(input.muscles)
}

// This is the transaction body used by the native SDK and the emulator contract check.
export async function mutateExercise(transaction: ExerciseTransaction, uid: string, operation: ExerciseMutation, claimId: string | null, assertCurrent: () => void): Promise<void> {
  assertCurrent()
  if (operation.source !== 'user') throw new Error('Shared exercises cannot be changed.')
  const input = operation.kind === 'delete' ? null : validateExerciseInput(operation.input)
  const nextClaim = claimId ? await transaction.read('userExerciseNames', claimId) : null
  if (nextClaim && (nextClaim.userId !== uid || nextClaim.exerciseId !== operation.id)) throw duplicate(input!.name)
  // Missing userExercises documents cannot be read under owner-only rules. A claim confirms a retry's document exists.
  const stored = operation.kind !== 'create' || nextClaim ? await transaction.read('userExercises', operation.id) : null
  if (stored && stored.userId !== uid) throw new Error('Exercise belongs to another account.')
  if (operation.kind === 'create' && stored) {
    if (!sameExerciseInput(stored, input!) || stored.nameClaimId !== claimId) throw new Error('Create outcome changed. Reload the library.')
    return
  }
  if (operation.kind !== 'create' && !stored) throw new Error('Exercise was deleted. Reload the library.')
  const previousId = typeof stored?.nameClaimId === 'string' ? stored.nameClaimId : null
  if (previousId && (!previousId.startsWith(`${uid}_`) || !/^[0-9a-f]{64}$/.test(previousId.slice(uid.length + 1)))) throw new Error('Invalid exercise name claim.')
  const previous = previousId && previousId !== claimId ? await transaction.read('userExerciseNames', previousId) : null
  assertCurrent()
  if (operation.kind === 'delete') {
    if (previousId && previous?.userId === uid && previous.exerciseId === operation.id) transaction.remove('userExerciseNames', previousId)
    transaction.remove('userExercises', operation.id)
    return
  }
  if (!claimId || !input) throw new Error('Missing exercise name claim.')
  if (!nextClaim) transaction.set('userExerciseNames', claimId, { userId: uid, exerciseId: operation.id, name: input.name })
  if (previousId && previous?.userId === uid && previous.exerciseId === operation.id) transaction.remove('userExerciseNames', previousId)
  const fields = { ...input, nameClaimId: claimId }
  if (operation.kind === 'create') transaction.set('userExercises', operation.id, { userId: uid, ...fields })
  else transaction.update(operation.id, fields)
}

export function parseCatalogueExercise(id: string, uid: string, data: Data): Exercise {
  if (data.userId !== uid) throw new Error('Exercise belongs to another account.')
  return { id, ...validateExerciseInput(data as ExerciseInput) }
}

export function parseExerciseSession(id: string, uid: string, exerciseId: string, source: ExerciseSource, data: Data) {
  const sets = parsePreviousSets(data, uid, exerciseId, source)
  const number = (field: string) => {
    const value = data[field]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('Invalid exercise history.')
    return value
  }
  if (typeof data.workoutId !== 'string' || !data.workoutId) throw new Error('Invalid workout reference.')
  return { id, workoutId: data.workoutId, exerciseName: typeof data.exerciseName === 'string' ? data.exerciseName : '',
    startedAt: number('startedAt'), label: typeof data.label === 'string' && data.label.trim() ? data.label : null,
    totalSets: number('totalSets'), totalReps: number('totalReps'), totalVolume: number('totalVolume'),
    bestSetWeight: number('bestSetWeight'), bestSetReps: number('bestSetReps'), sets }
}
export type ExerciseSession = ReturnType<typeof parseExerciseSession>
export function parseExerciseRecord(id: string, uid: string, exerciseId: string, source: ExerciseSource, data: Data) {
  const record = parseProgressRecord(id, uid, data)
  if (record.exerciseId !== exerciseId || record.exerciseSource !== source) throw new Error('Invalid exercise record identity.')
  return record
}
