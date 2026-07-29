# Phase 8B Workout Projection Serialization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zagwarantować, że terminalne usunięcie workoutu wygrywa z każdym spóźnionym update'em lub retry materializacji, a rekordy zawsze wynikają z istniejących workoutów.

**Status:** PLANNED — READY FOR EXECUTION

**Architecture:** Istniejący `closedSessions/{workoutId}` staje się trwałym version fence'em z rewizją, stanem projekcji i pełnym zbiorem dotkniętych ćwiczeń. Każdy zapis projekcji jest transakcyjnie chroniony odczytem fence'a; delete atomowo ustawia terminalny stan `deleted`, po czym wykonuje idempotentny cleanup.

**Tech Stack:** TypeScript 5.9, Vercel Node Functions, Firebase Admin SDK 13, Cloud Firestore transactions, Vitest 4, Firebase Emulator Suite.

**Approved design:** `docs/roadmap/specs/2026-07-29-phase-8b-workout-projection-serialization-design.md`

## Global Constraints

- Zakres obejmuje wyłącznie `WORKOUT-RACE-01`, `WORKOUT-RACE-02` i `WORKOUT-RACE-03`.
- `closedSessions/{workoutId}` jest jedynym fence'em; nie dodawać kolekcji locków, kolejki, Cloud Tasks ani zależności.
- Delete ustawia terminalny stan `deleted` i zawsze wygrywa ze starszą rewizją.
- Każda mutacja `exerciseSessions`, `records` albo `materialized` sprawdza fence w tej samej transakcji co zapis.
- Pełna suma starych, bieżących i docelowych kluczy ćwiczeń trafia do fence'a przed pierwszą mutacją sesji.
- Retry materializacji i delete jest idempotentne.
- Legacy workouty działają bez migracji wsadowej.
- `closedSessions` pozostaje niedostępne dla klienta; nie zmieniać reguł ani indeksów bez dowodu z failing testu.
- Nie zmieniać UI ani publicznego kontraktu `materialized | projection_pending`.
- Nie wykonywać pushu ani deployu produkcyjnego bez osobnej zgody.
- Nie stage'ować `.impeccable/`, `output/` ani `docs/audits/2026-07-14-senior-design-review.md`.

---

## File Structure

### New files

- `api/_lib/workoutProjectionFence.ts` — czyste typy, normalizacja kluczy, parser fence'a i stabilne błędy konfliktu.
- `api/_lib/__tests__/workoutProjectionFence.test.ts` — walidacja schematu, deduplikacja kluczy i kody błędów.
- `tests/integration/workoutProjectionSerialization.integration.test.ts` — deterministyczne przeploty materialize/update/delete na emulatorze.

### Modified files

- `api/_lib/workoutClosure.ts` — inicjalny fence rewizji `1` podczas finalizacji.
- `api/_lib/workoutProjection.ts` — przygotowanie legacy fence'a, chronione zapisy, rewizjonowany update i terminalny delete.
- `tests/integration/workoutClosure.integration.test.ts` — kontrakt nowego tombstone'a i przekazanie rewizji.
- `tests/integration/workoutProjection.integration.test.ts` — zachowanie istniejącego recovery po dodaniu fence'a.
- `tests/review/support/faultOutcomes.ts` — nazwane checkpointy awarii delete.
- `docs/roadmap/ROADMAP.md` — status `PLANNED` teraz, `DONE` wyłącznie po
  rzeczywistym wykonaniu i closeoucie.
- `docs/roadmap/specs/2026-07-29-phase-8b-workout-projection-serialization-design.md`
  — link do planu teraz, status końcowy po weryfikacji.
- `docs/roadmap/plans/2026-07-29-phase-8b-workout-projection-serialization.md` — checkboxy i dowody wykonania.

---

### Task 1: Model fence'a i finalizacja rewizji `1`

**Files:**
- Create: `api/_lib/workoutProjectionFence.ts`
- Create/Test: `api/_lib/__tests__/workoutProjectionFence.test.ts`
- Modify: `api/_lib/workoutClosure.ts`
- Modify/Test: `tests/integration/workoutClosure.integration.test.ts`

**Interfaces:**
- Produces: `ProjectionState`, `ProjectionExerciseKey`, `ProjectionFence`
- Produces: `normalizeProjectionExerciseKeys(...groups)`
- Produces: `projectionExerciseKeysFromWorkout(exercises)`
- Produces: `parseProjectionFence(raw)`
- Produces: `projectionSuperseded()`, `workoutDeleted()` oraz `projectionStateConflict()`
- Changes: injected `MaterializeWorkout` otrzymuje `expectedRevision?: number`

