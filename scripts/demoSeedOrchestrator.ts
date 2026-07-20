import type { DemoSeedSnapshot } from './demoSeedContract.js'

export interface DemoSeedOrchestrationDependencies {
  preflight: () => void | Promise<void>
  readSnapshot: () => Promise<DemoSeedSnapshot>
  validateSnapshot: (snapshot: DemoSeedSnapshot) => string[]
  resetDemo: () => Promise<void>
  seedUserExercises: () => Promise<void>
  seedTemplate: () => Promise<void>
  seedWorkouts: () => Promise<string[]>
  materializeAll: (workoutIds: string[]) => Promise<void>
  seedReadiness: () => Promise<void>
}

export interface DemoSeedOrchestrationResult {
  mode: 'dry-run' | 'seed'
  snapshot: DemoSeedSnapshot
  issues: string[]
}

export class DemoSeedSnapshotValidationError extends Error {
  readonly snapshot: DemoSeedSnapshot
  readonly issues: string[]

  constructor(snapshot: DemoSeedSnapshot, issues: string[]) {
    super('Walidacja snapshotu po reseedzie nie powiodła się.')
    this.name = 'DemoSeedSnapshotValidationError'
    this.snapshot = snapshot
    this.issues = issues
  }
}

export async function runDemoSeed(
  options: { dryRun: boolean },
  dependencies: DemoSeedOrchestrationDependencies,
): Promise<DemoSeedOrchestrationResult> {
  await dependencies.preflight()

  if (options.dryRun) {
    const snapshot = await dependencies.readSnapshot()
    return {
      mode: 'dry-run',
      snapshot,
      issues: dependencies.validateSnapshot(snapshot),
    }
  }

  await dependencies.resetDemo()
  await dependencies.seedUserExercises()
  await dependencies.seedTemplate()
  const workoutIds = await dependencies.seedWorkouts()
  await dependencies.materializeAll(workoutIds)
  await dependencies.seedReadiness()

  const snapshot = await dependencies.readSnapshot()
  const issues = dependencies.validateSnapshot(snapshot)
  if (issues.length > 0) {
    throw new DemoSeedSnapshotValidationError(snapshot, issues)
  }

  return { mode: 'seed', snapshot, issues }
}
