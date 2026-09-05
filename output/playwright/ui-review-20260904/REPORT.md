# IronLog — szczegółowy audyt UI / UX

**Puls ma spójny charakter i dobrą bazę wizualną. Największe problemy dotyczą geometrii formularzy i mobilnych zestawień oraz czytelności obsługi serii.** Potwierdziłem **6 usterek UI: 5 × P2 i 1 × P3**. Jedna powtarza F08 z wcześniejszego audytu; pięć jest nowych. Oddzielnie opisuję **6 rekomendacji UX**, które nie oznaczają awarii funkcji.

Przegląd wykonano 4 września 2026 na HEAD `64fde7e`, w trybie **review / utility** według app-screen-refiner. Powstało **110 świeżych zrzutów stanów**. Oceniano rzeczywiste renderowanie w Chromium, interakcje i CSS. Dwie niezależne krytyki wybranych ekranów objęły kompozycję oraz użyteczność; końcowe ustalenia uwzględniają dodatkową weryfikację w przeglądarce.

**To raport, bez zmian w kodzie aplikacji.** Nie zastępuje [wcześniejszego audytu backendu i lifecycle](/Users/patryk/Desktop/IronLog/output/playwright/deep-audit-20260904/REPORT.md). Wcześniejsze P1 dotyczące danych pozostają ważniejsze od kosmetyki.

[Galeria zrzutów](/Users/patryk/Desktop/IronLog/output/playwright/ui-review-20260904/gallery.html) · [Macierz stanów](/Users/patryk/Desktop/IronLog/output/playwright/ui-review-20260904/STATE-MATRIX.md) · [Pomiary i axe](/Users/patryk/Desktop/IronLog/output/playwright/ui-review-20260904/EVIDENCE.json)

## Zakres i wiarygodność materiału

- Główne viewporty: **393 × 852** i **1440 × 1000**. Dodatkowo **320 × 740/852** oraz **768 × 1024** w wybranych przepływach.
- Aktualny ciemny Puls: Archivo, Instrument Sans, Spline Sans Mono, obecne kolory i powierzchnie. Nie projektowano nowego motywu.
- Lokalny Vite, API i emulatory Firebase `demo-ironlog`; osobne konto audytowe, bez danych produkcyjnych.
- Początkowo puste konto, potem 18 treningów na przestrzeni 300 dni, 3 plany i 3 własne ćwiczenia. Następnie wykonano dodatkową sesję przez UI: **Bench Press, 1 seria, 80 kg × 5, 400 kg objętości**. Późniejsze zrzuty zawierają więc 19 treningów i inne sumy.
- Lista modeli, odpowiedzi AI i błąd 503 były kontrolowanymi odpowiedziami testowymi. Oceniano interfejs, nie jakość porad ani płatne Anthropic. Sprawdzono oczekiwanie i ukończoną odpowiedź NDJSON; nie ciągłe dopisywanie wielu tokenów.
- Jedno własne ćwiczenie w fixture ma nazwę 63-znakową, przekraczającą limit formularza o 3 znaki. To dodatkowy stress case. **Żadna z sześciu usterek nie zależy od tej nazwy.** Problem listy planów odtworzono na poprawnej nazwie 52-znakowej oraz zwykłym „Trening w domu bez maszyn”.
- Do oceny Postępów używać zrzutów `*-loaded-settled.png`; wcześniejsze mogą pokazywać animację wejściową wykresu. Zrzuty z toastami dokumentują stany przejściowe.
- Stała nawigacja na zrzucie całej strony może wypaść pośrodku długiego obrazu. Nie uznawano tego za dowód zasłaniania treści. Osobno sprawdzono viewport i przewijanie. Dolna nawigacja świadomie chowa się podczas przewijania w dół oraz w określonych trybach edycji.

## Trzy główne przyczyny słabszego wyniku