- [ ] **Step 1: Dodać failing unit test modelu fence'a**

Utworzyć `api/_lib/__tests__/workoutProjectionFence.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  normalizeProjectionExerciseKeys,
  parseProjectionFence,
  projectionStateConflict,
  projectionSuperseded,
  workoutDeleted,
} from '../workoutProjectionFence.js'

describe('workout projection fence', () => {
  it('deduplicates and sorts exercise keys deterministically', () => {
    expect(normalizeProjectionExerciseKeys(
      [
        { exerciseSource: 'user', exerciseId: 'curl' },
        { exerciseSource: 'global', exerciseId: 'bench' },
      ],
      [
        { exerciseSource: 'global', exerciseId: 'bench' },
      ],
    )).toEqual([
      { exerciseSource: 'global', exerciseId: 'bench' },
      { exerciseSource: 'user', exerciseId: 'curl' },
    ])
  })

  it('accepts a complete fence, recognizes legacy, and rejects corruption', () => {
    expect(parseProjectionFence({
      projectionState: 'deleted',
      projectionRevision: 3,
      projectionExerciseKeys: [
        { exerciseSource: 'global', exerciseId: 'bench' },
      ],
      deletedAt: 123,
    })).toEqual({
      projectionState: 'deleted',
      projectionRevision: 3,
      projectionExerciseKeys: [
        { exerciseSource: 'global', exerciseId: 'bench' },
      ],
      deletedAt: 123,
    })

    expect(parseProjectionFence({})).toBeNull()
    expect(() => parseProjectionFence({ projectionState: 'pending' }))
      .toThrowError(projectionStateConflict())
  })

  it('uses stable conflict codes', () => {
    expect(projectionSuperseded()).toMatchObject({
      status: 409,
      code: 'projection_superseded',
    })
    expect(workoutDeleted()).toMatchObject({
      status: 409,
      code: 'workout_deleted',
    })
  })
})
```

- [ ] **Step 2: Uruchomić unit test i potwierdzić RED**

Run:

```bash
npx vitest run api/_lib/__tests__/workoutProjectionFence.test.ts
```

Expected: FAIL, ponieważ `workoutProjectionFence.ts` nie istnieje.

- [ ] **Step 3: Zaimplementować czysty model fence'a**

W `api/_lib/workoutProjectionFence.ts` zdefiniować:

```ts
import { ApiError } from './errors.js'
import type {
  ExerciseSource,
  ValidatedWorkoutExercise,
} from './workoutValidation.js'

export type ProjectionState = 'pending' | 'ready' | 'deleted'

export interface ProjectionExerciseKey {
  exerciseSource: ExerciseSource
  exerciseId: string
}

export interface ProjectionFence {
  projectionState: ProjectionState
  projectionRevision: number
  projectionExerciseKeys: ProjectionExerciseKey[]
  deletedAt?: number
}

export const INITIAL_PROJECTION_REVISION = 1

export function projectionExerciseKeysFromWorkout(
  exercises: Array<Pick<ValidatedWorkoutExercise, 'exerciseSource' | 'exerciseId'>>,
): ProjectionExerciseKey[]

export function normalizeProjectionExerciseKeys(
  ...groups: ProjectionExerciseKey[][]
): ProjectionExerciseKey[]

export function parseProjectionFence(raw: unknown): ProjectionFence | null

export function projectionSuperseded(): ApiError {
  return new ApiError(409, 'Operacja dotyczy starszej wersji treningu.', {
    code: 'projection_superseded',
  })
}

export function workoutDeleted(): ApiError {
  return new ApiError(409, 'Trening został już usunięty.', {
    code: 'workout_deleted',
  })
}

export function projectionStateConflict(): ApiError {
  return new ApiError(409, 'Stan projekcji treningu jest niespójny.', {
    code: 'projection_state_conflict',
  })
}
```

Implementacja parsera:

- zwraca `null` wyłącznie, gdy nie istnieje żadne z pól fence'a — to prawdziwy
  legacy tombstone;
- częściowy albo niepoprawny fence odrzuca jako
  `projection_state_conflict`, zamiast nadpisywać potencjalnie uszkodzony stan;
