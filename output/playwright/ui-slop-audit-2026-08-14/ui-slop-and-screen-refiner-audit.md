# IronLog — audyt AI slopu i App Screen Refiner

**Data:** 14 sierpnia 2026
**Tryb:** Product, read-only
**Runtime:** świeża sesja aplikacji, mobile 393 × 852 i desktop 1440 × 900
**Werdykt:** interfejs jest zaprojektowany i rozpoznawalny, ale zachował szablonowe pozostałości w makrostrukturze ekranów.

## Cel produktu

Użytkownik ma szybko zdecydować, co dziś ćwiczy, bezpiecznie poprowadzić sesję i zrozumieć, czy robi postęp.

## Zakres

Sprawdzone powierzchnie i stany:

- logowanie;
- Start z istniejącą aktywną sesją i pustymi statystykami bieżącego tygodnia;
- Postępy;
- Plany i mobilny edytor planu;
- Biblioteka ćwiczeń i detal własnego ćwiczenia;
- Historia i detal treningu;
- profil użytkownika;
- Coach bez skonfigurowanego klucza API, z istniejącą historią rozmowy;
- aktywny trening, przerwa i modal odrzucenia treningu.

Nie wykonywano zapisów ani akcji destrukcyjnych. Nie zweryfikowano stanów wymagających rzeczywistej mutacji danych, m.in. powodzenia i błędu zapisu planu, zakończenia treningu oraz Coacha ze skonfigurowanym kluczem. W odwiedzonych widokach nie wystąpiły błędy ani ostrzeżenia konsoli.

## Werdykt

IronLog nie wygląda całościowo jak AI slop. Puls ma własny język: konsekwentny kolor wysiłku i regeneracji, instrumentowy charakter, płaskie powierzchnie oraz wiarygodną gęstość danych.

Pozostał jednak wyraźny „AI residue”: wiele ekranów korzysta z tego samego wielkiego hero, mikrolabelki nad nagłówkiem i długiego dokumentu rozdzielanego liniami. Różne zadania zaczynają przez to wyglądać jak warianty jednego wygenerowanego szablonu.

## Trzy główne przyczyny

1. **Jeden szablon dla różnych zadań.** Ekrany analityczne i robocze otrzymują tę samą heroifikowaną sylwetkę.
2. **Hierarchia oparta na mikrolabelkach.** Redundantne kickery i tekst 9–11 px zastępują prostszy podział informacji.
3. **Wszystko pozostaje widoczne naraz.** Długie ekrany i stałe warstwy nie stosują wystarczającej progresywnej prezentacji treści.

## Priorytetyzowane znaleziska

### 1. BLOCK oceny ekranu — dock zapisu zasłania zawartość edytora planu

Na mobile stały dock „Wszystkie zmiany zapisane” przykrywa następny wiersz ćwiczenia. Nie uniemożliwia przewijania całego formularza, ale zasłania aktywną treść w pierwszym viewportcie i dlatego blokuje pozytywną ocenę interakcji tego ekranu.

