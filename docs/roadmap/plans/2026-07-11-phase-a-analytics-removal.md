# Phase A Analytics Removal Implementation Plan

> **Status: COMPLETED.** Plan wdrożono na branchu `puls-rebrand`; końcowy HEAD fazy A: `6e2c1f3`. Wszystkie bramki i finalny review przeszły. Ten dokument jest historycznym zapisem wykonania — nie należy uruchamiać jego pustych checkboxów ponownie. Aktualny następny krok znajduje się w `docs/roadmap/ROADMAP.md`.

**Goal:** Remove GA4 and Contentsquare/Hotjar completely from the IronLog runtime while preserving the assignment evidence as a clearly historical archive.

**Architecture:** Delete the analytics runtime boundary instead of repairing consent synchronization. Remove every caller, UI surface, dependency, environment variable, CSS rule, test bypass, and CSP exception that exists only for analytics; preserve the four screenshots and replace active README instructions with a historical archive. Keep Vercel environment cleanup outside repository implementation and verify it later under `RELEASE-08`.

**Tech Stack:** React 19, TypeScript, Vite 8, React Router 7, Vitest, Playwright 1.59, npm, Vercel configuration.

## Global Constraints

- Do not introduce replacement analytics, telemetry, session replay, cookies, or a new consent system.
- Preserve unchanged: `docs/screenshots/analytics/ga-overview.png`, `ga-pages.png`, `hotjar-heatmap.png`, and `hotjar-recordings.png`.
- The archive is historical only; it must not contain active setup instructions, IDs, secrets, or claims that analytics still runs.
- Do not add `'use client'`; IronLog is a Vite SPA.
- Do not add a one-time migration for `ironlog.analyticsConsent`; the legacy key becomes inert because no code reads or writes it.
- Do not change the AI rate-limit description; `AI-05` belongs to Phase 6C.
- Do not change Firestore rules, Firebase data, workouts, templates, or the demo account.
- Do not mutate Vercel environment variables during repository implementation. Their removal requires separate authority under `RELEASE-08`.
- Do not read, print, edit, or commit `.env.local` or `.env.test`. Any stale analytics values there become inert after runtime removal; deployment-side cleanup remains `RELEASE-08`.
- Preserve unrelated user changes and the untracked screenshots under `output/playwright/`.
- The full Playwright suite is not a Phase A gate while live Firebase quota remains blocked. The dedicated removal spec is the E2E gate.
- Before isolated-worktree execution, commit or otherwise transfer the approved roadmap and this local plan.
- This plan lives under `docs/roadmap/plans/` because the repository intentionally ignores `docs/superpowers/`.

---

## Execution Precondition

The approved roadmap, README link, and this plan are currently local planning changes. Before creating an isolated worktree or starting Task 1, review and preserve them in one documentation commit:

```bash
git diff --check
git add README.md docs/roadmap/ROADMAP.md docs/roadmap/plans/2026-07-11-phase-a-analytics-removal.md
git commit -m "docs: add canonical audit roadmap"
```

Expected: only those three documentation paths are committed. Do not stage `output/`.

---

## File Map

**Delete:**

- `src/components/AnalyticsConsentBanner.tsx`
- `src/components/AnalyticsListener.tsx`
- `src/lib/analytics.ts`
- `src/lib/analyticsConsent.ts`
- `src/lib/__tests__/analyticsConsent.test.ts`
- `tests/e2e/consent.spec.ts`

**Create:**

- `tests/e2e/analytics-removal.spec.ts`
- `src/pages/__tests__/ProfilePage.test.tsx`
- `docs/archive/analytics-assignment.md`

**Modify:**

- `src/main.tsx`
- `src/router/index.tsx`
- `src/pages/ProfilePage.tsx`
- `src/index.css`
- `tests/e2e/global.setup.ts`
- `package.json`
- `package-lock.json`
- `.env.example`
- `vercel.json`
- `README.md`
- `docs/roadmap/ROADMAP.md`
- `WORKING_CONTEXT.md` and `docs/audits/audit-log.md` through `memory-save` only

---

## Roadmap Coverage

