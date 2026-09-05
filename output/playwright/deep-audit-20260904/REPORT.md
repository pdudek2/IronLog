# IronLog — głęboki audyt projektu

Data: 4 września 2026. Repozytorium: `/Users/patryk/Desktop/IronLog`. Stan: `main`, commit `64fde7e`. Tryb: przegląd całego projektu i raport, bez zmian w kodzie aplikacji.

**Najpilniejsze są niezawodność zapisu aktywnego treningu i izolacja danych po zmianie konta.** Potwierdzono 21 ustaleń: 2 × P1, 16 × P2, 3 × P3. Nie przypisano P0. Kilka problemów ujawnia się dopiero przy opóźnionej odpowiedzi, ponownym wejściu na ekran albo przerwaniu operacji. Zwykły przebieg treningu działał, a istniejące testy jednostkowe i integracyjne przeszły.

Puls stanowi spójny kierunek interfejsu. Największy zwrot przyniesie naprawa przepływów i kilku konkretnych błędów prezentacji danych. Materiał z audytu nie uzasadnia pełnego redesignu, wymiany stosu ani przebudowy warstwy danych.

## Zakres i sposób pracy

Przejrzano granice aplikacji, serwisy, backend, reguły danych, konfigurację, skrypty i testy. Prześledzono kontrakty pomiędzy nimi, uruchomiono lokalny backend, Firebase Auth/Firestore Emulator oraz aplikację w Chromium. Użyto `agent-sanity-review`, `app-screen-refiner` w trybie review/utility i Playwright. Trzy niezależne zadania objęły backend/lifecycle, frontend/dane i AI/bezpieczeństwo/konfigurację. Dwie dodatkowe, ograniczone oceny obrazów dotyczyły tych samych aktualnych ekranów. Końcowe ustalenia zostały zweryfikowane i zebrane według przyczyny, a nie według autora przeglądu.

Zakres całego repozytorium oznacza pokrycie istotnych granic systemu; nie oznacza przeczytania każdej linii plików wygenerowanych, zależności i historycznych artefaktów. Repozytorium zawiera 387 śledzonych plików, około 55,6 tys. linii TS/TSX/CSS łącznie z testami i danymi.

| Granica | Główne ścieżki | Sprawdzenie | Pokrycie |
|---|---|---|---|
| Struktura, uruchamianie, routing | `package.json`, `vite.config.ts`, `src/router`, `src/App.tsx`, README, AGENTS | Inspekcja, uruchomienie, lint, TypeScript/build | Complete |
| Auth i izolacja stanu | `src/lib/auth.ts`, `src/store`, chronione trasy | Źródła, logowanie/rejestracja/onboarding/wylogowanie, próba opóźnionego dashboardu | Complete dla planowanych prób lokalnych |
| Aktywna sesja | `useActiveSession`, `workoutStore`, usługi zapisu i zamknięcia | E2E, emulator, offline, nawigacja przed debounce, odtworzenie po załadowaniu | Complete dla planowanych prób; bez fizycznego drugiego urządzenia |
| Zakończenie, edycja, usunięcie, projekcje | `api/*workout*`, `api/_lib/workoutProjection.ts`, tombstones | 45 testów integracyjnych i 3 dodatkowe próby z rzeczywistym Firestore Emulator | Complete |
| Historia, postępy, rekordy | `src/lib/*Service.ts`, strony History/Progress/ExerciseDetail | Źródła, dane z 400 dni, filtry roku, rekordy i jednostki | Complete dla planowanej próbki |
| Plany, katalog, profil | strony Templates/TemplateEditor/Exercises/Profile | Źródła, E2E, edytor z 3 dniami, desktop/mobile, profil lbs | Complete dla planowanej próbki |
| AI: UI, protokół, kontekst, limity | `ChatPage`, `chatService`, `api/ai-chat`, `aiContextLoader`, `server/aiContext` | Testy lokalne, kontrolowane odpowiedzi, analiza payloadu i kompletności kontekstu | Partial — bez płatnego wywołania Anthropic i oceny jakości realnych odpowiedzi |
| Reguły, indeksy, bezpieczeństwo konfiguracji | Firestore rules/indexes, API auth, body limits, CSP, Vercel | 19 testów rules, inspekcja, 3 testy CSP + setup | Partial — bez audytu działającego projektu Firebase/Vercel i zewnętrznego pentestu |
| Testy i narzędzia pomocnicze | testy jednostkowe/integracyjne/E2E, `scripts/`, CI/config | Inspekcja poleceń i wybranych granic testowych, wykonania opisane poniżej | Complete dla wskazanego zestawu, nie dla wszystkich opcjonalnych testów wizualnych |
| UI statycznie | strony, komponenty, `src/index.css`, tokeny Puls | Kontrakty stanów, semantyka, CSS i warunki responsive | Complete dla przejrzanych ekranów |
| UI w przeglądarce | chronione i publiczne ekrany | Świeże obrazy, DOM/CSS, realny trening, 11 dodatkowych skanów axe | Partial — reprezentatywne stany Chromium, bez pełnej macierzy urządzeń i wszystkich kombinacji błędów |
| Zależności, stare materiały, build output | lockfile, `node_modules`, `dist`, wcześniejsze `output/*` | Rola zależności i artefaktów, zgodność z buildem | Partial — bez aktualnego skanu CVE; stare obrazy nie stanowią dowodu obecnego UI |
| Produkcyjne dane i wdrożenia | zdalny Firebase/Vercel, migracje, płatne AI | Nie wykonywano operacji | Excluded — audyt lokalny, bez potrzeby zmiany zewnętrznego stanu |

Nie instalowano ani nie aktualizowano zależności. Dane prób powstały w lokalnym projekcie `demo-ironlog`. Nie wykonywano deployu, push, migracji ani zmian w danych produkcyjnych. Istniejące, nieśledzone materiały użytkownika zachowano.

## Jak rozumiem architekturę

IronLog jest SPA React 19/TypeScript/Vite z Zustand. Publiczne ekrany prowadzą przez Firebase Auth i onboarding do chronionych, ładowanych leniwie stron. Interfejs Puls wykorzystuje istniejące tokeny, Archivo/Instrument Sans/Spline Sans Mono oraz odrębne układy mobilny i desktopowy.

Aktywny trening żyje w Zustand, lokalnej kopii i `activeSessions/{uid}`. To najbardziej wrażliwy fragment: łączy debounce, kolejkę zapisów, wersję dokumentu, synchronizację zdalną, lokalną edycję, lifecycle komponentu i zamykanie sesji. Zakończenie oraz odrzucenie przechodzą przez autoryzowane API. Admin SDK tworzy trening kanoniczny i tombstone, a następnie materializuje `exerciseSessions` i `records`. Wersje i tombstones zabezpieczają przed odtworzeniem zamkniętej lub usuniętej sesji przez spóźniony zapis.

