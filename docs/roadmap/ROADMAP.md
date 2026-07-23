# IronLog — kanoniczna roadmapa po audytach

Status dokumentu: **kanoniczny backlog programu naprawczego**
Stan przeglądu: **APPROVED — fazy A, 0, R, 1, 2, 2B, 3, 4, 5, 6A, 6B i 6C zakończone i zintegrowane lokalnie; Faza S pozostaje READY**
Źródła: audyt techniczny, pierwszy audyt UI, Senior Design Review z 2026-07-14 oraz uzupełniający pełny audyt runtime z 2026-07-20
Ostatnia aktualizacja: 2026-07-23

## 1. Cel dokumentu

Ten dokument zbiera ustalenia z obu audytów w jeden uporządkowany program prac. Nie jest planem implementacyjnym. Każda faza ma być później rozwinięta w osobny, szczegółowy plan zawierający konkretne zmiany w plikach, testy, kolejność commitów i procedurę wdrożenia.

Roadmapa odpowiada na cztery pytania:

1. Co nadal wymaga pracy?
2. W jakiej kolejności powinno zostać wykonane?
3. Które problemy należy rozwiązać razem, bo mają wspólną przyczynę?
4. Po czym poznamy, że dana faza naprawdę jest zakończona?

## 2. Zasady prowadzenia roadmapy

- Identyfikatory faz i punktów są trwałe. Nie należy ich zmieniać po rozpoczęciu implementacji.
- Jedna faza powinna być możliwa do zaplanowania, wdrożenia, przetestowania i poddania niezależnemu przeglądowi.
- Naprawa produktowa i jej test regresyjny należą do tej samej fazy.
- Nie uznajemy fazy za zakończoną tylko dlatego, że działa happy path. Kryteria wyjścia muszą obejmować błędy, odświeżenie, nawigację i odpowiedni viewport.
- Nie otwieramy ponownie świadomych decyzji zapisanych w `WORKING_CONTEXT.md`, chyba że pojawią się nowe dane produktowe.
- Priorytet oznacza kolejność ograniczania ryzyka, a nie szacowany nakład pracy.

### Statusy

- **READY** — zakres można rozwinąć w szczegółowy plan.
- **DESIGN IN PROGRESS** — trwa uzgadnianie docelowego kontraktu; implementacja nie jest jeszcze autoryzowana.
- **DESIGN APPROVED** — docelowy kontrakt został zaakceptowany i może zostać rozwinięty przez szczegółowy plan wykonawczy.
- **BLOCKED** — przed planowaniem potrzebna jest decyzja albo zewnętrzna zmiana.
- **DONE** — zakres wdrożony i zweryfikowany.
- **LATER** — wartościowy, ale nieblokujący odbioru projektu.

## 3. Stan bazowy i prace już zamknięte

Poniższe obszary są częścią aktualnego baseline'u i nie wracają jako aktywne fazy:

- **BASE-01 — Progress data loading: DONE.** Jeden zakres 180 dni, lokalne przełączanie 30/90 dni, niezależne wyniki sesji i rekordów, jawne stany partial/offline/truncated oraz zachowanie ostatniego poprawnego snapshotu.
- **BASE-02 — Rekordy Progress: DONE.** Rekordy pozostają all-time i są tak opisane w UI.
- **BASE-03 — Start szablonu: DONE.** Start sesji jest natychmiastowy, zapis do `activeSessions` jest transakcyjny, a konflikt z istniejącą sesją ma jawny kontrakt.
- **BASE-04 — Odporność startu szablonu offline: DONE.** Brak opóźnionego, niejawnego uruchomienia po odzyskaniu sieci.
- **BASE-05 — Kierunek wizualny Puls: LOCKED.** Roadmapa poprawia zachowanie i dostępność bez ponownego projektowania całego interfejsu.
- **BASE-06 — Analityka runtime: DONE.** GA4 i Contentsquare/Hotjar zostały usunięte z aplikacji, konfiguracji i zależności; materiały zaliczeniowe pozostają w archiwum historycznym. Cleanup zmiennych Vercel pozostaje kontrolą release `RELEASE-08`.
- **BASE-07 — Fundament E2E: DONE.** Krytyczne testy używają gotowości właściwych ekranów, automatycznej diagnostyki przeglądarki i cleanupu mutacji; osobny gate Auth+Firestore emulator działa bez sekretów i produkcyjnego quota.
- **BASE-08 — Materializacja workoutu: ALREADY PROTECTED.** `WORKOUT-04` ma status `already_protected`: częściowe stany przed sesjami, po sesjach i po rekordach konwergują przy pierwszym retry, a dodatkowy retry zachowuje tę samą projekcję.

Aktualny baseline jakości:

- lint przechodzi,
- build przechodzi z istniejącym ostrzeżeniem o rozmiarze chunku,
- 468 testów jednostkowych oraz testów wsparcia przechodzi,
- 1 plik i 16 testów reguł Firestore przechodzi,
- ukierunkowana integracja zamknięcia i projekcji workoutu przechodzi: 2 pliki i 20 testów,
- isolated Auth+Firestore emulator przechodzi: 13 testów Playwright na świeżych emulatorach,
- ukierunkowana regresja cyklu treningu przechodzi: 9 testów Playwright bez retry,
- ukierunkowana bramka dostępności przechodzi: 15 testów Playwright, 4 zamierzone skipy viewportowe, 16 artefaktów `.aria.yml` oraz kontrolowany headed walkthrough na desktopie 1280×800 i Pixel 5,
- live `npm run test:e2e` pozostaje otwartą kontrolą release wymagającą prywatnych `TEST_EMAIL` i `TEST_PASSWORD`.

## 4. Mapa faz

| Kolejność | Faza | Priorytet | Status | Główny rezultat |
|---:|---|---|---|---|
| 1 | A — Kontrolowane usunięcie analityki | P1 | DONE | GA4 i Contentsquare/Hotjar usunięte z runtime; dowody integracji zachowane jako archiwum zaliczenia |
| 2 | 0 — Minimalny fundament weryfikacji | P0 | DONE | Krytyczny gate działa bez produkcyjnego quota; readiness, diagnostyka i cleanup mają wspólne kontrakty |
| 3 | R — Ukierunkowany przegląd cyklu życia treningu | P0 | DONE | `WORKOUT-01–06` mają dowody i jednoznaczne statusy |
| 4 | 1 — Integralność cyklu życia treningu | P0 | DONE | `WORKOUT-01`, `WORKOUT-02`, `WORKOUT-03`, `WORKOUT-05` i `WORKOUT-06` naprawione w `1cb59af–4fe1ec5` |
| 5 | 2 — Uczciwe stany danych i błędów | P0 | DONE | Błąd odczytu nigdy nie wygląda jak prawidłowy pusty stan |
| 6 | 2B — Integralność własnych ćwiczeń | P2 | DONE | Równoległe utworzenie i zmiana nazwy nie produkują duplikatów |
| 7 | 3 — Krytyczna dostępność i nawigacja | P1 | DONE | Główne przepływy są nazwane, fokusowalne i poprawnie komunikują stan |
| 8 | 4 — Ergonomia mobile i edytor planów | P1 | DONE | Sterowanie dotykowe spełnia minimalne wymiary, a duży plan można wygodnie edytować i zapisać |
| 9 | 5 — Feedback, copy i integralność interfejsu | P1 | DONE | Akcje i routing komunikują prawdę, kontrast jest dostępny, a capture screenshotów nie udaje regresji wizualnej |
| 10 | 6A — Stream i concurrency AI | P1 | DONE | Reset i błędy streamu nie dopisują spóźnionych lub częściowych odpowiedzi |
| 11 | 6B — Poprawność i koszt kontekstu AI | P1 | DONE | Częściowa awaria danych nie fabrykuje pustego obrazu użytkownika |
| 12 | 6C — Walidacja planów i obsługa konfiguracji AI | P2 | DONE | Plan respektuje brief, a konfiguracja i błędy modeli prowadzą użytkownika do właściwego działania |
| 13 | S — Hardening CSP | P2 | DESIGN APPROVED | Pozostała polityka CSP jest egzekwowana albo rzeczywiście raportuje naruszenia |
| 14 | 7 — Bramka release | P0 | BLOCKED | Jedna powtarzalna procedura potwierdza gotowość po zakończeniu wymaganych faz |

