# UI Quality Phase 4C — Protected Shell and 404 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** DONE

**Goal:** Keep an authenticated user inside the IronLog application chrome on an unknown route, with one main landmark, a usable recovery action and no mobile overflow.

**Architecture:** Move the wildcard route under the existing authenticated `AppLayout` branch instead of building a second shell. Convert `NotFoundPage` from a standalone `<main class="page-shell">` into content owned by the shell's existing `<main>`, then constrain its vertical centering with local CSS. Anonymous unknown routes continue through `PrivateRouteOutlet` to `/login`.

**Tech Stack:** React 19, React Router, TypeScript, CSS, Vitest + Testing Library, Playwright, Firebase Auth/Firestore emulators.

**Spec:** `output/plans/2026-08-14-ui-quality-roadmap.md` — Etap 4 / slice 4C shell/404.

## Global constraints

- Preserve the existing `AppLayout`, `TopNav`, `BottomNav`, focus transfer and passive active-session sync.
- Keep exactly one `<main>` landmark on the unknown route.
- Do not add a second shell, route loader, dependency, Firestore call or API contract.
- Authenticated unknown routes stay at their requested URL; anonymous unknown routes go to `/login`.
- Recovery remains a normal router link to `/dashboard` and must be keyboard reachable.
- Mobile and desktop must have no horizontal overflow, no bottom-nav collision and no console warning/error.
- Visual completion requires fresh observation at 393×852 and 1440×900 after the final relevant change.

## Scope lineage

`roadmapa UI quality → etap 4 → slice 4C shell/404 → remaining: etap 5, B-02, M-07, M-14`.

---

### Task 1: Route authenticated 404 content through the existing shell

**Risk closed:** The top-level wildcard currently bypasses `PrivateRouteOutlet`, `ProfileRouteOutlet` and `AppLayout`, so an authenticated user loses navigation and application context on an unknown URL.

**Files:**
- Modify: `src/router/index.tsx:147-173`
- Modify: `src/pages/NotFoundPage.tsx`
- Test: `src/pages/__tests__/NotFoundPage.test.tsx`
- Test: `tests/e2e/protected-shell.spec.ts`

**Interfaces:**
- Consumes: `AppLayout` as the sole authenticated chrome owner and `PrivateRouteOutlet` as the anonymous redirect boundary.
- Produces: a nested `path="*"` route whose content contains no second `<main>`.

- [x] **Step 1: Add the failing component semantic assertion**

Extend `NotFoundPage.test.tsx`:

```tsx
it('leaves main-landmark ownership to the authenticated app shell', () => {
  const { container } = render(
    <MemoryRouter>
      <NotFoundPage />
    </MemoryRouter>,
  )

  expect(container.querySelector('main')).toBeNull()
  expect(screen.getByRole('heading', { name: 'Ta strona nie istnieje' }))
    .toHaveAttribute('id', 'not-found-title')
})
```

- [x] **Step 2: Strengthen the failing protected-shell browser contract**

Replace the existing unknown-route test in `protected-shell.spec.ts` with:

```ts
test('keeps an authenticated unknown route inside the app shell', async ({ page }, testInfo) => {
  await page.goto('/definitely-missing')

  await expect(page).toHaveURL('/definitely-missing')
  await expect(page.getByRole('heading', { name: 'Ta strona nie istnieje' })).toBeVisible()
  await expect(page.getByRole('main')).toHaveCount(1)
  await expect(page.getByRole('main')).toBeFocused()

  const navigationName = testInfo.project.name === 'mobile'
    ? 'Nawigacja dolna'
    : 'Nawigacja główna'
  await expect(page.getByRole('navigation', { name: navigationName })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Wróć do panelu' })).toBeVisible()
})
```

Add the anonymous boundary test:

```ts
test('routes an anonymous unknown URL through the private boundary', async ({ observedContextFactory }) => {
  const context = await observedContextFactory.newContext({
    storageState: { cookies: [], origins: [] },
  })
  const page = await context.newPage()

  await page.goto('/definitely-missing')
  await expect(page).toHaveURL('/login', { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'Zaloguj się' })).toBeVisible()
})
```

- [x] **Step 3: Run the focused tests and confirm RED**

```bash
npx vitest run src/pages/__tests__/NotFoundPage.test.tsx
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e npm exec --package=firebase-tools -- firebase emulators:exec --only auth,firestore --project demo-ironlog "npx playwright test tests/e2e/protected-shell.spec.ts --project=desktop --project=mobile --retries=0"
```

Expected: the component test fails because `NotFoundPage` owns a `<main>`; the authenticated browser test fails because the unknown route has no named app navigation.

