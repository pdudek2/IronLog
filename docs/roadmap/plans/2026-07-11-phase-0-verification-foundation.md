# Phase 0 Verification Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make IronLog's critical browser checks fail on unfinished screens and browser/runtime failures, clean shared-account mutations reliably, and provide one deterministic Auth+Firestore-emulator gate for later roadmap phases.

**Architecture:** Keep the current live Firebase Playwright suite, but route every spec through one shared fixture that records browser diagnostics and runs registered cleanup actions. Replace generic shell waits in product tests with route-specific readiness contracts. Add a separate `test:e2e:isolated` command that runs a bounded desktop foundation slice (`critical`, `profile`, `exercises`, and `templates`) against fresh Auth and Firestore emulators; do not migrate the complete suite or seed demo history.

**Tech Stack:** React 19, TypeScript 5.9, Vite 8, Playwright 1.59, Vitest 4, Firebase Web SDK 12, Firebase CLI/emulators, npm.

## Global Constraints

- Implement only `TEST-01`, `TEST-03`, `TEST-05`, and `TEST-06` from `docs/roadmap/ROADMAP.md`.
- Do not change product behavior, Firestore document schemas, Firestore rules, workout contracts, templates, or the demo account.
- The default application path must continue to use configured Firebase services; connect to emulators only when `VITE_FIREBASE_USE_EMULATORS === 'true'`.
- Keep the existing live `npm run test:e2e` command and `.env.test` contract available.
- The isolated gate must not read `.env.local` or `.env.test`, require secrets, contact production Firebase, or mutate Vercel configuration.
- Use deterministic process-local emulator credentials: `e2e@ironlog.local` / `ironlog-e2e`.
- The isolated gate covers `critical.spec.ts`, `profile.spec.ts`, `exercises.spec.ts`, and `templates.spec.ts` on the desktop project only. Full-suite emulator migration is outside Phase 0.
- Record every `pageerror`, error-level console entry, and `requestfailed` event. Only Chromium document navigation cancelled with `net::ERR_ABORTED` is non-blocking; it must still be attached to the test report.
- Cleanup actions run in reverse registration order, continue after one cleanup failure, and fail the test with the complete cleanup failure list.
- A resource created in one test must not be a prerequisite for another test. Existing serial CRUD flows become one transactional lifecycle test or independent tests with distinct resource names.
- `.page-shell` may remain only in the dedicated shell-count assertion and the visual-audit capture harness; product readiness must use route-specific controls or terminal states.
- Do not add a new CI service, Firebase project, persistent fixture database, visual-regression system, or test framework.
- Preserve `exerciseSource: 'global' | 'user'` and all existing mobile/desktop project behavior.
- Do not push, deploy, mutate production data, or remove `.env.test` during implementation.

---

## Approved Design Decision

The canonical roadmap is the approved design source for this phase. Three `TEST-06` approaches were evaluated:

1. **Focused Auth+Firestore emulator gate — selected.** It removes production quota from the Phase 0 foundation slice, uses existing Firebase CLI infrastructure, creates its account/profile through Auth emulator plus the real login/onboarding UI, and requires no history seed.
2. **Separate Firebase test project — rejected.** It adds credentials, external project administration, and another quota-dependent service without making the gate hermetic.
3. **Whole-suite emulator migration — rejected for Phase 0.** It would require broad seed coverage for history, progress, templates, custom exercises, mobile flows, and server materialization. The roadmap explicitly permits a smaller isolation boundary.

The live suite remains useful for integration confidence. The new isolated gate becomes the deterministic prerequisite for Phase R and later implementation phases.

---

## File Map

**Create:**

- `tests/e2e/fixtures.ts` — shared Playwright test export, automatic browser diagnostics, and later cleanup registry.
- `tests/e2e/support/browserDiagnostics.ts` — pure diagnostic classification and formatting.
- `tests/e2e/support/browserDiagnostics.test.ts` — Vitest contract for blocking/non-blocking diagnostics.
- `tests/e2e/support/appReady.ts` — route-specific terminal readiness assertions.
- `tests/e2e/support/cleanupRegistry.ts` — cleanup action ordering and failure aggregation.
- `tests/e2e/support/cleanupRegistry.test.ts` — Vitest contract for cleanup behavior.
- `tests/e2e/support/accountCleanup.ts` — reusable UI cleanup for profile, template, exercise, and active session mutations.
- `tests/e2e/env/.gitkeep` — empty Vite env directory for the secret-free emulator web server.

**Modify:**

- `vitest.config.ts`
- `playwright.config.ts`
- `vite.config.ts`
- `firebase.json`
- `package.json`
- `src/lib/firebase.ts`
- `.env.test.example`
- `README.md`
- `docs/roadmap/ROADMAP.md`
- every `tests/e2e/*.spec.ts` import so all specs consume `./fixtures`
- `tests/e2e/global.setup.ts`
- product specs currently using `.page-shell` as readiness
- mutation specs: `profile.spec.ts`, `exercises.spec.ts`, `templates.spec.ts`, `template-launch.spec.ts`, `critical.spec.ts`, `workout-guard.spec.ts`, `workout-mobile.spec.ts`, and `workout-persistence.spec.ts`

**Preserve:**

- `tests/e2e/.auth/user.json` remains generated/ignored.
- `tests/e2e/audit-screenshots.spec.ts` remains a manual capture harness, not a visual regression gate.
- `tests/rules/firestore.rules.test.ts` and the `test:rules` command remain unchanged.

---

## Roadmap Coverage

