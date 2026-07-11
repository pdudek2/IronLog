import { describe, expect, it, vi } from 'vitest'
import { runCleanupActions, type CleanupAction } from './cleanupRegistry'

describe('runCleanupActions', () => {
  it('runs actions in reverse registration order', async () => {
    const calls: string[] = []
    const actions: CleanupAction[] = [
      { name: 'first', run: vi.fn(async () => { calls.push('first') }) },
      { name: 'second', run: vi.fn(async () => { calls.push('second') }) },
    ]

    await expect(runCleanupActions(actions)).resolves.toEqual([])
    expect(calls).toEqual(['second', 'first'])
  })

  it('continues after failure and returns every failed action', async () => {
    const actions: CleanupAction[] = [
      { name: 'profile', run: vi.fn(async () => { throw new Error('restore failed') }) },
      { name: 'session', run: vi.fn(async () => { throw new Error('discard failed') }) },
    ]

    await expect(runCleanupActions(actions)).resolves.toEqual([
      'session: discard failed',
      'profile: restore failed',
    ])
  })
})
