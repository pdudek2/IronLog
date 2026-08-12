import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Children, isValidElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { loadProgressData, type ProgressLoadResult } from '../../lib/progressLoadService'
import type { ProgressSessionLite, RecordSummary } from '../../lib/progressService'
import ProgressPage, { DarkTooltip } from '../ProgressPage'

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
    dateNow = vi.spyOn(Date, 'now').mockReturnValue(NOW)
    mockLoadProgressData.mockReset()
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
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
    expect(screen.getByRole('status')).toHaveTextContent('Ładowanie postępów')

    await act(async () => {
      pending.resolve(successfulLoad({
        sessions: [session('recent', 10), session('older', 60)],
        records: [record('record-1')],
      }))
    })

    await waitFor(() => expect(initialPage).toHaveAttribute('aria-busy', 'false'))
    expect(screen.getByText(/2 sesje ·/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '30 dni' }))

    expect(screen.getByTestId('progress-page')).toBe(initialPage)
    expect(initialPage).toHaveAttribute('aria-busy', 'false')
    expect(screen.getByText(/1 sesja ·/)).toBeInTheDocument()
    expect(mockLoadProgressData).toHaveBeenCalledTimes(1)
  })

  it('renders charts data and a records-unavailable notice when records fail', async () => {
    const recordsError = new Error('records unavailable')
    mockLoadProgressData.mockResolvedValue({
      ...successfulLoad({ sessions: [session('recent', 2)] }),
      records: { status: 'error', error: recordsError },
    })

    render(<ProgressPage />)

    expect(await screen.findByRole('heading', { name: 'Wolumen tygodniowy' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Nie udało się odświeżyć rekordów od początku.')
    const recordsMetric = screen.getByText('Rekordy').parentElement
    expect(recordsMetric).not.toBeNull()
    expect(within(recordsMetric!).getByText('—')).toBeInTheDocument()
    expect(screen.queryByText('Nie udało się pobrać danych')).not.toBeInTheDocument()
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

    expect(await screen.findByRole('heading', { name: 'Rekordy od początku' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Nie udało się odświeżyć danych treningowych.')
    expect(screen.queryByRole('heading', { name: 'Wolumen tygodniowy' })).not.toBeInTheDocument()
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

    const featured = await screen.findByLabelText('Najlepszy rekord')
    const ledger = screen.getByLabelText('Pozostałe rekordy')
    expect(featured.querySelectorAll('.progress-record-feature')).toHaveLength(1)
    expect(ledger.querySelectorAll('.progress-record-ledger-row')).toHaveLength(2)
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
    expect(alert).toHaveTextContent('Nie udało się pobrać danych')
    expect(within(alert).getByRole('button', { name: 'Spróbuj ponownie' })).toBeInTheDocument()
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

    expect(await screen.findByRole('heading', { name: 'Rekordy od początku' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '30 dni' }))

    const emptyStatus = screen.getByRole('status')
    expect(emptyStatus).toHaveTextContent('W tym zakresie nie ma treningów')
    expect(screen.queryByText('0 sesji w zakresie')).not.toBeInTheDocument()
    fireEvent.click(within(emptyStatus).getByRole('button', { name: 'Pokaż rok' }))

    expect(screen.getByRole('button', { name: 'Rok' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: 'Wolumen tygodniowy' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Rekordy od początku' })).toBeInTheDocument()
    expect(mockLoadProgressData).toHaveBeenCalledTimes(1)
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
      const settledNotice = screen.getByRole('status')
      expect(settledNotice).toHaveTextContent('Ostatnie treningi mogą być jeszcze niewidoczne.')
      return settledNotice
    })
    expect(notice).toHaveTextContent('Analizy treningowe obejmują najnowsze 5000 wpisów.')
    expect(notice).toHaveTextContent('Lista rekordów jest ograniczona do 1000 wpisów.')
    expect(screen.getAllByRole('button', { name: 'Spróbuj ponownie' })).toHaveLength(1)
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

    const retryButton = await screen.findByRole('button', { name: 'Spróbuj ponownie' })
    const page = screen.getByTestId('progress-page')
    fireEvent.click(retryButton)

    expect(screen.getByTestId('progress-page')).toBe(page)
    expect(page).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('heading', { name: 'Wolumen tygodniowy' })).toBeInTheDocument()
    const recordsSection = screen.getByRole('heading', { name: 'Rekordy od początku' }).closest('section')
    expect(recordsSection).not.toBeNull()
    expect(within(recordsSection!).getByText('Wyciskanie sztangi')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Odświeżanie…' })).toBeDisabled()

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
    expect(screen.getByRole('heading', { name: 'Wolumen tygodniowy' })).toBeInTheDocument()
    const refreshedRecordsSection = screen.getByRole('heading', { name: 'Rekordy od początku' }).closest('section')
    expect(refreshedRecordsSection).not.toBeNull()
    expect(within(refreshedRecordsSection!).getByText('Przysiad')).toBeInTheDocument()
    expect(within(refreshedRecordsSection!).queryByText('Wyciskanie sztangi')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Nie udało się odświeżyć danych treningowych.')
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

    expect(await screen.findByRole('img', { name: /Wolumen treningowy/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))

    const page = screen.getByTestId('progress-page')
    await waitFor(() => expect(page).toHaveAttribute('aria-busy', 'false'))
    expect(mockLoadProgressData).toHaveBeenCalledTimes(2)
    const recordsSection = screen.getByRole('heading', { name: 'Rekordy od początku' }).closest('section')
    expect(recordsSection).not.toBeNull()
    expect(within(recordsSection!).getByText('Martwy ciąg po odświeżeniu')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Wolumen treningowy/ })).toBeInTheDocument()
    expect(screen.getByText(/1 sesja ·/)).toBeInTheDocument()
    expect(screen.queryByText('Brak treningów w wybranym zakresie.')).not.toBeInTheDocument()
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

  it('uses source-aware strength keys and exposes a visible heatmap summary', async () => {
    mockLoadProgressData.mockResolvedValue(successfulLoad({
      sessions: [
        session('global-1', 3),
        session('user-1', 2, { exerciseSource: 'user' }),
        session('global-2', 1),
      ],
    }))

    render(<ProgressPage />)

    const lines = await screen.findAllByTestId('strength-line')
    expect(lines.map((line) => line.getAttribute('data-data-key'))).toEqual([
      'global:bench',
      'user:bench',
    ])
    expect(await screen.findByText(
      /3 aktywne dni · najmocniejszy dzień 7 lip · 1\.0k kg/i,
    )).toBeInTheDocument()
    expect(screen.getByRole('img', {
      name: /Największy dzień: 7 lip, 1\.0k kg\./i,
    })).toBeInTheDocument()
    expect(screen.queryByText(/najmocniejszy dzień 2026-/i)).not.toBeInTheDocument()
  })

  it('uses singular and paucal forms in the muscle balance accessible summary', async () => {
    mockLoadProgressData.mockResolvedValue(successfulLoad({
      sessions: [
        session('chest', 2, { muscleGroups: ['chest'] }),
        session('back', 1, { muscleGroups: ['back'] }),
      ],
    }))

    render(<ProgressPage />)

    expect(await screen.findByRole('img', {
      name: 'Balans partii mięśniowych. Najczęściej trenowana partia: Klatka, 1 wpis. Łącznie 2 wpisy w zestawieniu.',
    })).toBeInTheDocument()
  })
})