| Roadmap item | Implemented by |
|---|---|
| `TEST-05` shared page/console/request diagnostics | Task 1 |
| `TEST-01` meaningful screen readiness | Task 2 |
| `TEST-03` interruption-safe cleanup | Task 3 |
| `TEST-06` production-quota-independent critical gate | Task 4 |
| Phase 0 automated gates and `DONE` transition | Task 5 |

---

### Task 1: Add one automatic browser-diagnostics fixture

**Files:**

- Create: `tests/e2e/support/browserDiagnostics.ts`
- Create: `tests/e2e/support/browserDiagnostics.test.ts`
- Create: `tests/e2e/fixtures.ts`
- Modify: `vitest.config.ts`
- Modify: all `tests/e2e/*.spec.ts` and `tests/e2e/global.setup.ts` imports
- Modify: `tests/e2e/chat.spec.ts`, `critical.spec.ts`, `exercises.spec.ts`, `profile.spec.ts`, `smoke.spec.ts`, and `workout-persistence.spec.ts` to remove local console collectors

**Interfaces:**

- Produces `BrowserDiagnostic`, `isBlockingConsole`, and `isBlockingRequestFailure` from `support/browserDiagnostics.ts`.
- Produces the canonical `test` and `expect` exports from `tests/e2e/fixtures.ts`.
- Every later E2E task imports Playwright values and types from `./fixtures`.

- [ ] **Step 1: Extend the node Vitest project for pure E2E-support tests**

Add this final include entry in the node project's `include` array in `vitest.config.ts`:

```ts
'tests/e2e/support/**/*.test.ts',
```

- [ ] **Step 2: Write the failing diagnostics classifier tests**

Create `tests/e2e/support/browserDiagnostics.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isBlockingConsole, isBlockingRequestFailure } from './browserDiagnostics'

describe('browser diagnostics classification', () => {
  it('blocks application console errors but ignores Vite and extension noise', () => {
    expect(isBlockingConsole('error', '[DashboardPage] load failed')).toBe(true)
    expect(isBlockingConsole('warning', 'layout warning')).toBe(false)
    expect(isBlockingConsole('error', '[vite] reconnecting')).toBe(false)
    expect(isBlockingConsole('error', 'chrome-extension://example failed')).toBe(false)
  })

  it('blocks failed requests except cancelled document navigation', () => {
    expect(isBlockingRequestFailure('fetch', 'net::ERR_FAILED')).toBe(true)
    expect(isBlockingRequestFailure('document', 'net::ERR_ABORTED')).toBe(false)
    expect(isBlockingRequestFailure('script', 'net::ERR_ABORTED')).toBe(true)
  })
})
```

- [ ] **Step 3: Run the RED test**

Run:

```bash
npx vitest run tests/e2e/support/browserDiagnostics.test.ts
```

Expected: FAIL because `./browserDiagnostics` does not exist.

- [ ] **Step 4: Implement pure diagnostic classification**

Create `tests/e2e/support/browserDiagnostics.ts`:

```ts
export type BrowserDiagnosticKind = 'pageerror' | 'console' | 'requestfailed'

export interface BrowserDiagnostic {
  kind: BrowserDiagnosticKind
  message: string
  url?: string
  method?: string
  blocking: boolean
}

const NON_BLOCKING_CONSOLE_PATTERNS = [/\[vite\]/i, /extension/i]

export function isBlockingConsole(type: string, text: string): boolean {
  return type === 'error'
    && !NON_BLOCKING_CONSOLE_PATTERNS.some((pattern) => pattern.test(text))
}

export function isBlockingRequestFailure(resourceType: string, errorText: string): boolean {
  return !(resourceType === 'document' && errorText === 'net::ERR_ABORTED')
}

export function formatBlockingDiagnostics(entries: BrowserDiagnostic[]): string {
  return entries
    .filter((entry) => entry.blocking)
    .map((entry) => {
      const request = entry.method && entry.url ? ` ${entry.method} ${entry.url}` : ''
      return `[${entry.kind}]${request} ${entry.message}`
    })
    .join('\n')
}
```

- [ ] **Step 5: Run the classifier GREEN test**

Run:

```bash
npx vitest run tests/e2e/support/browserDiagnostics.test.ts
```

Expected: 1 file and 2 tests pass.

- [ ] **Step 6: Add the automatic fixture**

Create `tests/e2e/fixtures.ts`:

```ts
import {
  test as base,
  expect,
  type ConsoleMessage,
  type Request,
} from '@playwright/test'
import {
  formatBlockingDiagnostics,
  isBlockingConsole,
  isBlockingRequestFailure,
  type BrowserDiagnostic,
} from './support/browserDiagnostics'

interface DiagnosticFixture {
  browserDiagnostics: BrowserDiagnostic[]
}

export const test = base.extend<DiagnosticFixture>({
  browserDiagnostics: [async ({ page }, use, testInfo) => {
    const entries: BrowserDiagnostic[] = []

    const onPageError = (error: Error) => {
      entries.push({ kind: 'pageerror', message: error.message, blocking: true })
    }
    const onConsole = (message: ConsoleMessage) => {
      if (message.type() !== 'error') return
      const text = message.text()
      entries.push({
        kind: 'console',
        message: text,
        blocking: isBlockingConsole(message.type(), text),
      })
    }
    const onRequestFailed = (request: Request) => {
      const errorText = request.failure()?.errorText ?? 'unknown request failure'
      entries.push({
        kind: 'requestfailed',
        message: errorText,
        url: request.url(),
        method: request.method(),
        blocking: isBlockingRequestFailure(request.resourceType(), errorText),
      })
    }

    page.on('pageerror', onPageError)
    page.on('console', onConsole)
    page.on('requestfailed', onRequestFailed)

    await use(entries)

    page.off('pageerror', onPageError)
    page.off('console', onConsole)
    page.off('requestfailed', onRequestFailed)

    if (entries.length > 0) {
      await testInfo.attach('browser-diagnostics.json', {
        body: Buffer.from(JSON.stringify(entries, null, 2)),
        contentType: 'application/json',
      })
    }

    const blocking = entries.filter((entry) => entry.blocking)
    expect.soft(blocking, formatBlockingDiagnostics(blocking)).toEqual([])
  }, { auto: true }],
})

export { expect }
export type {
  APIRequestContext,
  Browser,
  ConsoleMessage,
  Locator,
  Page,
  Request,
} from '@playwright/test'
```

