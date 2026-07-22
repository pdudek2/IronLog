# IronLog — projekt Fazy R: review cyklu życia treningu

**Status:** zakończona — raport zatwierdzony; historyczny projekt diagnostyczny

**Data:** 2026-07-11

**Zakres roadmapy:** `REVIEW-WORKOUT-01`–`REVIEW-WORKOUT-05`, obejmujący hipotezy `WORKOUT-01`–`WORKOUT-06`

## 1. Cel

Faza R jest diagnostycznym przeglądem cyklu życia treningu. Ma ustalić, które ryzyka integralności są realne, zanim zaprojektujemy i wdrożymy poprawki produktowe.

Review obejmuje pełną ścieżkę:

```text
aktywny trening
  → zapis workoutu
  → materializacja
  → usunięcie aktywnej sesji
  → stan dashboardu i historii
  → reload, drugi klient, odzyskanie sieci albo obsługa starej sesji
```

Faza kończy się klasyfikacją każdej hipotezy oraz dokładną rekomendacją zakresu Fazy 1.

## 2. Zakres

### W zakresie

- `WORKOUT-01`: ryzyko duplikatu po niejednoznacznym wyniku zapisu albo ponowieniu finalizacji.
- `WORKOUT-02`: ponowne pojawienie się zakończonej lub odrzuconej sesji po błędzie cleanupu w chmurze.
- `WORKOUT-03`: brak lub skuteczność retry/tombstone dla nieudanego cleanupu.
- `WORKOUT-04`: spójność workoutu, `exerciseSessions` i rekordów po częściowej awarii materializacji oraz retry.
- `WORKOUT-05`: zgodność komunikatów UI z faktycznym stanem danych.
- `WORKOUT-06`: refresh, niezależne konteksty przeglądarki, offline i stare sesje tylko w zakresie potrzebnym do sprawdzenia wcześniejszych ryzyk.
- Testowe punkty wstrzykiwania zależności i deterministyczne awarie potrzebne do reprodukcji.
- Testy charakterystyki zachowania, które nie naprawiają produktu.
- Kanoniczny raport oraz aktualizacja roadmapy.

### Poza zakresem

- Poprawki produktowe dla potwierdzonych problemów.
- Nowy protokół finalizacji, klucz idempotencji, tombstone, kolejka retry albo nowy flow odzyskiwania.
- Szeroki refactor workout store, schematu Firestore, dashboardu lub projekcji treningów.
- Migracja całego live Playwright suite na emulatory.
- Szczegółowy plan Fazy 1 przed review i akceptacją raportu Fazy R.

## 3. Statusy review

Identyfikatory używane w kodzie i danych są po angielsku:

```ts
export type ReviewStatus = 'confirmed' | 'rejected' | 'already_protected'
```

W polskim raporcie mogą być prezentowane tak:

| Identyfikator | Etykieta w raporcie |
|---|---|
| `confirmed` | potwierdzona |
| `rejected` | odrzucona |
| `already_protected` | już zabezpieczona |

Każdy punkt `WORKOUT-01`–`WORKOUT-06` otrzymuje dokładnie jeden status. Podejrzana ścieżka kodu ani intuicja nie wystarczają do klasyfikacji.

## 4. Standard dowodu

Każda klasyfikacja wymaga:

1. wskazania dokładnej ścieżki kodu;
2. deterministycznego testu usługowego, integracyjnego lub przeglądarkowego, chyba że cytowany inwariant jednoznacznie wyklucza reprodukcję;
3. opisu zaobserwowanego przejścia i stanu końcowego;
4. jawnej konsekwencji dla Fazy 1.

Dowody mają trzy warstwy:

- analiza statyczna wyjaśnia, dlaczego dane zachowanie jest możliwe;
- test usługi lub integracji odtwarza granice transportu i persystencji;
- focused Playwright sprawdza tylko zachowania zależne od UI, cache, reloadu, offline lub wielu klientów.

Zielony test nie wystarcza do odrzucenia hipotezy. Trzeba wskazać inwariant, który zapobiega danemu błędowi.

## 5. Architektura diagnostyki

### 5.1 Mapa cyklu życia

Pierwszy pakiet prac tworzy jedną mapę dla:

- `WorkoutPage.doFinish`;
- `saveWorkout` i początkowego zapisu do `workouts`;
- `materializeWorkout` oraz `/api/materialize-workout`;
- etapów `materializeWorkoutForUser`;
- `clearWorkout`, `clearSession` i `deleteActiveSession`;
- lokalnego backupu aktywnej sesji i subskrypcji Firestore;
- retry oczekującej materializacji na dashboardzie i etykiety `sync`;
- kontynuowania oraz odrzucania starej sesji.

