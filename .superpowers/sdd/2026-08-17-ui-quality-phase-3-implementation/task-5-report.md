# Task 5 report — runtime contracts, assurance i closeout etapu 3

## Status

`DONE_WITH_CONCERNS`

Implementacja i assurance są zakończone. Pixel-level receipt i Step 7–8 pozostają pending do osobnego `view_image` wykonanego przez kontroler oraz integracji. Etapy 4–5 i decyzje B-02, M-07, M-14 pozostają otwarte.

## Zmienione pliki

- `tests/e2e/support/progressEmulator.ts` — trzy source-aware sesje Squat 100/105/110 kg, deterministyczny remis pozostawiający Bench jako default, osobny minimalny fixture user-source detalu oraz pełny cleanup.
- `tests/e2e/progress.spec.ts` — jedna linia, realny selector Bench → Squat, insight przed wykresem, touch heatmapy, 44 px i overflow przy 320/393 px.
- `tests/e2e/exercise-detail.spec.ts` — jawne ostatnio/maksimum, semantyczny wykres, wysokość 144 px oraz brak overflow na 320/393/1440 px.
- `output/plans/2026-08-14-ui-quality-roadmap.md` — etap 3 gotowy do niezależnego odczytu screenshotów i integracji; dalszy scope pozostaje otwarty.
- `output/plans/2026-08-17-ui-quality-phase-3-implementation.md` — Step 1–6 zakończone, Step 7–8 pending, kwalifikowany receipt.
- `output/playwright/ui-quality-phase-3/*.png` — siedem finalnych screenshotów.

## RED / GREEN

- RED: selector test bez Squat nie znajdował opcji `Phase 7 Squat` i timeoutował w `selectOption`; produktowe wcześniejsze asercje Bench/one-line przechodziły.
- GREEN: po dodaniu trzech sesji Squat selector realnie zmieniał jedyną linię i insight na `Ostatnio 110 kg`. Focused przebieg produktowych asercji przeszedł; fixture-level teardown zgłosił znany `Firestore Listen net::ERR_ABORTED` po zakończeniu testu.
- RED: nowy detail contract na nieobsianej trasie nie znajdował headingu `Phase 7 Volume Detail`.
- GREEN: po dodaniu minimalnego `userExercises` i trzech matching `exerciseSessions` desktop/mobile detail E2E przeszedł `3/3`.

## Komendy i wyniki

1. `E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e firebase emulators:exec --only auth,firestore --project demo-ironlog "npx playwright test tests/e2e/progress.spec.ts --project=desktop --grep 'shows one selected strength exercise'"`
   - RED: 1 failed, 1 setup passed; brak opcji Squat.
   - GREEN produktowy: selector/one-line/insight przeszły; run zakończył się znanym teardown-only `Firestore Listen net::ERR_ABORTED`.
2. `E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e firebase emulators:exec --only auth,firestore --project demo-ironlog "npx playwright test tests/e2e/exercise-detail.spec.ts --project=desktop"`
   - RED: 1 failed, 1 setup passed; brak fixture detalu.
3. `E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e firebase emulators:exec --only auth,firestore --project demo-ironlog "npx playwright test tests/e2e/exercise-detail.spec.ts --project=desktop --project=mobile"`
   - GREEN: 3 passed.
4. `NODE_OPTIONS=--no-experimental-webstorage npx vitest run src/lib/__tests__/progressService.test.ts src/pages/__tests__/ProgressPage.test.tsx src/pages/__tests__/ExerciseDetailCatalogState.test.tsx`
   - PASS: 3 files, 38 tests.
5. `E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e firebase emulators:exec --only auth,firestore --project demo-ironlog "npx playwright test tests/e2e/progress.spec.ts tests/e2e/exercise-detail.spec.ts --project=desktop --project=mobile"`
   - Produktowe asercje: PASS; 11 passed, 1 skipped. Jeden istniejący desktop test raportowany jako failed wyłącznie przez soft diagnostic `Firestore Listen net::ERR_ABORTED` po zamknięciu strony. Nie wyciszano aplikacji ani diagnostyki.
