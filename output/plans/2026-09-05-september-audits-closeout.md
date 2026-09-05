# IronLog — realizacja audytów z 4 września

**Status: CLOSED — zakres obu audytów wdrożony, zweryfikowany i scalony fast-forward do lokalnego `main`. F08/UI01 i UX02 pozostają jawnie odłożone zgodnie z decyzją Patryka.**

## Pochodzenie i zakres

Właściciele zakresu: [pełny audyt](../playwright/deep-audit-20260904/REPORT.md) i [osobny audyt UI](../playwright/ui-review-20260904/REPORT.md). Poprzednik: [zamknięty nocny audyt](2026-09-05-nightly-convergence-closeout.md), lokalne main `72ac 646`. Następnie gałąź `audit-data-integrity`, commit funkcjonalny `8c 06f 2b` i mobilny polish `e 2672dd`. Oba commity znajdują się w lokalnym `main`. Ukończenie fazy danych nie zamykało automatycznie rodziców.

Project-convergence: Large/phased, ustalone zachowanie i potwierdzone przyczyny; Critical dla izolacji/danych, Elevated dla kompletności analiz, Standard dla geometrii UI. Lean/Ponytail lite. Wykorzystano istniejące usługi, identyfikatory, bariery wersji i hook dostępności; bez nowych zależności, kolekcji, systemu projektowego i migracji produkcji. Niezależne granice powierzono skonfigurowanym workerom; root odpowiada za decyzje, integrację i seryjny runtime. Publiczne metadane potwierdzają role workerów; model/effort nie były nadpisywane ani wnioskowane.

## Status ustaleń

