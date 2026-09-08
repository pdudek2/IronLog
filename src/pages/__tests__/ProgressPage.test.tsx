import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Children, isValidElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { loadProgressData, type ProgressLoadResult } from '../../lib/progressLoadService'
import type { ProgressSessionLite, RecordSummary } from '../../lib/progressService'
import ProgressPage, { DarkTooltip } from '../ProgressPage'
import { useProfileStore } from '../../store/profileStore'

const { authUser } = vi.hoisted(() => ({
  authUser: { uid: 'user-1' },
}))

vi.mock('../../store/authStore', () => ({
  useAuthStore: vi.fn(() => ({ user: authUser })),
}))

vi.mock('../../lib/progressLoadService', () => ({
  loadProgressData: vi.fn(),
}))

vi.mock('../../lib/progressService', async () => {
  const actual = await vi.importActual<typeof import('../../lib/progressService')>('../../lib/progressService')
  return {
    ...actual,
    getProgressSessions: vi.fn().mockRejectedValue(new Error('legacy direct sessions load')),
    getRecords: vi.fn().mockRejectedValue(new Error('legacy direct records load')),
  }
})

vi.mock('framer-motion', async () => {
  const { createElement } = await vi.importActual<typeof import('react')>('react')

  return {
    motion: new Proxy({}, {
      get: (_target, tag: string | symbol) => {
        if (typeof tag !== 'string') return undefined

        return ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => {
          const domProps = { ...props }
          delete domProps.initial
          delete domProps.animate
          delete domProps.transition
          return createElement(tag, domProps, children)
        }
      },
    }),
  }
})

vi.mock('@number-flow/react', () => ({
  default: ({ value }: { value: number }) => <span>{value}</span>,
}))

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children?: ReactNode }) => <>{children}</>,
  AreaChart: () => <div data-testid="area-chart" />,
  LineChart: ({ children }: { children?: ReactNode }) => <div data-testid="line-chart">{children}</div>,
  BarChart: () => <div data-testid="bar-chart" />,
  Area: () => null,
  Bar: () => null,
  CartesianGrid: () => null,
  Cell: () => null,
  Line: ({ dataKey, name }: { dataKey?: string; name?: string }) => (
    <span data-testid="strength-line" data-data-key={dataKey} data-name={name} />
  ),
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}))

const NOW = Date.UTC(2026, 6, 10, 12)
const DAY_MS = 86_400_000
const mockLoadProgressData = vi.mocked(loadProgressData)

function session(
  id: string,
  daysAgo: number,
  overrides: Partial<ProgressSessionLite> = {},
): ProgressSessionLite {
  return {
    id,
    workoutId: `workout-${id}`,
    exerciseId: 'bench',
    exerciseSource: 'global',
    finishedAt: NOW - daysAgo * DAY_MS,
    totalVolume: 1_000,
    totalSets: 3,
    bestSetWeight: 80,
    exerciseName: 'Wyciskanie sztangi',
    muscleGroups: ['chest'],
    ...overrides,
  }
}

function record(id: string, overrides: Partial<RecordSummary> = {}): RecordSummary {
  return {
    id,
    exerciseId: 'bench',
    exerciseSource: 'global',
    exerciseName: 'Wyciskanie sztangi',
    maxWeight: 100,
    maxReps: 5,
    bestVolume: 500,
    totalSessions: 8,
    lastPerformedAt: NOW - DAY_MS,
    ...overrides,
  }
}

