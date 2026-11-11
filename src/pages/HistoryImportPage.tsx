import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileUp } from 'lucide-react'
import ExercisePicker from '../components/ExercisePicker'
import CreateExerciseForm from '../components/CreateExerciseForm'
import { useUserExercises } from '../hooks/useUserExercises'
import { callAuthedApi } from '../lib/authedApi'
import { pluralize } from '../lib/pluralize'
import { createUserExercise } from '../lib/userExercisesService'
import { deleteWorkout, getWorkoutHistory } from '../lib/workoutService'
import type { ExerciseRef } from '../shared/exerciseMatch'
import { historyNames, importRequestWorkouts, localDay, readHistoryCsv, startedAtOf, type ImportWorkout, type ParsedHistory } from '../shared/historyCsv'
import { useAuthStore } from '../store/authStore'
import { useProfileStore } from '../store/profileStore'
import type { UserExerciseInput } from '../lib/userExercisesService'

// A run sends this many workouts per request; the server limit is 10.
const BATCH = 10
const SKIP_LABELS = { notDone: 'Not done', unread: 'Could not be read', tooMany: 'More sets or exercises than a workout holds' }

type Choice = { include: boolean; withChecks: boolean }
type Phase =
  | { kind: 'review' }
  | { kind: 'importing'; done: number; total: number }
  | { kind: 'failed'; message: string }
  | { kind: 'done'; workoutIds: string[]; pending: number }
  | { kind: 'undoing'; done: number; total: number }
  | { kind: 'undone' }

interface ImportResponse { results: { key: string; workoutId: string; status: 'created' | 'exists' | 'projection_pending' }[] }

const dateLabel = (workout: ImportWorkout) => new Date(startedAtOf(workout)).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

