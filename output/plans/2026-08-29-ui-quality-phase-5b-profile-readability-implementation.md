# UI Quality Phase 5B — Profile and Readability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** READY_FOR_EXECUTION

**Goal:** Close the remaining confirmed Profile and essential-microtext findings without redesigning Puls or broadening the slice into an app-wide visual rewrite.

**Architecture:** Reuse the existing `.readiness-slider` treatment on the Profile range control and constrain the existing unit switch with CSS. Raise only explicit user-facing 9–11 px JSX labels plus the shared semantic `.eyebrow` to 12 px, and delete the five redundant Progress kickers already named by the audit. Keep data, stores, routes, component APIs and layout primitives unchanged.

**Tech Stack:** React 19, TypeScript, CSS, Tailwind utility classes, Playwright, Firebase Auth/Firestore emulators.

**Spec:** `output/plans/2026-08-14-ui-quality-roadmap.md` — Etap 5 / slice 5B Profile and readability.

## Global Constraints

- Preserve the Puls design system, existing Profile persistence, Firestore contracts and navigation behavior.
- Reuse `.readiness-slider`; do not add another range-control abstraction or dependency.
- Treat 12 px as the minimum for the explicit operational labels in this slice. Do not mechanically rewrite every small decorative metadata selector in `src/index.css`.
- Remove only kickers that repeat the adjacent Progress section title: `Objętość`, `Siła`, `Balans`, `Aktywność`, and `Wyniki · od początku`.
- Keep 44×44 px touch targets, visible focus and current Polish copy.
- Run Node-based verification with `PATH=/Users/patryk/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin` so Vitest uses the supported local Node 22 runtime.
- Visual completion requires fresh Browser observation at 320×844, 393×852, 1024×768 and 1440×900. Saved screenshots alone do not close the gate.

## Scope Lineage

`roadmapa UI quality → etap 5 → slice 5B Profile/readability → remaining: 5C final Product gate, B-02, M-07, M-14`.

---

### Task 1: Reuse the Profile slider and constrain the unit switch

**Risk closed:** `/profile` still uses the browser-default range track and lets a two-option `kg/lbs` control consume the full 42 rem form width.

**Files:**
- Modify: `src/pages/ProfilePage.tsx`
- Modify: `src/index.css`
- Test: `tests/e2e/profile.spec.ts`

**Interfaces:**
- Consumes: existing `.readiness-slider`, `.profile-unit-grid`, and accessible labels `Cel tygodniowy` / `Jednostki`.
- Produces: the same form state and submit payload; only control styling and geometry change.

- [ ] **Step 1: Add a failing Profile geometry contract**

Append a test inside `Profile hydration and save`:

```ts
test('reuses the authored slider and keeps the unit switch compact', async ({ page }) => {
  await page.goto('/profile')
  await expectAppReady(page, '/profile')

  const slider = page.getByRole('slider', { name: /Cel tygodniowy/ })
  const unitSwitch = page.locator('.profile-unit-grid')

  await expect(slider).toHaveClass(/readiness-slider/)
  await expect(unitSwitch).toBeVisible()

  const sliderBox = await slider.boundingBox()
  const unitBox = await unitSwitch.boundingBox()
  expect(sliderBox?.height ?? 0).toBeGreaterThanOrEqual(44)
  expect(unitBox?.width ?? Infinity).toBeLessThanOrEqual(224)
})
```

- [ ] **Step 2: Run the focused browser contract and verify failure**

Run:

```bash
PATH=/Users/patryk/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e firebase emulators:exec --only auth,firestore --project demo-ironlog "playwright test tests/e2e/profile.spec.ts --project=desktop --project=mobile --retries=0"
```

Expected: the new test fails because the slider lacks `readiness-slider` and the desktop unit grid is wider than 224 px.

- [ ] **Step 3: Apply the smallest existing treatments**

In `ProfilePage.tsx`, replace the range class:

```tsx
className="readiness-slider w-full"
```

In the existing `.profile-unit-grid` rule, add:

```css
width: min(100%, 14rem);
```

- [ ] **Step 4: Run the focused Profile contract**

