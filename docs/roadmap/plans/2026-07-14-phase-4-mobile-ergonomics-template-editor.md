# Phase 4 Mobile Ergonomics and Template Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zapewnić stale dostępny i bezpieczny zapis planu, skoordynować mobile fixed UI z klawiaturą oraz podnieść objęte targety dotykowe do minimum 44×44 px.

**Architecture:** Chroniony shell otrzyma cienki `MobileInteractionProvider`, który publikuje fokus pola i geometrię `visualViewport`, bez przejmowania logiki stron. Edytor użyje oficjalnego blockera Data Routera i lokalnego stałego docka, a trening zachowa jeden stan rest timera prezentowany w wariancie pełnym lub kompaktowym.

**Tech Stack:** React 19, TypeScript 5.9, React Router 7 Data Router, Vite 8, Vitest 4, Testing Library, Playwright 1.59, Tailwind CSS 4 + `src/index.css`.

## Global Constraints

- Zakres obejmuje wyłącznie `MOBILE-01–06` z zatwierdzonego speca `docs/roadmap/specs/2026-07-14-phase-4-mobile-ergonomics-template-editor-design.md`.
- Audyt `docs/audits/2026-07-14-senior-design-review.md` pozostaje odłożony i nie może rozszerzyć tej fazy.
- Nie zmieniać Firestore, Vercel Functions, reguł, modeli danych ani kontraktu `activeSessions`.
- Aktywna sesja treningowa nie dostaje ostrzeżenia przy zwykłym przejściu do innej zakładki.
- Każda objęta samodzielna akcja mobilna ma efektywny target co najmniej 44×44 px; hitboxy nie mogą na siebie nachodzić.
- Zachować wszystkie siedem pozycji dolnej nawigacji również przy 320 px; nie dodawać menu „Więcej”.
- Walidacja geometrii obejmuje 320/375/390×844 px, tekst 150% i kontrolowany viewport o wysokości 500 px.
- Zachować kierunek wizualny Puls; nie wykonywać redesignu, zmian copy z Fazy 5 ani ustaleń z senior design review.
- Nie ustawiać stanu synchronicznie na początku `useEffect`; inicjalny stan wyliczać w `useState`.
- Projekt jest Vite SPA: nie dodawać `'use client'`.
- Nie dodawać migracji, feature flagi ani compatibility layer; zwykły revert commitów jest recovery.
- Nie wykonywać pushu, deployu ani czynności `RELEASE-08` bez osobnej zgody Patryka.
- Commity nie mogą zawierać trailerów AI ani `Co-Authored-By`.

## File Structure

### Nowe pliki

- `src/hooks/useUnsavedChangesGuard.ts` — oficjalny blocker nawigacji SPA + `beforeunload` i jednorazowe zezwolenie po udanym zapisie.
- `src/hooks/__tests__/useUnsavedChangesGuard.test.tsx` — kontrakt `proceed/reset`, czystej nawigacji i `beforeunload`.
- `src/components/MobileInteractionProvider.tsx` — jedno źródło fokusu pola i geometrii visual viewportu dla chronionego shella.
- `src/components/__tests__/MobileInteractionProvider.test.tsx` — fokus, resize, fallback bez `visualViewport` i cleanup CSS variables.
- `src/components/TemplateSaveDock.tsx` — cztery stany stałego docka zapisu bez kopii formularza.
- `src/components/__tests__/TemplateSaveDock.test.tsx` — clean, dirty create/edit i saving.
- `tests/e2e/mobile-ergonomics.spec.ts` — guard edytora, duży draft, dock, 320/375/390, tekst 150% i hitboxy.
- `tests/e2e/support/templateDraft.ts` — deterministyczny draft `Upper / Lower 4×` bez zapisu do Firestore.

### Modyfikowane pliki

- `src/router/index.tsx` — `BrowserRouter` → `createBrowserRouter` + `RouterProvider`, bez zmiany tras.
- `src/components/AppLayout.tsx` — provider wokół jednego chronionego shella.
- `src/components/BottomNav.tsx` — konsumowanie wspólnego fokusu i geometria 44 px.
- `src/components/ConfirmDialog.tsx` — opcjonalnie zablokowana akcja confirm podczas zapisu.
- `src/pages/TemplateEditorPage.tsx` — guard, dock, bezpieczny sukces/błąd zapisu i rozdzielenie akcji mobile/desktop.
- `src/pages/__tests__/TemplateEditorAccessibility.test.tsx` — render przez Data Router, AI draft jako dirty, guard podczas zapisu i odzyskanie po błędzie.
- `src/pages/__tests__/SharedAccessibilityContracts.test.tsx` — disabled confirm zachowujący focus trap i opis.
- `src/components/ExercisePicker.tsx` — 44 px close i filtry kategorii.
- `src/pages/ExercisesPage.tsx` — 44 px chipy formularza i biblioteki.
- `src/pages/HistoryPage.tsx` — 44 px filtry zakresu/kategorii i clear search.
- `src/pages/ProgressPage.tsx` — 44 px przełącznik zakresu.
- `src/pages/ChatPage.tsx` — 44 px chipy konfiguracji i podglądu planu.
- `src/pages/WorkoutPage.tsx` — kompaktowy rest timer przy fokusie/zmniejszonym viewportcie.
- `tests/e2e/workout-mobile.spec.ts` — `full → compact → full` oraz brak przecięcia pola z timerem.
- `src/index.css` — CSS variables, dock, kompaktowy timer, scroll clearance i target utility.
- `docs/roadmap/ROADMAP.md` — status Fazy 4 po implementacji.
- `docs/roadmap/specs/2026-07-14-phase-4-mobile-ergonomics-template-editor-design.md` — status po implementacji.
- `docs/roadmap/plans/2026-07-14-phase-4-mobile-ergonomics-template-editor.md` — checklisty i wynik końcowy.

---

### Task 1: Data Router and reusable unsaved-changes blocker

**Files:**
- Create: `src/hooks/useUnsavedChangesGuard.ts`
- Create: `src/hooks/__tests__/useUnsavedChangesGuard.test.tsx`
- Modify: `src/router/index.tsx:1-115`
- Verify: `tests/e2e/smoke.spec.ts`
- Verify: `tests/e2e/protected-shell.spec.ts`

**Interfaces:**
- Consumes: React Router `useBlocker`, `createBrowserRouter`, `createRoutesFromElements`, `RouterProvider`.
- Produces:

```ts
export interface UnsavedChangesGuard {
  blocked: boolean
  proceeding: boolean
  proceed: () => void
  reset: () => void
  allowNextNavigation: () => void
}

export function useUnsavedChangesGuard(shouldBlock: boolean): UnsavedChangesGuard
```

- [ ] **Step 1: Write failing blocker tests**

Create `src/hooks/__tests__/useUnsavedChangesGuard.test.tsx` with a Data Router harness:

```tsx
import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import {
  createMemoryRouter,
  RouterProvider,
  useNavigate,
} from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { useUnsavedChangesGuard } from '../useUnsavedChangesGuard'

function GuardHarness() {
  const [dirty, setDirty] = useState(false)
  const navigate = useNavigate()
  const guard = useUnsavedChangesGuard(dirty)

  return (
    <>
      <button type="button" onClick={() => setDirty(true)}>Zmień</button>
      <button type="button" onClick={() => navigate('/next')}>Dalej</button>
      <button type="button" onClick={() => { guard.allowNextNavigation(); navigate('/next') }}>
        Zapisz i przejdź
      </button>
      {guard.blocked && (
        <div role="dialog" aria-label="Opuścić?">
          <button type="button" onClick={guard.reset}>Zostań</button>
          <button type="button" onClick={guard.proceed}>Opuść</button>
        </div>
      )}
    </>
  )
}

function renderGuard() {
  const router = createMemoryRouter([
    { path: '/edit', element: <GuardHarness /> },
    { path: '/next', element: <p>Następna strona</p> },
  ], { initialEntries: ['/edit'] })
  render(<RouterProvider router={router} />)
  return router
}

describe('useUnsavedChangesGuard', () => {
  it('blocks dirty navigation and supports reset then proceed', async () => {
    const router = renderGuard()
    fireEvent.click(screen.getByRole('button', { name: 'Zmień' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dalej' }))
    expect(screen.getByRole('dialog', { name: 'Opuścić?' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Zostań' }))
    expect(router.state.location.pathname).toBe('/edit')

    fireEvent.click(screen.getByRole('button', { name: 'Dalej' }))
    fireEvent.click(screen.getByRole('button', { name: 'Opuść' }))
    expect(await screen.findByText('Następna strona')).toBeInTheDocument()
  })

  it('allows exactly the navigation authorized after save', async () => {
    const router = renderGuard()
    fireEvent.click(screen.getByRole('button', { name: 'Zmień' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz i przejdź' }))
    expect(await screen.findByText('Następna strona')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/next')
  })

  it('prevents beforeunload while dirty', () => {
    renderGuard()
    fireEvent.click(screen.getByRole('button', { name: 'Zmień' }))
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm run test:unit -- src/hooks/__tests__/useUnsavedChangesGuard.test.tsx
```

Expected: FAIL because `../useUnsavedChangesGuard` does not exist.

- [ ] **Step 3: Implement the blocker hook**

Create `src/hooks/useUnsavedChangesGuard.ts`:

```ts
import { useCallback, useEffect, useRef } from 'react'
import { useBlocker } from 'react-router-dom'

export interface UnsavedChangesGuard {
  blocked: boolean
  proceeding: boolean
  proceed: () => void
  reset: () => void
  allowNextNavigation: () => void
}

export function useUnsavedChangesGuard(shouldBlock: boolean): UnsavedChangesGuard {
  const allowNextNavigationRef = useRef(false)
  const blocker = useBlocker(() => {
    if (allowNextNavigationRef.current) {
      allowNextNavigationRef.current = false
      return false
    }
    return shouldBlock
  })

  useEffect(() => {
    if (!shouldBlock) return

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [shouldBlock])

  const proceed = useCallback(() => {
    if (blocker.state === 'blocked') blocker.proceed()
  }, [blocker])

  const reset = useCallback(() => {
    if (blocker.state === 'blocked') blocker.reset()
  }, [blocker])

  const allowNextNavigation = useCallback(() => {
    allowNextNavigationRef.current = true
  }, [])

  return {
    blocked: blocker.state === 'blocked',
    proceeding: blocker.state === 'proceeding',
    proceed,
    reset,
    allowNextNavigation,
  }
}
```

- [ ] **Step 4: Convert the router without changing route behavior**

In `src/router/index.tsx`, replace the declarative bootstrap with one Data Router root:

```tsx
import { lazy, useEffect } from 'react'
import {
  createBrowserRouter,
  createRoutesFromElements,
  Navigate,
  Outlet,
  Route,
  RouterProvider,
  useLocation,
} from 'react-router-dom'

function RootRoute() {
  return (
    <>
      <RouteScrollReset />
      <Outlet />
    </>
  )
}

const router = createBrowserRouter(createRoutesFromElements(
  <Route element={<RootRoute />}>
    <Route element={<PublicRouteOutlet />}>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
    </Route>
    <Route element={<PrivateRouteOutlet />}>
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route element={<AppLayout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/progress" element={<ProgressPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/templates/new" element={<TemplateEditorPage />} />
        <Route path="/templates/:id/edit" element={<TemplateEditorPage />} />
        <Route path="/exercises" element={<ExercisesPage />} />
        <Route path="/exercises/:source/:id" element={<ExerciseDetailPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/workout/new" element={<WorkoutPage />} />
        <Route path="/workout/:id" element={<WorkoutDetailPage />} />
      </Route>
    </Route>
    <Route path="*" element={<NotFoundPage />} />
  </Route>,
))

export default function AppRouter() {
  return <RouterProvider router={router} />
}
```

Keep the existing lazy imports, auth outlets and `RouteScrollReset` implementation unchanged.

- [ ] **Step 5: Run unit and router smoke gates**

Run:

```bash
npm run test:unit -- src/hooks/__tests__/useUnsavedChangesGuard.test.tsx
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e firebase emulators:exec --only auth,firestore --project demo-ironlog "npx playwright test tests/e2e/smoke.spec.ts tests/e2e/protected-shell.spec.ts --project=desktop --project=mobile"
```

Expected: focused Vitest PASS; all smoke/protected-shell cases PASS with the same URLs and one protected shell.

- [ ] **Step 6: Commit**

```bash
git add src/router/index.tsx src/hooks/useUnsavedChangesGuard.ts src/hooks/__tests__/useUnsavedChangesGuard.test.tsx
git commit -m "refactor: enable guarded app navigation"
```

---

### Task 2: Shared mobile interaction state and BottomNav integration

**Files:**
- Create: `src/components/MobileInteractionProvider.tsx`
- Create: `src/components/__tests__/MobileInteractionProvider.test.tsx`
- Modify: `src/components/AppLayout.tsx:1-80`
- Modify: `src/components/BottomNav.tsx:1-160`
- Verify: `tests/e2e/accessibility.spec.ts`

**Interfaces:**
- Consumes: `AppLayout`, `BottomNav`, browser `visualViewport`.
- Produces:

```ts
export interface MobileInteractionState {
  inputFocused: boolean
  visualViewportHeight: number
  viewportBottomInset: number
  compactFixedUi: boolean
}

export function useMobileInteraction(): MobileInteractionState
export default function MobileInteractionProvider(props: PropsWithChildren): ReactElement
```

- [ ] **Step 1: Write failing provider tests**

Create `src/components/__tests__/MobileInteractionProvider.test.tsx`. Use a real `EventTarget` as the viewport mock and assert the public contract:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import MobileInteractionProvider, { useMobileInteraction } from '../MobileInteractionProvider'

function Probe() {
  const state = useMobileInteraction()
  return (
    <>
      <input aria-label="Ciężar" />
      <output data-testid="state">
        {JSON.stringify(state)}
      </output>
    </>
  )
}