| Ustalenia | Wykonanie i dowód |
|---|---|
| F01–04, F18 | Zamknięte w poprzednim closeout: lifecycle/zapis, ochrona konta i bezpieczny domyślny QA. Zachowane testy regresji. |
| F05 | Potwierdzenie usunięcia przechowuje ID sesji i klienta ćwiczenia, a indeks wylicza z aktualnego stanu. Jednostkowo: zmiana kolejności/usunięcie poprzednika, brak celu, nowa sesja. Emulator: zdalna rehydratacja nie usuwa nowego ćwiczenia. |
| F06 | Zakres odczytu obejmuje wybrany okres i poprzedni (2×30/90/365 dni). Szerszy wybór nie pokazuje krótszego snapshotu jako pełnych danych. Testy: wpisy sprzed 200/400 dni, oczekiwanie, błąd, ponowienie, zmiana konta. Istniejące limity odczytu pozostają jawne. |
| F07 | Edytor wyświetla preferowane kg/lbs i jednostkę; zapis pozostaje w kg. 80 kg→176.4 lbs, zapis bez edycji zachowuje dokładne 80 kg, edytowane 100 lbs→45.3592 kg. |
| F09 | Błąd odczytu szczegółów jest odróżniony od potwierdzonego braku. Trwały feedback i ponowienie, zachowanie dostępnego preview oraz recovery usuwania; odpowiedzi starego UID/trasy ignorowane. |
| F10 | Zamiar usunięcia jest utrwalany przed żądaniem. Brak potwierdzenia przetrwa reload, a ponowienie jest idempotentne. Rozróżniono wynik nieznany i potwierdzone usunięcie z nieukończonym cleanup. Pamięć jest ograniczona do jednej nierozstrzygniętej operacji na UID; kolejne usuwanie czeka na jej rozwiązanie. Emulator: serwer usuwa, odpowiedź ginie, Dashboard/szczegóły odtwarzają recovery po reload i skutecznie ponawiają. |
| F11 | Równoległa materializacja tej samej wersji ukończona przez drugie żądanie jest sukcesem. Nowsza wersja i usunięcie pozostają chronione. Trzy kontrolowane punkty przeplotu w integracji. |
| F12 | Projekcje scalają powtórzone ćwiczenie według workout+source+exerciseId, sumując serie. Kanoniczna kolejność ćwiczeń pozostaje zachowana. Testy:800 kg/1sesja, usunięcie jednej pozycji→400 kg, odbudowa starszej projekcji, rozdzielenie global/user. Kod nie przeliczył historycznych danych produkcyjnych. |
| F13 | Klucz Claude należy do UID; pending auth, logout i inne konto nie odczytują go. Stary wpis bez właściciela jest usuwany, bez przypisania do aktualnego konta. A→logout→B→A sprawdzone przez prawdziwy Auth emulator i UI; testy żądań potwierdzają właściwy klucz. |
| F14 | Żądanie czatu zawiera do 12 najnowszych niepustych wiadomości po 4000 znaków, a przekroczenie 128 KiB UTF-8 usuwa najstarszy kontekst. Najnowsza wiadomość i pełna historia interfejsu pozostają. Testy obejmują Unicode i rozmiar całego JSON. |
| F15 | Limit 31 treningów bez osiągnięcia granicy 30 dni oznacza ograniczony kontekst. Najnowsze 4 sesje pozostają użyteczne, ale sumy miesięczne i sugestie słabszych tygodni są pomijane. Budżet kontekstu 69 dokumentów zachowany. |
| F16 | Późne ukończenie generatora zachowuje aktualnie wybraną Rozmowę; gotowy podgląd czeka w Planie. Test z odroczonym wynikiem. |
| F17 | Generator czyta maksymalnie 101 własnych ćwiczeń;100 stanowi limit katalogu, dodatkowy dokument wykrywa przekroczenie. Powyżej limitu zwraca czytelny 422 przed wywołaniem Anthropic i wskazuje ręczne tworzenie planu. Brak arbitralnego podzbioru lub sugestii usuwania danych. |
| F19 | Etykieta „Powt. przy rekordzie” opisuje liczbę powtórzeń przy rekordowym ciężarze; semantyka rekordu bez zmian. Obejrzano z rekordem 140 kg×5. |
| F20 | README i .env.example opisują Web/Admin, Node, emulator, klucz prywatny i ADC oraz właściwe komendy. Publiczne i serwerowe ustawienia rozdzielone; bez odczytu sekretów. Mockowane AI E2E są emulator-only. |
| F21 | Błąd połączenia w produkcji prosi o sprawdzenie połączenia i ponowienie; komendy npm są tylko w DEV. Obie ścieżki Coacha objęte testami. |
| UI02 | Słupki w jednym rzędzie ze wspólną podstawą; natywny poziomy scroll i fokus klawiatury zachowują czytelne daty.10 słupków,320/393/768 px, przewinięcie do ostatniego sprawdzone. |
| UI03 | Na mobile nagłówek poprzedza metryki; poziom ma własny pełny wiersz. Nazwy ćwiczeń zawijają się, kolumny liczb są węższe. Pełny „Średniozaawansowany” przy 320/393/768 px. |
| UI04, UI06 | Hook dialogu zarządza początkowym i powracającym fokusem; usunięto autoFocus pickera. Escape wraca do openerów sesji i edytora. Widoczne i dostępne „Plany” zgodne. |
| UI05 | Akcje mobilnego planu pod tytułem, bez zmniejszania fontu i celu dotykowego. Poprawna długa nazwa przy 320/393 px. |
| UX01 | Nieukończona seria ma widoczną kontrolkę, edytowalne pola subtelne podkreślenie; ukończona seria jest spokojniejsza. Brak kart per seria. |
| UX03 | Pusty dzień eksponuje dodanie pierwszego ćwiczenia. Brak nazwy wyjaśniony obok pola. Wypełniony dzień wraca do akcji drugorzędnej. Skrócono powtórzoną instrukcję. |
| UX04 | Objętość, sesje i średnia z deltami są pokazane raz w jednym podsumowaniu. Usunięto osobny powtarzający je pasek i martwe selektory CSS. |
| UX05 | Błędy nazwy ćwiczenia i celu AI bezpośrednio przy polu, fokus przy błędzie, pojedynczy komunikat; błędy sieci pozostają na poziomie sekcji. |
| UX06 | Dialog usuwania podaje nazwę i datę treningu. Zachowano początkowy fokus anulowania i kolor ostrzegawczy Puls. |
| F08/UI01, UX02 | Odłożone zgodnie z poleceniem Patryka: geometria kolumn edytora desktop oraz kompozycja sesji desktop. F08/UI01 to ten sam problem. |

