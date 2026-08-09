# CATALOG-01 — User Exercise Catalog Reliability Implementation Plan

> **For agentic workers:** Execute this plan task by task. Do not widen the scope, add a global cache, or add consumer-by-consumer copies of the same state machine.

**Goal:** Make failures of `getUserExercises` explicit and retryable without hiding the global exercise catalog, workout history, or exercise detail data.

**Architecture:** Extract the account-safe `DataState<Exercise[]>` lifecycle already proven in `ExercisesPage` into one small hook. Keep Firestore access in `userExercisesService`; keep the resource local to mounted consumers rather than introducing a Zustand cache. Pass the state itself into the shared picker, while read pages display one persistent partial-error notice and continue rendering independent data.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Firebase Web SDK, existing `DataState` and `ActionFeedback` primitives.

**Roadmap lineage:** `docs/roadmap/ROADMAP.md` → `CATALOG-01` → `RELEASE-01`

**Risk classification:** Elevated. The change affects shared exercise lookup in an active workout, plan editing, history, and exercise detail, but does not change Firestore documents, rules, indexes, or write APIs.

---

## Scope lock

In scope:

- one shared, account-safe state owner for `getUserExercises`;
- explicit loading/error/success state in `ExercisePicker`;
- nonblocking partial-error states in history and user exercise detail;
- migration of `ExercisesPage` from its duplicated loader to the shared owner;
- focused regression coverage, lint, build, and direct observation of one picker and one read view.

Out of scope:

- a global Zustand catalog store or cross-page cache;
- Firestore schema, rules, index, or API changes;
- broad copy/design work;
- repeated tests for the same retry button in every picker host;
- test-only failure switches shipped in the application bundle.

## Files

| Action | File | Responsibility |
|---|---|---|
| Create | `src/hooks/useUserExercises.ts` | Shared account-bound `DataState` lifecycle, retry, and guarded local mutation |
| Create | `src/hooks/__tests__/useUserExercises.test.tsx` | One contract suite for error, retry, and stale-account results |
| Modify | `src/pages/ExercisesPage.tsx` | Consume the hook and preserve create/update/delete synchronization |
| Modify | `src/pages/__tests__/ExercisesPageDataState.test.tsx` | Keep page mutation/account tests; update the picker contract test |
| Modify | `src/components/ExercisePicker.tsx` | Render global results during user-catalog loading/error and expose retry |
| Modify | `src/pages/WorkoutPage.tsx` | Replace toast-only catalog loading with the hook |
| Modify | `src/pages/TemplateEditorPage.tsx` | Replace toast-only catalog loading with the hook |
| Modify | `src/pages/WorkoutDetailPage.tsx` | Replace console-only catalog loading with the hook |
| Modify | `src/pages/HistoryPage.tsx` | Decouple workout history from user-catalog loading |
| Modify | `src/pages/__tests__/HistoryPage.test.tsx` | Prove history remains visible during a catalog failure |
| Modify | `src/pages/ExerciseDetailPage.tsx` | Decouple sessions/record from the user-catalog name lookup |
| Create | `src/pages/__tests__/ExerciseDetailCatalogState.test.tsx` | Prove detail data survives a catalog failure and retry restores metadata |
| Modify | `docs/roadmap/ROADMAP.md` | Record integration evidence and advance the roadmap after the gates |

## Task 1: Extract the existing catalog state owner

### Step 1: Write the failing hook contract

- [ ] Create `src/hooks/__tests__/useUserExercises.test.tsx` with one contract test that mocks `getUserExercises` and uses `renderHook`.
- [ ] In that single flow, cover only three behaviors:
  1. rejection produces `{ status: 'error' }` and `exercises: []`;
  2. `retry()` moves through loading and exposes the resolved list;
  3. a late response from UID A cannot replace UID B's result after rerender.

The test must assert observable state, not implementation refs:

```tsx
const { result, rerender } = renderHook(
  ({ uid }) => useUserExercises(uid),
  { initialProps: { uid: 'user-a' as string | null } },
)

await waitFor(() => expect(result.current.state.status).toBe('error'))

act(() => result.current.retry())
expect(result.current.state.status).toBe('loading')

rerender({ uid: 'user-b' })
```

- [ ] Run the new test and confirm it fails because the hook does not exist:

```bash
npx vitest run src/hooks/__tests__/useUserExercises.test.tsx
```

### Step 2: Implement the minimum shared hook

- [ ] Create `src/hooks/useUserExercises.ts` and reuse `DataState` plus `getUserExercises`.
- [ ] Keep the public contract concrete; do not add a generic resource framework:

```ts
export interface UseUserExercisesResult {
  state: DataState<Exercise[]>
  exercises: Exercise[]
  retry: () => void
  updateExercises: (
    operationUid: string,
    updater: (current: Exercise[]) => Exercise[],
  ) => void
}

export function useUserExercises(uid: string | null): UseUserExercisesResult
```

- [ ] Store `{ uid, state }` locally and derive `{ status: 'loading' }` whenever the stored UID differs from the current UID.
- [ ] Guard async completion with a monotonically increasing request ID and a mounted ref. Increment the request ID in effect cleanup so Strict Mode and account switches cannot publish stale results.
- [ ] Do not synchronously call `setState` at the start of `useEffect`; the project ESLint rule forbids that pattern. `retry()` may synchronously set loading because it is an event path.
- [ ] Implement `updateExercises` only for a matching successful UID:

```ts
const updateExercises = useCallback((operationUid, updater) => {
  setResource((current) => (
    current.uid === operationUid && current.state.status === 'success'
      ? {
          uid: current.uid,
          state: { status: 'success', data: updater(current.state.data) },
        }
      : current
  ))
}, [])
```

- [ ] Log a rejected service call once in the hook; consumers own persistent user feedback and must not add a second toast.

### Step 3: Replace the duplicated loader in `ExercisesPage`

- [ ] In `src/pages/ExercisesPage.tsx`, remove `UserExercisesResource`, request/mounted refs, `loadUserExercises`, and the load-error toast.
- [ ] Consume the hook directly:

```ts
const {
  state: userExercisesState,
  exercises: userExercises,
  retry: handleRetryUserExercises,
  updateExercises,
} = useUserExercises(user?.uid ?? null)
```

- [ ] Preserve the existing account guard around writes. After each successful service call, update local data through the hook:

```ts
updateExercises(operationUid, (current) => [created, ...current])
updateExercises(operationUid, (current) => (
  current.map((exercise) => exercise.id === updated.id ? updated : exercise)
))
updateExercises(operationUid, (current) => (
  current.filter((exercise) => exercise.id !== deletedId)
))
```

- [ ] Keep the current page-level loading, error, retry, disabled-create, and unknown-count UI. This task changes ownership, not presentation.
- [ ] Update `ExercisesPageDataState.test.tsx` so a read failure expects persistent page feedback without an additional toast. Keep the existing mutation and account-switch assertions.

### Step 4: Verify and commit Task 1

- [ ] Run:

```bash
npx vitest run src/hooks/__tests__/useUserExercises.test.tsx src/pages/__tests__/ExercisesPageDataState.test.tsx
npx eslint src/hooks/useUserExercises.ts src/hooks/__tests__/useUserExercises.test.tsx src/pages/ExercisesPage.tsx src/pages/__tests__/ExercisesPageDataState.test.tsx
git diff --check
```

- [ ] Commit only Task 1 files:

```bash
git add src/hooks/useUserExercises.ts src/hooks/__tests__/useUserExercises.test.tsx src/pages/ExercisesPage.tsx src/pages/__tests__/ExercisesPageDataState.test.tsx
git commit -m "fix: model user exercise catalog state"
```

