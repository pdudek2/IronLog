# Phase 7A — Local release gate

**Status:** IN PROGRESS

**Data:** 2026-07-23

**Commit bazowy:** `fdc7c9ddf70938364bb30e4ce091019bd9131f63`

## Zakres

7A obejmuje automatyczne gate'y lokalne na emulatorach. Nie obejmuje manualnego odbioru desktop/mobile, prywatnego live E2E, pushu, deployu, publikacji reguł i indeksów, produkcyjnego CSP ani produkcyjnego pomiaru dashboardu.

## Środowisko

- Node: `v25.6.1`
- npm: `11.9.0`
- Firebase CLI: `15.15.0`
- Playwright: `1.59.1`
- Backend: Auth + Firestore emulators, projekt `demo-ironlog`
- Retry: `0`
- Playwright inventory: 215 testów w 23 plikach dla projektów desktop i mobile

## Macierz wyników

| Gate | Wynik | Liczba | Uwagi |
| --- | --- | ---: | --- |
| Unit | PASS | 59 plików, 468 testów | `npm run test:unit` |
| Lint | PASS | 0 błędów | `npm run lint` |
| Build | PASS | 878 modułów | `npm run build`; bez ostrzeżeń |
| Firestore Rules | PASS | 1 plik, 16 testów | `npm run test:rules`; `demo-ironlog` |
| Workout integration | PASS | 2 pliki, 20 testów | `npm run test:integration:workout`; emulator Firestore |
| Full Playwright desktop+mobile | PENDING | 215 listed | emulatory + preview + CSP |

## Znaleziska i poprawki

Core gate'y nie ujawniły błędów wymagających poprawki.

Pierwsze wywołanie pełnego gate'u zatrzymało się przed uruchomieniem testów z kodem `127`: bezpośredni shell Firebase nie miał `node_modules/.bin` w `PATH`, więc komenda `playwright` nie istniała. Istniejący repozytoryjny wzorzec dla bezpośrednich wywołań używa `npx playwright`; plan skorygowano bez zmiany aplikacji, konfiguracji ani testów.

Pierwszy właściwy przebieg pełnego gate'u ujawnił nieaktualny selektor w teście diagnostycznym widoku ćwiczenia. Strona poprawnie wyrenderowała 36 ćwiczeń globalnych jako natywne elementy `<button>`, natomiast test szukał wyłącznie literalnego atrybutu `[role="button"]`. Selektor zmieniono na dostępnościowy `getByRole('button', { name: /^Otwórz ćwiczenie / })`, nadal ograniczony do sekcji „Katalog globalny”; kod produktu pozostał bez zmian.

Kolejny przebieg zatrzymał się na testach Progress. Testy zakładały dane istniejące wcześniej w koncie, czego świeży emulator celowo nie zapewniał, a scenariusz celowego odłączenia sieci nie oznaczał oczekiwanych błędów transportu Firestore w centralnym kolektorze diagnostyk. Dodano izolowany seed i cleanup wyłącznie dla emulatora oraz wykorzystano istniejący kontrakt oczekiwanych diagnostyk offline. Dane produkcyjne i kod aplikacji pozostały bez zmian.

Następny przebieg wykazał, że test prefetchu Progress rozpoznawał wyłącznie ścieżkę modułu serwera deweloperskiego (`/src/pages/ProgressPage.tsx`). Gate CSP korzysta z produkcyjnego preview, gdzie ten sam moduł jest chunkiem `/assets/ProgressPage-<hash>.js`. Matcher rozszerzono o produkcyjną nazwę chunka bez osłabienia kontraktu „brak requestu przed intencją, request po hover”.

Scenariusz celowego offline przy uruchamianiu szablonu wywołał transportowy fallback Firestore do `google.com/images/cleardot.gif`. Minimalny `img-src 'self' data:` poprawnie zablokował beacon, ale matcher oczekiwanych diagnostyk znał tylko wariant `ERR_INTERNET_DISCONNECTED`, nie wariant `csp`. Matcher zawężono do dokładnego URL-a beacona i dokładnego komunikatu tej dyrektywy; polityka CSP nie została poluzowana.

Grupa testów guard i lost-ack ujawniła dwa dalsze założenia trybu deweloperskiego. Kolektor diagnostyk rozpoznawał przerywane podczas intencjonalnej nawigacji moduły `/src`, ale nie lokalne hashowane chunki produkcyjne `/assets/*-<hash>.js`; wyjątek rozszerzono wyłącznie na takie chunki, wyłącznie dla `ERR_ABORTED` w oknie nawigacji/teardown. Matcher kontrolowanej utraty odpowiedzi API akceptował tylko `localhost:5174`; dodano równoważny lokalny origin preview `127.0.0.1:5174`. Inne originy, niehashowane zasoby i błędy inne niż oczekiwane pozostają blokujące.

Dwa scenariusze ochrony sesji offline importowały pomocniczy moduł TypeScript bezpośrednio spod `/tests/...`. Vite dev transformował tę ścieżkę, ale produkcyjny preview poprawnie serwował tylko `dist` i zwracał 404. Inspekcję cache, recovery i przełączanie sieci przepięto na mały bridge ładowany wyłącznie, gdy `VITE_FIREBASE_USE_EMULATORS=true`; wspólne wywołania wykorzystują go także w testach mobile. Zwykły build bez flagi emulatora usuwa warunek na etapie bundlowania.

Po przywróceniu bridge'a scenariusze poprawnie dochodziły do odrzucenia zapisu przez tombstone, lecz matcher oczekiwanej diagnostyki był związany ze starym numerem linii `L478` w `firestore.rules`. Zmieniono go na semantyczny kontrakt: dokładny prefiks błędu zapisu aktywnej sesji, `PERMISSION_DENIED` oraz odmowa `create` albo `update` z dowolnym numerem linii. Inne odmowy uprawnień nadal pozostają blokujące.

Pełny przebieg ujawnił mobilny race w composerze AI Coach. Fokus textarea chował dolną nawigację, ale pointer down na „Wyślij” przenosił fokus na przycisk, przez co nawigacja wracała w trakcie gestu i zasłaniała submit. Composer zachowuje teraz fokus textarea dla pointer click; wysłanie klawiaturą i dostępnościowy submit formularza pozostają bez zmian.

## Pozostałe obowiązki

- 7B: manualny smoke, klawiatura, accessibility snapshot i zgodność demo/dokumentacji;
- `RELEASE-08`: live E2E, deploy i publikacja produkcyjnych reguł po osobnej zgodzie;
- `RELEASE-09`: produkcyjna obserwacja CSP i requestów;
- `RELEASE-10`: powtarzalny pomiar zimnego dashboardu.

## Wniosek

PENDING