Run the Step 2 command again. Expected: both projects pass; save/hydration behavior remains green.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ProfilePage.tsx src/index.css tests/e2e/profile.spec.ts
git commit -m "fix: refine profile controls"
```

---

### Task 2: Raise explicit operational microtext and remove redundant Progress kickers

**Risk closed:** essential navigation, state, scale and workout data labels still render at 9–11 px, while Progress repeats low-information labels directly above descriptive headings.

**Files:**
- Modify: `src/components/AiKeyPanel.tsx`
- Modify: `src/components/BottomNav.tsx`
- Modify: `src/components/ReadinessPrompt.tsx`
- Modify: `src/pages/DashboardPage.tsx`
- Modify: `src/pages/ExerciseDetailPage.tsx`
- Modify: `src/pages/WorkoutPage.tsx`
- Modify: `src/pages/ProgressPage.tsx`
- Modify: `src/index.css`
- Test: `tests/e2e/accessibility.spec.ts`
- Test: `tests/e2e/progress.spec.ts`

**Interfaces:**
- Consumes: existing Tailwind `text-xs`, shared `.eyebrow`, and current Progress headings.
- Produces: unchanged copy and interactions at a 12 px minimum for the explicit labels; Progress headings remain the accessible section names.

- [ ] **Step 1: Add failing readability contracts**

In `accessibility.spec.ts`, add a mobile-only test:

```ts
test('essential mobile labels render at 12px or larger', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile typography contract')
  await page.goto('/dashboard')
  await expectAppReady(page, '/dashboard')

  const labels = page.locator('.bottom-nav-button > span')
  expect(await labels.count()).toBeGreaterThan(0)
  for (const label of await labels.all()) {
    const fontSize = await label.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))
    expect(fontSize).toBeGreaterThanOrEqual(12)
  }
})
```

In the existing `loads a stable analytics board with all-time records` test in `progress.spec.ts`, add:

```ts
await expect(page.locator('.progress-panel-head > div > p')).toHaveCount(0)
await expect(page.locator('.progress-records-head > div > p')).toHaveCount(0)
```

- [ ] **Step 2: Run the two focused tests and verify failure**

Run:

```bash
PATH=/Users/patryk/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e firebase emulators:exec --only auth,firestore --project demo-ironlog "playwright test tests/e2e/accessibility.spec.ts tests/e2e/progress.spec.ts --project=desktop --project=mobile --retries=0"
```

Expected: the navigation assertion sees 9 px and the Progress kicker assertions find rendered paragraphs.

- [ ] **Step 3: Raise the explicit JSX labels to Tailwind `text-xs`**

Replace every current `text-[9px]`, `text-[10px]` and `text-[11px]` occurrence under `src/` with `text-xs`. Verify the bounded source set with:

```bash
rg -n "text-\[(9|10|11)px\]" src
```

Expected after the edit: no matches. This affects only the ten explicit user-facing labels already present in source; do not alter arbitrary CSS metadata rules.

- [ ] **Step 4: Raise the shared semantic eyebrow floor**

In the existing `.eyebrow` rule in `src/index.css`, change:

```css
font-size: 0.75rem;
```

- [ ] **Step 5: Delete the five redundant Progress kickers**

In `ProgressPage.tsx`, remove only the `<p>` immediately preceding each of these headings:

```text
Wolumen tygodniowy
Progresja ciężaru
Partie mięśniowe
Kalendarz
Rekordy od początku
```

Keep every `<h2>`, range count, selector, record count and screen-reader summary unchanged. Remove a wrapping `<div>` only where it becomes a single-child wrapper and no selector or layout dependency needs it.

- [ ] **Step 6: Run focused contracts and source check**

Run the Step 2 browser command, then:

```bash
rg -n "text-\[(9|10|11)px\]" src
```

Expected: browser contracts pass and `rg` returns no matches.

- [ ] **Step 7: Commit**

```bash
git add src/components/AiKeyPanel.tsx src/components/BottomNav.tsx src/components/ReadinessPrompt.tsx src/pages/DashboardPage.tsx src/pages/ExerciseDetailPage.tsx src/pages/WorkoutPage.tsx src/pages/ProgressPage.tsx src/index.css tests/e2e/accessibility.spec.ts tests/e2e/progress.spec.ts
git commit -m "fix: improve essential text readability"
```

---

### Task 3: Verify the complete 5B slice and prepare integration

**Risk closed:** a typography increase can create wrapping or overflow that source checks and unit tests cannot detect.

**Files:**
- Modify: `output/plans/2026-08-29-ui-quality-phase-5b-profile-readability-implementation.md`
- Modify: `output/plans/2026-08-14-ui-quality-roadmap.md`
- Create: `output/playwright/ui-quality-phase-5b-profile-readability/` screenshots

**Interfaces:**
- Consumes: Tasks 1–2 and the Etap 5 acceptance criteria.
- Produces: verified implementation commits, fresh runtime evidence and `READY_FOR_INTEGRATION` lifecycle state.

- [ ] **Step 1: Run repository gates**

```bash
PATH=/Users/patryk/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin npm run lint
PATH=/Users/patryk/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin npm run test:unit
PATH=/Users/patryk/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin npm run build
git diff --check
```

Expected: all commands pass.

- [ ] **Step 2: Run the combined targeted browser gate**

```bash
PATH=/Users/patryk/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e firebase emulators:exec --only auth,firestore --project demo-ironlog "playwright test tests/e2e/profile.spec.ts tests/e2e/accessibility.spec.ts tests/e2e/progress.spec.ts --project=desktop --project=mobile --retries=0"
```

Expected: all applicable scenarios pass with only intentional project skips.

- [ ] **Step 3: Observe the implemented state in Browser**

Use Browser as the primary surface. Serially inspect `/profile`, `/progress`, `/dashboard`, `/workout/new`, one exercise detail route and `/chat` at 320×844, 393×852, 1024×768 and 1440×900. Confirm:

- Profile slider has a dark authored track, 44 px control height and a compact unit switch.
- Important labels are legible, do not collide and do not introduce horizontal overflow.
- Progress headings remain clear without the deleted kickers.
- Keyboard focus is visible; bottom navigation remains usable at 320 px.
- No new console warning or error appears.

Save representative screenshots under `output/playwright/ui-quality-phase-5b-profile-readability/` and record Browser event completion in the receipt. A screenshot file without completed Browser observation is insufficient.

- [ ] **Step 4: Review the whole slice**

Review from the planning parent through `HEAD`. Reject expansion into decorative metadata, layout redesign, data changes or new dependencies. Verify that every changed class or rule has a visible runtime consumer.

- [ ] **Step 5: Update lifecycle artifacts**

Set this plan to `READY_FOR_INTEGRATION` and append an execution receipt containing commit range, exact test counts, gate results, Browser observation, screenshot paths and review result. Update the parent roadmap to state: 5B verified pending local integration; 5C remains next; B-02, M-07 and M-14 remain open.

- [ ] **Step 6: Commit the receipt**

```bash
git add output/plans/2026-08-29-ui-quality-phase-5b-profile-readability-implementation.md output/plans/2026-08-14-ui-quality-roadmap.md
git commit -m "docs: prepare profile readability integration"
```

No push without explicit authority.