Zależności:

```text
Faza A ──► Faza 0 ──► Faza R ──► Faza 1 (tylko potwierdzony zakres) ──► Faza 7
             │
             ├──► Faza 2 ──► Faza 3 ──► Faza 4 ──► Faza 5 ─────────► Faza 7
             ├──► Faza 2B ──────────────────────────────────────────► Faza 7
             ├──► Faza 6A ──┐
             ├──► Faza 6B ──┼───────────────────────────────────────► Faza 7
             └──► Faza 6C ──┘

Faza A ──► Faza S ──────────────────────────────────────────────────► Faza 7
```

Faza A jest pierwsza, ponieważ upraszcza profil, global setup E2E, monitoring requestów i CSP przed zmianami w testach. Faza R zakończyła blokadę Fazy 1 i zawęziła ją do pięciu potwierdzonych punktów. Po fazie 0 można równolegle przygotowywać fazy 2, 2B, 3 i pakiety AI. Fazy 6A oraz 6B są wymagane do zamknięcia zweryfikowanych P1; decyzje o historii czatu i dziennym limicie pozostają w backlogu LATER.

## 5. Fazy programu

### Faza A — Kontrolowane usunięcie analityki

**Decyzja produktowa:** GA4 i Contentsquare/Hotjar były funkcją wykonaną na potrzeby zaliczenia. Nie są częścią docelowego produktu IronLog. Usuwamy je z runtime zamiast inwestować w naprawę synchronizacji zgód i lifecycle vendorów. Dowód wykonania integracji pozostaje w historii Git oraz archiwalnej dokumentacji ze screenshotami.

**Cel:** usunąć cały aktywny pion analityki bez pozostawienia martwego UI, kodu zgód, zależności, zmiennych środowiskowych albo zbędnych wyjątków CSP.

**Zakres kanoniczny:**

- **ANALYTICS-01:** usunąć inicjalizację GA4 i Contentsquare/Hotjar, listener zmian tras oraz wszystkie runtime importy analityki.
- **ANALYTICS-02:** usunąć banner zgody i sekcję analityki z profilu; po zmianie nie może pozostać UI sugerujące, że telemetryka jest dostępna lub konfigurowalna.
- **ANALYTICS-03:** usunąć storage i API zgody, powiązane style oraz testy sprawdzające banner i lokalny wybór `granted`/`denied`.
- **ANALYTICS-04:** usunąć zależności analityczne z `package.json`/lockfile oraz zmienne `VITE_GA_MEASUREMENT_ID`, `VITE_CSQ_TAG_ID` i `VITE_HOTJAR_SITE_ID` z kontraktu środowiska.
- **ANALYTICS-05:** usunąć originy GA4 i Contentsquare/Hotjar z CSP.
- **ANALYTICS-06:** zaktualizować README i opis funkcji tak, aby analityka nie była przedstawiana jako część aktualnego produktu.
- **ANALYTICS-07:** zachować screenshoty i krótki opis integracji jako wyraźnie oznaczone archiwum zaliczenia. Archiwum nie może zawierać aktywnych instrukcji konfiguracji produkcyjnej ani sekretów.

**Kryteria wyjścia:**

- bundle i drzewo zależności nie zawierają `react-ga4`, `@hotjar/browser` ani kodu Contentsquare;
- aplikacja nie renderuje bannera zgody ani ustawień analityki w profilu;
- przy nawigacji, reloadzie i zmianie tras nie powstają requesty do Google Analytics, Google Tag Manager, Hotjar ani Contentsquare;
- CSP i `.env.example` nie zawierają originów ani zmiennych usuniętych vendorów;
- README opisuje aktualny produkt bez analityki, a materiały zaliczeniowe są zachowane w jednoznacznie historycznej sekcji;
- testy produktu nie ustawiają już `ironlog.analyticsConsent` ani nie omijają nieistniejącego bannera.

**Poza zakresem:** zastępowanie usuniętych vendorów innym narzędziem analitycznym. Jeżeli kiedyś pojawi się realna potrzeba telemetryki, będzie to nowa decyzja produktowa i osobna faza.

**Zależności:** brak zależności repozytoryjnych. Brak requestów można potwierdzić focused smoke Playwright albo ręcznym Network panelem. Usunięcie zmiennych w Vercelu pozostaje autoryzowaną operacją release w `RELEASE-08`.

### Faza 0 — Minimalny fundament weryfikacji

**Cel:** stworzyć bezpieczną osłonę dla kolejnych napraw bez budowania rozbudowanej infrastruktury ponad potrzeby projektu.

**Zakres kanoniczny:**

- **TEST-01:** zastąpić asercje ograniczone do `.page-shell` asercjami gotowości właściwego ekranu i jego kluczowej funkcji.
- **TEST-03:** zabezpieczyć wszystkie testy mutujące wspólne konto przez `try/finally`, cleanup fixture albo unikalne dane testowe; w pierwszej kolejności test profilu.
- **TEST-05:** dodać rejestrowanie `pageerror`, krytycznych błędów konsoli i `requestfailed` do wspólnej warstwy E2E.
- **TEST-06:** wybrać pragmatyczny sposób ograniczenia zależności od limitu produkcyjnego Firestore: emulator, osobny projekt testowy albo izolowany zestaw fixture'ów. Decyzja ma uwzględniać deadline.

**Kryteria wyjścia:**

- krytyczne testy nie przechodzą, jeśli właściwy ekran utknął w loading/error;
- przerwany test nie pozostawia zmienionego profilu, szablonu ani aktywnej sesji;
- wspólna warstwa E2E rejestruje nieobsłużone błędy strony, krytyczne błędy konsoli i nieudane requesty;
- wybrana strategia izolacji pozwala uruchamiać testy potrzebne kolejnym fazom bez zależności od quota produkcyjnego projektu.

**Poza zakresem:** pełna migracja wszystkich testów na emulator, jeśli prostsza izolacja daje wystarczającą deterministyczność.

### Faza R — Ukierunkowany przegląd cyklu życia treningu

**Status: DONE.** Raport kanoniczny: `docs/audits/2026-07-11-phase-r-workout-lifecycle-review.md`.

**Cel:** zweryfikować hipotezy dodane podczas syntezy roadmapy, zanim otrzymają status potwierdzonych problemów P0.

**Zakres kanoniczny:**

- **REVIEW-WORKOUT-01:** odtworzyć zachowanie finalizacji przy niejednoznacznym wyniku zapisu i ustalić, czy możliwy jest duplikat workoutu.
- **REVIEW-WORKOUT-02:** sprawdzić zachowanie po nieudanym usunięciu `activeSessions/{uid}` przy zakończeniu i odrzuceniu sesji.
- **REVIEW-WORKOUT-03:** zweryfikować retry materializacji, spójność rekordów i komunikaty UI dla `materialized: false`.
- **REVIEW-WORKOUT-04:** sprawdzić refresh, dwie karty, offline i stale session tylko w zakresie potrzebnym do potwierdzenia lub odrzucenia `WORKOUT-01–06`.
- **REVIEW-WORKOUT-05:** zapisać wynik jako macierz `potwierdzone / odrzucone / już zabezpieczone`, z dowodem w kodzie albo testem reprodukującym.

**Kryteria wyjścia:**

- każdy punkt `WORKOUT-01–06` ma status i dowód;
- faza 1 zawiera wyłącznie potwierdzone problemy;
- jeżeli żaden problem nie zostanie potwierdzony, faza 1 zostaje oznaczona `DONE — no implementation required`.

**Poza zakresem:** wdrażanie napraw produktowych. Faza R jest diagnostyczna; może dodać lub zachować test reprodukcyjny, ale nie zmienia kontraktu aplikacji.

**Wynik:** `WORKOUT-01`, `WORKOUT-02`, `WORKOUT-03`, `WORKOUT-05` i `WORKOUT-06` mają status `confirmed`. `WORKOUT-04` ma status `already_protected` i pozostaje w baseline, nie w Fazie 1. Żadna hipoteza nie otrzymała statusu `rejected`.

### Faza 1 — Integralność cyklu życia treningu

