import { StrictMode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LogoutPage from '../LogoutPage'

const mocks = vi.hoisted(() => ({
  logoutUser: vi.fn(),
}))

vi.mock('../../lib/auth', () => ({
  logoutUser: mocks.logoutUser,
}))

function renderLogoutPage() {
  const router = createMemoryRouter([
    { path: '/logout', element: <LogoutPage /> },
    { path: '/dashboard', element: <p>Panel główny</p> },
  ], { initialEntries: ['/logout'] })

  render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  )
  return router
}

describe('LogoutPage', () => {
  beforeEach(() => {
    mocks.logoutUser.mockReset()
  })

  it('signs out only after the accepted logout route mounts', () => {
    mocks.logoutUser.mockReturnValue(new Promise(() => {}))

    renderLogoutPage()

    expect(mocks.logoutUser).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Signing out...')).toBeInTheDocument()
  })

  it('keeps a failed sign-out recoverable inside the protected app', async () => {
    mocks.logoutUser.mockRejectedValue(new Error('network'))
    const router = renderLogoutPage()

    expect(await screen.findByRole('heading', { name: 'Could not sign out' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back to dashboard' }))

    expect(await screen.findByText('Panel główny')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/dashboard')
  })
})
