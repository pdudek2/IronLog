# Nocny mega-audyt — domknięcie i nowe poprawki, 2026-09-05

Status: **Completed locally and verified**. Kod zintegrowany fast-forward w lokalnym `main`, commit `ee9a592`.

## Właściciel zakresu

[Nocny raport nadrzędny](/Users/patryk/.codex/worktrees/e833/IronLog/output/nightly-mega-review-2026-08-31/final-report.md) → ten etap: bezpieczne QA, stabilność sesji i kont, wydajność mobilnych Postępów → pozostałe ustalenia [pełnego audytu 4 września](/Users/patryk/Desktop/IronLog/output/playwright/deep-audit-20260904/REPORT.md) oraz [osobnego audytu UI](/Users/patryk/Desktop/IronLog/output/playwright/ui-review-20260904/REPORT.md).

Nocna implementacja była już zintegrowana w bazowym `main` (`64fde7e`). Ten etap uzupełnia jej zobowiązania; nie przenosi ponownie starego diffu. F01–F04 i F18 z nowego audytu zostały włączone ze względu na wspólne przyczyny i granice bezpieczeństwa. Pozostałe ustalenia nadal oczekują na realizację. Desktopowy design, pełny Set Ledger, Training Signal, nowy mechanizm scalania konfliktów i zmiany schematu pozostają poza zakresem.

Routing: Large/phased; znane przyczyny, zaakceptowane zachowanie, Lean/Ponytail lite. Ryzyko Critical dla utraty danych/izolacji kont, Standard dla paginacji Postępów. Najpierw plan fazy stabilności, następnie plan optymalizacji oparty na pomiarze. Nie tworzono nowej roadmapy produktu.

## Zmiany i ich uzasadnienie

- F01: kopia lokalna zachowuje rewizję bazową oraz znacznik niezapisanych zmian. Pełne przeładowanie, w tym przejście przez Dashboard, odzyskuje ostatnie lokalne wartości. Potwierdzone zamknięcie lub inna sesja z serwera nadal mają pierwszeństwo.
- F03–F04: kolejka zapisu i rewizja przeżywają remount w tej samej instancji aplikacji. Końcowy zapis po nawigacji zachowuje uprawnienia wyłącznie dla tego samego zalogowanego użytkownika i aktywnej, niezamkniętej sesji. Kopia innej karty nie upoważnia do pominięcia prawdziwego konfliktu CAS.
- F02: snapshot Dashboard ma właściciela UID; opóźnione odczyty, retry projekcji i callbacki starej instancji nie mogą wstawić danych konta A do konta B. TopNav również respektuje właściciela snapshotu.
- Dodatkowa przyczyna wykryta podczas E2E: identyczne sesje miały różną kolejność pól w JSON. Powodowało to pętlę zapisów i błędy przy odrzucaniu. Kanoniczne porównanie pól i zgodna z serwerem normalizacja etykiety usuwają przyczynę. W tym samym scenariuszu ślad sieci zmienił się ze 103 commitów (100 identycznych) na 4 różne zapisy. Nie dodano dodatkowego mechanizmu zamykania sesji.
- F18 i nocne QA: domyślne E2E uruchamia własne lokalne emulatory; live jest jawnie osobnym poleceniem. Skrypty screenshotów wymagają emulatorów i dostarczonych danych konta, blokują obce backendy i lokalne API z potencjalnie produkcyjnymi poświadczeniami Admin. Usunięto bezwarunkowe kasowanie aktywnej sesji przez Admin SDK. CSP działa osobno na preview buildu, a jego artefakty nie kasują zwykłego E2E.
- Nieaktualne selektory poprawiono po sprawdzeniu aktualnego runtime. Cztery bazowe obrazy Templates zaktualizowano dopiero po porównaniu actual/diff oraz historii zaakceptowanych zmian. Nie zmieniano wyglądu Templates, aby dopasować go do testu. Nie poluzowano kontroli błędów konsoli ani sieci.
- Postępy: początkowo nadal 1 wyróżniony rekord i 5 kolejnych; po rozwinięciu 20 pozostałych na stronę. Wszystkie rekordy w istniejącym limicie są dostępne, z nawigacją i komunikatem strony dla czytnika ekranu. Istniejący rozmiar strony odczytu zmieniono z 500 na 1000; limity 5000/1000, kursory, właściciel, sortowanie i ostrzeżenie o obcięciu pozostają takie same.

## Pomiar Postępów

Lokalny, izolowany Chromium/Pixel 5, szerokość 393 px, emulator `demo-ironlog`, ta sama procedura i 6002 dokumenty fixture: 5001 sesji + 1001 rekordów. Czasy nie są prognozą produkcyjnego SLA ani medianą wielu prób.

| Wariant | Gotowość ekranu | DOM po rozwinięciu | Widoczne rekordy | Wysokość dokumentu |
|---|---:|---:|---:|---:|
| Przed, strony 500 |15174ms|6808|1000|76154px|
| Finalny, strony 1000 + paginacja UI |8147ms|938|21|4174px|

Finalne rozwinięcie: 129 ms wobec 209 ms bazowo; brak przewijania poziomego. Początkowy widok obu wariantów:849 węzłów DOM, 6 rekordów, 3002 px. Liczba odczytów przy obu limitach spada z 14 do 8. Granice pustego zbioru, pełnej strony, cap/cap+1, sortowanie i przejście na następną stronę są testowane.

Wariant jednego dużego zapytania został **odrzucony**: pierwsza próba 20595 ms, powtórka bez innych obciążeń 16513 ms. Jego kod nie pozostał w implementacji. Zachowano pomiary jako dowód decyzji.

