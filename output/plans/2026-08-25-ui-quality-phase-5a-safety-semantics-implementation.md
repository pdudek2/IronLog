# UI Quality Phase 5A — Safety and Semantic Color Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** DONE

**Goal:** Prevent accidental loss of a populated workout set and make category/muscle identity colors visually distinct from Puls semantic state colors without redesigning the product.

**Architecture:** Keep set removal in the existing workout store and add one confirmation boundary in `WorkoutPage`: empty, incomplete sets remain one-tap removable; populated or completed sets require the existing `ConfirmDialog`. Store pending removal by exercise/set `clientId`, then resolve current indexes only when the user confirms so passive session synchronization cannot redirect the deletion. Replace category and muscle identity hues in their current owners, and remove category color from the dashboard's bare set count by giving it an explicit Polish label and neutral text treatment.

**Tech Stack:** React 19, Zustand, TypeScript, CSS, Vitest, Playwright, Firebase Auth/Firestore emulators.

**Spec:** `output/plans/2026-08-14-ui-quality-roadmap.md` — Etap 5 / slice 5A safety and semantics.

## Global constraints

- Preserve the existing workout store, active-session sync, Firestore contracts, finalize/discard APIs and `ConfirmDialog` component.
- Empty, incomplete sets stay immediately removable; only a set with weight, reps or `done` requires confirmation.
- Resolve a confirmed deletion from stable exercise/set identity, not stale array indexes.
- Category/muscle identity colors must not equal `--puls-effort`, `--puls-recovery` or `--puls-warning`; semantic colors keep their existing meanings.
- Keep identity accents on labeled categories and row focus/hover. Do not recolor the selected strength-series chart or alter unused `SERIES_COLORS` without a runtime consumer.
- Do not add a color abstraction, dependency, toast/undo system or sweeping destructive-action component.
- Visual completion requires fresh observation of active workout, dashboard/history and progress at 393×852 and 1440×900 after the final relevant change.

## Scope lineage

`roadmapa UI quality → etap 5 → slice 5A safety/semantics → remaining: 5B profile/readability, 5C final Product gate, B-02, M-07, M-14`.

---

### Task 1: Protect populated workout sets from one-tap deletion

**Risk closed:** `WorkoutPage.handleRemoveSet` currently deletes completed or populated data immediately. An accidental tap can remove recorded work without confirmation or recovery.

**Files:**
- Modify: `tests/e2e/workout-mobile.spec.ts`
- Modify: `src/pages/WorkoutPage.tsx`

**Interfaces:**
- Consumes: `WorkoutExercise.clientId`, `WorkoutSet.clientId`, `useWorkoutStore.removeSet` and the existing `ConfirmDialog`.
- Produces: immediate removal for blank/incomplete sets and an identity-safe confirmation flow for populated/completed sets.

- [x] **Step 1: Add the failing browser contract**

Add one focused scenario to `workout-mobile.spec.ts` that starts a fresh workout, adds `Squat`, and proves both branches:

1. add a second blank set and remove it; no dialog appears and the set count drops immediately;
2. fill the remaining set with `60 kg` and `8` reps, tap its remove button, and verify the set stays present while a dialog titled `Usunąć serię?` is open;
3. cancel with `Zostaw` and verify the set remains;
4. open the dialog again, confirm `Usuń serię`, and verify the exercise becomes empty rather than retaining the populated set.

The production mutation this test catches is routing every remove tap directly to `removeSet`, bypassing the populated-set confirmation branch.

- [x] **Step 2: Run the focused scenario and confirm RED**

```bash
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e npm exec --package=firebase-tools -- firebase emulators:exec --only auth,firestore --project demo-ironlog "npx playwright test tests/e2e/workout-mobile.spec.ts --project=mobile --grep 'protects populated sets' --retries=0"
```

Expected: the populated set disappears immediately and the expected dialog is absent.

- [x] **Step 3: Add the minimum identity-safe confirmation boundary**

In `WorkoutPage.tsx`:

- add `pendingSetRemoval` state containing `exerciseClientId`, `setClientId` and the 1-based set number used in accessible copy;
- in `handleRemoveSet`, read the current set from `useWorkoutStore.getState().active`; if weight/reps are blank and `done` is false, call `removeSet` immediately;
- otherwise set the pending identity instead of mutating the store;
- on confirmation, resolve both current indexes from the stored client IDs, remove only if both still exist, then clear pending state;
- render the existing `ConfirmDialog` with title `Usunąć serię?`, message `Ta seria zawiera wpisane dane lub jest oznaczona jako wykonana.`, confirm label `Usuń serię` and cancel label `Zostaw`.

