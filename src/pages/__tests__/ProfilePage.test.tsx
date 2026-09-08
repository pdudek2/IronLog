import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ProfilePage from '../ProfilePage'

const mocks = vi.hoisted(() => ({
  profile: {
    displayName: 'Jan',
    weeklyGoal: 4,
    primaryGoal: 'hypertrophy' as const,
    units: 'kg' as const,
    createdAt: 1,
  },
  setProfile: vi.fn(),
  updateProfile: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({ user: { uid: 'user-1' } }),
}))

vi.mock('../../store/profileStore', () => ({
  useProfileStore: () => ({
    profile: mocks.profile,
    setProfile: mocks.setProfile,
  }),
}))

vi.mock('../../lib/userProfile', () => ({
  updateProfile: mocks.updateProfile,
}))

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}))

beforeEach(() => {
  mocks.setProfile.mockReset()
  mocks.updateProfile.mockReset().mockResolvedValue(undefined)
  mocks.toastSuccess.mockReset()
  mocks.toastError.mockReset()
})

describe('ProfilePage hierarchy and settings', () => {
  it('renders one concise settings hierarchy without duplicated account copy', () => {
    render(<ProfilePage />)

    expect(screen.getByRole('heading', { name: 'Profile' })).toBeInTheDocument()
    expect(screen.queryByText('Settings · konto')).not.toBeInTheDocument()
    expect(screen.queryByText('Twój profile')).not.toBeInTheDocument()

    const goalGroup = screen.getByRole('group', { name: 'Primary goal' })
    expect(within(goalGroup).getAllByRole('button')).toHaveLength(4)
    expect(within(goalGroup).getByRole('button', { name: 'Muscle growth' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('Volume and progression')).not.toBeInTheDocument()
    expect(screen.queryByText('Calorie deficit and cardio')).not.toBeInTheDocument()

    expect(screen.getByRole('slider', { name: 'Workouts per week' })).toHaveAttribute('aria-valuetext', '4 workouts')
    expect(screen.getByText('4 workouts')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Units' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Save changes' })).toHaveLength(1)

    expect(screen.queryByText('Akceptuję analitykę')).not.toBeInTheDocument()
    expect(screen.queryByText('Tylko niezbędne')).not.toBeInTheDocument()
    expect(screen.queryByText(/GA4|Contentsquare|Hotjar/i)).not.toBeInTheDocument()
  })

  it('saves the selected settings and leaves success feedback to the toast', async () => {
    render(<ProfilePage />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: '  Anna  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Strength' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Workouts per week' }), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'lbs' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(mocks.updateProfile).toHaveBeenCalledWith('user-1', {
        displayName: 'Anna',
        primaryGoal: 'strength',
        weeklyGoal: 5,
        units: 'lbs',
      })
    })
    expect(mocks.setProfile).toHaveBeenCalledWith('user-1', {
      ...mocks.profile,
      displayName: 'Anna',
      primaryGoal: 'strength',
      weeklyGoal: 5,
      units: 'lbs',
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Profile saved')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
    expect(screen.queryByText(/Zapisano/)).not.toBeInTheDocument()
  })

  it('keeps validation and save failures explicit', async () => {
    render(<ProfilePage />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Enter your name')
    expect(mocks.updateProfile).not.toHaveBeenCalled()

    mocks.updateProfile.mockRejectedValueOnce(new Error('offline'))
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Jan' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith('Could not save. Try again.')
    })
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
  })
})
