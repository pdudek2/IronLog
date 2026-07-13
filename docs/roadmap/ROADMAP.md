# IronLog — kanoniczna roadmapa po audytach

Status dokumentu: **kanoniczny backlog programu naprawczego**
Stan przeglądu: **APPROVED — fazy A, 0, R, 1, 2 i 3 zakończone; final review Fazy 3 clean, feature branch gotowy do merge po zgodzie użytkownika**
Źródła: audyt techniczny aplikacji oraz audyt UI wykonany na desktopie i mobile
Ostatnia aktualizacja: 2026-07-13

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
- 38 plików i 241 testów jednostkowych oraz testów wsparcia przechodzi,
- 1 plik i 10 testów reguł Firestore przechodzi,
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
| 6 | 2B — Integralność własnych ćwiczeń | P2 | READY | Równoległe utworzenie ćwiczenia nie produkuje duplikatów |
| 7 | 3 — Krytyczna dostępność i nawigacja | P1 | DONE | Główne przepływy są nazwane, fokusowalne i poprawnie komunikują stan |
| 8 | 4 — Ergonomia mobile i edytor planów | P1 | READY | Sterowanie dotykowe spełnia minimalne wymiary, a duży plan można wygodnie edytować i zapisać |
| 9 | 5 — Feedback, copy i uczciwe testy wizualne | P2 | READY | Akcje komunikują stan, teksty są poprawne, a capture screenshotów nie udaje regresji wizualnej |
| 10 | 6A — Stream i concurrency AI | P1 | READY | Reset i błędy streamu nie dopisują spóźnionych lub częściowych odpowiedzi |
| 11 | 6B — Poprawność i koszt kontekstu AI | P1 | READY | Częściowa awaria danych nie fabrykuje pustego obrazu użytkownika |
| 12 | 6C — Walidacja planów i obsługa modeli AI | P2 | READY | Plan respektuje brief, a błędy modeli mają prawidłową klasyfikację |
| 13 | S — Hardening CSP | P2 | READY | Pozostała polityka CSP jest egzekwowana albo rzeczywiście raportuje naruszenia |
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

Status `DONE` opisuje zakończoną i zweryfikowaną implementację na branchu `phase-3-accessibility-navigation`. Final re-review zakończył się `PASS / Approved` bez znalezisk Critical, Important ani Minor. Feature branch jest gotowy do merge do `puls-rebrand` po zgodzie użytkownika; merge, push, deploy i czynności produkcyjne nie zostały wykonane.

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

**Zakres kanoniczny:**

- **MOBILE-01:** podnieść aktywne obszary dolnej nawigacji, filtrów i ikonowych akcji do uzgodnionego minimum dotykowego; cel projektowy: co najmniej 44×44 px dla głównych akcji.
- **MOBILE-02:** zapewnić stale dostępny zapis dużego planu — sticky action bar, zapis w nagłówku albo równoważne rozwiązanie.
- **MOBILE-06:** zweryfikować długie plany i biblioteki przy 320/375/390 px oraz przy powiększonym tekście.

**Hipotezy do walidacji podczas planowania fazy:**

- **FOLLOWUP-UI-01 / MOBILE-03:** czy klawiatura i zmiany `visualViewport` zasłaniają główną akcję edytora;
- **FOLLOWUP-UI-02 / MOBILE-04:** czy dolna nawigacja, rest timer, inputy treningu i safe-area nakładają się na rzeczywistych wysokościach mobilnych;
- **FOLLOWUP-UI-03 / MOBILE-05:** czy utrata niezapisanych zmian w edytorze jest realnym problemem, który uzasadnia guard opuszczenia strony.

Punkty `MOBILE-03–05` wchodzą do implementacji wyłącznie po reprodukcji. Brak reprodukcji zamyka odpowiadającą hipotezę bez zmiany kodu.

**Kryteria wyjścia:**

