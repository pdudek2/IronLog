import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { LayoutGroup, motion, useReducedMotion } from 'framer-motion'
import { landingChanges, landingToday, type LandingDay } from '../shared/landingDay'

const BUDGETS = [45, 30, 20] as const
const LOOP: (number | null)[] = [45, 30, null]
const minutes = (sec: number) => Math.round(sec / 60)
const and = (parts: string[]) => (parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0] ?? '')
const exercises = (count: number) => `${count} ${count === 1 ? 'exercise' : 'exercises'}`
const slide = { duration: 0.5, ease: [0.2, 0.7, 0.2, 1] as const }

// Today's version of one plan day; on the hero it changes the time by itself until touched. The time sits above
// the list here (not at the thumb, as on Train) because a visitor watches the cause before the effect.
export default function LandingCompression({ day, playing: autoplay, label }: { day: LandingDay; playing: boolean; label: string }) {
  const reduceMotion = useReducedMotion()
  const group = useId()
  const usual = minutes(landingToday(day, null, false).fullEstimateSec)
  const shorter = useMemo(() => BUDGETS.filter((budget) => budget < usual), [usual])
  const [budget, setBudget] = useState<number | null>(() => (autoplay && !reduceMotion ? null : shorter[0] ?? null))
  const [touched, setTouched] = useState(false)
  const [held, setHeld] = useState(false)
  const playing = autoplay && !touched && !held && !reduceMotion && shorter.length > 0
  const step = useRef(0)

  useEffect(() => {
    if (!playing) return
    const sequence = LOOP.filter((value) => value === null || shorter.includes(value as (typeof BUDGETS)[number]))
    const timer = window.setTimeout(() => {
      setBudget(sequence[step.current % sequence.length]!)
      step.current += 1
    }, budget === null ? 1600 : 2800)
    return () => window.clearTimeout(timer)
  }, [playing, budget, shorter])

  const today = useMemo(() => landingToday(day, budget, false), [day, budget])
  const planned = day.exercises.reduce((sum, exercise) => sum + exercise.sets, 0)
  const skipped = day.exercises.flatMap((_, index) => (today.sets[index] === 0 ? [index] : []))
  const changes = landingChanges(day, today)
  const changed = and([
    ...(changes.paired ? [`${exercises(changes.paired)} pair up`] : []),
    ...(changes.skipped.length === 1 ? [`${changes.skipped[0]} is skipped`] : changes.skipped.length ? [`${exercises(changes.skipped.length)} are skipped`] : []),
    ...(changes.fewer ? [`${exercises(changes.fewer)} ${changes.fewer === 1 ? 'has' : 'have'} fewer sets`] : []),
  ])
  const stop = () => setTouched(true)
  const choose = (value: number | null) => { stop(); setBudget(value) }

  const row = (index: number, sets: number) => {
    const exercise = day.exercises[index]!
    return (
      <motion.div layout="position" layoutId={`row-${index}`} key={`row-${index}`} className="train-exercise" transition={slide}>
        <span>{exercise.name}</span>
        <span>
          {sets === exercise.sets ? sets : <strong>{sets}</strong>} × {exercise.reps}
          {exercise.weight > 0 && <>{' · '}{exercise.weight} kg</>}
        </span>
      </motion.div>
    )
  }

  return (
    <section
      className={autoplay ? 'landing-today landing-today--playing' : 'landing-today'}
      aria-label={`${day.name}, today's version`}
      onPointerEnter={(event) => { if (event.pointerType === 'mouse') setHeld(true) }}
      onPointerLeave={() => setHeld(false)}
      onTouchStart={stop}
    >
      <header className="landing-today-head">
        <h2>{day.name}</h2>
        <span>{label}</span>
      </header>

      {shorter.length > 0 && (
        <div className="train-dock-time" role="radiogroup" aria-label="Time today">
          <button type="button" role="radio" aria-checked={budget === null} onClick={() => choose(null)}>
            Usual <span>~{usual} min</span>
          </button>
          {shorter.map((value) => (
            <button key={value} type="button" role="radio" aria-checked={budget === value} onClick={() => choose(value)}>
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
          <strong>~{minutes(today.estimateSec)} min</strong>
          {budget === null ? `. ${planned} sets, as written.` : ` instead of ~${usual}.${changed ? ` ${changed}.` : ''} Weights stay the same.`}
        </p>
      )}

      <LayoutGroup id={group}>
        <div className="train-exercises" style={{ '--rows': day.exercises.length } as React.CSSProperties}>
          {today.blocks.map((block) => {
            const live = block.items.filter((item) => item.sets > 0)
            if (!live.length) return null
            if (live.length === 1) return row(live[0]!.index, live[0]!.sets)
            const rounds = Math.max(...live.map((item) => item.sets))
            const kind = live.length === 2 ? 'Superset' : 'Circuit'
            return (
              <motion.div layout="position" key={`group-${live[0]!.index}`} className="train-group" role="group" aria-label={`${kind}, ${rounds} ${rounds === 1 ? 'round' : 'rounds'}`} transition={slide}>
                <p aria-hidden="true">{kind} · {rounds} {rounds === 1 ? 'round' : 'rounds'}</p>
                {live.map((item) => row(item.index, item.sets))}
              </motion.div>
            )
          })}
          {skipped.length > 0 && <motion.i layout="position" layoutId="cut" className="landing-cut" aria-hidden="true" transition={slide} />}
          {skipped.map((index) => (
            <motion.div layout="position" layoutId={`row-${index}`} key={`row-${index}`} className="train-exercise train-exercise--skipped" transition={slide}>
              <span>{day.exercises[index]!.name}</span>
              <span>Skipped today</span>
            </motion.div>
          ))}
        </div>
      </LayoutGroup>
    </section>
  )
}
