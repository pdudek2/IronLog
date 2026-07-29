# Faza 8B — Serializacja projekcji workoutu

**Status:** DESIGN APPROVED — plan wykonawczy gotowy

**Data:** 2026-07-29

**Właściciel zakresu:** `WORKOUT-RACE-01`, `WORKOUT-RACE-02`, `WORKOUT-RACE-03` z `docs/roadmap/ROADMAP.md`

**Route:** Large / Phased — zatwierdzony jest kontrakt Fazy 8B; plan obejmie wyłącznie tę fazę

**Ryzyko:** Elevated — błąd może odtworzyć projekcje usuniętego treningu i zafałszować rekordy

**Plan wykonawczy:** [`../plans/2026-07-29-phase-8b-workout-projection-serialization.md`](../plans/2026-07-29-phase-8b-workout-projection-serialization.md)

## 1. Problem

`materializeWorkoutForUser`, `updateFinishedWorkoutForUser` i
`deleteFinishedWorkoutForUser` wykonują kilka niezależnych odczytów i zapisów.
Materializacja może odczytać workout, zatrzymać się, a następnie zapisać
`exerciseSessions` już po usunięciu dokumentu workoutu. Analogicznie starsza
materializacja może nadpisać projekcję nowszej aktualizacji.

Samo ponowienie operacji naprawia częściową materializację, ale nie zapewnia
kolejności między konkurencyjnymi operacjami. Usunięcie musi być terminalne:
gdy zostanie atomowo przyjęte, żaden spóźniony update ani retry materializacji
nie może odtworzyć danych.

## 2. Zatwierdzony kierunek

Istniejący, serwerowy dokument `closedSessions/{workoutId}` zostaje
autorytatywnym fence'em projekcji. Nie powstaje nowa kolekcja, kolejka ani
czasowy lock.

```ts
interface ProjectionFence {
  projectionState: 'pending' | 'ready' | 'deleted'
  projectionRevision: number
  projectionExerciseKeys: Array<{
    exerciseSource: 'global' | 'user'
    exerciseId: string
  }>
  deletedAt?: number
}
```

- `pending` oznacza workout wymagający dokończenia projekcji.
- `ready` oznacza projekcję zgodną z bieżącą rewizją workoutu.
- `deleted` jest stanem terminalnym.
- `projectionRevision` unieważnia operacje rozpoczęte dla starszego stanu.
- `projectionExerciseKeys` przechowuje pełny zbiór kluczy, których rekordy
  mogą wymagać przeliczenia.

Pola zamknięcia sesji (`userId`, `sessionId`, `outcome`, `workoutId`,
`closedAt`) zachowują obecne znaczenie. Fence dotyczy tylko tombstone'ów z
`outcome: 'finished'`; sesje `discarded` pozostają bez zmian.

## 3. Niezmienniki

1. Każdy zapis projekcji sprawdza ten sam `closedSessions/{workoutId}`.
2. Kontrola rewizji i odpowiadający jej zapis są jedną transakcją.
3. Zbiór dotkniętych ćwiczeń trafia do fence'a przed pierwszą mutacją
   `exerciseSessions`.
4. Zmiana workoutu zwiększa rewizję przed uruchomieniem nowej materializacji.
5. Delete atomowo zwiększa rewizję, ustawia `deleted` i usuwa workout.
6. Po `deleted` dozwolony jest wyłącznie idempotentny cleanup delete.
7. Sukces delete jest zwracany dopiero po usunięciu projekcji i przeliczeniu
   rekordów.
8. Retry dowolnej operacji nie zmienia jej logicznego wyniku.

## 4. Przepływ operacji

### 4.1 Finalizacja

Transakcja finalizacji tworzy workout z `materialized: false`, tombstone
`finished` ze stanem `pending`, rewizją `1` i kluczami bieżących
ćwiczeń, a następnie usuwa aktywną sesję. Materializacja otrzymuje dokładną
rewizję utworzoną przez tę transakcję.

