# Deterministic Quality Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make emulator E2E failures fail immediately, restore the 44-pixel mobile hit-area contract throughout animation, and make dashboard keyboard-delete coverage deterministic.

**Architecture:** Emulator mode owns deterministic state and therefore runs with zero retries. The readiness panel keeps its entrance motion without scaling interactive descendants. The dashboard delete scenario seeds its own Admin SDK fixture and joins the isolated emulator suite.

**Tech Stack:** TypeScript, React 19, Framer Motion, Playwright, Firebase Auth/Firestore emulators, Firebase Admin SDK.

## Global Constraints

- Emulator runs use `retries: 0`; live exploratory runs may keep one retry.
- Do not weaken or remove the 44-by-44-pixel accessibility assertion.
- Do not add sleeps to fix animation timing.
- E2E fixtures must be isolated, deterministic, and cleaned up.
- Do not introduce a new test framework or dependency.

## File Map

- `src/pages/DashboardPage.tsx`: readiness-panel entrance animation.
- `playwright.config.ts`: retry policy selected by `E2E_BACKEND`.
- `tests/e2e/accessibility.spec.ts`: existing hit-area contract; no threshold change.
- `tests/e2e/dashboard.spec.ts`: deterministic Enter-key deletion scenario.
- `tests/e2e/support/workoutLifecycleEmulator.ts`: existing safe Admin SDK workout seed/cleanup helpers.
- `package.json`: include dashboard coverage in the isolated emulator command.

---

### Task 1: Keep readiness controls at full hit-area size during entrance motion

**Files:**
- Modify: `src/pages/DashboardPage.tsx:622-630`
- Test: `tests/e2e/accessibility.spec.ts:106-121`

**Interfaces:**
- Preserves: existing `ReadinessPrompt` UI and motion timing.
- Produces: a stable bounding box of at least 44 by 44 CSS pixels throughout entrance.

- [ ] **Step 1: Reproduce the failure without retry**

```bash
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e \
firebase emulators:exec --only auth,firestore --project demo-ironlog \
"playwright test tests/e2e/accessibility.spec.ts --project=mobile --grep 'primary mobile controls' --retries=0"
```

Expected before the fix: FAIL with readiness-slider height around `42.68`, caused by the parent `scale: 0.97`.

- [ ] **Step 2: Replace scale with non-geometric motion**

Change the readiness `motion.aside` props from:

```tsx
initial={{ opacity: 0, scale: 0.97 }}
animate={{ opacity: 1, scale: 1 }}
```

to:

```tsx
initial={{ opacity: 0, y: 8 }}
animate={{ opacity: 1, y: 0 }}
```

Keep the existing transition and layout classes.

- [ ] **Step 3: Run the single test three times without retry**

Run the command from Step 1 three times.

Expected: PASS on every run; no flaky result and no control below 44 pixels.

- [ ] **Step 4: Commit the accessibility fix**

```bash
git add src/pages/DashboardPage.tsx
git commit -m "fix: preserve readiness touch targets during motion"
```

---

### Task 2: Disable retries for every emulator project

**Files:**
- Modify: `playwright.config.ts:30-40`

**Interfaces:**
- Consumes: existing `emulatorMode` boolean.
- Produces: `retries: 0` for emulator-backed commands and `retries: 1` for live mode.

- [ ] **Step 1: Make retry policy environment-specific**

Replace:

```ts
retries: 1,
```

with:

```ts
retries: emulatorMode ? 0 : 1,
```

Do not duplicate `--retries=0` across every package script; the central config is the shared contract.

- [ ] **Step 2: Verify the accessibility gate reports no flaky retry**

```bash
npm run test:e2e:a11y
```

Expected: exit 0, all applicable tests pass, and the report contains neither `retry #1` nor `flaky`.

- [ ] **Step 3: Verify the workout gate remains first-attempt clean**

```bash
npm run test:e2e:workout
```

Expected: all workout tests pass without a retry line.

- [ ] **Step 4: Commit retry policy**

```bash
git add playwright.config.ts
git commit -m "test: fail emulator e2e on first attempt"
```

---

### Task 3: Give dashboard keyboard-delete coverage its own fixture