- [ ] **Step 7: Route every E2E file through the fixture**

In every `tests/e2e/*.spec.ts` and `tests/e2e/global.setup.ts`, replace value/type imports from `@playwright/test` with the equivalent import from `./fixtures`. Example:

```diff
-import { test, expect, type Page } from '@playwright/test'
+import { test, expect, type Page } from './fixtures'
```

For `global.setup.ts`, use:

```diff
-import { test as setup, expect } from '@playwright/test'
+import { test as setup, expect } from './fixtures'
```

Remove file-local console collectors and their final array assertions from `chat.spec.ts`, `critical.spec.ts`, `exercises.spec.ts`, `profile.spec.ts`, `smoke.spec.ts`, and `workout-persistence.spec.ts`. Do not remove assertions unrelated to console diagnostics.

- [ ] **Step 8: Verify shared diagnostics**

Run:

```bash
npm run lint
npx vitest run tests/e2e/support/browserDiagnostics.test.ts
npx playwright test tests/e2e/analytics-removal.spec.ts --project=desktop --no-deps
```

Expected: lint passes, 2 classifier tests pass, and the public browser test passes with no blocking diagnostics.

- [ ] **Step 9: Commit diagnostics**

```bash
git add vitest.config.ts tests/e2e
git commit -m "test: centralize browser diagnostics"
```

---

### Task 2: Replace generic shell waits with route readiness contracts

**Files:**

- Create: `tests/e2e/support/appReady.ts`
- Modify: `tests/e2e/critical.spec.ts`
- Modify: `tests/e2e/smoke.spec.ts`
- Modify: `tests/e2e/dashboard.spec.ts`
- Modify: `tests/e2e/chat.spec.ts`
- Modify: `tests/e2e/profile.spec.ts`
- Modify: `tests/e2e/exercises.spec.ts`
- Modify: `tests/e2e/templates.spec.ts`
- Modify: `tests/e2e/template-launch.spec.ts`
- Modify: `tests/e2e/workout-guard.spec.ts`
- Modify: `tests/e2e/workout-mobile.spec.ts`
- Modify: `tests/e2e/workout-persistence.spec.ts`

**Interfaces:**

- Produces `AppReadyRoute` and `expectAppReady(page, route, timeout?)`.
- A route is ready only when its key function is visible and its known full-page error is absent.

- [ ] **Step 1: Write the route readiness helper**

Create `tests/e2e/support/appReady.ts`:

```ts
import { expect, type Locator, type Page } from '../fixtures'

export type AppReadyRoute =
  | '/dashboard'
  | '/history'
  | '/progress'
  | '/templates'
  | '/templates/new'
  | '/exercises'
  | '/chat'
  | '/profile'
  | '/workout/new'

function workoutTerminalState(page: Page): Locator {
  return page.getByRole('button', { name: 'Odrzuć i zacznij od nowa' })
    .or(page.getByRole('button', { name: 'Anuluj', exact: true }).first())
    .or(page.getByRole('button', { name: 'Rozpocznij nową sesję' }))
    .or(page.getByRole('button', { name: 'Dodaj ćwiczenie', exact: true }).first())
    .first()
}

export async function expectAppReady(
  page: Page,
  route: AppReadyRoute,
  timeout = 15_000,
): Promise<void> {
  await expect(page).toHaveURL(route, { timeout })

  switch (route) {
    case '/dashboard':
      await expect(page.getByRole('button', { name: /Rozpocznij trening|Wróć do sesji/ })).toBeVisible({ timeout })
      await expect(page.getByText('Nie udało się wczytać dashboardu', { exact: true })).toHaveCount(0)
      return
    case '/history':
      await expect(page.getByRole('heading', { name: 'Historia' })).toBeVisible({ timeout })
      await expect(page.getByLabel('Szukaj w historii treningów')).toBeVisible({ timeout })
      await expect(page.getByText('Nie udało się pobrać historii', { exact: true })).toHaveCount(0)
      return
    case '/progress':
      await expect(page.getByTestId('progress-page')).toHaveAttribute('aria-busy', 'false', { timeout })
      await expect(page.getByLabel('Zakres danych')).toBeVisible({ timeout })
      await expect(page.getByText('Nie udało się pobrać danych', { exact: true })).toHaveCount(0)
      return
    case '/templates':
      await expect(page.getByRole('heading', { name: 'Plany.' })).toBeVisible({ timeout })
      await expect(page.getByRole('button', { name: 'Nowy plan' })).toBeVisible({ timeout })
      await expect(page.getByText('Nie udało się pobrać szablonów', { exact: true })).toHaveCount(0)
      return
    case '/templates/new':
      await expect(page.getByRole('heading', { name: 'Nowy plan.' })).toBeVisible({ timeout })
      await expect(page.getByPlaceholder('np. Upper / Lower 4 dni')).toBeVisible({ timeout })
      return
    case '/exercises':
      await expect(page.getByRole('heading', { name: 'Biblioteka.' })).toBeVisible({ timeout })
      await expect(page.getByLabel('Szukaj ćwiczenia')).toBeVisible({ timeout })
      await expect(page.locator('.exercise-library-content')).toBeVisible({ timeout })
      return
    case '/chat':
      await expect(page.getByRole('heading', { name: 'Coach.' })).toBeVisible({ timeout })
      await expect(page.getByLabel('Status AI Coacha')).toBeVisible({ timeout })
      return
    case '/profile':
      await expect(page.getByRole('heading', { name: 'Twój profil.' })).toBeVisible({ timeout })
      await expect(page.getByPlaceholder('np. Jan')).toBeVisible({ timeout })
      await expect(page.getByText('Nie udało się wczytać profilu', { exact: true })).toHaveCount(0)
      return
    case '/workout/new':
      await expect(workoutTerminalState(page)).toBeVisible({ timeout: Math.max(timeout, 25_000) })
  }
}
```