**Status: DONE.** Implementacja: commity `1cb59af–4fe1ec5` na bazie `1e140d0`, łącznie z końcową korektą po niezależnym review. Dowody regresyjne i aktualny dług weryfikacyjny opisuje raport Fazy R.

**Cel:** usunąć ryzyko utraty, duplikacji albo ponownego pojawienia się sesji w najważniejszym przepływie produktu.

**Zakres kanoniczny:**

Faza R potwierdziła dokładnie pięć punktów. Tylko one są autoryzowanym zakresem implementacyjnym Fazy 1:

- **WORKOUT-01:** nadać finalizacji idempotentny identyfikator lub inny kontrakt zapobiegający utworzeniu dwóch workoutów po niejednoznacznym wyniku requestu/retry.
- **WORKOUT-02:** nie traktować czyszczenia sesji jako zakończonego, jeśli lokalny stan został usunięty, ale dokument `activeSessions/{uid}` nadal istnieje.
- **WORKOUT-03:** zaprojektować retry/tombstone dla nieudanego usunięcia aktywnej sesji po zakończeniu i odrzuceniu treningu.
- **WORKOUT-05:** rozróżnić w UI „trening zapisany”, „trening zapisany, projekcja oczekuje” i „nie udało się potwierdzić zamknięcia sesji”.
- **WORKOUT-06:** zapobiec odtworzeniu zamkniętej sesji przez spóźniony zapis niezależnego lub offline klienta.

**Kryteria wyjścia:**

- wielokrotne wywołanie finalizacji tego samego logicznego treningu daje jeden workout;
- po udanym zakończeniu lub odrzuceniu dashboard nie proponuje wznowienia tej samej sesji;
- błąd usunięcia dokumentu z chmury jest odzyskiwalny, a nie tylko raportowany toastem;
- UI odróżnia zapis, oczekującą projekcję i niepotwierdzone zamknięcie oraz podaje właściwy następny krok;
- testy obejmują odświeżenie, niezależnego klienta offline i co najmniej jeden niejednoznaczny błąd sieciowy;
- istnieje deterministyczny, zielony dowód pełnej finalizacji treningu.

**Zależności:** zakończona faza R, TEST-03 i podstawowy mechanizm izolacji z fazy 0.

**Handoff wdrożeniowy:** artefakty są gotowe, ale produkcyjne czynności pozostają otwarte w `RELEASE-08`. Obowiązuje kolejność:

1. wdrożyć API i SPA;
2. wykonać smoke zakończenia i odrzucenia treningu;
3. opublikować restrykcyjne reguły Firestore.

### Faza 2 — Uczciwe stany danych i błędów

**Status: DONE.** Zakres wdrożony i zweryfikowany testami oraz kontrolowanym review desktop/mobile. Korekty broad final review są opisane w `.superpowers/sdd/final-fixes-report.md` i podniosły końcową bramkę unit z 224 do 229 testów.

**Cel:** oddzielić `loading`, `success-empty`, `success-data`, `error` i — tam gdzie ma sens — `stale-data`.

**Zakres kanoniczny:**

- **STATE-01:** błąd odczytu readiness nie może renderować formularza „brak wpisu” ani umożliwiać nieświadomego nadpisania istniejącej ankiety.
- **STATE-02:** błąd pobrania własnych ćwiczeń nie może renderować komunikatu „Brak własnych ćwiczeń”.
- **STATE-03:** dashboard ma otrzymać jawny stan błędu pobrania szablonów. Strona planów już rozróżnia błąd od pustej listy; w Fazie 2 zabezpieczamy ten kontrakt testem regresji zamiast przepisywać działające UI.
- **STATE-05:** każdy stan błędu otrzymuje retry albo jasny następny krok; toast nie może być jedynym trwałym nośnikiem informacji.
- **STATE-06:** współdzielony kontrakt stanu danych powinien być prosty i dopasowany do Vite SPA — bez budowania nowego frameworka zapytań.
- **STATE-07:** usunąć deterministyczny drugi odczyt Readiness wywoływany przez zmianę `lastCheckedDate`; ponowny odczyt ma następować tylko przy rzeczywistej zmianie dnia lub jawnym retry.

**Kryteria wyjścia:**

- testy wymuszają błąd każdego objętego odczytu i odróżniają go od pustej kolekcji;
- żaden ekran nie zachęca do utworzenia „pierwszego” zasobu po nieudanym odczycie;
- zachowane dane są oznaczone jako nieaktualne, jeśli ekran korzysta z retained snapshotu;
- pierwszy render Readiness wykonuje jeden odczyt.

**Zależności:** mechanizm błędów requestów z TEST-05.

**Poza zakresem:** wtórni konsumenci własnych ćwiczeń w selektorach treningu i edytora planu, historii oraz widokach szczegółowych. Nie udają oni obecnie pełnego pustego ekranu, a ich rozszerzenie zwiększyłoby Fazę 2 o kilka niezależnych przepływów. Zostają zapisani jako `LATER-07`.

### Faza 2B — Integralność własnych ćwiczeń

**Status: DONE — zweryfikowane i zintegrowane lokalnie.** Kontrakt zachowuje wszystkie istniejące `exerciseId` i dodaje transakcyjne claimy nazw dla create, rename i delete. Emulator potwierdza wyścigi create/rename, przejęcie legacy dokumentu, zwolnienie claimu oraz odrzucenie prób samodzielnego usunięcia lub przepięcia claimu. Pełna bramka po integracji: 468 unitów, 16 testów reguł, lint i build — PASS. Lokalna obserwacja w przeglądarce na emulatorach potwierdziła, że drugi zapis `Concurrent Curl` pozostawia formularz otwarty, zachowuje wartość pola i pokazuje alert duplikatu. Spec oraz ukończony plan znajdują się w [`specs/2026-07-23-phase-2b-user-exercise-uniqueness-design.md`](specs/2026-07-23-phase-2b-user-exercise-uniqueness-design.md) i [`plans/2026-07-23-phase-2b-user-exercise-uniqueness.md`](plans/2026-07-23-phase-2b-user-exercise-uniqueness.md).

**Cel:** zamknąć niezależne od UI ryzyko utworzenia dwóch własnych ćwiczeń o tej samej tożsamości przez równoległe klienty.

**Zakres kanoniczny:**

- **DATA-01:** zastąpić nieatomowe query → `addDoc` atomowym kontraktem unikalności, deterministycznym identyfikatorem albo równoważnym mechanizmem odpornym na wyścig.
- **DATA-02:** zachować prawidłową obsługę `exerciseSource: 'user'` i istniejących dokumentów podczas ewentualnej migracji identyfikatorów.
- **DATA-03:** dodać test współbieżności oraz jasny komunikat dla użytkownika, jeżeli ćwiczenie już istnieje.

**Kryteria wyjścia:**

- dwa równoległe żądania tworzą najwyżej jeden logiczny zasób;
- istniejące własne ćwiczenia, szablony i historyczne referencje zachowują działanie;
- reguły lub warstwa serwisowa egzekwują wybrany kontrakt, a test dokumentuje granicę odpowiedzialności.

**Zależności:** minimalna izolacja testów z fazy 0. Faza nie zależy od stanów UI fazy 2.

### Faza 3 — Krytyczna dostępność i nawigacja

**Cel:** zamknąć problemy blokujące obsługę klawiaturą, czytnikiem ekranu i sterowaniem głosowym.

**Wynik wdrożenia:** `A11Y-01–08` zostały wdrożone i zweryfikowane. Ukryta dolna nawigacja jest inert, edytor i AI mają trwałe nazwy oraz dostępne błędy, filtry komunikują wybór, dialog ma opis, a wiersz ćwiczenia jedną akcję otwarcia. Ukierunkowany Axe, testy klawiatury i ręczny accessibility snapshot przechodzą na desktopie i mobile. Pełny audyt WCAG oraz ergonomia dotykowa pozostają poza zakresem zgodnie z Fazą 4 i bramką release.

Status `DONE` opisuje zakończoną i zweryfikowaną implementację. Final re-review zakończył się `PASS / Approved` bez znalezisk Critical, Important ani Minor. Feature branch został zmergowany lokalnie do `puls-rebrand`; push, deploy i czynności produkcyjne nie zostały wykonane.

**Zakres kanoniczny:**