1. **Podział miejsca nie dostosowuje się do treści.** Nagłówki i pola planu mają różne siatki, wykres traci wspólną podstawę, a akcje planu i metryki Coacha zabierają miejsce nazwom.
2. **Istotna akcja bywa zbyt podobna do zwykłych danych.** Numer serii jest przyciskiem zatwierdzenia; ciężar poza fokusem przypomina tekst. Kilka silnych akcji otaczających sesję konkuruje o uwagę.
3. **Nawigacja i feedback nie są wszędzie jednakowo dopracowane.** Potwierdzenia dobrze prowadzą fokus, picker go gubi. Walidacja profilu jest przy polu, a briefu AI i własnego ćwiczenia — daleko od niego.

## Potwierdzone usterki

P2 oznacza konkretny błąd do zaplanowanej naprawy; P3 — drobną usterkę. Każda pozycja poniżej ma dowód w aktualnym renderowaniu lub interakcji oraz w kodzie. Nie dopisuję nowych P1 do przeglądu wizualnego.

### UI01 · P2 · Nagłówki edytora planu opisują niewłaściwe kolumny

**Znane wcześniej jako F08, ponownie potwierdzone.** Przy szerokości 1440 px „Serie” zaczyna się przy x ≈ 212, a pierwsze pole serii przy x ≈ 441. „Powt.” wypada nad pierwszym polem zamiast drugim. Użytkownik musi pamiętać kolejność danych, zamiast odczytać ją z nagłówków.

Przyczyna: nagłówek używa `minmax(11rem, .6fr) repeat(3, minmax(0, 1fr))`; wiersz dzieli szerokość na `.6fr / 1fr`, a następnie prawą część na trzy pola. Różnią się także odstępy.

**Najmniejsza poprawka:** uzgodnić geometrię nagłówka i wierszy. Akceptacja: etykiety odpowiadają polom przy 1024/1280/1440 px, także przy dłuższej nazwie ćwiczenia. Nowa biblioteka tabel jest zbędna.

[Dowód wizualny](/Users/patryk/Desktop/IronLog/output/playwright/ui-review-20260904/desktop-template-columns-evidence.png) · [CSS](/Users/patryk/Desktop/IronLog/src/index.css:5874)

### UI02 · P2 · Wykres wolumenu ćwiczenia łamie się do drugiego rzędu

**Nowe.** Dla Bench Press i dziesięciu ostatnich sesji przy 393 px dziewięć słupków mieści się w pierwszym rzędzie, a ostatni, z 4 września, trafia pod nie. Przy 320 px układ wynosi 7 + 3. Przy 768 px wszystkie dziesięć mieści się w jednym rzędzie.

Słupki tracą wspólną podstawę, co utrudnia porównanie i odczyt chronologii. DOM potwierdza różnicę położenia rzędów o około 134 px przy 393 px.

Przyczyna: `repeat(auto-fit, minmax(1.25rem, 2rem))` automatycznie przenosi kolumny. **Najmniejsza poprawka:** pojedynczy rząd elastycznych kolumn lub jawnie przewijana oś, jeśli dat nie można zmieścić czytelnie. Akceptacja: dziesięć słupków na jednej podstawie przy 320 i 393 px; daty pozostają rozróżnialne.

[393 px](/Users/patryk/Desktop/IronLog/output/playwright/ui-review-20260904/mobile-exercise-volume-viewport.png) · [320 px](/Users/patryk/Desktop/IronLog/output/playwright/ui-review-20260904/narrow-exercise-volume-viewport.png) · [CSS](/Users/patryk/Desktop/IronLog/src/index.css:9712)

### UI03 · P2 · Podgląd planu Coacha ucina metrykę poziomu poza ekranem

**Nowe.** Na telefonie tytuł i trzy metryki nadal stoją obok siebie. Przy 393 px metryki otrzymują około 190 px, po 63 px na kolumnę. „Średniozaawansowany” ma obszar treści szeroki na około 229 px i wychodzi za ekran. Przy 320 px nachodzą na siebie również etykiety „Ćwiczenia” i „Poziom”.

Brak poziomego scrolla dokumentu nie oznacza poprawnego renderowania — treść jest lokalnie obcinana. To standardowa opcja formularza, nie sztucznie długi tekst.

