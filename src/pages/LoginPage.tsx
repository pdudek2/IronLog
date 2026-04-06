import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { loginUser } from '../lib/auth'
import AuthShell from '../components/AuthShell'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await loginUser(email, password)
      // onAuthStateChanged zaktualizuje store → PublicRoute przekieruje
    } catch {
      setError('Nieprawidłowy email lub hasło')
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Zaloguj się"
      subtitle={(
        <>
          Nie masz konta?{' '}
          <Link to="/register" className="transition-opacity hover:opacity-80" style={{ color: 'var(--accent)' }}>
            Zarejestruj się
          </Link>
        </>
      )}
    >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Email</label>
            <input
              type="email"
              placeholder="user@mail.pl"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="px-4 py-3 rounded-lg text-sm text-white outline-none transition-all"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--border)' }}
              onFocus={e => {
                e.currentTarget.style.border = '1px solid rgba(232,255,87,0.35)'
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(232,255,87,0.08)'
              }}
              onBlur={e => {
                e.currentTarget.style.border = '1px solid var(--border)'
                e.currentTarget.style.boxShadow = 'none'
              }}
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
              className="px-4 py-3 rounded-lg text-sm text-white outline-none transition-all"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--border)' }}
              onFocus={e => {
                e.currentTarget.style.border = '1px solid rgba(232,255,87,0.35)'
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(232,255,87,0.08)'
              }}
              onBlur={e => {
                e.currentTarget.style.border = '1px solid var(--border)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
          </div>

          {error && <p className="text-sm" style={{ color: '#FF4B4B' }}>{error}</p>}

          <motion.button
            type="submit"
            disabled={loading}
            className="mt-2 py-3 rounded-lg font-semibold text-sm tracking-wide disabled:opacity-50"
            style={{ background: 'var(--accent)', color: '#08061A' }}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.97 }}
          >
            {loading ? 'Logowanie...' : 'Zaloguj się'}
          </motion.button>
        </form>
    </AuthShell>
  )
}
