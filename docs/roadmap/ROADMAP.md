# IronLog — aktywna roadmapa niezawodności danych

**Status:** ACTIVE — PROFILE-01 INTEGRATION PENDING

**Utworzono:** 2026-08-09

**Źródło:** rewalidacja odłożonych ustaleń po zamknięciu programów A–7 i 8A–9

## Kontrakt

Ta roadmapa zawiera wyłącznie dwa potwierdzone problemy produktu. Nie otwiera
ponownie zakończonych programów ani opcjonalnych pomysłów z archiwum. Dla
każdego kroku powstaje osobny plan dopiero przed implementacją.

## Kolejność

| Kolejność | ID | Status | Rezultat |
|---:|---|---|---|
| 1 | PROFILE-01 | INTEGRATION PENDING | Chronione trasy znają profil i jednostki przed renderem UI zależnego od kg/lbs |
| 2 | CATALOG-01 | BLOCKED BY PROFILE-01 | Awaria własnych ćwiczeń jest jawnym stanem częściowym, a katalog globalny pozostaje dostępny |
| 3 | RELEASE-01 | BLOCKED | Oba przepływy mają świeże dowody i mogą zostać bezpiecznie wydane |

## PROFILE-01 — profil przed trasami zależnymi od jednostek

**Plan:** [`plans/2026-08-09-profile-readiness.md`](plans/2026-08-09-profile-readiness.md)

**Problem:** profil jest obecnie ładowany dopiero przez wybrane strony. Zimne
wejście lub reload `/workout/new` może więc uruchomić ekran z domyślnym `kg`,
mimo że użytkownik ma zapisane `lbs`.

**Docelowy kontrakt:**

- po ustaleniu użytkownika aplikacja rozstrzyga stan profilu przed renderem
  chronionych ekranów zależnych od jego ustawień;
- zapisane `lbs` obowiązuje również przy zimnym wejściu i reloadzie;
- brak profilu prowadzi do onboardingu, a błąd odczytu nie udaje braku profilu
  ani poprawnego `kg`;
- zmiana konta i wylogowanie nie mogą pozostawić profilu poprzedniego użytkownika;
- nie migrujemy danych i nie dokładamy cache'a poza istniejącym store Zustand.

**Minimalna weryfikacja:**

- test regresyjny zimnego wejścia z profilem `lbs`;
- negatywny przypadek błędu odczytu profilu;
- lint, test ukierunkowany i build;
- bezpośrednia obserwacja reloadu trasy treningu dla konta z `lbs`.

## CATALOG-01 — uczciwy stan własnego katalogu

**Problem:** część konsumentów redukuje błąd `getUserExercises` do pustej
tablicy, toastu albo wpisu w konsoli. Użytkownik może przez to uznać, że jego
ćwiczenia zniknęły, podczas gdy katalog globalny działa poprawnie.

**Docelowy kontrakt:**

- selektor treningu, edytor planu, historia i widok szczegółowy pokazują jawny,
  nieblokujący stan częściowego błędu;
- katalog globalny i dane treningu pozostają dostępne;
- użytkownik może ponowić odczyt bez przeładowania całej aplikacji;
- błąd nie jest przedstawiany jako prawidłowe `0` własnych ćwiczeń;
- jeden współdzielony mechanizm stanu zastępuje powielone lokalne efekty tylko
  wtedy, gdy po prześledzeniu konsumentów nadal zmniejsza łączny kod.

**Minimalna weryfikacja:**

- jeden test kontraktu stanu danych oraz reprezentatywne testy konsumentów,
  bez mnożenia testów identycznego przycisku;
- lint, testy ukierunkowane i build;
- bezpośrednia obserwacja jednego selektora i jednego widoku odczytowego przy
  wymuszonej awarii własnego katalogu.

## RELEASE-01 — integracja i closeout

- uruchomić tylko bramki dotkniętych przepływów oraz produkcyjny build;
- sprawdzić cały diff pod kątem fałszywych empty states i utraty ustawień konta;
- zapisać rollback dla zmiany bootstrapa profilu;
- push i produkcja wymagają osobnej zgody;
- po udanym wdrożeniu przenieść ten dokument do `docs/roadmap/archive/` i usunąć
  szczegółowe, zakończone plany.

## Świadomie poza aktywnym zakresem

- trwała historia AI i panel budżetu — brak aktualnego wymagania produktowego;
- wirtualizacja biblioteki i dalszy podział chunków — brak pomiaru problemu;
- szeroka regresja screenshotowa — nie uzasadnia kosztu utrzymania;
- dalszy branding, EKG i globalny przegląd mikrotekstu — ostatnia ścieżka
  wizualna jest zamknięta; wracają tylko z nowym, konkretnym problemem;
- centralizacja kolorów kategorii i usunięcie `#808CB3` — już wykonane.

## Następny krok

Po osobnej zgodzie wypchnąć `PROFILE-01`, wdrożyć produkcję i wykonać closeout.
`CATALOG-01` pozostaje zablokowany do tego momentu.
