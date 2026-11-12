import { Fragment, useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Check } from 'lucide-react'
import WorkoutSetPanel from './workout/WorkoutSetPanel'
import type { WorkoutSet } from '../store/workoutStore'
import { formatPreviousSet, setPairLabel, setPanelRestLabel } from '../shared/workoutDisplay'

const REST_MS = 8000
const LAST = [{ weight: 80, reps: 8 }, { weight: 80, reps: 8 }, { weight: 80, reps: 7 }]
const START: WorkoutSet[] = [
  { weight: '82.5', reps: '8', done: true },
  { weight: '82.5', reps: '8', done: false },
  { weight: '82.5', reps: '7', done: false },
]
const WEEKS = [72.5, 75, 75, 77.5, 80]

function BestSetChart({ today }: { today: number | null }) {
  const values = today === null ? WEEKS : [...WEEKS, today]
  const lo = 70
  const hi = Math.max(85, ...values) + 2.5
  const x = (i: number) => 8 + (i * 284) / WEEKS.length
  const y = (v: number) => 100 - ((v - lo) / (hi - lo)) * 88
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ')
  const last = values.length - 1

  return (
    <figure className="landing-demo-chart">
      <figcaption>
        <span>Best set · 6 weeks · example data</span>
        <strong className="tabular-nums">{values[last]} kg</strong>
      </figcaption>
      <svg viewBox="0 0 300 108" role="img" aria-label={`Bench Press best set over six weeks, now ${values[last]} kg`}>
        <defs>
          <linearGradient id="landing-chart-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity={0.16} />
            <stop offset="1" stopColor="var(--accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2="300" y1={12 + f * 88} y2={12 + f * 88} stroke="rgba(244,241,242,0.05)" />
        ))}
        <path d={`${line} L${x(last)},108 L${x(0)},108 Z`} fill="url(#landing-chart-fade)" />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
        {values.map((v, i) => (
          <motion.circle
            key={i}
            cx={x(i)}
            r={i === last ? 4 : 2.5}
            fill="var(--accent)"
            initial={false}
            animate={{ cy: y(v) }}
            transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
          />
        ))}
      </svg>
    </figure>
  )
}

export default function LandingDemo() {
  const reduceMotion = useReducedMotion()
  const [sets, setSets] = useState(START)
  const [selected, setSelected] = useState<number | null>(null)
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [touched, setTouched] = useState(false)

  const openSetIndex = sets.findIndex((set) => !set.done)
  const current = selected ?? openSetIndex
  const panelSet = sets[current] ?? null
  const restLeft = restEndsAt === null ? 0 : Math.max(0, restEndsAt - now)
  const doneWeights = sets.filter((set) => set.done).map((set) => Number(set.weight)).filter((weight) => weight > 0)
  const today = doneWeights.length ? Math.max(...doneWeights) : null

  useEffect(() => {
    if (restEndsAt === null) return
    const interval = window.setInterval(() => {
      setNow(Date.now())
      if (Date.now() >= restEndsAt) setRestEndsAt(null)
    }, 250)
    return () => window.clearInterval(interval)
  }, [restEndsAt])

  const toggleSet = (index: number) => {
    const done = !sets[index].done
    setSets((prev) => prev.map((set, i) => (i === index ? { ...set, done } : set)))
    setSelected(null)
    setNow(Date.now())
    setRestEndsAt(done ? Date.now() + REST_MS : null)
  }
  const reset = () => {
    setSets(START)
    setSelected(null)
    setRestEndsAt(null)
  }
  const byHand = <A extends unknown[]>(action: (...args: A) => void) => (...args: A) => {
    setTouched(true)
    action(...args)
  }

  useEffect(() => {
    if (touched || reduceMotion || restEndsAt !== null) return
    const timer = window.setTimeout(() => (openSetIndex < 0 ? reset() : toggleSet(openSetIndex)), openSetIndex < 0 ? 2400 : 1600)
    return () => window.clearTimeout(timer)
  })

  const updateSet = (index: number, field: 'weight' | 'reps', value: string) =>
    setSets((prev) => prev.map((set, i) => (i === index ? { ...set, [field]: value } : set)))
  const adjustSet = (index: number, field: 'weight' | 'reps', delta: number) => {
    const value = Math.max(0, Number(sets[index][field]) + delta)
    updateSet(index, field, String(value))
  }

  const restSeconds = Math.ceil(restLeft / 1000)
  const rest = restLeft > 0 ? (
    <div className="rest-timer-bar" data-variant="full" role="status" aria-live="off">
      <div className="rest-timer-progress" aria-hidden="true">
        <div className="rest-timer-progress-fill" style={{ width: `${(restLeft / REST_MS) * 100}%` }} />
      </div>
      <div className="rest-timer-content">
        <div className="rest-timer-label">
          <span style={{ color: 'var(--muted)' }}>{setPanelRestLabel(panelSet, current)}</span>
          <span className="rest-timer-value tabular-nums">0:{String(restSeconds).padStart(2, '0')}</span>
        </div>
        <button type="button" className="rest-timer-action" onClick={byHand(() => setRestEndsAt(null))} aria-label="Skip rest">
          Skip
        </button>
      </div>
    </div>
  ) : null

  const panel = (
    <WorkoutSetPanel
      exerciseIndex={0}
      exerciseName="Bench Press"
      set={panelSet}
      setIndex={current}
      setCount={sets.length}
      units="kg"
      rest={rest}
      openSetIndex={openSetIndex}
      nextExercise={null}
      finishing={false}
      onAdjustSet={byHand((_, index, field, delta) => adjustSet(index, field, delta))}
      onUpdateSet={byHand((_, index, field, value) => updateSet(index, field, value))}
      onToggleSet={byHand((_, index) => toggleSet(index))}
      onClearSelection={byHand(() => setSelected(null))}
      onGoToExercise={() => {}}
      onFinish={byHand(reset)}
    />
  )

  return (
    <section className="landing-demo workout-focus-shell" aria-label="Try the set panel">
      <div className="workout-exercise-card">
        <div className="workout-exercise-head">
          <div className="min-w-0">
            <h2 className="workout-exercise-name">Bench Press</h2>
            <p className="workout-exercise-meta">Chest · Barbell</p>
          </div>
        </div>

        <div className="workout-set-header">
          <span>Set</span>
          <span>Last</span>
          <span>Today</span>
          <span />
        </div>

        <div className="workout-set-list">
          {sets.map((set, index) => (
            <Fragment key={index}>
              <div className="workout-set-row" data-done={set.done || undefined} data-current={index === current || undefined}>
                <button
                  type="button"
                  className="workout-set-toggle"
                  onClick={byHand(() => toggleSet(index))}
                  aria-label={`${set.done ? 'Unmark' : 'Mark'} set ${index + 1}`}
                >
                  {set.done ? <Check size={16} /> : index + 1}
                </button>
                <button
                  type="button"
                  className="workout-set-values tabular-nums"
                  onClick={byHand(() => setSelected(index))}
                  aria-pressed={index === current}
                  aria-label={`Edit set ${index + 1}: last ${formatPreviousSet(LAST[index], 'kg')}, today ${setPairLabel(set, 'kg')}`}
                >
                  <span className="workout-set-previous">{formatPreviousSet(LAST[index], 'kg')}</span>
                  <span className="workout-set-today">{setPairLabel(set, 'kg')}</span>
                </button>
                <span />
              </div>
              {index === current && <div>{panel}</div>}
            </Fragment>
          ))}
          {current < 0 && <div>{panel}</div>}
        </div>
      </div>

      <BestSetChart today={today} />
    </section>
  )
}