## Weryfikacja

- 737 testów jednostkowych w 78 plikach; po ostatniej zmianie tekstu API dodatkowo 13 testów tego endpointu.
- 19 testów reguł Firestore.
- 50 testów integracji lifecycle w 3 plikach.
- E2E: pełny przebieg 238 pass / 45 skip / 6 fail; po korekcie kontraktów ponowienie 20 pass / 11 skip / 2 fail, następnie geometria 5 pass. Wszystkie 6 pierwotnie niezaliczonych scenariuszy potwierdzono jako PASS w celowanych ponowieniach (łącznie 244 aktywne przypadki pełnego zestawu, bez podwójnego liczenia ponowień). Pełnego zestawu nie uruchamiano ponownie po zmianach samych testów i tekstu dialogu.
- 4 testy CSP zaliczone na finalnym kodzie.
- Lint/build/typecheck: zaliczone po finalnej korekcie tekstów. Dodatkowo 58 testów Dashboard/szczegółów po zmianie treści dialogu.
- Skoncentrowany przebieg danych:34pass,7skip; mobilny kandydat 44pass,1skip,1 błąd fixture zegara; po przeniesieniu dat fixture zamiast podmiany Date wszystkie 7 prób mobilnych przeszły bez ignorowania diagnostyki.

Sztuczny historyczny Date wpływał na środowisko Firebase; kontrolowana zmiana na realny zegar z przesuniętymi danymi usunęła obserwowany błąd. Dokładnej gałęzi SDK odwołującej Listen handshake nie przypisano bez dowodu. Odrzucone testy rejestracji i animowanej rehydratacji naprawiono przez oczekiwanie na właściwą stronę/stabilny zestaw pól, a ponowienie usuwania sprawdza ukończenie operacji, nie jej stan pending. Pełny przebieg ujawnił dodatkowo stare oczekiwania tekstu dialogu, przezroczystości edytowalnych pól oraz niezawężony selektor Plany. Testy szerokości porównują teraz scrollWidth z szerokością prostokąta dokumentu (obszar układu bez rezerwy scrollbar-gutter: stable), zachowując ścisłą kontrolę overflow. Sprzątanie sesji nie przeładowuje ponownie trasy workout, jeśli już na niej jest; nadal oczekuje gotowości i potwierdzenia odrzucenia. Filtry diagnostyki nie zostały globalnie poluzowane.

## Obserwacja wizualna i macierz

Powierzchnia: jedna odizolowana przeglądarka Playwright, emulatory demo-ironlog, brak rzeczywistych wywołań AI i danych produkcyjnych. Jedyny motyw: ciemny Puls. Widoki 320/393/768×852; dodatkowy snapshot edytora 393×740 i desktop wyłącznie jako kontrola regresji wspólnego komponentu. Zrzuty finalne po fontach/ustabilizowaniu opacity i zniknięciu toastów tam, gdzie zasłaniały oceniany fragment.

Visual evidence: Observed — surface: Playwright; image proof: completed `tools.view_image` calls on the final `test-results/audit-mobile-*/` screenshots returned the actual final images of templates, empty/missing-name editor, Coach preview/goal error, exercise volumes/record, progress comparison, custom-field error and pending/completed ledger. Kopie zachowano w [galerii zrzutów](../playwright/audit-implementation-20260905/gallery.html).

| Macierz | Stan |
|---|---|
| Wolumen 10 + rekord,320/393/768 | observed; jeden poziom podstawy, ostatni słupek osiągalny przez scroll, poprawna etykieta rekordu |
| Podgląd planu z długą nazwą/poziomem,320/393/768 | observed; poziom i nazwa ćwiczenia czytelne bez obcięcia |
| Długa nazwa planu,320/393 | observed; tytuł korzysta z szerokości, akcje poniżej |
| Edytor pusty/z ćwiczeniem bez nazwy,393 | observed; główna akcja i lokalny warunek zapisu |
| Sesja: oczekująca/ukończona seria,393 | observed; rozróżnienie kontrolki i stanu ukończenia |
| Postępy: dane + poprzedni okres,393 | observed; każdy total pokazany raz z właściwą deltą |
| Walidacja celu/nazwy,393 | observed; komunikat i fokus przy polu |
| Picker: Escape z sesji/edytora | observed interaction; testy zwrotu fokusu |
| Delete: utracona odpowiedź/reload/retry | observed interaction; nazwany dialog dołączony do bieżących testów |
| Inne motywy | N/A; aplikacja w tym zakresie nie oferuje drugiego motywu |
| Desktop redesign | jawnie deferred; nie wydano akceptacji F08/UI01/UX02 |