Mapa oznacza granice, na których operacja może zakończyć się zdalnie, mimo że klient otrzyma błąd, albo jeden etap może się udać przed awarią kolejnego.

### 5.2 Fault injection

Fault injection opiera się na wstrzykiwaniu zależności i atrapach należących do testów. Nie wolno używać produkcyjnej flagi środowiskowej, query parametru, klucza local storage, debug endpointu ani globalnego przełącznika.

Dozwolone zmiany:

- wydzielenie małej funkcji orkiestrującej bez zmiany publicznego zachowania;
- wstrzyknięcie operacji zapisu, materializacji, usuwania lub kolejnych etapów projekcji;
- dostarczenie atrap wyłącznie z testów;
- użycie emulatorów Auth i Firestore do sprawdzenia prawdziwego stanu danych.

Niedozwolone zmiany:

- `VITE_ENABLE_FAILURES` ani równoważna flaga runtime;
- tryb awarii osiągalny z produkcyjnego bundle'a;
- osłabienie reguł Firestore na potrzeby testu;
- połknięcie błędu tylko po to, żeby reprodukcja była zielona;
- wdrożenie docelowego recovery w Fazie R.

Model awarii rozróżnia co najmniej:

```ts
type FaultOutcome =
  | 'failed_before_remote_commit'
  | 'remote_commit_succeeded_ack_lost'
  | 'failed_after_workout_before_projection'
  | 'failed_after_sessions_before_records'
  | 'failed_after_records_before_materialized_flag'
  | 'active_session_delete_failed'
```

Są to nazwy scenariuszy testowych, nie element produkcyjnego API.

### 5.3 Izolacja przeglądarek

Scenariusze wieloklientowe używają osobnych instancji Playwright `BrowserContext`. Konteksty nie mogą współdzielić cache Firestore w IndexedDB. Każdy powstaje przez fixture obserwowanego kontekstu, więc pozostaje objęty wspólną diagnostyką przeglądarki.

Testy używają unikalnych identyfikatorów i rejestrują cleanup przed pierwszą mutacją. Cleanup wykonuje wszystkie akcje mimo pojedynczych błędów i raportuje je zbiorczo.

## 6. Macierz scenariuszy

### 6.1 `WORKOUT-01` — niejednoznaczny zapis workoutu

Review symuluje oba warianty niejednoznacznego wyniku:

- zapis nie dociera do Firestore;
- dokument workoutu istnieje, ale klient dostaje błąd i ponawia tę samą logiczną finalizację.

Zapisujemy:

- liczbę dokumentów dla jednej logicznej sesji;
- identyfikatory dokumentów i zgodność payloadów;
- dostępność aktywnej sesji do ponowienia;
- skutek ponownego działania użytkownika;
- komunikaty UI po każdym wyniku.

Obecne użycie `addDoc` jest wskazówką, ale samo nie stanowi dowodu.

### 6.2 `WORKOUT-02`, `WORKOUT-03` i cleanup z `WORKOUT-05`

Wymuszamy błąd `deleteActiveSession` osobno podczas:

- poprawnego zakończenia workoutu;
- zwykłego odrzucenia sesji;
- odrzucenia starej sesji.

Dla każdego flow zapisujemy:

- aktywny stan Zustand;
- stan lokalnego backupu;
- stan `activeSessions/{uid}`;
- wynik nawigacji;
- główną akcję dashboardu;
- zachowanie po reloadzie i otwarciu `/workout/new` w niezależnym kontekście;
- toast lub trwały komunikat UI;
- uruchomienie albo brak retry, tombstone lub reconciliation.

Test musi odróżniać lokalne wyczyszczenie od potwierdzonego usunięcia w chmurze.

### 6.3 `WORKOUT-04` — częściowa materializacja i retry

Materializacja jest przerywana w trzech miejscach:

1. po utworzeniu workoutu, przed zastąpieniem `exerciseSessions`;
2. po zastąpieniu `exerciseSessions`, przed przeliczeniem rekordów;
3. po przeliczeniu rekordów, przed ustawieniem `materialized: true`.

Po każdej awarii retry tego samego workoutu wykonuje się co najmniej dwa razy. Sprawdzamy:

- wartość `materialized`;
- dokładną liczbę i identyfikatory `exerciseSessions`;
- brak lub obecność nieaktualnych dokumentów projekcji;
- liczbę sesji, najlepszą serię, wolumen i `lastPerformedAt` w rekordach;
- stan końcowy po retry;
- wynik kolejnego retry po sukcesie.

