import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import LoginPage from '../LoginPage'

vi.mock('../../lib/auth', () => ({
  getAuthErrorMessage: vi.fn(),
  loginUser: vi.fn(),
  resetPassword: vi.fn(),
}))

describe('authentication page contracts', () => {
  it('places password recovery after the password field in keyboard order', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    const password = screen.getByLabelText('Hasło')
    const reset = screen.getByRole('button', { name: 'Nie pamiętasz hasła?' })
    const controls = Array.from(document.querySelectorAll('a, input, button'))

    expect(controls.indexOf(password)).toBeLessThan(controls.indexOf(reset))
  })
})
