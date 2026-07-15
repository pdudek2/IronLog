# IronLog — projekt Fazy 4: ergonomia mobile i edytor planów

**Status:** wdrożona i zweryfikowana

**Data:** 2026-07-14

**Zakres roadmapy:** `MOBILE-01`, `MOBILE-02`, `MOBILE-03`, `MOBILE-04`, `MOBILE-05`, `MOBILE-06`

**Route:** Medium — ograniczony pakiet widocznego zachowania obejmujący wspólny shell, edytor planu, aktywny trening i router

**Ryzyko:** Elevated — możliwość utraty niezapisanych zmian w planie; brak migracji danych i zmian Firestore

## 1. Cel

Faza 4 zapewnia przewidywalną i bezpieczną obsługę najczęstszych akcji mobilnych bez zmiany kierunku wizualnego Puls.

Po wdrożeniu:

- samodzielne kontrolki mobilne mają efektywny target dotykowy co najmniej 44×44 px;
- zapis planu pozostaje stale dostępny, także w długim planie i przy otwartej klawiaturze;
- opuszczenie edytora z niezapisanymi zmianami wymaga świadomego potwierdzenia;
- rest timer nie zasłania aktywnego pola po zmniejszeniu `visualViewport`;
- układ zachowuje użyteczność przy szerokościach 320, 375 i 390 px oraz tekście powiększonym do 150%;
- dolna nawigacja, docki, safe-area i aktywne pola korzystają ze spójnego kontraktu geometrii.

## 2. Pochodzenie zakresu

Faza nie wynika z audytu `docs/audits/2026-07-14-senior-design-review.md`. Ten audyt pozostaje odłożony i nie rozszerza bieżącego zakresu.

Źródłem Fazy 4 są wcześniejsze ustalenia kanonicznej roadmapy:

- `MOBILE-01` mapuje wcześniejsze `ASR-UI-04` dotyczące zbyt małych celów dotykowych;
- `MOBILE-02` mapuje wcześniejsze `ASR-UI-05` dotyczące zapisu dużego planu dopiero na końcu strony;
- `MOBILE-03–05` były hipotezami `FOLLOWUP-UI-01–03` zapisanymi podczas wcześniejszej syntezy roadmapy;
- `MOBILE-06` jest bramką walidacji długich widoków na telefonie.

## 3. Potwierdzony stan obecny

Walidację wykonano na localhost przez Playwright na testowym koncie. Duży plan został dostarczony przez jednorazowy draft w `sessionStorage`; nie tworzono szablonu w Firestore. Testową aktywną sesję treningową utworzoną do sprawdzenia rest timera anulowano po reprodukcji.

| ID | Dowód runtime | Wynik |
|---|---|---|
| `MOBILE-01` | close pickera ma 32×32 px; usuwanie ćwiczenia około 36,8×36,8 px; część akcji 39–42 px; elementy dolnej nawigacji przy 320 px mają miejscami tylko 22–45 px szerokości | `confirmed` |
| `MOBILE-02` | plan `Upper / Lower 4×` ma 9352–9423 px wysokości; przycisk zapisu zaczyna się około 9050–9121 px od góry | `confirmed` |
| `MOBILE-03` | po skupieniu pola i zmniejszeniu viewportu z 844 do 500 px zapis pozostaje poza widokiem; obecny sticky element nie jest stałą akcją, ponieważ występuje dopiero na końcu formularza | `confirmed` |
| `MOBILE-04` | dolna nawigacja poprawnie staje się `inert` po skupieniu inputu, ale fixed rest timer pozostaje na dole; przy wysokości 500 px nachodzi na aktywne pole o około 164–208 px | `confirmed` |
| `MOBILE-05` | zmiana nazwy planu i kliknięcie „Start” w dolnej nawigacji prowadzi bez dialogu do `/dashboard`; istniejący guard obejmuje tylko własne „Wróć” i `beforeunload` | `confirmed` |
| `MOBILE-06` | przy 320/375/390 px nie wystąpił poziomy overflow, ale tekst 150% zwiększył wysokość dużego planu do około 14 009 px i nie rozwiązał niedostępnego zapisu | `confirmed` jako wymagana bramka regresyjna |

## 4. Zakres i granice

### 4.1 W zakresie

1. cienki wspólny kontrakt fokusu mobilnego i `visualViewport` w chronionym shellu;
2. stale widoczny dock zapisu edytora planu;
3. blokowanie każdej nawigacji z edytora, jeżeli formularz ma niezapisane zmiany;
4. oficjalne wsparcie blokowania nawigacji przez React Router;
5. pełny i kompaktowy wariant rest timera;
6. koordynacja fixed elementów, scroll paddingu i safe-area;
7. efektywne targety 44×44 px dla objętych kontrolek mobilnych;
8. automatyczne i ręczne testy geometrii przy 320/375/390 px, tekście 150% i zmniejszonym viewportcie.

