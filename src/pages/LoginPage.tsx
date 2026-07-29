import { useState } from 'react'
import type * as React from 'react'
import { Link } from 'react-router-dom'
import { getAuthErrorMessage, loginUser, resetPassword } from '../lib/auth'
import AuthShell from '../components/AuthShell'
import { Button, Input } from '../components/ui'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [resetNotice, setResetNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setResetNotice('')
    setLoading(true)
    try {
      await loginUser(email, password)
      // onAuthStateChanged zaktualizuje store → PublicRoute przekieruje
    } catch (err) {
      setError(getAuthErrorMessage(err, 'login'))
      setLoading(false)
    }
  }

  async function handlePasswordReset() {
    const normalizedEmail = email.trim()
    setError('')
    setResetNotice('')

    if (!normalizedEmail) {
      setError('Wpisz email, a wyślemy link do resetu hasła.')
      return
    }

    setResetLoading(true)
    try {
      await resetPassword(normalizedEmail)
      setResetNotice('Jeśli konto istnieje, wysłaliśmy link do resetu hasła.')
    } catch (err) {
      console.error('[password reset error]', err)
      setError('Nie udało się wysłać linku. Sprawdź email i spróbuj ponownie.')
    } finally {
      setResetLoading(false)
    }
  }

  const describedBy = [
    error ? 'login-form-error' : '',
    resetNotice ? 'login-reset-notice' : '',
  ].filter(Boolean).join(' ') || undefined

  return (
    <AuthShell
      title="Zaloguj się"
      subtitle={(
        <>
          Nie masz konta?{' '}
          <Link to="/register" className="auth-account-link transition-opacity hover:opacity-80">
            Utwórz konto
          </Link>
        </>
      )}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" aria-describedby={describedBy}>
        <div className="flex flex-col gap-1">
          <label htmlFor="login-email" className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Email</label>
          <Input
            id="login-email"
            name="email"
            type="email"
            placeholder="email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="login-password" className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Hasło</label>
          <Input
            id="login-password"
            name="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            onClick={() => void handlePasswordReset()}
            disabled={loading || resetLoading}
            className="auth-password-reset -my-1 self-end px-1 text-xs font-semibold transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {resetLoading ? 'Wysyłam...' : 'Nie pamiętasz hasła?'}
          </button>
        </div>

        {error && <p id="login-form-error" role="alert" className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
        {resetNotice && <p id="login-reset-notice" role="status" className="text-sm" style={{ color: 'var(--success)' }}>{resetNotice}</p>}

        <Button type="submit" loading={loading} disabled={resetLoading} className="auth-instrument-submit mt-2 w-full">
          Zaloguj się
        </Button>
      </form>
    </AuthShell>
  )
}
