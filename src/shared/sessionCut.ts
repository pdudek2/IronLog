// „Zostało mi 15 minut”: the rest of an active session in the time left. Rules: PRODUCT.md, „Specyfikacja — skrócenie w trakcie sesji”.
import { COLD_FACTOR, compressDay, exerciseRoles, sessionPace, type CompressionResult } from './compression'
import type { CompressionEntry, CompressionRecord, SessionCutRecord } from './compressionRecord'
import { catalogueMeta, type ExerciseMeta } from './nextSessionRecommendation'

type Source = 'global' | 'user'
interface CutSet { done: boolean; completedAt?: unknown }
interface CutExercise { exerciseId: string; exerciseSource: Source; group?: unknown; sets: CutSet[] }
interface CutSession { startedAt: number; exercises: CutExercise[]; compression?: CompressionRecord | null }

export interface CutChoice { leftMin: number | null; clock: boolean; straight: boolean }

export interface CutPlan {
  result: CompressionResult
  // Per session exercise: logged sets, sets before the cut and the sets it keeps.
  done: number[]
  before: number[]
  after: number[]
  openBefore: number
  openAfter: number
  // Group of each exercise after the cut; undefined keeps none.
  groups: (string | undefined)[]
  pace: number
  paceSource: SessionCutRecord['pace']
  changed: boolean
}

const MAX_SETS = 20
const minutes = (sec: number) => Math.min(600, Math.round(sec / 6) / 10)
const groupOf = (exercise: CutExercise) => (typeof exercise.group === 'string' && exercise.group ? exercise.group : undefined)
const at = (set: CutSet) => (set.done && Number.isSafeInteger(set.completedAt) ? (set.completedAt as number) : null)

export function planCut(session: CutSession, choice: CutChoice, now: number, userExercises?: ReadonlyMap<string, ExerciseMeta>): CutPlan {
  const { exercises } = session
  const record = session.compression ?? null
  const metas = exercises.map((exercise) => catalogueMeta(exercise.exerciseId, exercise.exerciseSource, userExercises))
  const roles = exerciseRoles(metas)
  const low = record?.readiness === 'low'
  const startShortRest = record?.shortRest ?? false
  const fromRecord = record !== null && record.cut?.only !== true
  const prior = fromRecord ? record.factor : COLD_FACTOR
  const sets = exercises.map((exercise) => ({ group: groupOf(exercise), sets: exercise.sets.map((set) => ({ done: set.done, completedAt: at(set) ?? undefined })) }))
  const pace = sessionPace(sets, roles, startShortRest, low, prior)
  const done = exercises.map((exercise) => exercise.sets.filter((set) => set.done).length)
  const before = exercises.map((exercise) => exercise.sets.length)

  const names = [...new Set(exercises.flatMap((exercise) => groupOf(exercise) ?? []))]
  const existing = names.map((name) => exercises.flatMap((exercise, index) => (groupOf(exercise) === name ? [index] : [])))
  let last: { index: number; at: number } | null = null
  exercises.forEach((exercise, index) => exercise.sets.forEach((set) => {
    const time = at(set)
    if (time !== null && (!last || time > last.at)) last = { index, at: time }
  }))
  const latest = last as { index: number; at: number } | null

  const result = compressDay({
    exercises: exercises.map((exercise, index) => ({ exerciseId: exercise.exerciseId, exerciseSource: exercise.exerciseSource, sets: before[index]!, done: done[index]!, ...metas[index]! })),
    budgetMin: choice.leftMin,
    straight: choice.straight,
    lowReadiness: low,
    factor: pace.factor,
    session: { groups: existing, shortRest: startShortRest, last: latest ? { index: latest.index, sinceSec: Math.max(0, (now - latest.at) / 1000) } : null },
  })

  const used = new Set(names)
  const fresh = () => { let n = 1; while (used.has(`g${n}`)) n++; used.add(`g${n}`); return `g${n}` }
  const groups = exercises.map(groupOf)
  for (const block of result.blocks) {
    const k = block.group ? Number(block.group.slice(1)) - 1 : -1
    if (k < existing.length) continue
    const live = block.items.filter((item) => result.sets[item.index]! > 0)
    if (live.length < 2) continue
    const name = fresh()
    for (const item of live) groups[item.index] = name
  }
  const open = (counts: number[]) => counts.reduce((sum, count, index) => sum + Math.max(0, count - done[index]!), 0)
  return {
    result, done, before, after: result.sets, openBefore: open(before), openAfter: open(result.sets), groups,
    pace: pace.factor, paceSource: pace.sets >= 2 ? 'session' : fromRecord ? 'record' : 'cold',
    changed: result.mode !== 'full' && (result.shortRest !== startShortRest || result.sets.some((count, index) => count !== before[index])
      || groups.some((group, index) => group !== groupOf(exercises[index]!))),
  }
}

