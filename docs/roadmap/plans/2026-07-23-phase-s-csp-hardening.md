# Phase S CSP Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zastąpić pozorny CSP Report-Only egzekwowaną, minimalną polityką i powtarzalnym smoke publicznej oraz chronionej trasy.

**Architecture:** `vercel.json` pozostaje jedynym produkcyjnym źródłem prawdy. Jeden test Playwright odczytuje ten nagłówek i sprawdza kontrakt statyczny. Warunkowy tryb `vite preview` odczytuje tę samą wartość, dodaje wyłącznie lokalne wyjątki emulatorów Firebase i emituje nagłówek dla smoke na produkcyjnym bundlu.

**Tech Stack:** Vercel headers, Content Security Policy, Playwright, Firebase Auth/Firestore emulators, TypeScript.

## Global Constraints

- Nie dodawać endpointu raportów, zależności, nonce ani generatora CSP.
- Nie zmieniać UI, Firebase Rules, danych ani API.
- Produkcyjny `vercel.json` nie może zawierać localhosta ani originów emulatorów.
- `style-src 'unsafe-inline'` pozostaje ze względu na istniejące atrybuty React `style`.
- Push, deploy i produkcyjna obserwacja Network pozostają poza zakresem; `RELEASE-09` nadal jest otwarte.

---

### Task 1: Egzekwowany minimalny nagłówek CSP

**Files:**
- Create/Test: `tests/e2e/csp.spec.ts`
- Modify: `vercel.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: `headers[]` z `vercel.json`
- Produces: pojedynczy nagłówek `Content-Security-Policy`
- Produces: skrypt `npm run test:e2e:csp`

- [ ] **Step 1: Dodać failing test produkcyjnego kontraktu**

Utworzyć `tests/e2e/csp.spec.ts`:

```ts
import { readFileSync } from 'node:fs'
import { test, expect } from './fixtures'

interface VercelHeader {
  key: string
  value: string
}

interface VercelConfig {
  headers: Array<{
    source: string
    headers: VercelHeader[]
  }>
}

const vercelConfig = JSON.parse(
  readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'),
) as VercelConfig

function cspHeaders(): VercelHeader[] {
  return vercelConfig.headers
    .flatMap((entry) => entry.headers)
    .filter((header) => header.key.startsWith('Content-Security-Policy'))
}

function parsePolicy(policy: string): Map<string, string[]> {
  return new Map(
    policy
      .split(';')
      .map((directive) => directive.trim())
      .filter(Boolean)
      .map((directive) => {
        const [name, ...values] = directive.split(/\s+/)
        return [name, values] as const
      }),
  )
}

