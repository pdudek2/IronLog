import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Children, isValidElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { loadProgressData, type ProgressLoadResult } from '../../lib/progressLoadService'
import { formatCountChange, summarizeAllExercises, type ProgressSessionLite, type RecordSummary } from '../../lib/progressService'
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

vi.mock('react-router-dom', () => ({
  Link: ({ to, children, ...props }: { to: string; children?: ReactNode } & Record<string, unknown>) => (
    <a href={to} {...props}>{children}</a>
  ),
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
  AreaChart: ({ children }: { children?: ReactNode }) => <div data-testid="area-chart">{children}</div>,
  BarChart: () => <div data-testid="bar-chart" />,
  Area: ({ dataKey, name }: { dataKey?: string; name?: string }) => (
    <span data-testid="strength-line" data-data-key={dataKey} data-name={name} />
  ),
  Bar: () => null,
  ReferenceLine: () => null,
  CartesianGrid: () => null,
  Cell: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}))

const NOW = Date.UTC(2026, 6, 10, 12)
const DAY_MS = 86_400_000
const mockLoadProgressData = vi.mocked(loadProgressData)
const heroText = () => document.querySelector('.progress-hero')?.textContent ?? ''
const workoutCount = () => document.querySelector('.progress-hero-count')?.textContent

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
    expect(workoutCount()).toBe('2')

    fireEvent.click(screen.getByRole('button', { name: '30 days' }))

    expect(screen.getByTestId('progress-page')).toBe(initialPage)
    expect(initialPage).toHaveAttribute('aria-busy', 'false')
    expect(workoutCount()).toBe('1')
    expect(mockLoadProgressData).toHaveBeenCalledTimes(1)
  })

  it.each([true, false])('shows the weekly average and workouts, with their change only after enough history: %s', async (hasPreviousPeriod) => {
    const sessions = Array.from({ length: hasPreviousPeriod ? 26 : 12 }, (_, index) => session(`week-${index}`, 1 + 7 * index, {
      totalVolume: index < 13 ? 12_000 : 10_000,
    }))
    mockLoadProgressData.mockResolvedValue(successfulLoad({ sessions }))
    render(<ProgressPage />)

    await screen.findByRole('region', { name: 'All exercises' })
    const expected = summarizeAllExercises(sessions, 90, NOW)
    expect(expected.averageVolume).not.toBeNull()
    expect(heroText()).toContain('average of full weeks')
    expect(heroText()).toContain('kg / week')
    expect(workoutCount()).toBe(String(expected.workouts))

    if (hasPreviousPeriod) {
      expect(expected.averageDelta).toBeGreaterThan(0)
      expect(heroText()).toMatch(/\+\d+% vs previous 90 days/)
      expect(heroText()).toContain(`Workouts${expected.workouts}${formatCountChange(expected.workouts - expected.previousWorkouts)}`)
    } else {
      expect(expected.averageDelta).toBeNull()
      expect(heroText()).not.toContain('vs previous')
    }
  })

  it('presents the weekly volume, best sets and strength in lbs while retaining kg chart data', async () => {
    useProfileStore.getState().setProfile('user-1', {
      displayName: 'Tester', weeklyGoal: 3, primaryGoal: 'strength', units: 'lbs', createdAt: 1,
    })
    mockLoadProgressData.mockResolvedValue(successfulLoad({
      sessions: [
        session('one', 3, { totalVolume: 520, bestSetWeight: 65, bestSetReps: 5 }),
        session('two', 2, { totalVolume: 520, bestSetWeight: 65, bestSetReps: 5 }),
        session('three', 1, { totalVolume: 520, bestSetWeight: 65, bestSetReps: 5 }),
      ],
    }))

    render(<ProgressPage />)

    await screen.findByRole('region', { name: 'All exercises' })
    // No full week yet, so the headline counts this week: 1,560 kg is 3,439 lbs.
    expect(heroText()).toContain('this week so far')
    expect(heroText()).toContain('3,440lbs')
    const row = screen.getByRole('button', { name: /Wyciskanie sztangi/ })
    expect(row).toHaveTextContent('143.3 × 5')
    expect(screen.getByRole('img', { name: /Weekly volume/ })).toHaveAccessibleName(/This week so far 3,439 lbs/)
    expect(screen.getByRole('img', { name: /Weight progression/ })).toHaveAccessibleName(/143.3 lbs/)
  })

  it('loads annual data older than 180 days and compares the previous year after a range switch', async () => {
    const annual = deferred<ProgressLoadResult>()
    mockLoadProgressData
      .mockResolvedValueOnce(successfulLoad({ sessions: [session('recent', 10)], records: [record('record-1')] }))
      .mockReturnValueOnce(annual.promise)
    render(<ProgressPage />)
    await screen.findByRole('region', { name: 'All exercises' })
    expect(mockLoadProgressData).toHaveBeenLastCalledWith('user-1', 90)

    fireEvent.click(screen.getByRole('button', { name: 'Year' }))
    expect(mockLoadProgressData).toHaveBeenLastCalledWith('user-1', 365)
    expect(screen.getByTestId('progress-page')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('Loading progress')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'All exercises' })).not.toBeInTheDocument()

    await act(async () => annual.resolve(successfulLoad({
      sessions: [session('recent', 10), session('old-current-year', 200), session('previous-year', 400)],
      records: [record('record-1')],
    })))
    expect(workoutCount()).toBe('2')
    expect(screen.getByText('best set · vs previous year')).toBeInTheDocument()
    expect(screen.getByTestId('progress-page')).toHaveAttribute('aria-busy', 'false')
    fireEvent.click(screen.getByRole('button', { name: '90 days' }))
    expect(workoutCount()).toBe('1')
    expect(mockLoadProgressData).toHaveBeenCalledTimes(2)
  })

  it('does not promote a shorter snapshot after annual sessions fail and retries the selected range', async () => {
    const annual = deferred<ProgressLoadResult>()
    mockLoadProgressData
      .mockResolvedValueOnce(successfulLoad({ sessions: [session('recent', 10)], records: [record('record-1')] }))
      .mockReturnValueOnce(annual.promise)
    render(<ProgressPage />)
    await screen.findByRole('region', { name: 'All exercises' })
    fireEvent.click(screen.getByRole('button', { name: 'Year' }))

    await act(async () => annual.resolve({
      ...successfulLoad({ records: [record('record-2')] }),
      sessions: { status: 'error', error: new Error('annual sessions unavailable') },
    }))
    expect(screen.queryByRole('region', { name: 'All exercises' })).not.toBeInTheDocument()
    expect(screen.queryByText('No data', { exact: true })).not.toBeInTheDocument()
    expect(screen.getByText('Could not refresh workout data.')).toBeInTheDocument()

    mockLoadProgressData.mockResolvedValueOnce(successfulLoad({ sessions: [session('older', 200)] }))
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByRole('region', { name: 'All exercises' })
    expect(mockLoadProgressData).toHaveBeenLastCalledWith('user-1', 365)
  })

  it('discards the previous account snapshot and its in-flight range result', async () => {
    const annual = deferred<ProgressLoadResult>()
    const nextAccount = deferred<ProgressLoadResult>()
    mockLoadProgressData
      .mockResolvedValueOnce(successfulLoad({ sessions: [session('recent', 10, { exerciseName: 'Account A record' })], records: [record('record-1')] }))
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
    expect(screen.queryByRole('region', { name: 'All exercises' })).not.toBeInTheDocument()
    await act(async () => nextAccount.resolve(successfulLoad()))
    expect(screen.getByText('No data', { exact: true })).toBeInTheDocument()
    expect(screen.queryByText('Wyciskanie sztangi')).not.toBeInTheDocument()
  })

  it('keeps analytics without a notice when only records fail, and asks for a retry when nothing else is known', async () => {
    const recordsError = new Error('records unavailable')
    mockLoadProgressData.mockResolvedValue({
      ...successfulLoad({ sessions: [session('recent', 2)] }),
      records: { status: 'error', error: recordsError },
    })

    const view = render(<ProgressPage />)

    expect(await screen.findByRole('region', { name: 'All exercises' })).toBeInTheDocument()
    expect(screen.queryByText('Could not refresh workout data.')).not.toBeInTheDocument()
    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalledWith('[ProgressPage] records load failed', recordsError)

    // Without sessions the records decide between "No data" and an empty range, so the failure shows.
    view.unmount()
    mockLoadProgressData.mockResolvedValue({ ...successfulLoad(), records: { status: 'error', error: recordsError } })
    render(<ProgressPage />)
    expect(await screen.findByText('Could not refresh workout data.')).toBeInTheDocument()
    expect(screen.queryByText('No data', { exact: true })).not.toBeInTheDocument()
  })

  it('shows a sessions-unavailable notice without analytics when sessions fail', async () => {
    const sessionsError = new Error('sessions unavailable')
    mockLoadProgressData.mockResolvedValue({
      ...successfulLoad({ records: [record('record-1')] }),
      sessions: { status: 'error', error: sessionsError },
    })

    render(<ProgressPage />)

    expect((await screen.findByText('Could not refresh workout data.')).closest('[role="status"]')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'All exercises' })).not.toBeInTheDocument()
    expect(screen.queryByText('No data', { exact: true })).not.toBeInTheDocument()
    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalledWith('[ProgressPage] sessions load failed', sessionsError)
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

  it('replaces empty-range analytics with one longer-range action', async () => {
    mockLoadProgressData.mockResolvedValue(successfulLoad({
      sessions: [session('older', 60)],
      records: [record('record-1')],
    }))

    render(<ProgressPage />)

    expect(await screen.findByRole('region', { name: 'All exercises' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '30 days' }))

    const emptyStatus = screen.getByRole('status')
    expect(emptyStatus).toHaveTextContent('No workouts in this date range')
    expect(screen.queryByText('0 sessions in range')).not.toBeInTheDocument()
    fireEvent.click(within(emptyStatus).getByRole('button', { name: 'Show year' }))

    expect(screen.getByRole('button', { name: 'Year' })).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByRole('region', { name: 'All exercises' })).toBeInTheDocument()
    expect(mockLoadProgressData).toHaveBeenCalledTimes(2)
    expect(mockLoadProgressData).toHaveBeenLastCalledWith('user-1', 365)
  })

  it('treats saved records without recent sessions as an empty range, not as no data', async () => {
    mockLoadProgressData.mockResolvedValue(successfulLoad({ records: [record('record-1')] }))

    render(<ProgressPage />)

    expect((await screen.findByText('No workouts in this date range')).closest('[role="status"]')).toBeInTheDocument()
    expect(screen.queryByText('No data', { exact: true })).not.toBeInTheDocument()
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
    expect(notice).not.toHaveTextContent('record')
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
    expect(notice).not.toHaveTextContent('record')
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
    expect(screen.getByRole('region', { name: 'All exercises' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refreshing…' })).toBeDisabled()

    await act(async () => {
      pendingRetry.resolve({
        ...successfulLoad({ records: [record('squat-record')] }),
        sessions: { status: 'error', error: sessionsError },
      })
    })

    await waitFor(() => expect(page).toHaveAttribute('aria-busy', 'false'))
    expect(screen.getByRole('region', { name: 'All exercises' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Wyciskanie sztangi/ })).toBeInTheDocument()
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
          records: [record('record-2')],
          fetchedAt: NOW + 30 * DAY_MS,
        }),
        sessions: { status: 'error', error: sessionsError },
      })

    render(<ProgressPage />)

    expect(await screen.findByRole('img', { name: /Weekly volume/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    const page = screen.getByTestId('progress-page')
    await waitFor(() => expect(page).toHaveAttribute('aria-busy', 'false'))
    expect(mockLoadProgressData).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('img', { name: /Weekly volume/ })).toBeInTheDocument()
    expect(workoutCount()).toBe('1')
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
    expect(screen.getByText(/^\+10 kg since /)).toBeInTheDocument()

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

    expect(screen.getByText('Chart needs 2 more days with recorded weight.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '30 days' }))
    expect(selector).toHaveValue('global:bench')
  })

  it('counts sets per muscle as whole numbers for this week until a full week exists', async () => {
    mockLoadProgressData.mockResolvedValue(successfulLoad({
      sessions: [
        session('chest', 2, { exerciseSource: 'user', muscleGroups: ['chest', 'triceps'], totalSets: 3 }),
        session('back', 1, { exerciseSource: 'user', exerciseId: 'row', muscleGroups: ['back'], totalSets: 4 }),
      ],
    }))

    render(<ProgressPage />)

    const block = (await screen.findByRole('heading', { name: 'Sets per muscle group' })).closest('section')!
    expect(within(block).getByText('this week')).toBeInTheDocument()
    const rows = Array.from(block.querySelectorAll('.progress-muscle-row'), (row) => row.textContent)
    expect(rows).toEqual(['Back4', 'Chest3', 'Triceps2'])
    expect(within(block).getByText('Assisting muscles count half.')).toBeInTheDocument()
  })

  it('lists each exercise best set and charts a weighted one from its row', async () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    mockLoadProgressData.mockResolvedValue(successfulLoad({
      sessions: [
        session('bench-old', 100, { bestSetWeight: 75, bestSetReps: 5 }),
        session('bench-1', 3, { bestSetWeight: 80, bestSetReps: 5 }),
        session('bench-2', 2, { bestSetWeight: 80, bestSetReps: 5 }),
        session('bench-3', 1, { bestSetWeight: 80, bestSetReps: 5 }),
        session('row-1', 1, { exerciseId: 'row', exerciseName: 'Wiosłowanie', bestSetWeight: 50, bestSetReps: 8 }),
        session('dip-old', 95, { exerciseSource: 'user', exerciseId: 'dip', exerciseName: 'Dipy', bestSetWeight: 0, bestSetReps: 10 }),
        session('dip-1', 1, { exerciseSource: 'user', exerciseId: 'dip', exerciseName: 'Dipy', bestSetWeight: 0, bestSetReps: 10 }),
      ],
    }))

    render(<ProgressPage />)

    expect(await screen.findByRole('button', { name: /Wyciskanie sztangi/ })).toHaveTextContent('80 × 5+5 kg')
    const bodyweight = screen.getByText('Dipy').closest('.progress-exercise-row')!
    expect(bodyweight.tagName).toBe('DIV')
    expect(bodyweight).toHaveTextContent('10 repssame')
    expect(screen.getByText('best set · vs previous 90 days')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Wiosłowanie/ }))
    expect(screen.getByRole('combobox', { name: 'Chart exercise' })).toHaveValue('global:row')
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    delete (Element.prototype as Partial<Element>).scrollIntoView
  })
})
