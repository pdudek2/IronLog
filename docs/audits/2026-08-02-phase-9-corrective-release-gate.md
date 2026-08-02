# Phase 9 — Corrective release gate

**Status:** IN PROGRESS

**Data:** 2026-08-02

## Lineage

Program korekcyjny 8A–9 → Faza 9 → brak dalszych faz po pozytywnym closeoucie.

## Kandydat

- commit bazowy: `9260f78d5bb26c19aefd41d49d49773d03ad472c`
- branch i worktree: `corrective-release-gate` — `/Users/patryk/Desktop/IronLog/.worktrees/corrective-release-gate`
- backend testów: Auth + Firestore emulators, `demo-ironlog`;
- Playwright retry: `0`.

## Wersje środowiska

- `node --version`: `v25.6.1`
- `npm --version`: `11.9.0`
- `firebase --version`: `15.15.0`
- `vercel --version`: `Vercel CLI 51.8.0`
- `npx playwright --version`: `Version 1.59.1`

## Powierzchnia pełnego E2E

- Command: `E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e npx playwright test --list --project=desktop --project=mobile`
- Exit code: `0`
- Output: `Total: 217 tests in 23 files`

## Macierz

| Gate | Status | Dowód |
| --- | --- | --- |
| Lint | PASS | `npm run lint`; exit `0` after fix |
| Unit | PASS | `npm run test:unit`; `63` files / `484` tests before fix; focused fence `1` / `3` after fix |
| Vite build | PASS | `npm run build`; exit `0`, `878` modules after fix |
| Vercel production build | PASS | `vercel build --prod --yes`; exit `0`, no `TS2550`/`Object.hasOwn` diagnostic after fix |
| Firestore Rules | PASS | `npm run test:rules`; `1` file / `17` tests on `demo-ironlog` |
| Workout integration | PASS | `npm run test:integration:workout`; `3` files / `38` tests on fresh emulator |
| Failure injection | PENDING | workout + AI focused gates |
| Full E2E | PENDING | emulator + CSP + desktop/mobile + zero retry |
| Direct observation | PENDING | local production preview |
| Hygiene | PENDING | Git, auth state, public i dist |
| Final review / rollback | PENDING | independent review + release decision |

## Znaleziska

Pierwszy przebieg zatrzymał się na `vercel build --prod --yes`: Vercel zwrócił
exit `0`, ale wypisał diagnostykę `TS2550` dla `Object.hasOwn` w
`api/_lib/workoutProjectionFence.ts:53`. Pozostałe pierwsze gate'y (lint, unit,
Vite build) przeszły. Diagnostyka była regresją kompatybilności kompilacji
funkcji serwerowej, nie blokadą uwierzytelnienia.

Root cause: builder `@vercel/node` odczytuje root `tsconfig.json` dla każdego
entrypointu `api/*.ts`; ten plik zawiera tylko references i nie przekazuje
opcji `tsconfig.node.json`. Vercel ustawia więc domyślny target/lib ES2021,
podczas gdy `Object.hasOwn` wymaga biblioteki ES2022. W repo znaleziono jedno
wywołanie `Object.hasOwn`; pozostałe sprawdzenia własności używają istniejących
wzorców `in` albo bezpośrednich odczytów pól.

Minimalna poprawka w osobnym commicie `26007abcd01131b2e4f36c741d21a88f7d08c8e6`
zastąpiła wywołanie wzorcem `Object.prototype.hasOwnProperty.call`, zachowując
semantykę własnej właściwości i zgodność z ES2021. Po poprawce przeszły: lint,
focused fence, Vite build i Vercel production build bez diagnostyki `TS2550` ani
`Object.hasOwn`.

Rules i workout integration przeszły na świeżych emulatorach. Dry-run produkcyjnej
konfiguracji Firestore zakończył się sukcesem; zachowano znane ostrzeżenie o
nieużywanej funkcji `isWorkoutCreate` (`firestore.rules:239:14`). Deploy,
publikacja reguł/indeksów i push nie były wykonywane. Failure injection, pełne
E2E, obserwacja bezpośrednia, hygiene i final review pozostają zakresami
kolejnych tasków.
