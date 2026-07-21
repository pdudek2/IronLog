# IronLog — projekt Fazy 5: feedback, copy i integralność interfejsu

**Status:** zaimplementowany, zweryfikowany i zintegrowany — Faza 5 `DONE`

**Data:** 2026-07-21

**Zakres roadmapy:** `FEEDBACK-01–04`, `NAV-01`, `MOBILE-07`, `A11Y-09–10`, `COPY-01–03`, `DEMO-01`, `TEST-04`

**Route:** Medium — skoordynowany pakiet lokalnych stanów akcji, korekt routingu i copy, dwóch tokenów wizualnych, jednego mobilnego docka oraz testów diagnostycznych i wizualnych

**Ryzyko:** Standard — brak migracji modelu danych, reguł Firestore i API; jedyną destrukcyjną czynnością jest jawnie odseparowany reseed konta demo

## 1. Cel

Faza 5 usuwa sytuacje, w których poprawnie działająca albo odzyskiwalna aplikacja wygląda jak zawieszona, przedstawia nieprawdziwy stan lub zasłania użytkownikowi właściwą akcję.

Po wdrożeniu:

- uruchomienie planu i dnia pokazuje stan przy dokładnie tej akcji, której dotyczy;
- objęte błędy zapisu i usunięcia pozostają na ekranie z retry, zamiast znikać razem z toastem;
- CTA treningu odróżnia rozpoczęcie nowej sesji od wznowienia istniejącej;
- nowy, jeszcze nieutworzony plan nie jest przedstawiany jako zapisany;
- wejście na `/` prowadzi do aplikacji, a nie do 404;
- mobilne akcje szczegółów treningu nie zasłaniają podsumowania;
- objęty tekst pomocniczy i primary CTA spełniają kontrast 4.5:1;
- dynamiczne polskie copy ma poprawną odmianę;
- konto demo zawiera wiarygodne dane;
- diagnostyczne screenshoty nie są mylone z regresją pikselową.

Faza zachowuje kierunek wizualny Puls. Jest trybem `utility / Polish`, a nie redesignem.

## 2. Pochodzenie i rozstrzygnięcie zakresu

Zakres pochodzi z czterech warstw kontroli:

1. wcześniejszego Agent Sanity Review;
2. pierwszego audytu UI;
3. lokalnego Senior Design Review z 2026-07-14, zweryfikowanego ponownie względem aktualnego kodu;
4. pełnego audytu runtime z 2026-07-20 na desktopie 1440×900 i mobile 390×844.

Rewalidacja potwierdziła:

- brak jawnego stanu startu planu na stronie Planów;
- toast jako jedyny trwały nośnik części błędów zapisu i usunięcia;
- fałszywy stan „Zapisano” w pustym edytorze nowego planu;
- 404 dla ścieżki `/`;
- nakładanie fixed docka szczegółów treningu na podsumowanie;
- kontrast `--muted-soft` 3.20–3.71 na używanych tłach;
- kontrast białego tekstu na jaśniejszym końcu primary gradientu 3.71;
- niejednoznaczną parę „Anuluj” / „Anuluj trening”;
- błędną odmianę kategorii i niepełne użycie `polishPlural`;
- niewiarygodne dane demo, w tym trening znacznie przekraczający realistyczny czas;
- diagnostyczny capture opisywany jako visual regression bez porównania pikselowego.

Rewalidacja nie potwierdziła potrzeby przebudowy Profilu ani konsolidowania poprawnych widoków z małą liczbą danych. Te elementy nie wchodzą do Fazy 5.

## 3. Stan bazowy

### 3.1 Start planu

`src/hooks/useTemplateWorkoutLaunch.ts` przechowuje `pendingLaunch` i `launchingTemplateId`, chroni przed podwójnym uruchomieniem przez lock i generation oraz ignoruje wynik po unmount.

