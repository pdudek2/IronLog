# IronLog — Faza R: review cyklu życia treningu

## Zakres i środowisko

Review objął finalizację i odrzucenie treningu od zapisu `workouts`, przez materializację `exerciseSessions` i `records`, po usunięcie `activeSessions/{uid}` oraz zachowanie dashboardu, reloadu, niezależnego klienta, offline i starej sesji. Badanie wykonano na commitach od `ea9d41e` do `32971da`, z Firebase Auth i Firestore Emulator Suite oraz Chromium przez Playwright. Faza R nie wprowadza napraw produktowych: punkty awarii i ich implementacje znajdują się wyłącznie w testach.

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

1. `WorkoutPage.doFinish()` wywołuje zapis, lokalny cleanup i zdalne usunięcie sesji w tej kolejności (`src/pages/WorkoutPage.tsx:452`, `src/lib/workoutLifecycle.ts:38`).
2. `saveWorkoutWithPort()` tworzy nowy dokument przez port, a produkcyjny port używa `addDoc`; identyfikator nie jest związany ze stabilną tożsamością logicznej finalizacji (`src/lib/workoutService.ts:72`, `src/lib/workoutService.ts:88`). Utrata potwierdzenia po zdalnym commicie pozostawia więc klientowi stan, którego nie potrafi odróżnić od braku zapisu.
3. Po utworzeniu workoutu klient osobno wywołuje materializację. Jej błąd jest zamieniany na wynik `{ materialized: false }`, a nie na błąd całej finalizacji (`src/lib/workoutService.ts:78`).
4. Serwer zastępuje sesje ćwiczeń, przelicza rekordy i dopiero na końcu ustawia `materialized: true` (`api/lib/workoutProjection.ts:105`). Identyfikatory sesji są deterministyczne, zastąpienie usuwa nieaktualne dokumenty, a rekord jest liczony od nowa z aktualnych sesji (`api/lib/workoutProjection.ts:328`, `api/lib/workoutProjection.ts:360`, `api/lib/workoutProjection.ts:416`).
5. Po zapisaniu workoutu klient czyści Zustand przed próbą `deleteDoc(activeSessions/{uid})`. Błąd usunięcia jest zamieniany na `sessionCleanup: 'unconfirmed'`, więc finalizacja nadal przechodzi do dashboardu (`src/lib/workoutLifecycle.ts:29`, `src/lib/workoutLifecycle.ts:41`, `src/pages/WorkoutPage.tsx:463`). Zwykłe odrzucenie ma tę samą granicę (`src/lib/workoutLifecycle.ts:46`, `src/pages/WorkoutPage.tsx:529`).
6. Dashboard subskrybuje aktywną sesję, pokazuje dla niej akcję „Wróć do sesji” i bez oczekiwania uruchamia retry oczekujących materializacji (`src/lib/activeSessionService.ts:22`, `src/pages/DashboardPage.tsx:166`, `src/pages/DashboardPage.tsx:395`). Niezależny klient może równocześnie posiadać lokalny, oczekujący zapis Firestore i wysłać go po ponownym połączeniu.

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
- **Obserwacja:** pierwszy `addDoc` zakończył się zdalnym sukcesem, po czym test zwrócił błąd utraconego potwierdzenia. Ponowienie utworzyło drugi dokument. Firestore zawierał dwa dokumenty o różnych ID i równoważnych payloadach ćwiczeń; nie doszło jeszcze do lokalnego cleanupu ani zmiany UI, bo błąd zapisu propaguje się przed tym etapem (`src/lib/__tests__/workoutLifecycle.test.ts:11`). Produkcja używa generowanego ID z `addDoc` (`src/lib/workoutService.ts:88`).
- **Status:** `confirmed` — jedna logiczna finalizacja dała więcej niż jeden workout po utracie potwierdzenia i retry.
- **Faza 1:** kontrakt finalizacji musi zapobiegać wielokrotnemu utworzeniu workoutu dla tej samej logicznej operacji.

### WORKOUT-02