- żadna główna akcja mobilna nie ma aktywnego obszaru mniejszego niż uzgodnione minimum;
- użytkownik może zmienić nazwę na początku planu i zapisać bez przewijania kilku tysięcy pikseli;
- stałe elementy nie zasłaniają pól ani przycisków;
- test mobile obejmuje duży plan porównywalny z demo `Upper / Lower 4×`.
- każda hipoteza `FOLLOWUP-UI-01–03` ma wynik `potwierdzona` albo `odrzucona` z dowodem runtime.

**Zależności:** A11Y-01–A11Y-03, ponieważ rozmiar i semantyka tych samych kontrolek powinny być poprawiane razem.

### Faza 5 — Feedback, copy i uczciwe testy wizualne

**Cel:** usunąć miejsca, w których działająca aplikacja wygląda jak zawieszona albo komunikuje niewłaściwą akcję.

**Zakres kanoniczny:**

- **FEEDBACK-01:** start szablonu i dnia planu musi pokazywać jawny stan `launching` — tekst, spinner lub status — zamiast samego `disabled`/zmiany opacity.
- **FEEDBACK-02:** centralne CTA treningu powinno rozróżniać „Rozpocznij nowy trening” i „Wznów trening” oraz komunikować aktywny stan nawigacji.
- **FEEDBACK-03:** operacje zapisu/usunięcia mają zachować komunikat w obrębie ekranu, jeśli wynik wymaga działania użytkownika; toast pozostaje uzupełnieniem.
- **COPY-01:** poprawić odmianę kategorii w szczegółach treningu, np. „na klatkę”, zamiast interpolować surowe etykiety.
- **COPY-02:** stosować `polishPlural` w opisach wykresów i dostępności, np. „4 wpisy”, „22 wpisy”.
- **DEMO-01:** wyczyścić lub ponownie zasiać niewiarygodne dane demo, w szczególności trening `12h 0m`.
- **TEST-04:** rozdzielić narzędzie do diagnostycznego capture screenshotów od prawdziwej regresji wizualnej. Capture ma mieć uczciwą nazwę i unikalne ścieżki; wybrane stabilne widoki mogą używać `toHaveScreenshot`, a szerszy zestaw pozostaje w `LATER-05`.

**Kryteria wyjścia:**

- każda akcja asynchroniczna dłuższa niż natychmiastowa ma widoczny i dostępny stan;
- CTA treningu odpowiada rzeczywistemu stanowi sesji;
- dynamiczne polskie teksty przechodzą zestaw testów odmiany;
- konto demo pokazuje wiarygodne scenariusze prezentacyjne.
- artefakty desktop/mobile nie nadpisują się, a żaden test nie jest nazywany regresją wizualną bez wykonywania porównania.

**Zależności:** semantyka nawigacji z fazy 3. `FEEDBACK-02` korzysta z docelowego kontraktu aktywnej sesji z fazy 1; copy i TEST-04 są niezależne.

### Faza 6A — Stream i concurrency AI

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

### Faza 6C — Walidacja planów i obsługa modeli AI

**Cel:** zapewnić zgodność wygenerowanego planu z briefem oraz prawidłową klasyfikację błędów konfiguracji AI.

**Zakres kanoniczny:**

- **AI-04:** ujednolicić komunikaty błędów klucza, modeli, limitu i upstreamu oraz zapewnić ich dostępne ogłaszanie.
- **AI-05:** zaktualizować README, które nadal opisuje limit jako pamięć instancji, mimo że kod używa transakcyjnego Firestore.
- **AI-06:** utrzymać BYOK i zakaz zapisu klucza w Firestore; zweryfikować brak klucza i treści wrażliwych w logach.
- **AI-12:** zwalidować plan względem liczby dni, sprzętu, źródeł ćwiczeń i limitów szablonu.
- **AI-13:** rozróżnić invalid key, upstream unavailable i retryable network error; błąd modeli nie może bezpodstawnie blokować czatu.

**Kryteria wyjścia:**

- plan niespełniający briefu jest naprawiany albo odrzucany przed pokazaniem jako gotowy szablon;
- testy obejmują 401, 429, błąd upstreamu, błąd sieci i niezgodny plan;
- README opisuje rzeczywisty minutowy rate limit;
- klucz API nie trafia do logów, bazy ani diagnostyki.

