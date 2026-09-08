import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ActiveSessionSyncStatus } from '../../components/workout/ActiveSessionSyncStatus'

describe('ActiveSessionSyncStatus', () => {
  it('keeps a persistent English warning with a viable retry action after autosave failure', () => {
    const onRetry = vi.fn()
    render(<ActiveSessionSyncStatus status="failed" onRetry={onRetry} onReload={vi.fn()} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Could not sync the active session.')
    expect(screen.getByRole('alert')).toHaveTextContent('Your data is saved on this device.')
    fireEvent.click(screen.getByRole('button', { name: 'Retry sync' }))
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

    expect(screen.getByRole('alert')).toHaveTextContent('The session changed on another device.')
    expect(screen.getByRole('alert')).toHaveTextContent('Loading it will replace unsaved changes')
    expect(screen.queryByRole('button', { name: 'Retry sync' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Load newer version' }))
    expect(onReload).toHaveBeenCalledOnce()
  })

  it('shows retry progress and stays hidden while synchronization is healthy', () => {
    const { rerender } = render(
      <ActiveSessionSyncStatus status="retrying" onRetry={vi.fn()} onReload={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: 'Syncing…' })).toBeDisabled()

    rerender(<ActiveSessionSyncStatus status="idle" onRetry={vi.fn()} onReload={vi.fn()} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
