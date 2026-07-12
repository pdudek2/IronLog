# IronLog — projekt Fazy 2: uczciwe stany danych i błędów

**Status:** zatwierdzona do planowania

**Data:** 2026-07-12

**Zakres roadmapy:** `STATE-01`, `STATE-02`, `STATE-03`, `STATE-05`, `STATE-06`, `STATE-07`

## 1. Cel

Faza 2 usuwa sytuacje, w których nieudany odczyt wygląda jak prawidłowy brak danych. Użytkownik ma zawsze wiedzieć, czy zasób jest jeszcze ładowany, został poprawnie pobrany, jest pusty, czy nie udało się go pobrać.

Po wdrożeniu:

- błąd readiness nie otwiera formularza nowego wpisu;
- błąd własnych ćwiczeń nie pokazuje pustej biblioteki ani zerowej liczby jako potwierdzonego wyniku;
- błąd szablonów na dashboardzie nie zachęca do utworzenia pierwszego planu;
- każdy objęty błąd pozostaje widoczny i ma retry;
- pierwszy render readiness wykonuje dokładnie jeden odczyt;
- poprawnie pusta odpowiedź nadal prowadzi do istniejącego empty state.

## 2. Zakres i granice

### 2.1 W zakresie

Faza obejmuje cztery powierzchnie:

1. `ReadinessWidget` na dashboardzie;
2. sekcję własnych ćwiczeń na `ExercisesPage`;
3. sekcję ostatnich planów na `DashboardPage`;
4. regresyjny kontrakt błędu na `TemplatesPage`.

Zmiany obejmują wspólny typ stanu danych, lokalne mechanizmy pobierania i retry, trwałe komunikaty UI oraz deterministyczne testy błędów.

### 2.2 Poza zakresem

Poza Fazą 2 pozostają:

- wtórni konsumenci `getUserExercises` w `WorkoutPage`, `TemplateEditorPage`, `HistoryPage`, `WorkoutDetailPage` i `ExerciseDetailPage`;
- migracja do React Query, SWR albo innego frameworka zapytań;
- wspólny generyczny hook pobierający dane;
- automatyczne retry w tle, cache między trasami i retained snapshot, jeśli dany ekran nie ma dziś odświeżania istniejących danych;
- atomowa unikalność własnych ćwiczeń, która należy do Fazy 2B;
- zmiany w modelu Firestore, regułach i danych konta testowego.

Wtórni konsumenci własnych ćwiczeń są zapisani w roadmapie jako `LATER-07`. Ich błąd może ograniczyć listę do katalogu globalnego, ale nie tworzy obecnie pełnego empty state z komunikatem o braku zasobów.

## 3. Potwierdzony stan obecny

| Powierzchnia | Zachowanie po sukcesie | Zachowanie po błędzie | Klasyfikacja |
|---|---|---|---|
| `ReadinessWidget` | wpis albo formularz dla `null` | `.catch()` ustawia `null`, więc pokazuje formularz | `confirmed` |
| `ReadinessWidget` — liczba odczytów | odczyt przy montowaniu | zapis `lastCheckedDate` uruchamia efekt ponownie | `confirmed` |
| `ExercisesPage` | własna i globalna biblioteka | istnieje flaga błędu, ale render nadal pokazuje „Brak własnych ćwiczeń” | `confirmed` |
| dashboard — plany | maksymalnie trzy ostatnie szablony | toast, pozostaje `[]`, więc renderuje „Brak zapisanych szablonów” | `confirmed` |
| `TemplatesPage` | lista albo prawidłowy empty state | trwały komunikat i przycisk „Spróbuj ponownie” | `already_protected` |

Do tej klasyfikacji wystarcza statyczny przepływ kodu i kontrolowany błąd w mocku serwisu. Ręczne odłączanie sieci w przeglądarce byłoby mniej deterministyczne i nie jest bramką przygotowania specyfikacji.

## 4. Wybrana architektura

Wspólnym kontraktem jest mała unia dyskryminowana:

```ts
export type DataState<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: unknown }
```

Statusy w kodzie pozostają po angielsku. Polskie komunikaty należą wyłącznie do warstwy prezentacji.