### 4.2 Poza zakresem

- aktywna sesja treningowa nie otrzymuje ostrzeżenia przy zwykłej zmianie zakładki; jest zapisywana na bieżąco w `activeSessions`;
- backend, funkcje Vercel, Firestore, reguły i model danych;
- nowy model informacji lub usuwanie pozycji z dolnej nawigacji;
- globalny menedżer overlayów;
- zmiana kierunku wizualnego Puls;
- feedback asynchroniczny, copy i regresja wizualna należące do Fazy 5;
- kontrast, profil, root redirect, sygnatura marki i pozostałe ustalenia z audytu senior design review;
- pełny audyt responsywności całej aplikacji poza objętymi powierzchniami.

## 5. Wybrany kierunek

Wybrano cienki wspólny kontrakt mobile z lokalnymi komponentami.

Wspólna warstwa publikuje jedynie stan interakcji i geometrię. Nie rejestruje overlayów i nie przejmuje logiki produktu. Edytor planu nadal odpowiada za swój formularz i zapis, `WorkoutPage` nadal odpowiada za timer, a `BottomNav` nadal odpowiada za ukrywanie podczas scrollowania.

### 5.1 Odrzucone warianty

1. **Lokalne listenery i offsety na każdej stronie.** Mniejszy początkowy diff, ale powiela logikę i utrwala możliwość rozjazdu navu, docka i timera.
2. **Globalny menedżer overlayów.** Rozwiązałby szerszy, niepotwierdzony problem i byłby nieproporcjonalny do zakresu projektu.
3. **Zapis w sticky nagłówku.** Na 320 px konkuruje z tytułem, statystykami i akcją powrotu.
4. **Pływający przycisk zapisu.** Ma mniej jednoznaczny status i trudniej go skoordynować z klawiaturą oraz dolną nawigacją.
5. **Ukrywanie rest timera podczas pisania.** Usuwa konflikt przestrzenny, ale pozbawia użytkownika podglądu odliczania.
6. **Pełny rest timer nad klawiaturą.** Na niskim viewportcie zajmuje zbyt dużą część przestrzeni roboczej.
7. **Własna obsługa `popstate`.** Jest krucha wobec historii SPA; oficjalny blocker routera zapewnia jawny kontrakt `proceed/reset`.

## 6. Wspólny kontrakt mobile

Provider umieszczony w `AppLayout` obserwuje:

- `focusin` i `focusout` dla `input`, `textarea`, `select` i elementów `contenteditable`;
- `visualViewport.resize` i `visualViewport.scroll`, jeśli API jest dostępne;
- `window.resize` jako fallback;
- zmianę trasy wymagającą zresetowania nieaktualnego stanu fokusu.

Provider publikuje co najmniej:

- czy element edytowalny ma fokus;
- wysokość i offset `visualViewport`;
- różnicę między layout viewportem i visual viewportem;
- deterministyczny sygnał kompaktowego trybu dla elementów fixed;
- zmienne CSS potrzebne do pozycjonowania względem dolnej krawędzi visual viewportu.

Provider nie przechowuje wartości pól, stanu zapisu, stanu timera ani decyzji o nawigacji.

`BottomNav` korzysta ze wspólnego stanu fokusu zamiast utrzymywać drugi zestaw globalnych listenerów. Jego istniejące ukrywanie przy scrollowaniu pozostaje lokalne. Kontrakt `inert`, `aria-hidden`, transfer fokusu i brak pointer events z Fazy 3 musi pozostać zachowany.

Jeżeli `visualViewport` nie istnieje, system korzysta z `window.innerHeight`, stanu fokusu i offsetów CSS. Brak API nie może blokować zapisu ani treningu.

## 7. Kontrakt docka zapisu planu

Na mobile edytor renderuje jeden stale widoczny `TemplateSaveDock` nad dolną nawigacją. Wybrany wariant to dock pełnej dostępnej szerokości, nie przycisk w nagłówku ani floating action button.

Dock ma cztery stany:

| Stan | Widoczna treść | Interakcja |
|---|---|---|
| clean | „Zapisano” | przycisk nie uruchamia requestu |
| dirty | „Zapisz szablon” albo „Zapisz zmiany” | uruchamia istniejący submit |
| saving | „Zapisuję…” | drugi submit jest zablokowany |
| error | ponownie aktywne „Zapisz…” | formularz i dirty state pozostają zachowane |

Dock nie przechowuje kopii formularza. Otrzymuje stan z istniejącego `savedSnapshot`, `hasUnsavedChanges` i `saving`.