- **A11Y-01:** ukryta dolna nawigacja nie może pozostawać w kolejności fokusu; zastosować `inert`, warunkowe renderowanie albo równoważny kontrakt.
- **A11Y-02:** pola nazwy planu i nazw dni muszą mieć trwałe `<label>`/accessible name.
- **A11Y-03:** ikonowe przyciski usuwania ćwiczeń z planu muszą zawierać kontekstową nazwę.
- **A11Y-04:** filtry ćwiczeń, tryby AI, wybór mięśni i wybór dnia wygenerowanego planu muszą komunikować zaznaczenie przez `aria-pressed`, `aria-selected` albo właściwy wzorzec tabs/listbox.
- **A11Y-05:** select modelu Claude musi mieć nazwę; dynamiczne błędy formularzy i AI muszą używać odpowiedniego `aria-live`/`role="alert"` i powiązania z polem.
- **A11Y-06:** opis dialogu potwierdzającego powinien być połączony przez `aria-describedby` przy zachowaniu istniejącego focus trapu, Escape i focus restore.
- **A11Y-07:** usunąć podwójną identyczną akcję otwierania ćwiczenia z kolejności Tab.
- **A11Y-08:** aktywne elementy nawigacji powinny komunikować bieżącą trasę przez `aria-current` tam, gdzie wzorzec tego wymaga.

**Kryteria wyjścia:**

- pełny obchód klawiaturą nie przenosi fokusu do niewidocznych elementów;
- wszystkie pola i ikonowe akcje edytora planu mają jednoznaczne nazwy;
- stan każdego przełącznika jest dostępny bez polegania na kolorze;
- automatyczny smoke a11y oraz ręczny accessibility snapshot nie wykazują anonimowych kontrolek w głównych przepływach.

**Zależności:** wspólna obserwacja błędów i stabilne selektory z fazy 0.

### Faza 4 — Ergonomia mobile i edytor planów

**Cel:** zapewnić wygodną obsługę najczęstszych akcji na telefonie bez zmiany kierunku wizualnego Puls.

**Status: DONE.** Zakres `MOBILE-01–06` wdrożono i zweryfikowano unitami, lintem, buildem oraz izolowanym gate'em Playwright (53 passed, 22 oczekiwane skipy). Headed review potwierdził brak overflow przy 320/375/390 px i tekście 150%, stały dock nad polem przy wysokości 500 px, czytelny siedmioelementowy `BottomNav` oraz przejście rest timera `full → compact → full` bez zasłaniania inputu. Projekt i dowody pozostają w [`specs/2026-07-14-phase-4-mobile-ergonomics-template-editor-design.md`](specs/2026-07-14-phase-4-mobile-ergonomics-template-editor-design.md) oraz [`plans/2026-07-14-phase-4-mobile-ergonomics-template-editor.md`](plans/2026-07-14-phase-4-mobile-ergonomics-template-editor.md).

Post-integration closeout zakończono po finalnym re-review bez znalezisk Critical, Important ani Minor. Feature branch został zmergowany lokalnie do `puls-rebrand` na `96155ef` i usunięty razem z worktree; push, deploy i czynności `RELEASE-08` nie zostały wykonane. Następnym zależnym etapem pozostaje Faza 5; niezależna Faza 2B została później zakończona.

**Zakres kanoniczny:**

- **MOBILE-01:** podnieść aktywne obszary dolnej nawigacji, filtrów i ikonowych akcji do uzgodnionego minimum dotykowego; cel projektowy: co najmniej 44×44 px dla głównych akcji.
- **MOBILE-02:** zapewnić stale dostępny zapis dużego planu — sticky action bar, zapis w nagłówku albo równoważne rozwiązanie.
- **MOBILE-03:** utrzymać dock zapisu w bezpiecznym obszarze aktualnego `visualViewport` i przewijać aktywne pole ponad dock.
- **MOBILE-04:** skoordynować dolną nawigację, rest timer, inputy treningu i safe-area; przy klawiaturze timer przechodzi do kompaktowego wariantu bez nakładania na pole.
- **MOBILE-05:** chronić niezapisane zmiany edytora przy każdej nawigacji SPA, browser back oraz zamknięciu lub odświeżeniu karty.
- **MOBILE-06:** zweryfikować długie plany i biblioteki przy 320/375/390 px oraz przy powiększonym tekście.

**Wynik walidacji hipotez z 2026-07-14:**

- **FOLLOWUP-UI-01 / MOBILE-03 — `confirmed`:** po skupieniu inputu i zmniejszeniu `visualViewport` zapis pozostaje poza widokiem;
- **FOLLOWUP-UI-02 / MOBILE-04 — `confirmed`:** rest timer pozostaje fixed po ukryciu dolnej nawigacji i nachodzi na aktywne pole przy niskim viewportcie;
- **FOLLOWUP-UI-03 / MOBILE-05 — `confirmed`:** dolna nawigacja omija lokalny guard edytora i pozwala utracić niezapisane zmiany.

Wszystkie trzy punkty zamknięto w implementacji Fazy 4. Dowody i docelowe kontrakty opisuje zatwierdzony spec fazy.

**Kryteria wyjścia:**

- żadna główna akcja mobilna nie ma aktywnego obszaru mniejszego niż uzgodnione minimum;
- użytkownik może zmienić nazwę na początku planu i zapisać bez przewijania kilku tysięcy pikseli;
- stałe elementy nie zasłaniają pól ani przycisków;
- test mobile obejmuje duży plan porównywalny z demo `Upper / Lower 4×`.
- każda hipoteza `FOLLOWUP-UI-01–03` ma wynik `potwierdzona` albo `odrzucona` z dowodem runtime.

**Zależności:** A11Y-01–A11Y-03, ponieważ rozmiar i semantyka tych samych kontrolek powinny być poprawiane razem.

### Faza 5 — Feedback, copy i integralność interfejsu

**Status: DONE.** Zakres `FEEDBACK-01–04`, `NAV-01`, `MOBILE-07`, `A11Y-09–10`, `COPY-01–03`, `DEMO-01`, `TEST-04` został zaimplementowany, zweryfikowany i zintegrowany lokalnie z `puls-rebrand` przez fast-forward do `89452b7`. Zatwierdzony projekt znajduje się w [`specs/2026-07-20-phase-5-feedback-copy-interface-integrity-design.md`](specs/2026-07-20-phase-5-feedback-copy-interface-integrity-design.md). Faza nie otwiera ponownie Fazy 4 i nie obejmuje strategicznego redesignu marki.

**Cel:** usunąć miejsca, w których działająca aplikacja wygląda jak zawieszona, komunikuje niewłaściwy stan albo utrudnia odczyt podstawowej akcji.

**Zakres kanoniczny:**

