# Canonical Workout Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `activeSessions/{uid}` the canonical, revision-fenced source for workout finalization while preserving idempotent retries and a temporary legacy-client compatibility window.

**Architecture:** Every active-session write receives a browser-generated `sessionRevision`. Finish first writes a frozen snapshot, then sends only its `sessionId` and revision. The Admin SDK transaction validates the fence, derives and validates the finished workout from the active document, writes workout/tombstone atomically, and retains the existing projection workflow.

**Tech Stack:** React 19, TypeScript, Zustand, Firebase Web SDK, Firebase Admin SDK, Firestore rules/emulators, Vercel Node.js Functions, Vitest, Playwright.

## Global Constraints

- `activeSessions/{uid}` is the only canonical content source for finalization.
- New clients send only `{ sessionId, sessionRevision }` to `/api/finalize-workout`.
- Compatibility API may parse legacy fields but must ignore their values.
- Only completed sets (`done === true`) enter workout history.
- Empty sessions are discarded, not finalized.
- Keep deterministic workout IDs, tombstones, projection fences, acknowledgement-loss recovery, and `exerciseSource` intact.
- Do not add dependencies or move Admin SDK handlers to Edge runtime.
- Phase A is backward compatible; Phase B enforcement happens only after Phase A API and SPA are confirmed live.

## File Map

- `api/_lib/workoutValidation.ts`: request parsing and active-draft-to-finished-workout normalization.
- `api/_lib/workoutClosure.ts`: canonical transaction, revision fence, tombstone, and projection input.
- `api/finalize-workout.ts`: compatibility request boundary.
- `src/lib/activeSessionService.ts`: fresh revision generation on every active-session write.
- `src/hooks/useActiveSession.ts`: frozen-snapshot preparation and recoverable stale-session sync behavior.
- `src/lib/workoutClosureService.ts`: minimal fenced finalize request.
- `src/lib/workoutLifecycle.ts`: confirmed/ambiguous closure ordering with an explicit finish request.
- `src/pages/WorkoutPage.tsx`: finish preparation, revision-conflict feedback, and empty-session discard.
- `src/lib/activeSessionSyncPolicy.ts`: classification of `active_session_changed`.
- `firestore.rules`: optional revision in Phase A, required revision in Phase B.
- Existing unit, integration, rules, and E2E files listed per task provide regression coverage.

---

### Task 1: Parse the compatibility request and normalize canonical active drafts

**Files:**
- Modify: `api/_lib/workoutValidation.ts`
- Test: `api/_lib/__tests__/workoutValidation.test.ts`

**Interfaces:**
- Produces: `FinalizeWorkoutRequest`, `parseFinalizeWorkoutRequest(raw, options?)`, and `buildFinishedWorkoutFromActiveSession(raw, finishedAt)`.
- Consumes: existing field validators and `normalizeWorkoutExercises` in the same module.

- [ ] **Step 1: Replace finalize-body expectations with compatibility request tests**

Add tests that prove legacy contents are ignored and the fence can be required:

```ts
const legacyFinalizeBody = {
  sessionId: 'session-1',
  sessionRevision: '00000000-0000-4000-8000-000000000001',
  templateId: 'attacker-template',
  startedAt: 1,
  finishedAt: 2,
  label: 'Client value must be ignored',
  exercises: [validExercise],
}

it('returns only the closure identity from a compatibility request', () => {
  expect(parseFinalizeWorkoutRequest(legacyFinalizeBody)).toEqual({
    sessionId: 'session-1',
    sessionRevision: '00000000-0000-4000-8000-000000000001',
  })
})

it('accepts an unfenced legacy request only in compatibility mode', () => {
  expect(parseFinalizeWorkoutRequest({ sessionId: 'session-1', ...legacyFinalizeBody, sessionRevision: undefined }))
    .toEqual({ sessionId: 'session-1' })
  expect(() => parseFinalizeWorkoutRequest({ sessionId: 'session-1' }, { requireRevision: true }))
    .toThrow('Brak pola sessionRevision.')
})
```

Add canonical-draft tests:

```ts
const activeDraft = {
  userId: 'user-1',
  sessionId: 'session-1',
  sessionRevision: '00000000-0000-4000-8000-000000000001',
  startedAt: 1_790_000_000_000,
  templateId: null,
  label: ' Push ',
  exercises: [{
    exerciseId: 'bench-press',
    exerciseSource: 'global',
    name: 'Bench Press',
    sets: [
      { weight: '80.5', reps: '5', done: true },
      { weight: '90', reps: '3', done: false },
    ],
  }],
}

it('builds history only from completed active-session sets', () => {
  expect(buildFinishedWorkoutFromActiveSession(activeDraft, 1_790_003_600_000)).toEqual({
    sessionId: 'session-1',
    templateId: null,
    startedAt: 1_790_000_000_000,
    finishedAt: 1_790_003_600_000,
    label: 'Push',
    exercises: [{
      exerciseId: 'bench-press',
      exerciseSource: 'global',
      name: 'Bench Press',
      sets: [{ weight: 80.5, reps: 5 }],
    }],
  })
})

it('rejects a draft without any completed set', () => {
  const empty = {
    ...activeDraft,
    exercises: activeDraft.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => ({ ...set, done: false })),
    })),
  }
  expect(() => buildFinishedWorkoutFromActiveSession(empty, 1_790_003_600_000))
    .toThrow('Trening musi zawierać co najmniej jedno ćwiczenie.')
})
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```bash
npx vitest run api/_lib/__tests__/workoutValidation.test.ts
```

Expected: FAIL because the three new exports do not exist and the old parser still trusts workout contents.

- [ ] **Step 3: Implement the compatibility parser**

Replace `parseFinalizeWorkoutInput` with:

```ts
export interface FinalizeWorkoutRequest {
  sessionId: string
  sessionRevision?: string
}

interface ParseFinalizeWorkoutRequestOptions {
  requireRevision?: boolean
}

const COMPATIBILITY_FINALIZE_FIELDS = new Set([
  'sessionId',
  'sessionRevision',
  'templateId',
  'startedAt',
  'finishedAt',
  'label',
  'exercises',
])

export function parseFinalizeWorkoutRequest(
  raw: unknown,
  options: ParseFinalizeWorkoutRequestOptions = {},
): FinalizeWorkoutRequest {
  const record = asRecord(raw, 'Niepoprawny payload treningu.')
  for (const field of Object.keys(record)) {
    if (!COMPATIBILITY_FINALIZE_FIELDS.has(field)) throw badRequest(`Nieoczekiwane pole ${field}.`)
  }

  const sessionId = validateFirestoreDocumentId(record.sessionId, 'sessionId')
  if (record.sessionRevision === undefined || record.sessionRevision === null) {
    if (options.requireRevision) throw badRequest('Brak pola sessionRevision.')
    return { sessionId }
  }

  return {
    sessionId,
    sessionRevision: validateFirestoreDocumentId(record.sessionRevision, 'sessionRevision'),
  }
}
```

- [ ] **Step 4: Implement active-draft normalization**

Add:

```ts
export function buildFinishedWorkoutFromActiveSession(
  raw: unknown,
  finishedAt: number,
): FinalizeWorkoutInput {
  const record = asRecord(raw, 'Niepoprawna aktywna sesja.')
  const startedAt = normalizeTimestamp(record.startedAt, 'startedAt')
  const normalizedFinishedAt = normalizeTimestamp(finishedAt, 'finishedAt')
  if (normalizedFinishedAt < startedAt) {
    throw badRequest('Czas zakończenia nie może poprzedzać rozpoczęcia.')
  }
  const exercises = normalizeActiveWorkoutExercises(record.exercises)

  return {
    sessionId: validateFirestoreDocumentId(record.sessionId, 'sessionId'),
    templateId: record.templateId === undefined || record.templateId === null
      ? null
      : validateFirestoreDocumentId(record.templateId, 'templateId'),
    startedAt,
    finishedAt: normalizedFinishedAt,
    label: validateWorkoutLabel(record.label),
    exercises,
  }
}

function normalizeActiveWorkoutExercises(raw: unknown): ValidatedWorkoutExercise[] {
  if (!Array.isArray(raw)) throw badRequest('Ćwiczenia treningu muszą być tablicą.')

  const completed = raw.map((exercise) => {
    const record = asRecord(exercise, 'Niepoprawne ćwiczenie w treningu.')
    const sets = Array.isArray(record.sets)
      ? record.sets.flatMap((set) => {
          const setRecord = asRecord(set, 'Niepoprawna seria w treningu.')
          return setRecord.done === true
            ? [{ weight: setRecord.weight, reps: setRecord.reps }]
            : []
        })
      : []

    return {
      exerciseId: record.exerciseId,
      exerciseSource: record.exerciseSource,
      name: record.name,
      sets,
    }
  }).filter((exercise) => exercise.sets.length > 0)

  return normalizeWorkoutExercises(completed)
}
```

- [ ] **Step 5: Run the focused tests**

Run:

```bash
npx vitest run api/_lib/__tests__/workoutValidation.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the server-boundary primitives**

```bash
git add api/_lib/workoutValidation.ts api/_lib/__tests__/workoutValidation.test.ts
git commit -m "fix: derive finalized workout payloads from active drafts"
```

---

### Task 2: Make the Admin transaction canonical and revision-fenced

**Files:**
- Modify: `api/finalize-workout.ts`
- Modify: `api/_lib/workoutClosure.ts`
- Test: `api/__tests__/workoutClosureHandlers.test.ts`
- Test: `tests/integration/workoutClosure.integration.test.ts`

