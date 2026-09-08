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

    const goalGroup = screen.getByRole('group', { name: 'Training goal' })
    expect(within(goalGroup).getByRole('button', { name: /Muscle growth/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('group', { name: 'Units' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Workouts per week' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeInTheDocument()
  })

  it('validates the name and keeps the form usable after a failed save', async () => {
    mocks.saveProfile.mockRejectedValue(new Error('offline'))
    render(
      <MemoryRouter>
        <OnboardingPage />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))
    expect(await screen.findByText('Enter your name')).toBeInTheDocument()
    expect(mocks.saveProfile).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' Patryk ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save your profile')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save profile' })).toBeEnabled())
    expect(mocks.saveProfile).toHaveBeenCalledWith('user-1', expect.objectContaining({ displayName: 'Patryk' }))
    expect(mocks.toastError).toHaveBeenCalledTimes(1)
  })
})
