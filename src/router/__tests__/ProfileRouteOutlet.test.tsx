import { act, fireEvent, render, screen } from '@testing-library/react'
import type { User } from 'firebase/auth'
import type { UserProfile } from '../../lib/userProfile'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useProfileStore } from '../../store/profileStore'
import { ProfileRouteOutlet } from '../index'

const mocks = vi.hoisted(() => ({ getProfile: vi.fn() }))

vi.mock('../../lib/userProfile', () => ({ getProfile: mocks.getProfile }))

const lbsProfile: UserProfile = {
  displayName: 'Patryk',
  weeklyGoal: 3,
  primaryGoal: 'strength',
  units: 'lbs',
  createdAt: 1,
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve })
  return { promise, resolve }
}

function ProtectedProbe() {
  const profile = useProfileStore((state) => state.profile)
  return <p data-testid="protected-content">units:{profile?.units}</p>
}

function renderProfileRouter(initialEntry: string) {
  const router = createMemoryRouter([
    {
      element: <ProfileRouteOutlet />,
      children: [
        { path: '/workout/new', element: <ProtectedProbe /> },
        { path: '/onboarding', element: <p>onboarding</p> },
        { path: '/dashboard', element: <p>dashboard</p> },
      ],
    },
  ], { initialEntries: [initialEntry] })

  render(<RouterProvider router={router} />)
}

beforeEach(() => {
  mocks.getProfile.mockReset()
  useAuthStore.setState({
    user: { uid: 'user-1' } as User,
    loading: false,
  })
  useProfileStore.getState().resetProfile()
})

describe('ProfileRouteOutlet', () => {
  it('waits for an lbs profile before rendering a cold workout route', async () => {
    const request = deferred<UserProfile | null>()
    mocks.getProfile.mockReturnValue(request.promise)
    renderProfileRouter('/workout/new')

    expect(screen.getByText('Wczytywanie profilu...')).toBeInTheDocument()
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()

    act(() => request.resolve(lbsProfile))

    expect(await screen.findByText('units:lbs')).toBeInTheDocument()
  })

  it('shows a retryable error instead of onboarding or implicit kg', async () => {
    mocks.getProfile
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(lbsProfile)
    renderProfileRouter('/workout/new')

    expect(await screen.findByRole('alert')).toHaveTextContent('Nie udało się wczytać profilu')
    fireEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))

    expect(await screen.findByText('units:lbs')).toBeInTheDocument()
  })

  it('routes an authenticated account without a profile to onboarding', async () => {
    mocks.getProfile.mockResolvedValue(null)
    renderProfileRouter('/workout/new')

    expect(await screen.findByText('onboarding')).toBeInTheDocument()
  })
})