- [x] **Step 4: Move the wildcard into the authenticated layout**

In `src/router/index.tsx`, add the wildcard as the final child of `AppLayout`:

```tsx
<Route element={<AppLayout />}>
  {/* existing authenticated application routes */}
  <Route path="*" element={<NotFoundPage />} />
</Route>
```

Remove the root-level wildcard after `PrivateRouteOutlet`. Do not add another redirect or auth check.

- [x] **Step 5: Give the shell semantic ownership of the page**

Replace the root of `NotFoundPage` with:

```tsx
<section className="not-found-page" aria-labelledby="not-found-title">
  <div className="not-found-content">
    <p className="eyebrow">Błąd 404</p>
    <h1 id="not-found-title">Ta strona nie istnieje</h1>
    <p>Adres, który próbujesz otworzyć, nie istnieje albo został przeniesiony.</p>
    <Link to="/dashboard" className="planner-primary-action">Wróć do panelu</Link>
  </div>
</section>
```

- [x] **Step 6: Run focused unit and browser tests**

Run the commands from Step 3 again.

Expected: component assertions pass; authenticated desktop/mobile unknown routes expose exactly one focused main and the correct navigation; anonymous unknown routes redirect to login.

- [x] **Step 7: Commit the shell contract**

```bash
git add src/router/index.tsx src/pages/NotFoundPage.tsx src/pages/__tests__/NotFoundPage.test.tsx tests/e2e/protected-shell.spec.ts
git commit -m "fix: keep authenticated 404 inside app shell"
```

---

### Task 2: Center the shell-owned 404 and close the slice

**Risk closed:** Reusing the old standalone `100dvh` height inside `AppLayout` would create avoidable vertical travel and could leave recovery content behind the fixed mobile navigation.

**Files:**
- Modify: `src/index.css:271-296`
- Modify: `tests/e2e/protected-shell.spec.ts`
- Modify: `output/plans/2026-08-20-ui-quality-phase-4c-shell-404-implementation.md`
- Modify: `output/plans/2026-08-14-ui-quality-roadmap.md`
- Create: `output/playwright/ui-quality-phase-4c-shell-404/not-found-mobile.png`
- Create: `output/playwright/ui-quality-phase-4c-shell-404/not-found-desktop.png`

**Interfaces:**
- Consumes: the shell-owned `.not-found-page` from Task 1.
- Produces: a viewport-bounded 404 and the final Etap 4 receipt.

- [x] **Step 1: Add geometry and recovery-action assertions**

After the semantic assertions in the authenticated E2E test, add:

```ts
const geometry = await page.locator('.not-found-page').evaluate((element) => {
  const pageBox = element.getBoundingClientRect()
  const actionBox = element.querySelector('a')?.getBoundingClientRect()
  const bottomNav = document.querySelector('[aria-label="Nawigacja dolna"]')
    ?.getBoundingClientRect()
  return {
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    pageTop: pageBox.top,
    pageBottom: pageBox.bottom,
    actionHeight: actionBox?.height ?? 0,
    mobileClearance: bottomNav && actionBox ? bottomNav.top - actionBox.bottom : null,
  }
})

expect(geometry.documentWidth).toBe(geometry.viewportWidth)
expect(geometry.actionHeight).toBeGreaterThanOrEqual(44)
if (testInfo.project.name === 'mobile') {
  expect(geometry.mobileClearance).not.toBeNull()
  expect(geometry.mobileClearance as number).toBeGreaterThanOrEqual(16)
}
```

- [x] **Step 2: Constrain the nested page height locally**

Update the existing `.not-found-page` rule:

```css
.page-shell:has(.not-found-page) {
  min-height: calc(100dvh - var(--top-nav-height));
}

.not-found-page {
  display: grid;
  min-height: calc(100dvh - 14rem - env(safe-area-inset-bottom, 0px));
  place-items: center;
  padding: 2rem 0;
}

@media (min-width: 1024px) {
  .not-found-page {
    min-height: calc(100dvh - 7rem);
  }
}
```

Keep `.not-found-content`, typography and the existing primary action style unchanged.

- [x] **Step 3: Run the focused contract and repository gates**

```bash
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e npm exec --package=firebase-tools -- firebase emulators:exec --only auth,firestore --project demo-ironlog "npx playwright test tests/e2e/protected-shell.spec.ts --project=desktop --project=mobile --retries=0"
npm run lint
NODE_OPTIONS=--max-old-space-size=4096 npm run test:unit
npm run build
git diff --check
```

Expected: all pass.

- [x] **Step 4: Observe final pixels in one isolated session**

