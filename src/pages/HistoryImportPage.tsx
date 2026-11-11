import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileUp } from 'lucide-react'
import ExercisePicker from '../components/ExercisePicker'
import CreateExerciseForm from '../components/CreateExerciseForm'
import { useUserExercises } from '../hooks/useUserExercises'
import { callAuthedApi } from '../lib/authedApi'
import { pluralize } from '../lib/pluralize'
import { createUserExercise } from '../lib/userExercisesService'
import { getWorkoutHistory, materializeWorkout } from '../lib/workoutService'
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
  | { kind: 'reading' }
  | { kind: 'importing'; done: number; total: number }
  | { kind: 'failed'; message: string }
  | { kind: 'done'; pending: number }
  | { kind: 'undoing'; done: number; total: number }
  | { kind: 'undoFailed'; left: number }
  | { kind: 'undone' }

interface ImportResponse { results: { key: string; workoutId: string; status: 'created' | 'exists' | 'projection_pending' }[] }

const dateLabel = (workout: ImportWorkout) => new Date(startedAtOf(workout)).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

// Sheets saved by Polish Excel are Windows-1250, not UTF-8.
async function fileText(picked: File): Promise<string> {
  const bytes = await picked.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1250').decode(bytes)
  }
}

export default function HistoryImportPage() {
  const { user } = useAuthStore()
  const units = useProfileStore((store) => store.profile?.units)
  const { state: userExercisesState, retry: retryUserExercises, updateExercises } = useUserExercises(user?.uid ?? null)
  const [file, setFile] = useState<{ name: string; history: ParsedHistory; existingDays: Set<string> } | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [mapping, setMapping] = useState<Record<string, ExerciseRef | null>>({})
  const [choices, setChoices] = useState<Record<string, Choice>>({})
  const [resolving, setResolving] = useState<{ name: string; mode: 'choose' | 'create' } | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'review' })
  // One run keeps its id, so Try again after a failure adds nothing twice; a new file starts a new run.
  const [importId, setImportId] = useState(() => crypto.randomUUID())
  // Every workout this run created or found, across attempts: Undo removes all of them.
  const [runIds, setRunIds] = useState<string[]>([])
  const inputId = useId()

  // Own exercises decide which names match, so a failed load stops the page instead of looking like none.
  const ready = userExercisesState.status === 'success' && Boolean(units)
  const ownExercises = userExercisesState.status === 'success'
    ? userExercisesState.data.map((exercise) => ({ exerciseId: exercise.id, exerciseSource: 'user' as const, name: exercise.name, muscles: exercise.muscles }))
    : []
  // Once a batch went out, the choices are what the server already holds; a new file starts over.
  const locked = runIds.length > 0 || phase.kind === 'importing' || phase.kind === 'undoing'

  async function readFile(picked: File) {
    if (!user || !units) return
    setPhase({ kind: 'reading' })
    try {
      const result = readHistoryCsv(await fileText(picked), units)
      if (!result.ok) { setFile(null); setFileError(result.error); setPhase({ kind: 'review' }); return }
      // Read now, not on page load, so workouts imported a moment ago count as already in SHEAR.
      const { workouts } = await getWorkoutHistory(user.uid, 250, 20_000)
      const existingDays = new Set(workouts.map((workout) => localDay(workout.startedAt)))
      const names = historyNames(result.history, ownExercises)
      setFileError(null)
      setFile({ name: picked.name, history: result.history, existingDays })
      setMapping(Object.fromEntries(names.map((entry) => [entry.name, entry.match.status === 'matched' ? entry.match.exercise : null])))
      setChoices(Object.fromEntries(result.history.workouts.map((workout) => [workout.key, { include: !existingDays.has(localDay(startedAtOf(workout))), withChecks: false }])))
      setImportId(crypto.randomUUID())
      setRunIds([])
    } catch {
      setFileError('Could not read your workouts in SHEAR, so days already there cannot be found. Check your connection and choose the file again.')
    }
    setPhase({ kind: 'review' })
  }

  // Names the file left open come first, then the most used; the order does not move as the user chooses.
  const names = (file ? historyNames(file.history, ownExercises) : []).sort((a, b) => Number(a.match.status === 'matched') - Number(b.match.status === 'matched') || b.sets - a.sets)
  const open = names.filter((entry) => !mapping[entry.name]).length
  const requests = file ? importRequestWorkouts(file.history, (name) => mapping[name] ?? null, (workout) => choices[workout.key] ?? { include: false, withChecks: false }) : []
  const setCount = requests.reduce((sum, workout) => sum + workout.exercises.reduce((total, exercise) => total + exercise.sets.length, 0), 0)

  async function runImport() {
    if (!user || phase.kind === 'importing') return
    setPhase({ kind: 'importing', done: 0, total: requests.length })
    const ids = new Set(runIds)
    const pending: string[] = []
    for (let start = 0; start < requests.length; start += BATCH) {
      try {
        const response = await callAuthedApi<ImportResponse>('/api/import-workouts', { importId, workouts: requests.slice(start, start + BATCH) }, user.uid)
        for (const result of response.results) {
          ids.add(result.workoutId)
          if (result.status === 'projection_pending') pending.push(result.workoutId)
        }
      } catch (error) {
        setRunIds([...ids])
        setPhase({ kind: 'failed', message: error instanceof Error ? error.message : 'The import stopped.' })
        return
      }
      setRunIds([...ids])
      setPhase({ kind: 'importing', done: Math.min(start + BATCH, requests.length), total: requests.length })
    }
    // Pending projections of old workouts are not picked up by the retry on recent workouts, so they finish here.
    let stillPending = 0
    for (const id of pending) await materializeWorkout(id).catch(() => { stillPending += 1 })
    setPhase({ kind: 'done', pending: stillPending })
    window.scrollTo({ top: 0 })
  }

  // Straight to the endpoint: one delete left pending must not block the others, as the editor's recovery would.
  async function undo() {
    if (!user) return
    const left = [...runIds]
    for (const [index, id] of runIds.entries()) {
      setPhase({ kind: 'undoing', done: index, total: runIds.length })
      const status = await callAuthedApi<{ status?: string }>('/api/delete-workout', { workoutId: id }, user.uid)
        .then((result) => result.status)
        .catch(() => 'failed')
      if (status === 'deleted') left.splice(left.indexOf(id), 1)
    }
    setRunIds(left)
    setPhase(left.length ? { kind: 'undoFailed', left: left.length } : { kind: 'undone' })
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
  const busy = phase.kind === 'importing' || phase.kind === 'undoing' || phase.kind === 'reading'

  return (
    <div className="workbench-page history-import-page">
      <section className="planner-header plans-header">
        <div className="plans-header-title"><h1>Import history</h1></div>
      </section>

      {(phase.kind === 'done' || phase.kind === 'undone' || phase.kind === 'undoing' || phase.kind === 'undoFailed') ? (
        <section className="history-import-result" aria-live="polite">
          {phase.kind === 'done' && <>
            <h2>{runIds.length} {pluralize(runIds.length, 'workout', 'workouts')} imported</h2>
            <p>{phase.pending
              ? `History has them all. ${phase.pending} ${pluralize(phase.pending, 'is', 'are')} not in Progress and records yet: open ${pluralize(phase.pending, 'it', 'them')} in History to sync.`
              : 'History, Progress and your records now include them.'}</p>
            <div className="history-import-actions">
              <Link to="/history" className="planner-primary-action">View history</Link>
              <button type="button" className="planner-secondary-action" onClick={() => { void undo() }}>Undo import</button>
            </div>
          </>}
          {phase.kind === 'undoFailed' && <>
            <h2>Undo stopped</h2>
            <p>{phase.left} imported {pluralize(phase.left, 'workout is', 'workouts are')} still in History.</p>
            <div className="history-import-actions">
              <button type="button" className="planner-primary-action" onClick={() => { void undo() }}>Try undo again</button>
              <Link to="/history" className="planner-secondary-action">View history</Link>
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
            {userExercisesState.status === 'error' ? (
              <div className="planner-status" role="alert">
                <p>Could not load your own exercises, so names from the file cannot be matched to them.</p>
                <button type="button" className="planner-secondary-action" onClick={retryUserExercises}>Try again</button>
              </div>
            ) : (
              <label htmlFor={inputId} className={`${file ? 'planner-secondary-action' : 'planner-primary-action'} history-import-file`} aria-disabled={!ready || busy || undefined}>
                <FileUp size={16} aria-hidden="true" />
                {!ready ? 'Loading your exercises…' : phase.kind === 'reading' ? 'Reading the file…' : file ? `Choose another file · ${file.name}` : 'Choose a CSV file'}
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
                        <button type="button" className={chosen ? 'template-exercise-create' : 'planner-secondary-action'} disabled={locked} onClick={() => setResolving({ name: entry.name, mode: 'choose' })}>{chosen ? 'Change' : 'Choose exercise'}</button>
                        {!chosen && <button type="button" className="template-exercise-create" disabled={locked} onClick={() => setResolving({ name: entry.name, mode: 'create' })}>Create “{entry.name}”</button>}
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
                  const duplicate = file.existingDays.has(localDay(startedAtOf(workout)))
                  const set = (next: Partial<Choice>) => setChoices((current) => ({ ...current, [workout.key]: { ...choice, ...next } }))
                  return (
                    <li key={workout.key} className="history-import-row">
                      <label className="history-import-workout">
                        <input type="checkbox" checked={choice.include} disabled={locked} onChange={(event) => set({ include: event.target.checked })} />
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
                          <input type="checkbox" checked={choice.withChecks} disabled={locked || !choice.include} onChange={(event) => set({ withChecks: event.target.checked })} />
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