- **FEEDBACK-01:** start szablonu i dnia planu musi pokazywać jawny stan `launching` — tekst, spinner lub status — zamiast samego `disabled`/zmiany opacity.
- **FEEDBACK-02:** centralne CTA treningu powinno rozróżniać „Rozpocznij nowy trening” i „Wznów trening” oraz komunikować aktywny stan nawigacji.
- **FEEDBACK-03:** uruchomienie, zapis i usunięcie planu oraz usunięcie ukończonego treningu z dashboardu lub szczegółów mają zachować komunikat w obrębie właściwej karty, formularza albo docka, jeśli wynik wymaga działania użytkownika; toast pozostaje uzupełnieniem. Pozostałe formularze profilu, readiness, ćwiczeń i AI są poza tym punktem.
- **FEEDBACK-04:** nowy plan ma zaczynać jako jawnie „nowy / niezapisany”. Stan „Zapisano” wolno pokazać dopiero po udanym utworzeniu dokumentu; czysty, jeszcze nieutworzony draft nie jest zapisanym planem.
- **NAV-01:** wejście na `/` ma prowadzić do `/dashboard`; istniejący kontrakt trasy prywatnej nadal przekierowuje niezalogowanego użytkownika do `/login`, a nieznane ścieżki nadal pokazują 404.
- **MOBILE-07:** stały pasek „Edytuj / Usuń trening” w szczegółach treningu nie może zasłaniać podsumowania ani ćwiczeń przy widocznej lub ukrytej dolnej nawigacji. Każdy fragment treści musi dać się przewinąć do w pełni widocznej pozycji ponad paskiem.
- **A11Y-09:** tekst korzystający z `--muted-soft` musi osiągać co najmniej kontrast 4.5:1 na rzeczywiście używanych tłach, jeśli ma rozmiar normalnego tekstu. Zmiana tokenu nie zastępuje późniejszej, selektywnej oceny wielkości mikrotekstu.
- **A11Y-10:** etykiety primary CTA muszą osiągać co najmniej kontrast 4.5:1 w całym użytym gradiencie i w stanach interakcji; nie wolno zakładać progu AA-large dla obecnych etykiet około 15 px.
- **COPY-01:** poprawić odmianę kategorii w szczegółach treningu, np. „na klatkę”, zamiast interpolować surowe etykiety.
- **COPY-02:** stosować `polishPlural` w opisach wykresów i dostępności, np. „4 wpisy”, „22 wpisy”.
- **COPY-03:** dialog odrzucenia aktywnego treningu ma używać jednoznacznej pary „Wróć” / „Odrzuć trening”, zamiast dwóch akcji zaczynających się od „Anuluj”.
- **DEMO-01:** wykonać pełny, idempotentny reseed konta demo przez istniejący skrypt, z kontrolą docelowego adresu konta i końcową weryfikacją czasu, etykiet oraz liczby treningów. Ponowne uruchomienie seeda jest procedurą odzyskania; nie budujemy osobnej warstwy rollbacku dla danych demonstracyjnych.
- **TEST-04:** rozdzielić narzędzie do diagnostycznego capture screenshotów od prawdziwej regresji wizualnej. Capture ma mieć uczciwą nazwę i unikalne ścieżki. Pierwszy stabilny baseline obejmuje wyłącznie pusty ekran Planów na desktopie i mobile przez `toHaveScreenshot`; szerszy zestaw pozostaje w `LATER-05`.

**Kryteria wyjścia:**

- każda akcja asynchroniczna objęta `FEEDBACK-01–04` ma widoczny i dostępny stan;
- CTA treningu odpowiada rzeczywistemu stanowi sesji;
- nowy plan nie przedstawia nieutworzonego draftu jako zapisanego zasobu;
- `/` kończy na dashboardzie dla zalogowanego użytkownika i na logowaniu dla niezalogowanego, podczas gdy nieznana trasa nadal kończy na 404;
- mobilny pasek akcji szczegółów treningu nie zasłania treści przy żadnym stanie dolnej nawigacji;
- `--muted-soft` i primary CTA spełniają kontrast 4.5:1 w objętych zastosowaniach;
- para akcji w dialogu odrzucenia treningu jednoznacznie rozróżnia powrót od operacji destrukcyjnej;
- dynamiczne polskie teksty przechodzą zestaw testów odmiany;
- konto demo pokazuje wiarygodne scenariusze prezentacyjne;
- artefakty desktop/mobile nie nadpisują się, a żaden test nie jest nazywany regresją wizualną bez wykonywania porównania.

**Poza zakresem:** strategiczny redesign marki Puls/IronLog, hurtowe zwiększanie wszystkich małych etykiet, centralizacja całej palety kategorii, przebudowa profilu i konsolidacja poprawnych stanów z małą liczbą danych. Elementy uznane za wartościowe, ale nieblokujące, są zapisane w `LATER-08–10`.

**Zależności:** semantyka nawigacji z fazy 3. `FEEDBACK-02` korzysta z docelowego kontraktu aktywnej sesji z fazy 1; `A11Y-09–10` muszą zostać zamknięte przed zapisaniem baseline'ów `TEST-04`; copy pozostaje niezależne.

### Faza 6A — Stream i concurrency AI

**Status: DONE.** Zakres `AI-07–08` został zaimplementowany, zweryfikowany i zintegrowany lokalnie z `puls-rebrand` przez fast-forward do `ed27741`. Bramka po integracji obejmuje 425/425 testów całego repozytorium, lint, build oraz deterministyczny Playwright 9/9 na emulatorach Auth+Firestore; wcześniejsza bramka ukierunkowana objęła 66/66 testów fazy. Dwa niezależne finalne review zakończyły się `Ready to merge: Yes`, a bezpośrednia obserwacja potwierdziła poprawne stany błędu i przerwania bez zachowania częściowej odpowiedzi. Push i deploy nie zostały wykonane.

**Cel:** zapewnić bezpieczny lifecycle pojedynczej generacji bez spóźnionych odpowiedzi i niejednoznacznego końca streamu.

**Zakres kanoniczny:**

- **AI-07:** reset rozmowy, zmiana trybu i unmount muszą anulować aktywny request przez `AbortController` oraz unieważnić poprzednią generację.
- **AI-08:** protokół streamu musi mieć jawne zakończenie `done` i `error`; błąd po HTTP 200 nie może zostać zapisany jako poprawna częściowa odpowiedź asystenta.

**Kryteria wyjścia:**

- reset aktywnego streamu nie dopisuje spóźnionej odpowiedzi;
- każdy stream kończy się kontrolowanym `done`, `error` albo abort;
- testy obejmują reset podczas streamu, zmianę trybu, unmount i błąd serwera po rozpoczęciu odpowiedzi.

**Zależności:** minimalna obserwacja błędów z TEST-05.

### Faza 6B — Poprawność i koszt kontekstu AI

**Status: DONE.** Zakres `AI-01`, `AI-09`, `AI-10` i `AI-11` został zaimplementowany, zweryfikowany i zintegrowany lokalnie z `puls-rebrand` przez fast-forward do `c76d358`. Bramka końcowa po poprawkach final review objęła focused Vitest 90/90, pełny unit/support 460/460, czysty lint, build 878 modułów bez ostrzeżenia oraz zachowany emulatorowy Playwright desktop 12/12 bez prawdziwego requestu Anthropic; po integracji pełny unit/support ponownie przeszedł 460/460. Poprawki `83941fe` zachowują readiness-only streak przy niedostępnych treningach bez fałszywych twierdzeń o zerowej aktywności, przekazują rekordy do promptu planu i wzmacniają regresję pojedynczych awarii o niepuste spełnione źródła. Finalny whole-branch re-review pełnego diffu od `21b15d35af99cd221dfcff0b677dcc577a562084` zakończył się `Ready to merge: Yes` z zerem znalezisk Critical, Important i Minor. Bezpośrednia obserwacja Browser potwierdziła ograniczony status przed pierwszym chunkiem i przy ukończonej odpowiedzi, status planu, alert 503 z pojedynczym pytaniem po retry oraz poprawne zawijanie na 390×844 i desktopie z końcowymi `logs: []`; nie była ponawiana, ponieważ `83941fe` nie zmienił UI. Feature branch i własny worktree zostały usunięte. Indeksy nie zostały opublikowane; push, deploy i `RELEASE-08` nie zostały wykonane. Docelowy kontrakt i pełne dowody znajdują się w [`specs/2026-07-22-phase-6b-ai-context-correctness-cost-design.md`](specs/2026-07-22-phase-6b-ai-context-correctness-cost-design.md) oraz [`plans/2026-07-22-phase-6b-ai-context-correctness-cost.md`](plans/2026-07-22-phase-6b-ai-context-correctness-cost.md).

**Cel:** nie utożsamiać awarii odczytu z brakiem danych oraz ograniczyć koszt budowy kontekstu.

**Zakres kanoniczny:**

- **AI-01:** ładować profil, readiness, treningi i rekordy jako niezależne wyniki (`allSettled` albo równoważny kontrakt).
- **AI-09:** odpowiedź i UI muszą znać metadane `available`/`unavailable` dla każdej części kontekstu i nie formułować „brak danych”, jeśli odczyt się nie powiódł.
- **AI-10:** zmierzyć i ograniczyć liczbę odczytów dokumentów do jawnego, uzasadnionego budżetu.
- **AI-11:** sygnał „dni z rzędu” może powstać wyłącznie z kolejnych dat kalendarzowych.

**Kryteria wyjścia:**

- błąd jednego datasetu nie usuwa poprawnie załadowanych pozostałych danych;
- użytkownik wie, czy odpowiedź powstała z pełnym czy ograniczonym kontekstem;
- testy obejmują awarię każdego datasetu osobno i niekolejne daty Readiness;
- budżet odczytów jest zapisany w kontrakcie i testowalny.

