# IronLog — projekt Fazy 1: integralność cyklu życia treningu

**Status:** zatwierdzona do planowania

**Data:** 2026-07-11

**Zakres roadmapy:** `WORKOUT-01`, `WORKOUT-02`, `WORKOUT-03`, `WORKOUT-05`, `WORKOUT-06`

## 1. Cel

Faza 1 wprowadza jeden kontrakt zamknięcia aktywnej sesji. Ten sam mechanizm obsługuje zakończenie treningu, zwykłe odrzucenie i odrzucenie starej sesji.

Po wdrożeniu:

- ponowienie finalizacji tworzy najwyżej jeden workout;
- lokalna sesja znika dopiero po potwierdzonym zamknięciu;
- niejednoznaczny wynik requestu ma trwały i bezpieczny retry;
- spóźniony zapis drugiego lub offline klienta nie odtwarza zamkniętej sesji;
- UI rozróżnia ukończony zapis, oczekującą projekcję oraz niepotwierdzone zamknięcie.

`WORKOUT-04` pozostaje poza zakresem. Faza R potwierdziła, że istniejąca materializacja konwerguje przy retry.

## 2. Wybrana architektura

Każda aktywna sesja otrzymuje trwałe `sessionId`. Identyfikator przechodzi przez Zustand, lokalny backup, `activeSessions`, request zamknięcia, workout i tombstone.

Zamknięcie odbywa się przez endpoint korzystający z Firebase Admin SDK. Transakcja Firestore:

1. sprawdza aktywną sesję i istniejący tombstone;
2. dla finalizacji tworzy workout o deterministycznym ID równym `sessionId`;
3. zapisuje `closedSessions/{sessionId}`;
4. usuwa pasujący dokument `activeSessions/{uid}`.

Workout, tombstone i usunięcie sesji są jednym atomowym commitem. Materializacja pozostaje osobnym, idempotentnym etapem wykonywanym po transakcji.

Reguły Firestore odrzucają zapis aktywnej sesji, jeżeli istnieje tombstone dla jej `sessionId`. Tombstone pozostaje bezterminowo. Jest małym dokumentem i chroni przed zapisem klienta, który może wrócić online bez określonego limitu czasu.

## 3. Model danych

### 3.1 Aktywna sesja

`ActiveWorkout` i `activeSessions/{uid}` otrzymują wymagane pole:

```ts
sessionId: string
```

Nowe sesje używają UUID generowanego po stronie klienta. Identyfikator nie zmienia się podczas edycji, synchronizacji ani odświeżenia strony.

Istniejące sesje bez tego pola są odczytywane jako `legacy-${startedAt}`. Wartość jest deterministyczna, więc dwa klienty wyprowadzą ten sam identyfikator. Pierwszy kolejny zapis migruje dokument do nowego schematu.

Lokalny backup stosuje tę samą normalizację. Nie wolno generować nowego losowego ID podczas odczytu starego dokumentu lub backupu.

### 3.2 Workout

Nowe workouty utworzone przez endpoint finalizacji mają:

```ts
sessionId: string
```

ID dokumentu workoutu jest równe `sessionId`. Historyczne workouty zachowują dotychczasowe losowe ID i nie wymagają migracji.

Klient przestaje bezpośrednio tworzyć nowe dokumenty w `workouts`. Reguły blokują klientowi create, update i delete; zapis nowych workoutów wykonuje Admin SDK.

### 3.3 Tombstone

Nowa kolekcja top-level:

```ts
closedSessions/{sessionId} = {
  userId: string
  sessionId: string
  outcome: 'finished' | 'discarded'
  workoutId: string | null
  closedAt: number
}
```

Klient nie może czytać ani modyfikować tombstone'ów. Reguły `activeSessions` mogą jednak użyć `exists()` do odrzucenia zapisu zamkniętej sesji.

## 4. Kontrakt endpointów

### 4.1 Finalizacja

`POST /api/finalize-workout` przyjmuje `sessionId` oraz dane ukończonego workoutu. Użytkownik wynika wyłącznie z tokenu Firebase.

Serwer waliduje:

- format `sessionId`;
- `startedAt`, `finishedAt`, label i ćwiczenia;
- `exerciseSource` dla każdej referencji;
- zgodność aktywnej sesji z `sessionId`;
- zgodność istniejącego workoutu i tombstone'a z zalogowanym użytkownikiem.

Odpowiedź sukcesu ma jeden z dwóch statusów:

```ts
type FinalizeWorkoutStatus = 'materialized' | 'projection_pending'
```

- `materialized` — workout zapisany, sesja zamknięta, projekcja zakończona;
- `projection_pending` — workout zapisany i sesja zamknięta, ale projekcja wymaga retry.

Ponowienie z tym samym `sessionId` nie tworzy kolejnego workoutu. Jeżeli workout już istnieje, endpoint sprawdza jego właściciela i ponawia materializację, gdy nadal jest oczekująca.

### 4.2 Odrzucenie

`POST /api/discard-session` przyjmuje `sessionId`.

Transakcja zapisuje tombstone z `outcome: 'discarded'` i usuwa pasującą aktywną sesję. Ponowienie tego samego requestu zwraca sukces. Tombstone z `outcome: 'finished'` nie może zostać zamieniony na `discarded`.

Brak aktywnego dokumentu nie blokuje odrzucenia, jeśli nie istnieje sprzeczny tombstone. Serwer zapisuje tombstone, aby zabezpieczyć późniejszy offline write.

### 4.3 Konflikty

Jeżeli `activeSessions/{uid}` wskazuje inne `sessionId`, endpoint nie usuwa nowej sesji. Zwraca kontrolowany konflikt `session_mismatch`.

Kody błędów i statusy w TypeScript pozostają po angielsku. Polski tekst jest warstwą prezentacji.

## 5. Idempotencja i kolejność operacji

Finalizacja używa następujących inwariantów:

1. `sessionId` oznacza jedną logiczną sesję.
2. `workouts/{sessionId}` może powstać tylko dla tej sesji i tego użytkownika.
3. `closedSessions/{sessionId}` jest nieodwracalnym dowodem zamknięcia.
4. Tombstone i usunięcie aktywnej sesji powstają w tej samej transakcji co workout.
5. Materializacja może się nie udać, ale nie cofa zapisu ani zamknięcia sesji.
6. Retry finalizacji i materializacji nie zmienia logicznego wyniku.

Transakcja odczytuje wszystkie potrzebne dokumenty przed zapisem. Nie nadpisuje istniejącego workoutu payloadem z ponowionego requestu. Przy retry istniejący dokument jest źródłem prawdy.

## 6. Lokalny intent zamknięcia

Przed requestem klient zapisuje w local storage rekord:

```ts
type WorkoutClosureIntent =
  | { action: 'finish'; session: ActiveWorkout; createdAt: number }
  | { action: 'discard'; session: ActiveWorkout; createdAt: number }
```

Rekord jest przypisany do UID. Zawiera kompletny snapshot potrzebny do ponowienia tej samej operacji.

Po utworzeniu intentu klient:

- zatrzymuje debounce i dalszy zapis tej sesji;
- blokuje edycję formularza;
- wysyła request;
- usuwa lokalny workout, backup i intent dopiero po jednoznacznym sukcesie endpointu.

Błąd sieci albo odpowiedź 5xx są niejednoznaczne. Intent pozostaje, UI przechodzi do `closure_unconfirmed`, a użytkownik może ponowić operację. Reload `/workout/new` odtwarza ten stan zamiast zapisywać backup z powrotem jako aktywną sesję.

Błąd walidacji lub `session_mismatch` jest rozstrzygający. UI nie wykonuje automatycznego retry i proponuje ponowne wczytanie aktualnego stanu.

## 7. Zachowanie klienta

### 7.1 Zakończenie treningu

```text
editing
  → submitting
  → materialized
  → dashboard
```

albo:

```text
editing
  → submitting
  → projection_pending
  → dashboard z trwałą informacją o synchronizacji
```

Przy niejednoznacznym wyniku:

```text
editing
  → submitting
  → closure_unconfirmed
  → retry tego samego sessionId
```

### 7.2 Odrzucenie

