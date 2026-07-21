# Phase 5 Feedback, Copy, and Interface Integrity Implementation Plan

**Status:** IMPLEMENTATION COMPLETE — AWAITING BRANCH INTEGRATION

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Use `superpowers:test-driven-development` for every behavior change and `superpowers:verification-before-completion` before claiming a task or the phase complete.

**Goal:** Usunąć fałszywe, znikające albo zasłonięte stany interfejsu objęte Fazą 5, bez redesignu Puls, zmian modelu danych ani globalnego systemu mutacji.

**Architecture:** Każda mutacja zachowuje lokalny stan operacji przy stronie albo hooku, który zna jej cel. Wspólny `ActionFeedback` odpowiada wyłącznie za semantyczną prezentację `pending` i `error`; nie zna Firebase ani logiki retry. Start planu zachowuje pełną tożsamość planu, dnia, decyzji replace i kontrolki źródłowej. Mobilne akcje szczegółów treningu są jedną powierzchnią DOM zmieniającą pozycję inline/fixed na podstawie stabilnego anchora.

**Tech Stack:** React 19, TypeScript 5.9, React Router 7 Data Router, Zustand, Vite 8, Vitest 4, Testing Library, Playwright 1.59, Firebase Auth/Firestore, Firebase Admin SDK, Tailwind CSS 4 + `src/index.css`.

**Approved design:** `docs/roadmap/specs/2026-07-20-phase-5-feedback-copy-interface-integrity-design.md`

## Global Constraints

- Zakres obejmuje wyłącznie `FEEDBACK-01–04`, `NAV-01`, `MOBILE-07`, `A11Y-09–10`, `COPY-01–03`, `DEMO-01` i `TEST-04`.
- Zachować kierunek Puls i tryb `utility / Polish`; to nie jest redesign ani początek strategicznych punktów `LATER-08–10`.
- Statusy i typy w kodzie są po angielsku (`idle`, `pending`, `error`, `new-pristine`, `persisted-clean`); widoczne copy pozostaje po polsku.
- Nie dodawać globalnego store/providera operacji asynchronicznych ani nowego frameworka zapytań.
- `ActionFeedback` jest prezentacyjny: nie importuje serwisów, routera, Firebase ani Zustand.
- Firestore pozostaje wyłącznie w `src/lib/`, istniejących hookach i skrypcie administracyjnym; komponenty nie wywołują bezpośrednio `getDoc`, `setDoc` ani Admin SDK.
- Zachować lock, generation guard, unmount guard, konflikt aktywnej sesji i `hydrateFromDoc` w `useTemplateWorkoutLaunch`.
- Nie ustawiać synchronicznie loading state na początku `useEffect`; stan początkowy wyliczać w `useState` albo zmieniać w jawnej akcji użytkownika.
- Nie dodawać `'use client'`; aplikacja jest Vite SPA.
- Nie zmieniać schematu danych, Firestore Rules, Vercel Functions ani publicznego API produktu.
- `--accent: #f0435a` pozostaje bez zmian; ciemniejszy gradient jest osobnym tokenem primary CTA.
- Jedyny baseline pikselowy tej fazy to pusta strona Planów w projektach Playwright `desktop` i `mobile`.
- Reseed demo jest osobną, destrukcyjną operacją. Implementacja i dry-run nie upoważniają do uruchomienia zapisu. Bezpośrednio przed rzeczywistym seedem trzeba zatrzymać pracę i uzyskać osobne potwierdzenie Patryka.
- Nie stage'ować ani nie commitować należącego do użytkownika pliku `docs/audits/2026-07-14-senior-design-review.md` bez osobnej zgody.
- Nie wykonywać pushu, deployu ani czynności `RELEASE-08` bez osobnej zgody.
- Commity nie mogą zawierać trailerów AI ani `Co-Authored-By`.

## File Structure

### New files

- `src/components/ActionFeedback.tsx` — wspólny, prezentacyjny status `pending/error` z poprawną semantyką live regionu.
- `src/components/__tests__/ActionFeedback.test.tsx` — role, spinner, retry i dismiss.
- `src/hooks/__tests__/useTemplateWorkoutLaunch.test.tsx` — tożsamość operacji, konflikt, retry, lock, generation i unmount.
- `src/pages/__tests__/TemplatesPageActions.test.tsx` — feedback startu i trwałe usuwanie właściwej karty.
- `src/components/WorkoutDetailMobileActions.tsx` — jedna mobilna powierzchnia inline/fixed oparta o anchor.
- `src/components/__tests__/WorkoutDetailMobileActions.test.tsx` — geometria observera, brak przedwczesnego fixed i jedna kopia akcji.
- `src/pages/__tests__/WorkoutDetailActions.test.tsx` — trwały błąd usunięcia treningu i retry tego samego id.
- `src/lib/workoutCopy.ts` — semantyczne zdania o dominującej kategorii treningu.
- `src/lib/__tests__/workoutCopy.test.ts` — wszystkie znane kategorie i bezpieczny fallback.
- `tests/e2e/contrast.spec.ts` — obliczony kontrast tokenów oraz rzeczywistych stanów primary CTA.
- `tests/e2e/templates.visual.spec.ts` — jedyny prawdziwy baseline: puste Plany desktop/mobile.
- `scripts/demoSeedContract.ts` — czysty kontrakt preflightu i walidacji snapshotu demo.
- `scripts/__tests__/demoSeedContract.test.ts` — blokada błędnego konta/projektu i walidacja danych.

### Renamed files

- `tests/e2e/audit-screenshots.spec.ts` → `tests/e2e/diagnostic-capture.spec.ts` — capture diagnostyczny, nie regresja pikselowa.

### Modified files

