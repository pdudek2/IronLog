import { createLocalId, parseSessionDocument, type ActiveWorkout, type ExerciseSource } from './session'
import { templateStartWeight } from '../../src/shared/workoutDisplay'
import type { TemplateLaunch } from '../../src/shared/nextSessionRecommendation'
import { isValidLaunchList } from '../../src/shared/compressionRecord'
import { planDayId } from '../../src/shared/planDay'

export interface TemplateExercise {
  exerciseId: string
  exerciseSource: ExerciseSource
  name: string
  sets: number
  targetReps: number
  targetWeight: number
}
export interface WorkoutTemplate {
  id: string
  userId: string
  name: string
  updatedAt: number
  days: { id?: string; name: string; exercises: TemplateExercise[] }[]
}
export interface WorkoutSelection { templateId: string; dayIndex: number }
export interface BestSet { bestSetWeight: number; bestSetReps: number }
export type LaunchResult = { kind: 'started' | 'existing'; session: ActiveWorkout }

export function shouldOpenLaunchResult(initiatingPath: string, currentPath: string): boolean {
  return initiatingPath === currentPath
}

export class TargetUnavailableError extends Error {
  constructor() { super('Workout no longer available. Choose another workout.'); this.name = 'TargetUnavailableError' }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid plan data.')
  return value as Record<string, unknown>
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Invalid plan data.')
  return value.trim()
}
function number(value: unknown, minimum: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) throw new Error('Invalid plan data.')
  return Math.max(minimum, parsed)
}

export function parseTemplate(id: string, uid: string, raw: unknown): WorkoutTemplate {
  const data = record(raw)
  if (data.userId !== uid || !Array.isArray(data.days)) throw new Error('Invalid plan owner or days.')
  return {
    id: text(id), userId: uid, name: text(data.name), updatedAt: number(data.updatedAt ?? data.createdAt ?? 0, 0),
    days: data.days.map((rawDay, index) => {
      const day = record(rawDay)
      if (!Array.isArray(day.exercises)) throw new Error('Invalid plan exercises.')
      return {
        id: planDayId(day, index),
        name: typeof day.name === 'string' && day.name.trim() ? day.name.trim() : `Day ${index + 1}`,
        exercises: day.exercises.map((rawExercise) => {
          const exercise = record(rawExercise)
          const source = exercise.exerciseSource ?? 'global'
          if (source !== 'global' && source !== 'user') throw new Error('Invalid exercise source.')
          return {
            exerciseId: text(exercise.exerciseId), exerciseSource: source, name: text(exercise.name),
            sets: Math.max(1, Math.round(number(exercise.sets ?? 1, 1))),
            targetReps: Math.max(0, Math.round(number(exercise.targetReps ?? 0, 0))),
            targetWeight: number(exercise.targetWeight ?? 0, 0),
          }
        }),
      }
    }),
  }
}

export { firstLaunchableWorkout, nextPlanWorkout } from '../../src/shared/week'

export function selectedWorkout(templates: WorkoutTemplate[], selection: WorkoutSelection | null) {
  const template = templates.find((item) => item.id === selection?.templateId)
  const day = selection && template?.days[selection.dayIndex]
  return template && day?.exercises.length ? { template, day } : null
}

// The day id stays out, as on the server, so a fingerprint from before day ids still matches.
export function selectionFingerprint(template: WorkoutTemplate, dayIndex: number): string {
  const day = template.days[dayIndex]
  return JSON.stringify({ name: template.name, day: day ? { name: day.name, exercises: day.exercises } : undefined })
}

export function validateTemplateLaunch(template: WorkoutTemplate, dayIndex: number, launch: TemplateLaunch): void {
  const day = template.days[dayIndex]
  if (!day?.exercises.length) throw new TargetUnavailableError()
  if (!isValidLaunchList(day.exercises, launch.items)) throw new Error('Invalid recommendation.')
}

export function buildTemplateSession(template: WorkoutTemplate, dayIndex: number, history: ReadonlyMap<string, BestSet>, sessionId: string, revision: string, startedAt: number, launch?: TemplateLaunch): ActiveWorkout {
  const day = template.days[dayIndex]
  if (!day?.exercises.length) throw new TargetUnavailableError()
  if (launch) validateTemplateLaunch(template, dayIndex, launch)
  const items = launch?.items.map((item) => ({ exercise: day.exercises[item.dayExerciseIndex]!, sets: item.sets, weight: item.weight as number | undefined, reps: item.reps as number | undefined, group: item.group }))
    ?? day.exercises.map((exercise) => ({ exercise, sets: exercise.sets, weight: undefined, reps: undefined, group: undefined }))
  return {
    sessionId, sessionRevision: revision, startedAt, templateId: template.id, planDayId: planDayId(day, dayIndex), label: day.name || template.name,
    ...(launch?.compression ? { compression: launch.compression } : {}),
    ...(launch?.proposals ? { proposals: launch.proposals } : {}),
    exercises: items.map(({ exercise, sets, weight, reps, group }) => {
      const best = history.get(`${exercise.exerciseSource}:${exercise.exerciseId}`)
      const weightValue = weight ?? templateStartWeight(exercise, best)
      // The plan's target, not last time's best: the progression hint asks for more when it is due.
      const repsValue = reps ?? exercise.targetReps
      return {
        clientId: createLocalId('exercise'), exerciseId: exercise.exerciseId, exerciseSource: exercise.exerciseSource, name: exercise.name,
        ...(group ? { group } : {}),
        sets: Array.from({ length: sets }, () => ({
          clientId: createLocalId('set'), weight: weightValue > 0 ? String(weightValue) : '',
          reps: repsValue > 0 ? String(repsValue) : '', done: false,
        })),
      }
    }),
  }
}

export interface CreateSessionPort {
  read(): Promise<{ exists: boolean; data: Record<string, unknown> | null }>
  create(data: Record<string, unknown>): void
}

export async function claimAbsentSession(port: CreateSessionPort, uid: string, candidate: ActiveWorkout, updatedAt: number): Promise<LaunchResult> {
  const snapshot = await port.read()
  if (snapshot.exists && snapshot.data) {
    const session = parseSessionDocument(uid, snapshot.data)
    return { kind: session.sessionId === candidate.sessionId ? 'started' : 'existing', session }
  }
  if (snapshot.exists) throw new Error('Active session data is invalid.')
  port.create({ userId: uid, sessionId: candidate.sessionId, sessionRevision: candidate.sessionRevision,
    startedAt: candidate.startedAt, updatedAt, templateId: candidate.templateId, planDayId: candidate.planDayId ?? null,
    label: candidate.label?.trim() || null, exercises: candidate.exercises,
    ...(candidate.compression ? { compression: candidate.compression } : {}), ...(candidate.proposals ? { proposals: candidate.proposals } : {}) })
  return { kind: 'started', session: candidate }
}