Do not change `removeSet`, add undo, or introduce a helper unless the branch becomes unreadable inline.

- [x] **Step 4: Run the focused scenario and confirm GREEN**

Run the Step 2 command again. Expected: both immediate-empty and confirmed-populated branches pass with no console warning/error.

- [x] **Step 5: Commit the protected deletion contract**

```bash
git add src/pages/WorkoutPage.tsx tests/e2e/workout-mobile.spec.ts
git commit -m "fix: confirm removal of populated workout sets"
```

---

### Task 2: Separate identity hues from semantic state colors

**Risk closed:** category and muscle colors reuse the exact Puls effort/recovery/warning values, so unlabeled or weakly labeled accents can read as error, success or warning state.

**Files:**
- Modify: `src/lib/exerciseLabels.ts`
- Modify: `src/lib/__tests__/exerciseLabels.test.ts`
- Modify: `src/pages/ProgressPage.tsx`
- Modify: `src/pages/DashboardPage.tsx`
- Modify: `src/index.css`
- Test: `tests/e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes: `EXERCISE_CATEGORY_COLORS`, local `MUSCLE_COLORS`, `polishPlural` and the existing `--workout-accent` row identity.
- Produces: nonsemantic identity palettes plus a neutral, explicitly labeled dashboard set count.

- [x] **Step 1: Replace the literal color change detector with behavior contracts**

In `exerciseLabels.test.ts`, remove the assertion that `chest` equals one exact hex value. Add an invariant test that category colors are unique and none equals the three semantic Puls literals `#F0435A`, `#8FB8A0`, `#F0A75A` (case-insensitive). The production mutation it catches is reusing a semantic state token as category identity.

In `dashboard.spec.ts`, extend the recent-workout contract to assert the visible set badge is labeled with `seria/serie/serii`, not only `N×`.

- [x] **Step 2: Run the focused tests and confirm RED**

```bash
npx vitest run src/lib/__tests__/exerciseLabels.test.ts
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e npm exec --package=firebase-tools -- firebase emulators:exec --only auth,firestore --project demo-ironlog "npx playwright test tests/e2e/dashboard.spec.ts --project=desktop --grep 'recent' --retries=0"
```

Expected: the palette invariant fails on current semantic colors and the dashboard badge lacks the explicit set label.

- [x] **Step 3: Apply the smallest identity-color change**

- update `EXERCISE_CATEGORY_COLORS` to a readable nonsemantic identity palette;
- update the local `MUSCLE_COLORS` in `ProgressPage` to the same principle without forcing the two taxonomies into a shared abstraction;
- render the dashboard badge as `N seria/serie/serii` using existing `polishPlural`;
- change `.dashboard-history-set` to neutral secondary text while retaining `--workout-accent` for the labeled row/category identity and interactive accent.

Start from this contrast-checked palette on `#111012`: chest `#D97B91`, back `#9BB7C8`, legs `#D6A06F`, shoulders `#A898C8`, arms `#C38B73`, core `#A7A0B5`, cardio `#76ADB1`. Adjust only if fresh runtime reveals a legibility or hierarchy problem.

- [x] **Step 4: Run focused unit and browser tests**

Run the Step 2 commands again. Expected: both pass.

- [x] **Step 5: Commit semantic separation**

```bash
git add src/lib/exerciseLabels.ts src/lib/__tests__/exerciseLabels.test.ts src/pages/ProgressPage.tsx src/pages/DashboardPage.tsx src/index.css tests/e2e/dashboard.spec.ts
git commit -m "fix: separate identity accents from status colors"
```

---

### Task 3: Verify destructive hierarchy and close slice 5A

**Risk closed:** A code-only palette and dialog change can still leave destructive controls louder than primary actions, undersized, clipped or visually ambiguous in the actual runtime.

**Files:**
- Modify only if qualified by runtime: `src/index.css`
- Modify: `output/plans/2026-08-25-ui-quality-phase-5a-safety-semantics-implementation.md`
- Modify: `output/plans/2026-08-14-ui-quality-roadmap.md`
- Create: `output/playwright/ui-quality-phase-5a-safety-semantics/`

- [x] **Step 1: Run focused lifecycle and repository gates**

```bash
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e npm exec --package=firebase-tools -- firebase emulators:exec --only auth,firestore --project demo-ironlog "npx playwright test tests/e2e/workout-mobile.spec.ts tests/e2e/dashboard.spec.ts --project=mobile --project=desktop --retries=0"
npm run lint
NODE_OPTIONS=--max-old-space-size=4096 npm run test:unit
npm run build
git diff --check
```

- [x] **Step 2: Observe final pixels in one isolated browser session**