Historia i analityka odczytują treningi oraz projekcje jednorazowo. Katalog globalny pozostaje statyczny; własne ćwiczenia, plany i readiness są właścicielskimi dokumentami Firestore. `exerciseSource` rozróżnia pochodzenie ćwiczenia. Ciężary w bazie pozostają w kg. Coach używa własnego klucza użytkownika zapisanego lokalnie; backend składa ograniczony kontekst i obsługuje odpowiedź strumieniową lub wygenerowany plan.

## Walidacja wykonana w tym audycie

| Sprawdzenie | Wynik | Co wynik rzeczywiście oznacza |
|---|---|---|
| `npm run lint` | PASS | Brak błędów w aktualnym zestawie reguł |
| `npm run build` | PASS | TypeScript i produkcyjny build Vite przechodzą |
| `npm run test:unit` | **637/637**, 76 plików | Istniejące testy jednostkowe przechodzą |
| Vitest, `vitest.rules.config.ts`, Firestore Emulator | **19/19** | Przetestowane kontrakty reguł przechodzą |
| Vitest, `vitest.workout-integration.config.ts`, Firestore Emulator | **45/45**, 3 pliki | Przetestowane scenariusze lifecycle/projekcji przechodzą |
| Playwright: 11 zestawów, desktop + mobile, bez retries | **110 passed, 15 skipped, 8 failed** | Wynik nie jest zielony; przyczyny 8 niepowodzeń poniżej |
| Playwright CSP: produkcyjny build + lokalny preview | **4/4**, w tym setup | Login i dashboard działają pod wymuszoną polityką; konfiguracja spełnia testowany kontrakt |
| Dodatkowe pełne `axe.run()` | **0 naruszeń w 11 sprawdzonych stanach** | Nie stanowi pełnej certyfikacji WCAG ani oceny wszystkich stanów |
| Dodatkowe próby backendu | **3 problemy odtworzone** | Współbieżna materializacja, powtórzone ćwiczenie, przerwane usuwanie |
| Ręcznie sterowane próby Chromium | **Problemy F01, F03, F04, F06–F08, F13, F19 zaobserwowane** | Dowody aktualne, nie odziedziczone ze starych raportów |

Logi: [katalog bieżącej walidacji](/Users/patryk/Desktop/IronLog/output/playwright/deep-audit-20260904/logs). Szczegółowe polecenia i ograniczenia: [VALIDATION.md](/Users/patryk/Desktop/IronLog/output/playwright/deep-audit-20260904/VALIDATION.md).

Osiem niepowodzeń E2E sprowadza się do pięciu rozbieżności testów z bieżącym UI:

1. `chat.spec.ts:206`, desktop i mobile: test oczekuje pola rozmowy bez ustawionego klucza. Inny test w tym samym zestawie sprawdza jego celową nieobecność bez klucza.
2. `chat.spec.ts:417`, desktop i mobile: część sprawdzająca abort przechodzi; test zatrzymuje się na starym tekście pustego stanu „Zacznij od konkretu”. Aktualny tekst to „Brak historii rozmowy”. Późniejsze asercje odrzucenia spóźnionego tekstu nie zostały osiągnięte.
3. `progress.spec.ts:142`, desktop i mobile: test szuka nazwy ćwiczenia wewnątrz `.progress-strength-insight`; nazwa znajduje się teraz w sąsiednim selektorze. Sama informacja o wyniku jest widoczna.
4. `dashboard.spec.ts:107`, mobile: pomocnik `support/templateDraft.ts:41` wybiera textbox `Nazwa` nieściśle; pasuje również `Nazwa dnia`, co daje strict locator violation.
5. `progress.spec.ts:181`, mobile: test wymaga insightu nad pierwszym wykresem. Obecny układ wiąże go z wykresem progresji ciężaru, po innym wykresie. To rozbieżność kontraktu układu do rozstrzygnięcia; sam wynik testu nie dowodzi błędu produktu.

Nie klasyfikuję tych testów jako flaky. Nie odtworzono losowej niestabilności. Trzeba uzgodnić aktualne kontrakty i poprawić selektory/asercje; następnie ponowić te testy. Nie należy uznawać późniejszych, nieosiągniętych asercji za zaliczone.

## Ustalenia

Priorytety w tym raporcie: **P1** — pilna naprawa ze względu na utratę danych albo izolację kont; **P2** — konkretny błąd lub ograniczone ryzyko do zaplanowania; **P3** — mała poprawka nazewnictwa, komunikatu lub dokumentacji. Ocena (`likely-broken`, `risky`, `cleanup`) jest osobną osią. Pewność dotyczy istnienia mechanizmu, nie nieznanej częstości występowania w produkcji.

### F01 · P1 — ponowne załadowanie może nadpisać niezapisany trening starszą wersją

**Lokalizacja:** [useActiveSession.ts:432](/Users/patryk/Desktop/IronLog/src/hooks/useActiveSession.ts:432), gałąź `accept_remote` w linii 541 i przywracanie kopii w linii 629. **Kategoria:** trwałość danych. **Ocena:** likely-broken. **Pewność:** High. **Pochodzenie:** Current execution + Static trace.

**Przyczyna:** lokalna kopia nie uczestniczy w normalnym uzgadnianiu danych po pełnym starcie aplikacji. Wtedy Zustand nie zawiera aktywnego treningu, a odebrana sesja z serwera nadpisuje również backup. Odtworzenie z backupu znajduje się przede wszystkim w obsłudze błędu subskrypcji.

**Dowód:** zapisano 5 powtórzeń; wyłączono sieć dla całego kontekstu przeglądarki; wpisano 7 i potwierdzono 7 w lokalnej kopii. Po opuszczeniu strony, przywróceniu sieci i ponownym wejściu `/workout/new` UI oraz backup zawierały 5. [Przed](/Users/patryk/Desktop/IronLog/output/playwright/deep-audit-20260904/mobile-offline-reps7.png), [po](/Users/patryk/Desktop/IronLog/output/playwright/deep-audit-20260904/mobile-reload-lost-reps.png).

**Wpływ:** użytkownik traci zmiany, mimo istnienia lokalnego zabezpieczenia. **Naprawa:** zachować informację o niezapisanych zmianach wraz z bazową rewizją; uzgodnić kopię tej samej sesji przed jej nadpisaniem. Rozróżnić sesję aktywną, nową i zamkniętą — nie przywracać bezwarunkowo backupu. **Bezpieczeństwo automatycznej poprawki:** With validation. Wymagany test pełnego restartu po edycji offline oraz regresja zamkniętej sesji.

