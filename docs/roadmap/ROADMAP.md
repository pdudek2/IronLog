# IronLog — aktywna roadmapa korekcyjna

Status dokumentu: **Faza 8D DONE; Faza 9 IN PROGRESS**
Źródło: Agent Sanity Review z 2026-07-29
Ostatnia aktualizacja: 2026-08-02

Zakończony program A–7, jego dowody release oraz pełna historyczna macierz audytów znajdują się w [`archive/2026-07-29-full-roadmap-snapshot.md`](archive/2026-07-29-full-roadmap-snapshot.md). Nie należy czytać archiwum przy zwykłym planowaniu bieżących prac.

## 1. Kontrakt dokumentu

Ten plik zawiera wyłącznie aktywny zakres. Każda faza otrzymuje osobny plan przed implementacją.

- Identyfikatory z roadmapy są trwałe.
- Naprawa i jej test regresyjny należą do tej samej fazy.
- **READY** oznacza gotowość do napisania szczegółowego planu.
- **DESIGN IN PROGRESS** oznacza, że przed implementacją trzeba zatwierdzić kontrakt.
- **PLANNED** oznacza zatwierdzony kontrakt i gotowy plan implementacji.
- **INTEGRATION PENDING** oznacza, że implementacja i gate'y są zakończone, ale zmiana nie została jeszcze zapisana w historii projektu.
- **BLOCKED** oznacza zależność od wcześniejszych faz.
- Po zamknięciu Fazy 9 cały dokument trafia do `archive/`; kolejny program zaczyna się od nowego, krótkiego `ROADMAP.md`.

## 2. Mapa programu

| Kolejność | Faza | Priorytet | Status | Rezultat |
|---:|---|---|---|---|
| 1 | 8A — Higiena release i wiarygodność E2E | P1 | DONE | Repo i bundle bez wrażliwych/roboczych artefaktów; E2E rozpoznaje aktualne ekrany |
| 2 | 8B — Serializacja projekcji workoutu | P1 | DONE | Usuwanie i materializacja nie mogą odtworzyć usuniętych danych |
| 3 | 8C — Integralność katalogu planów AI | P2 | DONE | Plan nie mapuje ćwiczeń po niejednoznacznej nazwie i jawnie obsługuje niepełny katalog |
| 4 | 8D — Kontrakt repo i cleanup | P2 | DONE | Instrukcje odpowiadają aplikacji, a martwy scaffolding znika |
| 5 | 9 — Korekcyjna bramka wydania | P1 | IN PROGRESS | Cały zakres ma dowody regresyjne przed merge/deployem |

```text
Faza 8A ──┬──► Faza 8B ──┐
          ├──► Faza 8C ──┼──► Faza 9
          └──► Faza 8D ──┘
```

Fazy 8A–8D są zakończone i zintegrowane. Faza 9 ma zatwierdzony zakres oraz
szczegółowy plan korekcyjnej bramki wydania.

## 3. Faza 8A — Higiena release i wiarygodność E2E

**Status: DONE.** Implementacja, gate'y i integracja są zakończone. Plan i dowody: [`plans/2026-07-29-phase-8a-release-hygiene-e2e-reliability.md`](plans/2026-07-29-phase-8a-release-hygiene-e2e-reliability.md).

**Cel:** usunąć artefakty, które nie powinny trafić do repo ani produkcyjnego bundle'a, i przywrócić E2E jako wiarygodny sygnał po zmianach copy.

**Zakres:**

- **HYGIENE-01:** usunąć lokalny storage state Playwright i dodać trwałe ignorowanie; jeśli stan opuścił lokalną maszynę, unieważnić sesję.
- **HYGIENE-02:** usunąć lub przenieść poza `public/` robocze preview i screenshoty.
- **TEST-GATE-01:** zaktualizować `expectAppReady` i bezpośrednie lokatory po zmianach nagłówków. Dokładne copy może być kontraktem tylko w testach copy.
- **TEST-GATE-02:** uruchomić dotknięte E2E na świeżych emulatorach, potem reprezentatywny zestaw tras desktop/mobile.

**Kryteria wyjścia:**

- brak cookies, tokenów i storage state w śledzonych oraz nieignorowanych plikach;
- brak roboczych preview w produkcyjnym katalogu statycznym;
- readiness checki rozpoznają aktualne ekrany;
- dotknięte E2E przechodzą bez retry.

**Poza zakresem:** przebudowa całego frameworka Playwright i masowe dodawanie test IDs.

## 4. Faza 8B — Serializacja projekcji workoutu

**Status: DONE.** Implementacja, finalny whole-branch review, jego poprawka
idempotentnej odpowiedzi dla równoległej materializacji tej samej rewizji oraz
gate'y są zakończone. Dowody i zatwierdzone korekty znajdują się w
[`specs/2026-07-29-phase-8b-workout-projection-serialization-design.md`](specs/2026-07-29-phase-8b-workout-projection-serialization-design.md)
i
[`plans/2026-07-29-phase-8b-workout-projection-serialization.md`](plans/2026-07-29-phase-8b-workout-projection-serialization.md).

**Cel:** równoległe usunięcie i materializacja jednego workoutu zawsze kończą się jednym autorytatywnym stanem.

**Zakres:**

- **WORKOUT-RACE-01:** wybrać jeden mechanizm serializacji operacji dla workoutu. Materializacja nie może pisać po rozpoczęciu skutecznego usunięcia.
- **WORKOUT-RACE-02:** usunięcie czyści wszystkie projekcje workoutu i przelicza rekordy dla pełnej sumy dotkniętych ćwiczeń.
- **WORKOUT-RACE-03:** dodać deterministyczne integracje dla przeplotu `delete ↔ materialize/update` i retry po przerwaniu operacji.

