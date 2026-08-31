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

    expect(screen.getByRole('heading', { name: 'Profil' })).toBeInTheDocument()
    expect(screen.queryByText('Ustawienia · konto')).not.toBeInTheDocument()
    expect(screen.queryByText('Twój profil')).not.toBeInTheDocument()

    const goalGroup = screen.getByRole('group', { name: 'Główny cel' })
    expect(within(goalGroup).getAllByRole('button')).toHaveLength(4)
    expect(within(goalGroup).getByRole('button', { name: 'Masa mięśniowa' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('Objętość i progresja')).not.toBeInTheDocument()
    expect(screen.queryByText('Deficyt kaloryczny i cardio')).not.toBeInTheDocument()

    expect(screen.getByRole('slider', { name: 'Treningi w tygodniu' })).toHaveAttribute('aria-valuetext', '4 treningi')
    expect(screen.getByText('4 treningi')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Jednostki' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Zapisz zmiany' })).toHaveLength(1)

    expect(screen.queryByText('Akceptuję analitykę')).not.toBeInTheDocument()
    expect(screen.queryByText('Tylko niezbędne')).not.toBeInTheDocument()
    expect(screen.queryByText(/GA4|Contentsquare|Hotjar/i)).not.toBeInTheDocument()
  })

  it('saves the selected settings and leaves success feedback to the toast', async () => {
    render(<ProfilePage />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Imię' }), { target: { value: '  Anna  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Siła' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Treningi w tygodniu' }), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'lbs' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz zmiany' }))

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
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Profil zapisany')
    expect(screen.getByRole('button', { name: 'Zapisz zmiany' })).toBeEnabled()
    expect(screen.queryByText(/Zapisano/)).not.toBeInTheDocument()
  })

  it('keeps validation and save failures explicit', async () => {
    render(<ProfilePage />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Imię' }), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz zmiany' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Podaj imię')
    expect(mocks.updateProfile).not.toHaveBeenCalled()

    mocks.updateProfile.mockRejectedValueOnce(new Error('offline'))
    fireEvent.change(screen.getByRole('textbox', { name: 'Imię' }), { target: { value: 'Jan' } })
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz zmiany' }))

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith('Nie udało się zapisać. Spróbuj ponownie.')
    })
    expect(screen.getByRole('button', { name: 'Zapisz zmiany' })).toBeEnabled()
  })
})