- przyjmuje wyłącznie stan `pending | ready | deleted`;
- wymaga dodatniej całkowitej rewizji;
- filtruje klucze do poprawnych par `global | user` oraz niepustego `exerciseId`;
- deduplikuje i sortuje klucze przez
  `${exerciseSource}:${exerciseId}`;
- zachowuje `deletedAt` tylko jako skończoną liczbę nieujemną.

- [ ] **Step 4: Rozszerzyć failing integration finalizacji**

W teście `atomically finishes the active session with deterministic documents`
w `tests/integration/workoutClosure.integration.test.ts` oczekiwać:

```ts
expect(state.tombstone.data()).toEqual({
  userId: USER_ID,
  sessionId: input.sessionId,
  outcome: 'finished',
  workoutId: input.sessionId,
  closedAt: FINISHED_AT + 1,
  projectionState: 'pending',
  projectionRevision: 1,
  projectionExerciseKeys: [{
    exerciseSource: 'global',
    exerciseId: 'bench-press',
  }],
})
expect(materialize).toHaveBeenCalledWith(USER_ID, input.sessionId, 1)
```

Run:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
firebase emulators:exec --only firestore --project demo-ironlog \
  "vitest run --config vitest.workout-integration.config.ts tests/integration/workoutClosure.integration.test.ts"
```

Expected: FAIL na brakujących polach i trzecim argumencie mocka.

- [ ] **Step 5: Zapisać fence w transakcji finalizacji**

W `api/_lib/workoutClosure.ts`:

- zmienić `MaterializeWorkout` na:

```ts
type MaterializeWorkout = (
  userId: string,
  workoutId: string,
  expectedRevision?: number,
) => Promise<void>
```

- rozszerzyć `ClosureTransactionResult` o `projectionRevision?: number`;
- przy `transaction.create(tombstoneRef, ...)` dodać pola:

```ts
projectionState: 'pending',
projectionRevision: INITIAL_PROJECTION_REVISION,
projectionExerciseKeys: projectionExerciseKeysFromWorkout(input.exercises),
```

- przekazać rewizję do injected materialize;
- default materialize wywołać jako:

```ts
materializeWorkoutForUser(ownerId, id, {
  db: database,
  expectedRevision,
})
```

Retry legacy tombstone'a bez fence'a przekazuje `undefined`; inicjalizacja
legacy należy do Task 2.

- [ ] **Step 6: Uruchomić targeted testy**

Run:

```bash
npx vitest run api/_lib/__tests__/workoutProjectionFence.test.ts
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
firebase emulators:exec --only firestore --project demo-ironlog \
  "vitest run --config vitest.workout-integration.config.ts tests/integration/workoutClosure.integration.test.ts"
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add \
  api/_lib/workoutProjectionFence.ts \
  api/_lib/__tests__/workoutProjectionFence.test.ts \
  api/_lib/workoutClosure.ts \
  tests/integration/workoutClosure.integration.test.ts