| Roadmap item | Implemented by |
|---|---|
| `ANALYTICS-01` runtime initialization/listener removal | Task 1 |
| `ANALYTICS-02` banner/profile UI removal | Task 1 |
| `ANALYTICS-03` consent API, tests, CSS, and setup removal | Tasks 1–2 |
| `ANALYTICS-04` packages and environment contract removal | Task 2 |
| `ANALYTICS-05` vendor-origin removal from CSP | Task 2 |
| `ANALYTICS-06` current-product documentation | Task 3 |
| `ANALYTICS-07` preserved assignment evidence | Task 3 |
| Phase A automated gates and `DONE` transition | Task 4 |
| Vercel environment cleanup | Excluded from repo work; remains `RELEASE-08` |
| CSP enforcement/reporting decision | Excluded; remains Phase S |

---

### Task 1: Remove analytics runtime behavior and consent UI

**Files:**

- Create: `tests/e2e/analytics-removal.spec.ts`
- Create: `src/pages/__tests__/ProfilePage.test.tsx`
- Modify: `src/main.tsx`
- Modify: `src/router/index.tsx`
- Modify: `src/pages/ProfilePage.tsx`
- Delete: `src/components/AnalyticsConsentBanner.tsx`
- Delete: `src/components/AnalyticsListener.tsx`
- Delete: `src/lib/analytics.ts`
- Delete: `src/lib/analyticsConsent.ts`
- Delete: `src/lib/__tests__/analyticsConsent.test.ts`
- Delete: `tests/e2e/consent.spec.ts`

**Interfaces:**

- Consumes: existing `AppRouter`, `ProfilePage`, and public `/login`.
- Produces: no analytics initialization, consent UI, route listener, or consent API; a hermetic profile DOM test and public browser spec become the gates.

- [ ] **Step 1: Add the failing browser contract**

Create `tests/e2e/analytics-removal.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test'

const ANALYTICS_VENDOR = /(?:google-analytics\.com|googletagmanager\.com|contentsquare\.net|hotjar\.com|hotjar\.io)/i

test.use({ storageState: { cookies: [], origins: [] } })

function captureAnalyticsRequests(page: Page): string[] {
  const requests: string[] = []
  page.on('request', (request) => {
    if (ANALYTICS_VENDOR.test(request.url())) requests.push(request.url())
  })
  return requests
}

test('public app has no analytics consent UI or vendor requests', async ({ page }) => {
  const analyticsRequests = captureAnalyticsRequests(page)
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto('/login')

  await expect(page.getByRole('button', { name: 'Zaloguj się' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Zgoda na analitykę' })).toHaveCount(0)
  expect(analyticsRequests).toEqual([])
})
```

Create `src/pages/__tests__/ProfilePage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import ProfilePage from '../ProfilePage'

const { setProfile } = vi.hoisted(() => ({ setProfile: vi.fn() }))

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({ user: { uid: 'user-1' } }),
}))

vi.mock('../../store/profileStore', () => ({
  useProfileStore: () => ({
    profile: {
      displayName: 'Jan',
      weeklyGoal: 4,
      primaryGoal: 'hypertrophy',
      units: 'kg',
      createdAt: 1,
    },
    setProfile,
  }),
}))

vi.mock('../../lib/userProfile', () => ({
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn() }
})

vi.mock('framer-motion', async () => {
  const { createElement } = await vi.importActual<typeof import('react')>('react')

  return {
    motion: new Proxy({}, {
      get: (_target, tag: string | symbol) => {
        if (typeof tag !== 'string') return undefined

        return ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => {
          const domProps = { ...props }
          delete domProps.initial
          delete domProps.animate
          delete domProps.transition
          return createElement(tag, domProps, children)
        }
      },
    }),
  }
})

describe('ProfilePage analytics removal', () => {
  it('renders profile settings without analytics consent controls', () => {
    render(<ProfilePage />)

    expect(screen.getByRole('heading', { name: 'Twój profil.' })).toBeInTheDocument()
    expect(screen.queryByText('Akceptuję analitykę')).not.toBeInTheDocument()
    expect(screen.queryByText('Tylko niezbędne')).not.toBeInTheDocument()
    expect(screen.queryByText(/GA4|Contentsquare|Hotjar/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Prove the current app violates the contract**

Run:

```bash
npx vitest run src/pages/__tests__/ProfilePage.test.tsx
npx playwright test tests/e2e/analytics-removal.spec.ts --project=desktop --no-deps
```

Expected: both commands FAIL because the profile controls and public consent region still exist. Neither command requires live Firebase authentication.

- [ ] **Step 3: Remove analytics from `src/main.tsx`**

Replace the file with:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import { Toaster } from 'sonner'
import './index.css'
import AppRouter from './router'
import { initAuthListener } from './lib/auth'

initAuthListener()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <AppRouter />
      <Toaster
        containerAriaLabel="Powiadomienia"
        theme="dark"
        position="top-center"
        toastOptions={{
          style: {
            background: 'var(--card)',
            border: '1px solid var(--border)',
            color: 'var(--text-strong)',
            fontFamily: 'Instrument Sans, sans-serif',
          },
        }}
      />
    </MotionConfig>
  </StrictMode>,
)
```