Brakuje jednak trwałego stanu błędu i pełnej tożsamości operacji potrzebnej do retry. `TemplatesPage` blokuje akcje podczas startu, lecz nie pokazuje statusu przy klikniętym dniu lub przycisku. Dashboard ma lokalne „Start...”, ale kontrakt różni się między ekranami.

### 3.2 Zapis i usuwanie

- `TemplateEditorPage` zachowuje draft po błędzie, lecz informuje tylko toastem;
- `TemplatesPage` zamyka dialog usunięcia przed potwierdzeniem sukcesu i nie utrzymuje lokalnego błędu przy karcie;
- `DashboardPage` oraz `WorkoutDetailPage` usuwają trening przez `workoutService`, lecz wynik wymagający działania nie pozostaje przy właściwej akcji;
- `TemplateSaveDock` zna wyłącznie `dirty`, `saving` i `isEdit`, dlatego pusty formularz create może wyglądać jak zapisany.

### 3.3 Nawigacja i CTA

Router nie definiuje `/`, więc root trafia do `NotFoundPage`. Publiczne i prywatne outlety poprawnie chronią istniejące trasy.

Dashboard rozróżnia widoczne CTA aktywnej sesji, lecz nie ma jawnego przejściowego stanu otwierania. Górna i dolna nawigacja mają poprawne `aria-current`; nie powinny otrzymać loadera, który mógłby pozostać aktywny po zatrzymaniu nawigacji przez guard niezapisanych zmian.

### 3.4 Szczegóły treningu mobile

`WorkoutDetailPage` renderuje fixed `workout-detail-mobile-actions`. CSS poprawnie zmienia bottom offset, gdy dolna nawigacja jest ukryta, ale dock od pierwszego renderu leży nad podsumowaniem. Dolny padding pozwala przewinąć koniec dokumentu, lecz nie usuwa wizualnego przecięcia przy wejściu.

### 3.5 Copy, kontrast i demo

- `WorkoutDetailPage` buduje zdanie przez lowercase etykiety kategorii;
- `ProgressPage.summarizeMuscleBalance` nadal używa twardego „wpisów”;
- `--muted-soft: #726c73` nie przechodzi 4.5:1 na głównych powierzchniach;
- `--primary-gradient` zaczyna się od `#f0435a`, na którym biały tekst ma 3.71:1;
- istniejący seed tworzy realistyczne treningi, ale bieżące konto demo zawiera historyczne, niewiarygodne dokumenty;
- `tests/e2e/audit-screenshots.spec.ts` używa diagnostycznego capture, stałych nazw i fixed waitów;
- `tests/e2e/smoke.spec.ts` nazywa zwykły screenshot baseline'em visual regression bez `toHaveScreenshot`.

## 4. Zakres i granice

### 4.1 W zakresie

1. lokalny kontrakt idle/pending/error/retry dla startu planu;
2. mały współdzielony komponent prezentacyjny feedbacku akcji;
3. trwały błąd i retry dla:
   - startu planu lub dnia;
   - zapisu planu;
   - usunięcia planu;
   - usunięcia ukończonego treningu z dashboardu i szczegółów;
4. prawdziwy stan nowego planu;
5. przejściowy stan głównego CTA treningu;
6. kontekstowa etykieta wejścia do treningu w shellu;
7. redirect `/` z zachowaniem ochrony trasy i 404;
8. adaptacyjne mobilne akcje szczegółów treningu;
9. poprawa dwóch kontraktów kontrastu;
10. poprawna gramatyka kategorii, pluralizacja oraz copy odrzucenia sesji;
11. idempotentny reseed demo z preflightem i weryfikacją;
12. rozdzielenie capture diagnostycznego i jednego stabilnego widoku regresji wizualnej w dwóch viewportach.

### 4.2 Poza zakresem

