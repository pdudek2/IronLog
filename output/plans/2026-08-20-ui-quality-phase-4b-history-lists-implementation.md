# UI Quality Phase 4B — History and Lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** DONE

**Goal:** Turn History, Plans and the Exercise Library into compact Puls workbenches: History is grouped by month, short plan lists reveal their structure immediately, and all three surfaces keep readable line lengths on wide screens.

**Architecture:** Keep the existing page components, Firestore services and interaction contracts. Add one shared CSS width variant (`.workbench-page`), derive History month groups locally from the already-filtered list, and make the existing plan detail board automatically visible only when the loaded list has one or two plans. No pagination, new design system, data migration or dependency is introduced.

**Tech Stack:** React 19, TypeScript, CSS, Vitest + Testing Library, Playwright, Firebase Auth/Firestore emulators.

**Spec:** `output/plans/2026-08-14-ui-quality-roadmap.md` — Etap 4 / slice 4B Historia/listy.

## Global constraints

- Preserve the Puls palette, flat ledger surfaces and the existing focus ring.
- Do not change Firestore contracts, `exerciseSource`, workout lifecycle, or any service write path.
- History uses fixed month grouping; pagination stays deferred until runtime measurements justify it.
- Short plan lists expose structure without a required disclosure action; longer lists retain the current disclosure interaction.
- Reuse existing components and CSS tokens; add no package and no parallel layout system.
- Preserve loading, error, empty, retry, launch, edit and destructive confirmation flows.
- Important controls remain at least 44×44 px and keyboard reachable.
- Visual completion requires fresh direct observation at 393×852 and 1440×900 after the final relevant change.

## Scope lineage

`roadmapa UI quality → etap 4 → slice 4B Historia/listy → remaining: 4C shell/404, etap 5, B-02, M-07, M-14`.

---

### Task 1: Monthly History workbench

**Risk closed:** History currently presents one uninterrupted ledger and forces long desktop scans; grouping must preserve every filtered result and existing empty/error behavior.

**Files:**
- Modify: `src/pages/HistoryPage.tsx:25-407`
- Modify: `src/index.css:2834-3165` and the Puls workspace convergence block near `src/index.css:9201`
- Test: `src/pages/__tests__/HistoryPage.test.tsx`

**Interfaces:**
- Consumes: the existing `filtered: DerivedWorkout[]`, whose order already matches `getWorkoutHistory`.
- Produces: `groupWorkoutsByMonth(workouts: DerivedWorkout[]): WorkoutMonthGroup[]` and the shared `.workbench-page` layout class used by Tasks 2 and 3.

- [x] **Step 1: Add the failing month-grouping test**

Add `within` to the Testing Library import and append this test to `HistoryPage.test.tsx`:

```tsx
it('groups filtered workouts by month without changing their order', async () => {
  const now = new Date()
  const currentMonthWorkout = now.getTime() - 86_400_000
  const secondCurrentMonthWorkout = now.getTime() - 2 * 86_400_000
  const previousMonthWorkout = new Date(
    now.getFullYear(),
    now.getMonth() - 1,
    15,
    12,
  ).getTime()
  const monthLabel = (timestamp: number) => {
    const label = new Intl.DateTimeFormat('pl-PL', {
      month: 'long',
      year: 'numeric',
    }).format(timestamp)
    return label.charAt(0).toLocaleUpperCase('pl-PL') + label.slice(1)
  }

  mocks.getWorkoutHistory.mockResolvedValue({
    workouts: [
      {
        id: 'current-a',
        startedAt: currentMonthWorkout,
        finishedAt: currentMonthWorkout + 3_600_000,
        materialized: true,
        label: 'Bieżąca A',
        exercises: [{ name: 'Przysiad', sets: [{ weight: 80, reps: 5 }] }],
      },
      {
        id: 'current-b',
        startedAt: secondCurrentMonthWorkout,
        finishedAt: secondCurrentMonthWorkout + 3_600_000,
        materialized: true,
        label: 'Bieżąca B',
        exercises: [{ name: 'Wiosłowanie', sets: [{ weight: 60, reps: 8 }] }],
      },
      {
        id: 'previous',
        startedAt: previousMonthWorkout,
        finishedAt: previousMonthWorkout + 3_600_000,
        materialized: true,
        label: 'Poprzedni miesiąc',
        exercises: [{ name: 'Martwy ciąg', sets: [{ weight: 100, reps: 5 }] }],
      },
    ],
    truncated: false,
  })

  render(<HistoryPage />)

  const currentGroup = (await screen.findByRole('heading', {
    level: 2,
    name: new RegExp(monthLabel(currentMonthWorkout)),
  })).closest('section')
  const previousGroup = screen.getByRole('heading', {
    level: 2,
    name: new RegExp(monthLabel(previousMonthWorkout)),
  }).closest('section')

  expect(currentGroup).not.toBeNull()
  expect(previousGroup).not.toBeNull()
  expect(within(currentGroup as HTMLElement).getAllByRole('button').map((row) => row.textContent))
    .toEqual(expect.arrayContaining([expect.stringContaining('Bieżąca A'), expect.stringContaining('Bieżąca B')]))
  expect(within(previousGroup as HTMLElement).getByText('Poprzedni miesiąc')).toBeInTheDocument()
  expect(currentGroup?.compareDocumentPosition(previousGroup as Node) & Node.DOCUMENT_POSITION_FOLLOWING)
    .toBeTruthy()
})
```