- `src/hooks/useTemplateWorkoutLaunch.ts`
- `src/pages/TemplatesPage.tsx`
- `src/pages/DashboardPage.tsx`
- `src/pages/TemplateEditorPage.tsx`
- `src/components/TemplateSaveDock.tsx`
- `src/pages/WorkoutDetailPage.tsx`
- `src/components/TopNav.tsx`
- `src/components/BottomNav.tsx`
- `src/router/index.tsx`
- `src/pages/ProgressPage.tsx`
- `src/pages/WorkoutPage.tsx`
- `src/index.css`
- `src/components/__tests__/TemplateSaveDock.test.tsx`
- `src/pages/__tests__/TemplatesPageDataState.test.tsx`
- `src/pages/__tests__/TemplateEditorAccessibility.test.tsx`
- `src/pages/__tests__/DashboardProjectionStatus.test.tsx`
- `src/pages/__tests__/ProgressPage.test.tsx`
- `src/pages/__tests__/SharedAccessibilityContracts.test.tsx`
- `src/lib/__tests__/polishPlural.test.ts`
- `tests/e2e/template-launch.spec.ts`
- `tests/e2e/templates.spec.ts`
- `tests/e2e/protected-shell.spec.ts`
- `tests/e2e/workout-detail-mobile.spec.ts`
- `tests/e2e/workout-guard.spec.ts`
- `tests/e2e/workout-lifecycle.spec.ts`
- `tests/e2e/workout-mobile.spec.ts`
- `tests/e2e/smoke.spec.ts`
- `tests/e2e/support/appReady.ts`
- `scripts/seed-demo.ts`
- `package.json`
- `docs/roadmap/ROADMAP.md`
- `docs/roadmap/specs/2026-07-20-phase-5-feedback-copy-interface-integrity-design.md`
- `WORKING_CONTEXT.md`
- this plan

---

## Task 0: Establish a clean, reproducible baseline

**Files:**
- Read: `docs/roadmap/specs/2026-07-20-phase-5-feedback-copy-interface-integrity-design.md`
- Read: `docs/roadmap/ROADMAP.md:312`
- Verify only: current worktree

- [x] **Step 1: Confirm branch and preserve user-owned files**

Run:

```bash
git branch --show-current
git status --short
```

Expected: branch `phase-5-feedback-integrity`; the untracked senior review may be present and remains untouched.

- [x] **Step 2: Run the pre-change gates**

```bash
npm run test:unit
npm run lint
npm run build
```

Expected: 261 or more existing unit tests pass, lint exits 0, build exits 0. Record any pre-existing failure before changing code; do not silently absorb it into Phase 5.

- [x] **Step 3: Create the implementation branch only when execution begins**

```bash
git switch -c phase-5-feedback-integrity
```

Expected: a plain descriptive branch, with no automatic prefix.

No commit in this task.

---

## Task 1: Add the reusable `ActionFeedback` presentation contract

**Files:**
- Create: `src/components/ActionFeedback.tsx`
- Create: `src/components/__tests__/ActionFeedback.test.tsx`
- Modify: `src/index.css`

**Public interface:**

```ts
export type ActionFeedbackStatus = 'pending' | 'error'

export interface ActionFeedbackProps {
  id?: string
  status: ActionFeedbackStatus
  message: string
  onRetry?: () => void
  onDismiss?: () => void
  className?: string
}
```

- [x] **Step 1: Write failing semantic tests**

Cover exactly:

```tsx
render(<ActionFeedback status="pending" message="Uruchamiam…" />)
expect(screen.getByRole('status')).toHaveTextContent('Uruchamiam…')
expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')

render(
  <ActionFeedback
    id="launch-error"
    status="error"
    message="Nie udało się uruchomić planu."
    onRetry={retry}
    onDismiss={dismiss}
  />,
)
expect(screen.getByRole('alert')).toHaveAttribute('id', 'launch-error')
fireEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))
fireEvent.click(screen.getByRole('button', { name: 'Zamknij' }))
expect(retry).toHaveBeenCalledTimes(1)
expect(dismiss).toHaveBeenCalledTimes(1)
```

Also assert that retry/dismiss buttons are absent when callbacks are absent and that the spinner is `aria-hidden`.

- [x] **Step 2: Run the focused test and confirm RED**

```bash
npm run test:unit -- src/components/__tests__/ActionFeedback.test.tsx
```

Expected: failure because `ActionFeedback` does not exist.

- [x] **Step 3: Implement the smallest presentational component**

Use `LoaderCircle` from `lucide-react`. Pending renders `role="status" aria-live="polite"`; error renders `role="alert"`. The component must not call toast or know what is being retried.

Add scoped `.action-feedback`, `.action-feedback--pending`, `.action-feedback--error`, `.action-feedback-actions`, and reduced-motion spinner rules. Preserve stable height when embedded in cards.

- [x] **Step 4: Re-run and commit**

```bash
npm run test:unit -- src/components/__tests__/ActionFeedback.test.tsx
npm run lint -- --quiet
git add src/components/ActionFeedback.tsx src/components/__tests__/ActionFeedback.test.tsx src/index.css
git commit -m "feat: add reusable action feedback"
```

Expected: focused tests and lint pass.

---

## Task 2: Make template launch a retryable, fully identified operation

**Files:**
- Create: `src/hooks/__tests__/useTemplateWorkoutLaunch.test.tsx`
- Modify: `src/hooks/useTemplateWorkoutLaunch.ts`
- Modify: `src/pages/TemplatesPage.tsx`
- Modify: `src/pages/DashboardPage.tsx`
- Create: `src/pages/__tests__/TemplatesPageActions.test.tsx`
- Modify: `src/pages/__tests__/TemplatesPageDataState.test.tsx`
- Modify: `src/pages/__tests__/DashboardProjectionStatus.test.tsx`
- Modify: `tests/e2e/template-launch.spec.ts`
- Modify: `src/index.css`

**Exact hook contract:**

```ts
export interface TemplateLaunchTarget {
  template: WorkoutTemplate
  dayIndex: number
  requestKey: string
}

export interface TemplateLaunchOperation {
  target: TemplateLaunchTarget
  replaceExisting: boolean
  status: 'pending' | 'error'
  errorMessage: string | null
}

export interface TemplateWorkoutLaunch {
  pendingLaunch: TemplateLaunchTarget | null
  launchOperation: TemplateLaunchOperation | null
  launchingTemplateId: string | null
  requestTemplateLaunch: (
    template: WorkoutTemplate,
    dayIndex: number,
    requestKey: string,
  ) => Promise<void>
  confirmTemplateLaunch: () => Promise<void>
  cancelTemplateLaunch: () => void
  retryTemplateLaunch: () => Promise<void>
  dismissTemplateLaunchError: () => void
}
```