- [ ] **Step 4: Remove the router listener**

Apply:

```diff
-import AnalyticsListener from '../components/AnalyticsListener'
```

and:

```diff
   return (
     <BrowserRouter>
-      <AnalyticsListener />
       <RouteScrollReset />
```

- [ ] **Step 5: Remove profile consent state and controls**

Apply to `src/pages/ProfilePage.tsx`:

```diff
-import { setAnalyticsConsentPreference } from '../lib/analytics'
-import { getAnalyticsConsent, type AnalyticsConsent } from '../lib/analyticsConsent'
```

```diff
-  const [analyticsConsent, setAnalyticsConsentState] = useState<AnalyticsConsent | null>(() => getAnalyticsConsent())
```

```diff
-  function handleAnalyticsConsentChange(consent: AnalyticsConsent) {
-    setAnalyticsConsentPreference(consent)
-    setAnalyticsConsentState(consent)
-    toast.success(consent === 'granted' ? 'Analityka włączona' : 'Analityka ograniczona do niezbędnej')
-  }
```

Delete the complete JSX privacy block at current lines 275–312. After deletion, the units control is followed directly by the existing submit `<Button type="submit" ...>`.

- [ ] **Step 6: Delete obsolete modules and tests**

Delete:

```text
src/components/AnalyticsConsentBanner.tsx
src/components/AnalyticsListener.tsx
src/lib/analytics.ts
src/lib/analyticsConsent.ts
src/lib/__tests__/analyticsConsent.test.ts
tests/e2e/consent.spec.ts
```

- [ ] **Step 7: Verify runtime removal**

Run:

```bash
rg -n "AnalyticsConsentBanner|AnalyticsListener|initAnalytics|trackPageView|setAnalyticsConsentPreference|getAnalyticsConsent" src tests/e2e
```

Expected: exit 1, no matches.

Run:

```bash
npx vitest run src/pages/__tests__/ProfilePage.test.tsx
npx playwright test tests/e2e/analytics-removal.spec.ts --project=desktop --no-deps
```

Expected: the profile test and the single public Playwright case pass without running the auth setup project.

- [ ] **Step 8: Commit runtime removal**

```bash
git add src/main.tsx src/router/index.tsx src/pages/ProfilePage.tsx src/pages/__tests__/ProfilePage.test.tsx tests/e2e/analytics-removal.spec.ts
git add -u src/components/AnalyticsConsentBanner.tsx src/components/AnalyticsListener.tsx
git add -u src/lib/analytics.ts src/lib/analyticsConsent.ts src/lib/__tests__/analyticsConsent.test.ts
git add -u tests/e2e/consent.spec.ts
git commit -m "refactor: remove runtime analytics integration"
```

Do not stage `output/`.

---

### Task 2: Remove dependencies, configuration, CSS, and E2E bypasses

**Files:**

- Modify: `package.json`, `package-lock.json`, `.env.example`, `vercel.json`, `src/index.css`, `tests/e2e/global.setup.ts`

**Interfaces:**

- Consumes: Task 1 with no analytics imports.
- Produces: no analytics package, environment variable, CSP origin, banner style, or setup bypass.

- [ ] **Step 1: Capture the red cleanup baseline**

Run:

```bash
rg -n "react-ga4|@hotjar/browser|VITE_GA_MEASUREMENT_ID|VITE_CSQ_TAG_ID|VITE_HOTJAR_SITE_ID|google-analytics|googletagmanager|contentsquare|analytics-consent-banner|ironlog.analyticsConsent" package.json package-lock.json .env.example vercel.json src/index.css tests/e2e/global.setup.ts
```

Expected: matches across the cleanup surfaces.

- [ ] **Step 2: Remove packages and regenerate the lockfile**

```bash
npm uninstall @hotjar/browser react-ga4
```

Expected: both dependencies and their lockfile entries disappear.

- [ ] **Step 3: Replace `.env.example`**