- [x] **Step 2: Run the focused test and confirm RED**

Run:

```bash
npx vitest run src/pages/__tests__/HistoryPage.test.tsx
```

Expected: FAIL because no level-2 month headings exist.

- [x] **Step 3: Add the minimal grouping derivation**

Add beside `DerivedWorkout`:

```tsx
interface WorkoutMonthGroup {
  key: string
  label: string
  workouts: DerivedWorkout[]
}

function formatMonthLabel(timestamp: number): string {
  const label = new Intl.DateTimeFormat('pl-PL', {
    month: 'long',
    year: 'numeric',
  }).format(timestamp)
  return label.charAt(0).toLocaleUpperCase('pl-PL') + label.slice(1)
}

function groupWorkoutsByMonth(workouts: DerivedWorkout[]): WorkoutMonthGroup[] {
  const groups: WorkoutMonthGroup[] = []
  for (const item of workouts) {
    const date = new Date(item.workout.startedAt)
    const key = `${date.getFullYear()}-${date.getMonth()}`
    const current = groups.at(-1)
    if (current?.key === key) {
      current.workouts.push(item)
    } else {
      groups.push({
        key,
        label: formatMonthLabel(item.workout.startedAt),
        workouts: [item],
      })
    }
  }
  return groups
}
```

After `filtered`, derive:

```tsx
const monthGroups = useMemo(() => groupWorkoutsByMonth(filtered), [filtered])
```

Add `workbench-page` to the History root. Replace the successful flat map with semantic month sections while leaving every row body unchanged:

```tsx
<div className="history-page workbench-page">
  {/* existing header and controls */}
  <div className="history-month-list">
    {monthGroups.map((group) => {
      const headingId = `history-month-${group.key}`
      return (
        <section key={group.key} className="history-month-group" aria-labelledby={headingId}>
          <div className="history-month-heading">
            <h2 id={headingId}>{group.label}</h2>
            <span>{group.workouts.length} {polishPlural(group.workouts.length, 'sesja', 'sesje', 'sesji')}</span>
          </div>
          <div className="history-workout-list">
            {group.workouts.map(({ workout, totalSets, totalVolume, categories, exerciseNames }) => (
              /* existing history-workout-row button, unchanged */
            ))}
          </div>
        </section>
      )
    })}
  </div>
</div>
```

Do not sort again; grouping must preserve the service order.

- [x] **Step 4: Add the shared workbench width and flat month hierarchy**

Add to the workspace convergence CSS block:

```css
.workbench-page {
  width: min(100%, 65rem);
  margin-inline: auto;
}

.workbench-page .history-page-header h1,
.workbench-page .planner-header h1,
.workbench-page .exercise-library-header-copy h1 {
  font-size: clamp(2.4rem, 4vw, 3.35rem);
}

.history-month-list {
  display: grid;
  gap: 1.5rem;
}

.history-month-group {
  min-width: 0;
}

.history-month-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  padding-bottom: 0.65rem;
}

.history-month-heading h2 {
  margin: 0;
  color: var(--text-strong);
  font-family: var(--font-display);
  font-size: 1.1rem;
  font-weight: 760;
}

.history-month-heading span {
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 700;
}

.history-category-filter-button {
  border-radius: 0;
  border-bottom: 2px solid var(--border);
}

.history-category-filter-button[data-active="true"] {
  border-bottom-color: var(--history-filter-accent);
  background: transparent;
}
```