- **Reprodukcja:** `npm run test:review:workout` oraz `npm run test:e2e:workout-review`.
- **Testy:** `finish cleanup failure leaves activeSessions document after local clear`, `discard cleanup failure leaves activeSessions document after local clear` (`tests/review/workoutPersistence.review.test.ts:105`, `tests/review/workoutPersistence.review.test.ts:122`) oraz `shows a completed workout while restoring its residual active session in an independent client` (`tests/e2e/workout-lifecycle-review.spec.ts:154`).
- **Obserwacja:** finish i zwykły discard wyczyściły Zustand, zwróciły `sessionCleanup: 'unconfirmed'`, a dokument `activeSessions/{uid}` nadal istniał. W teście przeglądarkowym dashboard równocześnie pokazał ukończony workout i akcję „Wróć do sesji”; nowy, niezależny kontekst odtworzył Bench Press z pozostałej sesji. Lokalny backup jest czyszczony wraz z lokalnym stanem, ale zdalny dokument pozostaje źródłem ponownego nawodnienia.
- **Status:** `confirmed` — lokalny stan został zamknięty, mimo że w chmurze pozostała wznawialna sesja.
- **Faza 1:** zamknięcie lokalne nie może oznaczać zakończonego cleanupu, dopóki zdalny stan nie osiągnie bezpiecznego wyniku.

### WORKOUT-03

- **Reprodukcja:** `npm run test:review:workout` oraz `npm run test:e2e:workout-review`.
- **Testy:** dwa testy cleanupu finish/discard z `WORKOUT-02` oraz `stale discard masks delete failure and persists a replacement session` (`tests/review/workoutPersistence.review.test.ts:138`).
- **Obserwacja:** `confirmCleanup()` jedynie przechwytuje błąd i zwraca stan `unconfirmed`; nie zapisuje tombstone'u ani pracy do ponowienia (`src/lib/workoutLifecycle.ts:29`). Finish i discard nawigują dalej bez mechanizmu konwergencji (`src/pages/WorkoutPage.tsx:463`, `src/pages/WorkoutPage.tsx:529`). Przy odrzuceniu starej sesji błąd delete również został przechwycony, po czym nowa sesja została zapisana pod tym samym adresem (`src/lib/workoutLifecycle.ts:53`, `src/hooks/useActiveSession.ts:257`). Dla finish/discard pozostałość zachowała działanie produktowe: dashboard i niezależny klient mogły ją wznowić.
- **Status:** `confirmed` — brak istniejącego mechanizmu, który automatycznie domyka niepotwierdzony cleanup w każdym zbadanym flow.
- **Faza 1:** kontrakt cleanupu musi gwarantować późniejszą konwergencję po niepotwierdzonym usunięciu.

### WORKOUT-04

- **Reprodukcja:** `npm run test:review:workout`.
- **Testy:** `retries consistently after beforeExerciseSessions`, `retries consistently after afterExerciseSessions` i `retries consistently after afterRecords` (`tests/review/workoutProjection.review.test.ts:116`).
- **Obserwacja:** bezpośrednio po awariach workout miał `materialized: false`; liczba `exerciseSessions` wynosiła odpowiednio 0, 1 i 1, a rekord był obecny tylko po checkpointcie `afterRecords`. Po pierwszym retry każdy przypadek miał `materialized: true`, dokładnie jedną sesję powiązaną z właściwym workoutem oraz rekord `totalSessions=1`, `maxWeight=80`, `maxReps=5`, `bestVolume=400`. Drugi retry zachował ten sam znormalizowany stan (`tests/review/workoutProjection.review.test.ts:145`, `tests/review/workoutProjection.review.test.ts:162`).
- **Status:** `already_protected` — wszystkie osiągalne częściowe checkpointy konwergują, a dodatkowy retry jest idempotentny już w baseline przed poprawkami Fazy 1.
- **Faza 1:** brak pracy dla `WORKOUT-04`; zachować istniejące inwarianty i test charakterystyki.

### WORKOUT-05