Zwykłe i stare sesje korzystają z tego samego endpointu. Nowa pusta sesja po odrzuceniu starej powstaje dopiero po potwierdzonym zamknięciu poprzedniej i otrzymuje nowe `sessionId`.

Przy niejednoznacznym wyniku klient nie wraca do dashboardu i nie tworzy replacement session.

### 7.3 Drugi klient i offline

Klient bez własnego intentu może nadal mieć starszy snapshot. Po zamknięciu sesji:

- jego oczekujący zapis zostaje odrzucony przez reguły z powodu tombstone'a;
- zapis nie zastępuje nowszej sesji ani nie odtwarza starej;
- autorytatywny snapshot serwera z `onSnapshot` usuwa zamkniętą sesję z lokalnego UI, gdy zwraca brak dokumentu, albo zastępuje ją, gdy zwraca inne `sessionId`;
- sam błąd `permission-denied` zapisu nie jest dowodem tombstone'a ani zamknięcia zdalnego: klient zachowuje lokalną sesję i stan recovery, raportuje błąd synchronizacji i czeka na autorytatywne uzgodnienie przez `onSnapshot`.

**Zatwierdzona korekta implementacyjna:** sam błąd zapisu nigdy nie czyści lokalnego snapshotu ani recovery. Lokalny stan może zostać usunięty lub zastąpiony wyłącznie po autorytatywnym uzgodnieniu `onSnapshot` (`remote null` albo inna sesja). Chroni to dane użytkownika przed błędną interpretacją niezwiązanego z tombstone'em `permission-denied`.

## 8. UI i komunikaty

Stan końcowy jest widoczny także poza toastem.

| Stan kodu | Komunikat | Następny krok |
|---|---|---|
| `materialized` | „Trening zapisany” | przejście do dashboardu |
| `projection_pending` | „Trening zapisany. Statystyki oczekują na synchronizację.” | automatyczny retry i przycisk „Ponów synchronizację” |
| `closure_unconfirmed` | „Nie udało się potwierdzić zamknięcia sesji.” | „Spróbuj ponownie” |
| `session_mismatch` | „Ta sesja nie jest już aktywna na serwerze.” | ponowne wczytanie aktualnego stanu |

W `closure_unconfirmed` snapshot treningu pozostaje widoczny, ale pola edycji oraz akcje zmieniające sesję są zablokowane. Użytkownik nie może przypadkiem rozpocząć drugiej finalizacji z nowym ID.

Dashboard pokazuje przy oczekującym workoucie pełny opis zamiast samego badge'a `sync`. Po nieudanym automatycznym retry widoczny jest przycisk ręcznego ponowienia i stan błędu.

## 9. Reguły Firestore i bezpieczeństwo

Reguły wymagają `sessionId` w nowych i migrowanych `activeSessions` oraz sprawdzają:

```text
!exists(/databases/$(database)/documents/closedSessions/$(request.resource.data.sessionId))
```

Klient zachowuje owner CRUD dla otwartej aktywnej sesji. Nie otrzymuje dostępu do `closedSessions` ani zapisu `workouts`.

Endpointy korzystają z istniejącego `requireUserId`, limitu body i walidatorów workoutu. Nie ufają `userId` z requestu. Payload nie może zawierać pól administracyjnych, takich jak `materialized`, `closedAt` albo dowolne ID właściciela.

## 10. Strategia testów

### Unit

- generowanie i zachowanie `sessionId`;
- deterministyczna migracja starej sesji i backupu;
- zapis, odczyt i usunięcie closure intentu;
- mapowanie odpowiedzi i błędów API na angielskie statusy;
- lifecycle nie czyści danych przed potwierdzeniem.

### Firestore rules

- otwarta sesja z `sessionId` może być tworzona i aktualizowana przez właściciela;
- sesja bez `sessionId` nie przechodzi po migracji reguł;
- klient nie może pisać workoutów ani tombstone'ów;
- zapis aktywnej sesji z istniejącym tombstone'em jest odrzucony;
- spóźniona aktualizacja starej sesji nie nadpisuje nowej.

### Integracja na emulatorze

