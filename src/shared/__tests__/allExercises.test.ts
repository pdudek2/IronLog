import { describe, expect, it } from 'vitest'
import { formatBestSet, formatCountChange, formatPercentChange, formatSetChange, progressExtras, summarizeAllExercises, type ProgressSessionLite } from '../progress'

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
    // The full weeks before the range since the first workout: Oct 5 (assisted only, 0) and Oct 12 (2000).
    // Oct 19 straddles the range start, so it belongs to neither period.
    expect(summary.averageDelta).toBeCloseTo(200 / 3)
    expect([summary.comparable, summary.workouts, summary.previousWorkouts]).toEqual([true, 4, 2])
  })

  it('compares the same steady weeks as no change, whatever happens in the week across the range start', () => {
    const steady = ['2026-09-22', '2026-09-29', '2026-10-06', '2026-10-13', '2026-10-27', '2026-11-03', '2026-11-10']
      .map((date, index) => session({ workoutId: `s${index}`, exerciseId: 'squat', finishedAt: at(date), totalVolume: 1000 }))
    expect(summarizeAllExercises(steady, 30, anchor).averageDelta).toBe(0)
    const spike = session({ workoutId: 'spike', exerciseId: 'squat', finishedAt: at('2026-10-20'), totalVolume: 10_000 })
    expect(summarizeAllExercises([...steady, spike], 30, anchor).averageDelta).toBe(0)
  })

  it('still compares workouts when there is no volume to compare', () => {
    const bodyweight = ['2026-09-22', '2026-09-29', '2026-10-06', '2026-10-13', '2026-10-27', '2026-11-03']
      .map((date, index) => session({ workoutId: `b${index}`, exerciseId: 'pull-up', finishedAt: at(date), bestSetReps: 8 }))
    const summary = summarizeAllExercises(bodyweight, 30, anchor)
    expect([summary.comparable, summary.averageDelta, summary.workouts, summary.previousWorkouts]).toEqual([true, null, 2, 4])
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

    const shown = (key: string, units: 'kg' | 'lbs') => {
      const row = summary.exercises.find((entry) => entry.key === key)!
      return [formatBestSet(row.best, units), formatSetChange(row.change, units)]
    }
    expect(shown('global:squat', 'kg')).toEqual(['105 × 3', '+5 kg'])
    expect(shown('global:squat', 'lbs')).toEqual(['231.5 × 3', '+11 lbs'])
    expect(shown('global:pull-up', 'kg')).toEqual(['10 reps', ''])
    expect(shown('global:assisted-pull-up', 'kg')).toEqual(['25 × 8', '−5 kg'])
    expect([formatSetChange({ unit: 'reps', value: 2 }, 'kg'), formatSetChange({ unit: 'reps', value: -1 }, 'kg'), formatSetChange({ unit: 'kg', value: 0 }, 'kg')]).toEqual(['+2 reps', '−1 rep', 'same'])
    expect([formatCountChange(2), formatCountChange(-3), formatCountChange(0)]).toEqual(['+2', '−3', 'same'])
    expect([formatPercentChange(6.4), formatPercentChange(-12.6), formatPercentChange(-0.3)]).toEqual(['+6%', '−13%', '0%'])
  })

  it('does not invent reps for old documents without them', () => {
    const old = session({ workoutId: 'old', exerciseId: 'squat', finishedAt: at('2026-10-10'), bestSetWeight: 105, bestSetReps: undefined })
    const withOld = summarizeAllExercises([...sessions, old], 30, anchor)
    expect(withOld.exercises.find(({ key }) => key === 'global:squat')!.change).toBeNull()
    expect(formatBestSet({ weight: 100, reps: null }, 'kg')).toBe('100 kg')
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
    expect(progressExtras({}, 'squat', 'global')).toEqual({ category: null })
    expect(progressExtras({ bestSetWeight: 100, sets: [{ weight: 90, reps: 10 }, { weight: 100, reps: 6 }, { weight: 100, reps: 8 }] }, 'squat', 'global')).toEqual({ bestSetReps: 8, category: null })
    expect(progressExtras({ bestSetReps: 6, category: 'legs', sets: [{ weight: 10, reps: 5 }] }, 'squat', 'global')).toEqual({ bestSetReps: 6, category: 'legs' })
    const sets = [{ weight: 40, reps: 8 }, { weight: 25, reps: 6 }, { weight: 25, reps: 7 }, { weight: 20, reps: 0 }, { weight: 'x', reps: 9 }]
    expect(progressExtras({ sets }, 'assisted-pull-up', 'global').leastAssisted).toEqual({ weight: 25, reps: 7 })
  })
})