### F02 · P1 — spóźniony dashboard konta A może wstawić jego dane po zalogowaniu konta B

**Lokalizacja:** [DashboardPage.tsx:272](/Users/patryk/Desktop/IronLog/src/pages/DashboardPage.tsx:272), efekt w linii 338; [dashboardStore.ts](/Users/patryk/Desktop/IronLog/src/store/dashboardStore.ts), [auth.ts:71](/Users/patryk/Desktop/IronLog/src/lib/auth.ts:71). **Kategoria:** prywatność i asynchroniczny stan. **Ocena:** likely-broken. **Pewność:** High. **Pochodzenie:** Current execution + Static trace.

**Przyczyna:** odpowiedź jest sprawdzana tylko numerem requestu należącym do danej instancji komponentu. Unmount/zmiana użytkownika nie unieważnia go, a współdzielony snapshot nie ma właściciela UID.

**Dowód:** kontrolowana próba rzeczywistego komponentu React i store, z opóźnionym transportem, wykazała po zmianie konta `currentUid=B`, `dashboardReady=true` i identyfikator prywatnego treningu A. Reset store przy zmianie auth jest wykonywany, ale późniejszy callback może ponownie zapisać dane A. To próba z kontrolowanym harmonogramem odpowiedzi, nie obserwacja wycieku na produkcji.

**Wpływ:** dane treningowe poprzedniego użytkownika mogą pojawić się w nowej sesji przeglądarki. **Naprawa:** przed zapisem snapshotu sprawdzać aktualnego właściciela i ważność żądania po zmianie auth/unmount; objąć tym również dalsze odświeżenia po retry projekcji. **Bezpieczeństwo automatycznej poprawki:** With validation. Test: opóźnione A, reset, B, odpowiedź A; store nie może zawierać danych A.

### F03 · P2 — końcowy zapis przy opuszczeniu ekranu unieważnia się sam

**Lokalizacja:** [useActiveSession.ts:678](/Users/patryk/Desktop/IronLog/src/hooks/useActiveSession.ts:678), kolejka w linii 128. **Kategoria:** lifecycle komponentu i zapis. **Ocena:** likely-broken. **Pewność:** High. **Pochodzenie:** Current execution + Static trace.

**Przyczyna:** cleanup wywołuje `flushPendingSession()`, ale zaraz zwiększa generację. Zapis czekający w mikrozadaniu kolejki wykrywa następnie nieaktualną generację i rezygnuje.

**Dowód:** online zmieniono 5 na 9 powtórzeń i po około 51 ms kliknięto Historię, przed debounce 400 ms. Po 800 ms lokalny backup miał 9, wersja zdalna nadal 5. Źródło wyjaśnia dokładnie ten porządek operacji.

**Wpływ:** ostatnia edycja nie zostaje wysłana przy szybkiej nawigacji; F01 może później zamienić to w utratę danych. **Naprawa:** końcowy zapis powinien zachować właściwy UID, snapshot i rewizję oraz przeżyć cleanup swojej instancji, nadal respektując zmianę użytkownika i zamknięcie sesji. **Bezpieczeństwo automatycznej poprawki:** With validation. Odrębny test nawigacji przed debounce; nie usuwać wszystkich zabezpieczeń generacji.

### F04 · P2 — powrót do lokalnie zmienionej sesji wywołuje fałszywy konflikt

**Lokalizacja:** [useActiveSession.ts:419](/Users/patryk/Desktop/IronLog/src/hooks/useActiveSession.ts:419), `preserveLocalBaseRevision` w linii 513. **Kategoria:** kontrola wersji. **Ocena:** likely-broken. **Pewność:** High. **Pochodzenie:** Current execution + Static trace.

**Przyczyna:** rewizja bazowa jest zerowana przy ponownym montowaniu, podczas gdy aktywny trening może przetrwać w Zustand. Przy lokalnej różnicy kod celowo nie przyjmuje rewizji zdalnej, więc kolejny zapis wysyła `null` wobec istniejącej wersji.

**Dowód:** po próbie F03 kliknięto „Wznów trening”. Pozostało lokalne 9, a UI pokazał konflikt z innym urządzeniem mimo braku drugiego urządzenia. [Obraz](/Users/patryk/Desktop/IronLog/output/playwright/deep-audit-20260904/desktop-navigation-sync-conflict.png).

**Wpływ:** użytkownik dostaje błędny komunikat i blokadę synchronizacji. **Naprawa:** przechowywać rewizję bazową razem z odpowiadającym jej lokalnym stanem. Nie rozwiązywać przez bezwarunkowe przyjęcie najnowszej rewizji serwera, co mogłoby ukryć prawdziwy konflikt. **Bezpieczeństwo automatycznej poprawki:** With validation. Osobne testy remount oraz rzeczywistej równoległej edycji.

### F05 · P2 — potwierdzenie usunięcia może usunąć inne ćwiczenie po zmianie kolejności z serwera

**Lokalizacja:** [WorkoutPage.tsx:537](/Users/patryk/Desktop/IronLog/src/pages/WorkoutPage.tsx:537), potwierdzenie w linii 551. **Kategoria:** tożsamość elementów i synchronizacja. **Ocena:** likely-broken. **Pewność:** High. **Pochodzenie:** Static trace.

**Przyczyna:** dialog zapamiętuje indeks ćwiczenia zamiast jego tożsamości i tożsamości sesji.

**Dowód:** przy `[X,Y,Z]` otwarcie dialogu dla Y zapisuje indeks 1. Jeśli drugi klient usunie X, zdalna hydracja może podmienić listę na `[Y,Z]` przy nadal otwartym dialogu. Potwierdzenie usuwa bieżący indeks 1, czyli Z. Obsługa nie unieważnia dialogu przy takiej hydracji; usuwanie serii ma już mocniejsze zabezpieczenia tożsamości.

**Wpływ:** można usunąć niezamierzone ćwiczenie i wpisane serie. **Naprawa:** zapamiętać sessionId oraz clientId; po zmianie listy rozwiązać tożsamość albo anulować dialog. Jeśli hydracja nadaje nowe clientId, anulowanie jest bezpieczne. **Bezpieczeństwo automatycznej poprawki:** With validation. Kontrolowany test aktualizacji listy w otwartym dialogu.

### F06 · P2 — roczne Postępy liczą wyłącznie ostatnie 180 dni

