import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { MEMBER_LETTERS, usePreviousSets } from './sessionHelpers'
import OverloadHint from '../OverloadHint'
import type { SessionHint } from '../../shared/progression'
import { Check, ChevronDown, Ellipsis, Plus } from 'lucide-react'
import type { ActiveWorkout, WorkoutExercise } from '../../store/workoutStore'
import type { Units } from '../../lib/userProfile'
import { pluralize } from '../../lib/pluralize'
import { planCut } from '../../shared/sessionCut'
import { groupRestSec } from '../../shared/compression'
import { sessionRoles, type ExerciseMeta } from '../../shared/nextSessionRecommendation'
import { exerciseTargetLabel, formatPreviousSet, roundRows, setPairLabel } from '../../shared/workoutDisplay'

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`

// Under the header: what is left, and the only way into Short on time.
export function SessionTimeLine({ session, userExercises, onOpen }: {
  session: ActiveWorkout
  userExercises: ReadonlyMap<string, ExerciseMeta>
  onOpen: () => void
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(timer)
  }, [])
  const base = planCut(session, { leftMin: null, clock: false, straight: false }, now, userExercises)
  if (base.openBefore === 0) return null
  const left = Math.round(base.result.fullEstimateSec / 60)
  const cut = session.compression?.cut
  const finishBy = new Date(now + base.result.fullEstimateSec * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return (
    <button type="button" className="workout-time-line" onClick={onOpen} aria-haspopup="dialog">
      <span><strong>~{left} min</strong> left · {cut ? `finish by ${finishBy}` : `${base.openBefore} ${pluralize(base.openBefore, 'set', 'sets')}`}</span>
      <span className="workout-time-line-action">{cut ? 'Change' : 'Short on time?'}</span>
    </button>
  )
}

// Another exercise of the list: its target before it starts, its progress after.
export function CollapsedExercise({ exercise, units, onOpen }: { exercise: WorkoutExercise; units: Units; onOpen: () => void }) {
  const done = exercise.sets.filter((set) => set.done).length
  const finished = done > 0 && done === exercise.sets.length
  return (
    <button type="button" className="workout-list-row" data-finished={finished || undefined} onClick={onOpen}>
      {finished && <Check size={15} aria-hidden="true" />}
      <span className="workout-list-name">{exercise.name}</span>
      <small className="tabular-nums">{done ? `${done} of ${exercise.sets.length} ${pluralize(exercise.sets.length, 'set', 'sets')}` : exerciseTargetLabel(exercise.sets, units)}</small>
      <ChevronDown size={16} aria-hidden="true" />
    </button>
  )
}

// A pair or circuit that is not being done folds into one row; opening it lands on its first open set in round order.
export function CollapsedGroup({ session, indices, onOpen }: { session: ActiveWorkout; indices: number[]; onOpen: (index: number) => void }) {
  const members = indices.map((index) => session.exercises[index]!)
  const rounds = Math.max(...members.map((member) => member.sets.length))
  const doneRounds = Math.min(...members.map((member) => member.sets.filter((set) => set.done).length))
  const next = roundRows(session.exercises, indices).find(({ member, setIndex }) => !session.exercises[member]!.sets[setIndex]!.done)?.member ?? indices[0]!
  const kind = members.length === 2 ? 'Superset' : 'Circuit'
  return (
    <button type="button" className="workout-list-row" aria-label={`${kind}: ${members.map((member) => member.name).join(' and ')}. Open`} onClick={() => onOpen(next)}>
      <span className="workout-list-name"><span className="workout-list-kind">{kind} · </span>{members.map((member) => member.name).join(' + ')}</span>
      <small className="tabular-nums">{doneRounds ? `${doneRounds} of ${rounds}` : rounds} {pluralize(rounds, 'round', 'rounds')}</small>
      <ChevronDown size={16} aria-hidden="true" />
    </button>
  )
}

// A pair or circuit as one block: its members once, then every set in the order it is done, round by round.
export function GroupBlock({ session, indices, currentIndex, panelSet, units, userId, userExercises, metaOf, inlinePanel, hint, drawnSetId, onSelect, onToggle, onRemove, onAddRound }: {
  session: ActiveWorkout
  indices: number[]
  currentIndex: number
  panelSet: number
  units: Units
  userId?: string
  userExercises: ReadonlyMap<string, ExerciseMeta>
  metaOf: (exercise: WorkoutExercise) => string | null
  inlinePanel?: ReactNode
  // The current member's progression hint, as its own ledger would show it.
  hint?: { suggestion: SessionHint; onApply: () => void; onDismiss: () => void } | null
  drawnSetId: string | null
  onSelect: (exerciseIndex: number, setIndex: number) => void
  onToggle: (exerciseIndex: number, setIndex: number) => void
  onRemove: (exerciseIndex: number) => void
  onAddRound: (indices: number[]) => void
}) {
  const members = indices.map((index) => session.exercises[index]!)
  const previous = usePreviousSets(userId, members)
  const rows = roundRows(session.exercises, indices)
  const rounds = Math.max(...members.map((member) => member.sets.length))
  const roles = sessionRoles(session.exercises, userExercises)
  const rest = groupRestSec(indices.map((index) => roles[index] ?? 'compound'), session.compression?.shortRest === true, false)
  const planned = Math.max(...members.map((member) => session.compression?.exercises.find((entry) => entry.exerciseId === member.exerciseId && entry.exerciseSource === member.exerciseSource)?.plannedSets ?? 0))
  const letter = (index: number) => MEMBER_LETTERS[indices.indexOf(index)] ?? '?'
  const kind = members.length === 2 ? 'Superset' : 'Circuit'
  const reducedMotion = useReducedMotion()
  const shownSet = useRef<string | null>(null)
  const currentAt = rows.findIndex(({ member, setIndex }) => member === currentIndex && setIndex === panelSet)
  const hinted = session.exercises[currentIndex]
  // The group scrolls in by itself when it opens; after that the current set is kept between the header and the panel.
  const followCurrent = (id: string) => (node: HTMLDivElement | null) => {
    if (!node || shownSet.current === id) return
    const opened = shownSet.current === null
    shownSet.current = id
    if (!opened) node.scrollIntoView?.({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' })
  }
  const panel = inlinePanel && (
    <motion.div key="set-panel" layout="position" transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}>
      {inlinePanel}
    </motion.div>
  )
  // Rows are keyed by their side of the panel: a row crosses it on remount, so the panel never moves and keeps focus.
  const side = (position: number) => (!panel ? '' : currentAt < 0 || position <= currentAt ? ':before' : ':after')
  const items: ReactNode[] = []
  rows.forEach(({ round, member, setIndex }, position) => {
    const exercise = session.exercises[member]!
    const set = exercise.sets[setIndex]!
    const current = position === currentAt
    const last = formatPreviousSet(previous[indices.indexOf(member)]?.[setIndex], units)
    const label = `${round + 1}${letter(member)}`
    const roundEnd = rows[position + 1] !== undefined && rows[position + 1]!.round !== round
    const id = set.clientId ?? label
    items.push(
      <div key={`${id}${side(position)}`} ref={current ? followCurrent(id) : undefined} className="workout-set-row" data-done={set.done || undefined} data-current={current || undefined}>
        <button type="button" className="workout-set-toggle" onClick={() => onToggle(member, setIndex)}
          aria-label={`${set.done ? 'Unmark' : 'Mark'} set ${label} for ${exercise.name}`}>
          {set.done ? <Check size={16} aria-hidden="true" data-drawn={drawnSetId === set.clientId || undefined} /> : label}
        </button>
        <button
          type="button"
          className="workout-set-values tabular-nums"
          onClick={() => onSelect(member, setIndex)}
          aria-pressed={current}
          aria-label={`${label}, ${exercise.name}: last ${last}, today ${setPairLabel(set, units)}${set.done ? ', logged' : ''}`}
        >
          <span className="workout-set-previous">{last}</span>
          <span className="workout-set-today">{setPairLabel(set, units)}</span>
        </button>
      </div>,
    )
    if (current && panel) items.push(panel)
    if (roundEnd && rest > 0) items.push(<p key={`rest-${round}${side(position + 1)}`} className="workout-round-rest" aria-hidden="true"><span>rest {clock(rest)}</span></p>)
  })
  if (currentAt < 0 && panel) items.push(panel)

  return (
    <section className="workout-group" aria-label={`${kind}, ${rounds} ${pluralize(rounds, 'round', 'rounds')}`}>
      <p className="workout-group-title"><strong>{kind}</strong> · {rounds} {pluralize(rounds, 'round', 'rounds')}</p>
      {members.map((member, position) => {
        const meta = metaOf(member)
        return (
          <div key={member.clientId ?? position} className="workout-group-member">
            <span className="workout-group-letter">{MEMBER_LETTERS[position]}</span>
            <span className="min-w-0 flex-1">
              <span className="workout-group-name">{member.name}</span>
              {meta && <small>{meta}</small>}
            </span>
            <button type="button" className="workout-exercise-more" onClick={() => onRemove(indices[position]!)} aria-label={`More for ${member.name}`}>
              <Ellipsis size={18} aria-hidden="true" />
            </button>
          </div>
        )
      })}
      {hint && hinted && hinted.sets.some((set) => !set.done) && (
        <OverloadHint hint={{ ...hint.suggestion, label: `${letter(currentIndex)} · ${hinted.name}: ${hint.suggestion.label}` }} onApply={hint.onApply} onDismiss={hint.onDismiss} />
      )}
      <div className="workout-set-header" aria-hidden="true">
        <span>Set</span>
        <span>Last</span>
        <span>Today</span>
        <span />
      </div>
      <div className="workout-set-list">{items}</div>
      {planned > rounds && (
        <p className="workout-group-cut tabular-nums">
          {Array.from({ length: planned - rounds }, (_, extra) => indices.map((index) => `${rounds + extra + 1}${letter(index)}`).join(' ')).join(' · ')} · cut today · was {planned} {pluralize(planned, 'round', 'rounds')}
        </p>
      )}
      <button type="button" className="workout-add-set" onClick={() => onAddRound(indices)}>
        <span className="inline-flex items-center justify-center gap-2"><Plus size={15} strokeWidth={2.4} />Add round</span>
      </button>
    </section>
  )
}