**Kryteria wyjścia:**

- brak osieroconych `exerciseSessions` po usunięciu workoutu;
- rekordy wynikają wyłącznie z istniejących workoutów;
- retry obu operacji jest idempotentne;
- usunięty trening nie wpływa na historię ani postępy po synchronizacji.

**Zatwierdzona decyzja:** istniejący `closedSessions/{workoutId}` pełni rolę trwałego version fence'a. Delete ustawia terminalny stan `deleted`, zwiększa rewizję i wygrywa ze spóźnionym update'em lub materializacją. Retry kończy idempotentny cleanup.

## 5. Faza 8C — Integralność katalogu planów AI

**Status: DONE.** Implementacja i gate'y są zakończone. Dowody:
[`plans/2026-07-31-phase-8c-ai-catalog-integrity.md`](plans/2026-07-31-phase-8c-ai-catalog-integrity.md).

**Cel:** walidacja planu nie może po cichu przypisać ćwiczenia do złego źródła ani przedstawić niepełnego katalogu jako kompletnego.

**Zakres:**

- **AI-CATALOG-01:** fallback po nazwie jest dozwolony tylko dla nazwy jednoznacznej w połączonym katalogu global/user.
- **AI-CATALOG-02:** błąd pobrania `userExercises` staje się jawnym stanem.
- **AI-CATALOG-03:** dodać testy kolizji nazw, brakujących identyfikatorów, awarii katalogu i zachowania klienta.

**Kryteria wyjścia:**

- każde ćwiczenie ma jednoznaczne `exerciseSource + exerciseId`;
- kolejność tablicy nie rozstrzyga kolizji nazw;
- użytkownik widzi prawdziwy stan błędu i może ponowić operację;
- testy obejmują kolizję global/user i awarię Firestore.

**Zatwierdzona decyzja:** awaria pobrania kompletnego katalogu zatrzymuje całą
generację stabilnym, retryable błędem. Nie dodajemy trybu ograniczonego do
katalogu globalnego. Istniejący przycisk `Generuj plan` służy do ponowienia.

## 6. Faza 8D — Kontrakt repo i cleanup

**Status: DONE.** Implementacja, focused review i gate'y są zakończone. Plan i dowody:
[`plans/2026-08-01-phase-8d-repo-contract-cleanup.md`](plans/2026-08-01-phase-8d-repo-contract-cleanup.md).

**Cel:** usunąć rozjazd między instrukcjami repo a aktualnym produktem oraz potwierdzony martwy scaffolding.

**Zakres:**

- **DOC-01:** zaktualizować `AGENTS.md`: aktualny kierunek Puls, fonty i serwerowa finalizacja workoutu.
- **CLEANUP-01:** po sprawdzeniu importów usunąć nieużywane pliki startowe i assety Vite.

**Kryteria wyjścia:**

- instrukcje nie opisują starego motywu ani nieaktualnego zapisu;
- `rg`, TypeScript i build potwierdzają brak referencji;
- cleanup nie zmienia zachowania aplikacji.

**Poza zakresem:** refaktor działającego kodu wyłącznie dla estetyki.

## 7. Faza 9 — Korekcyjna bramka wydania

**Status: IN PROGRESS.** Faza 8D jest zakończona. Raport wejściowy:
[`audits/2026-08-02-phase-9-corrective-release-gate.md`](audits/2026-08-02-phase-9-corrective-release-gate.md).
Plan wykonania:
[`plans/2026-08-02-phase-9-corrective-release-gate.md`](plans/2026-08-02-phase-9-corrective-release-gate.md).

**Zakres:**

- **CORRECTIVE-RELEASE-01:** lint, unit, build, reguły Firestore oraz integracje workoutu i AI.
- **CORRECTIVE-RELEASE-02:** poprawiony zestaw E2E na świeżych emulatorach i smoke desktop/mobile.
- **CORRECTIVE-RELEASE-03:** failure injection dla wyścigu workoutu i awarii katalogu AI.
- **CORRECTIVE-RELEASE-04:** kontrola braku tokenów, storage state i roboczych artefaktów w repo oraz buildzie.
- **CORRECTIVE-RELEASE-05:** końcowy review i rollback; push, merge i deploy wymagają jawnej zgody.

**Kryteria wyjścia:**

- wszystkie P1 są zamknięte z testem regresyjnym;
- P2 są zamknięte albo jawnie odłożone po akceptacji;
- bramki są zielone bez ukrywania błędów przez retry;
- smoke obejmuje login, dashboard, plany, aktywną sesję, historię, postępy i AI;
- roadmapa oraz plany faz wskazują ten sam stan.

## 8. Traceability ASR-2

| Ustalenie | Priorytet | Zakres |
|---|---:|---|
| Wyścig usunięcia i materializacji workoutu | P1 | WORKOUT-RACE-01–03 |
| Nieaktualne readiness i nagłówki E2E | P1 | TEST-GATE-01–02 |
| Nieignorowany storage state Playwright | P1 | HYGIENE-01 |
| Niejednoznaczny fallback AI po nazwie | P2 | AI-CATALOG-01, 03 |
| Cicha degradacja katalogu użytkownika | P2 | AI-CATALOG-02–03 |
| Robocze artefakty w `public/` | P2 | HYGIENE-02 |
| Nieaktualny kontrakt w `AGENTS.md` | P2 | DOC-01 |
| Martwy scaffolding Vite | P3 | CLEANUP-01 |