Pusty stan nie jest osobnym statusem. Wynika wyłącznie z poprawnej odpowiedzi:

```ts
state.status === 'success' && state.data.length === 0
```

Analogicznie brak dzisiejszego readiness jest reprezentowany przez:

```ts
state.status === 'success' && state.data === null
```

Sam typ może trafić do małego pliku współdzielonego, ale pobieranie pozostaje w komponentach. Nie tworzymy konstruktora stanów, reducera ani `useAsyncResource`, dopóki trzy wdrożenia nie pokażą rzeczywistej powtarzalności wykraczającej poza sam typ.

### 4.1 Odrzucone warianty

1. **Osobne booleany w każdym komponencie.** Dają mniejszy diff, ale pozwalają utworzyć sprzeczne kombinacje, np. `loading: false`, `error: true`, `data: []`, po czym render ponownie traktuje dane jako pustą kolekcję.
2. **Generyczny hook `useAsyncResource`.** Ujednoliciłby więcej kodu, lecz musiałby od razu rozstrzygać zależności efektów, anulowanie, retry, zmianę użytkownika i retained data. To zbyt szeroka abstrakcja dla tej fazy.
3. **Nowa biblioteka zapytań.** Nie jest uzasadniona skalą problemu i rozszerzyłaby zmianę na architekturę całej aplikacji.

## 5. Kontrakt Readiness

### 5.1 Odczyt wskazanego dnia

Serwis powinien udostępnić odczyt przyjmujący jawny lokalny klucz daty, np.:

```ts
getReadiness(uid: string, date: string): Promise<ReadinessEntry | null>
```

Komponent wylicza `todayKey()` raz dla konkretnego requestu i przekazuje ten sam klucz do serwisu. Dzięki temu porównanie dnia i odczyt dokumentu nie mogą dotyczyć dwóch różnych dat po przekroczeniu północy między wywołaniami.

Jeśli `getTodayReadiness` pozostanie jako zgodny wrapper dla innych konsumentów, nie może być używany w nowej logice rolloveru widgetu.

### 5.2 Cykl życia

Stan początkowy to `{ status: 'loading' }`. Efekt zależy od UID, a nie od stanu pomocniczego ustawianego przez własny request.

Komponent przechowuje w referencjach:

- klucz ostatniego rozpoczętego odczytu złożony z UID i daty;
- rosnący identyfikator requestu.

Loader nie rozpoczyna drugiego requestu, jeśli dla tego samego klucza UID + data istnieje już request w locie. Jest to potrzebne również w deweloperskim `React.StrictMode`, który ponownie uruchamia setup efektu. Referencja montowania pozwala wykorzystać wynik tego samego requestu po ponownym setupie, ale blokuje aktualizację stanu po rzeczywistym unmount.

Pierwsze montowanie wywołuje jeden odczyt także pod `React.StrictMode`. Po powrocie karty do stanu `visible`:

- ta sama data nie wykonuje kolejnego odczytu;
- nowa data przełącza widget na `loading` i pobiera dokładnie tę datę;
- spóźniona odpowiedź starszego requestu nie może nadpisać nowszego stanu.

Retry jest jawną akcją użytkownika i ponawia odczyt aktualnej daty. Nie ma automatycznej pętli retry.

### 5.3 Renderowanie

| Stan | UI | Dostępna akcja |
|---|---|---|
| `loading` | obecny skeleton | brak |
| `success` z wpisem | obecna karta wyniku | brak |
| `success` z `null` | `ReadinessPrompt` | zapis ankiety |
| `error` | trwała karta „Nie udało się wczytać gotowości” | „Spróbuj ponownie” |

`ReadinessPrompt` nie może powstać z gałęzi błędu. Po udanym zapisie formularza stan przechodzi bezpośrednio do `success` z zapisanym wpisem.

## 6. Kontrakt własnych ćwiczeń

Globalny katalog ćwiczeń jest lokalny i pozostaje użyteczny nawet wtedy, gdy Firestore nie zwróci własnej biblioteki.

### 6.1 Renderowanie sekcji