test('production config enforces the minimal CSP contract', () => {
  const headers = cspHeaders()
  expect(headers).toHaveLength(1)
  expect(headers[0]?.key).toBe('Content-Security-Policy')

  const policy = headers[0]?.value ?? ''
  const directives = parsePolicy(policy)

  expect(directives.get('default-src')).toEqual(["'self'"])
  expect(directives.get('script-src')).toEqual(["'self'"])
  expect(directives.get('connect-src')).toEqual(["'self'", 'https://*.googleapis.com'])
  expect(directives.get('img-src')).toEqual(["'self'", 'data:'])
  expect(directives.get('style-src')).toEqual([
    "'self'",
    "'unsafe-inline'",
    'https://fonts.googleapis.com',
  ])
  expect(directives.get('font-src')).toEqual(["'self'", 'https://fonts.gstatic.com'])
  expect(directives.get('frame-src')).toEqual(["'self'", 'https://*.firebaseapp.com'])
  expect(directives.get('object-src')).toEqual(["'none'"])
  expect(directives.get('base-uri')).toEqual(["'self'"])
  expect(directives.get('form-action')).toEqual(["'self'"])
  expect(directives.get('frame-ancestors')).toEqual(["'none'"])
  expect(policy).not.toMatch(
    /localhost|127\.0\.0\.1|firebaseio|google-analytics|googletagmanager|hotjar|contentsquare/i,
  )
})
```

W `package.json` dodać:

```json
"test:e2e:csp": "E2E_BACKEND=emulator E2E_CSP=true TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e firebase emulators:exec --only auth,firestore --project demo-ironlog \"playwright test tests/e2e/csp.spec.ts --project=desktop --retries=0\""
```

- [ ] **Step 2: Uruchomić test i potwierdzić RED**

Run:

```bash
npm run test:e2e:csp
```

Expected: FAIL, ponieważ jedyny nagłówek nadal nazywa się `Content-Security-Policy-Report-Only`.

- [ ] **Step 3: Zastąpić nagłówek minimalną polityką**

W `vercel.json` ustawić:

```json
{
  "key": "Content-Security-Policy",
  "value": "default-src 'self'; script-src 'self'; connect-src 'self' https://*.googleapis.com; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; frame-src 'self' https://*.firebaseapp.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
}
```

- [ ] **Step 4: Uruchomić test i potwierdzić GREEN**

Run:

```bash
npm run test:e2e:csp
```

Expected: setup emulatora i test kontraktu przechodzą.

- [ ] **Step 5: Commit**

```bash
git add vercel.json package.json tests/e2e/csp.spec.ts
git commit -m "fix: enforce minimal content security policy"
```

### Task 2: Izolowany smoke publicznej i chronionej trasy

**Files:**
- Modify/Test: `tests/e2e/csp.spec.ts`
- Modify: `playwright.config.ts`
- Modify: `package.json`
- Modify: `vite.config.ts`

**Interfaces:**
- Consumes: produkcyjna wartość `Content-Security-Policy`
- Produces: `localCspHeader(): string` w warunkowej konfiguracji preview
- Produces: runtime gate dla `/login` i `/dashboard`
- Produces: tryb `E2E_CSP=true`, który uruchamia zbudowany bundle przez `vite preview`

- [ ] **Step 1: Dodać obserwację naruszeń i originów**

Rozszerzyć importy:

```ts
import type { BrowserContext, Page } from '@playwright/test'
import { expectAppReady } from './support/appReady'
```

Dodać pod `parsePolicy`:

```ts
const APP_ORIGIN = 'http://127.0.0.1:5174'
const LOCAL_ALLOWED_ORIGINS = new Set([
  APP_ORIGIN,
  'http://127.0.0.1:8080',
  'http://127.0.0.1:9099',
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
])

async function installCspObservation(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const state = window as typeof window & { __ironlogCspViolations?: string[] }
    state.__ironlogCspViolations = []
    document.addEventListener('securitypolicyviolation', (event) => {
      state.__ironlogCspViolations?.push(
        `${event.effectiveDirective}: ${event.blockedURI}`,
      )
    })
  })
}

function observeOrigins(page: Page): Set<string> {
  const origins = new Set<string>()
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      origins.add(url.origin)
    }
  })
  return origins
}

