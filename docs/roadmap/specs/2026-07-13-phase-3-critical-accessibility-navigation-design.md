# IronLog — projekt Fazy 3: krytyczna dostępność i nawigacja

**Status:** wdrożona i zweryfikowana

**Stan integracji:** implementacja została lokalnie zintegrowana z `puls-rebrand`; final re-review zakończył się `PASS / Approved` z wynikiem Critical 0, Important 0, Minor 0. Feature branch został usunięty. Nie wykonano pushu, deployu ani czynności produkcyjnych.

**Data:** 2026-07-13

**Zakres roadmapy:** `A11Y-01`, `A11Y-02`, `A11Y-03`, `A11Y-04`, `A11Y-05`, `A11Y-06`, `A11Y-07`, `A11Y-08`

## 1. Cel

Faza 3 usuwa potwierdzone bariery w głównych przepływach obsługiwanych klawiaturą, czytnikiem ekranu i sterowaniem głosowym. Zmiany poprawiają semantykę oraz zarządzanie fokusem bez ponownego projektowania interfejsu Puls.

Po wdrożeniu:

- niewidoczna dolna nawigacja nie przejmuje fokusu;
- pola edytora planu i ikonowe akcje mają jednoznaczne nazwy;
- stan filtrów, trybów i wyborów jest dostępny bez polegania na kolorze;
- błędy formularzy i AI są ogłaszane oraz powiązane z właściwym polem, jeśli błąd dotyczy pola;
- dialog potwierdzenia ma dostępny tytuł i opis przy zachowaniu istniejącego kontraktu fokusu;
- każdy wiersz ćwiczenia ma jedną akcję otwarcia w kolejności Tab;
- bieżąca trasa jest komunikowana przez nawigację;
- ukierunkowana automatyczna bramka Axe chroni ten kontrakt przed regresją.

Faza nie jest deklaracją pełnej zgodności całej aplikacji z WCAG 2.2 AA.

## 2. Zakres i granice

### 2.1 W zakresie

Faza obejmuje:

1. dolną i górną nawigację chronionej części aplikacji;
2. edytor planu;
3. bibliotekę ćwiczeń, formularz własnego ćwiczenia i picker ćwiczeń;
4. przełączanie trybu, konfigurację modelu, błędy i podgląd planu na stronie AI Coach;
5. współdzielony dialog potwierdzenia;
6. ukierunkowane testy komponentowe i Playwright;
7. zależność deweloperską `@axe-core/playwright` oraz automatyczny smoke reguł odpowiadających tej fazie;
8. ręczny obchód klawiaturą i accessibility snapshot kluczowych powierzchni.

### 2.2 Poza zakresem

Poza Fazą 3 pozostają:

- formalny audyt zgodności całej aplikacji z WCAG 2.2 AA;
- kontrast wszystkich kolorów, powiększenie 200–400%, pełny audyt reduced motion i testy z konkretnymi czytnikami ekranu;
- minimalne rozmiary celów dotykowych, sticky zapis edytora i zachowanie z klawiaturą ekranową z Fazy 4;
- zmiana copy CTA treningu i feedback operacji asynchronicznych z Fazy 5;
- anulowanie streamu, klasyfikacja błędów modeli i pozostała poprawność AI z Faz 6A–6C;
- refaktor na wspólną bibliotekę kontrolek ARIA lub generyczny `ToggleGroup`;
- zmiany danych, Firestore, API, deploy i czynności produkcyjne `RELEASE-08`.

Jeżeli Axe wykryje problem poza zakresem, wynik należy sklasyfikować. Potwierdzony problem należący do `A11Y-01–08` blokuje fazę. Problem z innego obszaru otrzymuje wpis we właściwej fazie roadmapy i nie jest maskowany jako naprawiony.

## 3. Potwierdzony stan obecny