**Lokalizacja:** [progressLoadService.ts:20](/Users/patryk/Desktop/IronLog/src/lib/progressLoadService.ts:20), query w linii 43; [ProgressPage.tsx:333](/Users/patryk/Desktop/IronLog/src/pages/ProgressPage.tsx:333). **Kategoria:** kompletność analityki. **Ocena:** likely-broken. **Pewność:** High. **Pochodzenie:** Current execution + Static trace.

**Przyczyna:** stałe okno pobierania 180 dni nie odpowiada zakresowi „Rok” i okresowi porównawczemu w UI. Zmiana filtra nie poszerza danych.

**Dowód:** utworzono 12 treningów: bieżący oraz sprzed 3, 5, 7, 10, 14, 21, 35, 65, 100, 200 i 400 dni. Historia dla roku pokazuje 11 treningów; Postępy dla roku 10. Trening sprzed 200 dni nie trafia do rocznej analityki. [Obraz](/Users/patryk/Desktop/IronLog/output/playwright/deep-audit-20260904/desktop-progress-year.png).

**Wpływ:** zaniżone sumy i błędne porównania są prezentowane jako kompletne. Limit liczby dokumentów i jego flaga nie opisują tego ukrytego obcięcia czasowego. **Naprawa:** pobierać zakres potrzebny wybranemu okresowi i porównaniu, zachowując istniejące limity i jawne oznaczenie niekompletności. **Bezpieczeństwo automatycznej poprawki:** With validation. Test danych starszych niż 180 dni oraz poprzedniego okresu.

### F07 · P2 — edytor planu ignoruje lbs i nie pokazuje jednostki ciężaru

**Lokalizacja:** [TemplateEditorPage.tsx:514](/Users/patryk/Desktop/IronLog/src/pages/TemplateEditorPage.tsx:514). **Kategoria:** jednostki i semantyka formularza. **Ocena:** likely-broken. **Pewność:** High. **Pochodzenie:** Current execution + Static trace + Repository contract.

**Przyczyna:** pole używa surowego `targetWeight` w kg bez konwersji z preferencji profilu i bez widocznej lub dostępnej etykiety jednostki.

**Dowód:** po ustawieniu profilu na lbs plan nadal pokazywał 80 dla wartości 80 kg, z etykietą „Ciężar startowy — Bench Press”. Ścieżka zapisu interpretuje wpisane 100 jako 100 kg; konsument treningu przelicza taki ciężar na około 220,5 lbs. Ten ostatni wynik wynika z prześledzonej konwersji, nie z osobnego pełnego startu treningu. [Obraz](/Users/patryk/Desktop/IronLog/output/playwright/deep-audit-20260904/desktop-template-lbs-profile.png).

**Wpływ:** użytkownik może zaplanować ponad dwukrotnie inny ciężar niż zamierzał. **Naprawa:** wykorzystać istniejące helpery jednostek i dodać jednostkę do etykiety; minimalna alternatywa to jawne kg, jeśli edytor ma celowo pozostać w kg. **Bezpieczeństwo automatycznej poprawki:** With validation. Round-trip kg/lbs bez zmiany wartości kanonicznej.

### F08 · P2 — desktopowe nagłówki edytora planu opisują niewłaściwe kolumny

**Lokalizacja:** [index.css:5874](/Users/patryk/Desktop/IronLog/src/index.css:5874), nagłówek w linii 5884; [TemplateEditorPage.tsx:450](/Users/patryk/Desktop/IronLog/src/pages/TemplateEditorPage.tsx:450). **Kategoria:** układ i czytelność danych. **Ocena:** likely-broken. **Pewność:** High. **Pochodzenie:** Current execution + Static trace.

**Przyczyna:** wiersz używa dwóch kolumn `.6fr/1fr` z zagnieżdżonymi trzema polami; nagłówek czterech kolumn `.6fr/1fr/1fr/1fr`. Ich geometria nie jest wspólna.

**Dowód:** przy 1440 px początki nagłówków Serie/Powt./Ciężar wynosiły około 212/511/809 px, a pól 441/663/885 px. „Powt.” wypada nad polem liczby serii. Lokalne etykiety są wizualnie ukryte, więc użytkownik polega na błędnym nagłówku. [Obraz](/Users/patryk/Desktop/IronLog/output/playwright/deep-audit-20260904/desktop-templates-audit-20260904-plan-edit-loaded.png).

**Wpływ:** pomyłki przy edycji planu mimo poprawnych nazw dostępności. **Naprawa:** wyrównać obie struktury do tych samych torów siatki; wykorzystać istniejący układ. **Bezpieczeństwo automatycznej poprawki:** Yes, z kontrolą obrazu desktop i regresji mobile. Nowa abstrakcja komponentowa nie jest potrzebna.

### F09 · P2 — błąd pobierania szczegółów jest pokazywany jako nieistniejący trening

**Lokalizacja:** [WorkoutDetailPage.tsx:149](/Users/patryk/Desktop/IronLog/src/pages/WorkoutDetailPage.tsx:149), ekran braku danych w linii 323. **Kategoria:** stany błędu. **Ocena:** likely-broken. **Pewność:** High. **Pochodzenie:** Current execution + Static trace.

**Przyczyna:** wyjątek kończy loading, ale nie tworzy odrębnego stanu błędu. Przy wejściu bez preview `workout` pozostaje null.

**Dowód:** kontrolowana próba komponentu z odrzuconym `getWorkout` doprowadziła do „Trening nie istnieje”. Krótkotrwały toast błędu nie zmienia trwałej treści ekranu, który nie ma ponowienia odczytu.

**Wpływ:** problem sieci wygląda jak utrata lub usunięcie treningu. **Naprawa:** rozdzielić błąd od potwierdzonego braku dokumentu, dodać ponowienie; zachować dostępne preview i odrębne recovery usuwania. **Bezpieczeństwo automatycznej poprawki:** Yes, z jednym testem błędu i odróżnienia null od reject.

### F10 · P2 — utrata odpowiedzi po rozpoczęciu usuwania może pozostawić rekordy bez dostępnej ścieżki wznowienia

**Lokalizacja:** [WorkoutDetailPage.tsx:256](/Users/patryk/Desktop/IronLog/src/pages/WorkoutDetailPage.tsx:256), [DashboardPage.tsx:411](/Users/patryk/Desktop/IronLog/src/pages/DashboardPage.tsx:411), [workoutProjection.ts:514](/Users/patryk/Desktop/IronLog/api/_lib/workoutProjection.ts:514). **Kategoria:** odzyskiwanie operacji. **Ocena:** likely-broken. **Pewność:** High. **Pochodzenie:** Current execution + Static trace.

**Przyczyna:** trwały zamiar usunięcia klient zapisuje dopiero po odebraniu odpowiedzi `cleanup_pending`, mimo że serwer wcześniej usuwa dokument kanoniczny.

