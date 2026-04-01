import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { registerUser } from '../lib/auth'

export default function RegisterPage() {
  const navigate = useNavigate()
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
      navigate('/dashboard')
    } catch {
      setError('Rejestracja nie powiodła się. Sprawdź dane.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold mb-8" style={{ color: 'var(--accent)' }}>
          IronLog
        </h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="px-4 py-3 rounded-lg outline-none text-sm"
            style={{ background: 'var(--card)', color: 'var(--text)', border: '1px solid #2d2b45' }}
          />
          <input
            type="password"
            placeholder="Hasło (min. 6 znaków)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="px-4 py-3 rounded-lg outline-none text-sm"
            style={{ background: 'var(--card)', color: 'var(--text)', border: '1px solid #2d2b45' }}
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="py-3 rounded-lg font-semibold text-sm transition-opacity disabled:opacity-50"
            style={{ background: 'var(--accent)', color: '#08061A' }}
          >
            {loading ? 'Rejestracja...' : 'Zarejestruj się'}
          </button>
        </form>
        <p className="mt-6 text-sm text-center" style={{ color: 'var(--muted)' }}>
          Masz już konto?{' '}
          <Link to="/login" style={{ color: 'var(--accent)' }}>
            Zaloguj się
          </Link>
        </p>
      </div>
    </div>
  )
}
