# IronLog — Faza R: przegląd cyklu życia treningu

## Zakres i środowisko

Przegląd objął finalizację i odrzucenie treningu od zapisu `workouts`, przez materializację `exerciseSessions` i `records`, po usunięcie `activeSessions/{uid}` oraz zachowanie dashboardu, reloadu, niezależnego klienta, offline i starej sesji. Badanie wykonano na commitach od `ea9d41e` do `32971da`, z Firebase Auth i Firestore Emulator Suite oraz Chromium przez Playwright. Faza R nie wprowadza napraw produktowych: punkty awarii i ich implementacje znajdują się wyłącznie w testach.

> **Nota historyczna:** reprodukcje opisują stan bazowy z commita `448e46a`. Po wdrożeniu Fazy 1 usunięto runtime tests oczekujące duplikacji i odtwarzania zamkniętej sesji; zastępują je regresje `tests/e2e/workout-lifecycle.spec.ts`, które wymagają poprawnego kontraktu zamknięcia.

Statusy zastosowano dokładnie według zatwierdzonej tabeli klasyfikacji:

| Hipoteza | Status | Konsekwencja dla Fazy 1 |
|---|---|---|
| `WORKOUT-01` | `confirmed` | objąć Fazą 1 |
| `WORKOUT-02` | `confirmed` | objąć Fazą 1 |
| `WORKOUT-03` | `confirmed` | objąć Fazą 1 |
| `WORKOUT-04` | `already_protected` | nie wchodzi do Fazy 1 |
| `WORKOUT-05` | `confirmed` | objąć Fazą 1 |
| `WORKOUT-06` | `confirmed` | objąć Fazą 1 |

## Mapa finalizacji i granice awarii

1. `WorkoutPage.doFinish()` wywołuje zapis, lokalny cleanup i zdalne usunięcie sesji w tej kolejności (`src/pages/WorkoutPage.tsx:458`, `src/lib/workoutLifecycle.ts:41`).
2. `saveWorkoutWithPort()` tworzy nowy dokument przez port, a produkcyjny port używa `addDoc`; identyfikator nie jest związany ze stabilną tożsamością logicznej finalizacji (`src/lib/workoutService.ts:72`, `src/lib/workoutService.ts:90`). Utrata potwierdzenia po zdalnym commicie pozostawia więc klientowi stan, którego nie potrafi odróżnić od braku zapisu.
3. Po utworzeniu workoutu klient osobno wywołuje materializację. Jej błąd jest zamieniany na wynik `{ materialized: false }`, a nie na błąd całej finalizacji (`src/lib/workoutService.ts:80`, `src/lib/workoutService.ts:82`, `src/lib/workoutService.ts:84`).
4. Serwer zastępuje sesje ćwiczeń, przelicza rekordy i dopiero na końcu ustawia `materialized: true` (`api/lib/workoutProjection.ts:110`, `api/lib/workoutProjection.ts:115`). Identyfikatory sesji są deterministyczne, zastąpienie usuwa nieaktualne dokumenty, a rekord jest liczony od nowa z aktualnych sesji (`api/lib/workoutProjection.ts:329`, `api/lib/workoutProjection.ts:369`, `api/lib/workoutProjection.ts:380`, `api/lib/workoutProjection.ts:416`).
5. Po zapisaniu workoutu klient czyści Zustand przed próbą `deleteDoc(activeSessions/{uid})`. Błąd usunięcia jest zamieniany na `sessionCleanup: 'unconfirmed'`, więc finalizacja nadal przechodzi do dashboardu (`src/lib/workoutLifecycle.ts:29`, `src/lib/workoutLifecycle.ts:41`, `src/pages/WorkoutPage.tsx:467`). Zwykłe odrzucenie ma tę samą granicę (`src/lib/workoutLifecycle.ts:46`, `src/pages/WorkoutPage.tsx:529`).
6. Dashboard subskrybuje aktywną sesję, pokazuje dla niej akcję „Wróć do sesji” i bez oczekiwania uruchamia retry oczekujących materializacji (`src/lib/activeSessionService.ts:27`, `src/pages/DashboardPage.tsx:175`, `src/pages/DashboardPage.tsx:403`). Niezależny klient może równocześnie posiadać lokalny, oczekujący zapis Firestore i wysłać go po ponownym połączeniu.

