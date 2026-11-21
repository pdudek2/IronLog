import { describe, expect, it } from 'vitest'
import { progressExtras, summarizeAllExercises, type ProgressSessionLite } from '../progress'

const at = (date: string) => new Date(`${date}T18:00:00`).getTime()
// Wednesday; with 30 days the full weeks are those starting Oct 26, Nov 2 and Nov 9.
const anchor = new Date('2026-11-18T12:00:00').getTime()

function session(fields: Partial<ProgressSessionLite> & Pick<ProgressSessionLite, 'workoutId' | 'exerciseId' | 'finishedAt'>): ProgressSessionLite {
  return {
    id: `${fields.workoutId}-${fields.exerciseId}`, exerciseSource: 'global', totalVolume: 0, totalSets: 3, bestSetWeight: 0,
    bestSetReps: 0, exerciseName: fields.exerciseId, muscleGroups: [], category: null, ...fields,
  }
}

const sessions = [
  session({ workoutId: 'w0a', exerciseId: 'assisted-pull-up', finishedAt: at('2026-10-05'), bestSetWeight: 40, bestSetReps: 8, leastAssisted: { weight: 30, reps: 8 }, totalVolume: 900 }),
  session({ workoutId: 'w0b', exerciseId: 'squat', finishedAt: at('2026-10-12'), bestSetWeight: 100, bestSetReps: 5, totalVolume: 2000, totalSets: 4 }),
  session({ workoutId: 'w1', exerciseId: 'assisted-pull-up', finishedAt: at('2026-10-27'), bestSetWeight: 40, bestSetReps: 8, leastAssisted: { weight: 25, reps: 8 }, totalVolume: 1000 }),
  session({ workoutId: 'w1', exerciseId: 'my-thrust', exerciseSource: 'user', finishedAt: at('2026-10-27'), bestSetWeight: 50, bestSetReps: 4, totalVolume: 600, muscleGroups: ['glutes', 'hamstrings'], category: 'legs' }),
  session({ workoutId: 'w1', exerciseId: 'my-bike', exerciseSource: 'user', finishedAt: at('2026-10-27'), totalSets: 1, muscleGroups: ['quads'], category: 'cardio' }),
  // The stored muscles are stale; the catalogue says quads, then glutes.
  session({ workoutId: 'w2', exerciseId: 'squat', finishedAt: at('2026-11-03'), bestSetWeight: 100, bestSetReps: 5, totalVolume: 2000, totalSets: 4, muscleGroups: ['legs'] }),
  session({ workoutId: 'w3', exerciseId: 'squat', finishedAt: at('2026-11-10'), bestSetWeight: 100, bestSetReps: 6, totalVolume: 2400, totalSets: 4, muscleGroups: ['legs'] }),
  session({ workoutId: 'w3', exerciseId: 'pull-up', finishedAt: at('2026-11-10'), bestSetReps: 10 }),
  session({ workoutId: 'w4', exerciseId: 'squat', finishedAt: at('2026-11-17'), bestSetWeight: 105, bestSetReps: 3, totalVolume: 1500, totalSets: 4 }),
]

describe('summarizeAllExercises', () => {
  const summary = summarizeAllExercises(sessions, 30, anchor)

  it('averages full weeks without assisted volume and draws the current week apart', () => {
    expect(summary.weeks.map(({ volume, current }) => [volume, current])).toEqual([[600, false], [2000, false], [2400, false], [1500, true]])
    expect(summary.fullWeeks).toBe(3)
    expect(summary.averageVolume).toBeCloseTo(5000 / 3)
    // Previous three weeks: Oct 19 (0), Oct 12 (2000), Oct 5 (assisted only, 0).
    expect(summary.averageDelta).toBeCloseTo(150)
    expect([summary.workouts, summary.previousWorkouts]).toEqual([4, 2])
  })

  it('counts sets per muscle per full week, the first muscle whole and the others half, without cardio', () => {
    expect(summary.muscleBasis).toBe('average')
    expect(Object.fromEntries(summary.muscles.map(({ muscle, sets }) => [muscle, Math.round(sets * 1000) / 1000]))).toEqual({
      quads: 2.667, glutes: 2.333, back: 2, biceps: 1, hamstrings: 0.5,
    })
  })

  it('shows each exercise best set and its change in kg, or in reps when the weight held', () => {
    const rows = Object.fromEntries(summary.exercises.map((row) => [row.key, [row.sessions, row.best, row.change]]))
    expect(summary.exercises[0]!.key).toBe('global:squat')
    expect(rows['global:squat']).toEqual([3, { weight: 105, reps: 3 }, { unit: 'kg', value: 5 }])
    expect(rows['global:pull-up']).toEqual([1, { weight: 0, reps: 10 }, null])
    // Less assistance is the better set.
    expect(rows['global:assisted-pull-up']).toEqual([1, { weight: 25, reps: 8 }, { unit: 'kg', value: -5 }])
    expect(rows['user:my-thrust']).toEqual([1, { weight: 50, reps: 4 }, null])

    const reps = summarizeAllExercises([...sessions, session({ workoutId: 'w5', exerciseId: 'squat', finishedAt: at('2026-10-10'), bestSetWeight: 105, bestSetReps: 1 })], 30, anchor)
    expect(reps.exercises.find(({ key }) => key === 'global:squat')!.change).toEqual({ unit: 'reps', value: 2 })
  })

  it('has no average or change in the first week and counts this week instead', () => {
    const first = summarizeAllExercises([session({ workoutId: 'n1', exerciseId: 'squat', finishedAt: at('2026-11-17'), bestSetWeight: 60, bestSetReps: 5, totalVolume: 900, totalSets: 2 })], 90, anchor)
    expect(first.weeks).toEqual([expect.objectContaining({ volume: 900, current: true })])
    expect([first.averageVolume, first.averageDelta, first.muscleBasis]).toEqual([null, null, 'thisWeek'])
    expect(first.muscles).toEqual([{ muscle: 'quads', sets: 2 }, { muscle: 'glutes', sets: 1 }])
  })

  it('gives no change with fewer than two full weeks before the range', () => {
    const late = sessions.filter(({ finishedAt }) => finishedAt >= at('2026-10-20'))
    expect(summarizeAllExercises(late, 30, anchor).averageDelta).toBeNull()
  })
})

describe('progressExtras', () => {
  it('falls back on old documents and finds the set with the least assistance', () => {
    expect(progressExtras({}, 'squat', 'global')).toEqual({ bestSetReps: 0, category: null })
    expect(progressExtras({ bestSetReps: 6, category: 'legs', sets: [{ weight: 10, reps: 5 }] }, 'squat', 'global')).toEqual({ bestSetReps: 6, category: 'legs' })
    const sets = [{ weight: 40, reps: 8 }, { weight: 25, reps: 6 }, { weight: 25, reps: 7 }, { weight: 20, reps: 0 }, { weight: 'x', reps: 9 }]
    expect(progressExtras({ sets }, 'assisted-pull-up', 'global').leastAssisted).toEqual({ weight: 25, reps: 7 })
  })
})
