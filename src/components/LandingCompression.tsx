import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, MotionConfig, animate, motion, useIsPresent, useReducedMotion, type HTMLMotionProps } from 'framer-motion'
import { landingChanges, landingToday, type LandingDay } from '../shared/landingDay'

const BUDGETS = [45, 30, 20] as const
const LOOP: (number | null)[] = [45, 30, null]
const minutes = (sec: number) => Math.round(sec / 60)
const and = (parts: string[]) => (parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0] ?? '')
const exercises = (count: number) => `${count} ${count === 1 ? 'exercise' : 'exercises'}`
const ease = [0.22, 1, 0.36, 1] as const
const fade = (delay: number, duration = 0.2) => ({ duration, delay, ease })
// Leaving rows fade where they stand first, then the rest close up; nothing crosses another row.
const reflow = { layout: { type: 'spring', visualDuration: 0.4, bounce: 0, delay: 0.12 } } as const
// A grouped row indents inside its own box (counts stay put) and draws its piece of the group rail.
const INDENT = 15
const LABEL = '24px'

// A rapid run of choices can strand a leaving row (invisible, out of flow); it must not stay readable either.
function Row(props: HTMLMotionProps<'div'>) {
  return <motion.div {...props} aria-hidden={useIsPresent() ? undefined : true} />
}

function placeThumb(row: HTMLElement, layer: HTMLElement, instant: boolean) {
  const chip = row.querySelector<HTMLElement>('[aria-checked="true"]')
  const clip = chip
    ? `inset(0px ${row.clientWidth - chip.offsetLeft - chip.offsetWidth}px 0px ${chip.offsetLeft}px round 12px)`
    : 'inset(0px 100% 0px 0px round 12px)'
  animate(layer, { clipPath: clip }, instant ? { duration: 0 } : { type: 'spring', visualDuration: 0.3, bounce: 0 })
}

function Digit({ value, strong, delay }: { value: number; strong?: boolean; delay: number }) {
  return (
    <span className="landing-digit">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ opacity: 0, y: '0.4em' }}
          animate={{ opacity: 1, y: 0, transition: fade(delay, 0.18) }}
          exit={{ opacity: 0, y: '-0.4em', transition: fade(delay, 0.14) }}
        >
          {strong ? <strong>{value}</strong> : value}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