- [ ] **Step 2: Make the critical suite deterministic on empty data**

Rewrite `tests/e2e/critical.spec.ts` so it contains these six contracts and no optional data skips:

```ts
import { test, expect } from './fixtures'
import { expectAppReady } from './support/appReady'

test.describe('Critical application contract', () => {
  test('workout route reaches a terminal ready state', async ({ page }) => {
    await page.goto('/workout/new')
    await expectAppReady(page, '/workout/new', 25_000)
  })

  test('history route reaches a loaded empty-or-data state', async ({ page }) => {
    await page.goto('/history')
    await expectAppReady(page, '/history')
  })

  test('template editor opens from the loaded templates screen', async ({ page }) => {
    await page.goto('/templates')
    await expectAppReady(page, '/templates')
    await page.getByRole('button', { name: 'Nowy plan' }).click()
    await expectAppReady(page, '/templates/new')
  })

  test('progress reaches an interactive loaded state', async ({ page }) => {
    await page.goto('/progress')
    await expectAppReady(page, '/progress', 20_000)
    await expect(page.getByRole('button', { name: '30 dni' })).toBeVisible()
  })

  test('dashboard exposes its primary workout action', async ({ page }) => {
    await page.goto('/dashboard')
    await expectAppReady(page, '/dashboard')
  })

  test('unauthenticated user is redirected to login', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await context.newPage()
    try {
      await page.goto('/dashboard')
      await expect(page).toHaveURL('/login', { timeout: 10_000 })
      await expect(page.getByRole('button', { name: 'Zaloguj się' })).toBeVisible()
    } finally {
      await context.close()
    }
  })
})
```

- [ ] **Step 3: Replace product readiness waits**

In the product specs listed in this task, replace sequences shaped like:

```ts
await page.goto('/profile')
await expect(page.locator('.page-shell')).toBeVisible({ timeout: 10_000 })
```

with:

```ts
await page.goto('/profile')
await expectAppReady(page, '/profile')
```

Use the matching route literal for dashboard, history, progress, templates, template editor, exercises, chat, profile, and workout. Keep the one dedicated `.page-shell` count test in `smoke.spec.ts`; it tests shell structure rather than page readiness. Keep the manual capture waits in `audit-screenshots.spec.ts` for Phase 4/LATER visual work.

- [ ] **Step 4: Prove generic readiness is gone from product specs**

Run:

```bash
rg -n "page\.locator\(['\"]\.page-shell['\"]\)" tests/e2e \
  --glob '!audit-screenshots.spec.ts' \
  --glob '!smoke.spec.ts'
```

Expected: exit 1, no matches.

Run:

```bash
npm run lint
npx playwright test tests/e2e/critical.spec.ts tests/e2e/protected-shell.spec.ts --project=desktop
```

Expected on an available live backend: critical readiness and protected shell tests pass. If the known production quota blocks the run, preserve the exact output; Task 4 supplies the mandatory hermetic gate.

- [ ] **Step 5: Commit readiness contracts**

```bash
git add tests/e2e/support/appReady.ts tests/e2e
git commit -m "test: assert application screen readiness"
```

---

### Task 3: Make shared-account mutations interruption-safe

**Files:**

- Create: `tests/e2e/support/cleanupRegistry.ts`
- Create: `tests/e2e/support/cleanupRegistry.test.ts`
- Create: `tests/e2e/support/accountCleanup.ts`
- Modify: `tests/e2e/fixtures.ts`
- Modify: `tests/e2e/profile.spec.ts`
- Modify: `tests/e2e/exercises.spec.ts`
- Modify: `tests/e2e/templates.spec.ts`
- Modify: `tests/e2e/template-launch.spec.ts`
- Modify: `tests/e2e/critical.spec.ts`
- Modify: `tests/e2e/workout-guard.spec.ts`
- Modify: `tests/e2e/workout-mobile.spec.ts`
- Modify: `tests/e2e/workout-persistence.spec.ts`

**Interfaces:**

- Produces fixture `cleanup.add(name, action)`.
- Cleanup actions run LIFO and aggregate every failure.
- Produces UI cleanup helpers `discardActiveSession`, `deleteTemplateByName`, `deleteUserExerciseByName`, and `restoreProfileName`.