## Macierz wyników WORKOUT-01–06

| ID | Wynik runtime | Stan końcowy | Status |
|---|---|---|---|
| `WORKOUT-01` | commit workoutu doszedł do Firestore, odpowiedź została utracona, a retry powtórzył logiczną finalizację | dwa równoważne dokumenty o różnych ID | `confirmed` |
| `WORKOUT-02` | finish i discard wyczyściły stan lokalny mimo błędu zdalnego delete | `activeSessions/{uid}` pozostał i był możliwy do wznowienia | `confirmed` |
| `WORKOUT-03` | po niepotwierdzonym cleanupie nie uruchomił się retry, tombstone ani reconciliation | pozostałość nadal sterowała akcją dashboardu i niezależnym klientem | `confirmed` |
| `WORKOUT-04` | awaria została wymuszona przed sesjami, po sesjach i po rekordach; następnie wykonano dwa retry | pierwszy retry przywrócił poprawną projekcję, drugi nie zmienił jej logicznego stanu | `already_protected` |
| `WORKOUT-05` | pending materialization miał tylko badge `sync`; finish z niepotwierdzonym cleanupem nadal kończył się ogólnym sukcesem i nawigacją | UI nie dawał dokładnego, trwałego sygnału odzyskania dla wszystkich wyników persystencji | `confirmed` |
| `WORKOUT-06` | klient B zapisał zmianę offline, klient A zakończył trening i usunął sesję, po czym B wrócił online | klient B odtworzył usunięty dokument z wartością `reps: '6'` | `confirmed` |

## Dowody szczegółowe

### WORKOUT-01

- **Reprodukcja:** `npm run test:review:workout`.
- **Test:** `remote commit succeeded, acknowledgement was lost, retry creates a second logical workout` (`tests/review/workoutPersistence.review.test.ts:69`).
- **Obserwacja:** pierwszy `addDoc` zakończył się zdalnym sukcesem, po czym test zwrócił błąd utraconego potwierdzenia. Ponowienie utworzyło drugi dokument. Firestore zawierał dwa dokumenty o różnych ID i identycznym pełnym payloadzie logicznego workoutu po wyłączeniu wyłącznie ID dokumentu (`tests/review/workoutPersistence.review.test.ts:97`, `tests/review/workoutPersistence.review.test.ts:103`). Nie doszło jeszcze do lokalnego cleanupu ani zmiany UI, bo błąd zapisu propaguje się przed tym etapem (`src/lib/__tests__/workoutLifecycle.test.ts:11`). Produkcja używa generowanego ID z `addDoc` (`src/lib/workoutService.ts:90`).
- **Status:** `confirmed` — jedna logiczna finalizacja dała więcej niż jeden workout po utracie potwierdzenia i retry.
- **Faza 1:** kontrakt finalizacji musi zapobiegać wielokrotnemu utworzeniu workoutu dla tej samej logicznej operacji.

### WORKOUT-02

- **Reprodukcja:** `npm run test:review:workout` oraz `npm run test:e2e:workout-review`.
- **Testy:** `finish cleanup failure leaves activeSessions document after local clear`, `discard cleanup failure leaves activeSessions document after local clear` (`tests/review/workoutPersistence.review.test.ts:106`, `tests/review/workoutPersistence.review.test.ts:123`) oraz `shows a completed workout while restoring its residual active session in an independent client` (`tests/e2e/workout-lifecycle-review.spec.ts:154`).
- **Obserwacja:** finish i zwykły discard wyczyściły Zustand, zwróciły `sessionCleanup: 'unconfirmed'`, a dokument `activeSessions/{uid}` nadal istniał. W teście przeglądarkowym dashboard równocześnie pokazał ukończony workout i akcję „Wróć do sesji”; nowy, niezależny kontekst odtworzył Bench Press z pozostałej sesji. Lokalny backup jest czyszczony wraz z lokalnym stanem (`src/hooks/useActiveSession.ts:239`), ale zdalny dokument pozostaje źródłem odtworzenia stanu.
- **Status:** `confirmed` — lokalny stan został zamknięty, mimo że w chmurze pozostała wznawialna sesja.
- **Faza 1:** zamknięcie lokalne nie może oznaczać zakończonego cleanupu, dopóki zdalny stan nie osiągnie bezpiecznego wyniku.