**Dowód:** przerwanie backendu w `afterDeleteClaim` dało `cleanup_pending`, brak workoutu, jeden pozostały exerciseSession i istniejący record. Kontrolowany błąd transportu w klientach nie zapisuje recovery przy pierwszej próbie. Jeśli odpowiedź nie dotrze, po reload nie ma ani workoutu, ani lokalnego identyfikatora do cleanup. Próba backendowa i ścieżka klienta zostały sprawdzone osobno; nie symulowano awarii produkcyjnej funkcji.

**Wpływ:** historia i postępy mogą trwale się rozjechać, dopóki ktoś ręcznie nie ponowi usuwania znanego ID. **Naprawa:** utrwalić zamiar przed requestem, odróżnić wynik niepotwierdzony od potwierdzonego cleanup; czyścić po rozstrzygnięciu. **Bezpieczeństwo automatycznej poprawki:** With validation. Test utraty odpowiedzi po commit oraz skutecznego idempotentnego retry po reload.

### F11 · P2 — równoległa materializacja tej samej rewizji może zwrócić błąd po sukcesie

**Lokalizacja:** [workoutProjection.ts:313](/Users/patryk/Desktop/IronLog/api/_lib/workoutProjection.ts:313), propagowanie błędu w linii 444. **Kategoria:** idempotencja i współbieżność. **Ocena:** likely-broken. **Pewność:** High. **Pochodzenie:** Current execution + Static trace.

**Przyczyna:** guard oczekujący `pending` traktuje `ready` tej samej rewizji jako konflikt, również gdy tę rewizję właśnie poprawnie ukończyło drugie żądanie.

**Dowód:** na Firestore Emulator zatrzymano A przed zapisaniem exerciseSessions, B ukończyło tę samą rewizję, a wznowione A zwróciło HTTP 409 / `projection_state_conflict`; workout miał `materialized=true`. Istniejący test współbieżności z późniejszym checkpointem nie pokrywa tej kolejności.

**Wpływ:** UI może zgłosić błąd zapisu mimo poprawnie zakończonej operacji. **Naprawa:** rozpoznać już ukończoną tę samą rewizję jako sukces, zachowując rozróżnienie nowszej rewizji i usunięcia. **Bezpieczeństwo automatycznej poprawki:** With validation. Wykorzystać odtworzony harmonogram oraz istniejące testy superseded/deleted.

### F12 · P2 — powtórzone ćwiczenie w jednym treningu zawyża liczbę sesji i zaniża rekord objętości

**Lokalizacja:** [workoutProjection.ts:714](/Users/patryk/Desktop/IronLog/api/_lib/workoutProjection.ts:714), ID w linii 742, agregacja w linii 931; dodawanie w [workoutStore.ts:115](/Users/patryk/Desktop/IronLog/src/store/workoutStore.ts:115). **Kategoria:** materializacja i znaczenie metryk. **Ocena:** likely-broken. **Pewność:** High. **Pochodzenie:** Current execution + Static trace + Repository contract.

**Przyczyna:** projekcja odpowiada pozycji na liście, a agregacja traktuje każdą pozycję jako osobną sesję ćwiczenia. UI aktywnego treningu i edycji ukończonego pozwala dodać to samo ćwiczenie ponownie.

**Dowód:** dwa wpisy Bench Press po 80 × 5 w jednym workout dały dwie projekcje, `totalSessions=2`, `bestVolume=400`, przy łącznej objętości ćwiczenia w tym treningu 800. Edytor szablonu deduplikuje ćwiczenia; nie jest źródłem tego scenariusza.

**Wpływ:** błędne liczniki sesji i rekordy objętości w postępach i szczegółach ćwiczenia. **Naprawa:** agregować per workout + source + exerciseId przy budowaniu metryk/projekcji, zachowując kanoniczną kolejność wpisów treningu. Ustalić sposób przeliczenia istniejących danych. **Bezpieczeństwo automatycznej poprawki:** With validation; przeliczenie danych produkcyjnych wymaga osobnego, jawnego zakresu. Test duplikatu, usunięcia jednego wpisu i ponownej materializacji.

### F13 · P2 — klucz Claude jest współdzielony przez konta w tej samej przeglądarce

**Lokalizacja:** [aiKeyStorage.ts:1](/Users/patryk/Desktop/IronLog/src/lib/aiKeyStorage.ts:1), [auth.ts:58](/Users/patryk/Desktop/IronLog/src/lib/auth.ts:58). **Kategoria:** prywatność i przypisanie kosztu. **Ocena:** risky. **Pewność:** High. **Pochodzenie:** Current execution + Static trace.

**Przyczyna:** globalny klucz localStorage `ironlog.claudeApiKey` nie ma właściciela UID i pozostaje po wylogowaniu.

**Dowód:** konto A zapisało sztuczny klucz testowy, wylogowało się; zarejestrowano i skonfigurowano konto B. Coach B pokazał aktywne pole rozmowy i zapisany klucz; odczyt storage potwierdził dokładnie wartość A. [Obraz](/Users/patryk/Desktop/IronLog/output/playwright/deep-audit-20260904/desktop-shared-ai-key-account-b.png). Nie wykonano płatnej odpowiedzi. Problem wymaga wspólnego profilu przeglądarki, nie oznacza dostępu z innego urządzenia.

**Wpływ:** kolejne konto może używać klucza i budżetu poprzedniego użytkownika, a ustawienia pozwalają pracować z tą samą wartością. **Naprawa:** powiązać klucz z UID albo usuwać go przy wylogowaniu. Migracja starego wpisu nie może przypisać go przypadkowo kolejnemu kontu. **Bezpieczeństwo automatycznej poprawki:** With validation. Test A → logout → B i ponownego wejścia A.

### F14 · P2 — długa rozmowa przekracza limit body, choć model potrzebuje tylko końcówki

**Lokalizacja:** [chatService.ts:133](/Users/patryk/Desktop/IronLog/src/lib/chatService.ts:133), [ai-chat.ts:591](/Users/patryk/Desktop/IronLog/api/ai-chat.ts:591), sanitizacja w linii 102. **Kategoria:** kontrakt klient–API. **Ocena:** likely-broken. **Pewność:** High. **Pochodzenie:** Current execution + Static trace.

**Przyczyna:** klient wysyła całą historię. Limit body 128 KiB działa przed serwerowym ograniczeniem do ostatnich 12 wiadomości po maksymalnie 4000 znaków.

**Dowód:** lokalna próba serializacji rzeczywistej ścieżki `streamChatReply` dla 55 naprzemiennych wiadomości użytkownika/asystenta po 4000/1000 znaków dała 140 791 bajtów; ostatnie 12 wymagały 30 439 bajtów. Pierwsza wartość przekracza 131 072 bajty dopuszczalne przez parser.

