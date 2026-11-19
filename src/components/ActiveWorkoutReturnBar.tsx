import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

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

const restLeftMs = (rest: { startedAt: number; totalSec: number } | null, now: number) => (
  rest ? Math.min(rest.totalSec * 1000, Math.max(0, rest.startedAt + rest.totalSec * 1000 - now)) : 0
)

// The running workout as one row: name, time and the rest left; the whole row returns, its top edge is the rest line.
export default function ActiveWorkoutReturnBar() {
  const uid = useAuthStore((state) => state.user?.uid)
  const active = useWorkoutStore((state) => state.active)
  const rest = useWorkoutStore((state) => state.restTimer)
  const location = useLocation()
  const navigate = useNavigate()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!rest) return
    const interval = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(interval)
  }, [rest])

  if (
    location.pathname.startsWith('/workout/new')
    // Train offers Resume as its main button instead.
    || location.pathname.startsWith('/dashboard')
    || !uid
    || !active
  ) return null

  const leftMs = restLeftMs(rest, now)
  const left = Math.ceil(leftMs / 1000)
  return (
    <section className="active-workout-return-bar" role="region" aria-label="Active workout">
      {rest && leftMs > 0 && <i className="active-workout-return-rest" aria-hidden="true" style={{ width: `${(leftMs / (rest.totalSec * 1000)) * 100}%` }} />}
      <button type="button" onClick={() => navigate('/workout/new')} aria-label="Return to workout">
        <span className="active-workout-return-name" title={active.label ?? undefined}>{active.label?.trim() || 'Workout'}</span>
        <span className="active-workout-return-time">
          <ElapsedSessionTimer startedAt={active.startedAt} />
          {leftMs > 0 && ` · rest ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}
        </span>
        <span className="active-workout-return-action">Return<ChevronRight size={16} aria-hidden="true" /></span>
      </button>
    </section>
  )
}