### WORKOUT-03

- **Reprodukcja:** `npm run test:review:workout` oraz `npm run test:e2e:workout-review`.
- **Testy:** dwa testy cleanupu finish/discard z `WORKOUT-02` oraz `stale discard masks delete failure and persists a replacement session` (`tests/review/workoutPersistence.review.test.ts:139`).
- **Obserwacja:** `confirmCleanup()` jedynie przechwytuje błąd i zwraca stan `unconfirmed`; nie zapisuje tombstone'u ani pracy do ponowienia (`src/lib/workoutLifecycle.ts:29`). Finish i discard nawigują dalej bez mechanizmu konwergencji (`src/pages/WorkoutPage.tsx:467`, `src/pages/WorkoutPage.tsx:537`). Przy odrzuceniu starej sesji błąd delete również został przechwycony, po czym nowa sesja została zapisana pod tym samym adresem (`src/lib/workoutLifecycle.ts:57`, `src/hooks/useActiveSession.ts:282`). Dla finish/discard pozostałość zachowała działanie produktowe: dashboard i niezależny klient mogły ją wznowić.
- **Status:** `confirmed` — brak istniejącego mechanizmu, który automatycznie domyka niepotwierdzony cleanup w każdym zbadanym flow.
- **Faza 1:** kontrakt cleanupu musi gwarantować późniejszą konwergencję po niepotwierdzonym usunięciu.

### WORKOUT-04

- **Reprodukcja:** `npm run test:review:workout`.
- **Testy:** `retries consistently after beforeExerciseSessions`, `retries consistently after afterExerciseSessions` i `retries consistently after afterRecords` (`tests/review/workoutProjection.review.test.ts:124`).
- **Obserwacja:** każdy przypadek rozpoczął się również od nieaktualnego dokumentu projekcji. Bezpośrednio po awariach workout miał `materialized: false`; przed zastąpieniem pozostawał stary dokument, a po checkpointach `afterExerciseSessions` i `afterRecords` istniała już wyłącznie nowa sesja. Po pierwszym retry każdy przypadek miał `materialized: true`, dokładnie jeden dokument o oczekiwanym deterministycznym ID, bez starej projekcji, oraz rekord `totalSessions=1`, `maxWeight=80`, `maxReps=5`, `bestVolume=400` i `lastPerformedAt` równym `finishedAt` workoutu. Drugi retry ponownie nie zawierał starego dokumentu i zachował pełny stabilny stan workoutu, sesji oraz rekordu; z porównania wyłączono tylko celowo zmienne `records.updatedAt` (`tests/review/workoutProjection.review.test.ts:84`, `tests/review/workoutProjection.review.test.ts:101`, `tests/review/workoutProjection.review.test.ts:113`, `tests/review/workoutProjection.review.test.ts:140`, `tests/review/workoutProjection.review.test.ts:181`, `tests/review/workoutProjection.review.test.ts:200`, `tests/review/workoutProjection.review.test.ts:201`, `tests/review/workoutProjection.review.test.ts:209`, `tests/review/workoutProjection.review.test.ts:210`).
- **Status:** `already_protected` — wszystkie osiągalne częściowe checkpointy konwergują, a dodatkowy retry jest idempotentny już w baseline przed poprawkami Fazy 1.
- **Faza 1:** brak pracy dla `WORKOUT-04`; zachować istniejące inwarianty i test charakterystyki.

### WORKOUT-05

