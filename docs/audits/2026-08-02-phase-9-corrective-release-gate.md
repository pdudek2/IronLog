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
| Lint | PENDING | `npm run lint` |
| Unit | PENDING | `npm run test:unit` |
| Vite build | PENDING | `npm run build` |
| Vercel production build | PENDING | `vercel build --prod --yes` |
| Firestore Rules | PENDING | `npm run test:rules` |
| Workout integration | PENDING | `npm run test:integration:workout` |
| Failure injection | PENDING | workout + AI focused gates |
| Full E2E | PENDING | emulator + CSP + desktop/mobile + zero retry |
| Direct observation | PENDING | local production preview |
| Hygiene | PENDING | Git, auth state, public i dist |
| Final review / rollback | PENDING | independent review + release decision |

## Znaleziska

Brak przed wykonaniem gate'ów.