Use the `playwright` skill and one named session, `ui-quality-phase-4c`. Observe `/definitely-missing` at 393×852 and 1440×900. Confirm one main landmark, shell navigation, centered hierarchy, 44 px recovery target, keyboard focus, zero overflow, no bottom-nav collision and zero console warnings/errors.

Capture and separately inspect with `view_image`:

- `output/playwright/ui-quality-phase-4c-shell-404/not-found-mobile.png`
- `output/playwright/ui-quality-phase-4c-shell-404/not-found-desktop.png`

- [x] **Step 5: Review the whole slice**

Review `BASE..HEAD` for Critical/Important findings only. Verify route ranking, anonymous redirect behavior, one-main semantics, shell focus transfer and absence of Firestore/API changes. Fix qualified findings with a regression test and rerun affected gates.

- [x] **Step 6: Write the receipt and commit evidence**

Set this plan to `READY_FOR_INTEGRATION`, record the verified commit range, exact gate counts, pixel evidence and review result. Update the parent roadmap: 4C verified pending integration, Etap 4 ready to close, Etap 5 next; B-02, M-07 and M-14 stay open.

```bash
git add src/index.css tests/e2e/protected-shell.spec.ts output/plans/2026-08-20-ui-quality-phase-4c-shell-404-implementation.md output/plans/2026-08-14-ui-quality-roadmap.md output/playwright/ui-quality-phase-4c-shell-404
git commit -m "docs: prepare protected 404 integration"
```

No push without explicit authority.

## Execution receipt — 2026-08-20

- **Branch / verified range:** `ui-quality-phase-4c-shell-404`, `12ff969..15bedee`.
- **TDD evidence:** the component test failed on the nested `<main>`; authenticated desktop/mobile browser checks failed on missing shell focus and anonymous desktop/mobile checks failed on the missing `/login` redirect. The height contract then failed with 826/935 px documents in 720/727 px viewports and remained 64 px too tall until the parent shell accounted for `--top-nav-height`.
- **Focused contract:** `protected-shell.spec.ts` passed 13 scenarios with 2 intentional mobile skips across desktop and mobile; the focused NotFound component suite passed 2/2.
- **Repository gate:** lint passed; 74 unit files / 602 tests passed; TypeScript + Vite production build passed; `git diff --check` passed. Commands used the bundled Node 24 runtime.
- **Visual evidence:** `Observed` in the isolated Playwright CLI session `ui-quality-phase-4c`. `view_image` separately read `output/playwright/ui-quality-phase-4c-shell-404/not-found-mobile.png` and `not-found-desktop.png`, returning the final mobile and desktop 404 inside the application chrome with centered hierarchy and an unobstructed recovery action.
- **Runtime facts:** at 393×852 and 1440×900 the document exactly matched the viewport, exposed one focused `<main>` and a 44 px recovery link; mobile clearance above the bottom navigation was about 296 px. The session console reported 0 warnings and 0 errors.
- **Focused review:** no remaining Critical or Important findings. Route ranking keeps authenticated unknown URLs in place, sends anonymous unknown URLs to `/login`, preserves shell focus transfer and introduces no Firestore, API or data-contract change.
- **Remaining lineage:** Etap 4 is closed. Etap 5 plus B-02, M-07 and M-14 remain open.
- **Integration:** fast-forwarded locally into `main` at `139c0f8`; merged-result lint, 74 files / 602 unit tests, build and diff check passed. The feature worktree and local branch were removed. Nothing was pushed.

## Definition of done

- Authenticated unknown URLs render inside the existing top/bottom navigation shell and remain at the requested URL.
- Anonymous unknown URLs redirect to `/login`.
- The route contains exactly one focused `<main>` landmark.
- The 404 recovery link is keyboard reachable, at least 44 px high and clears the mobile navigation.
- Desktop and mobile have no horizontal overflow, page warning or console error.
- Focused E2E, full unit, lint, build and separately viewed screenshots pass.
- Only 4C and Etap 4 are closed; Etap 5 and unresolved product decisions remain open.

## Self-review

- **Spec coverage:** application context, one-main semantics, anonymous boundary, recovery action, keyboard focus, mobile clearance and both required breakpoints are assigned to explicit tests or observation.
- **Scope control:** Profile polish, bottom-nav auto-hide tuning, global typography, semantic color work and product decisions stay in Etap 5 or their named decision gates.
- **Type consistency:** the plan reuses existing `AppLayout`, `NotFoundPage`, `observedContextFactory` and fixture contracts; no new public interface is introduced.
- **Placeholder scan:** no deferred implementation step or unspecified error path remains.
