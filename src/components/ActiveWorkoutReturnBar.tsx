import { useEffect, useState } from 'react'
import { ChevronRight, Dumbbell } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'

import { useAuthStore } from '../store/authStore'
import { useWorkoutStore } from '../store/workoutStore'

function formatElapsedTime(startedAt: number, now = Date.now()): string {
  const total = Math.max(0, Math.floor((now - startedAt) / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

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
    || !uid
    || !active
  ) return null

  return (
    <section className="active-workout-return-bar" role="region" aria-label="Active workout">
      <div className="active-workout-return-inner">
        <Dumbbell size={17} strokeWidth={2.2} aria-hidden="true" />
        <div className="active-workout-return-copy">
          <strong>Workout in progress</strong>
          {active.label?.trim() && <span title={active.label}>{active.label}</span>}
        </div>
        <ElapsedSessionTimer startedAt={active.startedAt} className="active-workout-return-time" />
        <button type="button" onClick={() => navigate('/workout/new')} aria-label="Return to workout">
          <span>Return</span>
          <ChevronRight size={15} aria-hidden="true" />
        </button>
      </div>
    </section>
  )
}
