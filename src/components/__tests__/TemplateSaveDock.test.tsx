import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TemplateSaveDock from '../TemplateSaveDock'

describe('TemplateSaveDock', () => {
  it('keeps a pristine draft quiet and disables the plan save action', () => {
    render(
      <TemplateSaveDock
        state="new-pristine"
        canSubmit={false}
      />,
    )

    expect(screen.getByTestId('template-save-dock')).toHaveAttribute('data-state', 'new-pristine')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save plan' })).toBeDisabled()
  })

  it('enables the save-plan action for a valid dirty draft', () => {
    const view = render(
      <TemplateSaveDock state="dirty" canSubmit />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes')
    expect(screen.getByRole('button', { name: 'Save plan' })).toBeEnabled()

    view.rerender(<TemplateSaveDock state="dirty" canSubmit={false} />)
    expect(screen.getByRole('button', { name: 'Save plan' })).toBeDisabled()
  })

  it('disables duplicate submit while saving', () => {
    render(<TemplateSaveDock state="saving" canSubmit />)

    expect(screen.getByRole('status')).toHaveTextContent('Saving')
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
  })

  it('keeps a failed save visible with retry and dismiss actions', () => {
    const onRetry = vi.fn()
    const onDismissError = vi.fn()
    render(
      <TemplateSaveDock
        state="error"
        canSubmit
        errorMessage="Could not save the plan."
        onRetry={onRetry}
        onDismissError={onDismissError}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Could not save the plan.')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onRetry).toHaveBeenCalledOnce()
    expect(onDismissError).toHaveBeenCalledOnce()
  })

  it('removes the fixed dock for a loaded unchanged template', () => {
    render(<TemplateSaveDock state="persisted-clean" canSubmit />)

    expect(screen.queryByTestId('template-save-dock')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Zapisano' })).not.toBeInTheDocument()
  })
})