Przyczyna: poziomy flex w `.coach-plan-preview-head`, trzy równe metryki i znaczący padding. **Najmniejsza poprawka:** na telefonie umieścić podsumowanie pod nazwą i zapewnić poziomowi odpowiednią szerokość lub własny wiersz. Akceptacja: pełne etykiety i poziom przy 320/393/768/1440 px. Sprawdzić także szerokość nazw ćwiczeń — tabela podglądu rezerwuje dla dwóch prawych kolumn stałe 6 i 7 rem.

[393 px, rzeczywisty viewport](/Users/patryk/Desktop/IronLog/output/playwright/ui-review-20260904/mobile-coach-plan-preview-viewport.png) · [320 px](/Users/patryk/Desktop/IronLog/output/playwright/ui-review-20260904/narrow-coach-plan-preview-viewport.png) · [Układ](/Users/patryk/Desktop/IronLog/src/index.css:7564) · [Metryki](/Users/patryk/Desktop/IronLog/src/index.css:10050)

### UI04 · P2 · Picker ćwiczeń nie przywraca fokusu po zamknięciu

**Nowe, odtworzone w aktywnej sesji i edytorze planu.** Fokus na „Dodaj ćwiczenie” → Enter → wyszukiwarka w dialogu → Escape. Po zamknięciu `document.activeElement` wskazuje `BODY`, zamiast przycisku otwierającego. Użytkownik klawiatury traci miejsce w formularzu.

Przyczyna: `autoFocus` wyszukiwarki działa przed efektem `useDialogA11y`. Hook zapamiętuje już pole wewnątrz otwartego dialogu jako poprzedni element; po zamknięciu próbuje przywrócić fokus do usuniętego inputa.

**Najmniejsza poprawka:** powierzyć początkowy fokus istniejącemu hookowi i usunąć konkurujące `autoFocus` pickera; sprawdzić wszystkich jego użytkowników. Akceptacja: Escape wraca do właściwego „Dodaj ćwiczenie”. Dla porównania ConfirmDialog poprawnie zapętlał Tab/Shift+Tab i przywracał fokus do „Zakończ” lub przycisku usuwania.

[Picker](/Users/patryk/Desktop/IronLog/output/playwright/ui-review-20260904/mobile-exercise-picker.png) · [Reprodukcja](/Users/patryk/Desktop/IronLog/output/playwright/ui-review-20260904/EVIDENCE.json) · [autoFocus](/Users/patryk/Desktop/IronLog/src/components/ExercisePicker.tsx:99) · [Hook](/Users/patryk/Desktop/IronLog/src/hooks/useDialogA11y.ts:35)

### UI05 · P2 · Lista planów rozpada się typograficznie na wąskim ekranie

**Nowe.** Przy 393 px tytuł planu dostaje tylko około 149 px. Przy 320 px zostaje około 76 px, ponieważ edycja, usuwanie i „Struktura” zachowują wspólny rząd. Nawet „Trening w domu bez maszyn” łamie się wewnątrz wyrazów. „Powrót do regularnych treningów po dłuższej przerwie” tworzy wysoką kolumnę fragmentów słów.

Przyczyna: `minmax(0, 1fr) auto` dla nazwy i akcji oraz `overflow-wrap: anywhere`. Przy 393 px pogarsza to skanowanie, a przy 320 px jest wyraźną usterką kompozycji.

**Najmniejsza poprawka:** na telefonie przenieść akcje pod nazwę albo ograniczyć zajmowaną przez nie szerokość. Nie zmniejszać fontu ani celów dotykowych, aby ratować ten sam układ. Akceptacja: zwykła nazwa pozostaje czytelna bez rozrywania słów; długa poprawna nazwa nie wypycha kolejnego planu o kilkaset pikseli.

[393 px](/Users/patryk/Desktop/IronLog/output/playwright/ui-review-20260904/mobile-templates-loaded.png) · [320 px](/Users/patryk/Desktop/IronLog/output/playwright/ui-review-20260904/narrow-templates-loaded.png) · [CSS](/Users/patryk/Desktop/IronLog/src/index.css:5276)