async function expectCleanCsp(page: Page, origins: Set<string>): Promise<void> {
  const violations = await page.evaluate(() => (
    (window as typeof window & { __ironlogCspViolations?: string[] })
      .__ironlogCspViolations ?? []
  ))
  expect(violations).toEqual([])
  expect(
    [...origins].filter((origin) => !LOCAL_ALLOWED_ORIGINS.has(origin)),
  ).toEqual([])
}
```

Każdy runtime test ma dodatkowo sprawdzić odpowiedź dokumentu: nagłówek `Content-Security-Policy` jest obecny, a `Content-Security-Policy-Report-Only` nie występuje.

- [ ] **Step 2: Dodać runtime test publicznej trasy**

W `playwright.config.ts` dodać tryb `E2E_CSP=true`, który zamiast dev-serwera uruchamia:

```ts
'npm run build && npm run preview -- --host 127.0.0.1 --port 5174'
```

Build i preview muszą otrzymać istniejące `emulatorWebEnv`, aby bundle łączył się wyłącznie z emulatorami. Preview działa na `127.0.0.1`, tak jak emulatory. `vite.config.ts` w tym trybie odczytuje produkcyjny CSP z `vercel.json`, dopisuje tylko originy emulatorów do `connect-src` i emituje nagłówek bez pośrednictwa `route.fulfill()`.

```ts
test.describe('public route CSP', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('login loads under the enforced policy', async ({ context, page }) => {
    await installCspObservation(context)
    const origins = observeOrigins(page)

    await page.goto('/login')
    await expect(page.getByRole('button', { name: 'Zaloguj się' })).toBeVisible()

    await expectCleanCsp(page, origins)
  })
})
```

- [ ] **Step 3: Dodać runtime test chronionej trasy**

```ts
test('dashboard loads under the enforced policy', async ({ context, page }) => {
  await installCspObservation(context)
  const origins = observeOrigins(page)

  await page.goto('/dashboard')
  await expectAppReady(page, '/dashboard')

  await expectCleanCsp(page, origins)
})
```

- [ ] **Step 4: Uruchomić smoke i poprawić wyłącznie potwierdzone braki**

Run:

```bash
npm run test:e2e:csp
```

Expected: 3 tests PASS. Jeżeli test zwróci konkretną wymaganą usługę zablokowaną przez CSP, dodać tylko jej najwęższy origin do odpowiedniej dyrektywy i do oczekiwania kontraktu. Nie dodawać wildcardu bez obserwowanego requestu.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/csp.spec.ts vercel.json
git commit -m "test: cover csp on public and protected routes"
```

### Task 3: Pełna bramka, review i lifecycle

**Files:**
- Modify: `docs/roadmap/ROADMAP.md`
- Modify: `docs/roadmap/specs/2026-07-23-phase-s-csp-hardening-design.md`
- Modify: `docs/roadmap/plans/2026-07-23-phase-s-csp-hardening.md`

**Interfaces:**
- Consumes: egzekwowany nagłówek i runtime smoke z Task 1–2
- Produces: stan `COMPLETED — VERIFIED — AWAITING INTEGRATION`

- [ ] **Step 1: Uruchomić pełne gate’y**

Run:

```bash
npm run test:e2e:csp
npm run test:unit
npm run lint
npm run build
git diff --check
```

Expected: CSP smoke, pełne unity, lint, build i diff check przechodzą.

- [ ] **Step 2: Wykonać focused review pełnego diffu**

Sprawdzić diff od commitu bazowego pod kątem:

- blokady Firebase Auth, Firestore, Google Fonts albo same-origin API;
- obecności localhosta lub emulatorów w `vercel.json`;
- powrotu originów GA4, GTM, Hotjar, Contentsquare albo zbędnego `firebaseio.com`;
- `'unsafe-inline'` w `script-src`;
- fałszywego uznania lokalnego smoke za produkcyjne `RELEASE-09`;
- bezpiecznego rollbacku nagłówka bez zmian danych.

- [ ] **Step 3: Zaktualizować lifecycle**

W specu i planie ustawić `COMPLETED — VERIFIED — AWAITING INTEGRATION`. W roadmapie ustawić Fazę S jako `DONE` dopiero po lokalnej integracji; przed nią opisać zielone gate’y i oczekiwanie na integrację. Zachować `RELEASE-09` jako osobny obowiązek produkcyjny.

- [ ] **Step 4: Commit**

```bash
git add docs/roadmap/ROADMAP.md docs/roadmap/specs/2026-07-23-phase-s-csp-hardening-design.md docs/roadmap/plans/2026-07-23-phase-s-csp-hardening.md
git commit -m "docs: record phase s verification"
```

## Execution

Plan jest przeznaczony do wykonania inline. Konfiguracja i test tworzą jeden współdzielony kontrakt, więc podział między subagentów zwiększyłby koszt koordynacji bez niezależnej granicy.
