import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { registerUser } from '../lib/auth'
import AuthShell from '../components/AuthShell'
import { Button, Input } from '../components/ui'

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

  return (
    <AuthShell
      title="Utwórz konto"
      subtitle={(
        <>
          Masz już konto?{' '}
          <Link to="/login" className="transition-opacity hover:opacity-80" style={{ color: 'var(--accent)' }}>
            Zaloguj się
          </Link>
        </>
      )}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Email</label>
          <Input
            type="email"
            placeholder="user@mail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Hasło</label>
          <Input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          <span className="text-xs" style={{ color: 'var(--muted)' }}>Minimum 6 znaków</span>
        </div>

        {error && <p className="text-sm" style={{ color: '#FF4B4B' }}>{error}</p>}

        <Button type="submit" loading={loading} className="mt-2 w-full">
          Zarejestruj się
        </Button>
      </form>
    </AuthShell>
  )
}