### UI06 · P3 · Widoczne „Plany” ma dostępną nazwę „Wróć”

**Nowe.** W nagłówku edytora widoczny tekst przycisku to „Plany”, ale `aria-label` zastępuje go słowem „Wróć”. Nazwy w interfejsie i drzewie dostępności nie odpowiadają sobie. Utrudnia to odszukanie kontrolki przez nazwę, np. przy sterowaniu głosem.

**Najmniejsza poprawka:** usunąć zbędny `aria-label` lub użyć nazwy zawierającej widoczne „Plany”. Akceptacja: widoczny i dostępny opis wskazują to samo miejsce. Samo przejście do listy działa.

[Przycisk](/Users/patryk/Desktop/IronLog/output/playwright/ui-review-20260904/desktop-template-back-hover.png) · [Kod](/Users/patryk/Desktop/IronLog/src/pages/TemplateEditorPage.tsx:336)

## Rekomendacje UX — oddzielnie od usterek

### UX01 · Wysoka wartość · Wyraźniej pokazać zatwierdzanie serii

Numer 1/2/3 jest przyciskiem wykonania, lecz wygląda jak indeks wiersza. Dopiero po zatwierdzeniu pojawia się znacznik. Pola ciężaru i powtórzeń poza fokusem również przypominają zwykłe liczby. Funkcja działa; problem dotyczy odkrywalności przy pierwszym użyciu i pośpiechu.

Warto pokazać dyskretny kształt kontrolki wykonania lub krótką wskazówkę przy pierwszym użyciu, a dla pól zachować delikatny sygnał edytowalności. Nie dodawać karty do każdej serii. Wykonane serie powinny pozostać spokojniejsze wizualnie.

[Seria wykonana i niewykonane, z fokusem](/Users/patryk/Desktop/IronLog/output/playwright/ui-review-20260904/mobile-workout-input-focus.png) · [Kontrolka](/Users/patryk/Desktop/IronLog/src/components/workout/WorkoutExerciseLedgerItem.tsx:249)

### UX02 · Średnia wartość · Zbliżyć dane sesji do nazwy ćwiczenia na desktopie

Nazwa, podsumowanie i pola są szeroko rozstawione. Dodawanie ćwiczenia, zakończenie i globalne wznowienie jednocześnie używają mocnego akcentu. Wpisywanie kolejnej serii ma słabszą hierarchię niż akcje wokół niego.

Warto wyrównać lokalny blok danych bliżej nazwy i ograniczyć konkurencję akcentów. Zakończenie nadal powinno być łatwe do znalezienia. Globalne „Wznów” ma uzasadnienie na innych stronach; na ekranie już otwartej sesji wnosi niewiele.

[Desktop sesji](/Users/patryk/Desktop/IronLog/output/playwright/ui-review-20260904/desktop-workout-input-focus.png) · [Końcowa reguła pozycjonowania](/Users/patryk/Desktop/IronLog/src/index.css:10607)

### UX03 · Średnia wartość · Mocniej wskazać pierwszy krok w pustym planie

„Dodaj dzień” i podsumowanie mają dużo ciężaru wizualnego, gdy plan nie zawiera ćwiczeń. „Dodaj ćwiczenie” jest skromne. Po dodaniu ćwiczenia przy pustej nazwie zapis pozostaje wyłączony — poprawnie, lecz bez lokalnej wskazówki przy brakującej nazwie.

Warto wyeksponować dodanie pierwszego ćwiczenia i warunek zapisu przy brakującym polu. Po wypełnieniu planu hierarchia może wrócić do obecnej. Rozbudowany kreator jest zbędny.

[Pusty plan](/Users/patryk/Desktop/IronLog/output/playwright/ui-review-20260904/desktop-templates-new-empty.png) · [Nieaktywny zapis bez nazwy](/Users/patryk/Desktop/IronLog/output/playwright/ui-review-20260904/mobile-template-invalid-disabled.png)

### UX04 · Średnia wartość · Połączyć powtórzone sumy w Postępach