## Task 2: Make the shared picker honest and keep every host usable

### Step 1: Write the representative picker regression

- [ ] Update the direct `ExercisePicker` coverage in `src/pages/__tests__/ExercisesPageDataState.test.tsx` to pass the new state contract.
- [ ] Add one test, shared by all picker hosts, where `userExercisesState` is an error. Assert:
  - a known global exercise remains selectable;
  - the partial-error message is visible;
  - clicking `Spróbuj ponownie` calls the supplied callback once.

```tsx
render(
  <ExercisePicker
    onSelect={onSelect}
    onClose={vi.fn()}
    userExercisesState={{ status: 'error', error: new Error('offline') }}
    onRetryUserExercises={onRetry}
  />,
)
```

- [ ] Run the test and confirm it fails against the old optional-array API.

### Step 2: Change `ExercisePicker` once

- [ ] In `src/components/ExercisePicker.tsx`, replace `userExercises?: Exercise[]` with:

```ts
interface Props {
  onSelect: (exerciseId: string, name: string, source: ExerciseSource) => void
  onClose: () => void
  userExercisesState: DataState<Exercise[]>
  onRetryUserExercises: () => void
}
```

- [ ] Derive user results only from successful data. Global search results must be computed and rendered in every state.
- [ ] Above the result grid, render existing `ActionFeedback`:

```tsx
{userExercisesState.status === 'loading' && (
  <ActionFeedback
    status="pending"
    message="Wczytywanie Twoich ćwiczeń…"
    className="mx-2 mb-2 sm:mx-1"
  />
)}
{userExercisesState.status === 'error' && (
  <ActionFeedback
    status="error"
    message="Nie udało się wczytać Twoich ćwiczeń. Katalog globalny nadal jest dostępny."
    onRetry={onRetryUserExercises}
    className="mx-2 mb-2 sm:mx-1"
  />
)}
```

- [ ] The empty-results message may appear only when the combined available results are empty. It must not imply that the user's catalog is empty while its state is loading or failed.

### Step 3: Migrate all three picker hosts

- [ ] In `WorkoutPage.tsx`, remove its local `userExercises` state/effect and toast-only error. Add:

```ts
const {
  state: userExercisesState,
  retry: retryUserExercises,
} = useUserExercises(user?.uid ?? null)
```

Pass `userExercisesState` and `onRetryUserExercises={retryUserExercises}` to `ExercisePicker`.

- [ ] In `TemplateEditorPage.tsx`, remove its local list/effect and toast-only error. Use the same hook result and pass the same two explicit picker props.
- [ ] In `WorkoutDetailPage.tsx`, remove its local list/effect and console-only error. Use the same hook result and pass the same two explicit picker props.
- [ ] Do not add page-level notices to these three pages: the error belongs inside the modal where the missing catalog matters.

### Step 4: Verify and commit Task 2

- [ ] Run the representative picker test plus existing host tests:

```bash
npx vitest run \
  src/pages/__tests__/ExercisesPageDataState.test.tsx \
  src/pages/__tests__/TemplateEditorAccessibility.test.tsx \
  src/pages/__tests__/WorkoutDetailActions.test.tsx \
  src/pages/__tests__/WorkoutStaleSessionFeedback.test.tsx
npx eslint src/components/ExercisePicker.tsx src/pages/WorkoutPage.tsx src/pages/TemplateEditorPage.tsx src/pages/WorkoutDetailPage.tsx
git diff --check
```

- [ ] Commit only Task 2 files:

```bash
git add src/components/ExercisePicker.tsx src/pages/WorkoutPage.tsx src/pages/TemplateEditorPage.tsx src/pages/WorkoutDetailPage.tsx src/pages/__tests__/ExercisesPageDataState.test.tsx
git commit -m "fix: keep exercise pickers usable on catalog errors"
```

## Task 3: Decouple read views from catalog lookup

### Step 1: Write the history partial-failure regression