| Stan własnej biblioteki | Sekcja „Moje ćwiczenia” | Katalog globalny |
|---|---|---|
| `loading` | obecny stan ładowania | widoczny |
| `success` z danymi | przefiltrowana lista | widoczny |
| `success` z `[]` | „Brak własnych ćwiczeń” i CTA „Dodaj pierwsze” | widoczny |
| `error` | trwały komunikat o błędzie i retry | widoczny oraz filtrowalny |

W błędzie licznik „moje” i licznik nagłówka sekcji pokazują wartość nieokreśloną (`—`), a nie `0`. Liczba wyników może nadal opisywać widoczny katalog globalny, ponieważ te dane są poprawnie dostępne.

Ogólna akcja „Dodaj własne” jest niedostępna do czasu poprawnego pobrania biblioteki. Utworzenie ćwiczenia po nieudanym odczycie dałoby lokalną listę zawierającą tylko nowy rekord i ponownie sugerowałoby, że znamy pełny stan biblioteki. Komunikat błędu wyjaśnia, że katalog globalny nadal działa, a retry jest następnym krokiem.

Po retry:

- stan przechodzi do `loading`;
- sukces zastępuje stan pełną odpowiedzią serwisu;
- kolejny błąd wraca do trwałego stanu `error`.

## 7. Kontrakt szablonów

### 7.1 Dashboard

Dashboard przechowuje szablony jako `DataState<WorkoutTemplate[]>`, niezależnie od głównego snapshotu treningów.

| Stan | Sekcja „Plany” |
|---|---|
| `loading` | kompaktowy skeleton lub informacja o ładowaniu wewnątrz sekcji |
| `success` z danymi | maksymalnie trzy ostatnie szablony |
| `success` z `[]` | istniejący empty state i „Utwórz pierwszy plan” |
| `error` | trwały komunikat „Nie udało się wczytać planów” i retry |

Przycisk „Otwórz plany” może pozostać dostępny w błędzie, ponieważ prowadzi do osobnej strony z własnym mechanizmem pobierania. CTA „Utwórz pierwszy plan” jest dozwolone wyłącznie po poprawnej pustej odpowiedzi.

Toast może uzupełniać informację, ale nie jest wymagany i nie może być jej jedynym nośnikiem.

### 7.2 Strona planów

`TemplatesPage` zachowuje obecne zachowanie:

- błąd ma pierwszeństwo przed sprawdzeniem `templates.length`;
- retry przechodzi przez loading;
- empty state renderuje się tylko po sukcesie z pustą listą.

Nie ma obowiązku przepisywania strony na wspólny typ, jeśli test regresji potwierdzi ten sam kontrakt, a refaktor nie uprości implementacji. `STATE-06` wymaga wspólnego modelu dla nowych i naprawianych przejść, nie mechanicznej migracji działającego ekranu.

## 8. Błędy, retry i retained data

Każdy objęty stan błędu:

- pozostaje widoczny po zniknięciu toastu;
- używa komunikatu właściwego dla zasobu;
- ma przycisk „Spróbuj ponownie”;
- nie renderuje CTA przeznaczonego dla potwierdzonego pustego stanu;
- nie przedstawia nieznanej liczby zasobów jako zera.

Ta faza nie wprowadza retained snapshotu na siłę. Objęte odczyty są obecnie wykonywane przy montowaniu, zmianie dnia albo retry po błędzie, więc typ bez `stale-data` odpowiada rzeczywistemu zachowaniu. Jeśli podczas implementacji zostanie dodane odświeżanie już widocznych danych, zachowany snapshot musi być jawnie oznaczony jako nieaktualny; taka zmiana wymaga korekty specyfikacji przed wdrożeniem.

## 9. Odporność na wyścigi i unmount

Każdy loader, który może mieć więcej niż jeden request w locie, ignoruje wynik starszego requestu. Readiness wymaga tego bezwarunkowo ze względu na rollover dnia. Dashboard i strona ćwiczeń powinny użyć tego samego prostego wzorca, jeśli retry może wystąpić przed zakończeniem wcześniejszego requestu.

Po unmount komponent nie aktualizuje stanu. Implementacja może użyć identyfikatora requestu lub lokalnej flagi cleanupu; nie dokładamy `AbortController`, ponieważ Firestore Web SDK nie obsługuje anulowania tych odczytów przez sygnał.

## 10. Strategia testów