**Interfaces:**
- Consumes: `FinalizeWorkoutRequest`, `parseFinalizeWorkoutRequest`, and `buildFinishedWorkoutFromActiveSession` from Task 1.
- Produces: HTTP `409` with code `active_session_changed` on a stale fence.

- [ ] **Step 1: Add integration tests for canonical contents and a stale fence**

Seed active sessions with draft-shaped string sets, `done`, `updatedAt`, and `sessionRevision`. Add:

```ts
it('persists canonical active-session contents instead of request contents', async () => {
  await seedActive()
  const materialize = vi.fn().mockImplementation(async (_uid, workoutId: string) => {
    await db.collection('workouts').doc(workoutId).update({ materialized: true })
  })

  await finalizeWorkoutForUser(USER_ID, {
    sessionId: input.sessionId,
    sessionRevision: 'revision-1',
  }, { db, now: () => FINISHED_AT, materialize })

  const state = await readClosure()
  expect(state.workout.data()).toMatchObject({
    label: 'Push',
    exercises: [{
      exerciseId: 'bench-press',
      exerciseSource: 'global',
      name: 'Bench Press',
      sets: [{ weight: 80, reps: 5 }],
    }],
  })
})

it('performs no writes when the active revision changed', async () => {
  await seedActive()

  await expect(finalizeWorkoutForUser(USER_ID, {
    sessionId: input.sessionId,
    sessionRevision: 'revision-stale',
  }, { db, now: () => FINISHED_AT }))
    .rejects.toMatchObject({ status: 409, code: 'active_session_changed' })

  const state = await readClosure()
  expect(state.active.exists).toBe(true)
  expect(state.workout.exists).toBe(false)
  expect(state.tombstone.exists).toBe(false)
})

it('keeps compatibility requests canonical without a revision', async () => {
  await seedActive()
  await expect(finalizeWorkoutForUser(USER_ID, { sessionId: input.sessionId }, {
    db,
    now: () => FINISHED_AT,
  })).resolves.toMatchObject({ workoutId: input.sessionId })
})
```

- [ ] **Step 2: Run integration tests and verify failure**

Run with a dedicated emulator:

```bash
npm run test:integration:workout
```

Expected: FAIL because the transaction still writes the request payload and does not compare revisions.

- [ ] **Step 3: Update the handler boundary**

In `api/finalize-workout.ts`, replace the old parser call:

```ts
import { parseFinalizeWorkoutRequest } from './_lib/workoutValidation.js'

const result = await finalizeWorkoutForUser(
  userId,
  parseFinalizeWorkoutRequest(body),
)
```

Update the handler mock and assertion names in `api/__tests__/workoutClosureHandlers.test.ts` from `parseFinalizeWorkoutInput` to `parseFinalizeWorkoutRequest`.

- [ ] **Step 4: Build the canonical value inside the transaction**

Change `finalizeWorkoutForUser` to accept `FinalizeWorkoutRequest`. Capture the timestamp once and replace `...input` usage with:

```ts
const closedAt = (options.now ?? Date.now)()

// inside the transaction, after existing-closure checks
const activeData = requireMatchingActiveSession(userId, workoutId, active)
requireActiveSessionRevision(activeData, input.sessionRevision)
const canonicalWorkout = buildFinishedWorkoutFromActiveSession(
  activeData,
  getCappedWorkoutFinishedAt(activeData.startedAt, closedAt),
)

transaction.create(workoutRef, {
  ...canonicalWorkout,
  userId,
  materialized: false,
})
transaction.create(tombstoneRef, {
  userId,
  sessionId: workoutId,
  outcome: 'finished' satisfies ClosedSessionOutcome,
  workoutId,
  closedAt,
  projectionState: 'pending',
  projectionRevision: INITIAL_PROJECTION_REVISION,
  projectionExerciseKeys: projectionExerciseKeysFromWorkout(canonicalWorkout.exercises),
})
```

Make the matcher return the owned document and add the fence:

```ts
function requireMatchingActiveSession(
  userId: string,
  sessionId: string,
  active: DocumentSnapshot,
): DocumentData {
  if (!active.exists) throw sessionMismatch()
  const stored = requireOwnedRecord(active, userId, 'active session')
  const storedSessionId = typeof stored.sessionId === 'string' && stored.sessionId.trim()
    ? stored.sessionId.trim()
    : typeof stored.startedAt === 'number'
      ? deriveLegacySessionId(userId, stored.startedAt)
      : undefined
  if (storedSessionId !== sessionId) throw sessionMismatch()
  return { ...stored, sessionId: storedSessionId }
}

function requireActiveSessionRevision(
  active: DocumentData,
  expectedRevision: string | undefined,
): void {
  if (expectedRevision === undefined) return
  if (active.sessionRevision !== expectedRevision) {
    throw new ApiError(409, 'Aktywna sesja zmieniła się na innym urządzeniu.', {
      code: 'active_session_changed',
    })
  }
}
```