git commit -m "feat: add workout projection fence"
```

---

### Task 2: Rewizjonowana i chroniona materializacja

**Files:**
- Modify: `api/_lib/workoutProjection.ts`
- Create/Test: `tests/integration/workoutProjectionSerialization.integration.test.ts`
- Modify/Test: `tests/integration/workoutProjection.integration.test.ts`

**Interfaces:**
- Consumes: `ProjectionFence`, `normalizeProjectionExerciseKeys`
- Changes: `MaterializationReviewOptions.expectedRevision?: number`
- Produces: prywatne `prepareMaterialization`, `stageProjectionKeys`
- Produces: prywatne `runGuardedProjectionTransaction`

- [ ] **Step 1: Dodać bazowy harness integracyjny**

Utworzyć `tests/integration/workoutProjectionSerialization.integration.test.ts`
z tym samym mockiem `firebaseAdmin.js` i cleanupem emulatora co
`workoutProjection.integration.test.ts`. Dodać lokalny deferred:

```ts
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
```

Seed `serialization-materialize`:

```ts
await db.collection('workouts').doc(workoutId).set({
  userId: USER_ID,
  sessionId: workoutId,
  startedAt: STARTED_AT,
  finishedAt: FINISHED_AT,
  label: 'Serialized',
  materialized: false,
  exercises: [{
    exerciseId: 'bench-press',
    exerciseSource: 'global',
    name: 'Bench Press',
    sets: [{ weight: 80, reps: 5 }],
  }],
})
```

- [ ] **Step 2: Dodać failing test legacy inicjalizacji**

```ts
it('initializes a missing legacy fence before projection writes', async () => {
  await seedWorkoutWithoutTombstone('serialization-legacy')

  await materializeWorkoutForUser(USER_ID, 'serialization-legacy', { db })

  const tombstone = await db.collection('closedSessions')
    .doc('serialization-legacy')
    .get()
  expect(tombstone.data()).toMatchObject({
    userId: USER_ID,
    sessionId: 'serialization-legacy',
    outcome: 'finished',
    workoutId: 'serialization-legacy',
    projectionState: 'ready',
    projectionRevision: 1,
    projectionExerciseKeys: [{
      exerciseSource: 'global',
      exerciseId: 'bench-press',
    }],
  })
})
```

- [ ] **Step 3: Dodać failing test starej rewizji**

```ts
it('rejects a paused materialization after the fence revision changes', async () => {
  const workoutId = 'serialization-stale'
  await seedWorkoutWithFence(workoutId, {
    projectionState: 'pending',
    projectionRevision: 1,
  })
  const paused = deferred()
  const release = deferred()

  const materializing = materializeWorkoutForUser(USER_ID, workoutId, {
    db,
    expectedRevision: 1,
    checkpoints: {
      beforeExerciseSessions: async () => {
        paused.resolve()
        await release.promise
      },
    },
  })

  await paused.promise
  await db.collection('closedSessions').doc(workoutId).update({
    projectionRevision: 2,
  })
  release.resolve()

  await expect(materializing).rejects.toMatchObject({
    status: 409,
    code: 'projection_superseded',
  })
  expect((await db.collection('exerciseSessions')
    .where('workoutId', '==', workoutId).get()).empty).toBe(true)
})
```

- [ ] **Step 4: Uruchomić integrację i potwierdzić RED**

Run:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
firebase emulators:exec --only firestore --project demo-ironlog \
  "vitest run --config vitest.workout-integration.config.ts tests/integration/workoutProjectionSerialization.integration.test.ts"
```

Expected: FAIL — brak legacy fence'a i brak kontroli `expectedRevision`.

- [ ] **Step 5: Przygotować spójny fence przed materializacją**

W `api/_lib/workoutProjection.ts` rozszerzyć opcje:

```ts
export interface MaterializationReviewOptions {
  db?: Firestore
  expectedRevision?: number
  checkpoints?: MaterializationReviewCheckpoints
}
```

`prepareMaterialization` ma w transakcji:

- odczytać workout i tombstone;
- potwierdzić właściciela i zakończony workout;
- odrzucić `deleted`;
- dla legacy tombstone'a bez żadnego pola projekcji uzupełnić fence;
- dla brakującego tombstone'a utworzyć kompatybilny `finished`;
- odrzucić różnicę względem `expectedRevision`;
- zwrócić workout i aktualną rewizję.

Legacy `closedAt` ustawić na `workout.finishedAt`.

- [ ] **Step 6: Zapisać pełny affected-key set przed sesjami**

Po pobraniu istniejących sesji i zbudowaniu docelowych sesji policzyć:

```ts
const affectedExercises = normalizeProjectionExerciseKeys(
  preparedFence.projectionExerciseKeys,
  collectExerciseKeys(existingSessions),
  collectExerciseKeys(nextSessions),
)
```

`stageProjectionKeys` ma transakcyjnie sprawdzić oczekiwaną rewizję oraz
`pending | ready`, ustawić `pending` i zapisać pełną sumę. Dopiero po jego
sukcesie wywołać checkpoint `beforeExerciseSessions`.

- [ ] **Step 7: Chronić zapisy sesji i rekordów**

Dodać prywatny helper:

```ts
async function runGuardedProjectionTransaction<T>(
  database: Firestore,
  tombstoneRef: DocumentReference,
  expectedRevision: number,
  allowedState: 'pending' | 'deleted',
  apply: (transaction: Transaction) => Promise<T> | T,
): Promise<T>
```

Helper najpierw odczytuje tombstone, wymaga właściciela, oczekiwanej rewizji
i `allowedState`, a dopiero potem wykonuje `apply`.

- `replaceExerciseSessions` dzieli operacje maksymalnie po
  `MAX_BATCH_WRITES - 1`; każda porcja jest osobną guarded transaction.
- `recomputeRecordForExercise` wykonuje query sesji, a zapis lub delete
  rekordu zatwierdza guarded transaction dla `pending`.
- końcowa guarded transaction ustawia workout `materialized: true`, fence
  `ready` i redukuje klucze do bieżących ćwiczeń.