describe('MobileInteractionProvider', () => {
  let viewport: EventTarget & { height: number; offsetTop: number }

  beforeEach(() => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 })
    viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0 })
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport })
  })

  afterEach(() => {
    document.documentElement.style.removeProperty('--mobile-viewport-bottom-inset')
    document.documentElement.removeAttribute('data-mobile-input-focused')
  })

  it('publishes focused input and reduced visual viewport geometry', () => {
    render(<MobileInteractionProvider><Probe /></MobileInteractionProvider>)
    fireEvent.focus(screen.getByRole('textbox', { name: 'Ciężar' }))
    viewport.height = 500
    viewport.dispatchEvent(new Event('resize'))

    expect(screen.getByTestId('state')).toHaveTextContent('"inputFocused":true')
    expect(screen.getByTestId('state')).toHaveTextContent('"viewportBottomInset":344')
    expect(screen.getByTestId('state')).toHaveTextContent('"compactFixedUi":true')
    expect(document.documentElement.style.getPropertyValue('--mobile-viewport-bottom-inset')).toBe('344px')
  })

  it('falls back to window geometry without visualViewport', () => {
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined })
    render(<MobileInteractionProvider><Probe /></MobileInteractionProvider>)
    expect(screen.getByTestId('state')).toHaveTextContent('"visualViewportHeight":844')
    expect(screen.getByTestId('state')).toHaveTextContent('"viewportBottomInset":0')
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm run test:unit -- src/components/__tests__/MobileInteractionProvider.test.tsx
```

Expected: FAIL because `MobileInteractionProvider` does not exist.

- [ ] **Step 3: Implement the provider**

Create `src/components/MobileInteractionProvider.tsx` with this state boundary:

```tsx
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
  type ReactElement,
} from 'react'

export interface MobileInteractionState {
  inputFocused: boolean
  visualViewportHeight: number
  viewportBottomInset: number
  compactFixedUi: boolean
}

function isEditable(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

function readState(inputFocused = isEditable(document.activeElement)): MobileInteractionState {
  const viewport = window.visualViewport
  const height = viewport?.height ?? window.innerHeight
  const offsetTop = viewport?.offsetTop ?? 0
  const viewportBottomInset = Math.max(0, window.innerHeight - offsetTop - height)

  return {
    inputFocused,
    visualViewportHeight: height,
    viewportBottomInset,
    compactFixedUi: inputFocused || viewportBottomInset >= 96,
  }
}

const MobileInteractionContext = createContext<MobileInteractionState | null>(null)

export function useMobileInteraction(): MobileInteractionState {
  const value = useContext(MobileInteractionContext)
  if (!value) throw new Error('useMobileInteraction must be used inside MobileInteractionProvider')
  return value
}

export default function MobileInteractionProvider({ children }: PropsWithChildren): ReactElement {
  const [state, setState] = useState<MobileInteractionState>(() => readState())

  useEffect(() => {
    const updateGeometry = () => setState((current) => readState(current.inputFocused))
    const onFocusIn = (event: FocusEvent) => setState(readState(isEditable(event.target)))
    const onFocusOut = () => window.setTimeout(() => setState(readState()), 0)
    const viewport = window.visualViewport

    window.addEventListener('focusin', onFocusIn)
    window.addEventListener('focusout', onFocusOut)
    window.addEventListener('resize', updateGeometry, { passive: true })
    viewport?.addEventListener('resize', updateGeometry, { passive: true })
    viewport?.addEventListener('scroll', updateGeometry, { passive: true })

    return () => {
      window.removeEventListener('focusin', onFocusIn)
      window.removeEventListener('focusout', onFocusOut)
      window.removeEventListener('resize', updateGeometry)
      viewport?.removeEventListener('resize', updateGeometry)
      viewport?.removeEventListener('scroll', updateGeometry)
    }
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--mobile-viewport-bottom-inset', `${state.viewportBottomInset}px`)
    root.style.setProperty('--mobile-visual-viewport-height', `${state.visualViewportHeight}px`)
    root.toggleAttribute('data-mobile-input-focused', state.inputFocused)

    return () => {
      root.style.removeProperty('--mobile-viewport-bottom-inset')
      root.style.removeProperty('--mobile-visual-viewport-height')
      root.removeAttribute('data-mobile-input-focused')
    }
  }, [state])

  return (
    <MobileInteractionContext.Provider value={state}>
      {children}
    </MobileInteractionContext.Provider>
  )
}
```

- [ ] **Step 4: Mount once in AppLayout and remove duplicate input listeners**

Wrap the complete return of `AppLayout` in `MobileInteractionProvider` so `Outlet` and `BottomNav` share one instance:

```tsx
return (
  <MobileInteractionProvider>
    <div className={workoutFocusShell ? 'top-nav-workout-mobile-shell' : undefined}>
      <TopNav current={section} />
    </div>
    <main ref={mainRef} className="page-shell" tabIndex={-1}>
      <div className="page-container">
        <div className="min-w-0">
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </div>
      </div>
    </main>
    <BottomNav />
  </MobileInteractionProvider>
)
```

In `BottomNav`, replace local `inputFocused` state with:

```ts
const { inputFocused } = useMobileInteraction()
```

Delete only the input/editable branches from the old focus listener. Retain a small `focusin` listener for `main.page-shell`, because it resets scroll-hide state and focus transfer remains `BottomNav` responsibility.

- [ ] **Step 5: Run focused and accessibility gates**

Run:

```bash
npm run test:unit -- src/components/__tests__/MobileInteractionProvider.test.tsx src/pages/__tests__/SharedAccessibilityContracts.test.tsx
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e firebase emulators:exec --only auth,firestore --project demo-ironlog "npx playwright test tests/e2e/accessibility.spec.ts --project=mobile"
```

Expected: provider tests PASS; hidden nav remains `inert`, `aria-hidden` and outside focus order.

- [ ] **Step 6: Commit**

```bash
git add src/components/MobileInteractionProvider.tsx src/components/__tests__/MobileInteractionProvider.test.tsx src/components/AppLayout.tsx src/components/BottomNav.tsx
git commit -m "feat: share mobile viewport interaction state"
```

---

### Task 3: Guard every dirty template-editor exit

**Files:**
- Create: `tests/e2e/support/templateDraft.ts`
- Create: `tests/e2e/mobile-ergonomics.spec.ts`
- Modify: `src/components/ConfirmDialog.tsx:5-105`
- Modify: `src/pages/TemplateEditorPage.tsx:1-187, 561-574`
- Modify: `src/pages/__tests__/SharedAccessibilityContracts.test.tsx:24-94`
- Modify: `src/pages/__tests__/TemplateEditorAccessibility.test.tsx:1-84`

**Interfaces:**
- Consumes: `useUnsavedChangesGuard(shouldBlock)` from Task 1.
- Produces: `ConfirmDialogProps.confirmDisabled?: boolean`; helper `openLargeTemplateDraft(page: Page): Promise<void>`.

- [ ] **Step 1: Add failing disabled-confirm and dirty-navigation tests**

Extend the shared dialog test with:

```tsx
it('keeps a disabled confirm action non-interactive', () => {
  const onConfirm = vi.fn()
  render(
    <ConfirmDialog
      title="Zapis w toku"
      message="Poczekaj na wynik zapisu."
      confirmLabel="Zapisuję..."
      confirmDisabled
      onConfirm={onConfirm}
      onCancel={vi.fn()}
    />,
  )
  const confirm = screen.getByRole('button', { name: 'Zapisuję...' })
  expect(confirm).toBeDisabled()
  fireEvent.click(confirm)
  expect(onConfirm).not.toHaveBeenCalled()
})
```

Create `tests/e2e/support/templateDraft.ts`:

```ts
import { expect, type Page } from '@playwright/test'

const exercises = [
  ['bench-press', 'Bench Press'],
  ['pull-up', 'Pull-up'],
  ['overhead-press', 'Overhead Press'],
  ['barbell-row', 'Barbell Row'],
  ['biceps-curl', 'Biceps Curl'],
  ['tricep-pushdown', 'Tricep Pushdown'],
] as const

export const LARGE_TEMPLATE_DRAFT = {
  name: 'Upper / Lower 4×',
  days: ['Upper A', 'Lower A', 'Upper B', 'Lower B'].map((name) => ({
    name,
    exercises: exercises.map(([exerciseId, exerciseName]) => ({
      exerciseId,
      exerciseSource: 'global' as const,
      name: exerciseName,
      sets: 4,
      targetReps: 10,
      targetWeight: 50,
    })),
  })),
}

export async function openLargeTemplateDraft(page: Page): Promise<void> {
  await page.goto('/templates')
  await page.evaluate((draft) => {
    sessionStorage.setItem('ironlog:template-draft', JSON.stringify(draft))
  }, LARGE_TEMPLATE_DRAFT)
  await page.goto('/templates/new?draft=ai')
  await expect(page.getByRole('textbox', { name: 'Nazwa' })).toHaveValue('Upper / Lower 4×')
}
```

Create the first test in `tests/e2e/mobile-ergonomics.spec.ts`:

```ts
import { test, expect } from './fixtures'
import { openLargeTemplateDraft } from './support/templateDraft'

test.describe('Phase 4 mobile ergonomics', () => {
  test('dirty template editor guards BottomNav and browser back', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only contract')
    await page.setViewportSize({ width: 390, height: 844 })
    await openLargeTemplateDraft(page)

    const name = page.getByRole('textbox', { name: 'Nazwa' })
    await name.fill('Upper / Lower 4× zmieniony')
    await name.blur()

    await page.getByRole('button', { name: 'Start', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Opuścić edytor?' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Zostań' }).click()
    await expect(page).toHaveURL(/\/templates\/new/)

    await page.evaluate(() => history.back())
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Opuść bez zapisu' }).click()
    await expect(page).not.toHaveURL(/\/templates\/new/)
  })
})
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm run test:unit -- src/pages/__tests__/SharedAccessibilityContracts.test.tsx src/pages/__tests__/TemplateEditorAccessibility.test.tsx
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e firebase emulators:exec --only auth,firestore --project demo-ironlog "npx playwright test tests/e2e/mobile-ergonomics.spec.ts --project=mobile"
```

Expected: disabled-confirm test FAIL; E2E navigates away without the expected blocker.

- [ ] **Step 3: Add confirmDisabled to ConfirmDialog**

Extend the props and confirm button:

```tsx
interface ConfirmDialogProps {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  confirmDisabled?: boolean
  onConfirm: () => void
  onCancel: () => void
}

