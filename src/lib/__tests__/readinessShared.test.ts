import { expect, it } from 'vitest'
import { buildNextSessionRecommendation } from '../nextSessionRecommendation'
import { computeReadinessScore } from '../readinessService'
import { fixtures, plan, workouts, NOW, readiness } from '../../shared/__fixtures__/readiness'
for (const fixture of fixtures) it(`web uses shared ${fixture.tone} readiness/native fixture`, () => {
  expect(computeReadinessScore(fixture.values).score).toBe(fixture.score)
  expect(buildNextSessionRecommendation(plan, 0, readiness(fixture.values), workouts, NOW).exercises.map(e => [e.sets,e.weight,e.reps])).toEqual(fixture.expected)
})
