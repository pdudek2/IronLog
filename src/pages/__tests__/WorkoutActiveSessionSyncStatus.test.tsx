import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ActiveSessionSyncStatus } from '../../components/workout/ActiveSessionSyncStatus'

describe('ActiveSessionSyncStatus', () => {
  it('keeps a persistent Polish warning with a viable retry action after autosave failure', () => {
    const onRetry = vi.fn()
    render(<ActiveSessionSyncStatus status="failed" onRetry={onRetry} onReload={vi.fn()} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Nie udało się zsynchronizować aktywnej sesji.')
    expect(screen.getByRole('alert')).toHaveTextContent('Dane są zachowane na tym urządzeniu.')
    fireEvent.click(screen.getByRole('button', { name: 'Ponów synchronizację' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('offers only an explicit reload when another client committed a newer revision', () => {
    const onReload = vi.fn()
    render(
      <ActiveSessionSyncStatus
        status="conflict"
        onRetry={vi.fn()}
        onReload={onReload}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Sesja zmieniła się na innym urządzeniu.')
    expect(screen.getByRole('alert')).toHaveTextContent('Wczytanie jej zastąpi niezapisane zmiany')
    expect(screen.queryByRole('button', { name: 'Ponów synchronizację' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Wczytaj nowszą wersję' }))
    expect(onReload).toHaveBeenCalledOnce()
  })

  it('shows retry progress and stays hidden while synchronization is healthy', () => {
    const { rerender } = render(
      <ActiveSessionSyncStatus status="retrying" onRetry={vi.fn()} onReload={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: 'Synchronizuję…' })).toBeDisabled()

    rerender(<ActiveSessionSyncStatus status="idle" onRetry={vi.fn()} onReload={vi.fn()} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
