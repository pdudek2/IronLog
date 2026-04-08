import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { loginUser } from '../lib/auth'
import AuthShell from '../components/AuthShell'
import { Button, Input } from '../components/ui'

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
          <Input
            type="email"
            placeholder="user@mail.pl"
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
          />
        </div>

        {error && <p className="text-sm" style={{ color: '#FF4B4B' }}>{error}</p>}

        <Button type="submit" loading={loading} className="mt-2 w-full">
          Zaloguj się
        </Button>
      </form>
    </AuthShell>
  )
}