Najpierw widać 48 580 kg i 14 sesji, potem ponownie 48.6k kg i 14 sesji, tym razem ze zmianą względem poprzedniego okresu. Porównanie okresów wnosi wartość; ponowne pokazanie sum wydłuża drogę do pierwszego wykresu.

Warto połączyć sumę, okres i zmianę w jeden blok. Średnia na sesję oraz rekordy mogą pozostać osobno, bo odpowiadają na inne pytania. Celem jest wcześniejszy dostęp do analizy bez utraty trendu.

[Postępy na telefonie](/Users/patryk/Desktop/IronLog/output/playwright/ui-review-20260904/mobile-progress-loaded-settled.png)

### UX05 · Średnia wartość · Ujednolicić walidację przy błędnym polu

Profil i ustawienie klucza pokazują błąd tuż przy polu. Własne ćwiczenie pokazuje błąd nazwy po kategoriach i mięśniach, a generator planu błąd celu pod całym briefem. Na telefonie cel i komunikat dzieli prawie ekran.

Warto przenieść komunikat obok pola i skierować tam fokus po próbie wysłania. Zachować istniejące `aria-invalid` i `aria-describedby`; semantyczne połączenie nie rozwiązuje odległości wizualnej. Nie dublować tej samej treści w trzech miejscach.

[Dobry wzorzec: Profil](/Users/patryk/Desktop/IronLog/output/playwright/ui-review-20260904/mobile-profile-validation.png) · [Własne ćwiczenie](/Users/patryk/Desktop/IronLog/output/playwright/ui-review-20260904/mobile-custom-exercise-validation.png) · [Cel planu](/Users/patryk/Desktop/IronLog/output/playwright/ui-review-20260904/mobile-coach-plan-validation.png)

### UX06 · Niska wartość · Nazwać trening w potwierdzeniu usunięcia

Usuwanie własnego ćwiczenia i planu podaje ich nazwy. Dialog ukończonego treningu używa ogólnego „Potwierdź akcję” i „Usunąć ten trening?”. Przy przyciemnionym tle nazwa i data sesji nie są łatwe do potwierdzenia.

Warto użyć „Usunąć trening?” i dopisać nazwę oraz datę. Zachować anulowanie jako początkowy fokus. Amber jest częścią Puls; sam kolor akcji nie jest błędem.

[Trening](/Users/patryk/Desktop/IronLog/output/playwright/ui-review-20260904/mobile-delete-workout-dialog.png) · [Porównanie z planem](/Users/patryk/Desktop/IronLog/output/playwright/ui-review-20260904/mobile-delete-template-dialog.png)

## Ocena ekran po ekranie

PASS oznacza dobry wynik w obserwowanym zakresie; WEAK — konkretną poprawkę lub rekomendację; BLOCK — usterkę blokującą akceptację danego kryterium. To nie średnia ani punktacja.

