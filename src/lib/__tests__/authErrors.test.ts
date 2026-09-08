import { describe, expect, it } from 'vitest'
import { getAuthErrorMessage } from '../auth'

describe('getAuthErrorMessage', () => {
  it('keeps credential failures private while separating recoverable failures', () => {
    expect(getAuthErrorMessage({ code: 'auth/wrong-password' }, 'login'))
      .toBe('Invalid email or password.')
    expect(getAuthErrorMessage({ code: 'auth/network-request-failed' }, 'login'))
      .toBe('No connection. Check your internet and try again.')
    expect(getAuthErrorMessage({ code: 'auth/too-many-requests' }, 'register'))
      .toBe('Too many attempts. Wait a moment and try again.')
  })

  it('returns registration-specific guidance and safe fallbacks', () => {
    expect(getAuthErrorMessage({ code: 'auth/email-already-in-use' }, 'register'))
      .toBe('An account with this email already exists.')
    expect(getAuthErrorMessage(new Error('unknown'), 'login'))
      .toBe('Could not sign in. Try again.')
    expect(getAuthErrorMessage(new Error('unknown'), 'register'))
      .toBe('Could not create your account. Try again.')
  })
})
