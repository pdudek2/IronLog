import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { Exercise } from '../../data/exercises'
import { useUserExercises } from '../useUserExercises'

const mocks = vi.hoisted(() => ({
  getUserExercises: vi.fn(),
}))

vi.mock('../../lib/userExercisesService', () => ({
  getUserExercises: mocks.getUserExercises,
}))

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

const userBExercise: Exercise = {
  id: 'user-b-curl',
  name: 'User B Curl',
  category: 'arms',
  equipment: 'dumbbell',
  muscles: ['biceps'],
}

afterEach(() => {
  vi.restoreAllMocks()
  mocks.getUserExercises.mockReset()
})

it('keeps catalog errors retryable without publishing a late result from another account', async () => {
  const userARetry = deferred<Exercise[]>()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  mocks.getUserExercises
    .mockRejectedValueOnce(new Error('offline'))
    .mockReturnValueOnce(userARetry.promise)
    .mockResolvedValueOnce([userBExercise])

  const { result, rerender } = renderHook(
    ({ uid }: { uid: string | null }) => useUserExercises(uid),
    { initialProps: { uid: 'user-a' } },
  )

  await waitFor(() => expect(result.current.state.status).toBe('error'))
  expect(result.current.exercises).toEqual([])

  act(() => result.current.retry())
  expect(result.current.state.status).toBe('loading')

  rerender({ uid: 'user-b' })
  await waitFor(() => expect(result.current.exercises).toEqual([userBExercise]))

  await act(async () => userARetry.resolve([]))
  expect(result.current.exercises).toEqual([userBExercise])
})

it('opens again from the last list of the same account while it reads the current one', async () => {
  const reread = deferred<Exercise[]>()
  mocks.getUserExercises.mockResolvedValueOnce([userBExercise]).mockReturnValueOnce(reread.promise).mockReturnValueOnce(new Promise(() => undefined))
  const first = renderHook(() => useUserExercises('user-c'))
  await waitFor(() => expect(first.result.current.exercises).toEqual([userBExercise]))
  first.unmount()

  const { result } = renderHook(() => useUserExercises('user-c'))
  expect(result.current.state.status).toBe('success')
  expect(result.current.exercises).toEqual([userBExercise])
  await act(async () => reread.resolve([]))
  expect(result.current.exercises).toEqual([])
  expect(renderHook(() => useUserExercises('user-d')).result.current.state.status).toBe('loading')
})