| Ekran i zadanie | Ocena | Co działa / co wymaga uwagi |
|---|---|---|
| Logowanie i rejestracja — wejść na konto | PASS | Jednoznaczna akcja, czytelne pola, fokus i błąd danych. Formularz mobilny jest łatwy do objęcia wzrokiem. |
| Onboarding — ustawić profil | PASS | Czytelny wybór celu i rytmu, widoczna walidacja. Dekoracyjne tło desktopu samo w sobie nie uzasadnia redesignu. |
| Dashboard — zacząć/wznowić trening | PASS wizualnie | Pusty stan daje dalszy krok, aktywny zachowuje kontekst. Po gotowości widać propozycję i informację o dopasowaniu. Ankieta rozwija się inline, nie w modalu. |
| Aktywna sesja — wpisać i zatwierdzić serię | WEAK | Dobry podział serii i timer, działająca walidacja powtórzeń. UX01/02 i UI04; niezawodność zapisu ma osobny wcześniejszy audyt. |
| Szczegóły treningu — odczytać/edytować | PASS z uwagą | Czytelne kolumny i jednostki, edycja wyraźnie odsłania pola. UX06. Brakujący trening ma skromniejszy ekran niż ogólne 404. |
| Historia — znaleźć trening | PASS | Miesiące, nazwy i metryki pomagają skanować listę. Brak wyników daje wyczyszczenie filtrów. Sprawdzono Wszystko i dół listy. |
| Postępy — porównać wyniki | WEAK | Dobry podział analiz, wybór ćwiczenia i dnia działa. UX04: powtórzone sumy. Roczny zakres ma wcześniejsze F06. |
| Plany — wybrać plan | WEAK / BLOCK przy 320 px | Desktop przejrzysty, struktura przydatna. UI05 rozbija nazwy na wąskim ekranie. |
| Edytor planu — ustawić dni i parametry | BLOCK dla geometrii desktopu | Wybrane dni widoczne, guard niezapisanych zmian działa. UI01 fałszywie przyporządkowuje etykiety; dodatkowo UI04, UI06 i UX03. |
| Biblioteka — znaleźć/utworzyć ćwiczenie | PASS z uwagą | Filtry, podział własne/globalne, brak wyników i edycja mają jasne role. UX05. Poziome filtry są świadomie przewijane. |
| Szczegóły ćwiczenia — zobaczyć progres | BLOCK dla wykresu mobile | Nagłówek i historia czytelne, pusty stan Plank wyjaśnia brak danych. UI02. „Powt. max” ma wcześniejsze F19. |
| Coach — analiza lub plan | WEAK / BLOCK dla podglądu mobile | Oczekiwanie, częściowy kontekst, błąd i ponowienie czytelne. UI03 i UX05. Opcjonalnie ograniczyć stale pustą prawą kolumnę zajętą tylko przez zapisany klucz. |
| Profil — zmienić preferencje | PASS | Jednoznaczne wybory, jednostki, błąd imienia i toast zapisu. Odstęp legendy „Główny cel” od separatora to drobny polish, nie blokada. |
| 404 — odzyskać nawigację | PASS | Jasny komunikat i główna akcja. Nieistniejące ćwiczenie ma powrót do biblioteki; trening prosty „Wróć”. |

## Ocena według rubric app-screen-refiner

| Kryterium | Wynik | Obserwacja |
|---|---|---|
| Dopasowanie do zadania | PASS z lokalnymi uwagami | Wyraźne role ekranów; UX01/03 dotyczą pierwszego kroku. |
| Rozpoznawanie i skanowanie | WEAK | Historia działa dobrze, nazwy planów tracą czytelność na mobile. |
| Hierarchia i kompozycja | BLOCK lokalnie | UI01/02/03 są błędami geometrii, nie preferencją estetyczną. |
| Typografia i rytm | WEAK | Fonty i role tekstu spójne; UI05 rozrywa wyrazy. Nie zagęszczać dalej małych etykiet wykresów. |
| Kolor i motyw | PASS wizualnej spójności; kontrast niezamknięty | Kolory stanów pasują do Puls. Axe pozostawił przypadki do ręcznej oceny kontrastu. |
| Gęstość i odstępy | WEAK | Sesja desktop rozsuwa dane; mobilne Postępy powtarzają sumy. Kolejne karty nie rozwiążą problemu. |
| Interakcje i feedback | BLOCK dla powrotu fokusu | UI04. Potwierdzenia, profil i ponowienie AI działały w próbach. |
| Spójność z produktem | PASS | Brak podstaw do globalnej wymiany fontów, akcentu czy powierzchni. |
| Nadmiar dekoracji / generyczne wzorce | PASS z uwagami | Problem leży w rozmieszczeniu danych; glow i dodatkowe opisy nie naprawią kolumn. |
| Porównanie alternatywnych koncepcji | N/A | Zlecono ocenę aktualnego UI, nie projekt wariantów. |

## Interakcje i granice weryfikacji