`launchingTemplateId` stays temporarily as a derived compatibility field: it is non-null only when `launchOperation.status === 'pending'`. Rendering the exact clicked control uses `target.requestKey`, not the template id.

Stable request keys:

```ts
`templates:${template.id}:primary`
`templates:${template.id}:summary:${dayIndex}`
`templates:${template.id}:detail:${dayIndex}`
`dashboard:${template.id}:primary`
```

- [x] **Step 1: Write hook tests before changing the hook**

Use a `MemoryRouter`, a deferred `createPersistedTemplateWorkout`, mocked Zustand selectors and mocked `navigate`. Cover:

1. idle → pending → success hydrates once and navigates once;
2. failure stores the exact target, `replaceExisting: false`, status `error` and Polish message;
3. retry repeats the same template, day index and `replaceExisting` flag;
4. active-session conflict opens the dialog without calling the service;
5. confirm stores `replaceExisting: true`; if it fails, retry calls the service with `true` without reopening the dialog;
6. double click while pending calls the service once;
7. a stale generation and an unmounted hook cannot hydrate or navigate;
8. dismiss clears only the current error.

- [x] **Step 2: Confirm the hook tests fail**

```bash
npm run test:unit -- src/hooks/__tests__/useTemplateWorkoutLaunch.test.tsx
```

Expected: missing `launchOperation`, retry and dismiss.

- [x] **Step 3: Refactor launch execution around one operation object**

Create one internal function:

```ts
const beginLaunch = useCallback(async (
  target: TemplateLaunchTarget,
  replaceExisting: boolean,
) => { /* lock + generation + execute + persistent error */ }, [/* real deps */])
```

Rules:

- set `launchOperation` to pending before the service call;
- success keeps the existing hydration/toast/navigation contract;
- error stores the same `target` and `replaceExisting`;
- retry reads the stored operation and delegates to `beginLaunch`;
- a server conflict during a non-replace launch moves the same target to `pendingLaunch`;
- `finally` releases the lock but must not erase a stored error;
- generation checks precede every post-await state change, hydration and navigation.

- [x] **Step 4: Write failing page-level tests**

In `TemplatesPageActions.test.tsx`, inject hook state through a hoisted mutable mock and verify:

- only the control whose `requestKey` matches says `Uruchamiam…`;
- the card has `aria-busy="true"` and all launch actions are disabled during pending;
- an error is rendered inside the matching card with retry/dismiss;
- day 0 primary and day 0 summary do not both show pending.

Update existing hook mocks in `TemplatesPageDataState.test.tsx` and `DashboardProjectionStatus.test.tsx` to expose the new fields/functions.

- [x] **Step 5: Integrate the operation into Templates and Dashboard**

Use `ActionFeedback` adjacent to the matching card/tile. Bind `aria-describedby` to the error id. Keep card geometry stable. The visible pending copy is exactly `Uruchamiam…`; the persistent error is exactly `Nie udało się uruchomić planu.`

Dashboard retains one tile-level launch control. Templates derives `isLaunchingControl` from `launchOperation.target.requestKey`.

- [x] **Step 6: Upgrade the existing offline browser scenario**

In `tests/e2e/template-launch.spec.ts`:

- assert the alert remains on `/templates` after the intentional offline error;
- restore connectivity;
- click `Spróbuj ponownie` in the matching card;
- expect `/workout/new` and the originally selected exercise;
- retain the diagnostic wrapper so intentional offline console/network events remain classified;
- run with `--retries=0`.

- [x] **Step 7: Verify and commit**

```bash
npm run test:unit -- src/hooks/__tests__/useTemplateWorkoutLaunch.test.tsx src/pages/__tests__/TemplatesPageActions.test.tsx src/pages/__tests__/TemplatesPageDataState.test.tsx src/pages/__tests__/DashboardProjectionStatus.test.tsx
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e firebase emulators:exec --only auth,firestore --project demo-ironlog "playwright test tests/e2e/template-launch.spec.ts --project=desktop --retries=0"
npm run lint -- --quiet
git add src/hooks/useTemplateWorkoutLaunch.ts src/hooks/__tests__/useTemplateWorkoutLaunch.test.tsx src/pages/TemplatesPage.tsx src/pages/DashboardPage.tsx src/pages/__tests__/TemplatesPageActions.test.tsx src/pages/__tests__/TemplatesPageDataState.test.tsx src/pages/__tests__/DashboardProjectionStatus.test.tsx tests/e2e/template-launch.spec.ts src/index.css
git commit -m "feat: make template launch feedback retryable"
```

---

## Task 3: Make template save state truthful and recoverable

**Files:**
- Modify: `src/components/TemplateSaveDock.tsx`
- Modify: `src/components/__tests__/TemplateSaveDock.test.tsx`
- Modify: `src/pages/TemplateEditorPage.tsx`
- Modify: `src/pages/__tests__/TemplateEditorAccessibility.test.tsx`
- Modify: `tests/e2e/templates.spec.ts`
- Modify: `src/index.css`

**Exact dock contract:**

```ts
export type TemplateSaveState =
  | 'new-pristine'
  | 'dirty'
  | 'saving'
  | 'error'
  | 'persisted-clean'

export interface TemplateSaveDockProps {
  state: TemplateSaveState
  isEdit: boolean
  canSubmit: boolean
  errorMessage?: string
  onRetry?: () => void
  onDismissError?: () => void
}
```

The page derives:

```ts
const canSubmit = name.trim().length >= 2
  && days.some((day) => day.exercises.length > 0)

const saveState: TemplateSaveState = saving
  ? 'saving'
  : saveError
    ? 'error'
    : hasUnsavedChanges
      ? 'dirty'
      : template
        ? 'persisted-clean'
        : 'new-pristine'
```

- [x] **Step 1: Replace the old clean-create expectation with five failing state tests**

Expected visible contracts:

| State | Status | Button |
|---|---|---|
| `new-pristine` | `Nowy plan · jeszcze niezapisany` | disabled `Zapisz szablon` until valid |
| `dirty` | `Niezapisane zmiany` | enabled create/edit label when valid |
| `saving` | `Trwa zapis` | disabled `Zapisuję…` |
| `error` | persistent alert | retry and dismiss |
| `persisted-clean` | `Wszystkie zmiany zapisane` | disabled `Zapisano` |

