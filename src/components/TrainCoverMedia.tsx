import { useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import type { WorkoutCover } from '../shared/workoutCover'

const PLAYED_KEY = 'ironlog:train-cover-played'

export type TrainCover = WorkoutCover | 'week'

const playedToken = (cover: TrainCover) => `${new Date().toDateString()}:${cover}`

function playedToday(cover: TrainCover) {
  try {
    return localStorage.getItem(PLAYED_KEY) === playedToken(cover)
  } catch {
    return false
  }
}

function markPlayed(cover: TrainCover) {
  try {
    localStorage.setItem(PLAYED_KEY, playedToken(cover))
  } catch {
    // Without storage the clip simply plays again on the next visit.
  }
}

// The poster is the clip's first frame and the clip ends on the still, so nothing rewinds on screen.
export function TrainCoverMedia({ cover }: { cover: TrainCover }) {
  const reduceMotion = useReducedMotion()
  const loop = cover === 'upper'
  const [still, setStill] = useState(() => cover === 'week' || (!loop && playedToday(cover)))

  if (reduceMotion || still) return <img src={`/covers/${cover}.jpg`} alt="" />

  return (
    <video
      src={`/covers/${cover}.mp4`}
      poster={`/covers/${cover}-start.jpg`}
      muted
      playsInline
      loop={loop}
      preload="auto"
      aria-hidden="true"
      onCanPlay={(event) => { void event.currentTarget.play().catch(() => setStill(true)) }}
      onEnded={() => markPlayed(cover)}
      onError={() => setStill(true)}
    />
  )
}