- [ ] In `src/pages/__tests__/HistoryPage.test.tsx`, add one test where `getWorkoutHistory` resolves a visible workout and `getUserExercises` rejects.
- [ ] Assert that the workout remains visible, the page does not enter its whole-history error state, and this notice appears:

```text
Nie udało się wczytać Twoich ćwiczeń. Historia nadal jest dostępna, ale część kategorii może być niepełna.
```

- [ ] Resolve the next `getUserExercises` call, click the notice retry, and assert the notice disappears. Do not repeat generic button mechanics beyond this representative read-view test.

### Step 2: Decouple `HistoryPage`

- [ ] Replace the local `userExercises` state and `Promise.all(...catch(() => []))` with:

```ts
const {
  state: userExercisesState,
  exercises: userExercises,
  retry: retryUserExercises,
} = useUserExercises(user?.uid ?? null)
```

- [ ] Make `loadHistory` await only `getWorkoutHistory`. A catalog failure must not set `loadError`, clear workouts, or change the history retry path.
- [ ] Render `ActionFeedback` near the history controls when `userExercisesState.status === 'error'`, using the message above and `onRetry={retryUserExercises}`.
- [ ] Continue deriving known global categories and workout names. User-exercise category enrichment may be incomplete until retry succeeds; do not display a fake user-exercise count.

### Step 3: Write the exercise-detail partial-failure regression

- [ ] Create `src/pages/__tests__/ExerciseDetailCatalogState.test.tsx` with one user-source route test.
- [ ] Mock sessions and record as successful while the first catalog read rejects. Assert:
  - session/record content remains visible;
  - the heading falls back to the route ID rather than blanking the page;
  - a partial catalog error is shown;
  - one retry resolving the matching custom exercise replaces the fallback with its name.

### Step 4: Decouple `ExerciseDetailPage`

- [ ] Remove the `getUserExercises` call from the effect that loads sessions and record.
- [ ] Load the catalog only for user-source routes:

```ts
const userCatalog = useUserExercises(
  source === 'user' ? user?.uid ?? null : null,
)

const userExercise = source === 'user' && userCatalog.state.status === 'success'
  ? userCatalog.exercises.find((exercise) => exercise.id === id) ?? null
  : null
```

- [ ] Keep the existing full-page error only for `getExerciseSessions` or `getExerciseRecord` failures.
- [ ] On user-source catalog error, render `ActionFeedback` inside the hero with:

```tsx
<ActionFeedback
  status="error"
  message="Nie udało się wczytać nazwy i kategorii tego ćwiczenia. Historia i rekordy nadal są dostępne."
  onRetry={userCatalog.retry}
/>
```

- [ ] Do not request the user catalog for global exercise routes.

### Step 5: Verify and commit Task 3

- [ ] Run:

```bash
npx vitest run src/pages/__tests__/HistoryPage.test.tsx src/pages/__tests__/ExerciseDetailCatalogState.test.tsx
npx eslint src/pages/HistoryPage.tsx src/pages/ExerciseDetailPage.tsx src/pages/__tests__/HistoryPage.test.tsx src/pages/__tests__/ExerciseDetailCatalogState.test.tsx
git diff --check
```

- [ ] Commit only Task 3 files:

```bash
git add src/pages/HistoryPage.tsx src/pages/ExerciseDetailPage.tsx src/pages/__tests__/HistoryPage.test.tsx src/pages/__tests__/ExerciseDetailCatalogState.test.tsx
git commit -m "fix: expose partial exercise catalog failures"
```

## Task 4: Integration gate and roadmap evidence

### Step 1: Run the focused and repository gates

- [ ] Run the complete touched-flow set:

```bash
npx vitest run \
  src/hooks/__tests__/useUserExercises.test.tsx \
  src/pages/__tests__/ExercisesPageDataState.test.tsx \
  src/pages/__tests__/HistoryPage.test.tsx \
  src/pages/__tests__/ExerciseDetailCatalogState.test.tsx \
  src/pages/__tests__/TemplateEditorAccessibility.test.tsx \
  src/pages/__tests__/WorkoutDetailActions.test.tsx \
  src/pages/__tests__/WorkoutStaleSessionFeedback.test.tsx
npm run test:unit
npm run lint
npm run build
git diff --check
```

- [ ] Inspect the final diff and confirm:
  - every production caller of `getUserExercises` routes through the hook;
  - only `userExercisesService.ts` calls Firestore for this resource;
  - no caller uses `.catch(() => [])` for the catalog;
  - no new dependency, store, Firestore rule, or schema change exists.

Use:

```bash
rg -n "getUserExercises|catch\(\(\) => \[\]\)" src
git diff --stat
git diff -- src
```

### Step 2: Directly observe the two required surfaces

- [ ] Use the in-app Browser as the sole runtime observation surface against the local app.
- [ ] With an authenticated local session, use temporary Browser request interception to fail only Firestore requests whose POST body targets `userExercises`. Do not commit a failure flag or test bridge to application code.
- [ ] Observe one picker:
  - open `ExercisePicker` from a workout flow;
  - the partial-error notice and retry are visible;
  - a global exercise can still be searched and selected;
  - no new console error originates from rendering or retry handling.
- [ ] Observe one read view on `/history`:
  - saved workouts remain visible;
  - the catalog notice does not replace the history with an empty state;
  - retry succeeds after removing interception.
- [ ] If targeted request interception is unavailable, record the direct-observation item as `Pending` with that exact reason. Do not weaken the gate by substituting screenshots, shell output, or a permanent test-only switch.

### Step 3: Record integration status

- [ ] Update `docs/roadmap/ROADMAP.md`:
  - set `CATALOG-01` to `INTEGRATION PENDING` after local gates pass;
  - record exact test counts, lint/build results, and the two observations;
  - keep `RELEASE-01` blocked until push and production approval.
- [ ] Commit the evidence:

```bash
git add docs/roadmap/ROADMAP.md
git commit -m "docs: record catalog reliability gate"
```

## Task 5: Release and closeout after explicit approval

This task is not authorized by plan approval alone. Push and production deploy require the user's release approval.

- [ ] Confirm `git status --short` is clean and `HEAD` contains Tasks 1–4.
- [ ] Push `main` only after approval:

```bash
git push origin main
```

- [ ] Deploy through the established production path:

```bash
/opt/homebrew/bin/vercel --prod --yes
```

- [ ] Confirm the deployment reaches `Ready` and the alias remains `https://ironlog-coach.vercel.app`.
- [ ] Observe the public production login without console errors. Observe authenticated production catalog behavior only if a safe session is available; otherwise record it as `Pending` rather than replacing it with local evidence.
- [ ] Update `docs/roadmap/ROADMAP.md` with commit IDs, deployment ID, URL, evidence, and rollback.
- [ ] Mark `CATALOG-01` `DONE` and `RELEASE-01` ready for its final closeout decision.
- [ ] Delete this detailed plan only after the closeout evidence is committed; the roadmap remains the compact durable record.

## Rollback

- Code rollback: revert the three implementation commits in reverse order.
- Production rollback: restore the prior Vercel deployment.
- Data rollback: none. This plan does not modify persisted documents, rules, indexes, or server write paths.

## Definition of done

- every user-catalog consumer distinguishes loading, success-empty, and error;
- a catalog failure never hides global picker results, workout history, sessions, or records;
- retry works without a page reload;
- late results from another account cannot populate the current account;
- focused tests, full unit suite, lint, build, and diff check pass;
- one picker and one read view are directly observed with a forced catalog failure, or the unavailable direct gate is recorded honestly as `Pending`;
- no global store, new dependency, Firestore change, or duplicated per-host retry test was added.