- [x] **Step 2: Confirm RED**

```bash
npm run test:unit -- src/components/__tests__/TemplateSaveDock.test.tsx src/pages/__tests__/TemplateEditorAccessibility.test.tsx
```

- [x] **Step 3: Extract one reusable `saveTemplate` operation in the editor**

Keep `handleSubmit(event)` only as `preventDefault()` + `void saveTemplate()`. `saveTemplate` validates the current draft every time, sets `saveError(null)` only when a new save begins, and on failure stores `Nie udało się zapisać planu.` without clearing fields, snapshot or dirty guard.

Retry calls `saveTemplate()` and therefore submits the current draft, not a captured payload from the failed attempt. Success keeps the existing create/update service calls, guard release, draft cleanup and navigation.

Do not call `setSaving(false)` after successful navigation; use a mounted/generation guard if an existing test exposes a late state update.

- [x] **Step 4: Correct the desktop status as well as the mobile dock**

The header mini-stat must not say `zapisany` for `new-pristine`. The desktop submit uses the same `canSubmit`, pending and error owner state as the dock; do not create a second save operation.

- [x] **Step 5: Add page and browser regression coverage**

Component tests cover pristine create, AI draft dirty, deferred saving, persistent failure, editing after failure, retry current draft, and persisted edit load.

In `tests/e2e/templates.spec.ts`, before filling the create form assert `Nowy plan · jeszcze niezapisany` and disabled save; after a valid name plus exercise assert `Niezapisane zmiany` and enabled save.

- [x] **Step 6: Verify and commit**

```bash
npm run test:unit -- src/components/__tests__/TemplateSaveDock.test.tsx src/pages/__tests__/TemplateEditorAccessibility.test.tsx
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e firebase emulators:exec --only auth,firestore --project demo-ironlog "playwright test tests/e2e/templates.spec.ts --project=desktop --project=mobile --retries=0"
npm run lint -- --quiet
git add src/components/TemplateSaveDock.tsx src/components/__tests__/TemplateSaveDock.test.tsx src/pages/TemplateEditorPage.tsx src/pages/__tests__/TemplateEditorAccessibility.test.tsx tests/e2e/templates.spec.ts src/index.css
git commit -m "fix: make template save state truthful"
```

---

## Task 4: Keep delete failures attached to the resource

**Files:**
- Modify: `src/pages/TemplatesPage.tsx`
- Modify: `src/pages/DashboardPage.tsx`
- Modify: `src/pages/WorkoutDetailPage.tsx`
- Modify: `src/pages/__tests__/TemplatesPageActions.test.tsx`
- Modify: `src/pages/__tests__/DashboardProjectionStatus.test.tsx`
- Create: `src/pages/__tests__/WorkoutDetailActions.test.tsx`
- Modify: `src/index.css`

**Local state shapes:**

```ts
interface TemplateDeleteOperation {
  target: WorkoutTemplate
  status: 'pending' | 'error'
}

interface WorkoutDeleteOperation {
  workoutId: string
  status: 'pending' | 'error'
}
```

- [x] **Step 1: Write failing deletion tests**

For each owner verify the same invariant:

1. confirm starts pending for the exact id;
2. the resource remains visible while the promise is pending;
3. a rejection leaves the resource and a local `role="alert"` visible;
4. retry calls the service with the same id;
5. success is the only event that removes the template/row or navigates away;
6. dismiss clears feedback without deleting the resource;
7. other resources remain interactive unless the page's existing global consistency rule requires a lock.

- [x] **Step 2: Confirm RED**

```bash
npm run test:unit -- src/pages/__tests__/TemplatesPageActions.test.tsx src/pages/__tests__/DashboardProjectionStatus.test.tsx src/pages/__tests__/WorkoutDetailActions.test.tsx
```

- [x] **Step 3: Implement one operation owner per page**

Templates no longer removes or fades the card optimistically. Dashboard replaces `deletingId` with `WorkoutDeleteOperation`, preserving the existing authoritative refresh and stale-request guards after success. Workout Detail stores its failure next to the action surface and retains the workout data.

Use these exact messages:

- template: `Nie udało się usunąć planu.`
- completed workout: `Nie udało się usunąć treningu.`

Success toast remains. Error toast may remain as a secondary signal, but the local alert is authoritative.

- [x] **Step 4: Run regression tests and commit**

```bash
npm run test:unit -- src/pages/__tests__/TemplatesPageActions.test.tsx src/pages/__tests__/TemplatesPageDataState.test.tsx src/pages/__tests__/DashboardProjectionStatus.test.tsx src/pages/__tests__/WorkoutDetailActions.test.tsx
npm run lint -- --quiet
git add src/pages/TemplatesPage.tsx src/pages/DashboardPage.tsx src/pages/WorkoutDetailPage.tsx src/pages/__tests__/TemplatesPageActions.test.tsx src/pages/__tests__/DashboardProjectionStatus.test.tsx src/pages/__tests__/WorkoutDetailActions.test.tsx src/index.css
git commit -m "fix: keep deletion failures actionable"
```

---

## Task 5: Align workout entry CTA, shell labels, and root routing

**Files:**
- Modify: `src/pages/DashboardPage.tsx`
- Modify: `src/components/TopNav.tsx`
- Modify: `src/components/BottomNav.tsx`
- Modify: `src/router/index.tsx`
- Modify: `src/pages/__tests__/DashboardProjectionStatus.test.tsx`
- Modify: `src/pages/__tests__/SharedAccessibilityContracts.test.tsx`
- Modify: `tests/e2e/protected-shell.spec.ts`
- Modify: `tests/e2e/smoke.spec.ts`
- Modify: `tests/e2e/support/appReady.ts`

- [x] **Step 1: Add failing CTA and navigation label tests**

Make the active-session mock controllable. Verify:

```ts
// no active work
'Rozpocznij nowy trening' -> 'Otwieram trening…'

// active work
'Wznów trening' -> 'Otwieram sesję…'
```

The dashboard button is disabled while its route preload is pending and calls `navigate('/workout/new')` exactly once when preload settles. TopNav visible copy is `Nowy trening` or `Wznów trening`; BottomNav's primary accessible name is `Rozpocznij nowy trening` or `Wznów trening`. Neither navigation component receives local/global loading state.