**Wpływ:** kontynuacja lub ponowienie długiej rozmowy jest odrzucane przed właściwą obsługą. **Naprawa:** ograniczyć payload klienta zgodnie z kontraktem serwera, zachowując pełną historię w UI; limit serwera pozostawić. **Bezpieczeństwo automatycznej poprawki:** Yes, z testem rozmiaru i poprawnej końcówki wiadomości, również dla UTF-8.

### F15 · P2 — AI przedstawia częściowe 31 treningów jako pełną analizę 30 dni

**Lokalizacja:** [aiContextLoader.ts:65](/Users/patryk/Desktop/IronLog/api/_lib/aiContextLoader.ts:65), [aiContext.ts:267](/Users/patryk/Desktop/IronLog/server/aiContext.ts:267), agregacja w linii 355. **Kategoria:** wiarygodność kontekstu AI. **Ocena:** likely-broken. **Pewność:** High. **Pochodzenie:** Current execution + Static trace.

**Przyczyna:** limit 31 dokumentów nie niesie informacji o niekompletności do obliczeń i opisu całego okna 30 dni.

**Dowód:** kontrolowana próba kontekstu z 42 treningami co 12 godzin, każdy o objętości 500, przy celu 14 sesji tygodniowo dała 31 treningów / 15 500 zamiast 42 / 21 000 i pozornie słabszy trzeci tydzień. Źródło nadal miało status dostępnego. Scenariusz dotyczy więcej niż jednej sesji dziennie; nie zwykłych 3 treningów tygodniowo.

**Wpływ:** model dostaje liczby i tendencję sugerujące spadek aktywności, którego nie było. **Naprawa:** zachować budżet odczytów, ale przekazać granicę czasową i kompletność; nie formułować pełnych sum/trendów, jeśli zakres ucięto. Alternatywnie pobrać komplet badanego okresu w jawnym limicie. **Bezpieczeństwo automatycznej poprawki:** With validation. Test limitu i oznaczenia częściowych danych.

### F16 · P2 — spóźniony wygenerowany plan przełącza użytkownika z powrotem na zakładkę Plan

**Lokalizacja:** [ChatPage.tsx:430](/Users/patryk/Desktop/IronLog/src/pages/ChatPage.tsx:430). **Kategoria:** intencja użytkownika i stan async. **Ocena:** likely-broken. **Pewność:** High. **Pochodzenie:** Current execution + Static trace.

**Przyczyna:** zakończenie `generateTrainingPlan` zawsze wywołuje `setActiveTab('plan')`, niezależnie od późniejszych działań użytkownika.

**Dowód:** w kontrolowanej próbie komponentu rozpoczęto generowanie, przełączono na rozmowę, następnie rozwiązano promise. Zaznaczenie rozmowy zmieniło się z aktywnego na nieaktywne i wrócił Plan.

**Wpływ:** późna odpowiedź przerywa pracę w rozmowie. **Naprawa:** pokazać wynik bez nadpisywania późniejszego wyboru zakładki; zastosować istniejący wzorzec ważności żądania tam, gdzie potrzebny. **Bezpieczeństwo automatycznej poprawki:** Yes. Najmniejsza poprawka nie wymaga przebudowy Coacha; test zmiany zakładki podczas generowania.

### F17 · P2 — generowanie planu pobiera nieograniczony katalog własnych ćwiczeń

**Lokalizacja:** [ai-chat.ts:145](/Users/patryk/Desktop/IronLog/api/ai-chat.ts:145), użycie w linii 613. **Kategoria:** koszt odczytów i odporność API. **Ocena:** risky. **Pewność:** High dla mechanizmu; skala produkcyjna niezmierzona. **Pochodzenie:** Static trace.

**Przyczyna:** katalog własnych ćwiczeń jest pobierany bez limitu poza ograniczonym budżetem pozostałego kontekstu.

**Dowód:** owner CRUD pozwala użytkownikowi utworzyć wiele dokumentów; jedno żądanie planu odczytuje je wszystkie. Ta praca następuje przed zweryfikowaniem klucza przez Anthropic; lokalny warunek sprawdza tylko minimalną długość. Dla konta z 10 tys. ćwiczeń jedno żądanie oznacza około 10 tys. odczytów katalogu. To przykład skali wynikający z query, nie pomiar rzeczywistego konta.

**Wpływ:** konto z dużym katalogiem zwiększa koszty i czas obsługi mimo rate limitu liczby requestów. **Naprawa:** ograniczyć zakres katalogu potrzebnego dla danego planu i jawnie obsłużyć jego obcięcie; nie dodawać cache ani nowej bazy bez pomiarów. **Bezpieczeństwo automatycznej poprawki:** With validation. Test górnej granicy odczytów i poprawności wyboru ćwiczeń.

### F18 · P2 — skrypt zrzutów ekranu usuwa aktywną sesję przez Admin SDK

**Lokalizacja:** [capture-mockups.ts:240](/Users/patryk/Desktop/IronLog/scripts/capture-mockups.ts:240), wywołanie w linii 270. **Kategoria:** bezpieczeństwo narzędzi operacyjnych. **Ocena:** risky. **Pewność:** High. **Pochodzenie:** Static trace + Repository contract.

**Przyczyna:** `npm run mockups` ma ukryty efekt uboczny: `resetDemoActiveSession` usuwa sesję użytkownika demo z projektu wskazanego przez Admin SDK bez równoważnego sprawdzenia zgodności celu, które istnieje w skrypcie seedującym.

**Dowód:** sprawdzenie URL aplikacji nie wiąże go z projektem administracyjnym. Funkcja wykonuje bezpośrednie `delete`, ignoruje błąd i kontynuuje logowanie sukcesu. Nie uruchamiano tego skryptu w audycie.

**Wpływ:** polecenie sugerujące wykonanie obrazów może usunąć aktywny trening konta demo w niewłaściwym środowisku. **Naprawa:** usunąć tę mutację z capture albo przenieść przygotowanie do jawnej operacji wykorzystującej istniejący preflight celu. **Bezpieczeństwo automatycznej poprawki:** With validation. Sprawdzić dotychczasowy workflow materiałów demo; nie uruchamiać realnego usuwania jako testu.

### F19 · P3 — „Powt. max” oznacza powtórzenia najlepszego ciężaru, nie maksimum powtórzeń

**Lokalizacja:** [ExerciseDetailPage.tsx:241](/Users/patryk/Desktop/IronLog/src/pages/ExerciseDetailPage.tsx:241), kontrakt rekordu w [workoutProjection.ts:940](/Users/patryk/Desktop/IronLog/api/_lib/workoutProjection.ts:940). **Kategoria:** nazewnictwo metryk. **Ocena:** likely-broken. **Pewność:** High. **Pochodzenie:** Current execution + Static trace.

