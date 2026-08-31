import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OnboardingPage from '../OnboardingPage'

const mocks = vi.hoisted(() => ({
  saveProfile: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({ user: { uid: 'user-1' } }),
}))

vi.mock('../../store/profileStore', () => ({
  useProfileStore: () => ({ setProfile: vi.fn() }),
}))

vi.mock('../../lib/userProfile', () => ({
  saveProfile: mocks.saveProfile,
}))

vi.mock('sonner', () => ({
  toast: { error: mocks.toastError },
}))

describe('OnboardingPage hierarchy', () => {
  beforeEach(() => {
    mocks.saveProfile.mockReset()
    mocks.toastError.mockReset()
  })

  it('groups profile choices and names the save action explicitly', () => {
    render(
      <MemoryRouter>
        <OnboardingPage />
      </MemoryRouter>,
    )

    const goalGroup = screen.getByRole('group', { name: 'Cel treningowy' })
    expect(within(goalGroup).getByRole('button', { name: /Masa mięśniowa/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('group', { name: 'Jednostki' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Treningi w tygodniu' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Zapisz profil' })).toBeInTheDocument()
  })

  it('validates the name and keeps the form usable after a failed save', async () => {
    mocks.saveProfile.mockRejectedValue(new Error('offline'))
    render(
      <MemoryRouter>
        <OnboardingPage />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Zapisz profil' }))
    expect(await screen.findByText('Podaj imię')).toBeInTheDocument()
    expect(mocks.saveProfile).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Imię'), { target: { value: ' Patryk ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz profil' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Nie udało się zapisać profilu')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Zapisz profil' })).toBeEnabled())
    expect(mocks.saveProfile).toHaveBeenCalledWith('user-1', expect.objectContaining({ displayName: 'Patryk' }))
    expect(mocks.toastError).toHaveBeenCalledTimes(1)
  })
})