- [x] **Step 2: Implement the local CTA handoff**

Add `openingWorkout` initialized to false and:

```ts
async function handleOpenWorkout() {
  if (openingWorkout) return
  setOpeningWorkout(true)
  try {
    await preloadRouteByPath('/workout/new')
  } finally {
    navigate('/workout/new')
    setOpeningWorkout(false)
  }
}
```

Do not introduce a timeout or minimum spinner duration. Keep secondary CTAs consistent where their meaning is the same.

- [x] **Step 3: Derive shell copy from the existing workout store**

Both navs read `active` through `useWorkoutStore` and call existing `hasActiveSessionWork(active)`. Do not subscribe to Firestore from the nav and do not duplicate session-work logic.

- [x] **Step 4: Add root redirect before the wildcard**

Inside the private route group add:

```tsx
<Route path="/" element={<Navigate to="/dashboard" replace />} />
```

This intentionally passes through `PrivateRouteOutlet`: authenticated `/` ends at `/dashboard`, anonymous `/` ends at `/login`, and `/definitely-missing` still renders `NotFoundPage`.

- [x] **Step 5: Add browser routing proofs**

In `protected-shell.spec.ts` add authenticated root and unknown-route assertions. For anonymous root, create an observed context with empty storage state, navigate to `/`, and expect `/login`; do not reuse the authenticated page.

Update `expectAppReady` CTA regexes from the historical `Wróć do sesji|Rozpocznij trening` to the new exact labels. Update smoke navigation expectations without adding screenshot assertions.

- [x] **Step 6: Verify and commit**

```bash
npm run test:unit -- src/pages/__tests__/DashboardProjectionStatus.test.tsx src/pages/__tests__/SharedAccessibilityContracts.test.tsx
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e firebase emulators:exec --only auth,firestore --project demo-ironlog "playwright test tests/e2e/protected-shell.spec.ts tests/e2e/smoke.spec.ts --project=desktop --project=mobile --retries=0"
npm run lint -- --quiet
git add src/pages/DashboardPage.tsx src/components/TopNav.tsx src/components/BottomNav.tsx src/router/index.tsx src/pages/__tests__/DashboardProjectionStatus.test.tsx src/pages/__tests__/SharedAccessibilityContracts.test.tsx tests/e2e/protected-shell.spec.ts tests/e2e/smoke.spec.ts tests/e2e/support/appReady.ts
git commit -m "fix: align workout entry navigation"
```

---

## Task 6: Replace the always-fixed mobile workout actions with one adaptive surface

**Files:**
- Create: `src/components/WorkoutDetailMobileActions.tsx`
- Create: `src/components/__tests__/WorkoutDetailMobileActions.test.tsx`
- Modify: `src/pages/WorkoutDetailPage.tsx`
- Modify: `tests/e2e/workout-detail-mobile.spec.ts`
- Modify: `src/index.css`

**Component contract:**

```ts
import type { ReactNode } from 'react'

export interface WorkoutDetailMobileActionsProps {
  children: ReactNode
}
```

The component renders one action surface and a stable anchor. It exposes `data-placement="inline" | "fixed"` for tests and CSS.

- [x] **Step 1: Write failing observer tests**

Provide a controllable `IntersectionObserver` mock and cover:

- initial `inline`;
- anchor below viewport (`isIntersecting: false`, positive `top`) stays inline;
- anchor above viewport (`isIntersecting: false`, negative `top`) becomes fixed;
- intersecting again returns inline;
- `screen.getAllByRole('button', { name: 'Edytuj' })` has length 1 inside the mobile component;
- placement changes preserve the same button DOM node and focus;
- observer disconnects on unmount.

- [x] **Step 2: Confirm RED**

```bash
npm run test:unit -- src/components/__tests__/WorkoutDetailMobileActions.test.tsx
```

- [x] **Step 3: Implement the single-surface geometry**

Observe the anchor, not the fixed surface. Compute fixed only as:

```ts
const nextFixed = !entry.isIntersecting && entry.boundingClientRect.top < 0
```

Do not conditionally render two action copies. Change only class/data-placement on the same node, so focus and pending/error state survive. Keep desktop aside unchanged.

Place the mobile component immediately after `.workout-summary-panel` and before `.workout-exercise-list`. Replace the historical unconditional `pb-56`/fixed rules with named CSS variables for action height, bottom-nav clearance and `env(safe-area-inset-bottom)`.

- [x] **Step 4: Rewrite the mobile E2E contract**

The test must prove:

1. on entry the action surface is `inline` and does not overlap the summary;
2. scrolling until the anchor passes the top changes it to `fixed`;
3. when BottomNav hides, fixed bottom clearance drops to the safe-area value;
4. scrolling back restores `inline`;
5. only one visible/focusable `Edytuj` and `Usuń trening` pair exists;
6. the final exercise/summary content can be scrolled fully above the fixed surface.

Use geometry assertions and `data-placement`; do not select by generic utility classes such as `div.fixed.left-0...`.

- [x] **Step 5: Verify and commit**

```bash
npm run test:unit -- src/components/__tests__/WorkoutDetailMobileActions.test.tsx src/pages/__tests__/WorkoutDetailActions.test.tsx
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e firebase emulators:exec --only auth,firestore --project demo-ironlog "playwright test tests/e2e/workout-detail-mobile.spec.ts --project=mobile --retries=0"
npm run lint -- --quiet
git add src/components/WorkoutDetailMobileActions.tsx src/components/__tests__/WorkoutDetailMobileActions.test.tsx src/pages/WorkoutDetailPage.tsx tests/e2e/workout-detail-mobile.spec.ts src/index.css
git commit -m "fix: adapt workout detail actions on mobile"
```

---

## Task 7: Correct Polish copy and the two contrast contracts

**Files:**
- Create: `src/lib/workoutCopy.ts`
- Create: `src/lib/__tests__/workoutCopy.test.ts`
- Modify: `src/pages/WorkoutDetailPage.tsx`
- Modify: `src/pages/ProgressPage.tsx`
- Modify: `src/pages/WorkoutPage.tsx`
- Modify: `src/lib/__tests__/polishPlural.test.ts`
- Modify: `src/pages/__tests__/ProgressPage.test.tsx`
- Modify: `tests/e2e/workout-guard.spec.ts`
- Modify: `tests/e2e/workout-lifecycle.spec.ts`
- Modify: `tests/e2e/workout-mobile.spec.ts`
- Create: `tests/e2e/contrast.spec.ts`
- Modify: `src/index.css`