Draft zaimportowany z AI nie jest jeszcze zapisanym szablonem: jego bazowy snapshot pozostaje pusty, więc od pierwszego renderu ma stan dirty i aktywną akcję „Zapisz szablon”. Stan clean wolno pokazać dopiero dla pustego, niezmienionego formularza create albo danych rzeczywiście wczytanych/zapisanych w Firestore.

Gdy dolna nawigacja jest widoczna, dock znajduje się nad nią z uwzględnieniem safe-area. Gdy input ma fokus i nav się chowa, dock ustawia się przy dolnej krawędzi aktualnego `visualViewport`. Formularz otrzymuje dynamiczny scroll padding równy wysokości docka i wymaganym odstępom, aby aktywne pole mogło zostać przewinięte ponad dock.

Desktop zachowuje istniejącą akcję zapisu w układzie edytora; Faza nie dokłada stałego docka na dużych ekranach.

## 8. Kontrakt niezapisanych zmian

Guard działa wyłącznie w edytorze planu i tylko wtedy, gdy istnieją niezapisane zmiany lub trwa request zapisu.

Obejmuje:

- przycisk „Wróć”;
- `BottomNav` i `TopNav`;
- inne programowe nawigacje SPA;
- browser back/forward;
- odświeżenie i zamknięcie karty.

Nawigacje SPA i wpisy historii używają oficjalnego blockera React Routera. Odświeżenie i zamknięcie karty pozostają chronione przez `beforeunload`, ponieważ przeglądarki kontrolują treść tego komunikatu.

Obecny `BrowserRouter` nie udostępnia `useBlocker`. Bootstrap routera zostaje przełączony na oficjalny Data Router oparty na `createBrowserRouter` i `RouterProvider`, przy zachowaniu:

- wszystkich obecnych ścieżek;
- publicznych i prywatnych outletów;
- lazy loadingu stron;
- `RouteScrollReset`;
- pojedynczej instancji `AppLayout`, `TopNav` i `BottomNav` dla chronionych tras.

Zmiana routera jest wewnętrzna i nie zmienia URL-i ani modelu produktu.

Gdy blocker zatrzyma nawigację, istniejący `ConfirmDialog` pokazuje:

- „Opuść bez zapisu” — wywołuje `proceed` dla dokładnie zatrzymanej nawigacji;
- „Zostań” — wywołuje `reset` i zachowuje formularz.

Podczas zapisu próba wyjścia nie może uruchomić `proceed`. Użytkownik pozostaje w edytorze do sukcesu albo błędu requestu. Po sukcesie implementacja najpierw aktualizuje zapisany snapshot i wyłącza guard, a dopiero potem przechodzi do listy planów. Po błędzie requestu dane pozostają, stan wraca do dirty, a zapis można ponowić.

## 9. Kontrakt rest timera i aktywnego pola

Rest timer nadal jest jednym logicznym timerem opartym na stanie `WorkoutPage`. Faza zmienia wyłącznie prezentację.

### 9.1 Tryb pełny

Bez skupionego inputu i bez istotnego zmniejszenia viewportu timer pozostaje pełnym panelem nad dolną nawigacją. Obowiązuje brak przecięcia geometrycznego z navem i safe-area.

### 9.2 Tryb kompaktowy

Po skupieniu pola lub wykryciu zmniejszonego `visualViewport` pełny panel zwija się do jednego wiersza pod mobilnym paskiem lifecycle. Wiersz zawiera:

- etykietę „Odpoczynek”;
- pozostały czas;
- akcję „Pomiń”.

Akcja dodania czasu pozostaje wyłącznie w pełnym wariancie. Timer nadal odlicza i zachowuje sygnał zakończenia.

Treść treningu otrzymuje odpowiedni scroll padding i scroll margin od góry oraz dołu. Po fokusie aktywne pole musi znaleźć się w wolnym obszarze między lifecycle/kompaktowym timerem a dolną krawędzią `visualViewport`. Zamknięcie klawiatury przywraca pełny timer bez resetowania czasu.

## 10. Kontrakt targetów dotykowych

Na objętych powierzchniach każdy samodzielny element interaktywny na mobile ma efektywny obszar co najmniej 44×44 px.

Dotyczy to co najmniej:

- wszystkich pozycji `BottomNav`, w tym centralnej akcji treningu;
- ikonowych akcji usuwania ćwiczeń;
- zamknięcia `ExercisePicker`;
- dodawania/usuwania dnia i ćwiczenia;
- zapisu planu;
- głównych filtrów i chipów wyboru;
- akcji rest timera.

Kontrolka może mieć wizualnie mniejszą powierzchnię, jeżeli jej rzeczywisty hitbox ma minimum 44×44 px, nie nachodzi na sąsiedni hitbox i zachowuje czytelny focus ring.

