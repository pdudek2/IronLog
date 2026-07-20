import { describe, expect, it, vi } from 'vitest'
import {
  DemoSeedSnapshotValidationError,
  runDemoSeed,
  type DemoSeedOrchestrationDependencies,
} from '../demoSeedOrchestrator.js'
import type { DemoSeedSnapshot } from '../demoSeedContract.js'

const validSnapshot: DemoSeedSnapshot = {
  workoutCount: 26,
  templateCount: 1,
  userExerciseCount: 4,
  readinessCount: 7,
  maxDurationMin: 74,
  blankWorkoutLabels: 0,
  hasActiveSession: false,
}

function createDependencies(
  overrides: Partial<DemoSeedOrchestrationDependencies> = {},
): DemoSeedOrchestrationDependencies {
  return {
    preflight: vi.fn(() => undefined),
    readSnapshot: vi.fn(async () => validSnapshot),
    validateSnapshot: vi.fn(() => []),
    resetDemo: vi.fn(async () => undefined),
    seedUserExercises: vi.fn(async () => undefined),
    seedTemplate: vi.fn(async () => undefined),
    seedWorkouts: vi.fn(async () => ['workout-1']),
    materializeAll: vi.fn(async () => undefined),
    seedReadiness: vi.fn(async () => undefined),
    ...overrides,
  }
}

function expectNoMutation(dependencies: DemoSeedOrchestrationDependencies): void {
  expect(dependencies.resetDemo).not.toHaveBeenCalled()
  expect(dependencies.seedUserExercises).not.toHaveBeenCalled()
  expect(dependencies.seedTemplate).not.toHaveBeenCalled()
  expect(dependencies.seedWorkouts).not.toHaveBeenCalled()
  expect(dependencies.materializeAll).not.toHaveBeenCalled()
  expect(dependencies.seedReadiness).not.toHaveBeenCalled()
}

describe('runDemoSeed', () => {
  it('does not reset, write or materialize when preflight rejects', async () => {
    const dependencies = createDependencies({
      preflight: vi.fn(() => {
        throw new Error('preflight rejected')
      }),
    })

    await expect(runDemoSeed({ dryRun: false }, dependencies))
      .rejects.toThrow('preflight rejected')

    expect(dependencies.preflight).toHaveBeenCalledTimes(1)
    expect(dependencies.readSnapshot).not.toHaveBeenCalled()
    expectNoMutation(dependencies)
  })

  it('reads and validates a snapshot in dry-run without any mutation', async () => {
    const dependencies = createDependencies()

    const result = await runDemoSeed({ dryRun: true }, dependencies)

    expect(result).toEqual({
      mode: 'dry-run',
      snapshot: validSnapshot,
      issues: [],
    })
    expect(dependencies.preflight).toHaveBeenCalledTimes(1)
    expect(dependencies.readSnapshot).toHaveBeenCalledTimes(1)
    expect(dependencies.validateSnapshot).toHaveBeenCalledWith(validSnapshot)
    expectNoMutation(dependencies)
  })

  it('rejects after a real seed when the post-seed snapshot is invalid', async () => {
    const issues = ['Aktywna sesja nadal istnieje.']
    const dependencies = createDependencies({
      validateSnapshot: vi.fn(() => issues),
    })

    await expect(runDemoSeed({ dryRun: false }, dependencies)).rejects.toEqual(
      new DemoSeedSnapshotValidationError(validSnapshot, issues),
    )

    expect(dependencies.resetDemo).toHaveBeenCalledTimes(1)
    expect(dependencies.seedUserExercises).toHaveBeenCalledTimes(1)
    expect(dependencies.seedTemplate).toHaveBeenCalledTimes(1)
    expect(dependencies.seedWorkouts).toHaveBeenCalledTimes(1)
    expect(dependencies.materializeAll).toHaveBeenCalledWith(['workout-1'])
    expect(dependencies.seedReadiness).toHaveBeenCalledTimes(1)
    expect(dependencies.readSnapshot).toHaveBeenCalledTimes(1)
  })
})