**Copy helper:**

```ts
const CATEGORY_WORKLOAD_INSIGHTS: Record<string, string> = {
  chest: 'Najwięcej pracy poszło na klatkę.',
  back: 'Najwięcej pracy poszło na plecy.',
  legs: 'Najwięcej pracy wykonały nogi.',
  shoulders: 'Najwięcej pracy poszło w barki.',
  arms: 'Najwięcej pracy poszło w ramiona.',
  core: 'Najwięcej pracy wykonał core.',
  cardio: 'Najmocniejszym akcentem było cardio.',
}

export function getCategoryWorkloadInsight(
  category: string,
  fallbackLabel: string,
): string {
  return CATEGORY_WORKLOAD_INSIGHTS[category]
    ?? `Najwięcej pracy przypadło kategorii „${fallbackLabel}”.`
}
```

- [x] **Step 1: Write failing copy tests**

Test all seven known categories plus an unknown fallback. Extend `polishPlural.test.ts` with `0, 1, 2, 4, 5, 12, 22` for `wpis / wpisy / wpisów`.

In `ProgressPage.test.tsx`, render data producing singular top and paucal total, then assert the chart's accessible summary uses `1 wpis` and `2 wpisy`, not hard-coded `wpisów`.

Update workout dialog E2E locators only after adding assertions for `Wróć` and `Odrzuć trening`.

- [x] **Step 2: Confirm RED**

```bash
npm run test:unit -- src/lib/__tests__/workoutCopy.test.ts src/lib/__tests__/polishPlural.test.ts src/pages/__tests__/ProgressPage.test.tsx
```

- [x] **Step 3: Implement copy changes**

- `WorkoutDetailPage` calls `getCategoryWorkloadInsight`; it no longer lowercases a presentation label.
- `summarizeMuscleBalance` calls `polishPlural` for both top and total counts.
- discard dialog uses `cancelLabel="Wróć"` and `confirmLabel="Odrzuć trening"`.
- service/backend discard behavior remains unchanged.

- [x] **Step 4: Change only the approved contrast tokens**

In `:root`:

```css
--muted-soft: #8f8990;
--primary-start: #c72e44;
--primary-end: #a91f35;
--primary-gradient: linear-gradient(180deg, var(--primary-start) 0%, var(--primary-end) 100%);
```

Keep `--accent: #f0435a`. Ensure hover/active CSS does not replace the gradient with a brighter color. Do not modify category palette or global microtype sizes.

- [x] **Step 5: Add computed-style contrast tests**

`contrast.spec.ts` defines the WCAG relative-luminance function locally, then:

1. reads `--muted-soft`, `--bg`, and the actual surface used by normal helper text;
2. reads `--primary-start`, `--primary-end`, and `--accent-foreground`;
3. asserts all required ratios are `>= 4.5`;
4. locates a real enabled primary CTA and confirms its computed `background-image` uses the primary tokens;
5. reads default, hover and mouse-down/active computed styles and verifies none introduces a failing brighter background.

No test may pass solely by comparing expected hex literals.

- [x] **Step 6: Verify and commit**

```bash
npm run test:unit -- src/lib/__tests__/workoutCopy.test.ts src/lib/__tests__/polishPlural.test.ts src/pages/__tests__/ProgressPage.test.tsx
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e firebase emulators:exec --only auth,firestore --project demo-ironlog "playwright test tests/e2e/contrast.spec.ts tests/e2e/workout-guard.spec.ts tests/e2e/workout-lifecycle.spec.ts tests/e2e/workout-mobile.spec.ts --project=desktop --project=mobile --retries=0"
npm run lint -- --quiet
git add src/lib/workoutCopy.ts src/lib/__tests__/workoutCopy.test.ts src/pages/WorkoutDetailPage.tsx src/pages/ProgressPage.tsx src/pages/WorkoutPage.tsx src/lib/__tests__/polishPlural.test.ts src/pages/__tests__/ProgressPage.test.tsx tests/e2e/workout-guard.spec.ts tests/e2e/workout-lifecycle.spec.ts tests/e2e/workout-mobile.spec.ts tests/e2e/contrast.spec.ts src/index.css
git commit -m "fix: improve interface copy and contrast"
```

---

## Task 8: Separate diagnostic screenshots from visual regression

**Files:**
- Rename: `tests/e2e/audit-screenshots.spec.ts` → `tests/e2e/diagnostic-capture.spec.ts`
- Create: `tests/e2e/templates.visual.spec.ts`
- Modify: `tests/e2e/smoke.spec.ts`
- Modify: `tests/e2e/support/appReady.ts`
- Modify: `package.json`
- Generate after approval: Playwright snapshot files for desktop/mobile only

- [x] **Step 1: Rename without losing history and remove misleading smoke capture**

```bash
git mv tests/e2e/audit-screenshots.spec.ts tests/e2e/diagnostic-capture.spec.ts
```

Delete the `Screenshot for visual regression baseline` comment and unconditional screenshots from `smoke.spec.ts`. Failure screenshots remain provided by Playwright config.

- [x] **Step 2: Make diagnostic capture honest and deterministic enough for inspection**

For each screen:

```ts
await expectAppReady(page, route)
await page.evaluate(() => document.fonts.ready)
await page.emulateMedia({ reducedMotion: 'reduce' })
await page.screenshot({
  path: testInfo.outputPath('diagnostic', `${name}-${viewport}.png`),
  fullPage: true,
})
```

Remove fixed `waitForTimeout` readiness sleeps. Use an anonymous observed context for `/login`; authenticated storage must not redirect that capture to dashboard. Scrolled captures also use unique `testInfo.outputPath` names.

- [x] **Step 3: Write the one real visual regression spec**

`templates.visual.spec.ts`:

```ts
test('empty templates page', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/templates')
  await expectAppReady(page, '/templates')
  await expect(page.getByText('Nie masz jeszcze szablonów')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await expect(page).toHaveScreenshot('templates-empty.png', {
    animations: 'disabled',
    fullPage: true,
  })
})
```

