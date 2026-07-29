import { describe, expect, it } from 'vitest'
import { getAuthErrorMessage } from '../auth'

describe('getAuthErrorMessage', () => {
  it('keeps credential failures private while separating recoverable failures', () => {
    expect(getAuthErrorMessage({ code: 'auth/wrong-password' }, 'login'))
      .toBe('Nieprawidłowy email lub hasło.')
    expect(getAuthErrorMessage({ code: 'auth/network-request-failed' }, 'login'))
      .toBe('Brak połączenia. Sprawdź internet i spróbuj ponownie.')
    expect(getAuthErrorMessage({ code: 'auth/too-many-requests' }, 'register'))
      .toBe('Zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie.')
  })

  it('returns registration-specific guidance and safe fallbacks', () => {
    expect(getAuthErrorMessage({ code: 'auth/email-already-in-use' }, 'register'))
      .toBe('Konto z tym adresem już istnieje.')
    expect(getAuthErrorMessage(new Error('unknown'), 'login'))
      .toBe('Nie udało się zalogować. Spróbuj ponownie.')
    expect(getAuthErrorMessage(new Error('unknown'), 'register'))
      .toBe('Nie udało się utworzyć konta. Spróbuj ponownie.')
  })
})