```dotenv
# Firebase (konsola Firebase -> Project settings -> Web app)
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

- [ ] **Step 4: Remove vendor origins without hardening CSP mode**

Keep `Content-Security-Policy-Report-Only`; replace only its value in `vercel.json`:

```json
"default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; frame-ancestors 'none'"
```

Do not enforce CSP here; that belongs to Phase S.

- [ ] **Step 5: Delete banner-specific CSS**

Delete the complete current block from `.analytics-consent-banner {` through the closing desktop media query. The surrounding result must be:

```css
a {
  color: inherit;
}

::selection {
  background: rgba(240, 67, 90, 0.24);
}
```

- [ ] **Step 6: Remove the obsolete E2E consent write**

Delete from `tests/e2e/global.setup.ts`:

```diff
-  // Keep consent UI out of authenticated test flows. Consent has its own public-route spec.
-  await page.evaluate(() => window.localStorage.setItem('ironlog.analyticsConsent', 'denied'))
-
```

Keep Firebase token flush and `storageState` unchanged.

- [ ] **Step 7: Verify cleanup and build health**

Run:

```bash
rg -n "react-ga4|@hotjar/browser|VITE_GA_MEASUREMENT_ID|VITE_CSQ_TAG_ID|VITE_HOTJAR_SITE_ID|google-analytics|googletagmanager|contentsquare|analytics-consent-banner|ironlog.analyticsConsent" package.json package-lock.json .env.example vercel.json src/index.css tests/e2e/global.setup.ts
```

Expected: exit 1, no matches.

Run:

```bash
npm run lint
npm run test:unit
npm run build
```

Expected: lint passes, all remaining unit tests pass, and build succeeds. Existing chunk-size advisory is acceptable.

- [ ] **Step 8: Commit cleanup**

```bash
git add package.json package-lock.json .env.example vercel.json src/index.css tests/e2e/global.setup.ts
git commit -m "chore: remove analytics configuration"
```

---

### Task 3: Preserve assignment evidence as a historical archive

**Files:**

- Create: `docs/archive/analytics-assignment.md`
- Modify: `README.md`
- Preserve: `docs/screenshots/analytics/*.png`

**Interfaces:**

- Consumes: four existing analytics screenshots.
- Produces: truthful current-product documentation and one historical archive page.

- [ ] **Step 1: Create the archive document**

Create `docs/archive/analytics-assignment.md`:

```markdown
# Integracja analityki — archiwum zaliczenia

Status: **materiał historyczny; analityka nie jest częścią aktualnego runtime IronLog**.

Na potrzeby zaliczenia projektu aplikacja miała działającą integrację Google Analytics 4 oraz Hotjar/Contentsquare uruchamianą po zgodzie użytkownika. Integracja obejmowała pageview dla nawigacji SPA, session replay/heatmapę oraz interfejs wyboru zgody.

Po zakończeniu wymagania zaliczeniowego integracja została usunięta z produktu, aby ograniczyć zewnętrzne skrypty, złożoność prywatności i niepotrzebny kod. Poniższe obrazy pozostają dowodem wykonania wcześniejszego zakresu; nie są instrukcją konfiguracji aktualnej aplikacji.

## Google Analytics 4

![Google Analytics — przegląd](../screenshots/analytics/ga-overview.png)

![Google Analytics — strony](../screenshots/analytics/ga-pages.png)

## Hotjar / Contentsquare

![Hotjar — heatmapa](../screenshots/analytics/hotjar-heatmap.png)

![Hotjar — nagrania sesji](../screenshots/analytics/hotjar-recordings.png)
```

- [ ] **Step 2: Update README**

Make these exact changes:

1. Delete the Stack bullet `Analityka opcjonalna po zgodzie...`.
2. Change the structure comment to `lib/          # serwisy: Firebase, auth, logika Firestore`.
3. Delete active sections `## Google Analytics` and `## Hotjar (Contentsquare)` including screenshots and setup text.
4. Replace `## Prywatność i zgoda` with:

```markdown
## Prywatność

Klucz Claude w modelu BYOK jest przechowywany lokalnie w przeglądarce. Nie zapisujemy go w Firestore; backend serverless używa go tylko do obsłużenia bieżącego zapytania do Anthropic.
```

5. Replace local setup copy with:

```markdown
Wymagane zmienne środowiskowe — patrz `.env.example`. Konfiguracja Firebase pochodzi z konsoli Firebase (Project settings → Web app).
```

6. Add after the Roadmap section:

```markdown
## Archiwum zaliczenia

Historyczne materiały potwierdzające wcześniejszą integrację GA4 i Hotjar/Contentsquare znajdują się w [archiwum integracji analityki](docs/archive/analytics-assignment.md). Analityka nie jest częścią aktualnego runtime aplikacji.
```

Do not change the AI rate-limit paragraph.

- [ ] **Step 3: Verify documentation and evidence**

Run:

```bash
rg -n "Analityka opcjonalna|## Google Analytics|## Hotjar|VITE_GA_MEASUREMENT_ID|VITE_CSQ_TAG_ID|VITE_HOTJAR_SITE_ID" README.md .env.example
```

Expected: exit 1, no matches.

Run:

```bash
find docs/screenshots/analytics -maxdepth 1 -type f -print | sort
```

Expected exactly:

```text
docs/screenshots/analytics/ga-overview.png
docs/screenshots/analytics/ga-pages.png
docs/screenshots/analytics/hotjar-heatmap.png
docs/screenshots/analytics/hotjar-recordings.png
```

Run:

```bash
rg -n "materiał historyczny|nie jest częścią aktualnego runtime" docs/archive/analytics-assignment.md README.md
git diff -- docs/screenshots/analytics
```

Expected: both docs mark analytics historical; screenshot diff is empty.

- [ ] **Step 4: Commit archive**

```bash
git add README.md docs/archive/analytics-assignment.md docs/screenshots/analytics
git commit -m "docs: archive analytics assignment evidence"
```

---

### Task 4: Run Phase A gates and close the roadmap phase

**Files:**

- Modify after passing gates: `docs/roadmap/ROADMAP.md`
- Modify through `memory-save`: `WORKING_CONTEXT.md`, `docs/audits/audit-log.md`

**Interfaces:**

- Consumes: Tasks 1–3 and the dedicated browser spec.
- Produces: verified Phase A completion and Phase 0 handoff.

- [ ] **Step 1: Run the complete Phase A gate**

```bash
npm run lint
npm run test:unit
npm run build
npx playwright test tests/e2e/analytics-removal.spec.ts --project=desktop --no-deps
```

Expected: lint passes; all remaining unit tests, including `ProfilePage.test.tsx`, pass; build succeeds with only the existing chunk advisory; the dedicated public spec reports 1 passed without auth setup. Do not substitute the externally blocked full suite.

- [ ] **Step 2: Prove the built app contains no vendor code**

```bash
rg -n "google-analytics|googletagmanager|contentsquare|hotjar|ironlog.analyticsConsent" dist
```

Expected: exit 1, no matches.

Run:

```bash
npm ls @hotjar/browser react-ga4 --depth=0
```

Expected textual result: `(empty)`. A non-zero npm status is acceptable because absence is intentional.

- [ ] **Step 3: Mark Phase A complete**

Only after Steps 1–2 pass, change the map row to:

```markdown
| 1 | A — Kontrolowane usunięcie analityki | P1 | DONE | GA4 i Contentsquare/Hotjar usunięte z runtime; dowody integracji zachowane jako archiwum zaliczenia |
```

Add after `BASE-05`:

```markdown
- **BASE-06 — Analityka runtime: DONE.** GA4 i Contentsquare/Hotjar zostały usunięte z aplikacji, konfiguracji i zależności; materiały zaliczeniowe pozostają w archiwum historycznym. Cleanup zmiennych Vercel pozostaje kontrolą release `RELEASE-08`.
```

Do not mark Phase S complete.

- [ ] **Step 4: Run final repository checks**

```bash
git diff --check
git status --short
git diff --stat
```

Expected: no whitespace errors; only intentional Phase A/planning files changed; `output/playwright/` remains unstaged.

- [ ] **Step 5: Commit roadmap completion**

```bash
git add docs/roadmap/ROADMAP.md
git commit -m "docs: complete analytics removal phase"
```

- [ ] **Step 6: Save memory handoff**

Invoke `memory-save` with this state:

```text
Sprint focus: Phase A complete; prepare the minimal Phase 0 plan.
Decision: analytics remains removed; no replacement telemetry.
Passing: lint, unit, build, dedicated analytics-removal Playwright, dist vendor scan.
Broken/untested: preserve full-suite live Firebase quota limitation unless Phase 0 resolves it.
Next: plan TEST-01, TEST-03, TEST-05, and TEST-06 only.
```

If the ritual modifies tracked memory files, review and commit them:

```bash
git add WORKING_CONTEXT.md docs/audits/audit-log.md
git commit -m "docs: save phase A handoff"
```

Do not push or deploy without separate user authorization.
