import { StrictMode, createElement, type ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReadinessEntry } from '../../lib/readinessService'
import ReadinessWidget from '../../components/ReadinessWidget'

const mocks = vi.hoisted(() => ({
  currentDate: '2026-07-12',
  getReadiness: vi.fn(),
}))

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({ user: { uid: 'user-1' } }),
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
  default: () => <div>readiness-prompt</div>,
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

function entry(date: string, sleep = 4): ReadinessEntry {
  return {
    userId: 'user-1',
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
    mocks.getReadiness.mockReset()
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
})
