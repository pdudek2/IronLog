import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReadinessEntry } from '../../lib/readinessService'
import ReadinessWidget from '../../components/ReadinessWidget'
import { NORMAL_DAY, ROUGH_DAY } from '../../shared/readiness'

const mocks = vi.hoisted(() => ({
  currentDate: '2026-07-12',
  currentUser: { uid: 'user-1' },
  getReadiness: vi.fn(),
  saveReadiness: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('../../store/authStore', () => {
  const useAuthStore = Object.assign(
    () => ({ user: mocks.currentUser }),
    { getState: () => ({ user: mocks.currentUser }) },
  )
  return { useAuthStore }
})

vi.mock('../../lib/readinessService', () => ({
  todayKey: () => mocks.currentDate,
  getReadiness: mocks.getReadiness,
  saveReadiness: mocks.saveReadiness,
}))

vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

function entry(date: string, sleep = 4, userId = 'user-1'): ReadinessEntry {
  return {
    userId,
    date,
    sleep,
    mood: 4,
    soreness: 2,
    createdAt: 123,
  }
}

describe('ReadinessWidget data states', () => {
  beforeEach(() => {
    mocks.currentDate = '2026-07-12'
    mocks.currentUser = { uid: 'user-1' }
    mocks.getReadiness.mockReset()
    mocks.saveReadiness.mockReset()
    mocks.toastError.mockReset()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  })

  it('performs one initial read in StrictMode and offers the rough day once it is known', async () => {
    const request = deferred<ReadinessEntry | null>()
    mocks.getReadiness.mockReturnValueOnce(request.promise)

    render(<StrictMode><ReadinessWidget rough={false} /></StrictMode>)

    await waitFor(() => expect(mocks.getReadiness).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    await act(async () => request.resolve(null))
    expect(await screen.findByRole('button', { name: 'Rough day? Ease the session' })).toBeInTheDocument()
  })

  it('loads without a line when there is no plan day to ease', async () => {
    const onStateChange = vi.fn()
    mocks.getReadiness.mockResolvedValueOnce(entry('2026-07-12'))

    const { container } = render(<ReadinessWidget rough={null} onStateChange={onStateChange} />)

    await waitFor(() => expect(onStateChange).toHaveBeenLastCalledWith({ status: 'success', data: entry('2026-07-12') }))
    expect(container).toBeEmptyDOMElement()
  })

  it('saves the rough day with one tap, and Undo saves a normal day', async () => {
    const onStateChange = vi.fn()
    mocks.getReadiness.mockResolvedValueOnce(null)
    const rough = { ...entry('2026-07-12'), ...ROUGH_DAY }
    mocks.saveReadiness.mockResolvedValueOnce(rough)

    const view = render(<ReadinessWidget rough={false} onStateChange={onStateChange} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Rough day? Ease the session' }))

    await waitFor(() => expect(onStateChange).toHaveBeenLastCalledWith({ status: 'success', data: rough }))
    expect(mocks.saveReadiness).toHaveBeenCalledWith('user-1', ROUGH_DAY)

    const normal = { ...entry('2026-07-12'), ...NORMAL_DAY }
    mocks.saveReadiness.mockResolvedValueOnce(normal)
    view.rerender(<ReadinessWidget rough onStateChange={onStateChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Rough day. Undo' }))
    await waitFor(() => expect(onStateChange).toHaveBeenLastCalledWith({ status: 'success', data: normal }))
    expect(mocks.saveReadiness).toHaveBeenLastCalledWith('user-1', NORMAL_DAY)
  })

  it('keeps the state when a save fails', async () => {
    const onStateChange = vi.fn()
    mocks.getReadiness.mockResolvedValueOnce(null)
    mocks.saveReadiness.mockRejectedValueOnce(new Error('offline'))

    render(<ReadinessWidget rough={false} onStateChange={onStateChange} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Rough day? Ease the session' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled())
    expect(onStateChange).toHaveBeenLastCalledWith({ status: 'success', data: null })
    expect(screen.getByRole('button', { name: 'Rough day? Ease the session' })).toBeEnabled()
  })

  it('renders a persistent error and recovers through retry', async () => {
    const onStateChange = vi.fn()
    mocks.getReadiness
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(entry('2026-07-12'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    render(<ReadinessWidget rough={false} onStateChange={onStateChange} />)

    expect(await screen.findByText('Could not load today’s check-in.')).toBeInTheDocument()
    expect(consoleError).toHaveBeenCalledWith('[ReadinessWidget] load failed', expect.any(Error))
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(onStateChange).toHaveBeenLastCalledWith({ status: 'success', data: entry('2026-07-12') }))
    expect(mocks.getReadiness).toHaveBeenCalledTimes(2)
    consoleError.mockRestore()
  })

  it('does not refetch on the same day and reads exactly once after the day changes', async () => {
    const onStateChange = vi.fn()
    mocks.getReadiness.mockImplementation(
      (_uid: string, date: string) => Promise.resolve(entry(date)),
    )

    render(<StrictMode><ReadinessWidget rough={false} onStateChange={onStateChange} /></StrictMode>)
    await waitFor(() => expect(onStateChange).toHaveBeenLastCalledWith({ status: 'success', data: entry('2026-07-12') }))

    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(mocks.getReadiness).toHaveBeenCalledTimes(1)

    mocks.currentDate = '2026-07-13'
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    await waitFor(() => expect(onStateChange).toHaveBeenLastCalledWith({ status: 'success', data: entry('2026-07-13') }))
    expect(mocks.getReadiness).toHaveBeenCalledTimes(2)
    expect(mocks.getReadiness).toHaveBeenLastCalledWith('user-1', '2026-07-13')
  })

  it('ignores a late response from the previous day', async () => {
    const onStateChange = vi.fn()
    const oldDay = deferred<ReadinessEntry | null>()
    const newDay = deferred<ReadinessEntry | null>()
    mocks.getReadiness
      .mockReturnValueOnce(oldDay.promise)
      .mockReturnValueOnce(newDay.promise)

    render(<ReadinessWidget rough={false} onStateChange={onStateChange} />)
    await waitFor(() => expect(mocks.getReadiness).toHaveBeenCalledTimes(1))

    mocks.currentDate = '2026-07-13'
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    await waitFor(() => expect(mocks.getReadiness).toHaveBeenCalledTimes(2))

    await act(async () => newDay.resolve(entry('2026-07-13', 5)))
    await act(async () => oldDay.resolve(entry('2026-07-12', 1)))
    expect(onStateChange).toHaveBeenLastCalledWith({ status: 'success', data: entry('2026-07-13', 5) })
  })

  it('ignores a late save from the previous user', async () => {
    const onStateChange = vi.fn()
    const save = deferred<ReadinessEntry>()
    mocks.getReadiness.mockResolvedValue(null)
    mocks.saveReadiness.mockReturnValueOnce(save.promise)

    render(<ReadinessWidget rough={false} onStateChange={onStateChange} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Rough day? Ease the session' }))

    mocks.currentUser = { uid: 'user-2' }
    await act(async () => save.resolve({ ...entry('2026-07-12'), ...ROUGH_DAY }))
    expect(onStateChange).not.toHaveBeenCalledWith({ status: 'success', data: expect.objectContaining(ROUGH_DAY) })
  })

  it('does not log a load rejection after unmount', async () => {
    const request = deferred<ReadinessEntry | null>()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.getReadiness.mockReturnValueOnce(request.promise)

    const { unmount } = render(<ReadinessWidget rough={false} />)
    unmount()
    await act(async () => request.reject(new Error('offline')))

    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