- globalny store operacji asynchronicznych;
- nowy framework zapytań albo mutacji;
- trwały feedback wszystkich formularzy Profilu, Readiness, Ćwiczeń i AI;
- przebudowa Profilu lub poprawnych stanów z małą ilością danych;
- centralizacja `CATEGORY_COLORS` i neutralnego fallbacku — `LATER-08`;
- hurtowe zwiększanie mikrotekstu — `LATER-09`;
- rozwój EKG, drugiego akcentu albo zmiana relacji IronLog/Puls — `LATER-10`;
- szersza regresja wizualna wszystkich tras — `LATER-05`;
- implementacja `AI-14`, która należy do Fazy 6C;
- optymalizacja dashboardu bez powtarzalnego pomiaru z `RELEASE-10`;
- schemat danych, reguły Firestore i API produktu;
- push, deploy oraz produkcyjne czynności `RELEASE-08`.

## 5. Wybrany kierunek

Wybrano lokalny kontrakt stanu akcji z cienkim współdzielonym komponentem prezentacyjnym.

Stan należy do hooka albo strony, która zna obiekt operacji. `ActionFeedback` odpowiada wyłącznie za semantyczne pokazanie pending/error i akcji retry/dismiss. Nie przechowuje danych, nie wykonuje requestów i nie podejmuje decyzji o retry.

### 5.1 Odrzucone warianty

1. **Globalny provider/store operacji.** Rozszerza zasięg stanu i komplikuje reset po nawigacji bez korzyści dla kilku objętych mutacji.
2. **Niezależne ad hoc alerty na każdej stronie.** Dają najmniejszy początkowy diff, ale utrwalają różne role ARIA, copy i zasady czyszczenia błędu.
3. **Loader na całej górnej i dolnej nawigacji.** Guard Fazy 4 może zatrzymać przejście, pozostawiając globalny loader bez właściciela.
4. **Fixed dock szczegółów od pierwszego renderu.** Zachowuje stałą dostępność, ale nadal zasłania podsumowanie.
5. **Usunięcie fixed docka całkowicie.** Eliminuje overlay, lecz na długich szczegółach odbiera szybki dostęp do edycji i usunięcia.
6. **Pełna wizualna regresja wszystkich tras.** Jest kosztowna i niestabilna przed ustaleniem deterministycznych danych dla każdego ekranu.

## 6. Wspólny kontrakt `ActionFeedback`

Komponent prezentacyjny obsługuje dwa widoczne stany:

| Stan | Semantyka | Widoczna treść | Akcje |
|---|---|---|---|
| pending | `role="status"`, `aria-live="polite"` | kontekstowy tekst i spinner | brak albo blokada ponownego submitu |
| error | `role="alert"` | trwały, konkretny komunikat | „Spróbuj ponownie”, „Zamknij” |

Komponent przyjmuje komunikat, opcjonalne id, callback retry i callback dismiss. Nie przyjmuje identyfikatora Firestore ani funkcji serwisowej.

Właściwa karta, formularz albo grupa akcji wskazuje komunikat przez `aria-describedby`, jeżeli relacja nie wynika jednoznacznie z bezpośredniego sąsiedztwa i roli live regionu.

Błąd pozostaje widoczny do:

- udanego retry;
- świadomego zamknięcia;
- rozpoczęcia nowej, zastępującej operacji na tym samym celu.

Zmiana niezwiązanych pól formularza nie czyści błędu automatycznie. Jeśli nowa wartość zmienia znaczenie retry, właściciel operacji może unieważnić stary błąd i wymagać nowego submitu.

Toast pozostaje do krótkiego potwierdzenia sukcesu. Nie jest jedynym nośnikiem błędu wymagającego działania.

## 7. Kontrakt uruchamiania planu

`useTemplateWorkoutLaunch` pozostaje źródłem prawdy i rozszerza publiczny kontrakt co najmniej o:

- pełny aktualny cel: plan oraz indeks dnia;
- status `idle | pending | error`;
- informację, czy operacja ma zastąpić istniejącą aktywną sesję;
- błąd przypisany do konkretnego celu;
- `retryTemplateLaunch`;
- `dismissTemplateLaunchError`.

