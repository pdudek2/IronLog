import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReadinessPrompt from '../ReadinessPrompt'

const mocks = vi.hoisted(() => ({
  saveReadiness: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  onSaved: vi.fn(),
}))

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({ user: { uid: 'user-1' } }),
}))

vi.mock('../../lib/readinessService', () => ({
  saveReadiness: mocks.saveReadiness,
}))

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}))

describe('ReadinessPrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses native disclosure and saves each tap for today', async () => {
    const entry = {
      userId: 'user-1',
      date: '2026-08-31',
      sleep: 4,
      mood: 3,
      soreness: 3,
      createdAt: 1,
    }
    mocks.saveReadiness.mockResolvedValue(entry)
    render(<ReadinessPrompt onSaved={mocks.onSaved} />)

    const summary = screen.getByText('Check in')
    const details = summary.closest('details')
    expect(details).not.toHaveAttribute('open')
    fireEvent.click(summary)
    expect(details).toHaveAttribute('open')

    // Soreness runs the other way from sleep and mood, so each step names its meaning.
    expect(screen.getByRole('group', { name: /Soreness/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Soreness 5 of 5, Severe' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Soreness 3 of 5, Some' })).toBeChecked()

    fireEvent.click(screen.getByRole('radio', { name: 'Sleep 4 of 5, Good' }))

    await waitFor(() => expect(mocks.onSaved).toHaveBeenCalledWith(entry))
    expect(mocks.saveReadiness).toHaveBeenCalledWith('user-1', {
      sleep: 4,
      mood: 3,
      soreness: 3,
    })
  })

  it('opens today’s saved check-in for a change with its values', () => {
    render(<ReadinessPrompt entry={{ userId: 'user-1', date: '2026-08-31', sleep: 2, mood: 4, soreness: 5, createdAt: 1 }} onSaved={mocks.onSaved} />)

    expect(screen.getByText('Sleep 2 · Mood 4 · Soreness 5')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Change'))
    expect(screen.getByRole('radio', { name: 'Sleep 2 of 5, Restless' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Soreness 5 of 5, Severe' })).toBeChecked()
  })

  it('reports a failed save and keeps the choice to try again', async () => {
    mocks.saveReadiness.mockRejectedValue(new Error('offline'))
    render(<ReadinessPrompt onSaved={mocks.onSaved} />)

    fireEvent.click(screen.getByRole('radio', { name: 'Mood 2 of 5, Low', hidden: true }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled())
    expect(mocks.onSaved).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledWith('Could not save the check-in.')
  })
})
