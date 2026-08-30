# B-02 — mobilne odrzucenie treningu w overflow

**Status:** DONE — zweryfikowane i zintegrowane lokalnie do `main` w commicie zawierającym ten receipt
**Parent:** [zamknięta roadmapa jakości UI/UX](./2026-08-14-ui-quality-roadmap.md), decyzja produktowa zachowana poza jej pierwotnym zakresem implementacyjnym

## Rozstrzygnięcie

Mobilny lifecycle bar pokazuje timer, menu `•••` i główną akcję „Zakończ”. „Odrzuć trening” znajduje się w natywnym menu overflow i nadal wymaga istniejącego potwierdzenia. Desktop zachowuje widoczne „Anuluj”.

## Zakres dostarczony

- usunięto konkurującą, destrukcyjną akcję z mobilnego top bara;
- wykorzystano natywny popover bez nowej zależności;
- zachowano 44×44 px hit area, role `menu`/`menuitem`, focus i warningową semantykę koloru;
- ujednolicono helpery E2E dla mobilnego overflow i desktopowego „Anuluj”;
- zachowano niezmienione kontrakty discard/finalize, Firestore i dialog potwierdzenia.

## Weryfikacja

- workout E2E, desktop + mobile: `40 passed`, `13 skipped`, `0 failed`;
- target po korekcie tokenu: `2 passed`, `0 failed`;
- unit: `602/602`;
- lint: passed;
- build: passed;
- visual evidence: **Observed** — `view_image` odczytał świeże kadry `menu.png` i `dialog.png`; potwierdzono czysty top bar, czytelne menu w warningowym kolorze, poprawne przyciemnienie i zachowany dialog destrukcyjny.

## Lineage i dalsze obowiązki

`roadmapa UI quality (zamknięta) → M-14 (zamknięte) → B-02 (zamknięte) → M-07 pozostaje osobną decyzją produktową`.

Nie powstał nowy roadmap, nowa zależność ani warstwa kompatybilności. Nie wykonano push/PR.
