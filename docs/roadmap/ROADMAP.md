# IronLog — aktywna roadmapa

Status dokumentu: **PROGRAM ZAKOŃCZONY — konwergencja wizualna Puls**
Ostatnia aktualizacja: 2026-08-08

## Routing

- **Decyzja:** ustalona — poprawiamy pięć potwierdzonych problemów z audytu,
  bez ponownego otwierania kierunku Puls.
- **Diagnoza:** znane przyczyny — konflikt wspólnego shella z akcjami ekranu,
  nadmierny chrome przed treścią, mylący wariant range-empty, lokalna
  panelizacja i zbyt drobne metadane.
- **Wykonanie:** duże/przekrojowe — wspólny shell oraz kilka niezależnych
  ekranów wymagają osobnych bramek wizualnych.
- **Ryzyko:** standardowe — zmiany są odwracalne i nie dotykają autoryzacji,
  zapisu treningu ani modelu danych.
- **Postawa prostoty:** Lean / Ponytail lite.
- **Workflow:** pakietowy; szczegółowo planowany jest tylko najbliższy pakiet.

## Dowody wejściowe

Audyt z 2026-08-07 uzyskał **28/40** i potwierdził trzy problemy P1 oraz dwa
P2. Nie wykazał błędów konsoli, poziomego overflow ani potrzeby zmiany
identyfikacji Puls. Gradient słowa „rytm”, waveform, subtelna siatka i obecne
tokeny design systemu pozostają świadomymi inwariantami produktu.

Poprzedni program 8A–9 pozostaje zamknięty. Jego dowody i traceability są w
[`archive/2026-08-03-corrective-roadmap-8a-9.md`](archive/2026-08-03-corrective-roadmap-8a-9.md).

## Cel programu

Usunąć potwierdzone tarcia bez pełnego redesignu:

1. przywrócić jednoznaczną hierarchię akcji na mobile;
2. pokazać właściwą treść katalogu ćwiczeń w pierwszym viewportcie;
3. odróżnić pusty zakres czasu od braku danych użytkownika;
4. ograniczyć powtarzane KPI i zagnieżdżone panele;
5. zapewnić czytelność istotnych metadanych na mobile.

## Poza zakresem

- zmiana brandingu, loginu, waveformu lub globalnej palety Puls;
- zmiany Firestore, API, lifecycle treningu albo autoryzacji;
- nowe zależności, nowe warstwy abstrakcji lub równoległe specyfikacje;
- szeroki refactor CSS niezwiązany z potwierdzonymi problemami;
- dokładanie testów dla każdej klasy i wariantu wizualnego.

## Kolejność realizacji

### 1. Mobilna hierarchia zadań — **zakończony**

Zakres:

- szczegół zakończonego treningu: usunąć konflikt pomiędzy BottomNav a
  `Edytuj / Usuń trening`;
- szczegół treningu: pozostawić jedno główne podsumowanie KPI i usunąć
  generyczny boczny indicator;
- biblioteka ćwiczeń: przenieść wyszukiwanie przed drugorzędne akcje i
  skompresować filtry na mobile tak, aby właściwa lista była widoczna bez
  przewijania całego ekranu ustawień.

Plan wykonawczy:

1. W `AppLayout`/`BottomNav` rozpoznać trasę szczegółu `/workout/:id`
   oddzielnie od aktywnej sesji `/workout/new`. Na szczególe właścicielem
   dolnej strefy zostają lokalne akcje treningu; globalna nawigacja nie może
   być równocześnie widoczna w tej samej strefie.
2. Uprościć clearance i zachowanie `WorkoutDetailMobileActions`, korzystając
   z obecnego mechanizmu inline/fixed. Nie dodawać drugiego systemu docków.
3. W `WorkoutDetailPage` zachować jeden pełny zestaw metryk sesji. Usunąć
   powtórzenia objętości, top setu i liczby powtórzeń oraz dekoracyjny 4px
   `border-left`, bez zmiany edycji i usuwania treningu.
4. W `ExercisesPage` zachować istniejące filtry i ich semantykę, lecz na
   mobile zmniejszyć ich wysokość i priorytet. Preferować prosty układ CSS i
   istniejące komponenty zamiast nowego systemu filtrów.
5. Zaktualizować tylko testy chroniące zachowanie: widoczność właściwej
   warstwy nawigacji/akcji, dostępność filtrów oraz brak regresji akcji
   edycji i usuwania. Bez testowania pikseli i klas implementacyjnych.

Kryteria akceptacji:

- przy szerokości 390px akcje `Edytuj / Usuń trening` są w całości widoczne,
  klikalne i nie nakładają się z globalną nawigacją;
- przejście inline → fixed nie powoduje skoku, migotania ani utraty fokusu;
- szczegół pokazuje każdą główną metrykę sesji tylko raz przed listą ćwiczeń;
- na `/exercises` przy 390×844 po załadowaniu widoczne są wyszukiwarka,
  dostęp do filtrów i początek właściwej biblioteki;
- filtry nadal można wyczyścić, a `Dodaj własne` zachowuje obecne stany
  loading/error/disabled;
- desktop nie traci obecnej hierarchii ani funkcji.

Bramka:

- istniejące testy `WorkoutDetailActions`, `WorkoutDetailMobileActions`,
  `SharedAccessibilityContracts` i `ExercisesPageDataState` plus najwyżej
  jeden brakujący kontrakt regresyjny;
- świeży lint i build;
- bezpośrednia obserwacja w jednej przeglądarce: 390×844 oraz desktop dla
  `/workout/:id` i `/exercises`; screenshot lub render testowy sam nie zamyka
  bramki.

Eskalować, jeśli route-aware ukrywanie BottomNav wpływa na `/workout/new`,
obsługę klawiatury albo powrót do historii. Nie dodawać workaroundu CSS bez
ustalenia wspólnej przyczyny.

Closeout lokalny 2026-08-07:

- 23/23 testy celowane przeszły;
- lint i build przeszły;
- bezpośrednio zaobserwowano `/workout/:id` oraz `/exercises` przy 390×844 i
  1440×900 w dark theme;
- potwierdzono akcje treningu inline i fixed, zwinięte i rozwinięte filtry,
  brak kolizji z BottomNav oraz brak błędów konsoli;
- child jest zweryfikowany i zamknięty; rodzic pozostaje aktywny, a pakiety
  2–4 są nadal obowiązujące.

### 2. Wiarygodne stany zakresu — **zakończony**

`ProgressPage` i `HistoryPage`: osobny wariant range-empty, bez zerowych KPI i
ujemnych porównań; jedno CTA do dłuższego zakresu oraz jawne oznaczenie danych
all-time. Bez zmian zapytań Firestore, chyba że wykonanie ujawni sprzeczne
dane źródłowe.

Closeout lokalny 2026-08-08:

- Postępy nie renderują zerowych KPI ani porównania, gdy wybrany zakres jest
  pusty; zakres roczny jest dostępny bez ponownego pobierania danych;
- Historia rozróżnia pusty zakres, brak wyników filtrów i całkowicie pustą
  historię; `Pokaż wszystko` odsłania zapisane sesje jednym działaniem;
- rekordy w Postępach pozostają jawnie opisane jako dane od początku;
- 12/12 testów celowanych, lint i build przeszły;
- bezpośrednio zaobserwowano range-empty oraz powrót do danych na 390×844 i
  1440×900, bez poziomego overflow; sprawdzono również filter-empty i jego
  czyszczenie bez zmiany zakresu.

### 3. Uproszczenie hierarchii — **zakończony**

Scalić empty state i preview w planach, skrócić konfigurację Coacha do jednego
przepływu oraz usunąć pozostałą panelizację potwierdzoną bezpośrednią
obserwacją. Nie ujednolicać ekranów na siłę.

Closeout lokalny 2026-08-08:

- pusty stan Planów ma jedno CTA, bez fikcyjnych statystyk i z przykładowym
  układem w tej samej powierzchni; stan z zapisanym planem zachował szybki
  start oraz edycję;
- konfiguracja Coacha jest jednym krótkim przepływem, a boczna kolumna planu
  pokazuje jeden bieżący kontekst zamiast dwóch powtórzonych paneli;
- 28/28 testów celowanych, lint, build i `git diff --check` przeszły;
- bezpośrednio zaobserwowano Plany w stanie pustym i z danymi oraz Coach w
  trybach rozmowy i planu na 390×844 i 1440×900, bez poziomego overflow;
  nie używano ani nie symulowano prawdziwego sekretu Claude.

### 4. Czytelność i closeout — **zakończony**

Podnieść istotne metadane poniżej 12px tylko w potwierdzonych miejscach,
wykonać seryjny przegląd desktop/mobile, zamknąć pozostałe obowiązki i
zarchiwizować ten program. Bounce kropek pisania pozostaje poza zakresem,
dopóki nie wykaże realnego problemu wydajności lub czytelności.

Closeout lokalny 2026-08-08:

- bezpośredni audyt siedmiu głównych tras przy 390×844 potwierdził, które
  metadane informacyjne miały mniej niż 12px; podniesiono tylko etykiety
  nawigacji, danych treningowych, planów, biblioteki i Coacha, pozostawiając
  drobne elementy dekoracyjne oraz zwarte nagłówki bez mechanicznego bumpu;
- po korekcie główne metadane mają 12px, zwarte tagi 11.2px, a etykiety
  siedmioelementowej dolnej nawigacji 10px zamiast 8px;
- na 390×844 oraz 1440×900 wszystkie sprawdzone trasy zachowały szerokość
  viewportu; bezpośrednia obserwacja Postępów, Historii, Biblioteki i Startu
  nie ujawniła kolizji ani błędów konsoli;
- 64/64 pliki testowe i 492/492 testy przeszły; lint, build oraz
  `git diff --check` również przeszły.

## Linia zakresu

**Audyt wizualny 2026-08-07 → mobilna hierarchia zadań → wiarygodne stany
zakresu, uproszczenie hierarchii, czytelność i closeout.**

Wszystkie cztery pakiety oraz program nadrzędny są zamknięte. Nie pozostają
obowiązki do przeniesienia; aktywna roadmapa może zostać usunięta po commicie,
ponieważ jej treść i dowody pozostają w historii Git.