Sprawdzono fokus pól i wybranych przycisków, hover powrotu, zmianę dnia planu, filtry, Tab/Shift+Tab/Escape w potwierdzeniu, powrót fokusu pickera, wyłączony zapis niekompletnego planu oraz walidację logowania, imienia, klucza, celu planu, nazwy ćwiczenia i powtórzeń. Obejrzano edycję szczegółów, usuwanie ćwiczenia/planu/treningu, wyjście bez zapisu, konflikt uruchomienia planu, zakończenie pustej sesji i poprawny zapis sesji. Po zatwierdzeniu serii pojawił się timer przerwy.

Po wcześniejszym odrzucaniu i przeładowaniu aplikacji przy powrocie do sesji wystąpiło „Nie udało się potwierdzić zamknięcia sesji”. **„Spróbuj ponownie” doprowadziło do Dashboardu.** [Zrzut](/Users/patryk/Desktop/IronLog/output/playwright/ui-review-20260904/mobile-workout-closure-error.png) dokumentuje prezentację błędu; ta runda nie izoluje nowej przyczyny lifecycle i nie liczy tego jako kolejnej potwierdzonej usterki.

**axe:** na sześciu ekranach mobilnych, dla tagów `wcag2a`, `wcag2aa`, `wcag21aa`, nie było automatycznie potwierdzonych naruszeń. Pozostały `incomplete` dla kontrastu i pojedyncze `aria-prohibited-attr`. **Zero naruszeń w axe nie oznacza pełnego zaliczenia dostępności** — UI04/UI06 wykryto osobno. Szczegóły w EVIDENCE.json. To nie zastępuje pomiaru wszystkich kolorów na gradientach ani odsłuchu czytnika.

Przy 320 px Profil, Historia, Postępy i Plany nie powodowały poziomego overflow dokumentu. UI03/UI05 pokazują, dlaczego taki test samodzielnie nie wystarcza. Na mobilnej liście planów nie znaleziono widocznych przycisków o wymiarze poniżej 32 px; nie jest to pomiar wszystkich celów dotykowych aplikacji.

**Poza tą rundą:** prawdziwy iPhone/Android i klawiatura ekranowa, Safari, VoiceOver/NVDA, systemowy zoom i wszystkie skale tekstu, każda kombinacja hover/focus każdej kontrolki, wszystkie błędy sieci wszystkich stron, długi stream i przerwanie AI, zakończenie odliczania timera. Użyto preferencji ograniczonego ruchu, ale nie wydaję osobnej akceptacji wszystkich animacji. Nie powtarzano builda i całych testów wcześniejszego audytu, bo kod produktu się nie zmienił.

## Kolejność dalszych prac

1. Zachować pierwszeństwo napraw danych z wcześniejszego audytu.
2. Naprawić UI01–UI05: kolumny, wykres, podgląd AI, fokus i nazwy planów.
3. Dopracować zatwierdzanie serii oraz pierwszy krok w planie: UX01–UX03.
4. Uporządkować sumy, walidację i drobne nazewnictwo: UX04–UX06, UI06.
5. Powtórzyć problematyczne stany i wykonać krótką próbę na rzeczywistym telefonie.

**Zalecana głębokość:** lokalne naprawy i polish; ograniczona zmiana układu mobilnej listy planów oraz podglądu Coacha. Obserwacje nie uzasadniają pełnego redesignu IronLog.



## Status realizacji — 2026-09-05

**CLOSED w uzgodnionym zakresie mobilnym.** UI02–UI06, UX01 i UX03–UX06 wdrożone w `e2672dd`, scalonym do lokalnego `main`, po fazie danych `8c06f2b`. UI01/F08 oraz UX02 są jawnie odłożone na polecenie Patryka. Historyczne opisy powyżej pozostają dowodem stanu sprzed napraw.

[Macierz stanów, wyniki testów, odczytane obrazy i granice weryfikacji](../../plans/2026-09-05-september-audits-closeout.md). Obserwacja dotyczy świeżego lokalnego runtime'u przy 320/393/768 px, z dodatkową kontrolą edytora przy wysokości 740 px. Nie wykonano próby na fizycznym telefonie ani redesignu desktopu. Brak pushu/deployu. Próba na urządzeniu pozostaje częścią przyszłej weryfikacji wdrożeniowej.
