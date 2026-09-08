import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TemplateSaveDock from '../TemplateSaveDock'

describe('TemplateSaveDock', () => {
  it('describes a pristine create draft as not saved and disables submit', () => {
    render(
      <TemplateSaveDock
        state="new-pristine"
        isEdit={false}
        canSubmit={false}
      />,
    )

    expect(screen.getByTestId('template-save-dock')).toHaveAttribute('data-state', 'new-pristine')
    expect(screen.getByRole('status')).toHaveTextContent('New plan · not saved yet')
    expect(screen.getByRole('button', { name: 'Save template' })).toBeDisabled()
  })

  it('enables the matching create or edit action for a valid dirty draft', () => {
    const view = render(
      <TemplateSaveDock state="dirty" isEdit={false} canSubmit />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes')
    expect(screen.getByRole('button', { name: 'Save template' })).toBeEnabled()

    view.rerender(<TemplateSaveDock state="dirty" isEdit canSubmit />)
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
  })

  it('disables duplicate submit while saving', () => {
    render(<TemplateSaveDock state="saving" isEdit canSubmit />)

    expect(screen.getByRole('status')).toHaveTextContent('Saving')
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
  })

  it('keeps a failed save visible with retry and dismiss actions', () => {
    const onRetry = vi.fn()
    const onDismissError = vi.fn()
    render(
      <TemplateSaveDock
        state="error"
        isEdit={false}
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
    render(<TemplateSaveDock state="persisted-clean" isEdit canSubmit />)

    expect(screen.queryByTestId('template-save-dock')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Zapisano' })).not.toBeInTheDocument()
  })
})