Do not add other routes. A fresh emulator invocation plus the dedicated E2E user is the deterministic empty-data boundary.

- [x] **Step 4: Add a dedicated command**

Add to `package.json`:

```json
"test:e2e:visual": "E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e firebase emulators:exec --only auth,firestore --project demo-ironlog \"playwright test tests/e2e/templates.visual.spec.ts --project=desktop --project=mobile --retries=0\""
```

- [x] **Step 5: Generate and immediately re-check baselines**

```bash
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e firebase emulators:exec --only auth,firestore --project demo-ironlog "playwright test tests/e2e/templates.visual.spec.ts --project=desktop --project=mobile --retries=0 --update-snapshots"
npm run test:e2e:visual
```

Expected: exactly two approved PNGs (one project suffix per viewport), then a clean comparison run. Inspect both images before staging; reject clipped UI, unexpected templates, loading skeletons or font fallback.

- [x] **Step 6: Verify and commit**

```bash
npm run test:e2e:visual
npm run lint -- --quiet
git add tests/e2e/diagnostic-capture.spec.ts tests/e2e/templates.visual.spec.ts tests/e2e/smoke.spec.ts tests/e2e/support/appReady.ts tests/e2e/templates.visual.spec.ts-snapshots package.json
git commit -m "test: separate visual capture and regression"
```

---

## Task 9: Harden the demo reseed without executing it

**Files:**
- Create: `scripts/demoSeedContract.ts`
- Create: `scripts/__tests__/demoSeedContract.test.ts`
- Modify: `scripts/seed-demo.ts`

**Confirmation contract:**

```ts
export interface DemoSeedConfirmation {
  actualEmail: string
  expectedEmail: string
  actualProjectId: string
  confirmedEmail?: string
  confirmedProjectId?: string
}

export interface DemoSeedSnapshot {
  workoutCount: number
  templateCount: number
  userExerciseCount: number
  readinessCount: number
  maxDurationMin: number
  blankWorkoutLabels: number
  hasActiveSession: boolean
}

export interface DemoSeedExpectations {
  workoutCount: number
  templateCount: number
  userExerciseCount: number
  readinessCount: number
  maxDurationMin: number
}

export function assertDemoSeedConfirmation(input: DemoSeedConfirmation): void
export function validateDemoSeedSnapshot(
  snapshot: DemoSeedSnapshot,
  expected: DemoSeedExpectations,
): string[]
```

Required environment confirmations:

```bash
DEMO_SEED_CONFIRM_EMAIL=demo@ironlog.app
DEMO_SEED_CONFIRM_PROJECT_ID=ironlog-ede05
```

- [x] **Step 1: Write pure failing contract tests**

Cover mismatch/missing email, mismatch/missing project, correct pair, and snapshot failures for wrong workout count, duration above fixture maximum, blank labels, missing template/custom exercises/readiness and active session.

The script constructs `DemoSeedExpectations` from the real fixtures: `buildSchedule().length`, `USER_EXERCISES.length`, one template, seven readiness entries and maximum `durationMin` from `buildSchedule()`. Pure tests pass explicit expectation objects so the validator itself contains no duplicated fixture counts.

- [x] **Step 2: Confirm RED**

```bash
npm run test:unit -- scripts/__tests__/demoSeedContract.test.ts
```

- [x] **Step 3: Add preflight and read-only validation to the existing script**

Keep `scripts/seed-demo.ts` as the only writer. Resolve project id from the initialized Admin app (`getApps()[0]?.options.projectId`), never print credentials, and fail closed before `resetDemo` unless both confirmations match.

Support `--dry-run`. Dry-run may resolve the user and read the current snapshot, but must not call `resetDemo`, seed writers or materialization.

After a real reseed, query a read-only snapshot and fail non-zero if `validateDemoSeedSnapshot` returns any issue. Ensure reset still clears `workouts`, projections, records, custom exercises, templates, readiness, chat messages and `activeSessions/{uid}`.

- [x] **Step 4: Verify code only; do not mutate demo data**

```bash
npm run test:unit -- scripts/__tests__/demoSeedContract.test.ts
npm run lint -- --quiet
npm run build
```

Do **not** run `npm run seed:demo` in this task.

- [x] **Step 5: Commit the hardened tooling**

```bash
git add scripts/demoSeedContract.ts scripts/__tests__/demoSeedContract.test.ts scripts/seed-demo.ts
git commit -m "chore: harden demo reseed"
```

- [x] **Step 6: STOP for explicit operational approval**

Report the exact target email, exact Firebase project id and dry-run summary to Patryk. Ask for a separate confirmation immediately before executing:

```bash
DEMO_SEED_CONFIRM_EMAIL=demo@ironlog.app \
DEMO_SEED_CONFIRM_PROJECT_ID=ironlog-ede05 \
npm run seed:demo
```

If approval is not granted, mark code/tooling complete but leave `DEMO-01` operational execution open. Do not infer approval from approval of this plan.

---

## Task 10: Run full gates, runtime review, independent review, and close the phase

**Files:**
- Modify: `docs/roadmap/ROADMAP.md`
- Modify: `docs/roadmap/specs/2026-07-20-phase-5-feedback-copy-interface-integrity-design.md`
- Modify: `docs/roadmap/plans/2026-07-20-phase-5-feedback-copy-interface-integrity.md`
- Modify: `WORKING_CONTEXT.md`
- Verify: all Phase 5 source and test files

- [x] **Step 1: Run all automated gates without retry masking**

```bash
npm run test:unit
npm run lint
npm run build
npm run test:rules
npm run test:integration:workout
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e firebase emulators:exec --only auth,firestore --project demo-ironlog "playwright test tests/e2e/template-launch.spec.ts tests/e2e/templates.spec.ts tests/e2e/protected-shell.spec.ts tests/e2e/workout-detail-mobile.spec.ts tests/e2e/workout-guard.spec.ts tests/e2e/workout-lifecycle.spec.ts tests/e2e/workout-mobile.spec.ts tests/e2e/contrast.spec.ts --project=desktop --project=mobile --retries=0"
npm run test:e2e:visual
```

Expected: every command exits 0. Do not rerun until green and report only the successful rerun; preserve the first failure as evidence during debugging.