**Zależności:** A11Y-05 dla dostępnego feedbacku błędów.

### Faza S — Hardening CSP

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

**Kryteria wyjścia:**

- wszystkie bramki automatyczne są zielone albo mają jawne, zaakceptowane odstępstwo;
- brak otwartych P0/P1;
- nie istnieje znany przypadek utraty lub duplikacji treningu;
- główne przepływy przechodzą na desktopie i mobile bez anonimowych kontrolek i niewidocznego fokusu;
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

**Faza 4 — ergonomia mobile i edytor planów** jest następnym rekomendowanym pakietem po merge Fazy 3. Niezależna Faza 2B pozostaje `READY`, a czynności produkcyjne pozostają otwarte w `RELEASE-08`.

Faza R jest zakończona, a jej raport zawiera historyczny baseline i dowody remediacji Fazy 1; `WORKOUT-04` pozostaje poza zakresem implementacji jako `already_protected`.

Po fazie 0 można równolegle przygotować fazę 2B, kolejne fazy po Fazie 3 oraz niezależne pakiety AI. Nie należy zaczynać od kosmetycznego copy, chunków, trwałej historii AI ani dziennego budżetu AI, dopóki zweryfikowane P0/P1 pozostają otwarte.

## 9. Macierz śledzenia audytów

Ta sekcja jest obowiązkową warstwą kontroli kompletności. `ASR-1` oznacza techniczny Agent Sanity Review z brancha `puls-rebrand` na `8607eb6`. Punkty audytu UI są oznaczone jako `ASR-UI`. Jeden punkt audytu może zasilać kilka elementów roadmapy, ale żaden zweryfikowany problem nie może pozostać bez przypisania. Wartość `pełne` oznacza pełne odwzorowanie problemu w zakresie roadmapy — nie oznacza jeszcze, że problem został wdrożony lub zamknięty.

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

### FOLLOWUP — hipotezy dodane podczas syntezy roadmapy

Poniższe punkty nie pochodzą bezpośrednio z dwóch audytów. Hipotezy workoutu zostały rozstrzygnięte w Fazie R; hipotezy UI nadal wymagają wskazanej walidacji.

| ID | Hipoteza | Wynik walidacji | Punkt implementacyjny |
|---|---|---|---|
| FOLLOWUP-WORKOUT-01 | Finalizacja może utworzyć duplikat po niejednoznacznym wyniku zapisu | `confirmed` w Fazie R | WORKOUT-01 |
| FOLLOWUP-WORKOUT-02 | Nieudane usunięcie `activeSessions` może odtworzyć zamkniętą sesję | `confirmed` w Fazie R | WORKOUT-02, WORKOUT-03, WORKOUT-05 |
| FOLLOWUP-WORKOUT-03 | Retry materializacji może wymagać dodatkowego kontraktu spójności | `already_protected` w Fazie R | brak pracy w Fazie 1 (`WORKOUT-04`) |
| FOLLOWUP-WORKOUT-04 | Refresh, dwie karty, offline lub stale session mogą ujawnić dodatkowy wyścig | `confirmed` w Fazie R | WORKOUT-06 |
| FOLLOWUP-UI-01 | Klawiatura może zasłaniać zapis dużego planu | Reprodukcja mobile w fazie 4 | MOBILE-03 |
| FOLLOWUP-UI-02 | Stałe elementy mogą nakładać się na inputy lub safe-area | Reprodukcja mobile w fazie 4 | MOBILE-04 |
| FOLLOWUP-UI-03 | Edytor może wymagać ochrony niezapisanych zmian | Reprodukcja nawigacji w fazie 4 | MOBILE-05 |

Przy każdej zmianie zakresu fazy należy zaktualizować również odpowiadający jej wiersz w tej macierzy. Jeśli nowe ustalenie audytowe nie pasuje do żadnego istniejącego punktu, najpierw otrzymuje nowy trwały identyfikator roadmapy, a dopiero potem trafia do planu implementacyjnego.
