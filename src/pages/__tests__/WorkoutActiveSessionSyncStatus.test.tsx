import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ActiveSessionSyncStatus } from '../../components/workout/ActiveSessionSyncStatus'

describe('ActiveSessionSyncStatus', () => {
  it('keeps a persistent Polish warning with a viable retry action after autosave failure', () => {
    const onRetry = vi.fn()
    render(<ActiveSessionSyncStatus status="failed" onRetry={onRetry} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Nie udało się zsynchronizować aktywnej sesji.')
    expect(screen.getByRole('alert')).toHaveTextContent('Dane są zachowane na tym urządzeniu.')
    fireEvent.click(screen.getByRole('button', { name: 'Ponów synchronizację' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('shows retry progress and stays hidden while synchronization is healthy', () => {
    const { rerender } = render(<ActiveSessionSyncStatus status="retrying" onRetry={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Synchronizuję…' })).toBeDisabled()

    rerender(<ActiveSessionSyncStatus status="idle" onRetry={vi.fn()} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
