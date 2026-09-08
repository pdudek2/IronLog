import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { logoutUser } from '../lib/auth'
import { LoadingState } from '../components/ui'

export default function LogoutPage() {
  const navigate = useNavigate()
  const [failed, setFailed] = useState(false)
  const logoutAttemptRef = useRef<ReturnType<typeof logoutUser> | null>(null)

  useEffect(() => {
    let active = true
    const logoutAttempt = logoutAttemptRef.current ?? logoutUser()
    logoutAttemptRef.current = logoutAttempt

    logoutAttempt.catch(() => {
      if (active) setFailed(true)
    })

    return () => {
      active = false
    }
  }, [])

  if (!failed) return <LoadingState message="Signing out..." />

  return (
    <main className="page-shell flex items-center justify-center">
      <div className="page-container flex justify-center">
        <section className="surface-panel w-full max-w-sm rounded-[var(--radius-xl)] px-6 py-8 text-center" role="alert">
          <h1 className="text-lg font-semibold text-white">Could not sign out</h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
            Your session is still active. Check your connection before trying again.
          </p>
          <button
            type="button"
            className="planner-primary-action mt-5 w-full"
            onClick={() => navigate('/dashboard', { replace: true })}
          >
            Back to dashboard
          </button>
        </section>
      </div>
    </main>
  )
}