- pierwszy finalize tworzy jeden workout, tombstone i usuwa aktywną sesję;
- utrata odpowiedzi po commicie oraz retry nadal dają jeden workout;
- dwa równoległe finalize dla jednego `sessionId` dają jeden wynik;
- retry oczekującej materializacji konwerguje;
- discard jest idempotentny;
- `session_mismatch` nie usuwa nowej sesji;
- sprzeczne tombstone'y są odrzucane.

### Playwright

- poprawna finalizacja i reload nie przywracają sesji;
- utrata odpowiedzi pokazuje `closure_unconfirmed`, a retry kończy ten sam workout;
- oczekująca projekcja ma trwały komunikat i działający retry;
- klient B zapisujący offline nie odtwarza sesji zamkniętej przez klienta A;
- nieudany discard zachowuje intent i nie nawiguje do dashboardu;
- odrzucenie starej sesji tworzy replacement dopiero po potwierdzonym sukcesie.

Testy przeglądarkowe korzystają z emulatorów i osobnych `BrowserContext`. Produkcyjny mechanizm nie dostaje debug flag ani endpointu fault injection.

## 11. Zakres zmian

### W zakresie

- `sessionId` w aktywnym treningu i nowych workoutach;
- migracja istniejących aktywnych sesji i backupów;
- `closedSessions` i reguły blokujące resurrection;
- serwerowa finalizacja i odrzucenie;
- lokalny closure intent i jawny retry;
- uczciwe statusy UI dla zamknięcia i projekcji;
- testy unit, rules, emulator integration i focused Playwright;
- aktualizacja raportu Fazy R oraz roadmapy po przejściu bramek.

### Poza zakresem

- przebudowa algorytmu materializacji i rekordów;
- migracja historycznych workoutów do nowych ID;
- ogólny system kolejek offline dla całej aplikacji;
- przenoszenie wszystkich zapisów aktywnej sesji do API;
- pozostałe problemy z roadmapy, w tym Faza 2 i `RELEASE-08`.

## 12. Bramka zakończenia

Faza 1 jest zakończona, gdy:

- każdy punkt `WORKOUT-01/02/03/05/06` ma zielony test regresyjny;
- powtórzona i równoległa finalizacja daje jeden workout;
- tombstone blokuje zapis offline klienta po zamknięciu;
- żaden flow nie czyści lokalnego snapshotu przed jednoznacznym sukcesem;
- UI pokazuje właściwy stan i następny krok bez polegania wyłącznie na toastach;
- przechodzą lint, unit, rules, focused integration, build i focused Playwright;
- istniejące testy materializacji z `WORKOUT-04` nadal przechodzą;
- final review nie ma otwartych problemów Critical ani Important.

Pełny live Playwright suite i czynności produkcyjne pozostają długiem weryfikacyjnym `RELEASE-08`, dopóki nie zostaną wykonane z prywatnym kontem testowym.

## 13. Kolejność wdrożenia

Zmiana wymaga zgodnej kolejności:

1. wdrożyć endpointy oraz klienta korzystającego z nowego protokołu;
2. sprawdzić finalizację i odrzucenie na środowisku docelowym;
3. opublikować reguły blokujące bezpośrednie tworzenie workoutów i zapisy sesji bez `sessionId`.

Odwrócenie tej kolejności mogłoby chwilowo zablokować użytkownikom zapis treningu. Kontrola produkcyjna i publikacja reguł należą do późniejszej bramki release, ale plan implementacji ma przygotować zgodne artefakty i opisać ten warunek w handoffie.

## 14. Warunki zatrzymania

Wracamy do projektu, jeśli:

- transakcja nie może atomowo utworzyć workoutu, zapisać tombstone'a i usunąć aktywnej sesji;
- reguły nie potrafią odrzucić zapisu na podstawie tombstone'a;
- retry wymaga wygenerowania nowego `sessionId`;
- obsługa utraty odpowiedzi usuwa snapshot potrzebny do odzyskania;
- rozwiązanie wymaga osłabienia reguł lub produkcyjnego fault injection;
- wdrożenie zaczyna obejmować inne fazy roadmapy.
