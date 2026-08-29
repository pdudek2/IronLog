# IronLog 5C — final Product audit

**Werdykt:** `NEEDS REFINEMENT`  
**Blokery:** 0  
**Material:** 2  
**Polish:** 0 wymagających osobnego zadania  
**Zakres:** cała aktualna aplikacja, nie diff

IronLog jest już wizualnie spójnym, rozpoznawalnym produktem Puls. Końcowej bramki nie zamykam jednak na zielono: w świeżym runtime zostały dwa wąskie, realne naruszenia mierników roadmapy. Oba są małe implementacyjnie i powinny wejść jako jeden slice 5D, bez kolejnego redesignu.

## Co zachować

- Aktywny trening jest najczytelniejszą powierzchnią produktu: ma dobry rytm wpisów, jednoznaczne pola, stały timer i bezpieczny confirmation flow.
- Płaskie ledger surfaces, ograniczone obramowania i typografia Archivo/Instrument Sans tworzą własny język; aplikacja nie wygląda jak generyczny zestaw kart.
- Empty states, 404 i Coach bez klucza są uczciwe: nie udają danych ani aktywnej funkcji.
- Semantyczne effort/recovery/warning oraz kolory kategorii są rozdzielone wystarczająco, żeby nie mylić statusu z taksonomią.
- Mobilne listy, długie nazwy i 320 px nie powodują poziomego overflow; BottomNav nie zasłania głównych akcji.
- AI-slop: `PASS`. Brak dekoracyjnych insightów bez znaczenia, przypadkowego bento, fałszywych cytatów, nadmiarowych gradientów i tekstów „marketingowego asystenta”. Pozostała ekspresja jest funkcjonalna lub brandowa.

## Priorytetyzowane findings

### M-5C-01 — dwa mobilne hitboxy dashboardu nie osiągają 44 px

- **Klasa:** `MATERIAL` · accessibility/interaction · depth `polish`
- **Claim:** `OBSERVED`, następnie `SOURCE-CONFIRMED`
- **Stan:** zalogowany dashboard z wypełnionym tygodniem, 320×844 i 393×852.
- **Dowód runtime:** `dashboard-touch-targets-320.jpg`, `dashboard-touch-targets-393.jpg`.
- **Pomiar:** przycisk serii treningowej ma `50×32,69 px`; `Zobacz progres` ma `288×22 px` przy 320 i `361×22 px` przy 393.
- **Przyczyna:** `.streak-pill` ma tylko pionowy padding `0.35rem` i brak `min-height`; CTA tygodnia używa `puls-link-button px-0 py-0`, także bez `mobile-touch-target`.
- **Konsekwencja:** szeroki link progresu jest łatwiejszy do trafienia niż wskazuje sama wysokość, ale oba cele łamią jawny standard roadmapy 44×44 i są odstępstwem od pozostałych tras, gdzie audyt geometrii nie znalazł innych widocznych celów poniżej 44 px.
- **Rekomendacja:** rozszerzyć niewidzialny hit area/min-height do 44 px bez podnoszenia wizualnego nacisku; użyć istniejącego `mobile-touch-target`.

### M-5C-02 — istotne etykiety w dwóch gęstych powierzchniach nadal schodzą poniżej 12 px

- **Klasa:** `MATERIAL` · readability/system consistency · depth `system`
- **Claim:** `OBSERVED`, następnie `SOURCE-CONFIRMED`
- **Stan:** edycja wypełnionego planu przy 393×852 oraz aktywny trening przy 320×844.
- **Dowód runtime:** `template-edit-operational-labels-393.jpg`, `workout-active-operational-labels-320.jpg`.
- **Pomiar:** edytor planu: `Nazwa` i `Dzień 1` = `11,2 px`, kolumny `Serie / Powt. / Ciężar` = `10,56 px`; aktywny trening: nagłówki `# / kg / Powt. / Obj.` = `10,88 px`, wartości objętości = `11,52 px`.
- **Przyczyna:** mobilne, route-specific reguły CSS nadal ustawiają `0.66–0.72rem`, mimo że 5B podniósł wcześniej wybrane etykiety JSX i współdzielone kickery.
- **Konsekwencja:** to nie jest problem całej drobnej metadanej. Dotyczy jednak informacji potrzebnej podczas wpisywania planu i prowadzenia serii, więc pozostawienie jej poniżej ustalonego minimum 12 px utrudnia szybki skan w najbardziej operacyjnych ekranach.
- **Rekomendacja:** podnieść wyłącznie operacyjne selektory do obliczonych 12 px; nie ruszać heatmapy, taksonomii ćwiczeń i innych dekoracyjnych/supporting metadanych.