Istniejące lock, generation, unmount guard, konflikt aktywnej sesji i `hydrateFromDoc` pozostają.

### 7.1 Pending

Po kliknięciu:

- dokładnie wskazany przycisk pokazuje spinner i „Uruchamiam…”;
- właściwa karta otrzymuje `aria-busy="true"`;
- pozostałe akcje startu są czasowo zablokowane;
- treść i geometria karty pozostają stabilne;
- Dashboard i Plany używają tego samego copy.

### 7.2 Konflikt aktywnej sesji

Dialog zachowuje plan i dzień. Potwierdzenie zapisuje `replaceExisting: true` jako część operacji. Jeżeli potwierdzony start nie powiedzie się, retry powtarza tę samą operację bez ponownego pytania o decyzję, dopóki użytkownik nie zamknie błędu albo nie wybierze innego celu.

### 7.3 Błąd

Błąd pojawia się przy właściwej karcie lub kaflu. Retry nie wyszukuje planu ponownie po nazwie i nie zmienia dnia. Spóźniony wynik starej generacji nie może wyczyścić nowszego błędu ani uruchomić nawigacji.

## 8. Kontrakt zapisu i usuwania

### 8.1 Nowy plan i `TemplateSaveDock`

Stan docka nie może wynikać wyłącznie z porównania bieżącego i zapisanego snapshotu. Właściciel przekazuje również, czy zasób został kiedykolwiek zapisany.

Ten punkt świadomie zastępuje wyłącznie historyczny fragment projektu Fazy 4, który dopuszczał stan clean dla pustego, niezmienionego formularza create. Faza 4 pozostaje zamknięta; nowy kontrakt prawdy zasobu należy do `FEEDBACK-04`.

| Stan | Status | Przycisk |
|---|---|---|
| `new-pristine` | „Nowy plan · jeszcze niezapisany” | „Zapisz szablon”; nieaktywny do spełnienia walidacji |
| `dirty` | „Niezapisane zmiany” | „Zapisz szablon” albo „Zapisz zmiany” |
| `saving` | „Trwa zapis” | „Zapisuję…” |
| `error` | trwały komunikat błędu | aktywne retry aktualnego draftu |
| `persisted-clean` | „Wszystkie zmiany zapisane” | nieaktywne „Zapisano” |

Draft AI zaczyna jako niezapisany i dirty. Wczytany istniejący plan zaczyna jako persisted-clean. Po błędzie wartości pól i dirty state pozostają. Retry waliduje i wysyła aktualny draft, a nie historyczną kopię z momentu błędu.

Obecny sukces create może nadal prowadzić do listy Planów. `persisted-clean` dla create jest kontraktem prawdy stanu przed nawigacją, nie wymogiem sztucznego opóźnienia przejścia.

### 8.2 Usunięcie planu

- dialog inicjuje operację dla konkretnego id;
- karta pozostaje do potwierdzenia sukcesu;
- pending blokuje ponowne usunięcie tej karty;
- błąd jest zakotwiczony przy tej samej karcie;
- retry używa tego samego id;
- dopiero sukces usuwa kartę z lokalnej listy.

### 8.3 Usunięcie ukończonego treningu

Dashboard i szczegóły używają tej samej prezentacji, ale zachowują lokalny stan strony. Trening i jego dane pozostają widoczne po błędzie. Retry używa tego samego id. W szczegółach komunikat należy do powierzchni akcji inline/fixed, a nie do losowego miejsca na końcu strony.

## 9. CTA treningu i shell nawigacji

Dashboard wyprowadza etykietę z istniejącego kontraktu aktywnej sesji:

| Stan sesji | Etykieta spoczynkowa | Etykieta przejściowa |
|---|---|---|
| brak pracy w aktywnej sesji | „Rozpocznij nowy trening” | „Otwieram trening…” |
| istnieje aktywna praca | „Wznów trening” | „Otwieram sesję…” |