Istniejący kontrakt `materialized | projection_pending` pozostaje bez zmian.

### 4.2 Aktualizacja

Transakcja:

1. odczytuje workout i odpowiadający mu tombstone;
2. potwierdza właściciela i odrzuca stan `deleted`;
3. zapisuje nowe dane workoutu z `materialized: false`;
4. zwiększa rewizję i ustawia `pending`;
5. zapisuje sumę starych oraz nowych kluczy ćwiczeń.

Po zatwierdzeniu transakcji rozpoczyna się materializacja nowej rewizji.
Materializacja starszej rewizji może dokończyć wyłącznie zapis, który
zatwierdził się przed zmianą fence'a; kolejne transakcje zostają odrzucone.

### 4.3 Materializacja

Materializacja pobiera spójny workout i fence. Dla legacy workoutu inicjalizuje
brakujące pola fence'a przed pierwszym zapisem projekcji.

Zbiór do przeliczenia jest sumą kluczy zapisanych w fence, istniejących sesji
i docelowych ćwiczeń workoutu. Ta suma trafia do fence'a przed zastąpieniem
sesji.

Zastąpienie `exerciseSessions`, zapis lub usunięcie każdego rekordu oraz
końcowe ustawienie `materialized: true` są chronione odczytem fence'a w tej
samej transakcji co zapis. Każdy etap wymaga oczekiwanej rewizji i stanu
różnego od `deleted`.

Jeżeli liczba dokumentów wymaga podziału na porcje, każda porcja ponownie
sprawdza fence. Częściowo zatwierdzone porcje pozostają naprawialne przez
retry tej samej rewizji.

Końcowa transakcja ustawia `ready` i redukuje `projectionExerciseKeys` do
kluczy bieżącego workoutu. Do tego momentu fence zachowuje pełną sumę starych
i nowych kluczy.

### 4.4 Usunięcie

Pierwsza transakcja:

1. odczytuje workout i tombstone albo rozpoznaje rozpoczęty wcześniej delete;
2. zapisuje pełny znany zbiór kluczy ćwiczeń;
3. zwiększa rewizję, ustawia `deleted` i `deletedAt`;
4. usuwa workout.

Po tej transakcji spóźnione update'y i materializacje nie mogą zatwierdzić
zapisu. Cleanup pobiera wszystkie pozostałe `exerciseSessions`, dołącza ich
klucze do zbioru z fence'a, usuwa je i przelicza odpowiadające rekordy.

Retry dla tombstone'a `deleted` powtarza cleanup i zwraca sukces. Brak
dokumentu workoutu nie jest wtedy błędem.

## 5. Legacy i kompatybilność

Nie wykonujemy osobnej migracji.

- Workout z tombstone'em `finished`, ale bez pól fence'a, jest inicjalizowany
  przy pierwszym update, delete albo materializacji.
- Legacy workout bez tombstone'a otrzymuje kompatybilny `closedSessions`
  podczas pierwszej operacji serwerowej, po potwierdzeniu właściciela.
- Workout oznaczony `materialized: true` zaczyna jako `ready`; pozostały jako
  `pending`.
- Brak workoutu i brak poprawnego tombstone'a nadal oznacza zasób
  nieistniejący albo sprzeczny, a nie ukończony delete.
- Klient nadal odczytuje wyłącznie `workouts`, `exerciseSessions` i `records`.
  `closedSessions` pozostaje niedostępne w regułach Firestore.

Nie są potrzebne nowe indeksy ani zmiany publicznego modelu danych.

## 6. Błędy i odzyskiwanie

- Stara rewizja kończy się kontrolowanym `409` z kodem
  `projection_superseded`.
- Update albo materializacja po terminalnym delete kończy się `409` z kodem
  `workout_deleted`.
- Naruszenie własności pozostaje `403`.
- Awaria delete przed transakcją terminalną nie zmienia danych.
- Awaria po ustawieniu `deleted` może pozostawić projekcję do posprzątania,
  ale nie pozwala jej odtworzyć; retry kończy cleanup.