| ID | Powierzchnia | Potwierdzony stan | Klasyfikacja |
|---|---|---|---|
| `A11Y-01` | `BottomNav` | ukrycie przez `transform`, `opacity` i `pointer-events` nie usuwa przycisków z kolejności fokusu | `confirmed` |
| `A11Y-02` | `TemplateEditorPage` | nazwa planu i nazwy dni polegają na sąsiednim tekście lub placeholderze bez dostępnej etykiety | `confirmed` |
| `A11Y-03` | `TemplateEditorPage` | ikonowy przycisk usunięcia ćwiczenia nie ma accessible name | `confirmed` |
| `A11Y-04` | ćwiczenia i AI | część chipów ma wyłącznie `data-active` lub styl; istniejące grupy briefu AI mają już `aria-pressed` | `confirmed`, częściowo chronione |
| `A11Y-05` | `AiKeyPanel`, `ChatPage`, formularz ćwiczenia | select modelu nie ma etykiety; część dynamicznych błędów nie ma `role="alert"`; błędy pola nie zawsze są z nim połączone | `confirmed` |
| `A11Y-06` | `ConfirmDialog` | tytuł jest połączony, ale treść nie jest wskazana przez `aria-describedby` | `confirmed` |
| `A11Y-07` | `ExerciseCard` | główny przycisk wiersza i osobny chevron wykonują identyczną nawigację | `confirmed` |
| `A11Y-08` | nawigacja | główne pozycje top i bottom nav mają `aria-current`; profil i mobilna akcja treningu nie komunikują bieżącej trasy | `partially_protected` |

Istniejący `AppLayout` przenosi fokus na `main` po zmianie ścieżki. Istniejący `useDialogA11y` zapewnia focus trap, Escape, początkowy fokus i focus restore. Te kontrakty należy zachować i chronić testami zamiast implementować ponownie.

## 4. Wybrana architektura

Zmiany są wykonywane bezpośrednio w istniejących komponentach. Faza nie tworzy nowego frameworka dostępności ani generycznych prymitywów tylko po to, by opakować pojedyncze atrybuty.

Obowiązują następujące zasady:

- natywna semantyka HTML ma pierwszeństwo przed ARIA;
- widoczna etykieta staje się prawdziwym `<label>`, jeśli już opisuje pole;
- przyciski reprezentujące wybór zachowują natywną obsługę klawiatury i otrzymują `aria-pressed` w nazwanej grupie;
- pojedyncza akcja użytkownika ma pojedynczy element interaktywny;
- `aria-hidden` nie może ukrywać aktywnego elementu bez równoczesnego wyłączenia interakcji;
- błędy ogólne są ogłaszane, a błędy konkretnego pola są dodatkowo powiązane z polem;
- ARIA nie jest używana wyłącznie kosmetycznie: każdy atrybut ma odpowiadający mu test zachowania lub semantyki.

### 4.1 Odrzucone warianty

1. **Nowy zestaw generycznych komponentów dostępnościowych.** Zwiększyłby diff i ryzyko regresji wizualnej bez wykazanego ponownego użycia wymagającego wspólnej abstrakcji.
2. **Pełny wzorzec tabs/listbox dla wszystkich chipów.** Wymagałby zarządzania fokusem strzałkami i aktywnym elementem. Obecne kontrolki są prostymi przyciskami wyboru, więc nazwane grupy z `aria-pressed` są wystarczające i czytelniejsze.
3. **Minimalna łatka ARIA bez automatycznej bramki.** Naprawiłaby bieżący DOM, ale nie chroniłaby kontraktu przed ponownym wprowadzeniem anonimowych kontrolek lub ukrytego fokusu.
4. **Pełny skan WCAG jako warunek tej fazy.** Mieszałby znane problemy z kontrastem, mobile i feedbackiem z zakresem kolejnych faz.

## 5. Kontrakt ukrytej dolnej nawigacji

`BottomNav` zachowuje istniejącą animację chowania podczas scrollowania oraz po skupieniu pola formularza. Gdy `navHidden === true`, element `<nav>`:

- jest `inert`;
- ma `aria-hidden="true"`;
- pozostaje nieklikalny przez istniejące `pointer-events: none`;
- nie pozwala ustawić fokusu na żadnym potomku przez Tab ani programowe `.focus()`;
- po ponownym pokazaniu odzyskuje interaktywność bez remountu i utraty bieżącej trasy.

Jeżeli w chwili ukrycia fokus znajduje się wewnątrz dolnej nawigacji, implementacja nie może pozostawić aktywnego elementu wewnątrz drzewa oznaczonego `aria-hidden`. Należy bezpiecznie przenieść fokus do `main` albo usunąć go z ukrywanej kontrolki zgodnie z zachowaniem potwierdzonym testem przeglądarkowym.