function successfulLoad(options: {
  sessions?: ProgressSessionLite[]
  records?: RecordSummary[]
  sessionsTruncated?: boolean
  recordsTruncated?: boolean
  freshness?: ProgressLoadResult['freshness']
  fetchedAt?: number
} = {}): ProgressLoadResult {
  return {
    sessions: {
      status: 'success',
      value: {
        sessions: options.sessions ?? [],
        truncated: options.sessionsTruncated ?? false,
      },
    },
    records: {
      status: 'success',
      value: {
        records: options.records ?? [],
        truncated: options.recordsTruncated ?? false,
      },
    },
    freshness: options.freshness ?? 'fresh',
    fetchedAt: options.fetchedAt ?? NOW,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

describe('ProgressPage', () => {
  let consoleError: ReturnType<typeof vi.spyOn>
  let dateNow: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    authUser.uid = 'user-1'
    dateNow = vi.spyOn(Date, 'now').mockReturnValue(NOW)
    mockLoadProgressData.mockReset()
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    useProfileStore.getState().setProfile('user-1', {
      displayName: 'Tester', weeklyGoal: 3, primaryGoal: 'strength', units: 'kg', createdAt: 1,
    })
  })

  afterEach(() => {
    consoleError.mockRestore()
    dateNow.mockRestore()
  })

  it('keeps the board mounted when switching from 90 to 30 days and does not call the loader again', async () => {
    const pending = deferred<ProgressLoadResult>()
    mockLoadProgressData.mockReturnValue(pending.promise)

    render(<ProgressPage />)

    const initialPage = screen.getByTestId('progress-page')
    expect(initialPage).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('Loading progress')

    await act(async () => {
      pending.resolve(successfulLoad({
        sessions: [session('recent', 10), session('older', 60)],
        records: [record('record-1')],
      }))
    })

    await waitFor(() => expect(initialPage).toHaveAttribute('aria-busy', 'false'))
    expect(screen.getByRole('link', { name: 'View history' })).toHaveAttribute('href', '/history')
    expect(within(screen.getByRole('group', { name: 'Sessions' })).getByText('2')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '30 days' }))

    expect(screen.getByTestId('progress-page')).toBe(initialPage)
    expect(initialPage).toHaveAttribute('aria-busy', 'false')
    expect(within(screen.getByRole('group', { name: 'Sessions' })).getByText('1')).toBeInTheDocument()
    expect(mockLoadProgressData).toHaveBeenCalledTimes(1)
  })

  it.each([true, false])('shows each summary metric once with prior-period comparisons available: %s', async (hasPreviousPeriod) => {
    mockLoadProgressData.mockResolvedValue(successfulLoad({
      sessions: [
        ...Array.from({ length: 5 }, (_, index) => session(`current-${index}`, index + 1, { totalVolume: 450 })),
        ...(hasPreviousPeriod ? [
          session('previous-1', 100, { totalVolume: 500 }),
          session('previous-2', 120, { totalVolume: 600 }),
        ] : []),
      ],
      records: [record('record-1')],
    }))
    render(<ProgressPage />)

    const summary = await screen.findByRole('group', { name: 'Summary: 90 days' })
    const volume = within(summary).getByRole('group', { name: 'Volume' })
    const sessions = within(summary).getByRole('group', { name: 'Sessions' })
    const average = within(summary).getByRole('group', { name: 'Avg. / session' })
    expect(within(volume).getByText('2250')).toBeInTheDocument()
    expect(within(volume).getByText('Last 90 days')).toBeInTheDocument()
    expect(within(sessions).getByText('5')).toBeInTheDocument()
    expect(within(average).getByText('450 kg')).toBeInTheDocument()
    expect(within(summary).getAllByRole('group')).toHaveLength(6)
    for (const name of ['Volume', 'Sessions', 'Avg. / session', 'Exercises', 'Records', 'Muscle group']) {
      expect(within(summary).getAllByRole('group', { name })).toHaveLength(1)
    }
    expect(document.querySelector('.progress-comparison-strip')).not.toBeInTheDocument()
    expect(within(summary).queryByText('2.3k kg')).not.toBeInTheDocument()

    if (hasPreviousPeriod) {
      expect(within(volume).getByText('+105% vs previous')).toHaveAttribute('data-trend', 'up')
      expect(within(sessions).getByText('+150% vs previous')).toHaveAttribute('data-trend', 'up')
      expect(within(average).getByText('-18% vs previous')).toHaveAttribute('data-trend', 'down')
      expect(within(summary).getAllByText(/vs previous/)).toHaveLength(3)
    } else {
      expect(within(summary).queryByText(/vs previous/)).not.toBeInTheDocument()
    }
  })

  it('presents volume, strength and records in lbs while retaining kg chart data', async () => {
    useProfileStore.getState().setProfile('user-1', {
      displayName: 'Tester', weeklyGoal: 3, primaryGoal: 'strength', units: 'lbs', createdAt: 1,
    })
    mockLoadProgressData.mockResolvedValue(successfulLoad({
      sessions: [
        session('one', 3, { totalVolume: 520, bestSetWeight: 65 }),
        session('two', 2, { totalVolume: 520, bestSetWeight: 65 }),
        session('three', 1, { totalVolume: 520, bestSetWeight: 65 }),
      ],
      records: [record('record-lbs', { maxWeight: 65 })],
    }))

    render(<ProgressPage />)

    const summary = await screen.findByRole('group', { name: 'Summary: 90 days' })
    expect(within(summary).getByRole('group', { name: 'Avg. / session' })).toHaveTextContent('1.1k lbs')
    expect(screen.getByLabelText('Best record')).toHaveTextContent('143.3 lbs')
    expect(screen.getByRole('img', { name: /Weight progression/ })).toHaveAccessibleName(/143.3 lbs/)
  })

  it('loads annual data older than 180 days and compares the previous year after a range switch', async () => {
    const annual = deferred<ProgressLoadResult>()
    mockLoadProgressData
      .mockResolvedValueOnce(successfulLoad({ sessions: [session('recent', 10)], records: [record('record-1')] }))
      .mockReturnValueOnce(annual.promise)
    render(<ProgressPage />)
    await screen.findByRole('group', { name: 'Sessions' })
    expect(mockLoadProgressData).toHaveBeenLastCalledWith('user-1', 90)

    fireEvent.click(screen.getByRole('button', { name: 'Year' }))
    expect(mockLoadProgressData).toHaveBeenLastCalledWith('user-1', 365)
    expect(screen.getByTestId('progress-page')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('Loading progress')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Sessions' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Weekly volume' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'All-time records' })).toBeInTheDocument()

    await act(async () => annual.resolve(successfulLoad({
      sessions: [session('recent', 10), session('old-current-year', 200), session('previous-year', 400)],
      records: [record('record-1')],
    })))
    expect(within(screen.getByRole('group', { name: 'Sessions' })).getByText('2')).toBeInTheDocument()
    const comparison = screen.getByRole('group', { name: 'Summary: 365 days' })
    expect(within(comparison).getByRole('group', { name: 'Volume' })).toHaveTextContent('2000 kg')
    expect(within(comparison).getAllByText('+100% vs previous')).toHaveLength(2)
    expect(within(comparison).getByText('+0% vs previous')).toBeInTheDocument()
    expect(screen.getByTestId('progress-page')).toHaveAttribute('aria-busy', 'false')
    fireEvent.click(screen.getByRole('button', { name: '90 days' }))
    expect(within(screen.getByRole('group', { name: 'Sessions' })).getByText('1')).toBeInTheDocument()
    expect(mockLoadProgressData).toHaveBeenCalledTimes(2)
  })

  it('does not promote a shorter snapshot after annual sessions fail and retries the selected range', async () => {
    const annual = deferred<ProgressLoadResult>()
    mockLoadProgressData
      .mockResolvedValueOnce(successfulLoad({ sessions: [session('recent', 10)], records: [record('record-1')] }))
      .mockReturnValueOnce(annual.promise)
    render(<ProgressPage />)
    await screen.findByRole('group', { name: 'Sessions' })
    fireEvent.click(screen.getByRole('button', { name: 'Year' }))

    await act(async () => annual.resolve({
      ...successfulLoad({ records: [record('record-2', { exerciseName: 'Nowy rekord' })] }),
      sessions: { status: 'error', error: new Error('annual sessions unavailable') },
    }))
    expect(screen.queryByRole('group', { name: 'Sessions' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Weekly volume' })).not.toBeInTheDocument()
    expect(screen.queryByText('No data', { exact: true })).not.toBeInTheDocument()
    expect(screen.getByText('Nowy rekord')).toBeInTheDocument()
    expect(screen.getByText('Could not refresh workout data.')).toBeInTheDocument()

    mockLoadProgressData.mockResolvedValueOnce(successfulLoad({ sessions: [session('older', 200)] }))
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByRole('group', { name: 'Sessions' })
    expect(mockLoadProgressData).toHaveBeenLastCalledWith('user-1', 365)
    expect(screen.getByRole('heading', { name: 'Weekly volume' })).toBeInTheDocument()
  })

  it('discards the previous account snapshot and its in-flight range result', async () => {
    const annual = deferred<ProgressLoadResult>()
    const nextAccount = deferred<ProgressLoadResult>()
    mockLoadProgressData
      .mockResolvedValueOnce(successfulLoad({ sessions: [session('recent', 10)], records: [record('record-1', { exerciseName: 'Account A record' })] }))
      .mockReturnValueOnce(annual.promise)
      .mockReturnValueOnce(nextAccount.promise)
    const view = render(<ProgressPage />)
    await screen.findAllByText('Account A record')
    fireEvent.click(screen.getByRole('button', { name: 'Year' }))
    authUser.uid = 'user-2'
    view.rerender(<ProgressPage />)
    expect(mockLoadProgressData).toHaveBeenLastCalledWith('user-2', 90)
    expect(screen.queryByText('Account A record')).not.toBeInTheDocument()
    await act(async () => annual.resolve(successfulLoad({ sessions: [session('stale-account', 200)], records: [record('stale-record')] })))
    expect(screen.queryByRole('group', { name: 'Sessions' })).not.toBeInTheDocument()
    await act(async () => nextAccount.resolve(successfulLoad()))
    expect(screen.getByText('No data', { exact: true })).toBeInTheDocument()
    expect(screen.queryByText('Wyciskanie sztangi')).not.toBeInTheDocument()
  })

  it('renders charts data and a records-unavailable notice when records fail', async () => {
    const recordsError = new Error('records unavailable')
    mockLoadProgressData.mockResolvedValue({
      ...successfulLoad({ sessions: [session('recent', 2)] }),
      records: { status: 'error', error: recordsError },
    })

    render(<ProgressPage />)

    expect(await screen.findByRole('heading', { name: 'Weekly volume' })).toBeInTheDocument()
    expect(screen.getByText('Could not refresh all-time records.').closest('[role="status"]')).toBeInTheDocument()
    const recordsMetric = screen.getByText('Records').parentElement
    expect(recordsMetric).not.toBeNull()
    expect(within(recordsMetric!).getByText('—')).toBeInTheDocument()
    expect(screen.queryByText('Could not load data')).not.toBeInTheDocument()
    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalledWith('[ProgressPage] records load failed', recordsError)
  })

  it('renders all-time records and a sessions-unavailable notice when sessions fail', async () => {
    const sessionsError = new Error('sessions unavailable')
    mockLoadProgressData.mockResolvedValue({
      ...successfulLoad({ records: [record('record-1')] }),
      sessions: { status: 'error', error: sessionsError },
    })

    render(<ProgressPage />)

    expect(await screen.findByRole('heading', { name: 'All-time records' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Could not refresh workout data.')
    expect(screen.queryByRole('heading', { name: 'Weekly volume' })).not.toBeInTheDocument()
    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalledWith('[ProgressPage] sessions load failed', sessionsError)
  })

  it('keeps one featured record and renders the rest as ledger rows', async () => {
    mockLoadProgressData.mockResolvedValue(successfulLoad({
      records: [
        record('record-1'),
        record('record-2', { exerciseName: 'Przysiad' }),
        record('record-3', { exerciseName: 'Martwy ciąg' }),
      ],
    }))

    render(<ProgressPage />)

    const featured = await screen.findByLabelText('Best record')
    const ledger = screen.getByLabelText('More records')
    expect(featured.querySelectorAll('.progress-record-feature')).toHaveLength(1)
    expect(ledger.querySelectorAll('.progress-record-ledger-row')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /Show all/i })).not.toBeInTheDocument()
    expect(screen.queryByText('PR', { exact: true })).not.toBeInTheDocument()
  })

  it('shows only five remaining records by default and toggles the full list accessibly', async () => {
    mockLoadProgressData.mockResolvedValue(successfulLoad({
      records: [
        record('record-1', { exerciseName: 'Wyciskanie' }),
        record('record-2', { exerciseName: 'Przysiad' }),
        record('record-3', { exerciseName: 'Martwy ciąg' }),
        record('record-4', { exerciseName: 'Wiosłowanie' }),
        record('record-5', { exerciseName: 'OHP' }),
        record('record-6', { exerciseName: 'Podciąganie' }),
        record('record-7', { exerciseName: 'Hip thrust' }),
      ],
    }))

    render(<ProgressPage />)

    const ledger = await screen.findByLabelText('More records')
    const toggle = screen.getByRole('button', { name: 'Show all (6)' })

    expect(ledger.querySelectorAll('.progress-record-ledger-row')).toHaveLength(5)
    expect(within(ledger).queryByText('Hip thrust')).not.toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAttribute('aria-controls', 'progress-remaining-records')

    fireEvent.click(toggle)

    const expandedLedger = screen.getByLabelText('More records')
    expect(expandedLedger.querySelectorAll('.progress-record-ledger-row')).toHaveLength(6)
    expect(within(expandedLedger).getByText('Hip thrust')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Show less' }))

    const collapsedLedger = screen.getByLabelText('More records')
    expect(collapsedLedger.querySelectorAll('.progress-record-ledger-row')).toHaveLength(5)
    expect(within(collapsedLedger).queryByText('Hip thrust')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show all (6)' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('pages every remaining record in bounded groups, handles the last page and resets on collapse', async () => {
    mockLoadProgressData.mockResolvedValue(successfulLoad({
      records: Array.from({ length: 46 }, (_, index) => record(`record-${index}`, {
        exerciseName: `Exercise ${index}`,
      })),
    }))
    render(<ProgressPage />)

    await screen.findByLabelText('More records')
    const rowNames = () => Array.from(screen.getByLabelText('More records').querySelectorAll('.progress-record-ledger-row strong'), (row) => row.textContent)
    expect(rowNames()).toEqual(Array.from({ length: 5 }, (_, index) => `Exercise ${index + 1}`))
    expect(screen.queryByRole('navigation', { name: 'Record pages' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show all (45)' }))

    const previous = () => screen.getByRole('button', { name: 'Previous record page' })
    const next = () => screen.getByRole('button', { name: 'Next record page' })
    expect(previous()).toBeDisabled()
    expect(next()).toBeEnabled()
    expect(next()).toHaveAttribute('aria-controls', 'progress-remaining-records')
    expect(screen.getByText('Page 1 of 3')).toHaveAttribute('aria-live', 'polite')
    expect(rowNames()).toEqual(Array.from({ length: 20 }, (_, index) => `Exercise ${index + 1}`))
    const visited = [...rowNames()]
    fireEvent.click(previous())
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument()

    fireEvent.click(next())
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument()
    expect(previous()).toBeEnabled()
    expect(rowNames()).toEqual(Array.from({ length: 20 }, (_, index) => `Exercise ${index + 21}`))
    visited.push(...rowNames())
    fireEvent.click(next())
    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument()
    expect(next()).toBeDisabled()
    expect(rowNames()).toEqual(Array.from({ length: 5 }, (_, index) => `Exercise ${index + 41}`))
    visited.push(...rowNames())
    expect(visited).toEqual(Array.from({ length: 45 }, (_, index) => `Exercise ${index + 1}`))
    expect(within(screen.getByLabelText('Best record')).getByText('Exercise 0')).toBeInTheDocument()
    fireEvent.click(next())
    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument()
    fireEvent.click(previous())
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show less' }))
    expect(rowNames()).toHaveLength(5)
    expect(screen.queryByRole('navigation', { name: 'Record pages' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show all (45)' }))
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument()
    expect(rowNames()).toEqual(Array.from({ length: 20 }, (_, index) => `Exercise ${index + 1}`))
    expect(mockLoadProgressData).toHaveBeenCalledTimes(1)
  })

  it('clamps the expanded page when refreshed records shrink', async () => {
    mockLoadProgressData
      .mockResolvedValueOnce(successfulLoad({
        records: Array.from({ length: 46 }, (_, index) => record(`record-${index}`, { exerciseName: `Exercise ${index}` })),
        freshness: 'uncertain',
      }))
      .mockResolvedValueOnce(successfulLoad({
        records: Array.from({ length: 22 }, (_, index) => record(`record-${index}`, { exerciseName: `Exercise ${index}` })),
      }))
    render(<ProgressPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Show all (45)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next record page' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next record page' }))
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next record page' })).toBeDisabled()
    const ledger = screen.getByLabelText('More records')
    expect(ledger.querySelectorAll('.progress-record-ledger-row')).toHaveLength(1)
    expect(within(ledger).getByText('Exercise 21')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Previous record page' }))
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
    expect(screen.getByLabelText('More records').querySelectorAll('.progress-record-ledger-row')).toHaveLength(20)
  })

  it('shows the hard error only when both datasets fail with no previous snapshot', async () => {
    const sessionsError = new Error('sessions unavailable')
    const recordsError = new Error('records unavailable')
    mockLoadProgressData.mockResolvedValue({
      sessions: { status: 'error', error: sessionsError },
      records: { status: 'error', error: recordsError },
      freshness: 'uncertain',
      fetchedAt: NOW,
    })

    render(<ProgressPage />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not load data')
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.getByTestId('progress-page')).toHaveAttribute('aria-busy', 'false')
    expect(consoleError).toHaveBeenCalledTimes(2)
    expect(consoleError).toHaveBeenNthCalledWith(1, '[ProgressPage] sessions load failed', sessionsError)
    expect(consoleError).toHaveBeenNthCalledWith(2, '[ProgressPage] records load failed', recordsError)
  })

  it('replaces empty-range metrics with one longer-range action and retains all-time records', async () => {
    mockLoadProgressData.mockResolvedValue(successfulLoad({
      sessions: [session('older', 60)],
      records: [record('record-1')],
    }))

    render(<ProgressPage />)

    expect(await screen.findByRole('heading', { name: 'All-time records' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '30 days' }))

    const emptyStatus = screen.getByRole('status')
    expect(emptyStatus).toHaveTextContent('No workouts in this date range')
    expect(screen.getByRole('link', { name: 'View history' })).toHaveAttribute('href', '/history')
    expect(screen.queryByText('0 sessions in range')).not.toBeInTheDocument()
    fireEvent.click(within(emptyStatus).getByRole('button', { name: 'Show year' }))

    expect(screen.getByRole('button', { name: 'Year' })).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByRole('heading', { name: 'Weekly volume' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'All-time records' })).toBeInTheDocument()
    expect(mockLoadProgressData).toHaveBeenCalledTimes(2)
    expect(mockLoadProgressData).toHaveBeenLastCalledWith('user-1', 365)
  })

  it('announces truncation and uncertain freshness with one retry action', async () => {
    mockLoadProgressData.mockResolvedValue(successfulLoad({
      sessions: [session('recent', 2)],
      records: [record('record-1')],
      sessionsTruncated: true,
      recordsTruncated: true,
      freshness: 'uncertain',
    }))

    render(<ProgressPage />)

    const notice = await waitFor(() => {
      const settledNotice = screen.getByText(/Recent workouts may not be visible yet/).closest('[role="status"]')
      expect(settledNotice).toBeInTheDocument()
      return settledNotice
    })
    expect(notice).toHaveTextContent('Workout analytics include the 5,000 most recent entries.')
    expect(notice).toHaveTextContent('The record list is limited to 1,000 entries.')
    expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(1)
  })

  it('presents truncation as a stable limit without a retry action', async () => {
    mockLoadProgressData.mockResolvedValue(successfulLoad({
      sessions: [session('recent', 2)],
      records: [record('record-1')],
      sessionsTruncated: true,
      recordsTruncated: true,
    }))

    render(<ProgressPage />)

    const notice = await waitFor(() => {
      const settledNotice = screen.getByText('Data range has been limited').closest('[role="status"]')
      if (!(settledNotice instanceof HTMLElement)) throw new Error('Expected a settled truncation status.')
      return settledNotice
    })
    expect(notice).toHaveTextContent('Data range has been limited')
    expect(notice).toHaveTextContent('Workout analytics include the 5,000 most recent entries.')
    expect(notice).toHaveTextContent('The record list is limited to 1,000 entries.')
    expect(within(notice).queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('retains successful previous data while retrying and merges settled partial results', async () => {
    const pendingRetry = deferred<ProgressLoadResult>()
    const sessionsError = new Error('sessions retry failed')
    mockLoadProgressData
      .mockResolvedValueOnce(successfulLoad({
        sessions: [session('recent', 2)],
        records: [record('bench-record')],
        freshness: 'uncertain',
      }))
      .mockReturnValueOnce(pendingRetry.promise)

    render(<ProgressPage />)

    const retryButton = await screen.findByRole('button', { name: 'Try again' })
    const page = screen.getByTestId('progress-page')
    fireEvent.click(retryButton)

    expect(screen.getByTestId('progress-page')).toBe(page)
    expect(page).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('heading', { name: 'Weekly volume' })).toBeInTheDocument()
    const recordsSection = screen.getByRole('heading', { name: 'All-time records' }).closest('section')
    expect(recordsSection).not.toBeNull()
    expect(within(recordsSection!).getByText('Wyciskanie sztangi')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refreshing…' })).toBeDisabled()

    await act(async () => {
      pendingRetry.resolve({
        ...successfulLoad({ records: [record('squat-record', {
          exerciseId: 'squat',
          exerciseName: 'Przysiad',
          maxWeight: 140,
        })] }),
        sessions: { status: 'error', error: sessionsError },
      })
    })

    await waitFor(() => expect(page).toHaveAttribute('aria-busy', 'false'))
    expect(screen.getByRole('heading', { name: 'Weekly volume' })).toBeInTheDocument()
    const refreshedRecordsSection = screen.getByRole('heading', { name: 'All-time records' }).closest('section')
    expect(refreshedRecordsSection).not.toBeNull()
    expect(within(refreshedRecordsSection!).getByText('Przysiad')).toBeInTheDocument()
    expect(within(refreshedRecordsSection!).queryByText('Wyciskanie sztangi')).not.toBeInTheDocument()
    expect(screen.getByText('Could not refresh workout data.').closest('[role="status"]')).toBeInTheDocument()
  })

  it('keeps the previous session fetchedAt anchor when a retry refreshes only records', async () => {
    const sessionsError = new Error('sessions retry failed')
    mockLoadProgressData
      .mockResolvedValueOnce(successfulLoad({
        sessions: [session('edge-of-range', 80)],
        records: [record('record-1')],
        freshness: 'uncertain',
      }))
      .mockResolvedValueOnce({
        ...successfulLoad({
          records: [record('record-2', { exerciseName: 'Martwy ciąg po odświeżeniu' })],
          fetchedAt: NOW + 30 * DAY_MS,
        }),
        sessions: { status: 'error', error: sessionsError },
      })

    render(<ProgressPage />)

    expect(await screen.findByRole('img', { name: /Workout volume/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    const page = screen.getByTestId('progress-page')
    await waitFor(() => expect(page).toHaveAttribute('aria-busy', 'false'))
    expect(mockLoadProgressData).toHaveBeenCalledTimes(2)
    const recordsSection = screen.getByRole('heading', { name: 'All-time records' }).closest('section')
    expect(recordsSection).not.toBeNull()
    expect(within(recordsSection!).getByText('Martwy ciąg po odświeżeniu')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Workout volume/ })).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Sessions' })).getByText('1')).toBeInTheDocument()
    expect(screen.queryByText('No workouts in this date range.')).not.toBeInTheDocument()
  })

  it('uses data keys to distinguish tooltip rows with the same strength display name', () => {
    const tooltip = DarkTooltip({
      active: true,
      payload: [
        { name: 'Wyciskanie sztangi', dataKey: 'global:bench', value: 80 },
        { name: 'Wyciskanie sztangi', dataKey: 'user:bench', value: 60 },
      ],
    })
    const rows = Children.toArray(tooltip?.props.children).slice(1).filter(isValidElement)

    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((row) => row.key)).size).toBe(2)
    expect(rows.map((row) => String(row.key))).toEqual(expect.arrayContaining([
      expect.stringContaining('global'),
      expect.stringContaining('user'),
    ]))
  })

  it('renders one strength series and switches it with a source-aware selector', async () => {
    mockLoadProgressData.mockResolvedValue(successfulLoad({
      sessions: [
        session('global-1', 4, { bestSetWeight: 70 }),
        session('global-2', 3, { bestSetWeight: 75 }),
        session('global-3', 2, { bestSetWeight: 80 }),
        session('global-4', 2, { bestSetWeight: 78 }),
        session('user-0', 5, {
          exerciseSource: 'user',
          exerciseId: 'row',
          exerciseName: 'Wiosłowanie custom',
          bestSetWeight: 50,
        }),
        session('user-1', 3, {
          exerciseSource: 'user',
          exerciseId: 'row',
          exerciseName: 'Wiosłowanie custom',
          bestSetWeight: 55,
        }),
        session('user-2', 1, {
          exerciseSource: 'user',
          exerciseId: 'row',
          exerciseName: 'Wiosłowanie custom',
          bestSetWeight: 60,
        }),
      ],
    }))

    render(<ProgressPage />)

    const selector = await screen.findByRole('combobox', { name: 'Chart exercise' })
    expect(selector).toHaveValue('global:bench')
    expect(screen.getAllByTestId('strength-line')).toHaveLength(1)
    expect(screen.getByTestId('strength-line')).toHaveAttribute('data-data-key', 'global:bench')
    expect(screen.getByRole('img', { name: /Weight progression for 1 exercise\./ })).toBeInTheDocument()
    expect(screen.getByText('Latest 80 kg')).toBeInTheDocument()
    expect(screen.getByText('+10 kg compared with the first in this range')).toBeInTheDocument()

    fireEvent.change(selector, { target: { value: 'user:row' } })

    expect(screen.getAllByTestId('strength-line')).toHaveLength(1)
    expect(screen.getByTestId('strength-line')).toHaveAttribute('data-data-key', 'user:row')
    expect(screen.getByText('Latest 60 kg')).toBeInTheDocument()
  })

  it('disambiguates colliding strength names in the selector without repeating the selection in the insight', async () => {
    mockLoadProgressData.mockResolvedValue(successfulLoad({
      sessions: [
        session('global-1', 4, { bestSetWeight: 70 }),
        session('global-2', 3, { bestSetWeight: 75 }),
        session('global-3', 2, { bestSetWeight: 80 }),
        session('global-4', 2, { bestSetWeight: 78 }),
        session('user-1', 4, { exerciseSource: 'user', bestSetWeight: 50 }),
        session('user-2', 3, { exerciseSource: 'user', bestSetWeight: 55 }),
        session('user-3', 1, { exerciseSource: 'user', bestSetWeight: 60 }),
        session('row-1', 1, {
          exerciseId: 'row',
          exerciseName: 'Wiosłowanie',
          bestSetWeight: 50,
        }),
      ],
    }))

    render(<ProgressPage />)

    const selector = await screen.findByRole('combobox', { name: 'Chart exercise' })
    expect(within(selector).getByRole('option', { name: 'Wyciskanie sztangi · shared' })).toBeInTheDocument()
    expect(within(selector).getByRole('option', { name: 'Wyciskanie sztangi · mine' })).toBeInTheDocument()
    expect(within(selector).getByRole('option', { name: 'Wiosłowanie' })).toBeInTheDocument()
    expect(within(selector).queryByRole('option', { name: /Wiosłowanie ·/ })).not.toBeInTheDocument()

    fireEvent.change(selector, { target: { value: 'user:bench' } })

    const insight = screen.getByLabelText('Selected exercise trend')
    expect(within(insight).queryByText('Wyciskanie sztangi · mine')).not.toBeInTheDocument()
    expect(within(insight).getByText('Latest 60 kg')).toBeInTheDocument()
    expect(screen.getByTestId('strength-line')).toHaveAttribute('data-data-key', 'user:bench')
  })

  it('keeps the strength panel mounted when completed sessions have no positive weight', async () => {
    mockLoadProgressData.mockResolvedValue(successfulLoad({
      sessions: [
        session('zero-1', 2, { bestSetWeight: 0 }),
        session('zero-2', 1, { bestSetWeight: 0 }),
      ],
    }))

    render(<ProgressPage />)

    const heading = await screen.findByRole('heading', { name: 'Weight progression' })
    const panel = heading.closest('section')
    expect(panel).not.toBeNull()
    expect(within(panel!).getByText(
      'No recorded weights above 0 kg in this range. Add a set weight to see progression.',
    )).toBeInTheDocument()
    expect(within(panel!).queryByRole('combobox', { name: 'Chart exercise' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('strength-line')).not.toBeInTheDocument()
  })

  it('falls back to the most frequent valid series and evaluates readiness per exercise', async () => {
    mockLoadProgressData.mockResolvedValue(successfulLoad({
      sessions: [
        session('bench-1', 3),
        session('bench-2', 2),
        session('bench-3', 1),
        session('row-1', 45, {
          exerciseId: 'row',
          exerciseName: 'Wiosłowanie',
          bestSetWeight: 50,
        }),
      ],
    }))

    render(<ProgressPage />)
    const selector = await screen.findByRole('combobox', { name: 'Chart exercise' })
    fireEvent.change(selector, { target: { value: 'global:row' } })

    expect(screen.getByText('Chart needs 2 days with recorded weight.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '30 days' }))
    expect(selector).toHaveValue('global:bench')
  })

  it('exposes a visible heatmap summary', async () => {
    mockLoadProgressData.mockResolvedValue(successfulLoad({
      sessions: [
        session('global-1', 3, { finishedAt: new Date(2026, 6, 7, 12).getTime() }),
        session('user-1', 2, { exerciseSource: 'user' }),
        session('global-2', 1),
      ],
    }))

    render(<ProgressPage />)

    expect(await screen.findByText(
      /3 active days · strongest day Jul 7 · 1\.0k kg/i,
    )).toBeInTheDocument()
    expect(screen.getByRole('img', {
      name: /Highest day: Jul 7, 1\.0k kg\./i,
    })).toBeInTheDocument()
    expect(screen.getByTitle('Jul 7: 1.0k kg')).toBeInTheDocument()
    expect(screen.queryByText(/najmocniejszy day 2026-/i)).not.toBeInTheDocument()

    const dayPicker = screen.getByRole('combobox', { name: 'View calendar day' })
    expect(dayPicker).toHaveClass('progress-heatmap-picker')
    expect(screen.getByLabelText('Calendar months')).not.toBeEmptyDOMElement()

    fireEvent.change(dayPicker, { target: { value: '2026-07-07' } })
    expect(screen.getByRole('status')).toHaveTextContent('Jul 7 · 1.0k kg')
  })

  it('uses singular and plural forms in the muscle balance accessible summary', async () => {
    mockLoadProgressData.mockResolvedValue(successfulLoad({
      sessions: [
        session('chest', 2, { muscleGroups: ['chest'] }),
        session('back', 1, { muscleGroups: ['back'] }),
      ],
    }))

    render(<ProgressPage />)

    expect(await screen.findByRole('img', {
      name: 'Muscle group balance. Most trained group: Chest, 1 entry. Total 2 entries in this view.',
    })).toBeInTheDocument()
    expect(screen.getByText('Muscle group')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Muscle groups' })).toBeInTheDocument()
  })
})