Keep the existing 44 px minimum height, focus ring and range control surface.

- [x] **Step 5: Run History tests and repository style checks**

Run:

```bash
npx vitest run src/pages/__tests__/HistoryPage.test.tsx
npm run lint
git diff --check
```

Expected: all PASS.

- [x] **Step 6: Commit the History deliverable**

```bash
git add src/pages/HistoryPage.tsx src/pages/__tests__/HistoryPage.test.tsx src/index.css
git commit -m "feat: group workout history by month"
```

---

### Task 2: Short plan lists reveal structure

**Risk closed:** One- and two-plan libraries currently hide the useful exercise structure behind a disclosure even though there is no density pressure.

**Files:**
- Modify: `src/pages/TemplatesPage.tsx:125-452`
- Test: `src/pages/__tests__/TemplatesPageActions.test.tsx`

**Interfaces:**
- Consumes: `.workbench-page` from Task 1 and the existing `planner-day-board` rendering.
- Produces: `shortPlanList` / `showStructure` behavior; longer lists retain `expandedTemplateId` and the current disclosure labels.

- [x] **Step 1: Add RED tests for short and long lists**

Append to `TemplatesPageActions.test.tsx`:

```tsx
it('shows structure immediately when the library has at most two plans', async () => {
  await renderPage()

  expect(within(cardFor('Plan A')).getByText('Squat')).toBeInTheDocument()
  expect(within(cardFor('Plan A')).queryByRole('button', { name: 'Struktura' }))
    .not.toBeInTheDocument()
})

it('keeps structure collapsible when the library has more than two plans', async () => {
  mocks.getTemplates.mockResolvedValue([
    ...templates,
    { ...templates[1], id: 'template-c', name: 'Plan C' },
  ])
  await renderPage()

  const card = cardFor('Plan A')
  expect(within(card).queryByText('Squat')).not.toBeInTheDocument()
  fireEvent.click(within(card).getByRole('button', { name: 'Struktura' }))
  expect(within(card).getByText('Squat')).toBeInTheDocument()
  expect(within(card).getByRole('button', { name: 'Zwiń' })).toHaveAttribute('aria-expanded', 'true')
})
```

- [x] **Step 2: Run the focused test and confirm RED**

```bash
npx vitest run src/pages/__tests__/TemplatesPageActions.test.tsx
```

Expected: the two-plan structure assertion fails because `Squat` is hidden.

- [x] **Step 3: Reuse the existing detail board for the short-list state**

Inside the loaded-list branch, define once:

```tsx
const shortPlanList = templates.length <= 2
```

Inside the template map replace the current `expanded` derivation with:

```tsx
const expanded = expandedTemplateId === template.id
const showStructure = shortPlanList || expanded
const structureId = `template-structure-${template.id}`
```

Render the disclosure only for longer lists:

```tsx
{!shortPlanList && (
  <button
    type="button"
    onClick={() => setExpandedTemplateId((current) => current === template.id ? null : template.id)}
    className="planner-secondary-action planner-structure-toggle"
    aria-expanded={expanded}
    aria-controls={structureId}
  >
    {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
    {expanded ? 'Zwiń' : 'Struktura'}
  </button>
)}
```

Change the existing board condition from `expanded` to `showStructure` and add `id={structureId}`. Keep all launch buttons, feedback ownership and exercise limits unchanged.

Wrap the visible page content, but not its dialogs, in the shared width class:

```tsx
<>
  <div className="workbench-page">
    <section className="planner-header">...</section>
    <AnimatePresence mode="popLayout">...</AnimatePresence>
  </div>
  {/* existing ConfirmDialog and TemplateLaunchConfirmDialog */}
</>
```

- [x] **Step 4: Run all plan-page tests**

```bash
npx vitest run src/pages/__tests__/TemplatesPageActions.test.tsx src/pages/__tests__/TemplatesPageDataState.test.tsx
git diff --check
```

Expected: all PASS; pending/error ownership tests remain unchanged.

- [x] **Step 5: Commit the Plans deliverable**

```bash
git add src/pages/TemplatesPage.tsx src/pages/__tests__/TemplatesPageActions.test.tsx
git commit -m "feat: reveal structure for short plan lists"
```