**Files:**
- Modify: `tests/e2e/dashboard.spec.ts:1-43`
- Reuse: `tests/e2e/support/workoutLifecycleEmulator.ts`

**Interfaces:**
- Consumes: `seedLifecycleWorkout(sessionId)` and `deleteLifecycleWorkout(sessionId)`.
- Produces: a dashboard delete test that never depends on shared account history.

- [ ] **Step 1: Replace the shared-account skip with an emulator fixture**

Add imports:

```ts
import {
  deleteLifecycleWorkout,
  seedLifecycleWorkout,
} from './support/workoutLifecycleEmulator'
```

Replace the first half of the test with:

```ts
test('delete action on recent workout stays on dashboard when activated with Enter', async ({
  page,
  cleanup,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop deterministic keyboard contract')
  const sessionId = 'phase-1-dashboard-keyboard-delete'
  cleanup.add('remove dashboard keyboard workout', () => deleteLifecycleWorkout(sessionId))
  await deleteLifecycleWorkout(sessionId)
  await seedLifecycleWorkout({
    sessionId,
    materialized: true,
    label: 'Phase 1 dashboard keyboard delete',
  })
  await openDashboard(page)

  const deleteButton = page.getByRole('button', {
    name: /Usuń trening Phase 1 dashboard keyboard delete/,
  })
  await expect(deleteButton).toBeVisible()
  await deleteButton.focus()
  await expect(deleteButton).toBeFocused()
  await page.keyboard.press('Enter')

  const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Usunąć ten trening?' })
  await expect(confirmDialog).toBeVisible()
  await expect(page).toHaveURL('/dashboard')
  await confirmDialog.getByRole('button', { name: 'Anuluj', exact: true }).click()
  await expect(confirmDialog).not.toBeVisible()
})
```

Delete `workoutCount` and its `test.skip`.

- [ ] **Step 2: Run the test explicitly against the emulator**

```bash
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e \
firebase emulators:exec --only auth,firestore --project demo-ironlog \
"playwright test tests/e2e/dashboard.spec.ts --project=desktop --grep 'delete action' --retries=0"
```

Expected: PASS without relying on prior workouts.

- [ ] **Step 3: Commit deterministic fixture coverage**

```bash
git add tests/e2e/dashboard.spec.ts
git commit -m "test: seed dashboard keyboard deletion"
```

---

### Task 4: Add dashboard regressions to the isolated gate

**Files:**
- Modify: `package.json:25`

**Interfaces:**
- Produces: `npm run test:e2e:isolated` executes desktop dashboard regressions with Auth and Firestore emulators.

- [ ] **Step 1: Extend the isolated script**

Change the Playwright file list to include `tests/e2e/dashboard.spec.ts`:

```json
"test:e2e:isolated": "E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e firebase emulators:exec --only auth,firestore --project demo-ironlog \"playwright test tests/e2e/critical.spec.ts tests/e2e/profile.spec.ts tests/e2e/exercises.spec.ts tests/e2e/templates.spec.ts tests/e2e/dashboard.spec.ts --project=desktop\""
```

- [ ] **Step 2: Run the isolated gate**

```bash
npm run test:e2e:isolated
```

Expected: exit 0, dashboard desktop scenarios run, the mobile-only dashboard case is explicitly skipped, and no test retries.

- [ ] **Step 3: Commit the gate expansion**

```bash
git add package.json
git commit -m "test: gate dashboard regressions in emulator"
```

---

### Task 5: Run the complete quality-gate verification

**Files:**
- No product file changes.

**Interfaces:**
- Validates: accessibility, contrast, deterministic dashboard behavior, workout lifecycle, static correctness, and production bundling.

- [ ] **Step 1: Run fast checks**

```bash
npm run lint
npm run test:unit
npm run build
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 2: Run emulator E2E gates**

```bash
npm run test:e2e:a11y
npm run test:e2e:isolated
npm run test:e2e:workout
```

Expected: all commands exit 0; output contains no `retry #1` and no `flaky`.

- [ ] **Step 3: Inspect repository cleanliness**

```bash
git status --short
```

Expected: no Playwright report, video, screenshot, emulator log, or `test-results` artifact is staged.
