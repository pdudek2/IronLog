import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { useAuthStore } from '../store/authStore'
import { useWorkoutStore } from '../store/workoutStore'

import { formatElapsedTime } from '../shared/workoutDisplay'

export function ElapsedSessionTimer({ startedAt, className = '' }: { startedAt: number; className?: string }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(interval)
  }, [startedAt])

  return <span className={className} data-testid="elapsed-session-timer">{formatElapsedTime(startedAt, now)}</span>
}

export default function ActiveWorkoutReturnBar() {
  const uid = useAuthStore((state) => state.user?.uid)
  const active = useWorkoutStore((state) => state.active)
  const location = useLocation()
  const navigate = useNavigate()

  if (
    location.pathname.startsWith('/workout/new')
    // Train offers Resume as its main button instead.
    || location.pathname.startsWith('/dashboard')
    || !uid
    || !active
  ) return null

  return (
    <section className="active-workout-return-bar" role="region" aria-label="Active workout">
      <p>
        <span title={active.label ?? undefined}>{active.label?.trim() || 'Workout'}</span>
        <ElapsedSessionTimer startedAt={active.startedAt} className="active-workout-return-time" />
      </p>
      <button type="button" onClick={() => navigate('/workout/new')} aria-label="Return to workout">
        Return
      </button>
    </section>
  )
}