- **Reprodukcja:** `npm run test:e2e:workout-review` i `npm run test:review:workout`.
- **Testy:** `shows only the sync badge while materialization remains pending` (`tests/e2e/workout-lifecycle-review.spec.ts:188`) oraz przypadki cleanupu finish/discard z `WORKOUT-02`.
- **Obserwacja:** workout z `materialized: false` był widoczny w historii jedynie z badge'em `sync`; nie zawierał tekstu o oczekiwaniu, błędzie ani ponowieniu (`tests/e2e/workout-lifecycle-review.spec.ts:207`, `src/pages/DashboardPage.tsx:693`). Po zapisanym workoucie z niepotwierdzonym cleanupem finish pokazywał komunikat błędu cleanupu, ale zaraz potem przechodził do dashboardu i pokazywał ogólne „Trening zapisany!” (`src/pages/WorkoutPage.tsx:463`). Zwykły discard także nawigował po niepotwierdzonym cleanupie. UI nie oferował trwałej, dokładnej akcji odzyskania dla tych odmiennych stanów persystencji.
- **Status:** `confirmed` — nie każdy materialnie odmienny wynik ma dokładny i użyteczny sygnał odzyskania.
- **Faza 1:** UI musi rozróżniać zapis, oczekującą projekcję i niepotwierdzone zamknięcie sesji oraz wskazywać właściwy następny krok.

### WORKOUT-06

- **Reprodukcja:** `npm run test:e2e:workout-review`.
- **Testy:** `offline second client resurrects the deleted active session`, `continuing a stale session refreshes and persists its timer` oraz `discarding a stale session persists an empty current replacement` (`tests/e2e/workout-lifecycle-review.spec.ts:45`, `tests/e2e/workout-lifecycle-review.spec.ts:95`, `tests/e2e/workout-lifecycle-review.spec.ts:123`).
- **Obserwacja:** dwa niezależne `BrowserContext` nie współdzieliły cache. Klient B zmienił liczbę powtórzeń na 6 i przeszedł offline. Klient A zakończył trening, dashboard się otworzył, a odczyt Admin SDK potwierdził brak `activeSessions/{uid}`. Po powrocie B online jego oczekujący zapis odtworzył dokument z `reps: '6'` (`tests/e2e/workout-lifecycle-review.spec.ts:56`). Osobne testy potwierdziły, że jawne kontynuowanie starej sesji odświeża timer, a odrzucenie zapisuje pustą bieżącą sesję; nie chronią one jednak przed wyścigiem offline.
- **Status:** `confirmed` — niezależny, nieaktualny klient może odtworzyć zamkniętą sesję.
- **Faza 1:** wieloklientowy kontrakt zamknięcia musi odrzucać lub bezpiecznie godzić spóźnione zapisy aktywnej sesji.

## Zakres rekomendowany dla Fazy 1

Faza 1 ma status `READY` i obejmuje wyłącznie `WORKOUT-01`, `WORKOUT-02`, `WORKOUT-03`, `WORKOUT-05` oraz `WORKOUT-06`. `WORKOUT-04` pozostaje udokumentowany jako `already_protected` i nie jest pracą implementacyjną Fazy 1. Szczegółowy projekt Fazy 1 powinien opisać wspólny kontrakt tożsamości finalizacji, konwergencji cleanupu, uczciwego stanu UI oraz ochrony przed spóźnionym zapisem wieloklientowym, bez rozszerzania zakresu o inne hipotezy.

## Weryfikacja i ograniczenia

Świeża pełna bramka Task 6 na `32971da` zakończyła się następująco:

- `npm run lint` — exit 0;
- `npm run test:unit` — 22/22 pliki, 122/122 testy;
- `npm run test:rules` — 1/1 plik, 8/8 testów;
- `npm run test:review:workout` — 2/2 pliki, 7/7 testów;
- `npm run build` — exit 0, z nieblokującym ostrzeżeniem Vite o chunku przekraczającym 500 kB;
- `npm run test:e2e:isolated` — 13/13 testów Playwright;
- `npm run test:e2e:workout-review` — 6/6 testów Playwright, bez retry;
- `git diff --check` — exit 0.

W outputach emulatorów pozostały nieblokujące ostrzeżenia Node o `url.parse()` i konflikt `NO_COLOR`/`FORCE_COLOR`; podczas celowego przejścia offline pojawiły się oczekiwane diagnostyki WebChannel Firestore. Pełny live `npm run test:e2e` nie jest częścią dowodu klasyfikacyjnego: nadal wymaga prywatnych `TEST_EMAIL` i `TEST_PASSWORD` oraz środowiska bez blokady quota. Zestawy emulatorowe dają deterministyczny dowód dla opisanych granic, ale nie zastępują pełnej kontroli integracyjnej live przed release.