- **Dowód:** [widok mobilnego edytora](viewport-mobile-template-editor.png).
- **Źródło:** [`index.css`](../../../src/index.css#L5781) ustawia dock jako `position: fixed` nad dolną nawigacją; formularz korzysta z osobno dobranego dolnego paddingu.
- **Przyczyna:** brak jednego współdzielonego kontraktu na dolny inset wszystkich mobilnych warstw.
- **Głębokość:** **recompose**.
- **Kierunek:** pełny dock tylko dla `dirty`, `saving` i `error`; stan „zapisano” jako krótki, pasywny komunikat. Jedno źródło prawdy dla dolnego clearance.

### 2. P1 — utility screens są heroifikowane

Historia, Plany, Biblioteka, Coach, profil ćwiczenia i Postępy korzystają z prawie identycznego dużego tytułu oraz pionowego rytmu. Dashboard i Postępy mogą uzasadniać displayowe otwarcie; Biblioteka lub Historia są narzędziami roboczymi i potrzebują zwartego nagłówka.

- **Dowody:** [Plany desktop](desktop-templates.png), [Historia desktop](desktop-history.png), [Coach desktop](desktop-chat.png).
- **Źródło:** wspólna reguła `2.65–4.15rem` dla sześciu typów ekranów w [`index.css`](../../../src/index.css#L9144).
- **Skutek:** Plany rozciągają pojedynczy wiersz na całą szerokość, Historia tworzy długie rekordy, a wiadomości Coacha trafiają na przeciwne krawędzie szerokiego dokumentu.
- **Głębokość:** **recompose**.
- **Kierunek:** dwa poziomy szablonu — display dla Start/Postępy i zwarty workbench dla ekranów operacyjnych. W Planach nazwa, dni i start powinny tworzyć jeden ograniczony klaster zamiast zajmować przeciwne krańce szerokiego wiersza.

### 3. P1 — Coach pokazuje jednocześnie stan aktywny i zablokowany

Bez klucza API ekran nadal pokazuje rozmowę, taby, historię i nieaktywny composer, podczas gdy konfiguracja klucza dominuje nad wszystkim. Nie jest jasne, czy użytkownik znajduje się w trybie tylko do odczytu, czy funkcja jest niesprawna.

- **Dowody:** [Coach mobile](viewport-mobile-chat.png), [Coach desktop](desktop-chat.png).
- **Źródło:** lista wiadomości w [`ChatPage.tsx`](../../../src/pages/ChatPage.tsx#L597) współistnieje z composerem blokowanym przez brak konfiguracji w [`ChatPage.tsx`](../../../src/pages/ChatPage.tsx#L684).
- **Głębokość:** **recompose**.
- **Kierunek:** wyśrodkowany rail rozmowy o szerokości około 60–70 znaków, jednoznaczny stan „Coach zablokowany” oraz zwarta konfiguracja klucza.
- **Decyzja produktowa:** czy wcześniejsze rozmowy mają pozostać dostępne bez klucza API.

### 4. P1 — Postępy nie odpowiadają szybko „czy idzie mi lepiej?”

Na mobile użytkownik dostaje kolejno KPI, kilka wykresów, balans partii, kalendarz i 21 rekordów. Wszystkie części mają podobną wagę, dlatego brakuje nadrzędnego wniosku.

- **Dowód:** [Postępy mobile](mobile-progress.png).
- **Źródło:** kolejne pełne sekcje wykresów i rekordów w [`ProgressPage.tsx`](../../../src/pages/ProgressPage.tsx#L528).
- **Głębokość:** **recompose**.
- **Kierunek:** najpierw jeden aktualny sygnał, np. „objętość rośnie, siła stabilna”; niżej szczegóły. Rekordy ograniczyć do najważniejszych lub domyślnie zwinąć.

### 5. P1 — hierarchia zbyt często opiera się na mikrolabelkach

Powtarza się schemat:

> Objętość → Wolumen tygodniowy
> Siła → Progresja ciężaru
> Wyniki od początku → Rekordy od początku

To antywzorzec „eyebrow on every section”. Labelki często nie dodają znaczenia, a ekran wygląda jak zestaw automatycznie wygenerowanych sekcji.

- **Źródła:** [`ProgressPage.tsx`](../../../src/pages/ProgressPage.tsx#L528) i wspólny styl kickerów w [`index.css`](../../../src/index.css#L9131).
- **Dodatkowy problem:** kickery mają około 11 px, etykiety dolnej nawigacji 9 px w [`BottomNav.tsx`](../../../src/components/BottomNav.tsx#L37), a daty wykresu ćwiczenia 9 px w [`ExerciseDetailPage.tsx`](../../../src/pages/ExerciseDetailPage.tsx#L295).
- **Głębokość:** **polish**.
- **Kierunek:** usunąć redundantne kickery i przyjąć 12 px jako minimum dla istotnej informacji.

### 6. P2 — empty state tygodnia sugeruje brak całej historii

Przy użytkowniku posiadającym zapisane treningi dashboard pokazuje: „Statystyki pojawią się po pierwszej zapisanej sesji”. Faktycznie chodzi o brak treningu w bieżącym tygodniu. Komunikat może zostać odczytany jako utrata danych albo uszkodzony profil.

- **Źródło:** [`DashboardPage.tsx`](../../../src/pages/DashboardPage.tsx#L743).
- **Głębokość:** **polish**.
- **Kierunek:** „Statystyki tygodnia pojawią się po pierwszym treningu”.

## Ścisły audyt AI-slopu

### Formalny strict flag Hallmark — świadomy wyjątek produktowy

**Gradient headline** — animowany gradient i glow na słowie „rytm.” w [`index.css`](../../../src/index.css#L1050).

Hallmark klasyfikuje ten wzorzec jako critical, ale nie został on przeniesiony do produktowych priorytetów P0/P1. W tym kontekście działa lepiej niż większość takich zastosowań: ogranicza się do jednego słowa, jest semantycznie związany z waveformem i stanowi charakterystyczny moment marki. Nie rekomenduję usuwania bez przyjęcia polityki zero-tolerance. Jeżeli taka polityka obowiązuje, najprostsza korekta to stały `--puls-effort-text` z zachowaniem jednorazowego wejścia i waveformu.

### Major

1. **Eyebrow on every section** — szczególnie Postępy, Biblioteka i Coach.
2. **Default-attractor sameness** — wspólny wielki nagłówek i dokumentowa konstrukcja dla ekranów o różnych zadaniach.
3. **Transition-all** — chipy filtrów używają `transition-all` w [`ExercisesPage.tsx`](../../../src/pages/ExercisesPage.tsx#L235). Należy ograniczyć animowane właściwości do koloru, tła i obramowania. Jest to znalezisko źródłowe; w audycie wizualnym nie zaobserwowano awarii animacji.

### Minor

**Every section padded the same** — wspólna „workspace convergence” w [`index.css`](../../../src/index.css#L9110) spłaszcza charakter ekranów i wzmacnia ich szablonowe podobieństwo.

### Ocena

**Reads designed, but has templated residues.** IronLog nie jest generyczną „gradientową aplikacją AI”. Problemem jest podobieństwo makrostruktury ekranów, nie brak tożsamości wizualnej.

## Rubryka App Screen Refiner

| Obszar | Ocena | Uzasadnienie |
|---|---|---|
| Task fit | WEAK | Coach i Postępy nie prowadzą szybko do decyzji. |
| Recognition | PASS | Historia, plany i ćwiczenia są rozpoznawalne. |
| Hierarchy | WEAK | Nadmiar kickerów i równorzędnych sekcji. |
| Typography | WEAK | Istotne teksty schodzą do 9–11 px. |
| Color | PASS | Puls jest konsekwentny i semantyczny. |
| Density | WEAK | Postępy i edytor są za długie. |
| Interaction | BLOCK | Dock edytora zasłania kontrolki. |
| Host/product fit | PASS | Interfejs pasuje do aplikacji treningowej. |
| AI-slop resistance | WEAK | Mocna marka, ale powtarzalna makrostruktura. |
| Concept divergence | N/A | Audyt read-only, bez alternatywnych konceptów. |

## Co zachować

- login „Trening ma swój rytm” z waveformem;
- ograniczoną paletę Puls i semantyczne kolory;
- płaskie, ledgerowe powierzchnie zamiast kolejnych zagnieżdżonych kart;
- gęstość danych w szczegółach historii treningu;
- desktopowy układ analityczny Postępów;
- wyraźne stany aktywne i główne czerwone CTA.

## Najmniejszy spójny kolejny przebieg

1. Naprawić mobilny clearance oraz zachowanie docka zapisu.
2. Rozdzielić szablon display od workbench bez tworzenia nowego design systemu.
3. Usunąć redundantne kickery i podnieść minimum istotnego tekstu do 12 px.
4. Uporządkować zablokowany stan Coacha.
5. Dodać nadrzędny wniosek i progresywne ujawnianie szczegółów w Postępach.

## Materiały

Wszystkie screenshoty wykorzystane w audycie znajdują się w bieżącym katalogu. Pełne screenshoty służyły do oceny długości i makrostruktury; problemy z warstwami stałymi były potwierdzane dodatkowo na screenshotach `viewport-*`, aby nie pomylić artefaktu pełnostronicowego z rzeczywistym overlapem.

---

## Self-audit raportu

Raport został ponownie przeczytany po zapisaniu, porównany ze screenshotami viewportowymi oraz ze wskazanymi fragmentami kodu.

| Wymiar kontroli | Ocena | Wynik |
|---|---:|---|
| Spójność tezy | 8/10 | Raport konsekwentnie oddziela tożsamość Puls od szablonowych pozostałości. Formalny flag Hallmark został wyraźnie oddzielony od priorytetów produktu. |
| Hierarchia raportu | 8/10 | Najpierw przyczyny i problemy blokujące, później audyt slopu, zachowane elementy i kolejny przebieg. Duplikat dotyczący desktopowych Planów został scalony ze znaleziskiem nr 2. |
| Precyzja dowodów | 8/10 | Każdy główny problem ma screenshot lub odsyłacz do źródła. Dla Coacha rozdzielono dowód listy wiadomości i zablokowanego composera. |
| Użyteczność | 8/10 | Każde znalezisko wskazuje głębokość interwencji i kierunek, bez proponowania nowego systemu lub niezamówionej implementacji. |
| Oryginalność | 6/10 | Forma raportu jest celowo konwencjonalna. Wartością jest kalibracja między formalnym wykrywaczem slopu a kontekstem produktu, nie nietypowa prezentacja. |

### Korekty wykonane po self-audicie

1. Scalono odseparowane akcje Planów z nadrzędnym problemem heroifikacji zamiast sztucznie zwiększać liczbę znalezisk.
2. Doprecyzowano, że dock blokuje ocenę interakcji ekranu, ale nie uniemożliwia przewinięcia całego formularza.
3. Dodano osobne odsyłacze do listy wiadomości i blokady composera Coacha.
4. Formalny „critical” Hallmark oznaczono jako świadomy wyjątek, a nie produktowy P0.
5. Odrzucono potencjalne problemy nawigacji widoczne wyłącznie na screenshotach full-page. Jako rzeczywisty overlap pozostawiono tylko dock edytora potwierdzony w zwykłym viewportcie.

### Pozostałe ograniczenia

- Audyt nie obejmuje efektów operacji zapisu i destrukcyjnych mutacji z powodu trybu read-only.
- Coach został sprawdzony bez klucza API; działająca rozmowa i generowanie planu wymagają osobnego przebiegu.
- Priorytety opisują aktualny runtime i seed danych, nie wszystkie możliwe konta oraz długości treści.
