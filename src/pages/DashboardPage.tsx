import { logoutUser } from '../lib/auth'
import { useNavigate } from 'react-router-dom'

export default function DashboardPage() {
  const navigate = useNavigate()

  async function handleLogout() {
    await logoutUser()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-4" style={{ color: 'var(--accent)' }}>
          Dashboard
        </h1>
        <button
          onClick={handleLogout}
          className="px-6 py-2 rounded-lg text-sm"
          style={{ background: 'var(--card)', color: 'var(--text)' }}
        >
          Wyloguj
        </button>
      </div>
    </div>
  )
}