Deterministyczne identyfikatory `exerciseSessions` i pełne przeliczanie rekordów mogą oznaczać, że część ryzyk jest już zabezpieczona. Cała sekwencja nadal wymaga dowodu runtime.

### 6.4 Komunikaty UI z `WORKOUT-05`

Porównujemy komunikat lub badge z zapisanym stanem dla:

- błędu zapisu workoutu;
- zapisanego workoutu oczekującego na materializację;
- zapisanego i zmaterializowanego workoutu;
- zapisanego workoutu bez potwierdzonego cleanupu aktywnej sesji;
- odrzucenia sesji bez potwierdzonego cleanupu.

Raport odpowiada, czy użytkownik rozróżnia te wyniki i czy ma możliwość odzyskania poprawnego stanu.

### 6.5 `WORKOUT-06` — refresh, niezależny klient, offline i stara sesja

Zakres obejmuje:

- reload po poprawnej finalizacji;
- reload po błędzie usunięcia aktywnej sesji;
- niezależny kontekst otwarty przed i po finalizacji;
- finalizację w jednym kontekście, gdy drugi ma starszy snapshot sesji;
- przejście offline przed zapisem, po zdalnym commicie i podczas cleanupu;
- kontynuowanie oraz odrzucanie starej sesji przy udanym i nieudanym cleanupie.

Sprawdzamy, czy stara sesja może wrócić, nadpisać nowszy stan, utworzyć duplikat albo pokazać mylącą akcję na dashboardzie.

Nie budujemy ogólnego zestawu testów systemu rozproszonego dla całej aplikacji.

## 7. Artefakty

Faza R dostarcza:

1. focused testy charakterystyki i reprodukcji;
2. testowe implementacje awarii oraz minimalne punkty wstrzykiwania zależności;
3. `docs/audits/2026-07-11-phase-r-workout-lifecycle-review.md`;
4. macierz `WORKOUT-01`–`WORKOUT-06` z zatwierdzonymi angielskimi statusami;
5. aktualizację roadmapy, która zawęża Fazę 1 wyłącznie do potwierdzonych problemów.

Każdy wpis raportu zawiera:

```text
Hipoteza
Kroki reprodukcji
Zaobserwowany stan Firestore, lokalny i UI
Dowód w kodzie i testach
Status
Konsekwencja dla Fazy 1
```

Jeśli żadna hipoteza nie zostanie potwierdzona, roadmapa oznacza Fazę 1 jako `DONE — no implementation required`.

## 8. Bramka zakończenia

Faza R jest zakończona dopiero wtedy, gdy:

- wszystkie sześć hipotez ma zatwierdzony status i dowód;
- dane testowe są sprzątane po sukcesie i błędzie;
- żaden mechanizm fault injection nie jest osiągalny z produkcyjnego runtime;
- przechodzą lint, unit/support, testy reguł Firestore i build;
- przechodzi focused zestaw integracyjny i Playwright na emulatorach;
- raport audytu i roadmapa są zgodne;
- niezależny final review nie ma otwartych problemów Critical ani Important.

Pełny live Playwright suite pozostaje kontrolą integracyjną. Nie jest wymagany do klasyfikacji zachowań odtwarzalnych na emulatorach, ale jego niezweryfikowany stan pozostaje jawny do czasu użycia prywatnych danych logowania i środowiska bez blokady quota.

## 9. Warunki zatrzymania

Wracamy do projektu fazy, jeśli:

- reprodukcja wymaga mechanizmu awarii osiągalnego w produkcji;
- test nie odróżnia sukcesu zdalnego od odczytu z lokalnego cache;
- wspólne konto testowe pozostaje z workoutami, sesjami albo projekcjami;
- zmiana zaczyna naprawiać produkt zamiast opisywać obecne zachowanie;
- dowód zależy wyłącznie od opóźnień czasowych lub niestabilnej sieci;
- zakres Fazy 1 powstaje bez ukończonej macierzy dowodów.

## 10. Ograniczenia dla planu

Plan wykonawczy musi:

- rozdzielić infrastrukturę diagnostyczną, reprodukcję scenariuszy i syntezę wyników na niezależnie reviewowalne zadania;
- używać TDD dla nowych punktów wstrzykiwania i modeli awarii;
- podać dokładne pliki, komendy, oczekiwane błędy i granice commitów;
- wykorzystać fundament emulatorów z Fazy 0;
- wymagać realizacji subagentowej albo równoważnego review po każdym zadaniu;
- odłożyć wszystkie poprawki produktowe do późniejszego planu Fazy 1.