- [ ] **Step 5: Update existing integration expectations**

Replace finished-payload arguments with `{ sessionId, sessionRevision: 'revision-1' }`, keep legacy-ID cases unfenced where required, and assert `finishedAt === FINISHED_AT` from the server clock. Preserve the existing concurrent finish, acknowledgement retry, projection-pending, discard, owner isolation, and tombstone conflict tests.

- [ ] **Step 6: Run handler, integration, and projection tests**

```bash
npx vitest run api/__tests__/workoutClosureHandlers.test.ts api/_lib/__tests__/workoutValidation.test.ts
npm run test:integration:workout
```

Expected: PASS.

- [ ] **Step 7: Commit the canonical transaction**

```bash
git add api/finalize-workout.ts api/_lib/workoutClosure.ts api/__tests__/workoutClosureHandlers.test.ts tests/integration/workoutClosure.integration.test.ts
git commit -m "fix: fence canonical workout finalization"
```

---

### Task 3: Add revisions to every active-session write

**Files:**
- Modify: `src/lib/activeSessionService.ts`
- Test: `src/lib/__tests__/activeSessionService.test.ts`

**Interfaces:**
- Produces: `SavedActiveSession { sessionRevision: string }` and `saveActiveSession(uid, workout): Promise<SavedActiveSession>`.
- Consumes: native `crypto.randomUUID()`.

- [ ] **Step 1: Add revision persistence tests**

```ts
it('writes and returns a fresh revision for every save', async () => {
  vi.spyOn(crypto, 'randomUUID')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000002')

  await expect(saveActiveSession('user-1', workout)).resolves.toEqual({
    sessionRevision: '00000000-0000-4000-8000-000000000001',
  })
  await expect(saveActiveSession('user-1', workout)).resolves.toEqual({
    sessionRevision: '00000000-0000-4000-8000-000000000002',
  })
  expect(vi.mocked(setDoc).mock.calls.map(([, document]) => (
    document as { sessionRevision: string }
  ).sessionRevision)).toEqual([
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
  ])
})
```

Update template-launch and claim expectations so every created/replaced document contains a revision.

- [ ] **Step 2: Run the service test and verify failure**

```bash
npx vitest run src/lib/__tests__/activeSessionService.test.ts
```

Expected: FAIL because saves currently return `void` and documents omit the fence.

- [ ] **Step 3: Implement revision generation once per document write**

```ts
export interface SavedActiveSession {
  sessionRevision: string
}

export async function saveActiveSession(
  uid: string,
  workout: ActiveWorkout,
): Promise<SavedActiveSession> {
  const sessionRevision = crypto.randomUUID()
  await setDoc(activeSessionRef(uid), activeSessionDocument(uid, workout, sessionRevision))
  return { sessionRevision }
}

function activeSessionDocument(
  uid: string,
  workout: ActiveWorkout,
  sessionRevision = crypto.randomUUID(),
) {
  const persistableWorkout = stripWorkoutClientIds(workout)
  return {
    userId: uid,
    sessionId: persistableWorkout.sessionId,
    sessionRevision,
    startedAt: persistableWorkout.startedAt,
    templateId: typeof persistableWorkout.templateId === 'string' ? persistableWorkout.templateId : null,
    label: persistableWorkout.label?.trim() || null,
    exercises: persistableWorkout.exercises,
    updatedAt: Date.now(),
  }
}
```

Keep `sessionRevision` out of `ActiveWorkout`; it is a storage fence, not editable workout state.

- [ ] **Step 4: Run active-session tests**