- [ ] **Step 1: Write RED tests for cleanup ordering and failure aggregation**

Create `tests/e2e/support/cleanupRegistry.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { runCleanupActions, type CleanupAction } from './cleanupRegistry'

describe('runCleanupActions', () => {
  it('runs actions in reverse registration order', async () => {
    const calls: string[] = []
    const actions: CleanupAction[] = [
      { name: 'first', run: vi.fn(async () => { calls.push('first') }) },
      { name: 'second', run: vi.fn(async () => { calls.push('second') }) },
    ]

    await expect(runCleanupActions(actions)).resolves.toEqual([])
    expect(calls).toEqual(['second', 'first'])
  })

  it('continues after failure and returns every failed action', async () => {
    const actions: CleanupAction[] = [
      { name: 'profile', run: vi.fn(async () => { throw new Error('restore failed') }) },
      { name: 'session', run: vi.fn(async () => { throw new Error('discard failed') }) },
    ]

    await expect(runCleanupActions(actions)).resolves.toEqual([
      'session: discard failed',
      'profile: restore failed',
    ])
  })
})
```

Run:

```bash
npx vitest run tests/e2e/support/cleanupRegistry.test.ts
```

Expected: FAIL because `cleanupRegistry.ts` does not exist.

- [ ] **Step 2: Implement cleanup aggregation**

Create `tests/e2e/support/cleanupRegistry.ts`:

```ts
export interface CleanupAction {
  name: string
  run: () => Promise<void>
}

export async function runCleanupActions(actions: CleanupAction[]): Promise<string[]> {
  const failures: string[] = []

  for (const action of [...actions].reverse()) {
    try {
      await action.run()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failures.push(`${action.name}: ${message}`)
    }
  }

  return failures
}
```

Run the focused test again. Expected: 1 file and 2 tests pass.

- [ ] **Step 3: Extend the shared fixture with a cleanup registry**

Add to `tests/e2e/fixtures.ts`:

```ts
import { runCleanupActions, type CleanupAction } from './support/cleanupRegistry'

export interface CleanupRegistry {
  add(name: string, action: () => Promise<void>): void
}
```

Replace the Task 1 fixture interface and generic with:

```diff
-interface DiagnosticFixture {
+interface IronLogFixtures {
   browserDiagnostics: BrowserDiagnostic[]
+  cleanup: CleanupRegistry
 }

-export const test = base.extend<DiagnosticFixture>({
+export const test = base.extend<IronLogFixtures>({
```

Then add this property immediately after the existing `browserDiagnostics` property:

```ts
  cleanup: async ({ page }, use, testInfo) => {
    const actions: CleanupAction[] = []
    await use({ add: (name, action) => actions.push({ name, run: action }) })

    const failures = await runCleanupActions(actions.map((action) => ({
      ...action,
      run: () => testInfo.step(`cleanup: ${action.name}`, action.run),
    })))

    expect.soft(failures, failures.join('\n')).toEqual([])
    void page
  },
```

The explicit `page` dependency guarantees cleanup runs before the Playwright page fixture closes.

- [ ] **Step 4: Extract account cleanup helpers**

Create `tests/e2e/support/accountCleanup.ts` with these exported signatures:

```ts
import { expect, type Page } from '../fixtures'
import { expectAppReady } from './appReady'

export async function restoreProfileName(page: Page, originalName: string): Promise<void> {
  await page.goto('/profile')
  await expectAppReady(page, '/profile')
  const input = page.getByPlaceholder('np. Jan')
  await input.fill(originalName)
  await page.getByRole('button', { name: /Zapisz zmiany/ }).click()
  await expect(page.getByText('Profil zapisany')).toBeVisible({ timeout: 8_000 })
}

export async function deleteTemplateByName(page: Page, name: string): Promise<void> {
  await page.goto('/templates')
  await expectAppReady(page, '/templates')
  const buttons = page.getByRole('button', { name: `Usuń szablon ${name}` })
  while (await buttons.count()) {
    const count = await buttons.count()
    await buttons.first().click()
    await page.getByRole('dialog').getByRole('button', { name: 'Usuń' }).click()
    await expect(buttons).toHaveCount(count - 1, { timeout: 8_000 })
  }
}

export async function deleteUserExerciseByName(page: Page, name: string): Promise<void> {
  await page.goto('/exercises')
  await expectAppReady(page, '/exercises')
  await page.getByLabel('Szukaj ćwiczenia').fill(name)
  const button = page.getByRole('button', { name: `Usuń ćwiczenie ${name}` })
  if (await button.isVisible().catch(() => false)) {
    await button.click()
    await page.getByRole('dialog').getByRole('button', { name: 'Usuń' }).click()
    await expect(button).toHaveCount(0, { timeout: 8_000 })
  }
}

export async function discardActiveSession(page: Page): Promise<void> {
  await page.goto('/workout/new')
  await expectAppReady(page, '/workout/new', 25_000)

  const stale = page.getByRole('button', { name: 'Odrzuć i zacznij od nowa' })
  if (await stale.isVisible().catch(() => false)) {
    await stale.click()
    await expect(page.getByRole('button', { name: 'Anuluj', exact: true }).first()).toBeVisible({ timeout: 15_000 })
  }

  const discard = page.getByRole('button', { name: 'Anuluj', exact: true }).first()
  if (await discard.isVisible().catch(() => false)) {
    await discard.click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'Potwierdź akcję' })
    await expect(dialog).toBeVisible({ timeout: 5_000 })
    await dialog.getByRole('button', { name: 'Anuluj trening' }).click()
    await expect(page).toHaveURL('/dashboard', { timeout: 10_000 })
  }
}
```