6. `npm run lint`
   - PASS, exit 0.
7. `NODE_OPTIONS=--no-experimental-webstorage npm run test:unit`
   - PASS: 73 files, 590 tests.
8. `npm run build`
   - PASS, 880 modules transformed.
9. `git diff --check`
   - PASS, exit 0.

## Emulator teardown

Każdy nowy dokument jest jawnie wymieniony w cleanupie: Bench/Squat sessions, Bench record, detail `userExercises` i detail sessions. Focused detail E2E zakończył się czysto. W combined run wszystkie asercje produktu przeszły; jedyny błąd to znany, teardown-only abort kanału Listen w istniejącym desktop teście. Serialny runtime został posprzątany przez helpery, tymczasowe dokumenty obserwacyjne usunięto, a Auth/Firestore oraz oba dev serwery zamknięto.

## Playwright CLI

- Surface: `/Users/patryk/.codex/skills/playwright/scripts/playwright_cli.sh`.
- Jedna nazwana izolowana sesja: `ui-quality-phase-3`; bez profilu Chrome użytkownika i bez równoległej powierzchni browserowej.
- Zdarzenia: desktop default Bench i jedna linia; selector Squat → `Ostatnio 110 kg`; touch inspector → `9 sie · 1.0k kg`; 320 px → overflow `-15`, insightY `802.625` < chartY `1037.640625`, selecty `44`, lines `1`; 393 px → overflow `-15`, insightY `768.046875` < chartY `964.671875`, selecty `44`, lines `1`; detail 393/1440 → chart `144`, chart overflow `0`, `role=list`, jawne `1.2k kg`/`1.4k kg`; short → `1 z 3 dni do wykresu`; empty → celowy status. Końcowa bieżąca karta zgłosiła 0 errors i 0 warnings.
- Pierwsza karta z testowym cofnięciem zegara wygenerowała emulatorowy warning Firestore o future update time; została zamknięta i zastąpiona czystą kartą z natywnym zegarem oraz bieżącymi tymczasowymi danymi. Nie użyto tej karty do finalnych screenshotów ani końcowego console result.

## Finalne screenshoty

- `output/playwright/ui-quality-phase-3/progress-desktop-1440.png`
- `output/playwright/ui-quality-phase-3/progress-mobile-320.png`
- `output/playwright/ui-quality-phase-3/progress-mobile-393.png`
- `output/playwright/ui-quality-phase-3/exercise-detail-desktop-1440.png`
- `output/playwright/ui-quality-phase-3/exercise-detail-mobile-393.png`
- `output/playwright/ui-quality-phase-3/progress-short-series-1440.png`
- `output/playwright/ui-quality-phase-3/progress-empty-range-1440.png`

Visual evidence: Pending — surface: Playwright CLI; blocker: finalne screenshoty są zapisane po ostatniej zmianie kodu, lecz osobne `view_image` musi wykonać kontroler. Nie deklaruję pixel-level `Observed`.

## Self-review i concerns

- Scope: brak zmian produkcyjnych, zapytań, lifecycle, zależności lub store; wyłącznie fixture, E2E, receipt i screenshoty.
- Source-awareness: Bench/Squat pozostają `global:<id>`, detail używa `user:<id>` na trasie `/exercises/user/<id>`.
- Determinizm: Bench i Squat mają po trzy sesje, więc istniejący tie-break po nazwie utrzymuje Bench jako default.
- Mutation check: brak Squat zrywa selector; więcej niż jedna linia zrywa count; ukrycie insightu/summary, zbyt niski chart/select lub overflow zrywa geometry; brak source-aware fixture zrywa detail route.
- Concern 1: combined E2E ma znany teardown-only `Firestore Listen net::ERR_ABORTED`; produktowe asercje nie zawodzą.
- Concern 2: pixel receipt i Step 7–8 czekają na kontrolerowe `view_image` i integrację.