```bash
npx vitest run src/lib/__tests__/activeSessionService.test.ts src/pages/__tests__/useActiveSessionAuthority.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit revision persistence**

```bash
git add src/lib/activeSessionService.ts src/lib/__tests__/activeSessionService.test.ts
git commit -m "fix: revision active session writes"
```

---

### Task 4: Send only the fenced closure identity

**Files:**
- Modify: `src/lib/workoutClosureService.ts`
- Modify: `src/lib/workoutLifecycle.ts`
- Modify: `src/lib/workoutService.ts`
- Test: `src/lib/__tests__/workoutClosureService.test.ts`
- Test: `src/lib/__tests__/workoutLifecycle.test.ts`
- Test: `src/lib/__tests__/workoutService.test.ts`

**Interfaces:**
- Produces: `finalizeWorkout(sessionId: string, sessionRevision: string): Promise<FinalizeWorkoutResult>`.
- Requires: modern `finishWorkoutLifecycle` callers provide an explicit `request` callback.

- [ ] **Step 1: Change the service tests to require the minimal body**

```ts
await expect(finalizeWorkout('session-1', 'revision-1')).resolves.toEqual({
  workoutId: 'session-1',
  status,
})
expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
  sessionId: 'session-1',
  sessionRevision: 'revision-1',
})
```

Update retry assertions to prove both `sessionId` and `sessionRevision` remain identical.

- [ ] **Step 2: Run focused tests and verify failure**

```bash
npx vitest run src/lib/__tests__/workoutClosureService.test.ts src/lib/__tests__/workoutLifecycle.test.ts
```

Expected: FAIL because `finalizeWorkout` still accepts an `ActiveWorkout` and serializes its contents.

- [ ] **Step 3: Implement the minimal request**

```ts
export async function finalizeWorkout(
  sessionId: string,
  sessionRevision: string,
): Promise<FinalizeWorkoutResult> {
  const result = await callClosureEndpoint('/api/finalize-workout', {
    sessionId,
    sessionRevision,
  })
  if (
    !isRecord(result)
    || result.workoutId !== sessionId
    || (result.status !== 'materialized' && result.status !== 'projection_pending')
  ) throw ambiguousResponse()
  return { workoutId: result.workoutId, status: result.status }
}
```

Remove the `buildFinishedWorkoutPayload` import. Delete the now-unreferenced `saveWorkout` function, `FinishedWorkoutPayload` interface, and `buildFinishedWorkoutPayload` function from `workoutService.ts`, then delete their payload-only unit test. Keep `SaveWorkoutResult` because the existing legacy lifecycle overload still imports it.

- [ ] **Step 4: Require an explicit finish request in the modern lifecycle interface**

Change the modern finish dependency to:

```ts
interface FinishWorkoutDependencies extends ClosureDependencies<FinalizeWorkoutResult> {
  request(): Promise<FinalizeWorkoutResult>
}
```

and call:

```ts
return runClosure('finish', dependencies, dependencies.request)
```

Do not change discard behavior or the legacy overloads in this task.

- [ ] **Step 5: Run the focused tests**

```bash
npx vitest run src/lib/__tests__/workoutClosureService.test.ts src/lib/__tests__/workoutLifecycle.test.ts src/lib/__tests__/workoutService.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the client request contract**

```bash
git add src/lib/workoutClosureService.ts src/lib/workoutLifecycle.ts src/lib/workoutService.ts src/lib/__tests__/workoutClosureService.test.ts src/lib/__tests__/workoutLifecycle.test.ts src/lib/__tests__/workoutService.test.ts
git commit -m "fix: minimize workout finalize requests"
```

---

### Task 5: Prepare the frozen snapshot before finish

**Files:**
- Modify: `src/hooks/useActiveSession.ts`
- Modify: `src/pages/WorkoutPage.tsx`
- Test: `src/pages/__tests__/useActiveSessionAuthority.test.tsx`
- Test: `src/pages/__tests__/WorkoutStaleSessionFeedback.test.tsx`

**Interfaces:**
- Produces: `prepareFinishClosure(session): Promise<{ status: 'ready'; sessionRevision: string } | { status: 'failed' }>`.
- Changes: stale continuation may return `{ status: 'sync_failed' }` in addition to `completed` and `ignored`.
- Consumes: `saveActiveSession` result from Task 3 and `finalizeWorkout` from Task 4.

- [ ] **Step 1: Add hook tests for preparation success and failure**

```ts
it('persists the frozen closure snapshot and returns its revision', async () => {
  saveActiveSession.mockResolvedValueOnce({ sessionRevision: 'revision-finish' })
  const { result } = renderHook(() => useActiveSession('user-1'))
  act(() => useWorkoutStore.getState().hydrateFromDoc(remoteSession))
  let intent: WorkoutClosureIntent | null = null
  act(() => { intent = result.current.beginClosure('finish', remoteSession) })

  await expect(result.current.prepareFinishClosure(intent!)).resolves.toEqual({
    status: 'ready',
    sessionRevision: 'revision-finish',
  })
  expect(saveActiveSession).toHaveBeenCalledWith('user-1', intent!.session)
})

it('unlocks an unsent finish and exposes sync retry when snapshot persistence fails', async () => {
  saveActiveSession.mockRejectedValueOnce(new Error('offline'))
  const { result } = renderHook(() => useActiveSession('user-1'))
  act(() => useWorkoutStore.getState().hydrateFromDoc(remoteSession))
  let intent: WorkoutClosureIntent | null = null
  act(() => { intent = result.current.beginClosure('finish', remoteSession) })

  await expect(result.current.prepareFinishClosure(intent!)).resolves.toEqual({ status: 'failed' })
  expect(result.current.closureState).toBe('idle')
  expect(result.current.closureIntent).toBeNull()
  expect(result.current.activeSessionSyncStatus).toBe('failed')
  expect(useWorkoutStore.getState().active?.sessionId).toBe(remoteSession.sessionId)
})
```

Change the existing stale-continuation failure test to expect `sync_failed`, a local active session, and sync status `failed`.

- [ ] **Step 2: Run hook tests and verify failure**

```bash
npx vitest run src/pages/__tests__/useActiveSessionAuthority.test.tsx
```

