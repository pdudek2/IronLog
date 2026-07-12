# Phase 2 broad final review — final fixes report

**Status:** implementation complete; final verification and commit recorded below.

**Scope constraints observed:** no push, deploy, Firestore rules publication, production mutation, or `RELEASE-08` closure.

## Finding → fix → regression test

1. **Readiness save crossing midnight / stale UID**
   - `ReadinessWidget.handleSaved` derives the resource key from `saved.userId` and `saved.date`, rather than the render-time date.
   - It accepts the result only when `saved.userId` equals the current authenticated UID.
   - It advances `requestedKeyRef` to the saved key so a subsequent same-day `visibilitychange` does not issue a redundant read.
   - Tests: `keys a save by the saved entry date when submission crosses midnight`; `ignores a late save from the previous user`.

2. **Exercises create/update/delete crossing an auth identity change**
   - Each mutation captures `operationUid` before awaiting the service.
   - Each resource updater requires both `current.uid === operationUid` and a successful resource state.
   - Current-UID guards prevent stale success/error UI side effects after the await.
   - UID changes invalidate the create/edit form and delete confirmation state before children render for the new user.
   - Test: `does not apply a late create result to a different user resource`, including closure of the pending form. The same operation-UID guard is applied symmetrically to update and delete; no additional brittle modal-service tests were added.

3. **Stale readiness rejection logging**
   - The mounted/request guard now runs before `console.error`.
   - Tests: `does not log a load rejection after unmount`; `logs the current load rejection`.

4. **Plan completion metadata**
   - All executed plan steps and Definition of Done entries are checked.
   - The plan contains an explicit COMPLETE status and points to this report.
   - Roadmap and spec preserve the historical Task 5 count of 224 and identify the final-review increase to 229.

## TDD evidence

### RED

Command:

```text
npm run test:unit -- src/pages/__tests__/ReadinessWidget.test.tsx src/pages/__tests__/ExercisesPageDataState.test.tsx
```

Observed: 2 files failed; 4 failed / 9 passed. Expected failures were midnight save stuck in loading, previous-user save replacing the new-user resource, stale rejection logging after unmount, and the create race. The create test was then corrected twice to wait for the enabled/re-rendered button; its final isolated RED failed on the intended assertion because the user-A dialog remained present after switching to user B.

### GREEN

Command:

```text
npm run test:unit -- src/pages/__tests__/ReadinessWidget.test.tsx src/pages/__tests__/ExercisesPageDataState.test.tsx
```

Observed after production fixes: 2 files passed; 13/13 tests passed.

## Commands and outcomes

- `git status --short && git log -1 --oneline ...` — clean starting tree; HEAD `7a9f979`.
- focused RED command above — expected regression failures observed.
- isolated create RED — expected dialog-still-open failure observed after test synchronization was corrected.
- focused GREEN — 2 files, 13/13 tests passed.
- first `npm run test:unit` — 35 files, 229/229 tests passed.
- first parallel `npm run lint` / `npm run build` — build passed; lint failed on two `react-hooks/refs` errors caused by render-time ref synchronization.
- ref synchronization moved to effects that do not set React state.
- second focused run — 2 files, 13/13 tests passed.
- second `npm run lint` — passed with zero errors or warnings.
- final fresh gates are recorded in the next section.

## Final verification

- Focused unit: 2 files, 13/13 passed.
- Full unit: 35 files, 229/229 passed.
- Lint: passed.
- Build: passed; Vite emitted only the pre-existing chunk-size advisory.
- `git diff --check`: passed.

## Files changed

- `src/components/ReadinessWidget.tsx`
- `src/pages/ExercisesPage.tsx`
- `src/pages/__tests__/ReadinessWidget.test.tsx`
- `src/pages/__tests__/ExercisesPageDataState.test.tsx`
- `docs/roadmap/ROADMAP.md`
- `docs/roadmap/specs/2026-07-12-phase-2-honest-data-states-design.md`
- `docs/roadmap/plans/2026-07-12-phase-2-honest-data-states.md`
- `.superpowers/sdd/final-fixes-report.md`

## Self-review

- Confirmed readiness uses saved identity/date and updates the requested-key dedupe state.
- Confirmed stale/unmounted load rejection exits before logging or state update.
- Confirmed create, update, and delete all capture and guard the operation UID; stale delete failures also avoid user-B error UI.
- Confirmed auth identity change clears form/edit/delete interaction state without synchronous state changes in an effect.
- Confirmed no service architecture, Firestore schema/rules, dependencies, or release scope changed.
- Confirmed documentation distinguishes the historical 224-test Task 5 gate from the final 229-test gate.

## Commit

Single containing commit: `fix: guard stale user data mutations`.

## Concerns

- No blocking concern.
- Vite retains its existing advisory for chunks over 500 kB; this change does not materially affect bundle architecture.
- Update/delete use the same reviewed UID guard as create; only create received the additional end-to-end component race test to keep the suite focused and non-brittle.

## Follow-up final review: synchronous auth snapshot guards

### Finding and fix

The `currentUidRef` introduced by the first fix wave was synchronized in a passive effect. An auth-store identity change could therefore be visible to async completion code before React rerendered and flushed the effect. `ReadinessWidget` and all create/update/delete completion guards now read `useAuthStore.getState().user?.uid` directly at callback/continuation time. The ref and its synchronization effects were removed; the independent `current.uid === operationUid` resource guards remain.

### TDD RED

The existing stale-save and stale-create tests were tightened without adding tests. Their mock stores now expose `.getState()`, mutate the underlying auth user, and complete the callback/promise before rerendering user B.

Command:

```text
npm run test:unit -- src/pages/__tests__/ReadinessWidget.test.tsx src/pages/__tests__/ExercisesPageDataState.test.tsx
```

Observed on `currentUidRef`: 2 files failed; 2 failed / 11 passed. The readiness callback accepted user A and left the widget loading against user B; create A emitted `Ćwiczenie dodane!` before user B rerendered.

### TDD GREEN and final verification

- Focused unit: 2 files, 13/13 passed.
- Test count unchanged: 35 files / 229 tests. Per follow-up instruction, the full unit suite was not rerun because no test was added or removed; the preceding full gate in this report remains 229/229.
- `npm run lint`: passed.
- `npm run build`: passed; only the existing Vite chunk-size advisory remains.
- `git diff --check`: passed.
- No push, deploy, rules publication, or `RELEASE-08` change.

Follow-up containing commit: `fix: read current auth state for async guards`.