Stan jest lokalny dla CTA. Nie wprowadzamy sztucznego minimalnego czasu loadera. Jeśli przejście jest natychmiastowe, użytkownik nie musi zobaczyć migotania; jeśli wymaga załadowania chunka lub przygotowania trasy, CTA pokazuje pending do przekazania sterowania ekranowi treningu.

TopNav i BottomNav zachowują natychmiastową nawigację oraz `aria-current`. Ich etykieta wejścia do treningu może korzystać z `hasActiveSessionWork`, ale nie otrzymują trwałego loadera.

## 10. Routing root

Router dodaje jawną trasę `/`, która przekierowuje do `/dashboard` z `replace`.

Docelowe zachowanie:

| Wejście | Stan auth | Wynik |
|---|---|---|
| `/` | zalogowany | `/dashboard` |
| `/` | niezalogowany | `/login` przez istniejący private outlet |
| nieznana ścieżka | dowolny | `NotFoundPage` |

Redirect nie duplikuje logiki auth i nie omija onboardingu bardziej niż bezpośrednie wejście na `/dashboard` w obecnym kontrakcie.

## 11. Adaptacyjne akcje szczegółów treningu

Na mobile akcje mają dwa położenia, lecz jedną logiczną instancję interakcji:

1. przy wejściu są w normalnym przepływie bezpośrednio pod podsumowaniem;
2. po przewinięciu ich miejsca ponad viewport przechodzą do kompaktowego fixed docka;
3. po powrocie do miejsca inline wracają do przepływu.

Przejście może użyć `IntersectionObserver` na stabilnym placeholderze. Stan fixed powstaje wyłącznie wtedy, gdy placeholder minął górną krawędź; placeholder znajdujący się dopiero poniżej viewportu nie może przedwcześnie uruchomić docka.

W danej chwili tylko jedna powierzchnia jest renderowana jako interaktywna. Nie wolno zostawić dwóch kopii w kolejności Tab. Stan `saving`, `deleting`, dialog oraz błąd należą do strony, więc zmiana położenia nie resetuje operacji.

Zmiana położenia nie może kraść fokusu. Jeżeli fokus pozostaje wewnątrz powierzchni akcji podczas zmiany trybu, implementacja zachowuje logicznie tę samą akcję albo odkłada przełączenie do czasu opuszczenia grupy.

Fixed dock:

- zachowuje istniejący bottom offset względem widocznej i ukrytej dolnej nawigacji;
- uwzględnia `env(safe-area-inset-bottom)`;
- nie przykrywa końca treści dzięki scroll clearance równemu rzeczywistej wysokości docka;
- ma kompaktową geometrię bez zmiany nazw i hierarchii akcji;
- nie zmienia desktopowego aside.

## 12. Kontrast i copy

### 12.1 Kontrast

Docelowy `--muted-soft` to `#8f8990` albo równoważna wartość nie ciemniejsza w obliczonym kontraście. Daje około:

- 5.56:1 na `#111012`;
- 4.79:1 na `#211f23`.

Primary CTA zachowuje biały foreground, ale korzysta z osobnego ciemniejszego gradientu:

- początek: `#c72e44` (`--puls-effort-deep`), biały około 5.38:1;
- koniec: `#a91f35`, biały około 7.16:1.

Globalny `--accent` pozostaje `#f0435a` dla linii, sygnałów, ikon i wykresów. Nie przyciemniamy całego języka Puls tylko po to, by naprawić powierzchnię przycisku.

Computed styles rzeczywistych przycisków są źródłem końcowej weryfikacji. Hover i active nie mogą wprowadzić jaśniejszej powierzchni łamiącej kontrast. Disabled pozostaje czytelny, nawet jeśli formalnie jest wyjątkiem WCAG dla nieaktywnej kontrolki.

### 12.2 Kategorie

