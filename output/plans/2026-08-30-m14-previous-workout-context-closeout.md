# M-14 — kontekst poprzedniego treningu

**Status:** DONE — zweryfikowane i zintegrowane lokalnie do `main` w commicie zawierającym ten receipt
**Parent:** [zamknięta roadmapa jakości UI/UX](./2026-08-14-ui-quality-roadmap.md), decyzja produktowa zachowana poza jej zakresem implementacyjnym

## Rozstrzygnięcie

Aktywny trening pokazuje najnowszą zmaterializowaną sesję dla dokładnie tego samego `exerciseId` i `exerciseSource`:

- nagłówek „Poprzedni trening” zawiera datę i pierwszą serię;
- rozwinięcie pokazuje wszystkie serie z tamtej sesji;
- desktop otwiera kontekst domyślnie, mobile pozostawia go zwinięty;
- brak danych lub błąd odczytu nie tworzy mylącego pustego modułu.

To zastępuje niejednoznaczne „Ostatnio”, które opisywało serię wykonaną w bieżącej sesji.

## Zakres dostarczony

- wykorzystano istniejące `getExerciseSessions`; bez nowego serwisu i bez zmian schematu danych;
- użyto natywnego `details/summary` i osadzono kontekst przy aktywnym ledgerze ćwiczenia;
- uproszczono hierarchię ekranu: usunięto redundantny desktopowy cockpit, ciężkie ramki pól i zbędne separatory;
- zachowano kontrakty finalize/discard, Firestore i API;
- dodano deterministyczne E2E dla desktopu, mobile, pełnej listy serii i braku historii.

## Weryfikacja

- workout lifecycle E2E, desktop + mobile: `20 passed`, `3 skipped`, `0 failed`;
- unit: `602/602`;
- lint: passed;
- build: passed;
- visual evidence: **Observed** — `view_image` odczytał końcowe kadry `current-320.png`, `current-393.png`, `multi-1280.png` i `discard-393.png`; potwierdzono czytelną hierarchię bieżącej serii, kontekstu poprzedniego treningu, steppera i dialogu bez overflow.

## Lineage i dalsze obowiązki

`roadmapa UI quality (zamknięta) → M-14 (zamknięte) → B-02 i M-07 pozostają osobnymi, nierozstrzygniętymi decyzjami produktowymi`.

Nie powstał nowy roadmap ani warstwa kompatybilności. Nie wykonano push/PR.
