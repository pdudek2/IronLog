import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import ProfilePage from '../ProfilePage'

const { setProfile } = vi.hoisted(() => ({ setProfile: vi.fn() }))

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({ user: { uid: 'user-1' } }),
}))

vi.mock('../../store/profileStore', () => ({
  useProfileStore: () => ({
    profile: {
      displayName: 'Jan',
      weeklyGoal: 4,
      primaryGoal: 'hypertrophy',
      units: 'kg',
      createdAt: 1,
    },
    setProfile,
  }),
}))

vi.mock('../../lib/userProfile', () => ({
  updateProfile: vi.fn(),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn() }
})

vi.mock('framer-motion', async () => {
  const { createElement } = await vi.importActual<typeof import('react')>('react')

  return {
    motion: new Proxy({}, {
      get: (_target, tag: string | symbol) => {
        if (typeof tag !== 'string') return undefined

        return ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => {
          const domProps = { ...props }
          delete domProps.initial
          delete domProps.animate
          delete domProps.transition
          return createElement(tag, domProps, children)
        }
      },
    }),
  }
})

describe('ProfilePage analytics removal', () => {
  it('renders profile settings without analytics consent controls', () => {
    render(<ProfilePage />)

    expect(screen.getByRole('heading', { name: 'Twój profil' })).toBeInTheDocument()
    expect(screen.queryByText('Akceptuję analitykę')).not.toBeInTheDocument()
    expect(screen.queryByText('Tylko niezbędne')).not.toBeInTheDocument()
    expect(screen.queryByText(/GA4|Contentsquare|Hotjar/i)).not.toBeInTheDocument()
  })
})