Desktopowe `lg:hidden` pozostaje niezależnym kontraktem CSS. Faza nie zmienia animacji, breakpointu ani geometrii nawigacji.

## 6. Kontrakt etykiet i ikonowych akcji edytora

### 6.1 Nazwa planu i dni

Istniejące widoczne teksty stają się etykietami:

- „Nazwa” jest `<label htmlFor="template-name">` dla pola nazwy planu;
- „Dzień N” jest `<label>` połączonym ze stabilnym ID pola nazwy danego dnia;
- placeholder nazwy planu pozostaje wyłącznie podpowiedzią, nie accessible name;
- identyfikator dnia opiera się na stabilnym `_id`, a nie indeksie, dzięki czemu usunięcie dnia nie zrywa powiązania.

### 6.2 Usuwanie ćwiczenia

Ikonowy przycisk kosza otrzymuje kontekstową nazwę obejmującą ćwiczenie i dzień, na przykład:

```text
Usuń ćwiczenie Wyciskanie sztangi z dnia Upper
```

Ikona pozostaje dekoracyjna dla technologii asystujących. Usuwanie dnia zachowuje widoczny tekst i nie wymaga dodatkowego `aria-label`.

## 7. Kontrakt wyborów i filtrów

Każdy objęty zestaw przycisków ma nazwę grupy i programowo dostępny stan.

| Powierzchnia | Nazwa grupy | Stan kontrolki |
|---|---|---|
| filtry kategorii biblioteki | „Partia” | `aria-pressed` |
| filtry sprzętu biblioteki | „Sprzęt” | `aria-pressed` |
| filtry kategorii pickera | „Kategoria ćwiczenia” | `aria-pressed` |
| wybór partii w formularzu własnego ćwiczenia | istniejące „Partie mięśniowe” | `aria-pressed` |
| tryb AI Coach | „Tryb AI Coacha” | `aria-pressed` |
| dzień podglądu wygenerowanego planu | „Dzień podglądu planu” | `aria-pressed` |

Istniejące wybory liczby dni, doświadczenia i sprzętu w briefie AI już używają `aria-pressed`; pozostają w zakresie regresyjnego smoke'u, ale nie wymagają mechanicznego przepisywania.

Każdy przycisk wyboru ma `type="button"`. Stan wizualny `data-active` i obecne style pozostają bez zmian.

## 8. Kontrakt błędów formularzy i AI

### 8.1 Model Claude

Widoczny tekst „Model Claude” staje się prawdziwym `<label>` połączonym z selectem. Stan ładowania pozostaje tekstem statusowym. Błąd pobrania modeli:

- ma stabilne ID;
- jest ogłaszany przez `role="alert"`;
- jest powiązany z selectem przez `aria-describedby`;
- ustawia `aria-invalid="true"` na select tylko wtedy, gdy błąd dotyczy jego dostępnych opcji.

Faza nie zmienia klasyfikacji błędu klucza i upstreamu; należy ona do pakietów AI.

### 8.2 Klucz API i formularz ćwiczenia

Wspólny `Input` zachowuje istniejące `aria-describedby` i `aria-invalid`. Renderowany przez niego komunikat błędu otrzymuje `role="alert"`.

Formularz własnego ćwiczenia:

- łączy błąd walidacji nazwy z polem nazwy;
- ustawia `aria-invalid` dla nieprawidłowej nazwy;
- ogłasza błąd przez `role="alert"`;
- po zmianie wartości może wyczyścić nieaktualny błąd zgodnie z obecnym zachowaniem formularza.

### 8.3 Czat i generator planu

`SectionError` staje się wspólnym regionem `role="alert"` dla błędów czatu, generowania i zapisu planu. Błąd krótkiego celu planu jest dodatkowo połączony z polem celu przez stabilne ID i `aria-describedby`; pole otrzymuje `aria-invalid="true"` tylko dla tego błędu walidacyjnego.

Błędy ogólne, takie jak brak klucza, błąd sieci lub zapis szablonu, są ogłaszane, ale nie są fałszywie przypisywane do pola celu.