Na 320 px dolna nawigacja może zmniejszyć zewnętrzne marginesy, padding panelu i odstępy wewnętrzne, aby zachować wszystkie pozycje bez poziomego scrolla. Faza nie usuwa ani nie przenosi zakładek do menu „Więcej”.

## 11. Strategia testów

### 11.1 Testy jednostkowe i komponentowe

- provider publikuje poprawny stan po `focusin/focusout`, zmianie viewportu i bez dostępnego `visualViewport`;
- `TemplateSaveDock` renderuje stany clean, dirty, saving i error bez własnej kopii formularza;
- guard blokuje nawigację tylko przy dirty/saving i poprawnie rozróżnia `proceed/reset`;
- udany zapis wyłącza guard przed nawigacją, a błąd zachowuje formularz;
- rest timer przełącza `full → compact → full` bez resetowania czasu;
- istniejące kontrakty `BottomNav` z Fazy 3 pozostają zachowane.

### 11.2 Testy routera

Po przejściu na Data Router smoke obejmuje wszystkie publiczne i prywatne trasy, redirecty auth, lazy loading oraz scroll reset. Test musi wykazać, że chroniony shell nadal montuje jedną instancję górnej i dolnej nawigacji.

### 11.3 Playwright i geometria mobile

Deterministyczny scenariusz dużego planu używa draftu `Upper / Lower 4×` z czterema dniami i 24 ćwiczeniami. Nie zapisuje go do Firestore, jeżeli celem testu jest wyłącznie geometria.

Testy wykonują się przy:

- 320×844 px;
- 375×844 px;
- 390×844 px;
- tekście 150% na 320 px;
- kontrolowanym zmniejszeniu wysokości viewportu z aktywnym inputem.

Assercje obejmują:

- brak poziomego overflow;
- stałą widoczność docka zapisu;
- brak przecięcia aktywnego pola z dockiem lub timerem;
- brak przecięcia pełnego timera z dolną nawigacją;
- przejście timera do kompaktowego wariantu;
- efektywne wymiary targetów minimum 44×44 px;
- dialog przy `BottomNav`, „Wróć” i browser back;
- brak dialogu po zapisie lub bez zmian.

Scenariusz rest timera korzysta z izolowanego konta/emulatora i sprząta utworzoną aktywną sesję również po błędzie testu.

### 11.4 Bramka regresyjna

Przed zamknięciem fazy przechodzą:

- ukierunkowane testy Fazy 4;
- istniejące testy `templates`, `workout-mobile`, `accessibility`, `smoke` i `protected-shell`;
- pełne `npm run test:unit`, `npm run lint` oraz `npm run build`;
- runtime Playwright na testowym koncie z porównaniem geometrii do tabeli z sekcji 3.

## 12. Kryteria akceptacji

Faza jest zakończona, gdy:

1. użytkownik może zmienić nazwę na początku planu i zapisać bez przewijania do końca dokumentu;
2. dock pozostaje widoczny przy klawiaturze i nie zasłania aktywnego pola;
3. wszystkie objęte targety mobilne mają efektywny wymiar co najmniej 44×44 px;
4. każda próba opuszczenia dirty edytora jest blokowana, a czysty edytor nie pokazuje ostrzeżenia;
5. nawigacja podczas zapisu nie prowadzi do podwójnego submitu ani niejednoznacznego wyniku;
6. rest timer nie nachodzi na input przy zmniejszonym viewportcie i wraca do pełnego trybu po zakończeniu edycji;
7. brak poziomego overflow przy 320/375/390 px i tekście 150%;
8. wszystkie trasy i kontrakty accessibility działają po zmianie routera;
9. senior design review pozostaje poza zakresem i nie powoduje dodatkowych zmian wizualnych.

## 13. Recovery i wdrożenie

Faza nie zmienia danych trwałych, schematu Firestore ani API. Nie wymaga migracji, compatibility layer ani feature flaga. W razie regresji zwykły revert commitów Fazy 4 przywraca poprzednie zachowanie.

Zmiana routera i guard są wdrażane oraz testowane przed komponentami zależnymi. Jeżeli podczas implementacji oficjalny blocker wymusi większą zmianę routingu niż opisana w sekcji 8, praca zatrzymuje się do ponownej klasyfikacji zakresu zamiast dodawania własnego systemu historii.

## 14. Następny etap

Szczegółowy plan implementacji znajduje się w `docs/roadmap/plans/2026-07-14-phase-4-mobile-ergonomics-template-editor.md`. Implementacja rozpoczyna się dopiero po wyborze trybu wykonania i użyciu `superpowers:subagent-driven-development` albo `superpowers:executing-plans`.
