# Phase 7A — Local release gate

**Status:** IN PROGRESS

**Data:** 2026-07-23

**Commit bazowy:** `fdc7c9ddf70938364bb30e4ce091019bd9131f63`

## Zakres

7A obejmuje automatyczne gate'y lokalne na emulatorach. Nie obejmuje manualnego odbioru desktop/mobile, prywatnego live E2E, pushu, deployu, publikacji reguł i indeksów, produkcyjnego CSP ani produkcyjnego pomiaru dashboardu.

## Środowisko

- Node: `v25.6.1`
- npm: `11.9.0`
- Firebase CLI: `15.15.0`
- Playwright: `1.59.1`
- Backend: Auth + Firestore emulators, projekt `demo-ironlog`
- Retry: `0`
- Playwright inventory: 215 testów w 23 plikach dla projektów desktop i mobile

## Macierz wyników

| Gate | Wynik | Liczba | Uwagi |
| --- | --- | ---: | --- |
| Unit | PASS | 59 plików, 468 testów | `npm run test:unit` |
| Lint | PASS | 0 błędów | `npm run lint` |
| Build | PASS | 878 modułów | `npm run build`; bez ostrzeżeń |
| Firestore Rules | PASS | 1 plik, 16 testów | `npm run test:rules`; `demo-ironlog` |
| Workout integration | PASS | 2 pliki, 20 testów | `npm run test:integration:workout`; emulator Firestore |
| Full Playwright desktop+mobile | PENDING | 215 listed | emulatory + preview + CSP |

## Znaleziska i poprawki

Core gate'y nie ujawniły błędów wymagających poprawki. Pełny Playwright pozostaje do wykonania.

## Pozostałe obowiązki

- 7B: manualny smoke, klawiatura, accessibility snapshot i zgodność demo/dokumentacji;
- `RELEASE-08`: live E2E, deploy i publikacja produkcyjnych reguł po osobnej zgodzie;
- `RELEASE-09`: produkcyjna obserwacja CSP i requestów;
- `RELEASE-10`: powtarzalny pomiar zimnego dashboardu.

## Wniosek

PENDING
