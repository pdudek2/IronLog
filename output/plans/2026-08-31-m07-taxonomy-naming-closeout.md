# M-07 — publiczne nazwy taksonomii treningowej

**Status:** DONE — zweryfikowane i zintegrowane lokalnie do `main` w commicie zawierającym ten receipt
**Parent:** [zamknięta roadmapa jakości UI/UX](./2026-08-14-ui-quality-roadmap.md), ostatnia zachowana decyzja produktowa po audycie

## Rozstrzygnięcie

Interfejs jawnie rozdziela trzy istniejące poziomy:

- **Kategoria ćwiczenia / Kategorie ćwiczeń** — szerokie bucket’y nawigacyjne, np. Klatka, Plecy, Nogi;
- **Grupa mięśniowa / Grupy mięśniowe** — dokładniejsze tagi używane w ćwiczeniach i analityce, np. Biceps, Quady, Pośladki;
- **Typ sesji** — etykiety treningu, np. Push, Pull, Upper Body.

## Zakres dostarczony

- ujednolicono widoczne etykiety i accessible names w Bibliotece, formularzu ćwiczenia, Historii, Postępach i edycji ukończonego treningu;
- aktywny trening zachował istniejące „Typ sesji”;
- nie zmieniono `category`, `muscles[]`, etykiet sesji, agregacji, Firestore ani modelu danych;
- nie dodano hierarchicznego filtra, migracji, zależności ani warstwy kompatybilności.

## Weryfikacja

- targetowane testy stron: `43/43`;
- mobile ergonomics E2E 320 px: `2 passed`, `0 failed`;
- unit: `603/603`;
- lint: passed;
- build: passed.

Visual evidence: **Observed** — surface: Browser; proof: ukończone obserwacje świeżego runtime zwróciły mobilne screenshoty Biblioteki z „Kategoria ćwiczenia”, formularza z „Grupy mięśniowe”, Historii z „Kategorie ćwiczeń” oraz Postępów z KPI „Grupa mięśniowa” i wykresem „Grupy mięśniowe”; wszystkie etykiety były widoczne bez overflow.

## Lineage i dalsze obowiązki

`roadmapa UI quality (zamknięta) → M-14 (zamknięte) → B-02 (zamknięte) → M-07 (zamknięte) → brak pozostałych obowiązków audytowych`.

Nie wykonano push/PR. Dalsza praca wraca do roadmapy produktu; nowy szeroki audyt UI wymaga nowego sygnału regresji.
