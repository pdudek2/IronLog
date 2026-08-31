import { createElement, type ReactNode } from 'react'
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

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_target, tag: string | symbol) => {
      if (typeof tag !== 'string') return undefined
      return ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => {
        delete props.initial
        delete props.animate
        delete props.transition
        delete props.whileTap
        return createElement(tag, props, children)
      }
    },
  }),
}))

describe('ReadinessPrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses native disclosure and saves the selected values', async () => {
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

    const summary = screen.getByText('Dopasuj dzisiejszy trening')
    const details = summary.closest('details')
    expect(details).not.toHaveAttribute('open')
    fireEvent.click(summary)
    expect(details).toHaveAttribute('open')

    fireEvent.change(screen.getByRole('slider', { name: 'Gotowość: Sen' }), {
      target: { value: '4' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz wynik' }))

    await waitFor(() => expect(mocks.onSaved).toHaveBeenCalledWith(entry))
    expect(mocks.saveReadiness).toHaveBeenCalledWith('user-1', {
      sleep: 4,
      mood: 3,
      soreness: 3,
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Gotowość zapisana')
  })

  it('restores the save action after a failed request', async () => {
    mocks.saveReadiness.mockRejectedValue(new Error('offline'))
    render(<ReadinessPrompt onSaved={mocks.onSaved} />)

    fireEvent.click(screen.getByRole('button', { name: 'Zapisz wynik' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Zapisz wynik' })).toBeEnabled())
    expect(mocks.onSaved).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledWith('Nie udało się zapisać gotowości.')
  })
})
