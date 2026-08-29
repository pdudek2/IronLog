# UI Quality Phase 5D — Touch and Readability Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two `MATERIAL` findings from the 5C Product gate by restoring 44 px mobile hit areas on Dashboard and a computed 12 px floor for operational labels in the template editor and active workout.

**Architecture:** Reuse the existing `.mobile-touch-target` utility for Dashboard controls and change only the four route-specific typography selectors measured by 5C. Add geometry and computed-font Playwright contracts before each CSS/markup change; do not broaden the typography pass to decorative metadata.

**Tech Stack:** React 19, TypeScript, CSS, Playwright, Firebase Auth/Firestore emulators, Vite.

**Spec:** `output/playwright/ui-quality-phase-5c-final-product-gate/final-product-audit.md` and `output/plans/2026-08-14-ui-quality-roadmap.md` — slice 5D.

## Global Constraints

- Preserve the Puls hierarchy and visual weight; enlarge hit areas without making the controls look like primary CTAs.
- Use the existing `.mobile-touch-target`; do not add another touch-size abstraction.
- Raise only `.template-name-panel .planner-kicker`, `.template-day-editor-head .planner-kicker`, `.template-exercise-columns`, `.workout-set-header`, and `.workout-set-vol` to a computed minimum of 12 px.
- Do not change heatmap labels, exercise taxonomy, category badges, data contracts, workout lifecycle, Firestore rules, APIs or dependencies.
- Execute every production change through a failing Playwright contract first.
- Keep B-02, M-07 and M-14 outside this slice.

---

### Task 1: Restore Dashboard mobile hit areas

**Files:**
- Modify: `tests/e2e/dashboard.spec.ts`
- Modify: `src/components/TopNav.tsx`
- Modify: `src/pages/DashboardPage.tsx`

**Interfaces:**
- Consumes: existing `.mobile-touch-target`, `seedLifecycleWorkout()` and Dashboard role names.
- Produces: 44×44 px minimum for the streak button and `Zobacz progres` at 320 px.

- [ ] **Step 1: Add the failing deterministic geometry test**

Add this mobile/emulator-only test inside `Dashboard regressions`:

```ts
test('exposes 44px dashboard streak and progress targets at 320px', async ({ page, cleanup }, testInfo) => {
  test.skip(!emulatorMode, 'emulator-only deterministic fixture')
  test.skip(testInfo.project.name !== 'mobile', 'mobile-only geometry contract')
  await page.setViewportSize({ width: 320, height: 844 })
  const sessionId = 'phase-5d-dashboard-hit-area'
  cleanup.add('remove dashboard hit-area workout', () => deleteLifecycleWorkout(sessionId))
  await deleteLifecycleWorkout(sessionId)
  await seedLifecycleWorkout({ sessionId, materialized: true, label: 'Phase 5D hit area' })
  await openDashboard(page)

  for (const control of [
    page.getByRole('button', { name: /Seria treningowa/ }),
    page.getByRole('button', { name: 'Zobacz progres' }),
  ]) {
    const box = await control.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }
})
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e firebase emulators:exec --only auth,firestore --project demo-ironlog "npx playwright test tests/e2e/dashboard.spec.ts --project=mobile --grep 'exposes 44px dashboard streak' --retries=0"
```

Expected: fail because the streak is about 32.7 px high and `Zobacz progres` about 22 px high.

- [ ] **Step 3: Apply the minimal production change**

Add `mobile-touch-target` to the existing class list on both buttons:

```tsx
className="streak-pill mobile-touch-target"
```

```tsx
className="puls-link-button mobile-touch-target px-0 py-0 text-sm font-semibold"
```

- [ ] **Step 4: Run the test and verify GREEN**

Run the Step 2 command. Expected: 1 passed, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/dashboard.spec.ts src/components/TopNav.tsx src/pages/DashboardPage.tsx
git commit -m "fix: restore dashboard mobile hit areas"
```

### Task 2: Restore the template editor operational text floor

**Files:**
- Modify: `tests/e2e/mobile-ergonomics.spec.ts`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `openLargeTemplateDraft(page)` and existing template-editor selectors.
- Produces: computed font size >=12 px for visible name/day labels and `Serie / Powt. / Ciężar` columns at 320 and 393 px.

- [ ] **Step 1: Add the failing computed-font test**

Add inside `Phase 4 mobile ergonomics`:

```ts
test('keeps template editor operational labels at 12px or larger', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile-only typography contract')
  await page.setViewportSize({ width: 320, height: 844 })
  await openLargeTemplateDraft(page)

  const labels = page.locator([
    '.template-name-panel .planner-kicker',
    '.template-day-editor-head .planner-kicker',
    '.template-exercise-columns span:visible',
  ].join(', '))
  expect(await labels.count()).toBeGreaterThan(0)
  for (const label of await labels.all()) {
    const size = await label.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))
    expect(size).toBeGreaterThanOrEqual(12)
  }
})
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e firebase emulators:exec --only auth,firestore --project demo-ironlog "npx playwright test tests/e2e/mobile-ergonomics.spec.ts --project=mobile --grep 'template editor operational labels' --retries=0"
```

Expected: fail with computed sizes 10.56 px or 11.2 px.

- [ ] **Step 3: Apply the narrow CSS correction**

Add route-specific rules without changing the shared `.planner-kicker`:

```css
.template-name-panel .planner-kicker,
.template-day-editor-head .planner-kicker,
.template-exercise-columns {
  font-size: 0.75rem;
}
```

- [ ] **Step 4: Run the test and verify GREEN**

Run the Step 2 command. Expected: 1 passed, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/mobile-ergonomics.spec.ts src/index.css
git commit -m "fix: raise template operational labels"
```