- **Reprodukcja:** `npm run test:e2e:workout-review` i `npm run test:review:workout`.
- **Testy:** `shows only the sync badge while materialization remains pending` (`tests/e2e/workout-lifecycle-review.spec.ts:188`) oraz przypadki cleanupu finish/discard z `WORKOUT-02`.
- **Obserwacja:** workout z `materialized: false` był widoczny w historii jedynie z badge'em `sync`; nie zawierał tekstu o oczekiwaniu, błędzie ani ponowieniu (`tests/e2e/workout-lifecycle-review.spec.ts:207`, `tests/e2e/workout-lifecycle-review.spec.ts:223`, `tests/e2e/workout-lifecycle-review.spec.ts:226`, `src/pages/DashboardPage.tsx:693`, `src/pages/DashboardPage.tsx:698`). Po zapisanym workoucie z niepotwierdzonym cleanupem finish pokazywał komunikat błędu cleanupu, ale zaraz potem przechodził do dashboardu i pokazywał ogólne „Trening zapisany!” (`src/pages/WorkoutPage.tsx:463`, `src/pages/WorkoutPage.tsx:467`, `src/pages/WorkoutPage.tsx:468`). Zwykły discard także nawigował po niepotwierdzonym cleanupie. UI nie oferował trwałej, dokładnej akcji odzyskania dla tych odmiennych stanów persystencji.
- **Status:** `confirmed` — nie każdy materialnie odmienny wynik ma dokładny i użyteczny sygnał odzyskania.
- **Faza 1:** UI musi rozróżniać zapis, oczekującą projekcję i niepotwierdzone zamknięcie sesji oraz wskazywać właściwy następny krok.

### WORKOUT-06

- **Reprodukcja:** `npm run test:e2e:workout-review`.
- **Testy:** `offline second client resurrects the deleted active session`, `continuing a stale session refreshes and persists its timer` oraz `discarding a stale session persists an empty current replacement` (`tests/e2e/workout-lifecycle-review.spec.ts:45`, `tests/e2e/workout-lifecycle-review.spec.ts:95`, `tests/e2e/workout-lifecycle-review.spec.ts:123`).
- **Obserwacja:** dwa niezależne `BrowserContext` nie współdzieliły cache. Klient B przeszedł offline, a następnie zmienił liczbę powtórzeń na 6, tworząc oczekujący zapis bez luki planisty między edycją a utratą sieci. Klient A zakończył trening, dashboard się otworzył, a odczyt Admin SDK potwierdził brak `activeSessions/{uid}`. Po powrocie B online jego oczekujący zapis odtworzył dokument z `reps: '6'` (`tests/e2e/workout-lifecycle-review.spec.ts:66`, `tests/e2e/workout-lifecycle-review.spec.ts:67`, `tests/e2e/workout-lifecycle-review.spec.ts:75`, `tests/e2e/workout-lifecycle-review.spec.ts:76`, `tests/e2e/workout-lifecycle-review.spec.ts:85`). Osobne testy potwierdziły, że jawne kontynuowanie starej sesji odświeża timer, a odrzucenie zapisuje pustą bieżącą sesję; nie chronią one jednak przed wyścigiem offline.
- **Status:** `confirmed` — niezależny, nieaktualny klient może odtworzyć zamkniętą sesję.
- **Faza 1:** wieloklientowy kontrakt zamknięcia musi odrzucać lub bezpiecznie godzić spóźnione zapisy aktywnej sesji.

## Remediacja Fazy 1

Faza 1 ma status `DONE` i objęła wyłącznie `WORKOUT-01`, `WORKOUT-02`, `WORKOUT-03`, `WORKOUT-05` oraz `WORKOUT-06`. Implementacja znajduje się w commitach `1cb59af–8cd4731` na bazie `1e140d0`. `WORKOUT-04` pozostaje `already_protected`; Faza 1 nie zmienia jego kontraktu materializacji. Historyczne reprodukcje powyżej nadal opisują baseline `448e46a`, a poniższe regresje dowodzą zachowania po remediacji.