- [ ] **Step 5: Register cleanup before every shared-account mutation**

Use the cleanup fixture before the first mutation, never at the end of the happy path only.

Profile example:

```ts
test('save changes and verify persistence after reload', async ({ page, cleanup }) => {
  await page.goto('/profile')
  await expectAppReady(page, '/profile')
  const input = page.getByPlaceholder('np. Jan')
  const originalName = (await input.inputValue()).trim()
  cleanup.add('restore profile name', () => restoreProfileName(page, originalName))

  const testName = `${originalName.replace(/ \[test\]$/, '')} [test]`.slice(0, 50)
  await input.fill(testName)
  await page.getByRole('button', { name: /Zapisz zmiany/ }).click()
  await expect(page.getByText('Profil zapisany')).toBeVisible({ timeout: 8_000 })
  await page.reload()
  await expectAppReady(page, '/profile')
  await expect(page.getByPlaceholder('np. Jan')).toHaveValue(testName)
})
```

Make these exact structural changes:

- `exercises.spec.ts`: replace the four dependent create/duplicate/edit/delete cases with one `user exercise CRUD lifecycle is isolated` test. Register `deleteUserExerciseByName(page, TEST_EXERCISE_NAME)` before creation, then execute create → duplicate rejection → edit → delete in that one test. Keep the global exercise detail case separate and read-only. Remove `beforeAll`, `afterAll`, serial dependence, and swallowed cleanup catches.
- `templates.spec.ts`: replace the four dependent create/edit/start/delete cases with one `template CRUD and launch lifecycle is isolated` test. Register `deleteTemplateByName(page, TEST_TEMPLATE_NAME)` and `discardActiveSession(page)` before creation, then execute create → edit → launch → discard → delete in one test. Remove `beforeAll`, `afterAll`, serial dependence, and swallowed cleanup catches.
- `template-launch.spec.ts`: keep the cancel/replace case and offline case separate, but give them distinct constants (`_E2E Launch Replace_` and `_E2E Launch Offline_`). Parameterize existing create/cleanup helpers by template name. Each test registers its own template deletion and active-session discard before creating its template. Remove `beforeAll`, `afterAll`, serial dependence, and swallowed cleanup catches.
- `critical.spec.ts`: register active-session discard before visiting `/workout/new`, because the route can auto-create a session.
- `workout-guard.spec.ts`, `workout-mobile.spec.ts`, and `workout-persistence.spec.ts`: register `discardActiveSession(page)` at the beginning of every test that creates or resumes a session; remove happy-path-only cleanup blocks once the registry owns them.

- [ ] **Step 6: Verify cleanup contracts**

Run:

```bash
npx vitest run tests/e2e/support/cleanupRegistry.test.ts
npm run lint
npx playwright test tests/e2e/profile.spec.ts --project=desktop
```

Expected: 2 cleanup unit tests pass; lint passes; profile tests pass and the original display name is restored even if a persistence assertion is temporarily forced to fail during RED verification. Restore the real assertion before committing.

- [ ] **Step 7: Commit interruption-safe cleanup**

```bash
git add tests/e2e/fixtures.ts tests/e2e/support tests/e2e/profile.spec.ts tests/e2e/exercises.spec.ts tests/e2e/templates.spec.ts tests/e2e/template-launch.spec.ts tests/e2e/critical.spec.ts tests/e2e/workout-guard.spec.ts tests/e2e/workout-mobile.spec.ts tests/e2e/workout-persistence.spec.ts
git commit -m "test: make shared account cleanup reliable"
```

---

### Task 4: Add the isolated Auth+Firestore emulator critical gate

**Files:**

- Create: `tests/e2e/env/.gitkeep`
- Modify: `src/lib/firebase.ts`
- Modify: `firebase.json`
- Modify: `vite.config.ts`
- Modify: `playwright.config.ts`
- Modify: `tests/e2e/global.setup.ts`
- Modify: `package.json`
- Modify: `.env.test.example`
- Modify: `README.md`

**Interfaces:**

- `VITE_FIREBASE_USE_EMULATORS='true'` connects the client to Auth `127.0.0.1:9099` and Firestore `127.0.0.1:8080`.
- `E2E_BACKEND='emulator'` selects safe Playwright web-server configuration and emulator account bootstrap.
- Emulator mode points Vite `envDir` at `tests/e2e/env`, so Vite does not load the repository's `.env.local`.
- `npm run test:e2e:isolated` starts fresh emulators and runs the four-spec foundation slice on desktop.

- [ ] **Step 1: Capture the RED isolated-gate baseline**

Run:

```bash
npm run test:e2e:isolated
```

Expected: FAIL because the script does not exist.

- [ ] **Step 2: Add emulator ports without changing rules**

Extend `firebase.json`:

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "emulators": {
    "auth": { "host": "127.0.0.1", "port": 9099 },
    "firestore": { "host": "127.0.0.1", "port": 8080 },
    "ui": { "enabled": false },
    "singleProjectMode": true
  }
}
```

- [ ] **Step 3: Connect the web client only under the explicit flag**

Update imports in `src/lib/firebase.ts`:

```ts
import {
  connectAuthEmulator,
  getAuth,
  initializeAuth,
  browserLocalPersistence,
} from 'firebase/auth'
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'
```

After `auth` and `db` are created, add:

```ts
const emulatorState = globalThis as typeof globalThis & {
  __ironlogFirebaseEmulatorsConnected?: boolean
}

