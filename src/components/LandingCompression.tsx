import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { LayoutGroup, motion, useReducedMotion } from 'framer-motion'
import { landingToday, type LandingDay } from '../shared/landingDay'

const BUDGETS = [45, 30, 20] as const
const LOOP: (number | null)[] = [45, 30, null]
const minutes = (sec: number) => Math.round(sec / 60)
const ease = [0.2, 0.7, 0.2, 1] as const

// Today's version of one plan day, as Train shows it; on the hero it changes the time by itself until touched.
export default function LandingCompression({ day, playing: autoplay, label }: { day: LandingDay; playing: boolean; label: string }) {
  const reduceMotion = useReducedMotion()
  const usual = minutes(landingToday(day, null, false).fullEstimateSec)
  const shorter = useMemo(() => BUDGETS.filter((budget) => budget < usual), [usual])
  const [budget, setBudget] = useState<number | null>(() => (autoplay && !reduceMotion ? null : shorter[0] ?? null))
  const [straight, setStraight] = useState(false)
  const [touched, setTouched] = useState(false)
  const [held, setHeld] = useState(false)
  const playing = autoplay && !touched && !held && !reduceMotion && shorter.length > 0
  const step = useRef(0)

  useEffect(() => {
    if (!playing) return
    const sequence = LOOP.filter((value) => value === null || shorter.includes(value as (typeof BUDGETS)[number]))
    const timer = window.setTimeout(() => {
      const next = sequence[step.current % sequence.length]!
      step.current += 1
      setBudget(next)
    }, budget === null ? 1600 : 2800)
    return () => window.clearTimeout(timer)
  }, [playing, budget, shorter])

  const today = useMemo(() => landingToday(day, budget, straight), [day, budget, straight])
  const planned = day.exercises.reduce((sum, exercise) => sum + exercise.sets, 0)
  const kept = today.sets.reduce((sum, sets) => sum + sets, 0)
  const grouped = today.blocks.some((block) => block.group && block.items.filter((item) => item.sets > 0).length > 1)
  const skipped = day.exercises.flatMap((_, index) => (today.sets[index] === 0 ? [index] : []))
  const stop = () => setTouched(true)

  const row = (index: number, sets: number) => {
    const exercise = day.exercises[index]!
    return (
      <motion.div layout="position" layoutId={`row-${index}`} key={`row-${index}`} className="train-exercise" transition={{ duration: 0.5, ease }}>
        <span>{exercise.name}</span>
        <span>
          {sets} × {exercise.reps}
          {exercise.weight > 0 && <>{' · '}<b>{exercise.weight} kg</b></>}
        </span>
      </motion.div>
    )
  }

  return (
    <section className="landing-today" aria-label={`${day.name}, today's version`} onPointerEnter={(event) => { if (event.pointerType === 'mouse') setHeld(true) }} onPointerLeave={() => setHeld(false)} onTouchStart={stop}>
      <header className="landing-today-head">
        <h2>{day.name}</h2>
        <span>{label}</span>
      </header>
      <LayoutGroup>
        <div className="train-exercises">
          {today.blocks.map((block) => {
            const live = block.items.filter((item) => item.sets > 0)
            if (!live.length) return null
            if (live.length === 1) return row(live[0]!.index, live[0]!.sets)
            const rounds = Math.max(...live.map((item) => item.sets))
            return (
              <motion.div layout="position" key={`group-${live[0]!.index}`} className="train-group" role="group" aria-label={`${live.length === 2 ? 'Superset' : 'Circuit'}, ${rounds} ${rounds === 1 ? 'round' : 'rounds'}`} transition={{ duration: 0.5, ease }}>
                <p aria-hidden="true">
                  {live.length === 2 ? 'Superset' : 'Circuit'} · {rounds} {rounds === 1 ? 'round' : 'rounds'}
                </p>
                {live.map((item) => row(item.index, item.sets))}
              </motion.div>
            )
          })}
          {skipped.map((index) => (
            <motion.div layout="position" layoutId={`row-${index}`} key={`row-${index}`} className="train-exercise train-exercise--skipped" transition={{ duration: 0.5, ease }}>
              <span>{day.exercises[index]!.name}</span>
              <span>Skipped today</span>
            </motion.div>
          ))}
        </div>
      </LayoutGroup>

      <div className="train-dock landing-today-dock">
        <div className="train-dock-today">
          {shorter.length > 0 && (
            <div className="train-dock-time" role="radiogroup" aria-label="Time today">
              <button type="button" role="radio" aria-checked={budget === null} onClick={() => { stop(); setBudget(null) }}>
                Usual <span>~{usual} min</span>
              </button>
              {shorter.map((value) => (
                <button key={value} type="button" role="radio" aria-checked={budget === value} onClick={() => { stop(); setBudget(value) }}>
                  {value} min
                </button>
              ))}
            </div>
          )}
          {budget !== null && !today.fits ? (
            <p className="train-dock-line" role="status">
              <strong>Doesn’t fit in {budget} min.</strong> The shortest version takes ~{minutes(today.estimateSec)} min.
            </p>
          ) : (
            <p className="train-dock-line">
              <strong>~{minutes(today.estimateSec)} min</strong>{' · '}{kept} of {planned} sets{' · '}Same weights
            </p>
          )}
          {budget !== null && today.fits && (grouped || straight) && (
            <label className="train-time-switch">
              <span>Without supersets</span>
              <input type="checkbox" role="switch" checked={straight} onChange={(event) => { stop(); setStraight(event.target.checked) }} />
            </label>
          )}
        </div>
        <Link to="/register" className="ui-button ui-button--primary landing-today-start">Start</Link>
      </div>
    </section>
  )
}