Powstaje mały helper gramatyczny niezależny od `CATEGORY_COLORS`. Zwraca formę potrzebną w zdaniu „Najwięcej pracy poszło…”, np. „na klatkę”, „na plecy”, „w nogi” zgodnie z zatwierdzonym copy.

Nie należy lowercasować etykiety prezentacyjnej i zakładać, że mianownik pasuje do każdego zdania.

### 12.3 Pluralizacja

`ProgressPage.summarizeMuscleBalance` korzysta z istniejącego `polishPlural`. Zestaw regresyjny obejmuje co najmniej `0, 1, 2, 4, 5, 12, 22` dla `wpis / wpisy / wpisów`.

### 12.4 Dialog odrzucenia

Dialog aktywnej sesji używa:

- akcja bezpieczna: „Wróć”;
- akcja destrukcyjna: „Odrzuć trening”.

Zmiana dotyczy widocznego copy i dostępnych nazw. Backendowy kontrakt discard pozostaje bez zmian.

## 13. Dane demo

`scripts/seed-demo.ts` pozostaje jedynym narzędziem seeda. Faza nie tworzy drugiego skryptu ani ręcznego zestawu dokumentów.

Przed mutacją skrypt lub wrapper operacyjny musi:

1. potwierdzić, że docelowy email to dokładnie konto demo;
2. wypisać planowaną operację i projekt Firebase bez sekretów;
3. przerwać przy niezgodnym koncie lub środowisku;
4. korzystać z istniejącej idempotentnej procedury reset/reseed.

Po reseedzie read-only kontrola potwierdza:

- oczekiwaną, deterministyczną liczbę treningów;
- realistyczny maksymalny czas zgodny z fixture'em seeda;
- niepuste etykiety;
- brak aktywnej sesji;
- obecność planów i danych potrzebnych do prezentacji.

Operacja jest destrukcyjna wyłącznie dla konta demo. Wymaga osobnego potwierdzenia bezpośrednio przed wykonaniem w planie implementacyjnym. Procedurą odzyskania jest ponowny seed; nie budujemy rollbacku dokument po dokumencie.

## 14. Strategia testów

### 14.1 Unit i component

- `useTemplateWorkoutLaunch`: idle/pending/error/success, konflikt, potwierdzony replace, retry dokładnego celu, double click, obsolete generation i unmount;
- `ActionFeedback`: `role=status`, `role=alert`, retry, dismiss i brak anonimowych kontrolek;
- `TemplateSaveDock`: `new-pristine`, dirty, saving, error i persisted-clean;
- `TemplateEditorPage`: zachowanie draftu po błędzie i sukces create/update;
- `TemplatesPage`: brak optymistycznego usunięcia, pending/error/retry tej samej karty;
- `DashboardPage` i `WorkoutDetailPage`: trwały błąd usuwania i właściwy retry;
- router: root dla auth/no-auth oraz prawdziwa nieznana trasa;
- helper kategorii i pluralizacja przypadków granicznych;
- copy dialogu odrzucenia.

### 14.2 Playwright funkcjonalny

Objęte scenariusze:

- start planu i dnia: pending, error, retry i konflikt aktywnej sesji;
- CTA dashboardu z aktywną pracą i bez niej;
- edytor create: new-pristine → dirty → saving → sukces albo error;
- usunięcie planu oraz ukończonego treningu z kontrolowanym błędem;
- `/`, `/dashboard` i prawdziwa 404;
- mobile inline → fixed → inline, brak dwóch fokusowalnych kopii;
- widoczny i ukryty BottomNav, safe-area i pełne odsłonięcie treści;
- czysta konsola po zakończeniu celowo wstrzykniętego błędu i udanym recovery.

Failure injection używa mocków serwisów w component tests, emulatora albo kontrolowanego interceptu w E2E. Nie należy przełączać produkcyjnego konta offline tylko po to, by wymusić każdy przypadek.

### 14.3 Kontrast

Playwright odczytuje computed CSS variables i rzeczywiste tła reprezentatywnych kontrolek. Funkcja względnej luminancji sprawdza:

- `--muted-soft` na `--bg` oraz `--surface-2`;
- biały foreground na obu końcach primary gradientu;
- default, hover i active.

Test nie może sprawdzać wyłącznie literalnej wartości hex bez potwierdzenia, że komponent faktycznie używa danego tokenu.

### 14.4 Capture diagnostyczny i regresja wizualna

Diagnostyczny spec:

- otrzymuje nazwę w rodzaju `diagnostic-capture.spec.ts`;
- używa `testInfo.outputPath` albo równoważnych unikalnych ścieżek;
- czeka na gotowość właściwego ekranu i fontów;
- nie używa fixed sleep jako głównego sygnału gotowości;
- nie jest częścią obowiązkowej regresji pikselowej.

Prawdziwy baseline:

- obejmuje jeden stabilny widok: pustą stronę Planów;
- ma wariant desktop i mobile;
- używa deterministycznego użytkownika emulatora;
- wyłącza animacje i czeka na fonty;
- używa `toHaveScreenshot` z kontrolowanym progiem wynikającym z realnej stabilności, nie z chęci ukrycia różnic.

Komentarz „visual regression baseline” w zwykłym smoke zostaje usunięty albo zastąpiony prawdziwą asercją w dedykowanym specu.

### 14.5 Headed walkthrough

Końcowa macierz runtime:

| Ekran | Stany | Viewport |
|---|---|---|
| Dashboard | brak sesji, aktywna sesja, CTA pending, delete error | desktop + mobile |
| Plany | empty, loaded, launching, conflict, error, retry, delete error | desktop + mobile |
| Edytor planu | new-pristine, dirty, saving, error | mobile + kontrola desktop |
| Szczegóły treningu | inline, fixed, nav visible/hidden, delete error | mobile |
| Router | root auth/no-auth, 404 | desktop + mobile smoke |
| Kontrast | normalne powierzchnie i CTA | desktop + mobile |

## 15. Rollout i odzyskanie

Zmiany kodu nie wymagają migracji ani feature flaga. Powinny być dzielone na małe commity według kontraktu: feedback, prawdziwy stan i routing, mobile/kontrast/copy, testy wizualne, dokumentacja.

Rollback kodu polega na odwróceniu odpowiedniego commita. Nie ma zapisu nowego formatu danych.

Reseed demo jest osobnym krokiem operacyjnym po zielonych bramkach kodu. Nie należy łączyć go z commitem ani wykonywać automatycznie podczas testów. Recovery to ponowne wykonanie deterministycznego seeda.

Push, deploy, zmienne Vercel i publikacja reguł pozostają poza Fazą 5 bez osobnej zgody.

## 16. Kryteria akceptacji

1. Kliknięta akcja startu pokazuje własny pending i zachowuje geometrię.
2. Retry startu powtarza dokładnie plan, dzień i decyzję replace.
3. Objęte błędy zapisu i usunięcia pozostają przy właściwej powierzchni do retry lub dismiss.
4. Nowy pusty plan nie pokazuje „Zapisano”.
5. CTA używa poprawnych etykiet start/wznowienie i nie wprowadza globalnego loadera nawigacji.
6. `/` prowadzi przez istniejący kontrakt auth do dashboardu albo logowania; prawdziwa nieznana ścieżka nadal pokazuje 404.
7. Mobilne akcje szczegółów zaczynają inline i stają się fixed dopiero po minięciu własnego miejsca; w Tab istnieje jedna kopia.
8. Żaden fragment treści nie jest trwale zasłonięty przez dock, BottomNav ani safe-area.
9. `--muted-soft` i primary CTA osiągają co najmniej 4.5:1 w objętych zastosowaniach.
10. Kategorie i pluralizacja przechodzą uzgodniony zestaw polskich form.
11. Dialog używa „Wróć” / „Odrzuć trening”.
12. Konto demo po zatwierdzonym reseedzie nie zawiera niewiarygodnych czasów ani pustych etykiet.
13. Diagnostyczne screenshoty mają unikalne ścieżki i nie są nazywane regresją.
14. Pusta strona Planów ma prawdziwy, stabilny baseline desktop/mobile.
15. Unit, lint, build i ukierunkowane testy Playwright przechodzą bez retry maskującego błąd.