| Punkt | Status po Fazie 1 | Nazwany dowód regresyjny |
|---|---|---|
| `WORKOUT-01` | `remediated` | `survives a lost transaction acknowledgement and retry` (`tests/integration/workoutClosure.integration.test.ts`) oraz `lost finalize acknowledgement keeps recovery intent and retry creates exactly one workout` (`tests/e2e/workout-lifecycle.spec.ts`) — utrata potwierdzenia i retry pozostawiają jeden workout. |
| `WORKOUT-02` | `remediated` | `persists intent before request and clears recovery only after confirmed success` oraz `returns closure_unconfirmed and keeps the intent and session on ambiguous failure` (`src/lib/__tests__/workoutLifecycle.test.ts`) — lokalne recovery nie jest czyszczone przed potwierdzeniem zamknięcia. |
| `WORKOUT-03` | `remediated` | `round-trips a complete finish snapshot`, `round-trips a complete discard snapshot` (`src/lib/__tests__/workoutClosureIntent.test.ts`) oraz `lost finalize acknowledgement keeps recovery intent and retry creates exactly one workout` (`tests/e2e/workout-lifecycle.spec.ts`) — po utracie odpowiedzi reload odtwarza trwały intent, a retry domyka tę samą operację. |
| `WORKOUT-04` | `already_protected` | `retries consistently after beforeExerciseSessions`, `retries consistently after afterExerciseSessions` i `retries consistently after afterRecords` (`tests/integration/workoutProjection.integration.test.ts`) — projekcja nadal konwerguje i drugi retry pozostaje idempotentny. |
| `WORKOUT-05` | `remediated` | `lost finalize acknowledgement keeps recovery intent and retry creates exactly one workout`, `projection_pending reflects committed closure and remains visible on dashboard` oraz `failed dashboard materialization offers retry and later success clears the failure` (`tests/e2e/workout-lifecycle.spec.ts`) — UI rozróżnia `closure_unconfirmed`, `projection_pending` i zapis zmaterializowany oraz podaje właściwe akcje. |
| `WORKOUT-06` | `remediated` | `rejects creation and update using a tombstoned sessionId`, `does not let a late tombstoned write overwrite a newer session` (`tests/rules/firestore.rules.test.ts`) oraz `offline client write cannot resurrect a session closed by another client` (`tests/e2e/workout-lifecycle.spec.ts`) — tombstone odrzuca spóźniony zapis offline. |

## Weryfikacja i ograniczenia

Świeża pełna bramka Fazy 1 na checkoutcie `8cd4731` zakończyła się następująco:

- `npm run lint` — exit 0;
- `npm run test:unit` — 28/28 plików, 190/190 testów;
- `npm run test:rules` — 1/1 plik, 10/10 testów;
- `npm run test:integration:workout` — 2/2 pliki, 18/18 testów, w tym natychmiastowe finish i discard legacy sesji bez pola `sessionId`;
- `npm run build` — exit 0, z nieblokującym ostrzeżeniem Vite o chunku przekraczającym 500 kB;
- `npm run test:e2e:workout` — 9/9 testów Playwright, bez retry;
- `npm run test:e2e:isolated` — 13/13 testów Playwright, bez retry.

Historyczna pełna bramka Fazy R (Task 6) na `32971da` zakończyła się następująco:

- `npm run lint` — exit 0;
- `npm run test:unit` — 22/22 pliki, 122/122 testy;
- `npm run test:rules` — 1/1 plik, 8/8 testów;
- `npm run test:review:workout` — 2/2 pliki, 7/7 testów;
- `npm run build` — exit 0, z nieblokującym ostrzeżeniem Vite o chunku przekraczającym 500 kB;
- `npm run test:e2e:isolated` — 13/13 testów Playwright;
- `npm run test:e2e:workout-review` — 6/6 testów Playwright, bez retry;
- `git diff --check` — exit 0.

W wynikach emulatorów pozostały nieblokujące ostrzeżenia Node o `url.parse()` i konflikt `NO_COLOR`/`FORCE_COLOR`; celowe scenariusze offline wygenerowały oczekiwane odmowy reguł po tombstone. Pełny live `npm run test:e2e`, kontrole produkcyjnego deploymentu Vercel i publikacja reguł Firestore nie zostały wykonane i pozostają otwarte w `RELEASE-08`. Kolejność rolloutowa to: (1) API i SPA, (2) smoke finish/discard, (3) restrykcyjne reguły Firestore. Zestawy emulatorowe dają deterministyczny dowód dla opisanych granic, ale nie zastępują pełnej kontroli live przed release.
