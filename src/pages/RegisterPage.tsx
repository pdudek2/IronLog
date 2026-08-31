import { useState } from 'react'
import type * as React from 'react'
import { Link } from 'react-router-dom'
import { getAuthErrorMessage, registerUser } from '../lib/auth'
import AuthShell from '../components/AuthShell'
import { Button, Input } from '../components/ui'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await registerUser(email, password)
      // onAuthStateChanged zaktualizuje store → PublicRoute przekieruje
    } catch (err) {
      setError(getAuthErrorMessage(err, 'register'))
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Załóż konto"
      subtitle={(
        <Link to="/login" className="auth-account-link transition-opacity hover:opacity-80">
          Wróć do logowania
        </Link>
      )}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" aria-describedby={error ? 'register-form-error' : undefined}>
        <div className="flex flex-col gap-1">
          <label htmlFor="register-email" className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Email</label>
          <Input
            id="register-email"
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
          <label htmlFor="register-password" className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Hasło</label>
          <Input
            id="register-password"
            name="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            aria-describedby="register-password-help"
            required
            minLength={6}
          />
          <span id="register-password-help" className="text-xs" style={{ color: 'var(--muted)' }}>Minimum 6 znaków</span>
        </div>

        {error && <p id="register-form-error" role="alert" className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}

        <Button type="submit" loading={loading} className="auth-instrument-submit mt-2 w-full">
          Zarejestruj się
        </Button>
      </form>
    </AuthShell>
  )
}
