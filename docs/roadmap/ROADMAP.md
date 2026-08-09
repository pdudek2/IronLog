# IronLog — aktywna roadmapa niezawodności danych

**Status:** ACTIVE — CATALOG-01 INTEGRATION PENDING

**Utworzono:** 2026-08-09

**Źródło:** rewalidacja odłożonych ustaleń po zamknięciu programów A–7 i 8A–9

## Kontrakt

Ta roadmapa zawiera wyłącznie dwa potwierdzone problemy produktu. Nie otwiera
ponownie zakończonych programów ani opcjonalnych pomysłów z archiwum. Dla
każdego kroku powstaje osobny plan dopiero przed implementacją.

## Kolejność

| Kolejność | ID | Status | Rezultat |
|---:|---|---|---|
| 1 | PROFILE-01 | DONE | Chronione trasy znają profil i jednostki przed renderem UI zależnego od kg/lbs |
| 2 | CATALOG-01 | INTEGRATION PENDING | Awaria własnych ćwiczeń jest jawnym stanem częściowym, a katalog globalny pozostaje dostępny |
| 3 | RELEASE-01 | BLOCKED BY CATALOG-01 | Oba przepływy mają świeże dowody i mogą zostać bezpiecznie wydane |

## PROFILE-01 — DONE

- implementacja i lokalny gate: `2e52f9c`, `a66a830`;
- 66 plików i 498 testów przeszło, podobnie lint oraz produkcyjny build;
- lokalnie zaobserwowano cold reload `/workout/new` dla profilu `lbs`: najpierw
  stan ładowania profilu, potem wyłącznie jednostki `lbs`, bez błędów konsoli;
- deployment `dpl_2LNXCcWn7iZK1fQsKgMHbeY28XLT` osiągnął `Ready` i został
  przypisany do `https://ironlog-coach.vercel.app`;
- publiczny ekran logowania produkcji działa bez błędów konsoli; uwierzytelniona
  obserwacja produkcyjna pozostaje `Pending`, ponieważ bezpieczna sesja konta nie
  była dostępna — nie zastąpiono jej dowodem lokalnym;
- rollback: przywrócić poprzedni deployment Vercel.

## CATALOG-01 — uczciwy stan własnego katalogu

**Plan:** [`plans/2026-08-09-user-exercise-catalog-state.md`](plans/2026-08-09-user-exercise-catalog-state.md)

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

**Dowody integracyjne:**

- implementacja: `af9c9e2`, `baeab11`, `c7686c2`;
- 7 ukierunkowanych plików i 33 testy przeszły; pełny zestaw to 68 plików i
  502 testy, a lint oraz produkcyjny build również przeszły;
- przegląd wywołań potwierdził, że produkcyjnie `getUserExercises` jest wołane
  wyłącznie przez `useUserExercises`; nie pozostał fallback `catch(() => [])`
  ani stare przekazywanie samej tablicy do selektora;
- bezpośrednia obserwacja wymuszonego błędu pozostaje `Pending`: Browser potrafił
  selektywnie przechwycić wyłącznie zapytania `userExercises`, jednak Firestore
  WebChannel po wymuszonej odpowiedzi utrzymywał odczyt w ponawianym stanie
  `loading` zamiast zwrócić błąd do `getDocs`. W tym stanie globalny katalog był
  renderowany jako aktywne przyciski, ale nie uznano tego za dowód końcowego UI
  `error/retry`;
- nie dodano produkcyjnego przełącznika awarii ani test bridge'a. Pusta sesja
  utworzona do obserwacji została odrzucona i nie zapisała treningu;
- rollback: odwrócić trzy commity implementacyjne w kolejności `c7686c2`,
  `baeab11`, `af9c9e2`; brak zmian danych, reguł i indeksów.

## RELEASE-01 — integracja i closeout

- uruchomić tylko bramki dotkniętych przepływów oraz produkcyjny build;
- sprawdzić cały diff pod kątem fałszywych empty states i utraty ustawień konta;
- zapisać rollback dla obu zmian danych po stronie klienta;
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

Zatwierdzić push i wdrożenie produkcyjne. Bezpośredni forced-error gate pozostaje
jawnie `Pending`; nie zastępować go testem ani obserwacją stanu `loading`.