if (
  import.meta.env.VITE_FIREBASE_USE_EMULATORS === 'true'
  && !emulatorState.__ironlogFirebaseEmulatorsConnected
) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  emulatorState.__ironlogFirebaseEmulatorsConnected = true
}
```

The flag must remain absent from `.env.example`; it is a test-only process variable.

- [ ] **Step 4: Make Playwright emulator mode secret-free and non-reusable**

Create the empty tracked marker `tests/e2e/env/.gitkeep`. Then change `vite.config.ts` to:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(() => {
  const emulatorMode = process.env.E2E_BACKEND === 'emulator'

  return {
    envDir: emulatorMode ? 'tests/e2e/env' : undefined,
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  }
})
```

This preserves normal Vite env loading and gives the isolated gate a directory containing no env files.

At the top of `playwright.config.ts`, replace unconditional dotenv loading with:

```ts
const emulatorMode = process.env.E2E_BACKEND === 'emulator'
const storageStatePath = emulatorMode
  ? 'tests/e2e/.auth/emulator-user.json'
  : 'tests/e2e/.auth/user.json'

if (!emulatorMode) {
  config({ path: '.env.test' })
}

const emulatorWebEnv = {
  E2E_BACKEND: 'emulator',
  VITE_FIREBASE_API_KEY: 'demo-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-ironlog.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-ironlog',
  VITE_FIREBASE_STORAGE_BUCKET: 'demo-ironlog.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '123456789',
  VITE_FIREBASE_APP_ID: '1:123456789:web:demo',
  VITE_FIREBASE_USE_EMULATORS: 'true',
}
```

Change `webServer` to:

```ts
webServer: {
  command: 'npm run dev',
  url: 'http://localhost:5173',
  reuseExistingServer: !emulatorMode && !process.env.CI,
  timeout: 30_000,
  env: emulatorMode ? emulatorWebEnv : undefined,
},
```

In both `desktop` and `mobile` projects, replace the hard-coded storage state with:

```ts
storageState: storageStatePath,
```

- [ ] **Step 5: Bootstrap a deterministic emulator user and profile**

In `global.setup.ts`, replace the fixed auth file declaration with:

```ts
const emulatorMode = process.env.E2E_BACKEND === 'emulator'
const authFile = path.join(
  __dirname,
  emulatorMode ? '.auth/emulator-user.json' : '.auth/user.json',
)
```

Then change the setup to accept `request` and add:

```ts
async function ensureEmulatorUser(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<void> {
  const response = await request.post(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key',
    { data: { email, password, returnSecureToken: true } },
  )

  if (response.ok()) return
  const body = await response.json() as { error?: { message?: string } }
  if (body.error?.message !== 'EMAIL_EXISTS') {
    throw new Error(`Auth emulator user bootstrap failed: ${JSON.stringify(body)}`)
  }
}
```

Use this complete setup flow:

```ts
setup('authenticate', async ({ page, request }) => {
  const email = process.env.TEST_EMAIL
  const password = process.env.TEST_PASSWORD
  if (!email || !password) {
    throw new Error('TEST_EMAIL and TEST_PASSWORD must be provided by the selected E2E backend')
  }

  if (emulatorMode) await ensureEmulatorUser(request, email, password)

  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Hasło').fill(password)
  await page.getByRole('button', { name: 'Zaloguj się' }).click()
  await page.waitForURL('/dashboard', { timeout: 20_000 })

  if (emulatorMode) {
    await page.goto('/onboarding')
    await expect(page.getByRole('heading', { name: 'Skonfiguruj profil' })).toBeVisible()
    await page.getByLabel('Jak mamy się do Ciebie zwracać?').fill('IronLog E2E')
    await page.getByRole('button', { name: 'Zaczynajmy' }).click()
    await page.waitForURL('/dashboard', { timeout: 20_000 })
  }

  await page.waitForTimeout(1_000)
  await page.context().storageState({ path: authFile })
})
```

Task 1 already re-exports `APIRequestContext` from `fixtures.ts`; use that type in `global.setup.ts` without adding a direct `@playwright/test` import.

- [ ] **Step 6: Add the isolated command**

Add to `package.json` scripts:

```json
"test:e2e:isolated": "E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e firebase emulators:exec --only auth,firestore --project demo-ironlog \"playwright test tests/e2e/critical.spec.ts tests/e2e/profile.spec.ts tests/e2e/exercises.spec.ts tests/e2e/templates.spec.ts --project=desktop\""
```

This intentionally reuses the Firebase CLI already required by `test:rules`; do not add `firebase-tools` to `package.json` in Phase 0.

- [ ] **Step 7: Document the two E2E modes**

Append to `.env.test.example`:

```dotenv
# Used only by npm run test:e2e (live backend).
# npm run test:e2e:isolated supplies deterministic emulator credentials itself.
```

Replace the README test block with:

```bash
npm run test:unit          # testy jednostkowe (Vitest)
npm run test:rules         # testy reguł Firestore (emulator)
npm run test:e2e:isolated  # krytyczny, deterministyczny gate Auth + Firestore emulator
npm run test:e2e           # pełna integracja Playwright z backendem z .env.test
```

Add one sentence below it:

```markdown
`test:e2e:isolated` nie wymaga sekretów ani produkcyjnego quota. Wymaga zainstalowanego Firebase CLI — tego samego, którego używa `test:rules`.
```

- [ ] **Step 8: Run the isolated GREEN gate twice**