**Zależności:** standard stanów błędu z fazy 2.

### Faza 6C — Walidacja planów i obsługa konfiguracji AI

**Status: DONE.** Zakres `AI-04`, `AI-05`, `AI-06`, `AI-12`, `AI-13` i `AI-14` został zaimplementowany, zweryfikowany i zintegrowany lokalnie z `puls-rebrand` przez fast-forward do `f0f5f7f`. Bramka objęła focused Vitest 51/51, pełny unit/support Vitest 59 plików i 467/467 testów, `npm run lint`, `npm run build` z 878 modułami oraz focused whole-branch review zakończony z Critical 0, Important 0 i Minor 0 po usunięciu pętli ponownej walidacji odrzuconego klucza. Bezpośrednia obserwacja Browser przy 390×844 potwierdziła konfigurację przed czatem i wyłączony composer z właściwą instrukcją. API klasyfikuje błędy Anthropic przez publiczne kody, waliduje plan przed zwróceniem go do UI i nie przepuszcza surowych detali upstreamu ani klucza do logów. README opisuje rzeczywisty limit `8/min` liczony transakcyjnie w Firestore. Push, deploy, publikacja indeksów i `RELEASE-08` nie zostały wykonane. Szczegóły znajdują się w [`specs/2026-07-22-phase-6c-ai-plan-validation-config-design.md`](specs/2026-07-22-phase-6c-ai-plan-validation-config-design.md) oraz [`plans/2026-07-22-phase-6c-ai-plan-validation-config.md`](plans/2026-07-22-phase-6c-ai-plan-validation-config.md).

**Cel:** zapewnić zgodność wygenerowanego planu z briefem oraz prawidłową klasyfikację błędów konfiguracji AI.

**Zakres kanoniczny:**

- **AI-04:** ujednolicić komunikaty błędów klucza, modeli, limitu i upstreamu oraz zapewnić ich dostępne ogłaszanie.
- **AI-05:** zaktualizować README, które nadal opisuje limit jako pamięć instancji, mimo że kod używa transakcyjnego Firestore.
- **AI-06:** utrzymać BYOK i zakaz zapisu klucza w Firestore; zweryfikować brak klucza i treści wrażliwych w logach.
- **AI-12:** zwalidować plan względem liczby dni, sprzętu, źródeł ćwiczeń i limitów szablonu.
- **AI-13:** rozróżnić invalid key, upstream unavailable i retryable network error; błąd modeli nie może bezpodstawnie blokować czatu.
- **AI-14:** na mobile stan bez klucza ma eksponować konfigurację przed nieaktywnym czatem albo zastąpić nim główną powierzchnię. Użytkownik nie może widzieć przede wszystkim zablokowanej rozmowy, gdy wymagane działanie znajduje się poniżej viewportu.

**Kryteria wyjścia:**

- plan niespełniający briefu jest naprawiany albo odrzucany przed pokazaniem jako gotowy szablon;
- testy obejmują 401, 429, błąd upstreamu, błąd sieci i niezgodny plan;
- test mobile bez klucza prowadzi bezpośrednio do panelu konfiguracji i nie przedstawia zablokowanego czatu jako głównego zadania;
- README opisuje rzeczywisty minutowy rate limit;
- klucz API nie trafia do logów, bazy ani diagnostyki.

**Zależności:** A11Y-05 dla dostępnego feedbacku błędów.

### Faza S — Hardening CSP

**Status: DONE.** Zakres `SECURITY-01–03` został zaimplementowany, zweryfikowany i zintegrowany lokalnie z `puls-rebrand` przez fast-forward do `118941a`. `vercel.json` emituje egzekwowany, minimalny CSP bez wyjątków dla usuniętej analityki, `firebaseio.com`, szerokiego `img-src https:` ani `'unsafe-inline'` w `script-src`. Izolowany gate buduje produkcyjny bundle i sprawdza kontrakt statyczny, publiczne `/login` oraz chronione `/dashboard` z emulatorami Auth i Firestore; końcowy wynik to 4/4 Playwright, 468/468 unitów, czysty lint, build 878 modułów i czysty diff check. Push, deploy i produkcyjna obserwacja Network nie zostały wykonane, dlatego `RELEASE-09` pozostaje otwarte. Spec i plan znajdują się w [`specs/2026-07-23-phase-s-csp-hardening-design.md`](specs/2026-07-23-phase-s-csp-hardening-design.md) oraz [`plans/2026-07-23-phase-s-csp-hardening.md`](plans/2026-07-23-phase-s-csp-hardening.md).

**Cel:** rozwiązać niezależny problem pozornej polityki Report-Only bez blokowania prostego usunięcia analityki.

**Zakres kanoniczny:**

- **SECURITY-01:** wybrać jeden docelowy kontrakt: CSP egzekwowany albo świadomie utrzymany Report-Only z działającym endpointem raportującym.
- **SECURITY-02:** ograniczyć allowlistę do originów faktycznie używanych po usunięciu analityki i zweryfikować ją na publicznych oraz chronionych trasach.
- **SECURITY-03:** dodać test lub powtarzalny smoke wykrywający zablokowane wymagane zasoby i nieoczekiwane zewnętrzne originy.

**Kryteria wyjścia:**

- polityka jest egzekwowana albo raporty mają rzeczywistego odbiorcę;
- aplikacja działa bez wyjątków dla usuniętych vendorów analitycznych;
- allowlista odpowiada requestom obserwowanym w kontrolowanym smoke.

**Zależności:** ANALYTICS-05. Faza S może być wykonana po fazie A niezależnie od faz produktowych.

### Faza 7 — Bramka release

**Cel:** zamknąć program jedną powtarzalną procedurą odbiorową i udokumentowanym stanem wydania.

**Status: PHASE 7A COMPLETED — VERIFIED — AWAITING INTEGRATION.** Lokalna bramka automatyczna obejmuje unit, lint, build, Firestore Rules, integrację workoutu oraz pełny Playwright desktop+mobile na emulatorach i egzekwowanym CSP. Manualny odbiór 7B oraz `RELEASE-08–10` pozostają otwarte. Dowody: [`../audits/2026-07-23-phase-7a-local-release-gate.md`](../audits/2026-07-23-phase-7a-local-release-gate.md).

**Zakres kanoniczny:**

- **RELEASE-01:** uruchomić lint, unit, build, rules i pełny E2E w środowisku bez blokady quota.
- **RELEASE-02:** przejść ręczny smoke desktop/mobile: login, dashboard, readiness, start/finish/discard workoutu, historia, Progress 30/90, szablony, ćwiczenia, AI bez klucza i profil.
- **RELEASE-03:** wykonać obchód klawiaturą i accessibility snapshot kluczowych tras.
- **RELEASE-04:** sprawdzić brak błędów konsoli, `pageerror` i `requestfailed` podczas smoke.
- **RELEASE-05:** potwierdzić wiarygodność danych konta demo oraz zgodność README, screenshotów i produkcyjnego UI.
- **RELEASE-06:** ocenić ostrzeżenie o chunku na podstawie pomiaru. Optymalizować tylko wtedy, gdy wpływa na start lub nawigację; sam warning nie jest wystarczającym powodem do refaktoru.
- **RELEASE-07:** zapisać wynik odbioru w `WORKING_CONTEXT.md` i wskazać świadomie odłożone elementy LATER.
- **RELEASE-08 — OPEN:** uruchomić pełny live Playwright z prywatnymi `TEST_EMAIL` i `TEST_PASSWORD`, wykonać kontrole produkcyjnego deploymentu Vercel, potwierdzić w Network panelu brak requestów do GA4, Google Tag Manager, Hotjar i Contentsquare oraz brak analitycznych zmiennych, a następnie opublikować produkcyjne reguły Firestore. Dla Fazy 1 zachować kolejność: API + SPA, smoke finish/discard, restrykcyjne reguły.
- **RELEASE-09:** potwierdzić docelowy tryb CSP i zgodność pozostałej allowlisty z rzeczywistymi requestami aplikacji.
- **RELEASE-10:** zmierzyć zimne wejście na dashboard w produkcyjnym albo równoważnym środowisku i zapisać czas do gotowości ekranu. Optymalizacja jest wymagana tylko po powtarzalnym odtworzeniu problemu; pojedynczy około dziesięciosekundowy wynik z lokalnego audytu nie jest samodzielnym dowodem regresji.

