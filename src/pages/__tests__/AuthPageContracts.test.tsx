import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginPage from '../LoginPage'
import RegisterPage from '../RegisterPage'

const mocks = vi.hoisted(() => ({
  getAuthErrorMessage: vi.fn(),
  loginUser: vi.fn(),
  resetPassword: vi.fn(),
}))

vi.mock('../../lib/auth', () => ({
  getAuthErrorMessage: mocks.getAuthErrorMessage,
  loginUser: mocks.loginUser,
  resetPassword: mocks.resetPassword,
}))

describe('authentication page contracts', () => {
  beforeEach(() => {
    mocks.getAuthErrorMessage.mockReset()
    mocks.loginUser.mockReset()
    mocks.resetPassword.mockReset()
  })

  it('places password recovery after the password field in keyboard order', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    const password = screen.getByLabelText('Password')
    const reset = screen.getByRole('button', { name: 'Forgot password?' })
    const controls = Array.from(document.querySelectorAll('a, input, button'))

    expect(controls.indexOf(password)).toBeLessThan(controls.indexOf(reset))
  })

  it('targets a failed login at the password field without duplicating the alert', async () => {
    mocks.loginUser.mockRejectedValue(new Error('invalid credentials'))
    mocks.getAuthErrorMessage.mockReturnValue('Invalid email or password.')
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'patryk@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Invalid email or password.')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('targets password reset validation at the email field', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))

    expect(screen.getByText('Enter your email and we will send a password reset link.')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Password')).not.toHaveAttribute('aria-invalid')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('keeps account switching as one clear secondary action', () => {
    const { rerender } = render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Create account' })).toHaveAttribute('href', '/register')
    expect(screen.queryByText('Nie masz konta?')).not.toBeInTheDocument()

    rerender(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login')
    expect(screen.queryByText('Masz konto?')).not.toBeInTheDocument()
  })
})