Podstawową warstwą są testy komponentowe z mockami serwisów. Pozwalają niezależnie wymusić `resolve([])`, `resolve(data)` i `reject(error)` bez zależności od sieci oraz limitów Firebase.

### 10.1 Readiness

Testy potwierdzają:

- jedno wywołanie serwisu po pierwszym renderze, również w wrapperze `StrictMode`;
- `null` pokazuje formularz;
- odrzucona obietnica pokazuje trwały błąd, nie formularz;
- retry ponawia odczyt i po sukcesie pokazuje właściwy stan;
- `visibilitychange` tego samego dnia nie pobiera ponownie;
- `visibilitychange` po zmianie dnia pobiera raz nową datę;
- spóźniona odpowiedź starego dnia nie nadpisuje nowego wyniku.

### 10.2 Własne ćwiczenia

Testy potwierdzają:

- pusta poprawna odpowiedź pokazuje „Brak własnych ćwiczeń” i „Dodaj pierwsze”;
- błąd nie pokazuje tych tekstów ani liczby `0` jako liczby własnych ćwiczeń;
- błąd pozostawia globalny katalog dostępny;
- akcja tworzenia jest w błędzie niedostępna;
- retry może przejść z błędu do pustej listy albo listy danych.

### 10.3 Szablony

Test dashboardu potwierdza:

- błąd nie pokazuje „Brak zapisanych szablonów” ani „Utwórz pierwszy plan”;
- trwały komunikat ma retry;
- poprawne `[]` nadal pokazuje obecny empty state;
- sukces z danymi pokazuje kafelki.

Test regresji `TemplatesPage` potwierdza rozdzielenie błędu i pustej listy oraz udany retry.

### 10.4 Bramka szersza

Po testach ukierunkowanych obowiązują lint, pełny unit i build. Isolated Playwright pozostaje bramką regresji głównych tras, ale nie musi symulować awarii Firestore, jeśli wszystkie gałęzie błędów są deterministycznie pokryte na poziomie komponentów. Manualny albo Playwrightowy przegląd UI jest potrzebny podczas implementacji do oceny layoutu nowych kart błędu na mobile i desktopie, nie do udowodnienia samej klasyfikacji stanu.

## 11. Kryteria akceptacji

Faza jest gotowa do zamknięcia, gdy:

1. żaden objęty błąd odczytu nie renderuje pustego stanu;
2. readiness po błędzie nie pozwala otworzyć formularza nowego wpisu;
3. pierwszy render readiness wykonuje jeden odczyt;
4. zmiana dnia wykonuje jeden odczyt nowej daty, a retry jest jawne;
5. własne ćwiczenia i dashboard mają trwały komunikat błędu z retry;
6. lokalny katalog globalnych ćwiczeń pozostaje dostępny po błędzie Firestore;
7. nieznana liczba własnych zasobów nie jest pokazywana jako zero;
8. strona planów zachowuje obecne poprawne rozróżnienie error/empty;
9. testy rozróżniają błąd, poprawne `[]`/`null` i dane;
10. lint, unit, build oraz właściwe istniejące bramki regresji przechodzą.

## 12. Wpływ na dane i release

Faza nie zmienia schematu Firestore, reguł bezpieczeństwa ani endpointów serwerowych. Nie wymaga migracji danych, publikacji reguł ani specjalnej kolejności deployu. Rollback polega na cofnięciu zmian klienta i testów.

Nie obejmuje produkcyjnego deployu ani zamknięcia `RELEASE-08`.

## 13. Pliki prawdopodobnie objęte planem

Specyfikacja nie narzuca jeszcze kolejności implementacji, ale plan powinien uwzględnić co najmniej:

- współdzielony typ `DataState<T>`;
- `src/lib/readinessService.ts`;
- `src/components/ReadinessWidget.tsx`;
- `src/pages/ExercisesPage.tsx`;
- `src/pages/DashboardPage.tsx`;
- testy komponentowe readiness, ćwiczeń, dashboardu i strony planów;
- style nowych trwałych stanów błędu tylko wtedy, gdy istniejące komponenty UI nie wystarczą.

Szczegółowy plan powstaje dopiero po zatwierdzeniu tej specyfikacji.
