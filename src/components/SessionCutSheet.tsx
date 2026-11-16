import { useEffect, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import BottomSheet from './BottomSheet'
import type { ActiveWorkout } from '../store/workoutStore'
import type { ExerciseMeta } from '../shared/nextSessionRecommendation'
import { planCut, type CutChoice, type CutPlan } from '../shared/sessionCut'
import { pluralize } from '../lib/pluralize'

const LEFT = [30, 20, 15, 10] as const
const STEP_MS = 5 * 60_000
const minutes = (sec: number) => Math.round(sec / 60)
const clockLabel = (at: number) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

type Pick = { kind: 'left'; min: number } | { kind: 'clock'; at: number } | null

// „Short on time”: the time left, a preview of the rest and one tap that cuts it (Specyfikacja — skrócenie w trakcie sesji).
export default function SessionCutSheet({ session, userExercises, disabled, onCut, onFinish, onClose }: {
  session: ActiveWorkout
  userExercises: ReadonlyMap<string, ExerciseMeta>
  disabled: boolean
  onCut: (choice: CutChoice, now: number) => void
  onFinish: () => void
  onClose: () => void
}) {
  const [now, setNow] = useState(() => Date.now())
  const [pick, setPick] = useState<Pick>(null)
  const [straight, setStraight] = useState(false)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(timer)
  }, [])

  const choiceAt = (time: number): CutChoice => ({
    leftMin: pick === null ? null : pick.kind === 'left' ? pick.min : Math.max(0, Math.floor((pick.at - time) / 60_000)),
    clock: pick?.kind === 'clock',
    straight,
  })
  const base = planCut(session, { leftMin: null, clock: false, straight: false }, now, userExercises)
  const remaining = minutes(base.result.fullEstimateSec)
  const choice = choiceAt(now)
  const passed = choice.leftMin !== null && choice.leftMin < 1
  const plan = choice.leftMin !== null && !passed ? planCut(session, choice, now, userExercises) : null
  const shorter = LEFT.filter((left) => left < remaining)
  const defaultClock = Math.floor((now + base.result.fullEstimateSec * 1000) / STEP_MS) * STEP_MS
  const clockAt = pick?.kind === 'clock' ? pick.at : defaultClock
  const grouped = plan?.groups.some((group, index) => group && group !== session.exercises[index]?.group) ?? false

  const apply = () => {
    const time = Date.now()
    // A finish time that ran out since the preview would cut every open set; show that instead.
    if (choiceAt(time).leftMin! < 1) { setNow(time); return }
    onCut(choiceAt(time), time)
    onClose()
  }

  return (
    <BottomSheet
      title="Short on time"
      description={<span className="tabular-nums">~{remaining} min of work left · {base.openBefore} {pluralize(base.openBefore, 'set', 'sets')}</span>}
      onClose={onClose}
    >
      <div className="session-cut">
        {passed ? (
          <p className="train-dock-line" role="status">That time has passed.</p>
        ) : plan && !plan.changed && plan.result.fits ? (
          <p className="train-dock-line" role="status"><strong>You have time.</strong> The rest takes ~{minutes(plan.result.estimateSec)} min.</p>
        ) : plan && plan.openAfter === 0 ? (
          <p className="train-dock-line" role="status"><strong>Nothing more fits.</strong> Finish here.</p>
        ) : plan && !plan.result.fits ? (
          <p className="train-dock-line" role="status">
            <strong>Doesn’t fit in {choice.leftMin} min.</strong> The shortest finish takes ~{minutes(plan.result.estimateSec)} min.
          </p>
        ) : plan ? (
          <p className="train-dock-line" role="status">
            <strong>~{minutes(plan.result.estimateSec)} min</strong>{' · '}{plan.openAfter} of {plan.openBefore} sets left{' · '}Same weights
          </p>
        ) : null}

        {plan?.changed && plan.openAfter > 0 && <CutPreview session={session} plan={plan} />}

        {plan?.changed && (grouped || straight) && (
          <label className="train-time-switch">
            <span>Without supersets</span>
            <input type="checkbox" role="switch" checked={straight} onChange={(event) => setStraight(event.target.checked)} />
          </label>
        )}

        <div className="train-dock-time" role="radiogroup" aria-label="Time left">
          {shorter.map((left) => (
            <button key={left} type="button" role="radio" aria-checked={pick?.kind === 'left' && pick.min === left} onClick={() => setPick({ kind: 'left', min: left })}>
              {left} min
            </button>
          ))}
        </div>
        <div className="session-cut-clock" data-active={pick?.kind === 'clock' || undefined}>
          <span>Finish by</span>
          <button type="button" aria-label="Five minutes earlier" onClick={() => setPick({ kind: 'clock', at: clockAt - STEP_MS })}>
            <Minus size={16} aria-hidden="true" />
          </button>
          <button type="button" className="tabular-nums" aria-pressed={pick?.kind === 'clock'} onClick={() => setPick({ kind: 'clock', at: clockAt })}>
            {clockLabel(clockAt)}
          </button>
          <button type="button" aria-label="Five minutes later" onClick={() => setPick({ kind: 'clock', at: clockAt + STEP_MS })}>
            <Plus size={16} aria-hidden="true" />
          </button>
        </div>
        {/* The time controls and the button stay put under the thumb; what changes grows above them. */}
        <div className="train-dock-actions">
          {plan && !plan.result.fits && plan.openAfter > 0 && (
            <button type="button" className="workout-set-panel-action" data-quiet disabled={disabled} onClick={() => { onClose(); onFinish() }}>Finish</button>
          )}
          <button type="button" className="workout-set-panel-action" onClick={apply} disabled={disabled || !plan?.changed}>
            {plan?.changed && plan.openAfter === 0 ? 'End here' : 'Shorten the rest'}
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}

// What stays, in session order with pairs and circuits together, then what goes.
function CutPreview({ session, plan }: { session: ActiveWorkout; plan: CutPlan }) {
  const open = (index: number) => plan.after[index]! - plan.done[index]!
  const seen = new Set<string>()
  const rows: React.ReactNode[] = []
  session.exercises.forEach((_, index) => {
    if (open(index) <= 0) return
    const group = plan.groups[index]
    const row = (at: number) => (
      <div key={at} className="train-exercise">
        <span>{session.exercises[at]!.name}</span>
        <span>{open(at)} {pluralize(open(at), 'set', 'sets')}</span>
      </div>
    )
    if (!group) { rows.push(row(index)); return }
    if (seen.has(group)) return
    seen.add(group)
    const members = session.exercises.flatMap((_, at) => (plan.groups[at] === group && open(at) > 0 ? [at] : []))
    if (members.length < 2) { rows.push(row(index)); return }
    const rounds = Math.max(...members.map(open))
    const kind = members.length === 2 ? 'Superset' : 'Circuit'
    rows.push(
      <div key={group} className="train-group" role="group" aria-label={`${kind}, ${rounds} ${rounds === 1 ? 'round' : 'rounds'}`}>
        <p aria-hidden="true">{kind} · {rounds} {rounds === 1 ? 'round' : 'rounds'}</p>
        {members.map(row)}
      </div>,
    )
  })
  const skipped = session.exercises.flatMap((exercise, index) => (open(index) <= 0 && plan.before[index]! > plan.done[index]! ? [{ exercise, index }] : []))
  return (
    <div className="train-exercises session-cut-list">
      {rows}
      {skipped.map(({ exercise, index }) => (
        <div key={`skipped:${index}`} className="train-exercise train-exercise--skipped">
          <span>{exercise.name}</span>
          <span>Skipped today</span>
        </div>
      ))}
    </div>
  )
}