- [ ] **Step 8: Uruchomić nowe i istniejące integracje**

Run:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
firebase emulators:exec --only firestore --project demo-ironlog \
  "vitest run --config vitest.workout-integration.config.ts \
    tests/integration/workoutProjectionSerialization.integration.test.ts \
    tests/integration/workoutProjection.integration.test.ts"
```

Expected: PASS, w tym wszystkie istniejące checkpointy częściowej
materializacji i idempotentny retry.

- [ ] **Step 9: Commit**

```bash
git add \
  api/_lib/workoutProjection.ts \
  tests/integration/workoutProjectionSerialization.integration.test.ts \
  tests/integration/workoutProjection.integration.test.ts
git commit -m "fix: fence workout materialization revisions"
```

---

### Task 3: Rewizjonowany update

**Files:**
- Modify: `api/_lib/workoutProjection.ts`
- Modify/Test: `tests/integration/workoutProjectionSerialization.integration.test.ts`

**Interfaces:**
- Consumes: `materializeWorkoutForUser(..., { expectedRevision })`
- Produces: `WorkoutMutationReviewOptions`
- Changes: `updateFinishedWorkoutForUser(userId, workoutId, input, options?)`

- [ ] **Step 1: Dodać failing test rewizji update**

```ts
it('increments the revision and preserves old and new exercise keys', async () => {
  const workoutId = 'serialization-update'
  await seedReadyWorkout(workoutId, {
    exerciseId: 'bench-press',
    exerciseSource: 'global',
    name: 'Bench Press',
  })
  const materialize = vi.fn().mockResolvedValue(undefined)

  await updateFinishedWorkoutForUser(USER_ID, workoutId, {
    label: 'Updated',
    exercises: [{
      exerciseId: 'custom-curl',
      exerciseSource: 'user',
      name: 'Custom Curl',
      sets: [{ weight: 20, reps: 8 }],
    }],
  }, { db, materialize })

  const tombstone = await db.collection('closedSessions').doc(workoutId).get()
  expect(tombstone.data()).toMatchObject({
    projectionState: 'pending',
    projectionRevision: 2,
    projectionExerciseKeys: [
      { exerciseSource: 'global', exerciseId: 'bench-press' },
      { exerciseSource: 'user', exerciseId: 'custom-curl' },
    ],
  })
  expect(materialize).toHaveBeenCalledWith(USER_ID, workoutId, 2)
})
```

- [ ] **Step 2: Dodać failing test update po delete**

```ts
it('rejects an update after the fence is deleted', async () => {
  const workoutId = 'serialization-update-deleted'
  await seedDeletedFence(workoutId)

  await expect(updateFinishedWorkoutForUser(USER_ID, workoutId, {
    label: 'Too late',
    exercises: [benchPressExercise],
  }, { db })).rejects.toMatchObject({
    status: 409,
    code: 'workout_deleted',
  })
})
```

- [ ] **Step 3: Uruchomić testy i potwierdzić RED**

Run:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
firebase emulators:exec --only firestore --project demo-ironlog \
  "vitest run --config vitest.workout-integration.config.ts tests/integration/workoutProjectionSerialization.integration.test.ts"
```

Expected: FAIL — update nadal zapisuje workout poza transakcją i nie obsługuje
`db` ani injected materialize.

- [ ] **Step 4: Zaimplementować transakcyjny update**

W `api/_lib/workoutProjection.ts` dodać:

```ts
export interface WorkoutMutationReviewOptions {
  db?: Firestore
  materialize?: (
    userId: string,
    workoutId: string,
    expectedRevision: number,
  ) => Promise<void>
}
```

`updateFinishedWorkoutForUser` ma:

- używać `options.db ?? adminDb`;
- w jednej transakcji odczytać workout i tombstone; owned tombstone `deleted`
  zwraca `workout_deleted` także wtedy, gdy workout został już usunięty;
- zainicjalizować legacy fence tak samo jak materializacja;
- odrzucić `deleted`;
- obliczyć sumę bieżących danych workoutu, istniejących kluczy fence'a i
  nowych ćwiczeń;
- zwiększyć rewizję dokładnie o `1`;
- ustawić workout `materialized: false`, fence `pending`;
- zwrócić nową rewizję z transakcji;
- wywołać injected materialize albo
  `materializeWorkoutForUser(userId, workoutId, { db, expectedRevision })`.

