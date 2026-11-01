interface MomentSet {
  weight: number
  reps: number
}

interface MomentExercise {
  exerciseId?: string
  exerciseSource?: 'global' | 'user'
  name: string
  sets: MomentSet[]
}

interface MomentWorkout {
  id: string
  startedAt: number
  finishedAt: number
  exercises: MomentExercise[]
}

export interface StepSession {
  workoutId: string
  startedAt: number
  bestSetWeight: number
}

const DAY_MS = 86_400_000
const MAX_STEPS = 12

export function topSet(exercise: MomentExercise): MomentSet {
  return exercise.sets.reduce((top, set) => (
    set.weight > top.weight || (set.weight === top.weight && set.reps > top.reps) ? set : top
  ))
}

const sameExercise = (a: MomentExercise, b: MomentExercise) => (
  a.exerciseId === b.exerciseId && (a.exerciseSource ?? 'global') === (b.exerciseSource ?? 'global')
)

// shortcut: compares only the workouts Train already loaded (the last 50), so a heavier lift older than that
// is missed; read the records collection if that ever shows up in practice.
export function latestRecord(workouts: MomentWorkout[], now: number) {
  const newestFirst = [...workouts].sort((a, b) => b.startedAt - a.startedAt)
  for (const [index, workout] of newestFirst.entries()) {
    if (now - workout.finishedAt >= DAY_MS) continue
    for (const exercise of workout.exercises) {
      if (!exercise.exerciseId) continue
      const top = topSet(exercise)
      const earlier = newestFirst.slice(index + 1)
        .flatMap((other) => other.exercises.filter((candidate) => sameExercise(candidate, exercise)))
      if (earlier.length > 0 && top.weight > Math.max(...earlier.map((candidate) => topSet(candidate).weight))) {
        return { exerciseName: exercise.name, ...top, finishedAt: workout.finishedAt }
      }
    }
  }
  return null
}

export function recordLine(
  record: NonNullable<ReturnType<typeof latestRecord>>,
  now: Date,
  formatWeight: (kg: number) => string,
) {
  const day = new Date(record.finishedAt).toDateString() === now.toDateString() ? 'today' : 'yesterday'
  return `New record ${day}: ${record.exerciseName} ${formatWeight(record.weight)} × ${record.reps}`
}

export function mainExercise<T extends MomentExercise>(workout: { exercises: T[] }): T | null {
  return workout.exercises.find((exercise) => exercise.exerciseId && topSet(exercise).weight > 0) ?? null
}

export function workoutSteps(workout: MomentWorkout, sessions: StepSession[]) {
  const exercise = mainExercise(workout)
  if (!exercise) return null
  const top = topSet(exercise)
  const earlier = sessions
    .filter((session) => session.workoutId !== workout.id && session.startedAt < workout.startedAt && session.bestSetWeight > 0)
    .sort((a, b) => a.startedAt - b.startedAt)
  const previous = earlier.at(-1)
  if (!previous) return null

  const shown = earlier.slice(1 - MAX_STEPS).map((session) => ({ key: session.workoutId, weight: session.bestSetWeight }))
  const weights = [...shown.map((step) => step.weight), top.weight]
  const lowest = Math.min(...weights)
  const span = Math.max(...weights) - lowest
  // The floor keeps a small change readable as a step instead of a flat line.
  const height = (weight: number) => (span === 0 ? 0.6 : 0.3 + 0.7 * (weight - lowest) / span)
  const previousBest = Math.max(...earlier.map((session) => session.bestSetWeight))
  const best = top.weight > previousBest

  return {
    exerciseName: exercise.name,
    top,
    best,
    delta: top.weight - (best ? previousBest : previous.bestSetWeight),
    bars: [
      ...shown.map((step) => ({ ...step, height: height(step.weight), current: false })),
      { key: workout.id, weight: top.weight, height: height(top.weight), current: true },
    ],
  }
}

export function stepsNote(steps: { best: boolean, delta: number }, formatWeight: (kg: number) => string) {
  if (steps.best) return `New best, ${formatWeight(steps.delta)} above your previous best`
  if (steps.delta === 0) return 'Same weight as last time'
  return `${formatWeight(Math.abs(steps.delta))} ${steps.delta > 0 ? 'above' : 'below'} last time`
}