- [x] **Step 2: Perform the Playwright runtime matrix**

Use Playwright against the emulator on desktop and mobile projects. A headed mode or browser computer-use walkthrough may supplement the deterministic suite, but the recorded closeout proof is the automated matrix:

- Dashboard: no session, active session, CTA pending, delete failure/retry;
- Templates: empty, loaded, exact launch control pending, conflict, persistent error/retry, delete error/retry;
- editor: new-pristine, dirty, saving, failure, retry;
- detail mobile: inline → fixed → inline, BottomNav visible/hidden, focus and last content unobscured;
- root auth/no-auth and a real 404;
- primary CTA default/hover/active and muted helper text;
- no unexpected console errors after recovery.

Capture evidence through `testInfo.outputPath` or the browser audit directory; do not commit general diagnostic images.

- [x] **Step 3: Request independent review**

Use `superpowers:requesting-code-review` or an independent reviewer agent. Review against the approved spec and this plan, with special attention to:

- exact retry identity and obsolete generations;
- stale dashboard refresh after deletion;
- one mobile action surface and focus preservation;
- truthfulness of create/edit save states;
- contrast based on actual computed styles;
- demo preflight failing closed;
- no scope leak into `LATER-08–10`.

Resolve every Critical and Important finding. Re-run the affected focused tests after each correction, then rerun all gates.

- [x] **Step 4: Execute the separately approved demo reseed, if and only if approved**

Run the command from Task 9 once, inspect the script's read-only validation, then perform a short login walkthrough of Dashboard, Progress, Templates and History. If it fails, rerun the deterministic seed after fixing the tooling/data issue; do not hand-edit documents as rollback.

- [x] **Step 5: Update canonical documentation with facts, not intentions**

- Roadmap Phase 5 → `COMPLETE` only if code gates, runtime matrix, review and approved demo reseed all pass; otherwise use an explicit partial status and leave `DEMO-01` open.
- Design spec → implemented commit(s), deviations and verification evidence.
- This plan → check completed boxes and add a concise result section with exact test counts.
- `WORKING_CONTEXT.md` → branch/HEAD, decisions, remaining actions, no secrets.
- Run `project-convergence` after local integration as required by the approved design; if the skill is unavailable in that execution context, report that explicitly instead of pretending it ran.

- [x] **Step 6: Commit closeout documentation**

```bash
git add docs/roadmap/ROADMAP.md docs/roadmap/specs/2026-07-20-phase-5-feedback-copy-interface-integrity-design.md docs/roadmap/plans/2026-07-20-phase-5-feedback-copy-interface-integrity.md WORKING_CONTEXT.md
git commit -m "docs: close phase 5 feedback integrity"
```

Do not stage `docs/audits/2026-07-14-senior-design-review.md`.

- [ ] **Step 7: Finish the branch locally**

Use `superpowers:finishing-a-development-branch`. Present local merge/PR/keep-branch choices. Do not push, deploy or mutate production without fresh authorization.

---

## Requirement Traceability

| Requirement | Primary implementation tasks | Main proof |
|---|---|---|
| FEEDBACK-01 | 2 | hook/component + offline Playwright retry |
| FEEDBACK-02 | 5 | dashboard/nav unit + protected shell |
| FEEDBACK-03 | 1–4 | local action tests + recovery walkthrough |
| FEEDBACK-04 | 3 | five dock states + editor browser flow |
| NAV-01 | 5 | auth/no-auth root + real 404 |
| MOBILE-07 | 6 | observer unit + mobile geometry E2E |
| A11Y-09 | 7 | computed contrast test |
| A11Y-10 | 7 | default/hover/active computed contrast |
| COPY-01 | 7 | category helper tests |
| COPY-02 | 7 | 0/1/2/4/5/12/22 + rendered summary |
| COPY-03 | 7 | dialog browser assertions |
| DEMO-01 | 9–10 | fail-closed preflight + read-only validation + separate approval |
| TEST-04 | 8 | diagnostic output paths + exactly two empty-Templates baselines |

## Recovery Boundaries

- Code: revert the smallest task commit; no migration or compatibility rollback is needed.
- Launch/save/delete errors: dismiss or retry the locally stored operation; no global state reset.
- Visual baseline: regenerate only after a deliberate UI change and inspect both images.
- Demo data: rerun the deterministic seed after explicit approval; never manually patch historical documents as a substitute.
- Production: outside scope; no push/deploy is part of plan completion.

## Final Results (Phase 5 close)

- Zakres wdrożeniowy: `FEEDBACK-01–04`, `NAV-01`, `MOBILE-07`, `A11Y-09–10`, `COPY-01–03`, `DEMO-01`, `TEST-04`.
- Post-close gates: `52 files / 364 tests` unit PASS; `lint` PASS; `build` PASS for `877` modułów; `rules` `10/10`; integration tests workout `20/20`.
- E2E końcowy: `48` passed, `9` expected skips, `0` failed, `retries=0`, łączny czas `3.8m`.
- Runtime matrix wykonano jako deterministyczny Playwright desktop/mobile; nie raportujemy osobnego interaktywnego headed walkthrough, którego nie wykonano.
- Visual: `3/3` porównań przechodzi, `2` baselines zatwierdzone (`desktop 1280x784`, `mobile 393x1345`), brak produktu-specific tolerance/retry; tylko środowiskowa normalizacja scrollbara desktop jako odchylenie testowe.
- DEMO-01: wykonany reseed po potwierdzeniu na `demo@ironlog.app` / `ironlog-ede05`; usunięto `27 workouts,145 exerciseSessions,21 records,4 userExercises,1 template,7 readiness`; zweryfikowano `26 workouts`, `1 template`, `4 custom exercises`, `7 readiness`, `max 74min`, `blank labels 0`, `hasActiveSession false`.
- `project-convergence` 2026-07-21: route `Phased`, risk `Elevated`, implementacja i dowody zaakceptowane; bezpośrednia obserwacja Browser potwierdziła cold-load active-session copy i brak mobile overflow. Gate integracji pozostaje otwarty, dlatego plan, worktree i phase-owned SDD residue są zachowane.
- Task10 Step7 pozostaje celowo nieukończony oczekując decyzji Patryka nt. sposobu finalizacji gałęzi.