Endpoint `api/update-workout.ts` pozostaje bez zmian, ponieważ opcje są
testowym i wewnętrznym seamem.

- [ ] **Step 5: Dodać konkurencyjne dwa update'y**

Dodać test, który uruchamia dwa update'y i oczekuje rewizji `3`. Następnie
wywołać materializację z rewizją `2` i potwierdzić:

```ts
await expect(materializeWorkoutForUser(USER_ID, workoutId, {
  db,
  expectedRevision: 2,
})).rejects.toMatchObject({
  status: 409,
  code: 'projection_superseded',
})
```

Workout i projekcja po materializacji rewizji `3` muszą odpowiadać wyłącznie
drugiemu update'owi.

- [ ] **Step 6: Uruchomić targeted integrację**

Run:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
firebase emulators:exec --only firestore --project demo-ironlog \
  "vitest run --config vitest.workout-integration.config.ts tests/integration/workoutProjectionSerialization.integration.test.ts"
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add \
  api/_lib/workoutProjection.ts \
  tests/integration/workoutProjectionSerialization.integration.test.ts
git commit -m "fix: serialize finished workout updates"
```

---

### Task 4: Terminalny i idempotentny delete

**Files:**
- Modify: `api/_lib/workoutProjection.ts`
- Modify: `tests/review/support/faultOutcomes.ts`
- Modify/Test: `tests/integration/workoutProjectionSerialization.integration.test.ts`

**Interfaces:**
- Consumes: fence state `deleted`
- Produces: `DeletionReviewCheckpoints`
- Produces: `DeleteWorkoutReviewOptions`
- Changes: `deleteFinishedWorkoutForUser(userId, workoutId, options?)`

- [ ] **Step 1: Rozszerzyć nazwane checkpointy**

W `tests/review/support/faultOutcomes.ts` dodać:

```ts
| 'failed_after_delete_claim'
| 'failed_after_delete_sessions'
| 'failed_before_delete_records'
```

- [ ] **Step 2: Dodać failing test delete wygrywającego z materializacją**

```ts
it('keeps delete terminal when an older materialization resumes', async () => {
  const workoutId = 'serialization-delete-wins'
  await seedWorkoutWithFence(workoutId, {
    projectionState: 'pending',
    projectionRevision: 1,
  })
  const paused = deferred()
  const release = deferred()

  const materializing = materializeWorkoutForUser(USER_ID, workoutId, {
    db,
    expectedRevision: 1,
    checkpoints: {
      beforeExerciseSessions: async () => {
        paused.resolve()
        await release.promise
      },
    },
  })

await paused.promise
await deleteFinishedWorkoutForUser(USER_ID, workoutId, { db, now: () => 999 })
release.resolve()

  await expect(materializing).rejects.toMatchObject({
    status: 409,
    code: 'workout_deleted',
  })
  expect((await db.collection('workouts').doc(workoutId).get()).exists).toBe(false)
  expect((await db.collection('exerciseSessions')
    .where('workoutId', '==', workoutId).get()).empty).toBe(true)
})
```

Powtórzyć ten sam przeplot z pauzą na `afterExerciseSessions`. Delete ma
usunąć częściowo zapisaną projekcję, a wznowiona materializacja ma zostać
odrzucona przed zapisem rekordów lub końcowym `materialized: true`.

- [ ] **Step 3: Dodać failing test update rozpoczętego przed delete**

Injected `materialize` w `updateFinishedWorkoutForUser` ma zatrzymać się po
zatwierdzeniu transakcji update'u. W tym czasie wykonać delete, następnie
wznowić rzeczywistą materializację z rewizją zwróconą przez update. Oczekiwać
`workout_deleted` oraz braku workoutu, sesji i rekordów tej rewizji.

- [ ] **Step 4: Dodać failing test retry po claimie**

```ts
it('finishes cleanup on retry after delete was already claimed', async () => {
  const workoutId = 'serialization-delete-retry'
  await seedMaterializedWorkoutWithRecord(workoutId)

  await expect(deleteFinishedWorkoutForUser(USER_ID, workoutId, {
    db,
    now: () => 999,
    checkpoints: {
      afterDeleteClaim: () => {
        throw new ReviewFault('failed_after_delete_claim')
      },
    },
  })).rejects.toEqual(new ReviewFault('failed_after_delete_claim'))

  expect((await db.collection('workouts').doc(workoutId).get()).exists).toBe(false)
  expect((await db.collection('closedSessions').doc(workoutId).get()).data())
    .toMatchObject({ projectionState: 'deleted', deletedAt: 999 })

  await deleteFinishedWorkoutForUser(USER_ID, workoutId, { db, now: () => 1_000 })
  await deleteFinishedWorkoutForUser(USER_ID, workoutId, { db, now: () => 1_001 })

  expect((await db.collection('exerciseSessions')
    .where('workoutId', '==', workoutId).get()).empty).toBe(true)
  expect((await db.collection('records')
    .doc(`${USER_ID}_global_bench-press`).get()).exists).toBe(false)
})
```

- [ ] **Step 5: Dodać failing test pełnej sumy kluczy**

Seed tombstone'a `pending` z kluczami `bench-press` i `custom-curl`, ale
pozostawić w `exerciseSessions` tylko `custom-curl` oraz stary rekord
`bench-press`. Po delete oba rekordy muszą zostać przeliczone, a stary rekord
`bench-press` usunięty.

- [ ] **Step 6: Utrwalić własność i tombstone `discarded`**

Dodać dwa przypadki:

- cudzy workout albo tombstone kończy się `403 resource_owner_mismatch` i nie
  zmienia żadnego dokumentu;
- `outcome: 'discarded'` nie jest inicjalizowany jako fence workoutu i kończy
  się istniejącym `409 closure_conflict`.

- [ ] **Step 7: Uruchomić integrację i potwierdzić RED**

Run:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
firebase emulators:exec --only firestore --project demo-ironlog \
  "vitest run --config vitest.workout-integration.config.ts tests/integration/workoutProjectionSerialization.integration.test.ts"
```