Faza nie zmienia cyklu życia requestu, streamu ani treści klasyfikacji błędów.

## 9. Kontrakt dialogu potwierdzenia

`ConfirmDialog` generuje osobne stabilne identyfikatory tytułu i opisu. Kontener `role="dialog"` ma:

```text
aria-labelledby=<titleId>
aria-describedby=<descriptionId>
```

Treść komunikatu używa `descriptionId`. Istniejący `useDialogA11y` nadal odpowiada za:

- focus trap;
- zamknięcie przez Escape;
- początkowy fokus na przycisku anulowania;
- przywrócenie fokusu do elementu wywołującego;
- brak interakcji z tłem.

Faza nie dodaje nowej biblioteki dialogowej i nie zmienia copy ani wyglądu modala.

## 10. Kontrakt pojedynczej akcji wiersza ćwiczenia

Wiersz ćwiczenia zachowuje osobne akcje „Edytuj” i „Usuń” dla własnych ćwiczeń, ale ma tylko jeden przycisk otwierający szczegóły.

Główna akcja:

- ma nazwę `Otwórz ćwiczenie <nazwa>`;
- obejmuje wizualny chevron albo sąsiaduje z dekoracyjnym chevronem `aria-hidden="true"`;
- pozostaje obsługiwana myszą, dotykiem, Enterem i Space;
- jest jedyną akcją nawigującą do szczegółów w kolejności Tab i accessibility tree.

Zmiana CSS może połączyć obecną kolumnę `open` z głównym przyciskiem, ale nie może usunąć osobnych akcji edycji i usuwania ani zmienić układu listy.

## 11. Kontrakt bieżącej trasy

Istniejące `aria-current="page"` dla głównych elementów `TopNav` i `BottomNav` pozostaje.

Faza uzupełnia semantykę dla:

- przycisku profilu, gdy bieżąca sekcja to `/profile`;
- centralnej mobilnej akcji treningu, gdy ścieżka zaczyna się od `/workout/new`.

`aria-current` nie jest dodawane do wylogowania, streaku ani przycisków wykonujących akcję, która nie reprezentuje bieżącej lokalizacji.

Faza nie zmienia copy „Rozpocznij nowy trening” / „Wznów trening”; ten kontrakt należy do Fazy 5.

## 12. Strategia testów

### 12.1 Testy komponentowe

Testy komponentowe pokrywają kontrakty niewymagające pełnej nawigacji:

- `ConfirmDialog` ma nazwę i opis oraz zachowuje Escape, focus trap i focus restore;
- `Input` łączy komunikat błędu z polem, ustawia `aria-invalid` i renderuje alert;
- lokalne błędy formularza własnego ćwiczenia są nazwane i powiązane z polem, jeśli ich deterministyczne pokrycie w E2E wymagałoby nadmiernego setupu.

Testy używają zapytań po roli i nazwie. Nie polegają wyłącznie na obecności atrybutu, jeżeli można sprawdzić zachowanie użytkownika.

### 12.2 Ukierunkowany Playwright

Nowy plik `tests/e2e/accessibility.spec.ts` obejmuje desktop i mobile odpowiednio do kontraktu:

- `/templates/new`: nazwa planu, nazwy dni i kontekstowa akcja usuwania ćwiczenia;
- `/exercises`: nazwane grupy filtrów, `aria-pressed` i jedna akcja otwarcia na wiersz;
- picker lub formularz ćwiczenia: stan kategorii i partii mięśniowych;
- `/chat`: nazwany select modelu, tryb AI, dzień podglądu oraz lokalnie wymuszone błędy bez prawdziwego Claude API;
- chroniony shell: `aria-current` i brak fokusu w ukrytej dolnej nawigacji;
- dostępny dialog potwierdzenia w deterministycznie osiągalnym przepływie albo przez test komponentowy.

Test mobilnej nawigacji potwierdza pełny cykl:

1. nawigacja jest widoczna i fokusowalna;
2. scroll albo fokus pola uruchamia stan ukryty;
3. `<nav>` jest `inert` i `aria-hidden`;
4. Tab nie przechodzi do żadnego potomka;
5. po pokazaniu nawigacja ponownie przyjmuje fokus.

### 12.3 Automatyczny smoke Axe