---

### Task 3: Bound the Exercise Library and lock cross-route geometry

**Risk closed:** The library and plan rows can still span the 92 rem application container, creating long eye travel on wide screens; the shared variant needs a browser regression across every 4B route.

**Files:**
- Modify: `src/pages/ExercisesPage.tsx:499-711`
- Test: `src/pages/__tests__/ExercisesPageDataState.test.tsx`
- Create: `tests/e2e/workbench-lists.spec.ts`

**Interfaces:**
- Consumes: `.workbench-page` from Task 1, current `expectAppReady`, and emulator helpers from `tests/e2e/support/workoutLifecycleEmulator.ts`.
- Produces: a deterministic browser contract for month grouping, wide-screen maximum width and horizontal overflow on `/history`, `/templates` and `/exercises`.

- [x] **Step 1: Add the failing library ownership test**

Append to `ExercisesPageDataState.test.tsx`:

```tsx
it('keeps the command surface and both catalogs inside one workbench width owner', async () => {
  mocks.getUserExercises.mockResolvedValueOnce([])
  render(<ExercisesPage />)

  const page = await screen.findByTestId('exercises-page')
  const workbench = page.closest('.workbench-page')

  expect(workbench).not.toBeNull()
  expect(workbench).toContainElement(screen.getByLabelText('Szukaj ćwiczenia'))
  expect(workbench).toContainElement(screen.getByRole('heading', { name: 'Katalog globalny' }))
})
```

- [x] **Step 2: Run the focused test and confirm RED**

```bash
npx vitest run src/pages/__tests__/ExercisesPageDataState.test.tsx
```

Expected: FAIL because the page has no `.workbench-page` ancestor.

- [x] **Step 3: Apply the existing workbench owner without changing CRUD**

Wrap only the header and library content:

```tsx
<>
  <div className="workbench-page">
    <section className="exercise-library-header">...</section>
    <div className="exercise-library-content" data-testid="exercises-page" ...>...</div>
  </div>
  {/* existing create/edit and confirmation dialogs */}
</>
```

Do not move form state, filters, navigation, destructive confirmation or service calls.

- [x] **Step 4: Add deterministic cross-route Playwright coverage**

Create `tests/e2e/workbench-lists.spec.ts`:

```ts
import { test, expect } from './fixtures'
import { expectAppReady, type AppReadyRoute } from './support/appReady'
import {
  cleanupWorkoutLifecycleState,
  closeWorkoutLifecycleEmulator,
  seedLifecycleWorkout,
} from './support/workoutLifecycleEmulator'

function monthLabel(timestamp: number): string {
  const label = new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' })
    .format(timestamp)
  return label.charAt(0).toLocaleUpperCase('pl-PL') + label.slice(1)
}

test.describe('History and list workbenches', () => {
  test.beforeEach(async () => cleanupWorkoutLifecycleState())
  test.afterEach(async () => cleanupWorkoutLifecycleState())
  test.afterAll(async () => closeWorkoutLifecycleEmulator())

  test('groups seeded history by month', async ({ page }) => {
    const now = new Date()
    const current = now.getTime() - 86_400_000
    const previous = new Date(now.getFullYear(), now.getMonth() - 1, 15, 12).getTime()

    await seedLifecycleWorkout({
      sessionId: 'phase-1-history-current',
      materialized: true,
      label: 'Phase 1 current month',
      startedAt: current,
    })
    await seedLifecycleWorkout({
      sessionId: 'phase-1-history-previous',
      materialized: true,
      label: 'Phase 1 previous month',
      startedAt: previous,
    })

    await page.goto('/history')
    await expectAppReady(page, '/history')
    await expect(page.getByRole('heading', { level: 2, name: new RegExp(monthLabel(current)) }))
      .toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: new RegExp(monthLabel(previous)) }))
      .toBeVisible()
  })

  test('keeps workbench routes bounded without horizontal overflow', async ({ page }, testInfo) => {
    await page.setViewportSize(testInfo.project.name === 'desktop'
      ? { width: 1440, height: 900 }
      : { width: 393, height: 852 })

    const routes: AppReadyRoute[] = ['/history', '/templates', '/exercises']
    for (const route of routes) {
      await page.goto(route)
      await expectAppReady(page, route)
      const workbench = page.locator('.workbench-page')
      await expect(workbench).toBeVisible()
      const geometry = await workbench.evaluate((element) => {
        const box = element.getBoundingClientRect()
        return {
          left: box.left,
          right: box.right,
          width: box.width,
          viewport: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
        }
      })
      expect(geometry.documentWidth).toBe(geometry.viewport)
      if (testInfo.project.name === 'desktop') {
        expect(geometry.width).toBeLessThanOrEqual(1040)
        expect(Math.abs(geometry.left - (geometry.viewport - geometry.right))).toBeLessThanOrEqual(2)
      }
    }
  })
})
```