export default function HistoryImportPage() {
  const { user } = useAuthStore()
  const units = useProfileStore((store) => store.profile?.units)
  const { state: userExercisesState, retry: retryUserExercises, updateExercises } = useUserExercises(user?.uid ?? null)
  const [existingDays, setExistingDays] = useState<{ status: 'loading' } | { status: 'error' } | { status: 'ready'; days: Set<string> }>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [file, setFile] = useState<{ name: string; history: ParsedHistory } | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [mapping, setMapping] = useState<Record<string, ExerciseRef | null>>({})
  const [choices, setChoices] = useState<Record<string, Choice>>({})
  const [resolving, setResolving] = useState<{ name: string; mode: 'choose' | 'create' } | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'review' })
  // One run keeps its id, so Retry after a failure adds nothing twice; a new file starts a new run.
  const [importId, setImportId] = useState(() => crypto.randomUUID())
  const inputId = useId()

  useEffect(() => {
    if (!user) return
    let cancelled = false
    getWorkoutHistory(user.uid, 250, 20_000)
      .then(({ workouts }) => { if (!cancelled) setExistingDays({ status: 'ready', days: new Set(workouts.map((workout) => localDay(workout.startedAt))) }) })
      .catch(() => { if (!cancelled) setExistingDays({ status: 'error' }) })
    return () => { cancelled = true }
  }, [user, attempt])

  const ready = existingDays.status === 'ready' && userExercisesState.status !== 'loading' && Boolean(units)
  const ownExercises = userExercisesState.status === 'success'
    ? userExercisesState.data.map((exercise) => ({ exerciseId: exercise.id, exerciseSource: 'user' as const, name: exercise.name, muscles: exercise.muscles }))
    : []

  async function readFile(picked: File) {
    if (existingDays.status !== 'ready' || !units) return
    const result = readHistoryCsv(await picked.text(), units)
    if (!result.ok) { setFile(null); setFileError(result.error); return }
    const names = historyNames(result.history, ownExercises)
    setFileError(null)
    setFile({ name: picked.name, history: result.history })
    setMapping(Object.fromEntries(names.map((entry) => [entry.name, entry.match.status === 'matched' ? entry.match.exercise : null])))
    setChoices(Object.fromEntries(result.history.workouts.map((workout) => [workout.key, { include: !existingDays.days.has(localDay(startedAtOf(workout))), withChecks: false }])))
    setImportId(crypto.randomUUID())
    setPhase({ kind: 'review' })
  }

  // Names the file left open come first, then the most used; the order does not move as the user chooses.
  const names = (file ? historyNames(file.history, ownExercises) : []).sort((a, b) => Number(a.match.status === 'matched') - Number(b.match.status === 'matched') || b.sets - a.sets)
  const open = names.filter((entry) => !mapping[entry.name]).length
  const requests = file ? importRequestWorkouts(file.history, (name) => mapping[name] ?? null, (workout) => choices[workout.key] ?? { include: false, withChecks: false }) : []
  const setCount = requests.reduce((sum, workout) => sum + workout.exercises.reduce((total, exercise) => total + exercise.sets.length, 0), 0)

  async function runImport() {
    if (!user) return
    setPhase({ kind: 'importing', done: 0, total: requests.length })
    const workoutIds: string[] = []
    let pending = 0
    for (let start = 0; start < requests.length; start += BATCH) {
      try {
        const response = await callAuthedApi<ImportResponse>('/api/import-workouts', { importId, workouts: requests.slice(start, start + BATCH) }, user.uid)
        for (const result of response.results) {
          workoutIds.push(result.workoutId)
          if (result.status === 'projection_pending') pending += 1
        }
      } catch (error) {
        setPhase({ kind: 'failed', message: error instanceof Error ? error.message : 'The import stopped.' })
        return
      }
      setPhase({ kind: 'importing', done: Math.min(start + BATCH, requests.length), total: requests.length })
    }
    setPhase({ kind: 'done', workoutIds, pending })
    window.scrollTo({ top: 0 })
  }

  async function undo(workoutIds: string[]) {
    for (const [index, id] of workoutIds.entries()) {
      setPhase({ kind: 'undoing', done: index, total: workoutIds.length })
      const result = await deleteWorkout(id).catch(() => ({ status: 'unknown' as const }))
      if (result.status === 'unknown') {
        setPhase({ kind: 'failed', message: 'Undo stopped. Some imported workouts are still in History; delete them there or try again.' })
        return
      }
    }
    setPhase({ kind: 'undone' })
  }

  async function createForName(input: UserExerciseInput) {
    if (!user || !resolving) return
    const operationUid = user.uid
    const name = resolving.name
    const created = await createUserExercise(operationUid, input)
    if (useAuthStore.getState().user?.uid !== operationUid) return
    updateExercises(operationUid, (current) => [created, ...current])
    setMapping((current) => ({ ...current, [name]: { exerciseId: created.id, exerciseSource: 'user', name: created.name } }))
    setResolving(null)
  }

  const resolvingName = names.find((entry) => entry.name === resolving?.name)
  const busy = phase.kind === 'importing' || phase.kind === 'undoing'

  return (
    <div className="workbench-page history-import-page">
      <section className="planner-header plans-header">
        <div className="plans-header-title"><h1>Import history</h1></div>
      </section>

      {(phase.kind === 'done' || phase.kind === 'undone' || phase.kind === 'undoing') ? (
        <section className="history-import-result" aria-live="polite">
          {phase.kind === 'done' && <>
            <h2>{phase.workoutIds.length} {pluralize(phase.workoutIds.length, 'workout', 'workouts')} imported</h2>
            <p>{phase.pending ? `${phase.pending} still syncing to Progress; they finish on their own.` : 'History, Progress and your records now include them.'}</p>
            <div className="history-import-actions">
              <Link to="/history" className="planner-primary-action">View history</Link>
              <button type="button" className="planner-secondary-action" onClick={() => { void undo(phase.workoutIds) }}>Undo import</button>
            </div>
          </>}
          {phase.kind === 'undoing' && <p>Removing imported workouts… {phase.done} of {phase.total}</p>}
          {phase.kind === 'undone' && <>
            <h2>Import undone</h2>
            <p>The imported workouts were removed.</p>
            <div className="history-import-actions"><Link to="/history" className="planner-primary-action">View history</Link></div>
          </>}
        </section>
      ) : (
        <>
          <section className="history-import-pick">
            <p className="history-import-help">One row per set with a date, the exercise, reps and weight. Columns are found by their names in English or Polish, so a sheet from Notion or another app works as it is.</p>
            {existingDays.status === 'error' ? (
              <div className="planner-status" role="alert">
                <p>Could not read your workouts, so days already in SHEAR cannot be found.</p>
                <button type="button" className="planner-secondary-action" onClick={() => { setExistingDays({ status: 'loading' }); setAttempt((value) => value + 1) }}>Try again</button>
              </div>
            ) : (
              <label htmlFor={inputId} className={`${file ? 'planner-secondary-action' : 'planner-primary-action'} history-import-file`} aria-disabled={!ready || busy || undefined}>
                <FileUp size={16} aria-hidden="true" />
                {!ready ? 'Loading your workouts…' : file ? `Choose another file · ${file.name}` : 'Choose a CSV file'}
                <input id={inputId} type="file" accept=".csv,text/csv,text/plain" className="sr-only" disabled={!ready || busy}
                  onChange={(event) => { const picked = event.target.files?.[0]; event.target.value = ''; if (picked) void readFile(picked) }} />
              </label>
            )}
            {fileError && <p className="history-import-error" role="alert">{fileError}</p>}
          </section>

          {file && <>
            <section className="history-import-section" aria-labelledby="history-import-names">
              <h2 id="history-import-names">Exercises</h2>
              <p className="history-import-help">Each name from the file once. The exercise you pick here is used for all its sets.</p>
              <ul className="history-import-list">
                {names.map((entry) => {
                  const chosen = mapping[entry.name]
                  return (
                    <li key={entry.name} className="history-import-row">
                      <div className="min-w-0">
                        <p className="history-import-name">{entry.name}</p>
                        <p className="template-exercise-detail">
                          {entry.sets} {pluralize(entry.sets, 'set', 'sets')} · {chosen ? <>as <strong>{chosen.name}</strong></> : <strong>{entry.match.status === 'generic' ? 'Which exercise?' : 'Not in the library'}</strong>}
                        </p>
                      </div>
                      <div className="history-import-row-actions">
                        <button type="button" className={chosen ? 'template-exercise-create' : 'planner-secondary-action'} disabled={busy} onClick={() => setResolving({ name: entry.name, mode: 'choose' })}>{chosen ? 'Change' : 'Choose exercise'}</button>
                        {!chosen && <button type="button" className="template-exercise-create" disabled={busy} onClick={() => setResolving({ name: entry.name, mode: 'create' })}>Create “{entry.name}”</button>}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>

            <section className="history-import-section" aria-labelledby="history-import-workouts">
              <h2 id="history-import-workouts">Workouts</h2>
              <ul className="history-import-list">
                {file.history.workouts.map((workout) => {
                  const choice = choices[workout.key] ?? { include: false, withChecks: false }
                  const sets = workout.exercises.flatMap((exercise) => exercise.sets)
                  const checks = sets.filter((set) => set.check).length
                  const duplicate = existingDays.status === 'ready' && existingDays.days.has(localDay(startedAtOf(workout)))
                  const set = (next: Partial<Choice>) => setChoices((current) => ({ ...current, [workout.key]: { ...choice, ...next } }))
                  return (
                    <li key={workout.key} className="history-import-row">
                      <label className="history-import-workout">
                        <input type="checkbox" checked={choice.include} disabled={busy} onChange={(event) => set({ include: event.target.checked })} />
                        <span className="min-w-0">
                          <span className="history-import-name">{dateLabel(workout)}{workout.label ? ` · ${workout.label}` : ''}</span>
                          <span className="template-exercise-detail">
                            {duplicate && <strong>Already in SHEAR · </strong>}
                            {workout.exercises.length} {pluralize(workout.exercises.length, 'exercise', 'exercises')} · {sets.length - (choice.withChecks ? 0 : checks)} {pluralize(sets.length, 'set', 'sets')}
                          </span>
                        </span>
                      </label>
                      {checks > 0 && (
                        <label className="history-import-check">
                          <input type="checkbox" checked={choice.withChecks} disabled={busy || !choice.include} onChange={(event) => set({ withChecks: event.target.checked })} />
                          <span><strong>Check</strong> {checks} {pluralize(checks, 'set', 'sets')} marked to verify in the file</span>
                        </label>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>

            {file.history.skipped.length > 0 && (
              <details className="history-import-section">
                <summary>{file.history.skipped.length} {pluralize(file.history.skipped.length, 'row was', 'rows were')} not imported</summary>
                <ul className="history-import-skipped">
                  {file.history.skipped.map((entry) => (
                    <li key={entry.line}><span>Line {entry.line}</span> {SKIP_LABELS[entry.reason]} · <code>{entry.source}</code></li>
                  ))}
                </ul>
              </details>
            )}

            <div className="history-import-submit">
              <p className="history-import-hint" aria-live="polite">
                {phase.kind === 'importing' ? `Importing… ${phase.done} of ${phase.total} workouts`
                  : phase.kind === 'failed' ? phase.message
                    : open ? `Choose ${open} ${pluralize(open, 'exercise', 'exercises')} to import`
                      : `${requests.length} ${pluralize(requests.length, 'workout', 'workouts')} · ${setCount} ${pluralize(setCount, 'set', 'sets')}`}
              </p>
              <button type="button" className="planner-primary-action" disabled={busy || open > 0 || requests.length === 0} onClick={() => { void runImport() }}>
                {phase.kind === 'failed' ? 'Try again' : `Import ${requests.length} ${pluralize(requests.length, 'workout', 'workouts')}`}
              </button>
            </div>
          </>}
        </>
      )}

      <ExercisePicker
        open={resolving?.mode === 'choose' && Boolean(resolvingName)}
        title={resolvingName ? `Choose for “${resolvingName.name}”` : undefined}
        suggestions={resolvingName && resolvingName.match.status !== 'matched' ? resolvingName.match.suggestions : undefined}
        userExercisesState={userExercisesState}
        onRetryUserExercises={retryUserExercises}
        onClose={() => setResolving(null)}
        onSelect={(exerciseId, exerciseName, source) => {
          if (resolving) setMapping((current) => ({ ...current, [resolving.name]: { exerciseId, exerciseSource: source, name: exerciseName } }))
          setResolving(null)
        }}
      />
      {resolving?.mode === 'create' && (
        <CreateExerciseForm
          mode="create"
          initialValue={{ name: resolving.name, category: 'chest', equipment: 'barbell', muscles: [] }}
          onSubmit={createForName}
          onClose={() => setResolving(null)}
        />
      )}
    </div>
  )
}