Do zależności deweloperskich trafia `@axe-core/playwright`. Smoke działa na kluczowych trasach:

- `/dashboard`;
- `/templates/new`;
- `/exercises`;
- `/chat`.

Blokujący zestaw reguł odpowiada zakresowi Fazy 3 i obejmuje co najmniej:

- `aria-allowed-attr`;
- `aria-command-name`;
- `aria-dialog-name`;
- `aria-hidden-focus`;
- `aria-input-field-name`;
- `aria-required-attr`;
- `aria-roles`;
- `aria-valid-attr-value`;
- `button-name`;
- `duplicate-id-aria`;
- `form-field-multiple-labels`;
- `label`;
- `nested-interactive`;
- `select-name`.

Smoke jest jawnie ukierunkowany. Nie nazywamy go pełnym audytem WCAG i nie wyłączamy reguł z powodu samej niewygody testu. Jeżeli konkretna reguła nie istnieje w zainstalowanej wersji Axe, plan implementacyjny ma zweryfikować listę przez runtime i skorygować nazwę bez osłabiania pokrywanego kontraktu.

### 12.4 Ręczna weryfikacja

Po automatycznych testach obowiązuje:

- pełny obchód klawiaturą przez dashboard, bibliotekę ćwiczeń, edytor planu i AI Coach;
- kontrola widoczności fokusu bez zmiany stylistyki Puls;
- accessibility snapshot na desktopie i mobile dla nawigacji, edytora, filtrów, dialogu i AI;
- potwierdzenie braku anonimowych pól, przycisków i sprzecznych stanów wyboru;
- kontrola konsoli podczas objętych przepływów.

Accessibility snapshot jest dowodem przeglądu, a nie rozległym, kruchym golden snapshotem całej strony.

## 13. Bramka weryfikacyjna

Minimalna kolejność weryfikacji:

1. ukierunkowane testy komponentowe;
2. ukierunkowany `accessibility.spec.ts` na emulatorach;
3. lint;
4. pełny zestaw unit/support;
5. build;
6. istniejący isolated Playwright gate na Auth + Firestore emulatorach;
7. ręczny keyboard walkthrough i accessibility snapshot na desktopie i mobile;
8. finalny review zmian oraz aktualizacja roadmapy i `WORKING_CONTEXT.md`.

Pełny live Playwright, produkcyjny Vercel, kontrola zmiennych i publikacja reguł Firestore pozostają w `RELEASE-08` i nie blokują zamknięcia tej fazy.

## 14. Kryteria akceptacji

Faza jest gotowa do zamknięcia, gdy:

1. ukryta dolna nawigacja nie przyjmuje fokusu i odzyskuje interaktywność po pokazaniu;
2. pola nazwy planu i wszystkich dni mają trwałe accessible names;
3. każda ikonowa akcja usuwania ćwiczenia podaje ćwiczenie i dzień;
4. wszystkie objęte filtry, tryby i wybory komunikują stan bez koloru;
5. select modelu Claude ma etykietę;
6. dynamiczne błędy objętych formularzy i AI są ogłaszane, a błędy pól są z nimi powiązane;
7. `ConfirmDialog` ma dostępny tytuł i opis oraz zachowuje focus trap, Escape i focus restore;
8. każdy wiersz ćwiczenia ma jedną akcję otwarcia w Tab i accessibility tree;
9. aktywna pozycja nawigacji, profil i mobilny trening komunikują bieżącą trasę tam, gdzie ją reprezentują;
10. ukierunkowany Axe smoke przechodzi na kluczowych trasach;
11. ręczny keyboard walkthrough i accessibility snapshot nie wykazują anonimowych kontrolek w objętych przepływach;
12. lint, pełny unit/support, build oraz właściwe bramki Playwright przechodzą.

## 15. Wpływ na dane, release i rollback

Faza nie zmienia schematu Firestore, reguł bezpieczeństwa, endpointów, danych konta demo ani kontraktów serwerowych. Jedyną nową zależnością jest deweloperskie `@axe-core/playwright`, używane wyłącznie w testach.

Nie ma migracji ani specjalnej kolejności deployu. Rollback polega na cofnięciu zmian komponentów, stylu wiersza ćwiczenia, testów i zależności deweloperskiej.