// Today's version of one plan day; on the hero it changes the time by itself until touched. The time sits above
// the list here (not at the thumb, as on Train) because a visitor watches the cause before the effect.
export default function LandingCompression({ day, playing: autoplay, label }: { day: LandingDay; playing: boolean; label: string }) {
  const reduceMotion = useReducedMotion()
  const usual = minutes(landingToday(day, null, false).fullEstimateSec)
  const shorter = useMemo(() => BUDGETS.filter((budget) => budget < usual), [usual])
  const [budget, setBudget] = useState<number | null>(() => (autoplay && !reduceMotion ? null : shorter[0] ?? null))
  const [touched, setTouched] = useState(false)
  const [held, setHeld] = useState(false)
  const playing = autoplay && !touched && !held && !reduceMotion && shorter.length > 0
  const step = useRef(0)
  const track = useRef<HTMLDivElement>(null)
  const thumb = useRef<HTMLSpanElement>(null)
  const placed = useRef(false)

  useEffect(() => {
    if (!playing) return
    const sequence = LOOP.filter((value) => value === null || shorter.includes(value as (typeof BUDGETS)[number]))
    const timer = window.setTimeout(() => {
      setBudget(sequence[step.current % sequence.length]!)
      step.current += 1
    }, budget === null ? 1600 : 2800)
    return () => window.clearTimeout(timer)
  }, [playing, budget, shorter])

  // The bone thumb is a second layer of the chip labels clipped to the selected chip, so the dark text flips exactly at its edge.
  useLayoutEffect(() => {
    if (track.current && thumb.current) placeThumb(track.current, thumb.current, !placed.current || !!reduceMotion)
    placed.current = true
  }, [budget, reduceMotion])

  // Chip widths follow their text, so a late web font moves them without a new choice.
  useLayoutEffect(() => {
    const row = track.current
    if (!row) return
    const widths = new Map<Element, number>()
    const observer = new ResizeObserver((entries) => {
      if (entries.some((entry) => widths.has(entry.target) && widths.get(entry.target) !== entry.contentRect.width) && thumb.current) placeThumb(row, thumb.current, true)
      for (const entry of entries) widths.set(entry.target, entry.contentRect.width)
    })
    for (const element of [row, ...row.querySelectorAll('button')]) observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const today = useMemo(() => landingToday(day, budget, false), [day, budget])
  const planned = day.exercises.reduce((sum, exercise) => sum + exercise.sets, 0)
  const skipped = day.exercises.flatMap((_, index) => (today.sets[index] === 0 ? [index] : []))
  const changes = landingChanges(day, today)
  const changed = and([
    ...(changes.paired ? [`${exercises(changes.paired)} pair up`] : []),
    ...(changes.skipped.length === 1 ? [`${changes.skipped[0]} is skipped`] : changes.skipped.length ? [`${exercises(changes.skipped.length)} are skipped`] : []),
    ...(changes.fewer ? [`${exercises(changes.fewer)} ${changes.fewer === 1 ? 'has' : 'have'} fewer sets`] : []),
  ])
  const fits = budget === null || today.fits
  const stop = () => setTouched(true)
  const choose = (value: number | null) => { stop(); setBudget(value) }

  const items: ReactNode[] = []
  // Skipped rows live in their own list: merged into this one, a leaving one would land before a staying row and reorder it.
  const below: ReactNode[] = []
  const row = (index: number, sets: number, grouped: boolean, group?: ReactNode) => {
    const exercise = day.exercises[index]!
    const delay = 0.16 + items.length * 0.03
    const shape = { paddingLeft: grouped ? INDENT : 0, '--rail': grouped ? 1 : 0, '--label': group ? LABEL : '0px' }
    items.push(
      <Row
        layout="position"
        key={`row-${index}`}
        className="train-exercise"
        initial={{ opacity: 0, ...shape }}
        animate={{ opacity: 1, ...shape }}
        exit={{ opacity: 0, transition: fade(0, 0.14) }}
        transition={{ ...reflow, opacity: fade(0.45), paddingLeft: reflow.layout, '--label': reflow.layout, '--rail': grouped ? fade(0.3) : fade(0, 0.12) }}
      >
        <span>{exercise.name}</span>
        <span>
          <Digit value={sets} strong={sets !== exercise.sets} delay={delay} /> × {exercise.reps}
          {exercise.weight > 0 && <>{' · '}{exercise.weight} kg</>}
        </span>
        <AnimatePresence initial={false}>
          {group && (
            <motion.small
              key="group"
              className="train-group-label"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: fade(0.32) }}
              exit={{ opacity: 0, transition: fade(0, 0.12) }}
            >
              {group}
            </motion.small>
          )}
        </AnimatePresence>
      </Row>,
    )
  }
  for (const block of today.blocks) {
    const live = block.items.filter((item) => item.sets > 0)
    const rounds = Math.max(...live.map((item) => item.sets))
    // The group's label rides on its first row, so forming a group adds no element that would reorder the list.
    const group = live.length > 1 && <>{live.length === 2 ? 'Superset' : 'Circuit'} · <Digit value={rounds} delay={0.16 + items.length * 0.03} /> {rounds === 1 ? 'round' : 'rounds'}</>
    live.forEach((item, position) => row(item.index, item.sets, live.length > 1, position === 0 ? group : undefined))
  }
  if (skipped.length) {
    below.push(
      <motion.i
        layout="position"
        key="cut"
        className="landing-cut"
        aria-hidden="true"
        style={{ originX: 0 }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1, transition: fade(0.38, 0.28) }}
        exit={{ opacity: 0, transition: fade(0, 0.16) }}
        transition={reflow}
      />,
    )
  }
  for (const index of skipped) {
    below.push(
      <Row
        layout="position"
        key={`skipped-${index}`}
        className="train-exercise train-exercise--skipped"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: fade(0.56) }}
        exit={{ opacity: 0, transition: fade(0, 0.1) }}
        transition={reflow}
      >
        <span>{day.exercises[index]!.name}</span>
        <span>Skipped today</span>
      </Row>,
    )
  }

  return (
    <MotionConfig reducedMotion="user">
      <section
        className={autoplay ? 'landing-today landing-today--playing' : 'landing-today'}
        aria-label={`${day.name}, today's version`}
        onPointerEnter={(event) => { if (event.pointerType === 'mouse') setHeld(true) }}
        onPointerLeave={() => setHeld(false)}
        onTouchStart={stop}
        onFocus={stop}
      >
        <header className="landing-today-head">
          <h2>{day.name}</h2>
          <span>{label}</span>
        </header>

        {shorter.length > 0 && (
          <div ref={track} className="train-dock-time landing-time" role="radiogroup" aria-label="Time today">
            <button type="button" role="radio" aria-checked={budget === null} onClick={() => choose(null)}>
              Usual <span>~{usual} min</span>
            </button>
            {shorter.map((value) => (
              <button key={value} type="button" role="radio" aria-checked={budget === value} onClick={() => choose(value)}>
                {value} min
              </button>
            ))}
            <span ref={thumb} className="landing-time-thumb" aria-hidden="true">
              <span>Usual <span>~{usual} min</span></span>
              {shorter.map((value) => <span key={value}>{value} min</span>)}
            </span>
          </div>
        )}
        <p className="train-dock-line" role={fits ? undefined : 'status'}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={`${budget}-${today.estimateSec}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: fade(0.08, 0.16) }}
              exit={{ opacity: 0, transition: fade(0, 0.1) }}
            >
              {fits ? (
                <>
                  <strong>~{minutes(today.estimateSec)} min</strong>
                  {budget === null ? `. ${planned} sets, as written.` : ` instead of ~${usual}.${changed ? ` ${changed}.` : ''} Weights stay the same.`}
                </>
              ) : (
                <><strong>Doesn’t fit in {budget} min.</strong> The shortest version takes ~{minutes(today.estimateSec)} min.</>
              )}
            </motion.span>
          </AnimatePresence>
        </p>

        <div className="train-exercises" style={{ '--rows': day.exercises.length } as React.CSSProperties}>
          <div className="landing-rows">
            <AnimatePresence mode="popLayout" initial={false}>{items}</AnimatePresence>
          </div>
          <div className="landing-rows">
            <AnimatePresence mode="popLayout" initial={false}>{below}</AnimatePresence>
          </div>
        </div>
      </section>
    </MotionConfig>
  )
}