**Przyczyna:** etykieta sugeruje niezależne maksimum, ale `maxReps` należy do pary najlepszego wyniku wybranego przede wszystkim według ciężaru.

**Dowód:** zakończony trening Bench Press zawierał 80 × 5 i 60 × 12. Szczegóły pokazały „Powt. max” = 5. To poprawna liczba przy 80 kg, lecz nie maksymalna liczba powtórzeń. [Obraz](/Users/patryk/Desktop/IronLog/output/playwright/deep-audit-20260904/desktop-exercise-detail.png).

**Wpływ:** mylący odczyt rekordu. **Naprawa:** nazwać pole „Powtórzenia przy tym ciężarze” albo przedstawić parę 80 × 5. Zachować obecną semantykę rekordu backendowego. **Bezpieczeństwo automatycznej poprawki:** Yes; wystarczy poprawka treści i wizualne sprawdzenie miejsca.

### F20 · P3 — przykład konfiguracji nie opisuje wymagań serwerowego Firebase Admin

**Lokalizacja:** [.env.example](/Users/patryk/Desktop/IronLog/.env.example), [firebaseAdmin.ts:13](/Users/patryk/Desktop/IronLog/api/_lib/firebaseAdmin.ts:13), [README.md](/Users/patryk/Desktop/IronLog/README.md). **Kategoria:** dokumentacja uruchomienia. **Ocena:** cleanup. **Pewność:** High. **Pochodzenie:** Static trace + Repository contract.

**Przyczyna:** przykład opisuje zmienne klienta VITE, a uruchomienie pełnego backendu wymaga również konfiguracji Admin SDK albo ADC/emulatora.

**Dowód:** kod serwera korzysta z `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` lub alternatywnego mechanizmu credentials. Aktualna instrukcja nie prowadzi nowego developera przez kompletny lokalny backend.

**Wpływ:** świeża konfiguracja według samego przykładu może uruchomić web, lecz nie obsługę operacji serwerowych. Nie jest to dowód błędnej konfiguracji produkcji. **Naprawa:** opisać wariant emulatora i wymagania środowiska serwera, bez dodawania sekretów do repo. **Bezpieczeństwo automatycznej poprawki:** Yes. Sprawdzenie instrukcji na pustym lokalnym środowisku.

### F21 · P3 — błąd sieci Coacha pokazuje użytkownikowi produkcji instrukcje npm

**Lokalizacja:** [chatService.ts:139](/Users/patryk/Desktop/IronLog/src/lib/chatService.ts:139), analogicznie w linii 203. **Kategoria:** komunikat błędu. **Ocena:** likely-broken. **Pewność:** High. **Pochodzenie:** Static trace.

**Przyczyna:** ogólne odrzucenie `fetch` jest zawsze tłumaczone jako brak lokalnego endpointu, bez warunku środowiska.

**Dowód:** obie ścieżki catch tworzą komunikat zawierający `npm run dev:api`, `dev:web` i `dev:all`. Warunek deweloperski istniejący w innej gałęzi błędu nie obejmuje tych catch.

**Wpływ:** utrata sieci na wdrożonej aplikacji daje instrukcję, której użytkownik nie może wykonać. **Naprawa:** użyć komunikatu o połączeniu i ponowieniu dla produkcji, pozostawić wskazówkę uruchomieniową w development. **Bezpieczeństwo automatycznej poprawki:** Yes. Sprawdzenie dwóch wariantów środowiska, bez nowego systemu błędów.

## Frontend i UI — wynik przeglądu wizualnego

Trzy główne przyczyny problemów: **nieciągłość stanu operacji**, **rozbieżność znaczenia danych z ich etykietą lub zakresem** oraz **lokalne rozjechanie geometrii formularza**. To diagnoza wynikająca z obserwacji, a nie ogólna krytyka estetyki.

Zadania ekranów są czytelne: dashboard wskazuje bieżący lub kolejny trening, aktywna sesja służy wpisywaniu serii, historia odszukaniu sesji, postępy porównaniu wyników, edytor planu określeniu dni i obciążeń. W normalnym przebiegu wykonano trening, zaznaczono 4 serie i zakończono go przez API. Szczegóły poprawnie pokazały 4 serie, 30 powtórzeń i 2060 kg łącznej objętości.

| Stan i ekrany | Motyw / viewport | Obserwacja |
|---|---|---|
| Login, rejestracja, onboarding | Puls dark; mobile i przebieg rejestracji desktop | observed |
| Dashboard, Historia, Postępy, Plany, nowy plan, Ćwiczenia, Coach, Profil, nowa sesja — stany puste/początkowe | Puls dark; 393 × 852 i 1440 × 1000 | observed |
| Dashboard, Historia, Postępy z 12 treningami; plany i edytor 3-dniowego planu | Te same viewporty | observed |
| Aktywna sesja z danymi, zakończony trening, szczegóły ćwiczenia | Te same viewporty | observed |
| Edycja offline, powrót i konflikt synchronizacji | Mobile/desktop według konkretnej próby | observed |
| Profil lbs, roczny zakres postępów, konto B z zachowanym kluczem A | Desktop | observed |
| Fokus, kontrast i semantyka w wybranych ekranach | Chromium desktop/mobile, istniejące E2E + axe | observed w przetestowanym zakresie |
| Wszystkie błędy sieci dla wszystkich formularzy, każda kombinacja dialogu i zdalnej zmiany | Wszystkie viewporty | unobserved — wybrane przypadki pokryto źródłami/próbami kontrolowanymi |
| Fizyczna klawiatura iOS/Android, Safari, przełączanie aplikacji w telefonie | Realne urządzenia | unobserved |
| Rzeczywista długa odpowiedź Anthropic i jakość planu treningowego | Płatny dostawca | unobserved |
| Inne motywy | Brak wymaganego drugiego motywu w badanym produkcie | N/A |

