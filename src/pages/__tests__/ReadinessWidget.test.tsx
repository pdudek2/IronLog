import { StrictMode, createElement, type ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReadinessEntry } from '../../lib/readinessService'
import ReadinessWidget from '../../components/ReadinessWidget'

const mocks = vi.hoisted(() => ({
  currentDate: '2026-07-12',
  currentUser: { uid: 'user-1' },
  getReadiness: vi.fn(),
  onSaved: undefined as undefined | ((saved: ReadinessEntry) => void),
}))

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({ user: mocks.currentUser }),
}))

vi.mock('../../lib/readinessService', () => ({
  todayKey: () => mocks.currentDate,
  getReadiness: mocks.getReadiness,
  computeReadinessScore: (entry: ReadinessEntry) => ({
    score: entry.sleep,
    tone: 'high',
    color: 'var(--accent)',
    label: entry.date,
  }),
}))

vi.mock('../../components/ReadinessPrompt', () => ({
  default: ({ onSaved }: { onSaved: (saved: ReadinessEntry) => void }) => {
    mocks.onSaved = onSaved
    return <div>readiness-prompt</div>
  },
}))

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_target, tag: string | symbol) => {
      if (typeof tag !== 'string') return undefined
      return ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => {
        delete props.initial
        delete props.animate
        delete props.transition
        return createElement(tag, props, children)
      }
    },
  }),
}))

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
    mocks.onSaved = undefined
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  })

  it('performs one initial read in StrictMode and renders the prompt only for success null', async () => {
    const request = deferred<ReadinessEntry | null>()
    mocks.getReadiness.mockReturnValueOnce(request.promise)

    render(<StrictMode><ReadinessWidget /></StrictMode>)

    await waitFor(() => expect(mocks.getReadiness).toHaveBeenCalledTimes(1))
    await act(async () => request.resolve(null))
    expect(await screen.findByText('readiness-prompt')).toBeInTheDocument()
  })

  it('renders a persistent error instead of the prompt and recovers through retry', async () => {
    mocks.getReadiness
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(entry('2026-07-12'))

    render(<ReadinessWidget />)

    expect(await screen.findByText('Nie udało się wczytać gotowości')).toBeInTheDocument()
    expect(screen.queryByText('readiness-prompt')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))
    expect(await screen.findByText('2026-07-12')).toBeInTheDocument()
    expect(mocks.getReadiness).toHaveBeenCalledTimes(2)
  })

  it('does not refetch on the same day and reads exactly once after the day changes', async () => {
    mocks.getReadiness.mockImplementation(
      (_uid: string, date: string) => Promise.resolve(entry(date)),
    )

    render(<StrictMode><ReadinessWidget /></StrictMode>)
    expect(await screen.findByText('2026-07-12')).toBeInTheDocument()

    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(mocks.getReadiness).toHaveBeenCalledTimes(1)

    mocks.currentDate = '2026-07-13'
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(await screen.findByText('2026-07-13')).toBeInTheDocument()
    expect(mocks.getReadiness).toHaveBeenCalledTimes(2)
    expect(mocks.getReadiness).toHaveBeenLastCalledWith('user-1', '2026-07-13')
  })

  it('ignores a late response from the previous day', async () => {
    const oldDay = deferred<ReadinessEntry | null>()
    const newDay = deferred<ReadinessEntry | null>()
    mocks.getReadiness
      .mockReturnValueOnce(oldDay.promise)
      .mockReturnValueOnce(newDay.promise)

    render(<ReadinessWidget />)
    await waitFor(() => expect(mocks.getReadiness).toHaveBeenCalledTimes(1))

    mocks.currentDate = '2026-07-13'
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    await waitFor(() => expect(mocks.getReadiness).toHaveBeenCalledTimes(2))

    await act(async () => newDay.resolve(entry('2026-07-13', 5)))
    expect(await screen.findByText('2026-07-13')).toBeInTheDocument()
    await act(async () => oldDay.resolve(entry('2026-07-12', 1)))
    expect(screen.getByText('2026-07-13')).toBeInTheDocument()
    expect(screen.queryByText('2026-07-12')).not.toBeInTheDocument()
  })

  it('keys a save by the saved entry date when submission crosses midnight', async () => {
    mocks.getReadiness.mockResolvedValueOnce(null)

    render(<ReadinessWidget />)
    expect(await screen.findByText('readiness-prompt')).toBeInTheDocument()

    mocks.currentDate = '2026-07-13'
    act(() => mocks.onSaved?.(entry('2026-07-13', 5)))

    expect(await screen.findByText('2026-07-13')).toBeInTheDocument()
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(mocks.getReadiness).toHaveBeenCalledTimes(1)
  })

  it('ignores a late save from the previous user', async () => {
    mocks.getReadiness
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(entry('2026-07-12', 5, 'user-2'))

    const view = render(<ReadinessWidget />)
    expect(await screen.findByText('readiness-prompt')).toBeInTheDocument()
    const lateOnSaved = mocks.onSaved

    mocks.currentUser = { uid: 'user-2' }
    view.rerender(<ReadinessWidget />)
    expect(await screen.findByText('2026-07-12')).toBeInTheDocument()

    act(() => lateOnSaved?.(entry('2026-07-12', 1, 'user-1')))
    expect(screen.getByText('2026-07-12')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.queryByText('1')).not.toBeInTheDocument()
  })

  it('does not log a load rejection after unmount', async () => {
    const request = deferred<ReadinessEntry | null>()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.getReadiness.mockReturnValueOnce(request.promise)

    const { unmount } = render(<ReadinessWidget />)
    unmount()
    await act(async () => request.reject(new Error('offline')))

    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('logs the current load rejection', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.getReadiness.mockRejectedValueOnce(new Error('offline'))

    render(<ReadinessWidget />)

    expect(await screen.findByText('Nie udało się wczytać gotowości')).toBeInTheDocument()
    expect(consoleError).toHaveBeenCalledWith(
      '[ReadinessWidget] load failed',
      expect.any(Error),
    )
    consoleError.mockRestore()
  })
})
