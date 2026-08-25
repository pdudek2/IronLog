# IronLog — roadmapa jakości UI/UX po audytach

**Status:** w realizacji
**Data:** 2026-08-14
**Źródła:** audyt Codex `ui-quality-gate` + `app-screen-refiner`, audyt Claude oraz wzajemna weryfikacja findings
**Tryb realizacji:** osobne, małe release slices; bez jednego mega-PR

**Wykonanie:** etap 1 ukończony i zintegrowany lokalnie do `main` w `f3aba48` — [receipt etapu 1](./2026-08-14-ui-quality-phase-1-implementation.md). Etap 2 ukończony i zintegrowany lokalnie do `main` w `4a9aa74` — [receipt etapu 2](./2026-08-16-ui-quality-phase-2-implementation.md). Etap 3 ukończony i zintegrowany lokalnie do `main` przez fast-forward do `abc72f3` — [receipt etapu 3](./2026-08-17-ui-quality-phase-3-implementation.md). Etap 4 został ukończony w trzech release slices: [4A — Coach](./2026-08-17-ui-quality-phase-4a-coach-implementation.md) zintegrowano lokalnie do `main` przez fast-forward do `f83a8c4`, [4B — Historia/listy](./2026-08-20-ui-quality-phase-4b-history-lists-implementation.md) do `d434558`, a [4C — shell/404](./2026-08-20-ui-quality-phase-4c-shell-404-implementation.md) do `139c0f8`. Etap 5 jest realizowany w trzech slices: [5A — bezpieczeństwo i semantyka](./2026-08-25-ui-quality-phase-5a-safety-semantics-implementation.md) ukończono i zintegrowano lokalnie do `main` przez fast-forward do `14fed63`; następny jest 5B Profil/czytelność, a 5C wykona końcowy Product gate. Decyzje B-02, M-07 i M-14 pozostają otwarte.

Materiały źródłowe:

- [audyt Codex](../playwright/ui-slop-audit-2026-08-14/ui-slop-and-screen-refiner-audit.md);
- [lokalny raport Claude](../../.playwright-mcp/audit/report.html);
- [artefakt Claude](https://claude.ai/code/artifact/68f76dde-8349-42cf-be5d-6679bb96eb3d).

## Podsumowanie

To nie jest pełny redesign ani przepisywanie aplikacji. Po odrzuceniu duplikatów, fałszywych alarmów i uwag czysto kosmetycznych zakres układa się w pięć etapów:

1. **bezpieczeństwo kluczowych interakcji** — średni;
2. **prawdziwość komunikatów i szybkie poprawki** — mały;
3. **czytelność analityki** — duży, z jedną decyzją produktową;
4. **layouty robocze na desktopie i mobile** — duży;
5. **spójność systemu i końcowy quality gate** — średni.

Najważniejsza zasada kolejności: najpierw usuwamy realne blokery i mylące stany w treningu, później poprawiamy analitykę i ogólną jakość powierzchni. Tanie poprawki mogą wejść równolegle, ale nie powinny wypierać problemów blokujących.

## Cele

- Usunąć wszystkie potwierdzone blokery na mobile i desktopie.
- Sprawić, by krytyczne dane i akcje były jednoznaczne bez domyślania się znaczenia koloru, zakresu lub stanu.
- Rozdzielić reprezentacyjne ekrany produktu od gęstych powierzchni roboczych.
- Utrzymać język Puls: ciemne, płaskie powierzchnie, ograniczona liczba pudełek, czytelna hierarchia operacyjna.
- Nie zmieniać lifecycle treningu, kontraktów Firestore ani API zamknięcia sesji.

## Mierniki ukończenia

- 0 blockerów przy szerokościach 320, 393, 1024 i 1440 px.
- Brak nakładania się stałych elementów, także z otwartą klawiaturą ekranową.
- Wszystkie główne akcje dostępne klawiaturą; cele dotykowe co najmniej 44×44 px.
- Istotne etykiety i dane nie mniejsze niż 12 px.
- Brak sprzecznych zakresów, liczników i komunikatów w UI.
- Wykresy pozostają zrozumiałe na dotyku, bez zależności od hovera.
- Brak błędów i ostrzeżeń w konsoli na audytowanych ścieżkach.
- Targetowane testy, pełny lint, testy jednostkowe i build przechodzą.

## Etap 1 — bezpieczeństwo kluczowych interakcji

**Priorytet:** P0
**Rozmiar:** M
**Cel:** trening i edycja planu muszą być bezpieczne oraz oczywiste na pierwszym użyciu.

### Zakres

- **Aktywny trening na desktopie:** ograniczyć szerokość kolumn pól serii i przywrócić widoczny stan spoczynkowy inputów. Obecne pola rozciągają się na duże obszary i wizualnie znikają na tle.
- **Edytor planu na mobile:** ukryć stały dock dla czystego, zapisanego stanu. Pomiar świeżego runtime potwierdził, że dirty-state ma już wystarczający scroll clearance, także przy ograniczonym `VisualViewport`; dodatkowy padding nie jest potrzebny.
- Po zapisaniu nie pokazywać aktywnego CTA ani fixed statusu, jeśli nic nie wymaga kolejnego działania.
- **Aktywny trening:** usunąć duplikację globalnej nawigacji przez `SESSION_QUICK_LINKS` na desktopie.
- **Wskazówka progresji:** nie pokazywać sugestii deloadu dla ukończonego ćwiczenia.
- Zachować potwierdzenie przy anulowaniu treningu. Ewentualna zmiana położenia lub hierarchii „Anuluj” zależy od decyzji produktowej poniżej.

### Kryteria akceptacji

- Na 1440 px pola ciężaru i powtórzeń są wizualnie rozpoznawalne, mają przewidywalną szerokość i poprawny focus.
- Na 320 i 393 px ostatnia kontrolka edytora jest w pełni widoczna nad dirty-state dockiem; po zapisie fixed dock znika.
- Po zapisie użytkownik nie widzi aktywnego CTA sugerującego niezapisane zmiany.
- Aktywny trening ma jeden system globalnej nawigacji.
- Ukończone ćwiczenie nie wyświetla sugestii deloadu.
- Testy lifecycle treningu nadal przechodzą; weryfikacja wizualna nie zapisuje danych produkcyjnych.

### Powiązane findings

- Claude: B-01, M-09, M-10 oraz obniżone B-02.
- Codex: blocker edytora planu na mobile.

## Etap 2 — prawdziwość UI i szybkie poprawki

**Priorytet:** P1
**Rozmiar:** S
**Cel:** usunąć małe, ale realnie mylące komunikaty i tanie bariery jakościowe.

Ten etap może być realizowany równolegle z etapem 1, ale nie zastępuje jego blockerów.

### Zakres

- Poprawić pusty komunikat dashboardu tak, aby mówił o właściwym zakresie tygodnia.
- W szczegółach ćwiczenia jawnie rozróżnić „ostatnie 10 treningów” od wartości all-time.
- Błąd logowania pokazać bezpośrednio przy polu, wykorzystując istniejący stan `error`/`aria-invalid` komponentu Input.
- Usunąć natywne i własne podwójne czyszczenie pola wyszukiwania.
- Poprawić fleksję „1 dni” → „1 dzień”.
- Nie oznaczać każdego historycznego wyniku jako PR; wyróżniać faktyczny rekord lub moment jego ustanowienia.
- Usunąć zduplikowane liczniki w edytorze planu i uporządkować położenie zapisu.
- Dodać `cursor: pointer` dla faktycznie klikalnych kontrolek jako tani quality pass.
- Zastąpić izolowane `transition-all` przejściami konkretnych właściwości.

### Kryteria akceptacji

- Tekst, licznik i zakres danych nie przeczą sobie na żadnej audytowanej powierzchni.
- Błąd logowania jest widoczny, powiązany z polem i ogłaszany technologiom asystującym.
- Wyszukiwarka pokazuje tylko jedną kontrolkę czyszczenia.
- Historyczne rekordy nie sugerują, że każdy wpis jest nowym PR.
- Tanie zmiany interakcyjne nie wprowadzają nowych tokenów ani zależności.

### Powiązane findings

- Claude: M-01, M-03, M-15, M-18, P-02, P-03, P-05, P-06, P-07.
- Codex: błędny zakres komunikatu dashboardu, `transition-all`.

## Etap 3 — analityka, która mówi prawdę

**Priorytet:** P1
**Rozmiar:** L
**Warunek wejścia:** spełniony 2026-08-17 — jedno wybrane ćwiczenie naraz, domyślnie najczęściej wykonywane, bez normalizacji.

### Rekomendowany wariant minimalny

Pokazywać **jedno wybrane ćwiczenie naraz** na wykresie progresji ciężaru. Domyślnie można wybrać najczęściej wykonywane ćwiczenie, a użytkownik zmienia serię prostym selektorem.

To jest prostsze i uczciwsze niż normalizowanie różnych ćwiczeń albo umieszczanie kilku nieporównywalnych skal na jednej osi. Normalizację odkładamy do czasu, gdy powstanie konkretna potrzeba analityczna.

### Zakres

- Zastąpić wspólny wykres pięciu ćwiczeń pojedynczą, wybieraną serią albo innym zatwierdzonym modelem porównania.
- Powiększyć wykres objętości w szczegółach ćwiczenia, zwęzić słupki i udostępnić wartości ostatnią/maksymalną bez hovera.
- Dodać na mobile krótką odpowiedź „czy idę do przodu?” przed gęstymi tabelami i wykresami; dalsze dane ujawniać progresywnie.
- Uzupełnić heatmapę o czytelne znaczniki czasu i wartości możliwe do odzyskania na dotyku.
- Uporządkować nazwy zakresów i opisy osi, aby nie mieszały danych lokalnych z all-time.

### Kryteria akceptacji

- Jeden punkt/kolor/linia ma jedno zrozumiałe znaczenie.
- Żaden wykres nie porównuje bez wyjaśnienia niekompatybilnych skal ciężaru.
- Kluczowe wartości da się odczytać na urządzeniu dotykowym.
- Pierwszy ekran Postępów na mobile odpowiada na pytanie o trend, a nie tylko pokazuje gęsty zestaw metryk.
- Puste i krótkie serie danych mają celowy stan zamiast pozornie zepsutego wykresu.

### Powiązane findings

- Claude: M-04, M-05, P-08.
- Codex: zbyt gęsty mobile Progress i brak nadrzędnego wniosku.

## Etap 4 — powierzchnie robocze

**Priorytet:** P2
**Rozmiar:** L
**Stan:** DONE — 4A, 4B i 4C zintegrowane lokalnie do `main`; etap zamknięty.
**Cel:** ekrany do pracy mają być szybsze w skanowaniu niż ekrany reprezentacyjne.

### Kierunek layoutu

- Zachować duży, ekspresyjny display dla Startu i głównego podsumowania Postępów.
- Dla Historii, Planów, Biblioteki ćwiczeń, Profilu i Coacha zastosować gęstszy wariant workbench: mniejszy nagłówek, ograniczona szerokość treści, bliżej położone filtry i akcje.
- Nie tworzyć nowego design systemu. Wystarczy wykorzystać istniejące utility classes i dodać minimalny wariant layoutu tam, gdzie obecny `page-title` jest zbyt dominujący.

### Zakres

- **Coach:** jednoznaczny stan bez klucza, ograniczona szerokość rozmowy, widoczny composer po konfiguracji oraz poprawne markery list w odpowiedziach Markdown.
- **Historia:** czytelny spoczynkowy affordance filtrów, grupowanie wyników według miesięcy oraz ograniczenie długości wierszy na desktopie.
- **Plany:** celowy stan dla jednej lub dwóch pozycji; pokazywać strukturę planu bez wymuszania rozwijania, gdy lista jest krótka.
- **Biblioteka i pozostałe listy:** ograniczyć drogę wzroku między treścią i akcjami na szerokim ekranie.
- **404:** pokazać stronę wewnątrz chrome aplikacji, tak aby użytkownik nie tracił orientacji i nawigacji.

### Kryteria akceptacji

- Użytkownik nie dostaje wielkiego hero przed filtrem lub listą, z którą przyszedł pracować.
- Główne wiersze robocze nie wymagają skanowania całej szerokości desktopu.
- Coach nigdy nie wygląda jednocześnie na aktywny i zablokowany.
- Historię da się skanować miesiącami bez ręcznego filtrowania każdego zakresu.
- 404 zachowuje kontekst zalogowanej aplikacji.

### Powiązane findings

- Claude: M-06, M-08, M-11, M-12, M-13 oraz obniżone B-03.
- Codex: wspólny hero na ekranach roboczych, Coach, szerokie powierzchnie desktopowe.

## Etap 5 — spójność systemu i końcowy quality gate

**Priorytet:** P2
**Rozmiar:** M
**Cel:** usunąć pozostałe niespójności bez wygładzania charakteru Puls.
**Stan:** ACTIVE — slice 5A ukończony i zintegrowany; 5B jest następny, 5C zamknie etap.

### Zakres

- Ustalić 12 px jako minimum dla istotnych etykiet i danych; mniejsze rozmiary zostawić wyłącznie dla dekoracyjnych metadanych.
- Usunąć redundantne eyebrow/kicker labels tam, gdzie powtarzają tytuł sekcji.
- Rozdzielić kolory identyfikujące kategorie/partie mięśniowe od kolorów stanów semantycznych: effort, recovery, warning, error.
- Kolorowym liczbom i badge’om dodać etykietę albo odebrać znaczenie semantyczne, jeżeli koloru nie da się zrozumieć.
- Ujednolicić destrukcyjne akcje: niski nacisk wizualny w spoczynku, jednoznaczny confirmation flow po aktywacji.
- W Profilu użyć istniejącego stylu slidera z readiness i ograniczyć szerokość przełącznika jednostek.
- Wykonać końcowy audyt wszystkich tras, ważnych stanów i breakpointów.

### Kryteria akceptacji

- Semantyczny czerwony/zielony/pomarańczowy nie zmienia znaczenia między ekranami.
- Destrukcyjne akcje nie konkurują z primary CTA, ale są jasne po intencjonalnym uruchomieniu.
- Istotny tekst jest czytelny bez powiększania interfejsu.
- Wszystkie trasy przechodzą test klawiatury, kontrastu, focusu, dotyku i konsoli.
- Są zapisane regresyjne screenshoty dla 320, 393, 1024 i 1440 px.

### Powiązane findings

- Claude: M-02, M-16 oraz obniżone B-04.
- Codex: mikrotekst 9–11 px, redundantne kickery, konflikt kategorii i semantyki.

## Mapa findings → etap

| Etap | Findings |
| --- | --- |
| 1. Bezpieczeństwo | Claude B-01, M-09, M-10, B-02 po obniżeniu; Codex blocker edytora mobile |
| 2. Prawdziwość / quick wins | Claude M-01, M-03, M-15, M-18, P-02, P-03, P-05, P-06, P-07; Codex komunikat tygodnia i `transition-all` |
| 3. Analityka | Claude M-04, M-05, P-08; Codex mobile Progress |
| 4. Workbench | Claude M-06, M-08, M-11, M-12, M-13, B-03 po obniżeniu; Codex layouty robocze i Coach |
| 5. Spójność | Claude M-02, M-16, B-04 po obniżeniu; Codex typografia, kickery i semantyka kolorów |

## Decyzje produktowe przed realizacją

1. **Wykres progresji:** rekomendacja — jedno wybrane ćwiczenie naraz. Alternatywa to normalizacja, ale wymaga definicji metryki i większego zakresu.
2. **Coach bez klucza:** rekomendacja — zachować historię jako read-only, ale jednoznacznie zablokować composer i sugestie. Ukrycie całej rozmowy jest prostsze, lecz odbiera wartość powracającemu użytkownikowi.
3. **Historia:** rekomendacja — stałe grupowanie miesięczne. Paginację dodać dopiero, gdy pomiary pokażą problem wydajnościowy.
4. **„Anuluj” w treningu:** pozostawić w top barze z confirmation albo przenieść do overflow/końca. Niezależnie od decyzji potwierdzenie pozostaje wymagane.
5. **Usuwanie z list:** obecne potwierdzenie chroni przed utratą danych. Przeniesienie usuwania do szczegółu lub gestu jest zmianą interakcji, nie konieczną poprawką bezpieczeństwa.
6. **Nomenklatura `Partia`:** zdecydować, czy etykieta oznacza szeroką kategorię, czy konkretny mięsień. Do tego czasu nie scalać na siłę różnych taksonomii.
7. **„Ostatnio” w aktywnym treningu:** powiązanie techniczne jest poprawne; zmienić nazwę dopiero po ustaleniu, czy ma znaczyć poprzednią serię bieżącej sesji, czy ostatni trening.

## Świadomie odłożone

- Normalizacja ciężarów między ćwiczeniami — dopiero gdy wybrany zostanie taki model analityczny.
- Paginacja Historii — dopiero po potwierdzeniu problemu wydajnościowego.
- Password bullets, „gołe” liczniki i pełne ujednolicenie wszystkich section actions — tylko oportunistycznie podczas pracy w danym komponencie.
- Przebudowa danych, nowy framework wykresów, nowy design system i nowe zależności — poza zakresem.

## Odrzucone findings

- **M-17:** domniemane zduplikowane accessible name nie potwierdziło się.
- **P-09:** martwe tokeny to porządek w kodzie, nie realny problem produktowy tego audytu.
- Loginowy gradient/waveform nie jest traktowany jako AI slop; jest celowym wyjątkiem i elementem tożsamości.

## Niezmienniki

- Zachować paletę Puls, płaskie ledger surfaces i istniejący focus ring.
- Zachować tabelaryczny zapis ukończonego treningu i poprawny empty state wyszukiwania.
- Nie zmieniać kontraktów Firestore, `exerciseSource`, serwerowego finalize/discard ani modelu danych.
- Nie usuwać confirmation flow z operacji powodujących utratę danych.
- Nie „spłaszczać” wszystkich elementów: ograniczone, interaktywne kontrolki nadal mogą mieć własną powierzchnię.
- Ukończony plan `2026-08-11-puls-final-visual-polish.md` pozostaje historią. Jego ograniczenie dotyczące nietykania wypełnionego aktywnego treningu jest uchylone wyłącznie dla potwierdzonych problemów B-01, M-09, M-10 i ewentualnej decyzji B-02.

## Strategia dostarczania

- Jeden etap = jeden mały zestaw PR-ów lub jeden release slice, zależnie od rozmiaru.
- Etap 2 może wejść równolegle, o ile nie opóźnia etapu 1.
- Każdy etap kończy się testami targetowanymi i screenshotami zakresu, nie tylko przeglądem diffu.
- Po etapach 3 i 5 wykonać ponowny audyt Product na świeżym runtime.

## Minimalny zestaw weryfikacji

- **Trening:** `workout-mobile`, synchronizacja aktywnej sesji, discard/finalize, stale-session feedback.
- **Plany:** `templates`, testy wizualne i dostępność edytora.
- **Postępy i szczegóły ćwiczenia:** `progress`, `ExerciseDetailCatalogState`, dotykowa weryfikacja wykresów.
- **Historia:** `HistoryPage`, smoke, dostępność i duży zestaw danych demo.
- **Coach:** `chat`, `ChatPageAccessibility`, stan z kluczem i bez klucza.
- **Shell i 404:** `protected-shell`, `NotFoundPage`, nawigacja klawiaturą.
- **Całość:** lint, unit, build, kontrast, konsola oraz screenshoty 320/393/1024/1440.

## Self-audit roadmapy

- **Pokrycie Claude:** 1/1 Block i 19/19 Material mają etap albo jawny gate produktowy. M-07 i M-14 są decyzjami, bo implementacja bez ustalenia znaczenia zmieniłaby produkt na podstawie domysłu.
- **Pokrycie Codex:** 6/6 priorytetyzowanych findings ma etap; formalny strict flag Hallmark pozostaje świadomym wyjątkiem.
- **Polish:** M-18 oraz P-02, P-03, P-05, P-06, P-07 i P-08 są zaplanowane; P-01, P-04 i P-10 są jawnie odłożone; P-09 usunięte.
- **Fałszywe alarmy:** M-17 i P-09 nie wróciły tylnymi drzwiami jako zadania techniczne.
- **Kontrola scope creep:** brak migracji danych, nowych zależności, nowego design systemu i zmian kontraktów lifecycle.
- **Ryzyko planu:** etap 4 jest największy i podczas realizacji powinien zostać rozbity na osobne PR-y dla Coacha, Historii/list oraz shell/404. Nie wymaga to osobnych decyzji produktowych.
- **Kolejność:** szybkie `cursor: pointer` i ukrycie deloadu są tanie, lecz niski koszt nie awansuje ich ponad blokery interakcji.

## Definition of done całej roadmapy

- Wszystkie potwierdzone Block i Material są naprawione, świadomie odłożone z decyzją albo ponownie zweryfikowane jako nieaktualne.
- Nie ma nowych regresji w lifecycle treningu ani zapisie danych.
- Końcowy read-only audyt Product obejmuje wszystkie dostępne powierzchnie i istotne stany w świeżym runtime.
- Raport końcowy zawiera porównanie przed/po, pozostały dług i jawne decyzje produktowe.
