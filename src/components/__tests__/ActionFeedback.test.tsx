import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ActionFeedback } from '../ActionFeedback'

describe('ActionFeedback', () => {
  it('announces pending feedback politely and hides its spinner from assistive technology', () => {
    render(<ActionFeedback status="pending" message="Starting…" />)

    expect(screen.getByRole('status')).toHaveTextContent('Starting…')
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByTestId('action-feedback-spinner')).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders an actionable error', () => {
    const retry = vi.fn()
    const dismiss = vi.fn()

    render(
      <ActionFeedback
        id="launch-error"
        status="error"
        message="Could not start the plan."
        onRetry={retry}
        onDismiss={dismiss}
      />,
    )

    expect(screen.getByRole('alert')).toHaveAttribute('id', 'launch-error')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(retry).toHaveBeenCalledTimes(1)
    expect(dismiss).toHaveBeenCalledTimes(1)
  })

  it('omits actions without their callbacks', () => {
    render(<ActionFeedback status="error" message="Coś poszło nie yes." />)

    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
  })
})