Expected: FAIL — delete wymaga istniejącego workoutu i nie ustawia terminalnego
fence'a.

- [ ] **Step 8: Zaimplementować claim delete**

W `api/_lib/workoutProjection.ts` dodać:

```ts
export interface DeletionReviewCheckpoints {
  afterDeleteClaim?(): void | Promise<void>
  afterDeleteSessions?(): void | Promise<void>
  beforeDeleteRecords?(): void | Promise<void>
}

export interface DeleteWorkoutReviewOptions {
  db?: Firestore
  now?: () => number
  checkpoints?: DeletionReviewCheckpoints
}
```

Pierwsza transakcja:

- dla istniejącego workoutu potwierdza właściciela, inicjalizuje legacy fence,
  zwiększa rewizję, zapisuje `deleted`, `deletedAt` i pełne znane klucze,
  usuwa workout;
- dla istniejącego owned tombstone'a `deleted` zwraca zapisaną rewizję i
  klucze bez błędu;
- dla tombstone'a `discarded`, cudzego właściciela albo braku obu dokumentów
  zachowuje odpowiednio konflikt, `403` albo błąd nieistniejącego zasobu.

- [ ] **Step 9: Zaimplementować idempotentny cleanup**

Po claimie:

1. wywołać `afterDeleteClaim`;
2. pobrać wszystkie sesje workoutu;
3. transakcyjnie dołączyć ich klucze do tombstone'a `deleted`;
4. usuwać sesje porcjami przez guarded transaction dla stanu `deleted`;
5. wywołać `afterDeleteSessions`, potem `beforeDeleteRecords`;
6. przeliczyć każdy zapisany klucz przez guarded record transaction dla
   stanu `deleted`.

`deletedAt` z pierwszego claimu nie zmienia się podczas retry.

- [ ] **Step 10: Dodać pozostałe checkpointy retry**

Dodać przypadki `failed_after_delete_sessions` i
`failed_before_delete_records`. Każdy:

- potwierdza stan po awarii;
- wykonuje pierwszy retry do pełnej konwergencji;
- wykonuje drugi retry i porównuje logiczny snapshot bez zmiennych timestampów.

- [ ] **Step 11: Uruchomić pełną integrację workoutu**

Run:

```bash
npm run test:integration:workout
```

Expected: wszystkie pliki integracyjne PASS; brak retry runnera.

- [ ] **Step 12: Commit**

```bash
git add \
  api/_lib/workoutProjection.ts \
  tests/review/support/faultOutcomes.ts \
  tests/integration/workoutProjectionSerialization.integration.test.ts
git commit -m "fix: make workout deletion terminal"
```

---

### Task 5: Gate, review i closeout Fazy 8B

