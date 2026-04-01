import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { registerUser } from '../lib/auth'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await registerUser(email, password)
      // onAuthStateChanged zaktualizuje store → PublicRoute przekieruje
    } catch {
      setError('Rejestracja nie powiodła się. Sprawdź dane.')
      setLoading(false)
    }
  }

  const inputStyle = {
    background: 'var(--input-bg)',
    border: '1px solid var(--border)',
  }

  const focusHandlers = {
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
      e.currentTarget.style.border = '1px solid rgba(232,255,87,0.4)'
      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(232,255,87,0.08)'
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      e.currentTarget.style.border = '1px solid var(--border)'
      e.currentTarget.style.boxShadow = 'none'
    },
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        <div className="mb-10">
          <span className="text-2xl font-bold tracking-tight" style={{ color: 'var(--accent)' }}>
            IronLog
          </span>
          <h1 className="mt-3 text-3xl font-semibold text-white">Utwórz konto</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            Masz już konto?{' '}
            <Link to="/login" className="transition-opacity hover:opacity-80" style={{ color: 'var(--accent)' }}>
              Zaloguj się
            </Link>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Email</label>
            <input
              type="email"
              placeholder="user@mail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="px-4 py-3 rounded-lg text-sm text-white outline-none transition-all"
              style={inputStyle}
              {...focusHandlers}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Hasło</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="px-4 py-3 rounded-lg text-sm text-white outline-none transition-all"
              style={inputStyle}
              {...focusHandlers}
            />
            <span className="text-xs" style={{ color: 'var(--muted)' }}>Minimum 6 znaków</span>
          </div>

          {error && <p className="text-sm" style={{ color: '#FF4B4B' }}>{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 py-3 rounded-lg font-semibold text-sm tracking-wide transition-opacity disabled:opacity-50 hover:opacity-90"
            style={{ background: 'var(--accent)', color: '#08061A' }}
          >
            {loading ? 'Tworzenie konta...' : 'Zarejestruj się'}
          </button>
        </form>

      </div>
    </div>
  )
}