- [x] **Step 5: Run unit and emulator-backed browser checks**

```bash
npx vitest run src/pages/__tests__/ExercisesPageDataState.test.tsx
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e npm exec --package=firebase-tools -- firebase emulators:exec --only auth,firestore --project demo-ironlog "npx playwright test tests/e2e/workbench-lists.spec.ts --project=desktop --project=mobile --retries=0"
```

Expected: all PASS, no unqualified console/page/request errors.

- [x] **Step 6: Commit the Library and geometry contract**

```bash
git add src/pages/ExercisesPage.tsx src/pages/__tests__/ExercisesPageDataState.test.tsx tests/e2e/workbench-lists.spec.ts
git commit -m "feat: constrain list workbenches"
```

---

### Task 4: Fresh runtime gate, review and integration receipt

**Risk closed:** DOM and computed-style checks cannot establish final hierarchy, density or mobile scanability.

**Files:**
- Modify: `output/plans/2026-08-20-ui-quality-phase-4b-history-lists-implementation.md`
- Modify: `output/plans/2026-08-14-ui-quality-roadmap.md`
- Create: `output/playwright/ui-quality-phase-4b-history-lists/history-mobile.png`
- Create: `output/playwright/ui-quality-phase-4b-history-lists/history-desktop.png`
- Create: `output/playwright/ui-quality-phase-4b-history-lists/templates-mobile.png`
- Create: `output/playwright/ui-quality-phase-4b-history-lists/exercises-desktop.png`

**Interfaces:**
- Consumes: completed Tasks 1-3 and their deterministic emulator data.
- Produces: final branch evidence and a bounded integration receipt; it does not close 4C or the parent roadmap.

- [x] **Step 1: Run the complete targeted suite**

```bash
npx vitest run src/pages/__tests__/HistoryPage.test.tsx src/pages/__tests__/TemplatesPageActions.test.tsx src/pages/__tests__/TemplatesPageDataState.test.tsx src/pages/__tests__/ExercisesPageDataState.test.tsx
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e npm exec --package=firebase-tools -- firebase emulators:exec --only auth,firestore --project demo-ironlog "npx playwright test tests/e2e/workbench-lists.spec.ts tests/e2e/templates.spec.ts tests/e2e/exercises.spec.ts --project=desktop --project=mobile --retries=0"
```

Expected: all PASS.

- [x] **Step 2: Run repository gates**

```bash
npm run lint
NODE_OPTIONS=--max-old-space-size=4096 npm run test:unit
npm run build
git diff --check
```

Expected: all PASS.

- [x] **Step 3: Observe final pixels serially in one isolated Playwright session**

Use the `playwright` skill because a deterministic clean emulator session is materially better than the signed-in user browser for seeded monthly history. Use one named session: `ui-quality-phase-4b`.

Observe `/history`, `/templates` and `/exercises` at 393×852 and 1440×900 after the last relevant change. Confirm:

- History month headings are visible, correctly ordered and do not repeat rows.
- History filters retain clear rest and selected states; keyboard focus reaches range, search and category controls.
- A one/two-plan list shows day exercise structure immediately; a three-plan list retains the disclosure.
- Search, filter, create/edit/delete and launch controls remain reachable and at least 44 px.
- Each desktop workbench is centered and no wider than 1040 px.
- No route has horizontal overflow, bottom-nav overlap, console error or warning.

Capture the four named screenshots after the final state. Then call `view_image` separately on each screenshot. Pixel evidence is `Observed` only if each completed `view_image` call returns image content; otherwise record `Pending` with the exact blocker.

- [x] **Step 4: Perform one focused whole-diff review**

Review `BASE..HEAD` for Critical/Important findings only. Specifically verify:

- grouping does not drop workouts or change filter/range semantics;
- short-list auto-expansion does not duplicate launch actions or break feedback ownership;
- wrappers do not capture dialogs or introduce overflow;
- no Firestore/API/data contract changed.

Fix qualified findings with a regression test, rerun affected gates and record the fix commit. Do not run a broad repository audit.

- [x] **Step 5: Update the canonical receipt**

Set this plan to `READY_FOR_INTEGRATION` and record:

- branch and verified commit range;
- target and repository gate counts;
- exact visual evidence receipt;
- review result and any qualified diagnostics;
- remaining lineage: 4C, etap 5, B-02, M-07, M-14.

Update the parent roadmap execution line to say 4B is verified and pending integration, with 4C next. Do not mark etap 4 or the whole roadmap complete.

- [x] **Step 6: Commit the evidence and receipt**

```bash
git add output/plans/2026-08-20-ui-quality-phase-4b-history-lists-implementation.md output/plans/2026-08-14-ui-quality-roadmap.md output/playwright/ui-quality-phase-4b-history-lists
git commit -m "docs: prepare history workbench integration"
```

No push without explicit authority.

## Execution receipt — 2026-08-20

- **Branch / verified range:** `ui-quality-phase-4b-history-lists`, `babfa9c..7a3c991`.
- **Targeted component gate:** 4 files, 30 tests passed.
- **Emulator browser gate:** 11/11 scenarios passed across desktop and mobile for the new workbench contract plus existing Templates and Exercises CRUD. After the visual-gate fix, Exercises passed 5/5 and the month/geometry contract passed 5/5 again.
- **Repository gate:** lint passed; 74 unit files / 601 tests passed; TypeScript + Vite production build passed; `git diff --check` passed. Commands used bundled Node 24.19.0 to match the repository runtime types.
- **Pixel evidence:** `Observed` in the isolated Playwright CLI session `ui-quality-phase-4b` at 393×852 and 1440×900. Each artifact was opened separately with `view_image`: `history-mobile.png`, `history-desktop.png`, `templates-mobile.png`, `exercises-desktop.png` in `output/playwright/ui-quality-phase-4b-history-lists/`.
- **Runtime facts:** both seeded month groups were visible once and in descending order; two plans exposed their exercises immediately; three plans retained the `Struktura` disclosure; desktop workbenches measured 1040 px and were centered; mobile document width equaled the 393 px viewport; the last plan retained about 70 px clearance above the fixed bottom navigation; session console reported 0 warnings and 0 errors.
- **Focused review:** no remaining Critical or Important findings. The review caught and fixed a 22 px focusable exercise-search target (`02ca963`) and stabilized the E2E current-month fixture at month boundaries (`7a3c991`). Grouping still consumes Firestore's descending `startedAt` order, dialogs stay outside workbench wrappers, launch/CRUD ownership is unchanged, and no Firestore/API/data contract changed.
- **Remaining lineage:** 4C shell/404, etap 5, B-02, M-07 and M-14 remain open. Pagination stays deferred pending measured need.
- **Integration:** fast-forwarded locally into `main` at `d434558`; merged-result lint, 74 files / 601 unit tests, build and diff check passed. The feature worktree and local branch were removed. Nothing was pushed.

## Definition of done

- History is grouped into ordered calendar-month sections after every current range/search/category filter.
- History loading, truncation, retry, range-empty, filter-empty and fully-empty states remain truthful.
- One or two plans reveal their existing day/exercise structure without a required click; longer lists retain disclosure.
- History, Plans and Exercises share one 65 rem workbench width owner on wide screens and remain overflow-free on mobile.
- Existing launch, CRUD, navigation, focus, error and confirmation behavior is preserved.
- Targeted tests, full unit, lint, build and fresh emulator-backed visual observation pass.
- Only 4B is closed; 4C, etap 5 and unresolved product decisions remain open.

## Self-review

- **Spec coverage:** monthly History grouping, resting filter affordance, short-plan structure, wide list line length, mobile/desktop runtime and deferred pagination each map to a task or explicit gate.
- **Scope control:** Profile and 404 stay outside 4B; no pagination, taxonomy work, data migration, component extraction or dependency is included.
- **Type consistency:** Tasks 2 and 3 consume the exact `.workbench-page` class produced in Task 1; `showStructure` is local to Templates and does not alter service interfaces.
- **Placeholder scan:** no deferred implementation language or unspecified error handling remains in executable steps.