Rubric: task fit PASS (pierwsze ćwiczenie/ponowienie jasne), recognition PASS (pełne tytuły), hierarchy PASS (tytuł→metryki→ćwiczenia; sumy tylko raz), typography PASS w badanych elementach (bez zmniejszania tekstu dla naprawy układu), color/theme PASS wizualnie (Puls zachowany; to nie pełny certyfikat kontrastu), density PASS (usunięty powtórzony pasek, brak nowych kart), interaction PASS (fokus, error/retry, scroll), host fit PASS (obecne tokeny/fonty), AI-slop PASS (zawieranie tylko danych/akcji/modalu, brak ozdobnego redesignu), concept divergence N/A (polish, nie eksploracja). Subtraction pass: usunięte duplicate totals/CSS i odległe duplikaty walidacji; skrócona instrukcja pustego dnia.

## Wdrożenie i odzyskanie

Zakres zamknięcia jest lokalny. Nie wykonano push, deploy ani przeliczenia produkcyjnych danych. Powrót do wcześniejszego zachowania: odwrócenie scoped commitów przed wdrożeniem; brak migracji schematu do cofnięcia.

Po przyszłym wdrożeniu użytkownicy starego klucza bez UID muszą wpisać go ponownie. Klucz danego konta pozostaje w tej przeglądarce i wraca po zalogowaniu na to samo konto. Domyślny model pozostaje niesekretną preferencją lokalną.

Historyczne projekcje F12 wymagają osobnej kontrolowanej materializacji kanonicznych treningów zawierających powtórzony source+exerciseId. Należy przeliczyć wszystkie dotknięte treningi przed uznaniem ich wspólnych rekordów za naprawione. Testy lokalne potwierdzają odbudowę; nie oznacza to wykonania backfillu produkcji.

Granice: Chromium i emulatory; brak nowej próby na fizycznym telefonie/Safari/VoiceOver, rzeczywistego Anthropic ani pomiaru produkcyjnej latencji. Desktop pozostaje następnym, odłożonym zakresem. Żadna z tych granic nie jest opisana jako wykonane wdrożenie lub pełna akceptacja desktopu.

## Integracja i porządek

Kod zintegrowany w lokalnym `main`: `8c 06f 2b` (funkcjonalność) i `e 2672dd` (mobile oraz kontrakty regresji). Zaktualizowano status obu raportów nadrzędnych. Usunięto wyłącznie scaloną gałąź tej fazy `audit-data-integrity` oraz trzy jej gitignorowane plany: audit-data-integrity, audit-functional-completion i audit-mobile-polish z 2026-09-05. Ich zakres, decyzje, dowody i dalsze zobowiązania zachowano w tym raporcie. Stary worktree nocnego zadania i niezwiązane lokalne artefakty pozostawiono.

Dowody: [galeria](../playwright/audit-implementation-20260905/gallery.html), [manifest SHA-256](../playwright/audit-implementation-20260905/SHA256SUMS), logi w katalogu evidence obok manifestu (usunięto jedynie kody kolorów ANSI i końcowe białe znaki). Pierwsze nieudane przebiegi pozostają jawne; nie przedstawiono ich jako zielonych. Sprawdzono referencje galerii, sumy kontrolne oraz brak niezapisanych zmian śledzonego kodu.

Następny etap wymaga osobnego zakresu wdrożeniowego: publikacja i kontrolowana naprawa historycznych projekcji F12 oraz próba na rzeczywistym telefonie. Desktop pozostaje deferred. Zamknięcie audytów dotyczy wykonania uzgodnionych poprawek lokalnych, bez deklarowania wykonania tych czynności produkcyjnych.