- Awaria materializacji pozostawia `pending`, więc obecny retry dashboardu
  pozostaje właściwą akcją.
- Powtórny delete dla `deleted` jest idempotentny i nie zwraca błędu
  „trening nie istnieje”.

Nie dodajemy nowego UI. Obecne komunikaty oraz akcje retry dla delete i
materializacji pozostają powierzchnią odzyskiwania.

## 7. Rollout i rollback

Zmiana jest kompatybilna z istniejącymi dokumentami i nie wymaga migracji
przed wdrożeniem. Kod serwera powinien zostać wdrożony jako jedna wersja,
ponieważ wszystkie trzy endpointy muszą respektować ten sam fence.

Po pierwszym zapisaniu `projectionState: 'deleted'` nie wolno przywracać
starego kodu projekcji: ignorowałby fence i mógłby odtworzyć dane. W razie
problemu bezpieczną reakcją jest czasowe wyłączenie endpointów mutujących i
forward-fix. Tombstone'ów `deleted` nie usuwamy w tej fazie.

Push i deploy produkcyjny wymagają osobnej zgody.

## 8. Weryfikacja

Deterministyczne testy na emulatorze rozszerzają istniejące checkpointy
projekcji i kontrolują kolejność obietnic.

### 8.1 Macierz przeplotów

- materializacja zatrzymana przed oraz po zapisie `exerciseSessions`, potem
  delete;
- delete zatrzymany po ustawieniu `deleted`, po cleanupie sesji i przed
  przeliczeniem rekordów, potem retry;
- update rozpoczynający się przed delete oraz update po delete;
- starsza materializacja konkurująca z nowszą rewizją;
- dwa idempotentne retry tej samej materializacji i tego samego delete;
- legacy workout z brakującymi polami fence'a i bez tombstone'a;
- cudzy workout oraz tombstone `discarded`.

### 8.2 Asercje końcowe

- po delete nie istnieje workout ani `exerciseSessions` dla jego ID;
- żaden rekord nie wynika z usuniętego workoutu;
- stare i nowe klucze ćwiczeń są przeliczone;
- starsza rewizja nie wykonuje zapisu po zmianie fence'a;
- drugi retry zachowuje identyczny stan logiczny;
- istniejące retry częściowej materializacji nadal konwerguje.

### 8.3 Gate fazy

- targeted integracje współbieżności na Auth + Firestore Emulator;
- istniejące integracje `workoutProjection` i `workoutClosure`;
- testy jednostkowe endpointów i walidacji dotkniętych kontraktów;
- testy reguł potwierdzające brak dostępu klienta do `closedSessions`;
- lint, pełny unit i build.

Faza nie zmienia UI, dlatego obserwacja wizualna nie jest bramką. Runtime
verification stanowią rzeczywiste transakcje i przeploty na emulatorze
Firestore.

## 9. Zakres implementacji

Plan wykonawczy może objąć:

- `api/_lib/workoutProjection.ts`;
- integrację pól fence'a w `api/_lib/workoutClosure.ts`;
- minimalne, stabilne kody błędów;
- rozszerzenie istniejących checkpointów testowych;
- integracje emulatorowe dla `WORKOUT-RACE-01–03`;
- aktualizację roadmapy i closeout fazy.

Poza zakresem pozostają kolejki, Cloud Tasks, nowa kolekcja locków, zmiany UI,
przebudowa całego systemu rekordów oraz produkcyjny deploy.

## 10. Kryteria akceptacji

- usunięcie jest terminalne i wygrywa z opóźnionym zapisem;
- update i materializacja są odrzucane po delete;
- konkurencyjne rewizje nie nadpisują nowszego stanu;
- cleanup delete obejmuje pełną sumę dotkniętych ćwiczeń;
- retry materializacji i delete jest idempotentne;
- legacy dane działają bez migracji;
- wszystkie gate'y Fazy 8B przechodzą bez retry maskującego błąd.
