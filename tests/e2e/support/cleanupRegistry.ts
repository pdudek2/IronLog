export interface CleanupAction {
  name: string
  run: () => Promise<void>
}

export async function runCleanupActions(actions: CleanupAction[]): Promise<string[]> {
  const failures: string[] = []

  for (const action of [...actions].reverse()) {
    try {
      await action.run()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failures.push(`${action.name}: ${message}`)
    }
  }

  return failures
}