Faza nie wykonuje pushu, deployu ani czynności produkcyjnych `RELEASE-08`.

## 16. Pliki prawdopodobnie objęte planem

Plan implementacyjny powinien uwzględnić co najmniej:

- `src/components/BottomNav.tsx`;
- `src/components/TopNav.tsx`;
- `src/components/ConfirmDialog.tsx`;
- `src/components/ExercisePicker.tsx`;
- `src/components/AiKeyPanel.tsx`;
- `src/components/ui/Input.tsx`;
- `src/pages/TemplateEditorPage.tsx`;
- `src/pages/ExercisesPage.tsx`;
- `src/pages/ChatPage.tsx`;
- `src/index.css` tylko dla zachowania pojedynczej akcji wiersza ćwiczenia;
- `tests/e2e/accessibility.spec.ts`;
- focused testy komponentowe w istniejącej strukturze `src/**/__tests__`;
- `package.json` i `package-lock.json` dla `@axe-core/playwright`;
- `docs/roadmap/ROADMAP.md` i `WORKING_CONTEXT.md` przy zamknięciu fazy.

Dokładny podział zadań, kolejność testów, komendy, oczekiwane wyniki i commity należą do osobnego planu implementacyjnego.

## 17. Wynik wdrożenia

Zakres `A11Y-01–08` został wdrożony bez zmiany kierunku wizualnego Puls. Focused testy komponentowe, ukierunkowany Axe, emulatorowy Playwright, pełny unit/support, lint i build przechodzą. Ręczny keyboard walkthrough oraz accessibility snapshot potwierdziły nazwane kontrolki i prawidłową kolejność fokusu na desktopie i mobile. Produkcyjny live Playwright, deploy Vercel i publikacja reguł pozostają otwarte w `RELEASE-08`.

Świeży baseline z 2026-07-13:

- focused DOM: 4 pliki i 15 testów;
- pełny unit/support: 38 plików i 241 testów;
- lint i build: kod 0; build zachowuje wyłącznie znane ostrzeżenie o chunku większym niż 500 kB;
- reguły Firestore: 1 plik i 10 testów;
- integracja workoutu: 2 pliki i 20 testów;
- accessibility E2E: 15 PASS i 4 zamierzone SKIP viewportowe, w tym setup uwierzytelnienia;
- isolated E2E: 13 PASS;
- workout lifecycle E2E: 9 PASS bez retry;
- headed `accessibility.spec.ts`: 15 PASS i 4 zamierzone SKIP viewportowe.

Ręczny walkthrough został dodatkowo utrwalony w 17 screenshotach emulatorowego konta testowego: 8 dla desktopu 1280×800 i 9 dla projektu Pixel 5. Obrazy potwierdzają widoczny fokus na top/bottom nav, polach edytora, filtrach, trybie AI i dialogu; ukrycie oraz ponowne udostępnienie dolnej nawigacji; jedną akcję otwarcia wiersza z osobnymi akcjami edycji/usuwania; a także focus trap, Escape i focus restore dialogu. Artefakty znajdują się w ignorowanym katalogu `.superpowers/sdd/task-7-screenshots/` i zawierają wyłącznie dane lokalnego emulatora.

Przegląd 16 wygenerowanych plików `.aria.yml` dla `/dashboard`, `/templates/new`, `/exercises` i `/chat` w obu projektach potwierdził nazwane regiony nawigacji i objęte kontrolki. Snapshoty pokazują między innymi `textbox "Nazwa"`, `textbox "Dzień 1"`, `combobox "Model Claude"`, stany `[pressed]` filtrów i trybu AI oraz dokładnie jedną nazwaną akcję `Otwórz ćwiczenie <nazwa>` na wiersz; nie wykryto anonimowego `button`, `textbox` ani `combobox` w objętych powierzchniach.

Final re-review pełnego diffu zakończył się `PASS / Approved` bez znalezisk Critical, Important ani Minor po korekcie chronionej commitem `04e086e`. Dokumentacja zamknięcia jest kompletna, implementacja została lokalnie zintegrowana z `puls-rebrand`, a feature branch usunięty. Push, deploy i czynności produkcyjne nie zostały wykonane.