**Files:**
- Modify after verified gates: `docs/roadmap/ROADMAP.md`
- Modify after verified gates: `docs/roadmap/specs/2026-07-29-phase-8b-workout-projection-serialization-design.md`
- Modify after verified gates: `docs/roadmap/plans/2026-07-29-phase-8b-workout-projection-serialization.md`

**Interfaces:**
- Consumes: wszystkie poprzednie commity i kryteria `WORKOUT-RACE-01–03`
- Produces: zweryfikowany lokalny closeout bez pushu ani deployu

- [ ] **Step 1: Uruchomić targeted unit**

```bash
npx vitest run \
  api/_lib/__tests__/workoutProjectionFence.test.ts \
  api/_lib/__tests__/workoutValidation.test.ts
```

Expected: PASS.

- [ ] **Step 2: Uruchomić pełną integrację workoutu**

```bash
npm run test:integration:workout
```

Expected: PASS dla closure, projection i serialization na świeżym emulatorze.

- [ ] **Step 3: Potwierdzić ochronę `closedSessions`**

```bash
npm run test:rules
```

Expected: PASS, w tym istniejący test braku read/write klienta dla
`closedSessions`.

- [ ] **Step 4: Uruchomić istniejący lifecycle na Auth + Firestore Emulator**

```bash
npm run test:e2e:workout
```

Expected: PASS bez retry. Ten gate potwierdza, że wewnętrzny fence nie zmienia
publicznego przepływu finalizacji, retry projekcji i usuwania.

- [ ] **Step 5: Uruchomić pełne statyczne gate'y**

```bash
npm run test:unit
npm run lint
npm run build
git diff --check
```

Expected: wszystkie komendy kończą się kodem `0`.

- [ ] **Step 6: Wykonać focused review zakresu**

Review obejmuje:

- każdą ścieżkę zapisu do `exerciseSessions`, `records` i `materialized`;
- zachowanie właściciela i tombstone'a `discarded`;
- pełną sumę kluczy po częściowym update;
- statusy `projection_superseded` i `workout_deleted`;
- brak nowej kolekcji, indeksu, zależności albo zmiany UI;
- rollback: brak cofnięcia do starego kodu po zapisaniu `deleted`.

Każde znalezisko P1/P2 zatrzymuje closeout, otrzymuje failing test i wraca do
właściwego tasku.

- [ ] **Step 7: Zastosować bounded closeout**

Przed zmianą statusów przeczytać
`project-convergence/references/closure.md`. Następnie:

- ustawić Fazę 8B na `DONE` wyłącznie po zielonych gate'ach i review;
- zapisać rzeczywiste wyniki testów w specu i planie;
- zachować Fazy 8C, 8D i 9 jako pozostałe zobowiązania parent roadmapy;
- nie archiwizować roadmapy, ponieważ program kończy dopiero Faza 9.

- [ ] **Step 8: Commit closeoutu**

```bash
git add \
  docs/roadmap/ROADMAP.md \
  docs/roadmap/specs/2026-07-29-phase-8b-workout-projection-serialization-design.md \
  docs/roadmap/plans/2026-07-29-phase-8b-workout-projection-serialization.md
git commit -m "docs: close phase 8b projection serialization"
```

- [ ] **Step 9: Handoff**

Raport końcowy ma podać:

- commity fazy;
- dokładne wyniki unit, integration, Auth + Firestore E2E, rules, lint i build;
- wynik focused review;
- `parent → Faza 8B → pozostałe 8C, 8D, 9`;
- informację, że push i deploy nadal wymagają zgody.

---

## Requirement Traceability

| Requirement | Tasks |
|---|---|
| `WORKOUT-RACE-01` — jeden fence i terminalny delete | 1–4 |
| `WORKOUT-RACE-02` — pełny cleanup i rekordy | 2, 4 |
| `WORKOUT-RACE-03` — deterministyczne przeploty i retry | 2–4 |
| Legacy bez migracji | 2–4 |
| Stabilne błędy i własność | 1, 3, 4 |
| Rollout i recovery | 4, 5 |
| Gate oraz closeout | 5 |

## Execution Stop Conditions

Zatrzymać wykonanie i wrócić do użytkownika, jeżeli:

- implementacja wymaga nowej kolekcji, indeksu albo kolejki;
- nie da się ochronić zapisu rekordu i fence'a w jednej transakcji;
- legacy workout wymaga migracji produkcyjnej;
- test ujawni możliwość utraty workoutu bez terminalnego tombstone'a;
- potrzebny jest push, deploy albo wyłączenie endpointów produkcyjnych.