Run:

```bash
npm run test:e2e:isolated
npm run test:e2e:isolated
```

Expected on both fresh emulator runs: setup and all desktop cases in the four-spec foundation slice pass; no production credentials are read; no blocking browser diagnostics or cleanup failures are reported.

Run:

```bash
npm run test:rules
npm run lint
npm run test:unit
npm run build
```

Expected: Firestore rules, lint, all unit/support tests, and production build pass. Existing chunk-size advisory is acceptable.

- [ ] **Step 9: Commit the isolated gate**

```bash
git add src/lib/firebase.ts firebase.json vite.config.ts playwright.config.ts tests/e2e/env/.gitkeep tests/e2e/global.setup.ts package.json .env.test.example README.md
git commit -m "test: add isolated Firebase E2E gate"
```

---

### Task 5: Run Phase 0 gates and close the roadmap phase

**Files:**

- Modify after all gates pass: `docs/roadmap/ROADMAP.md`
- Modify through `memory-save`: `WORKING_CONTEXT.md`, `docs/audits/audit-log.md`

**Interfaces:**

- Consumes Tasks 1–4 and both E2E backend modes.
- Produces a verified Phase 0 baseline and Phase R handoff.

- [ ] **Step 1: Run the complete deterministic gate**

```bash
npm run lint
npm run test:unit
npm run test:rules
npm run build
npm run test:e2e:isolated
```

Expected: every command passes. Record exact test counts in the task report and roadmap; do not copy the previous 106 count if support tests change it.

- [ ] **Step 2: Verify Phase 0 contracts statically**

```bash
rg -n "from '@playwright/test'" tests/e2e --glob '*.spec.ts' --glob 'global.setup.ts'
```

Expected: exit 1, because every E2E file uses `./fixtures`.

```bash
rg -n "page\.locator\(['\"]\.page-shell['\"]\)" tests/e2e \
  --glob '!audit-screenshots.spec.ts' \
  --glob '!smoke.spec.ts'
```

Expected: exit 1; product tests use meaningful readiness.

```bash
rg -n "VITE_FIREBASE_USE_EMULATORS|E2E_BACKEND|test:e2e:isolated" src/lib/firebase.ts playwright.config.ts tests/e2e/global.setup.ts package.json README.md
```

Expected: the emulator boundary and documented command are present only in intended test/runtime-switch surfaces.

- [ ] **Step 3: Run the live integration suite only when quota is available**

```bash
npm run test:e2e
```

If the known production Firebase quota still returns `resource-exhausted`, preserve the exact output as an external live-suite limitation. It does not block Phase 0 when the isolated critical gate is green. Any functional failure unrelated to quota blocks completion.

- [ ] **Step 4: Mark Phase 0 complete**

Only after Steps 1–2 pass, change the roadmap map row to:

```markdown
| 2 | 0 — Minimalny fundament weryfikacji | P0 | DONE | Krytyczny gate działa bez produkcyjnego quota; readiness, diagnostyka i cleanup mają wspólne kontrakty |
```

Add after `BASE-06`:

```markdown
- **BASE-07 — Fundament E2E: DONE.** Krytyczne testy używają gotowości właściwych ekranów, automatycznej diagnostyki przeglądarki i cleanupu mutacji; osobny gate Auth+Firestore emulator działa bez sekretów i produkcyjnego quota.
```

Update the current quality baseline with fresh unit/rules/isolated-E2E counts. Change the roadmap top status and recommended next package from Phase 0 to **Phase R**. Do not mark Phase R or Phase S complete.

- [ ] **Step 5: Commit roadmap completion**

```bash
git add docs/roadmap/ROADMAP.md
git commit -m "docs: complete verification foundation phase"
```

- [ ] **Step 6: Save the Phase R handoff**

Invoke `memory-save` with:

```text
Sprint focus: Phase 0 complete; prepare focused Phase R workout lifecycle review.
Decision: isolated critical E2E uses fresh Auth+Firestore emulators; the live suite remains an integration check.
Passing: lint, unit/support tests, rules tests, build, isolated critical Playwright, browser diagnostics, cleanup contracts.
Broken/untested: preserve only evidence-backed live-suite quota limitations and release checks.
Next: plan REVIEW-WORKOUT-01 through REVIEW-WORKOUT-05; do not plan Phase 1 before Phase R evidence.
```

If the memory ritual modifies tracked memory files, review and commit them. Do not push or deploy.

- [ ] **Step 7: Run final repository checks**

```bash
git diff --check
git status --short
git log --oneline --decorate -8
```

Expected: no whitespace errors, no unintended files, and focused commits for diagnostics, readiness, cleanup, emulator isolation, and roadmap closure.

---

## Definition of Done

- `TEST-01`, `TEST-03`, `TEST-05`, and `TEST-06` each map to implemented code and a passing gate.
- A loading skeleton or full-page error cannot satisfy a critical route-readiness assertion.
- Every E2E spec records page exceptions, critical console errors, and failed requests through one fixture.
- Profile/template/exercise/session cleanup survives an assertion failure and reports cleanup failures explicitly.
- `npm run test:e2e:isolated` passes twice from fresh emulators without `.env.test`, `.env.local`, external Firebase, or secrets.
- The default live application and `npm run test:e2e` still use their existing Firebase configuration.
- Rules tests, unit/support tests, lint, build, and the isolated critical gate are green.
- The canonical roadmap records Phase 0 as `DONE` and points next to Phase R.
- Final task reviews and whole-branch review have no open Critical or Important findings.