// One mutation: open sets past the cut go (from the end), exercises left with nothing are removed, new groups are set and the
// compression record carries what was cut. Logged sets, weights and reps stay as they are.
export function applyCut<S extends CutSession>(session: S, plan: CutPlan, choice: CutChoice, now: number): S {
  if (!plan.changed || choice.leftMin === null || plan.before.length !== session.exercises.length) return session
  const exercises = session.exercises.flatMap((exercise, index) => {
    if (plan.after[index] === 0 && plan.before[index]! > 0 && !exercise.sets.some((set) => set.done)) return []
    let keep = plan.after[index]! - plan.done[index]!
    const sets = exercise.sets.filter((set) => set.done || keep-- > 0)
    const group = plan.groups[index]
    return [{ ...exercise, sets, ...(group ? { group } : {}) }]
  })
  return { ...session, exercises, compression: cutRecord(session, plan, choice.leftMin, choice.clock, now) }
}

// The cut as one mutation, planned on the session it changes so nothing logged since the preview is lost.
export function cutRest<S extends CutSession>(session: S, choice: CutChoice, now: number, userExercises?: ReadonlyMap<string, ExerciseMeta>): S {
  return applyCut(session, planCut(session, choice, now, userExercises), choice, now)
}

function cutRecord(session: CutSession, plan: CutPlan, leftMin: number, clock: boolean, now: number): CompressionRecord {
  const record = session.compression ?? null
  const { result } = plan
  const elapsedSec = Math.max(0, (now - session.startedAt) / 1000)
  const cut: SessionCutRecord = {
    atMin: Math.min(720, Math.floor(elapsedSec / 60)), leftMin: Math.min(240, Math.max(1, Math.round(leftMin))), estimateMin: minutes(result.estimateSec),
    clock, count: Math.min(20, (record?.cut?.count ?? 0) + 1), only: record === null || record.cut?.only === true, pace: plan.paceSource,
  }
  const sets = (count: number) => Math.min(MAX_SETS, count)
  const changed = (index: number) => plan.after[index] !== plan.before[index]
  const mode = result.mode === 'full' ? 'compressed' : result.mode
  if (!record) {
    const estimateMin = minutes(elapsedSec + result.fullEstimateSec)
    return {
      v: 1, budgetMin: null, mode, shortRest: result.shortRest, estimateMin, fullEstimateMin: estimateMin, factor: Math.round(plan.pace * 1000) / 1000,
      samples: 0, calibration: 'none', readiness: null, cut,
      exercises: session.exercises.slice(0, 20).map((exercise, index) => ({
        dayExerciseIndex: index, exerciseId: exercise.exerciseId, exerciseSource: exercise.exerciseSource, plannedSets: sets(plan.before[index]!), sets: sets(plan.after[index]!),
      })),
    }
  }
  // Occurrences of one exercise match the record's launched entries in order; entries dropped at the start are not in the session.
  const entries: CompressionEntry[] = record.exercises.map((entry) => ({ ...entry }))
  const taken = new Set<CompressionEntry>()
  session.exercises.forEach((exercise, index) => {
    const entry = entries.find((candidate) => !taken.has(candidate) && candidate.sets > 0
      && candidate.exerciseId === exercise.exerciseId && candidate.exerciseSource === exercise.exerciseSource)
    if (entry) taken.add(entry)
    if (!changed(index)) return
    if (entry) entry.sets = sets(plan.after[index]!)
    else if (entries.length < 20) {
      entries.push({ dayExerciseIndex: Math.min(19, index), exerciseId: exercise.exerciseId, exerciseSource: exercise.exerciseSource, plannedSets: sets(plan.before[index]!), sets: sets(plan.after[index]!) })
    }
  })
  return { ...record, shortRest: record.shortRest || result.shortRest, cut, exercises: entries }
}