| Kryterium refiner | Wynik | Obserwacja i ograniczenie |
|---|---|---|
| Dopasowanie do zadania | PASS w zwykłym przebiegu | Główne akcje prowadzą przez rzeczywisty trening i plan; lifecycle ma osobne błędy |
| Rozpoznawanie i skanowanie | PASS w próbce | Nazwy, dni planu i wyniki są rozróżnialne przy realistycznych danych |
| Hierarchia i kompozycja | WEAK | F08: nagłówki pól planu nie odpowiadają polom; pozostaje, bo tryb to audyt |
| Typografia i rytm treści | PASS w próbce | Obserwowana hierarchia Puls pozostaje spójna; nie stwierdzono potrzeby wymiany fontów |
| Kolor, motyw, kontrast | PASS w testowanych stanach | Testy kontrastu i dodatkowy axe nie zgłosiły naruszeń; nie obejmuje każdej kombinacji stanu |
| Gęstość i odstępy | WEAK do oceny przy dalszej pracy | Desktopowy trening szeroko rozsuwa elementy; to obserwacja kompozycji, bez osobnego błędu produktowego i priorytetu |
| Stany interakcji i feedback | BLOCK | Utrata backupu, fałszywy konflikt i mylne „nie istnieje” blokują ogólną akceptację niezawodności |
| Spójność z produktem | PASS w próbce | Używane są wspólne powierzchnie, kolory i wzorce nawigacji Puls |
| Generyczne dekoracje / AI-slop | PASS w próbce | Nie znaleziono dowodu uzasadniającego masowe usuwanie istniejącego języka wizualnego |

**Rekomendowana głębokość dalszych prac: lokalne poprawki i polish po naprawie przepływów.** Nie wystawiam ogólnego „UI zaliczone”: część problemów dotyczy tego, czy informacja na ekranie jest prawdziwa. Dobrze działającym detalem jest rozróżnienie i operacyjna prezentacja serii ukończonych; ich przygaszenie samo w sobie nie jest błędem edytowalności.

## Podejrzane elementy, które warto zachować lub sprawdzić później

Poniższe pozycje mają ocenę `probably-keep` i **nie mają priorytetu błędu**.

- Tombstones, rewizje projekcji, generacje i identyfikatory operacji chronią istotne granice lifecycle. Naprawy F01–F04/F11 nie uzasadniają ich usunięcia.
- `projection_pending` i `cleanup_pending` wyrażają rzeczywisty częściowy sukces. Problemem F10 jest odtworzenie zamiaru, nie samo istnienie stanów pośrednich.
- Zachowanie kluczy starych i nowych ćwiczeń podczas przeliczeń umożliwia sprzątnięcie poprzednich rekordów. Podobna logika może wyglądać redundantnie bez prześledzenia usunięć.
- `exerciseSource` i lokalne clientId są potrzebne. Tożsamość globalnego i własnego ćwiczenia oraz tożsamość pozycji UI nie są zamienne.
- Brak aktualnych metadanych usuniętego ćwiczenia użytkownika nie powinien kasować historycznego treningu. Historyczny fallback jest uzasadniony.
- `ChatMarkdown` używa HTML, ale sprawdzona ścieżka wcześniej escapuje dane i generuje kontrolowane tagi. Nie wykazano exploitu XSS; samo API renderowania HTML nie wystarcza do zgłoszenia podatności.
- Produkcyjna transakcja rate limitu jest uzasadniona. Testy adaptera pamięciowego nie zastępują testu rzeczywistej transakcji `consume`; to luka pokrycia, bez odtworzonego błędu limitera.
- Ograniczenia pobierania i flagi niekompletności są potrzebne. F06 i F15 dotyczą sytuacji, w których ograniczenie nie jest poprawnie opisane konsumentowi.
- Nieobecność zapisu klucza BYOK w bazie jest zaletą; problem F13 dotyczy przypisania lokalnego klucza do konta. Brak użycia dawnej kolekcji `dailyAiUsage` sam nie dowodzi błędu.
- `seed:exercises` pozostaje jawnie uruchamialnym poleceniem mimo statycznego katalogu w aplikacji. Nie uznano go za martwy kod wyłącznie na podstawie braku importów.
- Przeliczanie rekordów może drożeć z historią, lecz bez pomiaru większego konta nie ma podstaw do proponowania nowej architektury agregacji.
- Limit tokenów generowanego planu może wymagać sprawdzenia dla największych planów; nie wykonywano płatnych prób i nie zgłoszono obcięcia jako odtworzonego błędu.
- Przygaszone ukończone serie, przewijane poziomo filtry i stała dolna nawigacja mają uzasadnienie w stanie/układzie. Sam pełnostronicowy screenshot z nawigacją w środku obrazu nie dowodzi zasłaniania treści podczas korzystania.
- Historyczne raporty i obrazy w `output/*` nie zostały użyte jako dowód świeżego stanu. Nie zadeklarowano aktualności bibliotek, modeli ani braku CVE na podstawie lokalnego lockfile.

## Kolejność napraw

1. **Zapisy i izolacja kont:** F01–F04 oraz F13. Zabezpieczyć restart, szybką nawigację, rewizję i właściciela danych. To największy wpływ na zaufanie użytkownika.
2. **Spójność operacji i analityki:** F05, F10–F12, następnie F06/F15. Testować konkretne harmonogramy i częściowe wyniki, nie tylko happy path.
3. **Jednoznaczność UI:** F07–F09 i F19. Małe zmiany, bez wymiany systemu Puls.
4. **Coach i narzędzia:** F14, F16–F18, F20–F21. Ograniczyć payload/odczyty, respektować późniejszą intencję użytkownika i rozdzielić konfigurację od komunikatów produktowych.
5. **Uzgodnić testy E2E:** poprawić pięć rozbieżności kontraktów, ponowić dotknięte zestawy i dodać celowane regresje wykrytych błędów. Obecne zielone 637 testów nie obejmuje najważniejszych odtworzonych harmonogramów.

Najmniejszy sensowny plan to kilka wąskich poprawek wokół istniejących helperów i kontraktów. W tym audycie nie wdrożono żadnej z sugerowanych napraw. Pozostawiono raport, logi, obrazy i lokalne skrypty odtworzeniowe, aby kolejna praca miała konkretny punkt odniesienia.


## Status realizacji — 2026-09-05

**CLOSED w uzgodnionym zakresie lokalnym.** F01–F04 i F18 zamknięto w nocnym closeout (`ee9a592`, `72ac646`), a F05–F07, F09–F17 i F19–F21 w `8c06f2b` oraz `e2672dd`, scalonych do lokalnego `main`. F08 (desktop, duplikat UI01) jest jawnie odłożony na polecenie Patryka. Powyższe opisy zachowują historyczny stan sprzed napraw.

[Pełna macierz wykonania, testy, świeże dowody UI i ograniczenia](../../plans/2026-09-05-september-audits-closeout.md). Brak pushu/deployu i produkcyjnego backfillu. Historyczne projekcje F12 wymagają osobnej kontrolowanej materializacji przy wdrożeniu; stare klucze Claude bez UID wymagają ponownego wpisania po przyszłym wdrożeniu. Następny etap to zakres wdrożeniowy; desktop pozostaje deferred.