## 17. Definition of Done

Faza jest zakończona dopiero, gdy:

- wszystkie identyfikatory zakresu mają implementację i dowód regresyjny;
- automatyczne bramki są zielone;
- headed walkthrough nie znajduje zasłoniętej treści, fałszywego „Zapisano” ani zablokowanego pending;
- celowo wstrzyknięte błędy mają recovery, a końcowa konsola jest czysta;
- niezależny code review nie ma otwartych Critical ani Important;
- konto demo zostało zreseedingowane dopiero po osobnym potwierdzeniu i przeszło kontrolę read-only;
- roadmapa i `WORKING_CONTEXT.md` opisują faktyczny wynik;
- po lokalnej integracji wykonano `project-convergence`;
- push i deploy nie zostały wykonane bez osobnej zgody.

## 18. Handoff do planowania

Szczegółowy plan implementacyjny ma użyć `superpowers:writing-plans` dopiero po zatwierdzeniu tego dokumentu przez użytkownika.

Plan powinien:

1. wskazać dokładne pliki i testy dla każdego identyfikatora;
2. zacząć od testów reprodukujących obecne błędy;
3. zachować serwisy jako jedyne miejsce dostępu do Firestore;
4. nie ustawiać synchronicznie loading state na początku `useEffect`;
5. rozdzielić operacyjny reseed demo od implementacji kodu;
6. zakończyć niezależnym review, integracją, aktualizacją roadmapy i `project-convergence`.

Implementacja nie rozpoczyna się na podstawie samego speca. Wymaga zatwierdzonego planu wykonawczego i wyboru trybu realizacji.

## 19. Wynik wdrożenia i dowody

### Wynik

- Zakres `FEEDBACK-01–04`, `NAV-01`, `MOBILE-07`, `A11Y-09–10`, `COPY-01–03`, `DEMO-01`, `TEST-04` został wdrożony i zweryfikowany.
- Weryfikacja końcowa: `52 files / 364 tests` jednostkowo PASS, `lint` PASS, `build` PASS dla `877` modułów, reguły Firestore `10/10`, integracja treningów `20/20`.
- Ostateczny E2E: `48` passed, `9` oczekiwanych skipów (viewport/platform), `0` failures, `retries=0`, czas `3.8m`.
- Weryfikacja wizualna: `3/3` przejść, `2` baselines (desktop `1280x784`, mobile `393x1345`), bez zmiany tolerancji ani retry; normalizacja scrollbara działa wyłącznie w desktopowym harnessie testowym.
- Reseed demo po osobnym potwierdzeniu wykonano na `demo@ironlog.app`, `ironlog-ede05`: usunięto `27 workouts,145 exerciseSessions,21 records,4 userExercises,1 template,7 readiness`; po odświeżeniu potwierdzono `26 workouts,1 template,4 custom exercises,7 readiness`, materializacja `26/26`, max `74min`, `blank labels: 0`, brak aktywnej sesji.

### Odchylenia od planu

- Normalizacja scrollbara okna dla desktopowego harnessu testowego pozostała odchyleniem testowym, nieproduktowym.
- `project-convergence` zakończono 2026-07-21 po lokalnym fast-forward merge do `puls-rebrand`: kontrakt, implementacja, dowody i stan integracji są zbieżne; nie pozostał otwarty gate Fazy 5.
- Bezpośrednia obserwacja w lokalnej przeglądarce na emulatorach potwierdziła po zimnym wejściu spójne „Wznów trening” w dashboardzie i shellu, viewport `390×844` bez poziomego overflow oraz brak błędów konsoli.