Expected: FAIL because preparation and `sync_failed` do not exist.

- [ ] **Step 3: Implement finish preparation**

Add the return type and method:

```ts
export type PrepareFinishClosureResult =
  | { status: 'ready'; sessionRevision: string }
  | { status: 'failed' }

async function prepareFinishClosure(
  intent: WorkoutClosureIntent,
): Promise<PrepareFinishClosureResult> {
  if (!uid || closureIntentRef.current !== intent || intent.action !== 'finish') {
    return { status: 'failed' }
  }

  setActiveSessionSyncStatus('retrying')
  try {
    const saved = await saveActiveSession(uid, intent.session)
    if (closureIntentRef.current !== intent) return { status: 'failed' }
    hasUnsyncedLocalChangesRef.current = false
    setActiveSessionSyncStatus('idle')
    return { status: 'ready', sessionRevision: saved.sessionRevision }
  } catch (error) {
    if (closureIntentRef.current !== intent) return { status: 'failed' }
    clearWorkoutClosureIntent(uid)
    setPendingIntent(null)
    setClosureState('idle')
    setActiveSessionSyncStatus('failed')
    console.error('[prepare workout closure error]', error)
    return { status: 'failed' }
  }
}
```

Return it from the hook.

- [ ] **Step 4: Make stale continuation failure recoverable**

Extend the result union with `{ status: 'sync_failed' }`. In the current save failure catch, retain the hydrated refreshed session and backup, set sync status to `failed`, log the persistence failure, and return `sync_failed` rather than throwing.

Update `WorkoutPage.handleContinueStaleSession`:

```ts
const result = await continueStaleSession()
if (result.status === 'ignored') return
if (result.status === 'sync_failed') {
  toast.error('Sesja została przywrócona lokalnie. Ponów synchronizację.')
  return
}
toast.success('Wróciłem do zapisanej sesji z odświeżonym timerem.')
```

- [ ] **Step 5: Wire preparation into submit finish**

Destructure `prepareFinishClosure` from the hook and update `submitFinish`:

```ts
const prepared = await prepareFinishClosure(intent)
if (prepared.status === 'failed') return

const result = await finishWorkoutLifecycle({
  uid: user.uid,
  session: intent.session,
  now: () => intent.createdAt,
  request: () => finalizeWorkout(intent.session.sessionId, prepared.sessionRevision),
  clearConfirmed: confirmClosure,
})
```

Import `finalizeWorkout` from `workoutClosureService` alongside `WorkoutClosureError`.

- [ ] **Step 6: Update page mocks and focused UI tests**

Add `prepareFinishClosure` to every `useActiveSession` mock. In `WorkoutStaleSessionFeedback.test.tsx`, replace the thrown-error case with:

```ts
mocks.continueStaleSession.mockResolvedValue({ status: 'sync_failed' })
// click Kontynuuj
await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(
  'Sesja została przywrócona lokalnie. Ponów synchronizację.',
))
```

- [ ] **Step 7: Run hook, page, and lifecycle tests**