### Task 3: Restore the active-workout operational text floor

**Files:**
- Modify: `tests/e2e/workout-mobile.spec.ts`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: existing `goToFreshWorkout(page)`, `addExercise(page, search)` and cleanup helper in the workout mobile suite.
- Produces: computed font size >=12 px for set headers and volume values at 320 px.

- [ ] **Step 1: Add the failing computed-font test**

Add inside `Active workout shell reduction`:

```ts
test('keeps active workout operational labels at 12px or larger', async ({ page, cleanup }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile-only typography contract')
  cleanup.add('discard active session', () => discardActiveSessionAfterFontsSettle(page))
  await page.setViewportSize({ width: 320, height: 844 })
  await goToFreshWorkout(page)
  await addExercise(page, 'Squat')

  const labels = page.locator('.workout-set-header span, .workout-set-vol')
  expect(await labels.count()).toBeGreaterThan(0)
  for (const label of await labels.all()) {
    const size = await label.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))
    expect(size).toBeGreaterThanOrEqual(12)
  }
})
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e firebase emulators:exec --only auth,firestore --project demo-ironlog "npx playwright test tests/e2e/workout-mobile.spec.ts --project=mobile --grep 'active workout operational labels' --retries=0"
```

Expected: fail with computed sizes 10.88 px or 11.52 px.

- [ ] **Step 3: Apply the narrow CSS correction**

Change only the existing selectors:

```css
.workout-set-header,
.workout-set-vol {
  font-size: 0.75rem;
}
```

- [ ] **Step 4: Run the test and verify GREEN**

Run the Step 2 command. Expected: 1 passed, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/workout-mobile.spec.ts src/index.css
git commit -m "fix: raise workout operational labels"
```

### Task 4: Verify pixels, close Etap 5 and prepare integration

**Files:**
- Modify: `output/plans/2026-08-29-ui-quality-phase-5d-touch-readability-implementation.md`
- Modify: `output/plans/2026-08-14-ui-quality-roadmap.md`
- Create: `output/playwright/ui-quality-phase-5d-touch-readability/`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: target screenshots, verification receipt and Etap 5 closeout.

- [ ] **Step 1: Run the combined target gate**

```bash
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e firebase emulators:exec --only auth,firestore --project demo-ironlog "npx playwright test tests/e2e/dashboard.spec.ts tests/e2e/mobile-ergonomics.spec.ts tests/e2e/workout-mobile.spec.ts --project=mobile --retries=0"
```

Expected: all selected mobile tests pass.

- [ ] **Step 2: Run repository gates with the bundled Node runtime**

```bash
npm run test:unit
npm run lint
npm run build
```

Expected: 602+ unit tests, lint and build pass.

- [ ] **Step 3: Observe the corrected states in a fresh Browser runtime**

Capture and inspect:

- Dashboard filled at 320×844 and 393×852, with measured streak and `Zobacz progres` hitboxes >=44 px.
- Template editor filled at 393×852, with measured operational labels >=12 px.
- Active workout with one exercise at 320×844, with measured set headers and volume values >=12 px.
- Horizontal overflow = 0 and Browser warning/error count = 0 for all four observations.

Save representative screenshots under `output/playwright/ui-quality-phase-5d-touch-readability/`.

- [ ] **Step 4: Update receipts and close Etap 5**

Mark this plan `READY_FOR_INTEGRATION`, append exact test counts, commit range and current-runtime measurements. Update the parent roadmap to mark 5D verified pending integration and Etap 5 ready to close; B-02, M-07 and M-14 remain open product decisions.

- [ ] **Step 5: Commit the evidence**

```bash
git add output/plans/2026-08-29-ui-quality-phase-5d-touch-readability-implementation.md output/plans/2026-08-14-ui-quality-roadmap.md output/playwright/ui-quality-phase-5d-touch-readability
git commit -m "docs: record touch readability verification"
```

After verification, use `superpowers:finishing-a-development-branch`. No push without explicit authority.