// destructuring
confirmDisabled = false,

<motion.button
  type="button"
  onClick={onConfirm}
  disabled={confirmDisabled}
  className="flex-1 rounded-[var(--radius-md)] py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-55"
  style={{
    background: danger ? 'var(--danger)' : 'var(--primary-gradient)',
    color: danger ? '#fff' : 'var(--accent-foreground)',
  }}
  whileTap={confirmDisabled ? undefined : { scale: 0.95 }}
>
  {confirmLabel}
</motion.button>
```

- [ ] **Step 4: Replace the local editor guard with the shared blocker**

In `TemplateEditorPage`:

```tsx
const hasUnsavedChanges = !loading && currentSnapshot !== savedSnapshot
const leaveGuard = useUnsavedChangesGuard(hasUnsavedChanges || saving)

function handleBackToTemplates() {
  navigate('/templates')
}
```

Delete `confirmLeaveOpen`, its setter, the `ConfirmDialog` component mock in `TemplateEditorAccessibility.test.tsx`, and the local `beforeunload` effect. Retain the `ExercisePicker` mock.

Initialize `savedSnapshot` from an actually persisted baseline, not from the imported AI draft. This makes a generated create draft dirty and immediately saveable, while an empty new template stays clean; the edit path still replaces the baseline after `getTemplate` resolves:

```tsx
const [savedSnapshot, setSavedSnapshot] = useState(() => serializeDraftState(
  '',
  defaultSerializableDays(),
))
```

Add this regression test before the pending-save test:

```tsx
it('treats an imported AI draft as unsaved', async () => {
  renderEditor()

  fireEvent.click(await screen.findByRole('button', { name: 'Wróć' }))

  expect(await screen.findByRole('dialog', { name: 'Opuścić edytor?' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Opuść bez zapisu' })).toBeEnabled()
})
```

On save success use the one-shot authorization before navigation:

```tsx
setSavedSnapshot(serializeDraftState(payload.name, payload.days))
leaveGuard.reset()
leaveGuard.allowNextNavigation()
navigate('/templates')
```

Render the dialog from blocker state:

```tsx
{leaveGuard.blocked && (
  <ConfirmDialog
    title={saving ? 'Zapis w toku' : 'Opuścić edytor?'}
    message={saving
      ? 'Poczekaj na wynik zapisu. Po zakończeniu przejdziesz dalej albo będzie można ponowić zapis.'
      : 'Masz niezapisane zmiany w szablonie. Jeśli wyjdziesz teraz, stracisz bieżące poprawki.'}
    confirmLabel={saving ? 'Zapisuję...' : 'Opuść bez zapisu'}
    cancelLabel="Zostań"
    danger={!saving}
    confirmDisabled={saving}
    onConfirm={leaveGuard.proceed}
    onCancel={leaveGuard.reset}
  />
)}
```

Convert `TemplateEditorAccessibility.test.tsx` from `MemoryRouter` and mocked `useNavigate` to `createMemoryRouter` + `RouterProvider`, because `useBlocker` requires a Data Router. Keep service mocks and semantic assertions unchanged.

Add a deferred-save test to the same file. Expose `createTemplate` through the existing hoisted `mocks` object, render a `/templates` destination route, then verify that a navigation attempt cannot proceed while the request is pending:

```tsx
it('does not allow leaving while template save is pending', async () => {
  let resolveSave!: () => void
  mocks.createTemplate.mockReturnValue(new Promise((resolve) => { resolveSave = () => resolve(undefined) }))
  renderEditor()

  fireEvent.change(await screen.findByRole('textbox', { name: 'Nazwa' }), {
    target: { value: 'Upper / Lower zmieniony' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz szablon' }))
  fireEvent.click(screen.getByRole('button', { name: 'Wróć' }))

  expect(await screen.findByRole('dialog', { name: 'Zapis w toku' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Zapisuję...' })).toBeDisabled()

  resolveSave()
  expect(await screen.findByText('Lista planów')).toBeInTheDocument()
})

it('keeps the draft dirty and retryable after a failed save', async () => {
  mocks.createTemplate.mockRejectedValueOnce(new Error('write failed'))
  renderEditor()

  const save = await screen.findByRole('button', { name: 'Zapisz szablon' })
  fireEvent.click(save)
  await waitFor(() => expect(save).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Wróć' }))

  expect(await screen.findByRole('dialog', { name: 'Opuścić edytor?' })).toBeInTheDocument()
})
```

`renderEditor()` in this test file must create a memory router with `/templates/new?draft=ai` and `/templates` (`<p>Lista planów</p>`). Expose `createTemplate` through the existing hoisted `mocks` object, use it from the `templateService` mock, reset it in `beforeEach`, and add `waitFor` to the Testing Library imports.

- [ ] **Step 5: Run focused unit and E2E tests**

Run the Step 2 commands again.

Expected: all focused tests PASS; `BottomNav` and history back both show the same accessible dialog; „Zostań” preserves the draft.

- [ ] **Step 6: Commit**

```bash
git add src/components/ConfirmDialog.tsx src/pages/TemplateEditorPage.tsx src/pages/__tests__/SharedAccessibilityContracts.test.tsx src/pages/__tests__/TemplateEditorAccessibility.test.tsx tests/e2e/support/templateDraft.ts tests/e2e/mobile-ergonomics.spec.ts
git commit -m "feat: guard unsaved template edits"
```

---

### Task 4: Persistent TemplateSaveDock and large-plan viewport clearance

**Files:**
- Create: `src/components/TemplateSaveDock.tsx`
- Create: `src/components/__tests__/TemplateSaveDock.test.tsx`
- Modify: `src/pages/TemplateEditorPage.tsx:530-550`
- Modify: `src/index.css:4412-4675`
- Modify: `tests/e2e/mobile-ergonomics.spec.ts`

**Interfaces:**
- Consumes: `hasUnsavedChanges`, `saving`, `isEdit`, CSS variable `--mobile-viewport-bottom-inset` from Task 2.
- Produces:

```ts
export interface TemplateSaveDockProps {
  dirty: boolean
  saving: boolean
  isEdit: boolean
}
```

- [ ] **Step 1: Write failing dock state tests**

Create `src/components/__tests__/TemplateSaveDock.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import TemplateSaveDock from '../TemplateSaveDock'

describe('TemplateSaveDock', () => {
  it('stays visible but disables submit when the draft is clean', () => {
    render(<TemplateSaveDock dirty={false} saving={false} isEdit={false} />)
    expect(screen.getByTestId('template-save-dock')).toHaveAttribute('data-state', 'clean')
    expect(screen.getByRole('button', { name: 'Zapisano' })).toBeDisabled()
  })

  it('uses create and edit labels for dirty drafts', () => {
    const view = render(<TemplateSaveDock dirty saving={false} isEdit={false} />)
    expect(screen.getByRole('button', { name: 'Zapisz szablon' })).toBeEnabled()
    view.rerender(<TemplateSaveDock dirty saving={false} isEdit />)
    expect(screen.getByRole('button', { name: 'Zapisz zmiany' })).toBeEnabled()
  })

  it('prevents duplicate submit while saving', () => {
    render(<TemplateSaveDock dirty saving isEdit />)
    expect(screen.getByRole('button', { name: 'Zapisuję...' })).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm run test:unit -- src/components/__tests__/TemplateSaveDock.test.tsx
```

Expected: FAIL because `TemplateSaveDock` does not exist.

- [ ] **Step 3: Implement TemplateSaveDock**

Create `src/components/TemplateSaveDock.tsx`:

```tsx
import { Check, Pencil } from 'lucide-react'

export interface TemplateSaveDockProps {
  dirty: boolean
  saving: boolean
  isEdit: boolean
}

export default function TemplateSaveDock({ dirty, saving, isEdit }: TemplateSaveDockProps) {
  const state = saving ? 'saving' : dirty ? 'dirty' : 'clean'
  const label = saving ? 'Zapisuję...' : !dirty ? 'Zapisano' : isEdit ? 'Zapisz zmiany' : 'Zapisz szablon'

  return (
    <div className="template-save-dock" data-state={state} data-testid="template-save-dock">
      <div className="template-save-dock-panel">
        <span className="template-save-dock-status" role="status" aria-live="polite">
          {saving ? 'Trwa zapis' : dirty ? 'Niezapisane zmiany' : 'Wszystkie zmiany zapisane'}
        </span>
        <button
          type="submit"
          disabled={!dirty || saving}
          className="planner-primary-action mobile-touch-target disabled:opacity-60"
        >
          {dirty || saving ? <Pencil size={15} aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}
          {label}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Integrate mobile dock and keep desktop actions in flow**

Inside the form:

```tsx
<div className="template-editor-bottom-actions">
  <motion.button type="button" onClick={addDay} className="planner-secondary-action template-editor-mobile-add-day mobile-touch-target">
    <Plus size={15} />
    Dodaj dzień
  </motion.button>
  <motion.button
    type="submit"
    disabled={saving}
    className="planner-primary-action template-editor-desktop-save disabled:opacity-60"
  >
    <Pencil size={15} />
    {saving ? 'Zapisuję...' : isEdit ? 'Zapisz zmiany' : 'Zapisz szablon'}
  </motion.button>
</div>
<TemplateSaveDock dirty={hasUnsavedChanges} saving={saving} isEdit={isEdit} />
```

Add mobile CSS under `@media (max-width: 1023px)`:

```css
.template-save-dock { display: none; }

@media (max-width: 1023px) {
  .template-editor-form {
    padding-bottom: calc(12rem + env(safe-area-inset-bottom, 0px));
  }

  .template-editor-desktop-save { display: none; }

  .template-save-dock {
    position: fixed;
    left: max(0.5rem, env(safe-area-inset-left, 0px));
    right: max(0.5rem, env(safe-area-inset-right, 0px));
    bottom: calc(var(--mobile-viewport-bottom-inset, 0px) + 5.9rem + env(safe-area-inset-bottom, 0px));
    z-index: 46;
    display: flex;
    justify-content: center;
    transition: bottom 180ms ease;
  }

  body:has(.bottom-nav[aria-hidden="true"]) .template-save-dock {
    bottom: calc(var(--mobile-viewport-bottom-inset, 0px) + 0.75rem + env(safe-area-inset-bottom, 0px));
  }

  .template-save-dock-panel {
    display: flex;
    width: min(100%, 24rem);
    align-items: center;
    gap: 0.75rem;
    padding: 0.65rem;
    border: 1px solid rgba(244, 241, 242, 0.12);
    border-radius: var(--radius-sm);
    background: rgba(18, 17, 20, 0.98);
    box-shadow: 0 -12px 36px rgba(0, 0, 0, 0.42);
  }

  .template-save-dock-status {
    flex: 1;
    color: var(--muted);
    font-size: 0.7rem;
    line-height: 1.25;
  }

  .template-editor-form input {
    scroll-margin-top: 7.5rem;
    scroll-margin-bottom: calc(var(--mobile-viewport-bottom-inset, 0px) + 6rem);
  }
}
```

Remove the old `@media (max-width: 520px)` sticky positioning from `.template-editor-bottom-actions`; it returns to normal document flow.

- [ ] **Step 5: Add large-plan geometry tests**

Extend `tests/e2e/mobile-ergonomics.spec.ts`:

```ts
for (const width of [320, 375, 390]) {
  test(`keeps the save dock visible without horizontal overflow at ${width}px`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only contract')
    await page.setViewportSize({ width, height: 844 })
    await openLargeTemplateDraft(page)

    const dock = page.getByTestId('template-save-dock')
    await expect(dock).toBeVisible()
    const dockBox = await dock.boundingBox()
    expect(dockBox).not.toBeNull()
    expect(dockBox!.y + dockBox!.height).toBeLessThanOrEqual(844)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
  })
}

test('keeps the dock and focused input separated at 150% text and reduced viewport', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile-only contract')
  await page.setViewportSize({ width: 320, height: 844 })
  await openLargeTemplateDraft(page)
  await page.evaluate(() => { document.documentElement.style.fontSize = '150%' })

  const input = page.locator('input[type="number"]').last()
  await input.focus()
  await page.setViewportSize({ width: 320, height: 500 })
  await input.scrollIntoViewIfNeeded()

  const inputBox = await input.boundingBox()
  const dockBox = await page.getByTestId('template-save-dock').boundingBox()
  expect(inputBox).not.toBeNull()
  expect(dockBox).not.toBeNull()
  expect(inputBox!.y + inputBox!.height).toBeLessThanOrEqual(dockBox!.y)
})
```

- [ ] **Step 6: Run focused unit and mobile geometry tests**

Run:

```bash
npm run test:unit -- src/components/__tests__/TemplateSaveDock.test.tsx src/pages/__tests__/TemplateEditorAccessibility.test.tsx
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e firebase emulators:exec --only auth,firestore --project demo-ironlog "npx playwright test tests/e2e/mobile-ergonomics.spec.ts --project=mobile"
```

Expected: all PASS; dock visible in first viewport; no horizontal overflow; focused input ends above dock at 500 px.

- [ ] **Step 7: Commit**

```bash
git add src/components/TemplateSaveDock.tsx src/components/__tests__/TemplateSaveDock.test.tsx src/pages/TemplateEditorPage.tsx src/index.css tests/e2e/mobile-ergonomics.spec.ts
git commit -m "feat: keep template save action visible"
```

---

### Task 5: 44×44 mobile touch-target contract

**Files:**
- Modify: `src/index.css:4183-4241, 4788-4815, 7198-7244`
- Modify: `src/components/BottomNav.tsx:17-38, 145-227`
- Modify: `src/components/ExercisePicker.tsx:70-122`
- Modify: `src/pages/ExercisesPage.tsx:223-248, 347-363`
- Modify: `src/pages/HistoryPage.tsx:243-305`
- Modify: `src/pages/ProgressPage.tsx:432-443`
- Modify: `src/pages/ChatPage.tsx:587-653, 733-749`
- Modify: `src/pages/WorkoutPage.tsx:70-95`
- Modify: `tests/e2e/mobile-ergonomics.spec.ts`

**Interfaces:**
- Consumes: existing semantic buttons and `mobile-touch-target` used by `TemplateSaveDock`.
- Produces: reusable CSS class `.mobile-touch-target`; all listed controls expose non-overlapping 44×44 px hitboxes below 1024 px.

- [ ] **Step 1: Add failing E2E hitbox assertions**

Add a shared helper in `tests/e2e/mobile-ergonomics.spec.ts`:

```ts
import { test, expect, type Locator } from './fixtures'
import { discardActiveSession } from './support/accountCleanup'

async function expectMinHitArea(locator: Locator, label: string) {
  const box = await locator.boundingBox()
  expect(box, `${label} should be visible`).not.toBeNull()
  expect(Math.round(box!.width), `${label} width`).toBeGreaterThanOrEqual(44)
  expect(Math.round(box!.height), `${label} height`).toBeGreaterThanOrEqual(44)
}
```

Add tests for the known failures:

```ts
test('exposes 44px BottomNav, picker and template-editor targets at 320px', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile-only contract')
  await page.setViewportSize({ width: 320, height: 844 })
  await openLargeTemplateDraft(page)

  const navBoxes = []
  for (const label of ['Start', 'Postępy', 'Plany', 'Ćwiczenia', 'Rozpocznij nowy trening', 'Historia', 'AI']) {
    const item = page.getByRole('button', { name: label, exact: true })
    await expectMinHitArea(item, `BottomNav ${label}`)
    navBoxes.push((await item.boundingBox())!)
  }
  for (let index = 1; index < navBoxes.length; index += 1) {
    expect(navBoxes[index].x).toBeGreaterThanOrEqual(navBoxes[index - 1].x + navBoxes[index - 1].width)
  }
  await expectMinHitArea(page.getByRole('button', { name: /Usuń ćwiczenie Bench Press/ }).first(), 'template delete')

  await page.getByRole('button', { name: 'Dodaj ćwiczenie' }).first().click()
  const picker = page.getByRole('dialog', { name: /Wybierz ćwiczenie/ })
  await expectMinHitArea(picker.getByRole('button', { name: 'Zamknij wybór ćwiczenia' }), 'picker close')
  await expectMinHitArea(picker.getByRole('button', { name: 'Wszystkie' }), 'picker category')
})
```

- [ ] **Step 2: Run the mobile test and verify RED**

Run:

```bash
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e firebase emulators:exec --only auth,firestore --project demo-ironlog "npx playwright test tests/e2e/mobile-ergonomics.spec.ts --project=mobile"
```

Expected: FAIL on current 22–42 px targets.

- [ ] **Step 3: Add the shared target utility and compact BottomNav geometry**

Add to `src/index.css`:

```css
@media (max-width: 1023px) {
  .mobile-touch-target {
    min-width: 2.75rem;
    min-height: 2.75rem;
    touch-action: manipulation;
  }

  .planner-primary-action,
  .planner-secondary-action,
  .planner-icon-action,
  .exercise-filter-chip,
  .progress-range-button,
  .rest-timer-action {
    min-height: 2.75rem;
  }

  .planner-icon-action {
    width: 2.75rem;
    height: 2.75rem;
  }
}

@media (max-width: 420px) {
  .bottom-nav { padding-inline: 0.25rem !important; }
  .bottom-nav-panel { gap: 0; padding-inline: 0.125rem; }
  .bottom-nav-button { flex: 1 1 2.75rem; min-width: 2.75rem; }
  .bottom-nav-button > span:first-of-type { font-size: 0.5rem; letter-spacing: -0.02em; }
  .bottom-nav-primary-action { margin-inline: 0; min-width: 2.75rem; min-height: 2.75rem; }
}
```

Apply these exact class changes:

| File / control | Required class change |
|---|---|
| `BottomNav.tsx` regular tab | append `mobile-touch-target` |
| `BottomNav.tsx` central plus | append `bottom-nav-primary-action mobile-touch-target`, remove `mx-1.5` |
| `ExercisePicker.tsx` close | replace `h-8 w-8` with `h-11 w-11 mobile-touch-target` |
| `ExercisePicker.tsx` category | append `mobile-touch-target` |
| `ExercisesPage.tsx` muscle/form and library chips | append `mobile-touch-target` |
| `HistoryPage.tsx` range/category/clear search | append `mobile-touch-target` |
| `ProgressPage.tsx` `.progress-range-button` | append `mobile-touch-target` |
| `ChatPage.tsx` interactive `.coach-chip-row` buttons | append `mobile-touch-target` |
| `WorkoutPage.tsx` workout-type chips | append `mobile-touch-target` |

Do not add the class to non-interactive badges such as the preview label „Dzień N”.

- [ ] **Step 4: Add route-level target coverage for filters**

Extend the same E2E file to visit `/exercises`, `/history`, `/progress`, `/chat` and `/workout/new`, asserting the first visible filter/chip on each route has both dimensions ≥44. For `/workout/new`, register `cleanup.add('discard active session', () => discardActiveSession(page))` before creating or resuming a session.

Use role/name locators, not CSS-only locators, for example:

```ts
await page.goto('/progress')
await expectMinHitArea(page.getByRole('button', { name: '30 dni' }), 'progress range')

await page.goto('/history')
await expectMinHitArea(page.getByRole('button', { name: 'Wszystko' }).first(), 'history range')
```

- [ ] **Step 5: Run targeted accessibility and ergonomics gates**

Run:

```bash
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e firebase emulators:exec --only auth,firestore --project demo-ironlog "npx playwright test tests/e2e/mobile-ergonomics.spec.ts tests/e2e/accessibility.spec.ts --project=mobile"
```

Expected: all target assertions PASS at 320 px; hidden-nav accessibility remains unchanged; no horizontal overflow.

- [ ] **Step 6: Commit**

```bash
git add src/index.css src/components/BottomNav.tsx src/components/ExercisePicker.tsx src/pages/ExercisesPage.tsx src/pages/HistoryPage.tsx src/pages/ProgressPage.tsx src/pages/ChatPage.tsx src/pages/WorkoutPage.tsx tests/e2e/mobile-ergonomics.spec.ts
git commit -m "fix: enlarge mobile touch targets"
```

---

### Task 6: Compact rest timer above focused workout inputs

**Files:**
- Modify: `src/pages/WorkoutPage.tsx:176-270, 869-904, 1276-1287`
- Modify: `src/index.css:5163-5180, 5590-5604, 7011-7085`
- Modify: `tests/e2e/workout-mobile.spec.ts:208-268`

**Interfaces:**
- Consumes: `useMobileInteraction().compactFixedUi` from Task 2.
- Produces: `RestTimerBarProps.variant: 'full' | 'compact'`; `.workout-mobile-action-bar[data-variant]` geometry.

- [ ] **Step 1: Extend the existing workout E2E with a failing compact-mode contract**

In the current test `mobile workout shows steppers only for the focused incomplete set and keeps controls tappable`, after the full timer assertions add:

```ts
const weightInput = page.locator('.workout-set-row').first().locator('input').nth(0)
await weightInput.focus()
await page.setViewportSize({ width: 390, height: 500 })
await expect(actionBar).toHaveAttribute('data-variant', 'compact')
await expect(actionBar.getByRole('button', { name: 'Dodaj 30 sekund' })).toHaveCount(0)
await expect(actionBar.getByRole('button', { name: 'Pomiń przerwę' })).toBeVisible()

const compactBox = await actionBar.boundingBox()
const inputBox = await weightInput.boundingBox()
expect(compactBox).not.toBeNull()
expect(inputBox).not.toBeNull()
expect(inputBox!.y).toBeGreaterThanOrEqual(compactBox!.y + compactBox!.height)
expect(inputBox!.y + inputBox!.height).toBeLessThanOrEqual(500)

await weightInput.blur()
await page.setViewportSize({ width: 390, height: 844 })
await expect(actionBar).toHaveAttribute('data-variant', 'full')
await expect(actionBar.getByRole('button', { name: 'Dodaj 30 sekund' })).toBeVisible()
```

- [ ] **Step 2: Run the focused workout test and verify RED**

Run:

```bash
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e firebase emulators:exec --only auth,firestore --project demo-ironlog "npx playwright test tests/e2e/workout-mobile.spec.ts --project=mobile --grep 'steppers only'"
```

Expected: FAIL because the timer remains full and fixed at the bottom.

- [ ] **Step 3: Add the compact presentation without duplicating timer state**

Extend the local props:

```tsx
interface RestTimerBarProps {
  rest: RestTimerState
  onAddTime: (deltaSec: number) => void
  onSkip: () => void
  variant?: 'full' | 'compact'
}

function RestTimerBar({ rest, onAddTime, onSkip, variant = 'full' }: RestTimerBarProps) {
  // Keep the existing now/firedRef/onSkipRef state and effects above this return unchanged.
  return (
    <motion.div
      key="rest-timer-bar"
      initial={{ opacity: 0, height: 0, marginBottom: 0 }}
      animate={{ opacity: 1, height: 'auto', marginBottom: variant === 'full' ? 12 : 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
      className="rest-timer-bar"
      data-finished={restRemainingMs === 0}
      data-variant={variant}
      role="status"
      aria-live={restRemainingMs === 0 ? 'polite' : 'off'}
    >
      <div className="rest-timer-progress" aria-hidden="true">
        <div className="rest-timer-progress-fill" style={{ width: `${restProgress * 100}%` }} />
      </div>
      <div className="rest-timer-content">
        <Timer size={16} strokeWidth={2.2} className="flex-none" />
        <div className="rest-timer-label">
          {restRemainingMs === 0 ? (
            <span>Gotowe — czas na kolejną serię</span>
          ) : (
            <>
              <span style={{ color: 'var(--muted)' }}>Przerwa</span>
              <span className="tabular-nums font-bold ml-2">
                {Math.floor(restRemainingSec / 60)}:{String(restRemainingSec % 60).padStart(2, '0')}
              </span>
            </>
          )}
        </div>
        {restRemainingMs > 0 ? (
          <>
            {variant === 'full' && (
              <button
                type="button"
                onClick={() => onAddTime(30)}
                className="rest-timer-action"
                aria-label="Dodaj 30 sekund"
              >
                +30s
              </button>
            )}
            <button
              type="button"
              onClick={onSkip}
              className="rest-timer-action rest-timer-action--icon"
              aria-label="Pomiń przerwę"
            >
              <X size={14} />
            </button>
          </>
        ) : (
          <button type="button" onClick={onSkip} className="rest-timer-action" aria-label="Zamknij">
            OK
          </button>
        )}
      </div>
    </motion.div>
  )
}
```

In `WorkoutPage`:

```tsx
const { compactFixedUi } = useMobileInteraction()
const mobileRestVariant = compactFixedUi ? 'compact' : 'full'

<div
  className="workout-mobile-action-bar fixed left-0 right-0 flex justify-center px-4 lg:hidden"
  data-variant={mobileRestVariant}
  style={{ paddingBottom: mobileRestVariant === 'full' ? '1rem' : undefined }}
>
  <div className="surface-panel w-full max-w-sm rounded-[var(--radius-xl)] p-3">
    <AnimatePresence initial={false}>
      <RestTimerBar
        rest={rest}
        onAddTime={handleAddRestTime}
        onSkip={handleSkipRest}
        variant={mobileRestVariant}
      />
    </AnimatePresence>
  </div>
</div>
```

Desktop `RestTimerBar` keeps the default `full` variant.

- [ ] **Step 4: Implement compact geometry and input clearance**

Add/adjust CSS:

```css
.workout-mobile-action-bar[data-variant="compact"] {
  top: calc(var(--workout-mobile-lifecycle-bar-height) + 0.5rem);
  bottom: auto;
  padding-bottom: 0;
}

.workout-mobile-action-bar[data-variant="compact"] > .surface-panel {
  padding: 0.35rem;
}

.rest-timer-bar[data-variant="compact"] .rest-timer-content {
  min-height: 2.75rem;
  padding: 0.35rem 0.65rem;
}

.rest-timer-bar[data-variant="compact"] .rest-timer-progress {
  height: 2px;
}

@media (max-width: 1023px) {
  .workout-focus-shell:has(.workout-mobile-action-bar[data-variant="compact"]) .workout-session-grid {
    padding-top: calc(var(--workout-mobile-lifecycle-bar-height) + 4rem);
    padding-bottom: max(7.5rem, calc(6.5rem + env(safe-area-inset-bottom, 0px)));
  }

  .workout-set-row input {
    scroll-margin-top: calc(var(--workout-mobile-lifecycle-bar-height) + 4.5rem);
    scroll-margin-bottom: calc(var(--mobile-viewport-bottom-inset, 0px) + 1rem);
  }
}
```

Do not reset `rest.startedAt`, `rest.totalSec`, `now` or `firedRef` when changing the variant.

- [ ] **Step 5: Run focused and full workout-mobile tests**

Run:

```bash
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e firebase emulators:exec --only auth,firestore --project demo-ironlog "npx playwright test tests/e2e/workout-mobile.spec.ts --project=mobile"
```

Expected: all mobile workout tests PASS; full timer remains above nav, compact timer remains below lifecycle header, focused input remains below compact timer and no timer state resets.

- [ ] **Step 6: Commit**

```bash
git add src/pages/WorkoutPage.tsx src/index.css tests/e2e/workout-mobile.spec.ts
git commit -m "fix: compact rest timer around mobile keyboard"
```

---

### Task 7: Full verification, runtime review and canonical closure

**Files:**
- Modify: `docs/roadmap/ROADMAP.md`
- Modify: `docs/roadmap/specs/2026-07-14-phase-4-mobile-ergonomics-template-editor-design.md`
- Modify: `docs/roadmap/plans/2026-07-14-phase-4-mobile-ergonomics-template-editor.md`

**Interfaces:**
- Consumes: completed Tasks 1–6 and all acceptance criteria from the approved spec.
- Produces: verified Phase 4 `DONE` state, recorded commands/results and handoff to the next roadmap phase without changing `RELEASE-08`.

- [ ] **Step 1: Run the focused Phase 4 unit suite**

Run:

```bash
npm run test:unit -- src/hooks/__tests__/useUnsavedChangesGuard.test.tsx src/components/__tests__/MobileInteractionProvider.test.tsx src/components/__tests__/TemplateSaveDock.test.tsx src/pages/__tests__/TemplateEditorAccessibility.test.tsx src/pages/__tests__/SharedAccessibilityContracts.test.tsx
```

Expected: all focused files and tests PASS with no React `act` warnings.

- [ ] **Step 2: Run full unit, lint and build gates**

Run:

```bash
npm run test:unit
npm run lint
npm run build
```

Expected: all commands exit 0; build may show only the already known chunk-size advisory.

- [ ] **Step 3: Run isolated Phase 4 browser gates**

Run:

```bash
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e firebase emulators:exec --only auth,firestore --project demo-ironlog "npx playwright test tests/e2e/mobile-ergonomics.spec.ts tests/e2e/workout-mobile.spec.ts tests/e2e/accessibility.spec.ts tests/e2e/smoke.spec.ts tests/e2e/protected-shell.spec.ts tests/e2e/templates.spec.ts --project=desktop --project=mobile"
```

Expected: all selected mobile tests PASS; cleanup reports no active session or template residue.

- [ ] **Step 4: Perform visible runtime review on the test account**

Start the complete localhost stack and inspect with Playwright at 320/375/390 px:

```bash
npm run dev:all
```

Verify and record in the plan:

1. dock is visible in the first viewport of `Upper / Lower 4×`;
2. clean/dirty/saving labels match the spec;
3. `BottomNav`, browser back and „Wróć” show the same dirty dialog;
4. 150% text produces no horizontal overflow;
5. focused last input at 500 px ends above the dock;
6. workout timer moves `full → compact → full` without covering input;
7. all measured target boxes are at least 44×44 px.

Expected: no visual regression, overlap, inaccessible action or unclean test-account state. Playwright evidence belongs in ignored test output, not in Git.

- [ ] **Step 5: Review the implementation diff**

Run:

```bash
git diff --check
git status --short
git diff --stat
git diff -- src/router/index.tsx src/components/AppLayout.tsx src/components/BottomNav.tsx src/pages/TemplateEditorPage.tsx src/pages/WorkoutPage.tsx src/index.css
```

Expected: no whitespace errors, no senior-design-review changes, no Firestore/API/rules changes and no unrelated files.

- [ ] **Step 6: Update canonical documentation**

Make these exact status changes only after all gates pass:

- roadmap Faza 4: `PLANNED` → `DONE`, with concise runtime evidence;
- spec: `projekt zatwierdzony; szczegółowy plan gotowy do wykonania` → `wdrożona i zweryfikowana`;
- this plan: add `**Status:** COMPLETE` below the title and check every executed checkbox;
- keep Faza 2B and `RELEASE-08` unchanged;
- do not import findings from `docs/audits/2026-07-14-senior-design-review.md`.

- [ ] **Step 7: Run documentation consistency check**

Run:

```bash
rg -n "Faza 4|MOBILE-0[1-6]|DESIGN APPROVED|DONE|RELEASE-08|senior-design-review" docs/roadmap/ROADMAP.md docs/roadmap/specs/2026-07-14-phase-4-mobile-ergonomics-template-editor-design.md docs/roadmap/plans/2026-07-14-phase-4-mobile-ergonomics-template-editor.md
git diff --check
```

Expected: Faza 4 is consistently `DONE`; `MOBILE-01–06` are covered; `RELEASE-08` remains open; senior review remains outside scope.

- [ ] **Step 8: Commit closure documentation**

```bash
git add docs/roadmap/ROADMAP.md docs/roadmap/specs/2026-07-14-phase-4-mobile-ergonomics-template-editor-design.md docs/roadmap/plans/2026-07-14-phase-4-mobile-ergonomics-template-editor.md
git commit -m "docs: close phase 4 mobile ergonomics"
```

## Definition of Done

- [ ] Tasks 1–7 were executed in order with RED/GREEN evidence where specified.
- [ ] `MOBILE-01–06` have observable runtime evidence and regression coverage.
- [ ] The router uses the official Data Router blocker; no custom `popstate` guard exists.
- [ ] Dirty template edits are protected across app navigation, history and unload.
- [ ] Active workout navigation remains warning-free and session persistence remains unchanged.
- [ ] The template save dock is continuously visible on mobile and does not cover focused fields.
- [ ] Rest timer changes presentation without duplicating or resetting timer state.
- [ ] Covered mobile targets measure at least 44×44 px without horizontal overflow at 320 px.
- [ ] Full unit, lint, build and selected browser gates pass.
- [ ] Visible Playwright runtime review passes on the test account.
- [ ] No Firestore, API, rules, production, push, deploy or `RELEASE-08` action occurred.
- [ ] The deferred senior design review was not folded into Phase 4.
- [ ] Roadmap, spec and plan have consistent final statuses.

## Spec Coverage Map

| Requirement | Implemented by | Verified by |
|---|---|---|
| `MOBILE-01` 44×44 targets | Task 5 | `mobile-ergonomics.spec.ts`, existing workout hitbox checks |
| `MOBILE-02` persistent save | Task 4 | dock unit tests + 320/375/390 geometry |
| `MOBILE-03` visual viewport clearance | Tasks 2 and 4 | provider tests + reduced-height editor E2E |
| `MOBILE-04` nav/timer/input coordination | Tasks 2 and 6 | accessibility E2E + workout `full → compact → full` |
| `MOBILE-05` unsaved-change protection | Tasks 1 and 3 | blocker unit tests + BottomNav/browser-back E2E |
| `MOBILE-06` long views and enlarged text | Tasks 4, 5 and 7 | large draft at 320/375/390 and 150% runtime review |
| Data integrity while saving | Tasks 1 and 3 | pending-save unit test + disabled confirm test |
| Router behavior unchanged | Tasks 1 and 7 | desktop/mobile smoke and protected-shell tests |
| Senior review deferred | Tasks 7 and documentation checks | scoped diff review |