## Rubryka

| Kategoria | Ocena | Uzasadnienie |
| --- | --- | --- |
| Task completion | PASS | Główne przepływy i recovery są jednoznaczne; 0 blockerów. |
| Hierarchy | PASS | Reprezentacyjne hero i gęste workbench surfaces mają właściwy poziom ekspresji. |
| Layout/responsiveness | PASS | 320/393/1024/1440 bez overflow i bez kolizji fixed UI. |
| Typography/readability | MATERIAL | Dwa operacyjne konteksty pozostają poniżej 12 px. |
| Interaction/accessibility | MATERIAL | Dwa dashboardowe hitboxy pozostają poniżej 44 px. |
| Color/semantics | PASS | Status i kategorie nie zmieniają znaczenia między trasami. |
| States/feedback | PASS | Empty, locked, active, destructive i focus states są czytelne. |
| Consistency | PASS z lokalnym wyjątkiem | Wzorzec Puls jest spójny; wyjątki są ograniczone do dwóch starych reguł mobilnych. |
| AI slop / app-screen refinement | PASS | UI jest produktowe, oszczędne i zadaniowe; brak generycznych ozdobników wymagających kolejnego passu. |

## Wzorzec systemowy

Pozostały dług nie wynika z nowej architektury ani z komponentów. To dwa lokalne wyjątki CSS, które omijają istniejące utility i zaakceptowane progi: dashboard omija `mobile-touch-target`, a route-specific mikrotekst omija 12 px floor. Najmniejsza poprawka jest więc właściwa także systemowo.

## Następny slice: 5D — mobile touch/readability closure

1. Dashboard: 44 px hit area dla streak i `Zobacz progres`, bez zmiany hierarchii wizualnej.
2. Template editor i active workout: obliczone >=12 px tylko dla etykiet/wartości operacyjnych wskazanych powyżej.
3. Jeden test geometrii dla obu dashboardowych kontrolek oraz jeden computed-font contract obejmujący edytor planu i trening przy 320/393.
4. Ponowna obserwacja tylko tych czterech stanów; jeśli przejdą, Etap 5 można zamknąć bez kolejnego pełnego Product audytu.

## Weryfikacja techniczna

- `npm run test:unit`: 74 pliki, 602 testy passed na końcowym tree pod bundled Node 22.23.1.
- Playwright `accessibility + contrast + mobile-ergonomics + protected-shell`, desktop/mobile: 40 passed, 17 conditional skips, 0 failed.
- `npm run lint`: passed.
- `npm run build`: passed.
- Browser console w całej obserwowanej sesji: 0 warningów, 0 errorów.
- `npm audit`: 18 istniejących podatności zależności/toolingu; nie użyto `audit fix` i nie wpływa to na wizualny werdykt.
- Tooling note: pierwszy końcowy run pod hostowym Node `25.6.1` upadł przed asercjami (`localStorage.clear is not a function` przez nieprawidłowy wbudowany web storage). Ten sam, niezmieniony tree uruchomiony kanonicznym bundled Node `22.23.1` przeszedł 74/74 pliki i 602/602 testy; nie klasyfikowano tego jako defekt produktu.

## Niepewności i wyłączenia

- Nie oceniano odpowiedzi modelu AI ani skonfigurowanego klucza; audyt objął stan bez klucza zgodnie z aktualnym produktem.
- B-02, M-07 i M-14 pozostają decyzjami produktowymi, nie defektami 5C.
- Full-page screenshoty mogą powtarzać fixed BottomNav w wyniku stitchingu. Zwykłe viewport screenshots potwierdziły, że runtime nie duplikuje nawigacji.

Pełna macierz tras i stanów: [coverage-ledger.md](./coverage-ledger.md).