```bash
npx vitest run src/pages/__tests__/useActiveSessionAuthority.test.tsx src/pages/__tests__/WorkoutStaleSessionFeedback.test.tsx src/lib/__tests__/workoutLifecycle.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit frozen-snapshot preparation**

```bash
git add src/hooks/useActiveSession.ts src/pages/WorkoutPage.tsx src/pages/__tests__/useActiveSessionAuthority.test.tsx src/pages/__tests__/WorkoutStaleSessionFeedback.test.tsx
git commit -m "fix: persist frozen sessions before finalization"
```

---

### Task 6: Handle revision conflicts and empty-session closure precisely

**Files:**
- Modify: `src/lib/activeSessionSyncPolicy.ts`
- Modify: `src/hooks/useActiveSession.ts`
- Modify: `src/pages/WorkoutPage.tsx`
- Test: `src/lib/__tests__/activeSessionSyncPolicy.test.ts`
- Test: `src/pages/__tests__/WorkoutStaleSessionFeedback.test.tsx`
- Test: `src/pages/__tests__/useActiveSessionAuthority.test.tsx`

**Interfaces:**
- Produces: `active_session_changed` classification that reloads the authoritative session and unlocks a new finish attempt.
- Reuses: `discardWorkoutLifecycle` for confirmed empty-session closure.

- [ ] **Step 1: Add the typed failure classification test**

```ts
expect(classifyClosureFailure({
  kind: 'definitive',
  status: 409,
  code: 'active_session_changed',
})).toBe('active_session_changed')
```

Add a hook test proving `markClosureError` reloads the server session and clears the stale closure intent for this code.

- [ ] **Step 2: Add the empty-finish page test**

Extend the existing page mocks with `beginClosure`, `discardWorkoutLifecycle`, `finalizeWorkout`, and `prepareFinishClosure`, then add:

```ts
it('discards an empty session instead of sending a finalize request', async () => {
  const emptySession = {
    sessionId: 'session-empty',
    startedAt: Date.now(),
    templateId: null,
    label: 'Push',
    exercises: [],
  }
  mocks.active = emptySession
  mocks.staleSession = null
  mocks.beginClosure.mockImplementation((action: 'finish' | 'discard') => ({
    action,
    session: emptySession,
    createdAt: Date.now(),
  }))
  mocks.discardWorkoutLifecycle.mockResolvedValue({ status: 'discarded' })
  renderStaleSessionPage()

  fireEvent.click(screen.getByRole('button', { name: 'Zakończ' }))
  fireEvent.click(screen.getByRole('button', { name: 'Odrzuć sesję' }))

  await waitFor(() => expect(mocks.discardWorkoutLifecycle).toHaveBeenCalledOnce())
  expect(mocks.prepareFinishClosure).not.toHaveBeenCalled()
  expect(mocks.finalizeWorkout).not.toHaveBeenCalled()
})
```

- [ ] **Step 3: Run the focused tests and verify failure**

```bash
npx vitest run src/lib/__tests__/activeSessionSyncPolicy.test.ts src/pages/__tests__/useActiveSessionAuthority.test.tsx src/pages/__tests__/WorkoutStaleSessionFeedback.test.tsx
```

Expected: FAIL because the new failure state and empty discard contract are absent.

- [ ] **Step 4: Classify and surface the revision conflict**

Add `active_session_changed` to `ClosureFailureState` and classify its server code explicitly. Make `markClosureError` return the classified failure after reloading for this state:

```ts
if (
  failure === 'session_mismatch'
  || failure === 'closure_conflict'
  || failure === 'active_session_changed'
) await reloadCurrentSession()
return failure
```

In `WorkoutPage.handleClosureError`, show precise feedback after the authoritative reload:

```ts
const failure = await markClosureError(error)
if (failure === 'active_session_changed') {
  toast.error('Sesja zmieniła się na innym urządzeniu. Sprawdź dane i zakończ ją ponownie.')
}
```

Return `void` for non-`WorkoutClosureError` after `markClosureUnconfirmed()`.

- [ ] **Step 5: Route empty confirmation through discard**

Change the dialog to:

```tsx
<ConfirmDialog
  title="Zakończyć bez zapisu?"
  message="Nie zaznaczono żadnej serii jako wykonanej. Sesja zostanie odrzucona bez zapisywania treningu."
  confirmLabel="Odrzuć sesję"
  cancelLabel="Wróć"
  danger
  onConfirm={() => {
    setConfirmFinishEmpty(false)
    void handleConfirmDiscard()
  }}
  onCancel={() => setConfirmFinishEmpty(false)}
/>
```

Do not open the separate discard confirmation a second time.

- [ ] **Step 6: Run the focused tests**

```bash
npx vitest run src/lib/__tests__/activeSessionSyncPolicy.test.ts src/pages/__tests__/useActiveSessionAuthority.test.tsx src/pages/__tests__/WorkoutStaleSessionFeedback.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit conflict and empty-session behavior**

```bash
git add src/lib/activeSessionSyncPolicy.ts src/hooks/useActiveSession.ts src/pages/WorkoutPage.tsx src/lib/__tests__/activeSessionSyncPolicy.test.ts src/pages/__tests__/WorkoutStaleSessionFeedback.test.tsx src/pages/__tests__/useActiveSessionAuthority.test.tsx
git commit -m "fix: recover changed and empty workout sessions"
```

---

### Task 7: Allow revisioned documents during compatibility rollout

**Files:**
- Modify: `firestore.rules`
- Test: `tests/rules/firestore.rules.test.ts`
- Modify: `tests/e2e/support/workoutLifecycleEmulator.ts`
- Test: `tests/e2e/workout-lifecycle.spec.ts`

**Interfaces:**
- Phase A rules accept a missing revision for legacy clients or a valid document-ID-safe revision for new clients.
- E2E fixtures create revisioned active sessions.

- [ ] **Step 1: Add rules tests for optional but validated revisions**

Add three owner-write cases: a valid UUID-like revision succeeds, a missing revision succeeds in compatibility mode, and a revision containing `/` fails.

```ts
await assertSucceeds(setDoc(activeRef, { ...validActive, sessionRevision: 'revision-1' }))
await assertSucceeds(setDoc(activeRef, validActive))
await assertFails(setDoc(activeRef, { ...validActive, sessionRevision: 'unsafe/revision' }))
```

- [ ] **Step 2: Run the rules suite and verify failure**

```bash
npm run test:rules
```

Expected: FAIL because `sessionRevision` is not in the allowed key set.

- [ ] **Step 3: Make the Phase A rule backward compatible**

In `isActiveSession`:

```text
data.keys().hasOnly([
  'userId', 'sessionId', 'sessionRevision', 'startedAt',
  'templateId', 'label', 'exercises', 'updatedAt'
])
&& (!data.keys().hasAny(['sessionRevision']) || isDocumentId(data.sessionRevision))
```

Keep all existing owner, tombstone, timestamp, label, and exercise constraints.

- [ ] **Step 4: Revision the lifecycle E2E fixtures and assertion**

Add `sessionRevision: crypto.randomUUID()` in `activeSessionDocument`. Extend the normal-finish E2E assertion so the saved workout matches the seeded active label, exercise source/name, and completed set, while the active document disappears.

- [ ] **Step 5: Run rules and workout E2E**

```bash
npm run test:rules
npm run test:e2e:workout
```

Expected: rules PASS and workout E2E 9/9 or higher with no retry.

- [ ] **Step 6: Commit Phase A rules and fixtures**

```bash
git add firestore.rules tests/rules/firestore.rules.test.ts tests/e2e/support/workoutLifecycleEmulator.ts tests/e2e/workout-lifecycle.spec.ts
git commit -m "fix: allow fenced active sessions during rollout"
```

---

### Task 8: Run the Phase A release gate

**Files:**
- No product file changes.

**Interfaces:**
- Validates the complete compatibility implementation before deployment.

- [ ] **Step 1: Run static and unit gates**

```bash
npm run lint
npm run test:unit
npm run build
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 2: Run server and lifecycle gates**

```bash
npm run test:rules
npm run test:integration:workout
npm run test:e2e:workout
npm run test:e2e:isolated
```

Expected: all commands exit 0 with no flaky result in emulator mode.

- [ ] **Step 3: Review the compatibility diff**

```bash
git diff origin/main...HEAD -- api src/lib src/hooks src/pages firestore.rules tests
git status --short
```

Expected: only the planned lifecycle files are changed; no `output/`, emulator logs, reports, or credentials are staged.

---

### Task 9: Enforce revisions after the compatibility release is live

**Files:**
- Modify: `api/finalize-workout.ts`
- Modify: `api/_lib/workoutValidation.ts`
- Modify: `firestore.rules`
- Test: `api/_lib/__tests__/workoutValidation.test.ts`
- Test: `api/__tests__/workoutClosureHandlers.test.ts`
- Test: `tests/rules/firestore.rules.test.ts`
- Test: `tests/integration/workoutClosure.integration.test.ts`

**Interfaces:**
- Requires: confirmed deployment of the Phase A API and SPA.
- Produces: strict request `{ sessionId, sessionRevision }`; missing fences are rejected before closure.

- [ ] **Step 1: Confirm the rollout prerequisite**

Verify the deployed SPA sends `sessionRevision` in a real authenticated finalize request and the deployed API derives saved contents from `activeSessions`. Do not begin this task if either side still runs the legacy contract.

- [ ] **Step 2: Change tests to reject missing revisions and legacy fields**

```ts
expect(() => parseFinalizeWorkoutRequest({ sessionId: 'session-1' }, { requireRevision: true }))
  .toThrow('Brak pola sessionRevision.')
expect(() => parseFinalizeWorkoutRequest({
  sessionId: 'session-1',
  sessionRevision: 'revision-1',
  exercises: [],
}, { requireRevision: true, allowLegacyFields: false }))
  .toThrow('Nieoczekiwane pole exercises.')
```

Change rules tests so a missing `sessionRevision` fails.

- [ ] **Step 3: Run focused tests and verify failure**

```bash
npx vitest run api/_lib/__tests__/workoutValidation.test.ts api/__tests__/workoutClosureHandlers.test.ts
npm run test:rules
```

Expected: FAIL under the compatibility implementation.

- [ ] **Step 4: Make the handler and rules strict**

Call:

```ts
parseFinalizeWorkoutRequest(body, {
  requireRevision: true,
  allowLegacyFields: false,
})
```

Extend `ParseFinalizeWorkoutRequestOptions` with `allowLegacyFields?: boolean`, select the allowed field set accordingly, and make strict mode allow only `sessionId` and `sessionRevision`.

In Firestore rules, add `sessionRevision` to `hasAll` and replace the optional check with:

```text
&& isDocumentId(data.sessionRevision)
```

Delete the compatibility integration case that finishes without a revision and replace it with a rejected missing-revision handler case.

- [ ] **Step 5: Run the full strict gate**

```bash
npm run lint
npm run test:unit
npm run test:rules
npm run test:integration:workout
npm run test:e2e:workout
npm run build
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit strict enforcement separately**

```bash
git add api/finalize-workout.ts api/_lib/workoutValidation.ts firestore.rules api/_lib/__tests__/workoutValidation.test.ts api/__tests__/workoutClosureHandlers.test.ts tests/rules/firestore.rules.test.ts tests/integration/workoutClosure.integration.test.ts
git commit -m "fix: require active session revision fences"
```