**Kryteria wyjścia:**

- wszystkie bramki automatyczne są zielone albo mają jawne, zaakceptowane odstępstwo;
- brak otwartych P0/P1;
- nie istnieje znany przypadek utraty lub duplikacji treningu;
- główne przepływy przechodzą na desktopie i mobile bez anonimowych kontrolek i niewidocznego fokusu;
- zimne wejście na dashboard ma zapisany powtarzalny pomiar, a ewentualna praca wydajnościowa wynika z dowodu zamiast pojedynczej obserwacji;
- dokumentacja i demo odpowiadają faktycznemu zachowaniu aplikacji.

**Blokada:** pełny live E2E nadal wymaga prywatnych `TEST_EMAIL` i `TEST_PASSWORD` oraz środowiska bez blokady quota. `TEST-06` zapewnia deterministyczny gate krytycznych testów, ale nie migruje pełnego zestawu E2E.

## 6. Backlog LATER

Poniższe elementy nie powinny blokować odbioru, o ile wszystkie wymagane fazy wskazane w mapie programu są spełnione:

- **LATER-01:** pełna persystencja i synchronizacja historii AI między urządzeniami.
- **LATER-02:** trwały dzienny budżet AI z panelem wykorzystania, jeśli stanie się wymaganiem produktowym.
- **LATER-03:** wirtualizacja długiej biblioteki ćwiczeń; obecna skala danych nie uzasadnia jej bez pomiaru.
- **LATER-04:** dalszy podział dużych chunków po potwierdzeniu problemu w realnym pomiarze wydajności.
- **LATER-05:** szersza automatyczna regresja wizualna wszystkich tras; na start wystarczy mały stabilny zestaw widoków reprezentatywnych.
- **LATER-06:** usunięcie nieużywanego scaffoldingu i domyślnych assetów Vite po potwierdzeniu braku importów.
- **LATER-07:** jawny stan częściowego błędu własnych ćwiczeń w selektorze treningu, edytorze planu, historii i widokach szczegółowych; katalog globalny powinien pozostać dostępny, a brak własnych pozycji nie może wyglądać jak ich usunięcie.
- **LATER-08:** scentralizować `CATEGORY_COLORS` i neutralny fallback w jednym kontrakcie design systemu; usunąć pozostałość starego motywu `#808CB3`. Jest to porządek systemowy, a nie warunek odbioru bieżących przepływów.
- **LATER-09:** wykonać selektywny przegląd mikrotekstu na rzeczywistych ekranach. Podnosić rozmiar istotnych metadanych, a pozostawić mniejsze etykiety dekoracyjne i zwarte nagłówki tabel; nie stosować globalnego mechanicznego bumpu.
- **LATER-10:** po zamknięciu roadmapy zdecydować, czy rozwijać sygnaturę EKG, dualizm wysiłek/recovery oraz relację nazwy „IronLog” z identyfikacją „Puls”. Jest to osobny moduł brandingowy, nie naprawa produktu ani blokada release.

Decyzje odpowiadające dawnym punktom `AI-02` i `AI-03` są zamknięte na poziomie obecnego scope: nie wdrażamy teraz dziennego budżetu ani trwałej historii czatu. Jeżeli wrócą jako wymaganie produktowe, otrzymają nowe plany w ramach `LATER-01` i `LATER-02`.

## 7. Szablon szczegółowego planu dla pojedynczej fazy

Każda faza rozwijana do implementacji powinna dostać osobny dokument według poniższego kontraktu:

1. **Cel i problem użytkownika** — co ma być prawdą po wdrożeniu.
2. **Zakres / poza zakresem** — lista identyfikatorów z tej roadmapy.
3. **Obecny kontrakt** — aktualny przepływ, dane i miejsca w kodzie.
4. **Docelowy kontrakt** — stany, API, UI i zachowanie przy błędach.
5. **Kroki implementacyjne** — małe, weryfikowalne zadania w kolejności.
6. **Migracja i kompatybilność** — wpływ na istniejące dokumenty Firestore i konto demo.
7. **Strategia testów** — unit, rules, E2E, mobile, keyboard i failure injection.
8. **Kryteria akceptacji** — obserwowalne wyniki, nie opis implementacji.
9. **Plan commitów i rollbacku** — szczególnie dla cyklu życia workoutu i backendu.
10. **Definition of Done** — kod, testy, dokumentacja, przegląd i aktualizacja tej roadmapy.

## 8. Rekomendowana kolejność rozpoczęcia

**Fazy 2B, 6B i 6C** są zakończone, zweryfikowane i zintegrowane lokalnie z `puls-rebrand`. Następnym zakresem implementacyjnym jest Faza S, a `RELEASE-08` pozostaje otwartą bramką produkcyjną.

Faza R jest zakończona, a jej raport zawiera historyczny baseline i dowody remediacji Fazy 1; `WORKOUT-04` pozostaje poza zakresem implementacji jako `already_protected`.

Po fazie 0 można równolegle przygotować fazę 2B, kolejne fazy po Fazie 3 oraz niezależne pakiety AI. Nie należy zaczynać od kosmetycznego copy, chunków, trwałej historii AI ani dziennego budżetu AI, dopóki zweryfikowane P0/P1 pozostają otwarte.

## 9. Macierz śledzenia audytów

Ta sekcja jest obowiązkową warstwą kontroli kompletności. `ASR-1` oznacza techniczny Agent Sanity Review z brancha `puls-rebrand` na `8607eb6`, `ASR-UI` pierwszy audyt UI, `SDR` Senior Design Review z 2026-07-14, a `REFINE-UI` pełny audyt runtime z 2026-07-20. Jeden punkt audytu może zasilać kilka elementów roadmapy, ale żaden zweryfikowany problem nie może pozostać bez przypisania. Wartość `pełne` oznacza pełne odwzorowanie problemu w zakresie roadmapy — nie oznacza jeszcze, że problem został wdrożony lub zamknięty. Punkty odrzucone albo już zabezpieczone pozostają w macierzy, żeby nie wracały bez nowych dowodów.

### ASR-1 — audyt techniczny

| ID audytu | Ustalenie | Priorytet audytu | Punkt roadmapy | Pokrycie |
|---|---|---:|---|---|
| ASR-1-01 | Cofnięcie zgody nie zatrzymuje session replay | P1 | ANALYTICS-01–ANALYTICS-05 | pełne przez usunięcie funkcji |
| ASR-1-02 | Banner i profil mogą pokazywać różne zgody | P1 | ANALYTICS-02, ANALYTICS-03 | pełne przez usunięcie funkcji |
| ASR-1-03 | Błąd Readiness może nadpisać istniejący wpis | P1 | STATE-01 | pełne |
| ASR-1-04 | Exercises pokazuje błąd jako pustą bibliotekę | P1 | STATE-02, STATE-05 | pełne |
| ASR-1-05 | Chat nie anuluje generacji i nie ma bezpiecznego końca streamu | P1 | AI-07, AI-08 | pełne |
| ASR-1-06 | Awaria jednego datasetu fabrykuje całkowicie pusty kontekst AI | P1 | AI-01, AI-09, AI-10 | pełne |
| ASR-1-07 | Główny E2E zależy od live Firebase i współdzielonego konta | P1 | TEST-03, TEST-06, RELEASE-01 | pełne |
| ASR-1-08 | Readiness wykonuje deterministyczny drugi odczyt | P2 | STATE-07 | pełne |
| ASR-1-09 | Niekolejne niskie readiness są opisywane jako dni z rzędu | P2 | AI-11 | pełne |
| ASR-1-10 | Plan AI nie jest walidowany względem dni i sprzętu | P2 | AI-12 | pełne |
| ASR-1-11 | Query → `addDoc` może utworzyć duplikaty własnych ćwiczeń | P2 | DATA-01 | pełne |
| ASR-1-12 | Błąd modeli jest mylony z nieprawidłowym kluczem | P2 | AI-04, AI-13 | pełne |
| ASR-1-13 | CSP jest tylko Report-Only bez raportowania i ze złą allowlistą | P2 | ANALYTICS-05, SECURITY-01 | pełne |
| ASR-1-14 | README opisuje nieaktualny model rate limitu | P3 | AI-05 | pełne |
| ASR-1-15 | Nieużywany scaffolding i assety Vite | P3 | LATER-06 | pełne, świadomie odłożone |