Use the `playwright` skill with a named session. At 393×852 and 1440×900 inspect:

- active workout: blank-set immediate removal, populated-set dialog, cancel and confirm, 44×44 remove target, keyboard focus and no stale-index deletion;
- dashboard/history: neutral labeled set counts and category accents that no longer resemble status state;
- progress: weekly/muscle identity colors remain readable and distinct from success/warning/error;
- templates, exercises and workout detail: existing destructive actions remain quiet at rest and explicit after activation.

Capture representative mobile and desktop screenshots in `output/playwright/ui-quality-phase-5a-safety-semantics/` and inspect each separately with `view_image`. Record viewport/document geometry and console warnings/errors.

- [x] **Step 3: Apply CSS only for a qualified destructive-hierarchy defect**

If runtime shows a real inconsistency, reuse existing destructive-action rules and make the minimum local CSS adjustment: quiet neutral/warning treatment at rest, visible focus, minimum 44 px target, and clear destructive treatment inside `ConfirmDialog`. Do not add a component or hide list deletion behind hover/swipe.

- [x] **Step 4: Review the entire slice**

Review `BASE..HEAD` for Critical/Important findings. Verify stable identity resolution, cancel/confirm behavior, no lifecycle/API changes, contrast and absence of semantic color reuse. Any qualified finding gets a failing regression test before the fix.

- [x] **Step 5: Write the receipt and commit evidence**

Set this plan to `READY_FOR_INTEGRATION`, record the verified commit range, exact gate counts, visual evidence and review result. Update the parent roadmap: 5A verified pending integration; 5B Profile/readability next; 5C final Product gate after 5B; B-02, M-07 and M-14 remain open.

```bash
git add output/plans/2026-08-25-ui-quality-phase-5a-safety-semantics-implementation.md output/plans/2026-08-14-ui-quality-roadmap.md output/playwright/ui-quality-phase-5a-safety-semantics
git commit -m "docs: prepare semantic safety integration"
```

No push without explicit authority.

## Execution receipt — 2026-08-25

- **Branch / verified implementation range:** `ui-quality-phase-5a-safety-semantics`, `ab7af86..0b3b46a`.
- **TDD evidence:** the populated-set scenario first failed because `Usunąć serię?` did not exist and the set disappeared immediately. The palette invariant first failed on all three semantic literals; the dashboard browser contract first received `2×` instead of `2 serie`.
- **Focused contracts:** populated/empty set browser scenario passed 2/2 including setup; exercise-label unit suite passed 3/3; labeled-set dashboard scenario passed 2/2 including setup.
- **Targeted browser gate:** `workout-mobile.spec.ts` + `dashboard.spec.ts` across desktop/mobile passed 15 scenarios with 10 intentional breakpoint skips and no failures.
- **Repository gates:** lint PASS; unit PASS — 74 files / 602 tests; build PASS; `git diff --check` PASS. The initial Node 25 baseline exposed a runner-only incomplete global `localStorage`; the supported local Node 22 rerun passed 602/602 without product changes.
- **Runtime measurements:** 393×852 and 1440×900 had no horizontal overflow. Dashboard set labels rendered at 12 px in neutral `rgb(160, 154, 160)`; visible dashboard delete targets were 44×44 px at 0.72 opacity. The set-removal dialog kept the populated set mounted, exposed 44 px actions and focused `Zostaw`; inspected pages returned zero console warnings/errors. Muscle bars used `#A898C8`, `#D97B91`, `#C38B73`, `#9BB7C8`, `#76ADB1`, `#D6A06F`, `#B78568` and `#918A9D`, distinct from Puls effort/recovery/warning.
- **Visual evidence:** Observed — surface: Browser; completed Browser events returned final dashboard, progress and populated-set dialog states at both breakpoints. Pixel proof: `view_image` separately read `dashboard-mobile.png`, `progress-mobile.png`, `workout-set-confirm-mobile.png`, `dashboard-desktop.png`, `progress-desktop.png` and `workout-set-confirm-desktop.png`; the returned images showed neutral labeled counts, a distinct muted identity palette, quiet 44 px destructive affordances and a clear confirmation hierarchy with visible cancel focus.
- **CSS qualification:** no additional destructive-action CSS change was warranted after runtime inspection; current controls are quiet at rest, meet the hit-area contract and become explicit inside the existing confirmation surface.
- **Review:** whole-range review found no Critical or Important issues. No Firestore schema, lifecycle, finalize/discard API, route or dependency changed.
- **Integration:** merged locally to `main` by fast-forward at `14fed63`; merged-result lint, unit (74 files / 602 tests), build and `git diff --check` all passed. The owned worktree and feature branch were removed; no push performed.