Dowody: [metryki bazowe](../playwright/nightly-convergence-20260905/density-before.json), [metryki finalne](../playwright/nightly-convergence-20260905/density-paged-1000.json), [ślad liczby zapisów](../playwright/nightly-convergence-20260905/write-storm.json). Probe i konfiguracja w tym samym katalogu; własne fixture są usuwane po próbie.

## Weryfikacja

- Świeży `TZ=Europe/Warsaw npm run test:unit`: 678/678, 77 plików.
- Świeży `npm run lint` i `npm run build`: pass.
- `npm run test:rules`: 19/19.
- `npm run test:integration:workout`: 45/45.
- Finalny `npm run test:e2e`: **230 pass / 39 świadomych viewport skipów / 0 fail**, retries=0, 8.1 min; następnie **4/4 CSP**, 10.8 s, na preview buildu z wymuszoną polityką.
- Targeted regresje restartu/nawigacji przeszły na obu viewportach; prawdziwy konflikt, zamknięta/nowa sesja, zmiana konta, stara kopia po 12 godzinach, późny ack i kopia innej karty mają pokrycie. Ostateczny pełny przebieg po przywróceniu istniejącego cleanupu przeszedł, w tym problematyczny test menu/cleanup (4.3 s).
- Niezależny przegląd granic sesji/kont oraz wąski przegląd kanonicznego porównania: bez dalszych potwierdzonych problemów. Właściciel zadania zachowuje odpowiedzialność za całość i końcową decyzję ryzyka.

Pierwszy pełny przebieg 220 pass / 39 skip / 16 fail nie był zaliczony jako sukces. Każda przyczyna została zdiagnozowana; stale baselines, selektory, tryb CSP i pętla zapisów są opisane wyżej. Zachowano dowody pierwszego przebiegu lokalnie. Kolejny pełny przebieg: 229 pass / 39 skip / 1 fail — sam kontrakt menu przeszedł, timeout wystąpił w cleanupie, który próbował kliknąć pod pozostawionym otwartym dialogiem. Usunięto wcześniejszy eksperymentalny skrót omijający przeładowanie; przywrócono istniejący cleanup w całości zamiast rozbudowywać go o nowe stany. Pętla zapisów była już naprawiona w rzeczywistej przyczynie.

## Obserwacja mobilnego runtime

Finalne obrazy wykonano w izolowanym Playwright, a następnie odczytano osobnym narzędziem `view_image`, które zwróciło obrazy do modelu. Progress: `progress-density-paged-1000.png` — widoczne płaskie wiersze, strona 2 z 50, Poprzednia/Następna i Pokaż mniej; brak wyjścia poza 393 px. Pozostałe obrazy z finalnego kodu produktu, odczytane zakończonymi wywołaniami `view_image` (zwrócone obrazy widoczne w sesji):

- `mobile-recovered-session.png`: odzyskane 7 powtórzeń, objętość 560 kg, brak fałszywego konfliktu.
- `mobile-navigation-recovered.png`: zapisane 9 powtórzeń, objętość 720 kg, brak fałszywego konfliktu.
- `mobile-session-conflict.png`: rzeczywisty konflikt dwóch klientów, komunikat o nowszej wersji i działanie „Wczytaj nowszą wersję”.
- `inline-previous-mobile.png`: pięć historycznych serii przy aktywnych wierszach: 80×8, 80×8, 77.5×10, 75×10, 70×12; zachowany minimalny inline „Poprz.”.

Visual evidence: **Observed** — surface: izolowany Playwright; image proof: osobne, zakończone odczyty `view_image` pięciu wymienionych PNG zwróciły obrazy finalnego stanu do modelu. Dowody znajdują się w `output/playwright/nightly-convergence-20260905/`. Zmiana po tej obserwacji dotyczyła wyłącznie przywrócenia testowego cleanupu; kod produktu pozostał ten sam.

## Integracja, odzyskanie i kolejny etap

Implementacja `ee9a592` z bazy `64fde7e` została zintegrowana fast-forward w lokalnym `main`. Gałąź robocza `nightly-convergence` została scalona i usunięta w closeout. Bez zmian schematu, rules, endpointów i zależności. Rollback przez revert commitów tego etapu; kopie lokalne nadal są czytelne przez zachowany format sesji, a serwerowe fences nie zmieniły kontraktu. Push/deploy nie należą do bieżącego upoważnienia i nie zostały wykonane.

Ten dokument zastępuje usunięty po integracji gitignored plan roboczy `docs/superpowers/plans/2026-09-05-nightly-convergence.md`. Stary worktree `e833` i obce artefakty zachowano. W publicznym routingu workerów potwierdzono rolę/request bez przypinania modelu; metadane modelu/effort nie były dostępne. Próba skonfigurowanego reviewera zwróciła unsupported-model; przegląd zakończono dostępnym routingiem domyślnym, bez delegowania mu implementacji.

Następny etap to pozostałe F05–F17 i F19–F21 pełnego audytu oraz osobny audyt UI, ze wspólnymi problemami liczonymi raz. F08/UI01 (desktop) pozostają odłożone zgodnie z decyzją Patryka. Ten closeout nie oznacza zakończenia dwóch wrześniowych audytów. Dłuższy dogfood na prawdziwych urządzeniach i obserwacja po przyszłym wdrożeniu pozostają działaniem operacyjnym; test dwóch klientów emulatora nie jest obserwacją produkcji.