### ASR-UI — audyt interfejsu

| ID audytu | Ustalenie | Priorytet audytu | Punkt roadmapy | Pokrycie |
|---|---|---:|---|---|
| ASR-UI-01 | Ukryta dolna nawigacja pozostaje fokusowalna | P1 | A11Y-01 | pełne |
| ASR-UI-02 | Pola i ikonowe akcje edytora planu nie mają nazw | P1 | A11Y-02, A11Y-03 | pełne |
| ASR-UI-03 | Błędy danych są renderowane jako poprawne empty states | P1 | STATE-01–STATE-03, STATE-05 | pełne |
| ASR-UI-04 | Główne cele dotykowe są za małe | P2 | MOBILE-01 | pełne |
| ASR-UI-05 | Zapis dużego planu jest dostępny dopiero na końcu strony | P2 | MOBILE-02 | pełne |
| ASR-UI-06 | Zaznaczenie filtrów i trybów jest przekazywane tylko wizualnie | P2 | A11Y-04 | pełne |
| ASR-UI-07 | AI select i dynamiczne błędy mają braki dostępnościowe | P2 | A11Y-05, AI-04 | pełne |
| ASR-UI-08 | Wiersz ćwiczenia ma dwie identyczne akcje w kolejności Tab | P2 | A11Y-07 | pełne |
| ASR-UI-09 | Start szablonu nie daje czytelnego feedbacku | P2 | FEEDBACK-01 | pełne |
| ASR-UI-10 | CTA treningu nie rozróżnia startu i wznowienia | P3 | FEEDBACK-02, A11Y-08 | pełne |
| ASR-UI-11 | Dialog nie łączy opisu przez `aria-describedby` | P2 | A11Y-06 | pełne |
| ASR-UI-12 | Dynamiczne teksty mają błędną polską odmianę | P3 | COPY-01, COPY-02 | pełne |
| ASR-UI-13 | Konto demo pokazuje niewiarygodny trening `12h 0m` | P3 | DEMO-01 | pełne |
| ASR-UI-14 | Krytyczne E2E potrafią asertywnie sprawdzać tylko shell | P2 | TEST-01 | pełne |
| ASR-UI-15 | Capture screenshotów nie jest regresją wizualną | P2 | TEST-04 | pełne |
| ASR-UI-16 | Brakuje E2E pełnej finalizacji treningu | P2 | kryterium wyjścia Fazy 1 | pełne |
| ASR-UI-17 | Cleanup testu profilu nie jest odporny na przerwanie | P2 | TEST-03 | pełne |

### SDR — Senior Design Review, 2026-07-14

| ID audytu | Ustalenie | Ocena po rewalidacji 2026-07-20 | Punkt roadmapy | Pokrycie |
|---|---|---|---|---|
| SDR-01 | `/` pokazuje 404 zamiast wejścia do aplikacji | `confirmed` w aktualnym routerze | NAV-01 | pełne |
| SDR-02 | Widoki z rzadkimi danymi wyglądają na niedokończone | `not confirmed` w nowszym review dashboardu, Planów i Ćwiczeń | brak pracy | zamknięte bez implementacji |
| SDR-03 | Profil łączy dwie niespójne osie layoutu | `not confirmed`; nowszy review daje ekranowi PASS | brak pracy | zamknięte bez implementacji |
| SDR-04 | `--muted-soft` ma kontrast 3.20–3.71 dla małego tekstu | `confirmed` w aktualnych tokenach i zastosowaniach | A11Y-09 | pełne |
| SDR-05 | Primary CTA używa białego tekstu na fragmencie czerwonego gradientu o kontraście 3.71 | `confirmed` w aktualnych tokenach | A11Y-10 | pełne |
| SDR-06 | Mapy `CATEGORY_COLORS` są zduplikowane, a `#808CB3` pozostał po starym motywie | `confirmed`, lecz nieblokujące produktowo | LATER-08 | pełne, świadomie odłożone |
| SDR-07 | Profil nie pokazuje wybranego celu i jednostek | `already protected`: widoczny stan oraz `aria-pressed` istnieją | brak pracy | zamknięte bez implementacji |
| SDR-08 | Dialog używa mylącej pary „Anuluj” / „Anuluj trening” | `confirmed` w aktualnym flow | COPY-03 | pełne |
| SDR-09 | Pierwszy render dashboardu trwał około 10 sekund | `unverified`: pojedynczy lokalny pomiar | RELEASE-10 | pełne jako obowiązek pomiaru, nie założona optymalizacja |
| SDR-10 | Motyw EKG, recovery i relacja nazwy do marki są niedokorzystane | kierunek strategiczny, nie bug | LATER-10 | pełne, świadomie odłożone |

### REFINE-UI — pełny audyt runtime, 2026-07-20

| ID audytu | Ustalenie | Priorytet po weryfikacji | Punkt roadmapy | Pokrycie |
|---|---|---:|---|---|
| REFINE-UI-01 | AI Coach bez klucza eksponuje zablokowany czat przed konfiguracją | P2 | AI-14 | pełne |
| REFINE-UI-02 | Nowy plan pokazuje „Zapisano”, mimo że dokument nie istnieje | P1 | FEEDBACK-04 | pełne |
| REFINE-UI-03 | Mobilny pasek akcji zasłania część podsumowania treningu | P2 | MOBILE-07 | pełne |
| REFINE-UI-04 | Istotne metadane bywają zbyt małe do szybkiego skanowania | P2 | A11Y-09, LATER-09 | częściowe teraz przez kontrast; rozmiar świadomie odłożony do selektywnego review |
| REFINE-UI-05 | Logowanie, dashboard, historia, postępy, Plany, Ćwiczenia, Profil, aktywny trening i sam ekran 404 nie mają innych potwierdzonych blockerów wizualnych | PASS | brak pracy | wynik zachowany jako baseline review; nie rozstrzyga błędu routingu z SDR-01 |

### FOLLOWUP — hipotezy dodane podczas syntezy roadmapy

Poniższe punkty nie pochodzą bezpośrednio z audytów źródłowych. Hipotezy workoutu zostały rozstrzygnięte w Fazie R, a hipotezy UI w Fazie 4.

| ID | Hipoteza | Wynik walidacji | Punkt implementacyjny |
|---|---|---|---|
| FOLLOWUP-WORKOUT-01 | Finalizacja może utworzyć duplikat po niejednoznacznym wyniku zapisu | `confirmed` w Fazie R | WORKOUT-01 |
| FOLLOWUP-WORKOUT-02 | Nieudane usunięcie `activeSessions` może odtworzyć zamkniętą sesję | `confirmed` w Fazie R | WORKOUT-02, WORKOUT-03, WORKOUT-05 |
| FOLLOWUP-WORKOUT-03 | Retry materializacji może wymagać dodatkowego kontraktu spójności | `already_protected` w Fazie R | brak pracy w Fazie 1 (`WORKOUT-04`) |
| FOLLOWUP-WORKOUT-04 | Refresh, dwie karty, offline lub stale session mogą ujawnić dodatkowy wyścig | `confirmed` w Fazie R | WORKOUT-06 |
| FOLLOWUP-UI-01 | Klawiatura może zasłaniać zapis dużego planu | `confirmed` 2026-07-14: zapis poza zmniejszonym `visualViewport` | MOBILE-03 |
| FOLLOWUP-UI-02 | Stałe elementy mogą nakładać się na inputy lub safe-area | `confirmed` 2026-07-14: rest timer nachodzi na aktywny input | MOBILE-04 |
| FOLLOWUP-UI-03 | Edytor może wymagać ochrony niezapisanych zmian | `confirmed` 2026-07-14: dolna nawigacja omija istniejący guard | MOBILE-05 |

Przy każdej zmianie zakresu fazy należy zaktualizować również odpowiadający jej wiersz w tej macierzy. Jeśli nowe ustalenie audytowe nie pasuje do żadnego istniejącego punktu, najpierw otrzymuje nowy trwały identyfikator roadmapy, a dopiero potem trafia do planu implementacyjnego.
