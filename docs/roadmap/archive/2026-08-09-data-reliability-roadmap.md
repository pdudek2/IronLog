# IronLog — closeout niezawodności danych

**Status:** DONE — RELEASE-01 COMPLETE

**Utworzono:** 2026-08-09

**Zamknięto:** 2026-08-09

**Źródło:** rewalidacja odłożonych ustaleń po zamknięciu programów A–7 i 8A–9

## Kontrakt

Roadmapa obejmowała dwa potwierdzone problemy produktu. Nie otwierała ponownie
zakończonych programów ani opcjonalnych pomysłów z archiwum.

## Wynik

| Kolejność | ID | Status | Rezultat |
|---:|---|---|---|
| 1 | PROFILE-01 | DONE | Chronione trasy znają profil i jednostki przed renderem UI zależnego od kg/lbs |
| 2 | CATALOG-01 | DONE | Awaria własnych ćwiczeń jest jawnym stanem częściowym, a katalog globalny pozostaje dostępny |
| 3 | RELEASE-01 | DONE | Oba przepływy przeszły bramki i zostały wydane na produkcję |

## PROFILE-01

- implementacja i lokalny gate: `2e52f9c`, `a66a830`;
- 66 plików i 498 testów przeszło, podobnie lint oraz produkcyjny build;
- lokalnie zaobserwowano cold reload `/workout/new` dla profilu `lbs`: najpierw
  stan ładowania profilu, potem wyłącznie jednostki `lbs`, bez błędów konsoli;
- deployment `dpl_2LNXCcWn7iZK1fQsKgMHbeY28XLT` osiągnął `Ready` i został
  przypisany do `https://ironlog-coach.vercel.app`;
- publiczny ekran logowania produkcji działał bez błędów konsoli;
- rollback: przywrócić poprzedni deployment Vercel.

## CATALOG-01

### Kontrakt

- selektor treningu, edytor planu, historia i widok szczegółowy pokazują jawny,
  nieblokujący stan częściowego błędu;
- katalog globalny i dane treningu pozostają dostępne;
- użytkownik może ponowić odczyt bez przeładowania całej aplikacji;
- błąd nie jest przedstawiany jako prawidłowe `0` własnych ćwiczeń;
- jeden współdzielony mechanizm stanu zastępuje powielone lokalne efekty.

### Dowody

- plan: historia Git od `36b378a`; zakończony dokument wykonawczy usunięto po
  integracji;
- implementacja: `af9c9e2`, `baeab11`, `c7686c2`;
- 7 ukierunkowanych plików i 33 testy przeszły; pełny zestaw to 68 plików i
  502 testy, a lint oraz produkcyjny build również przeszły;
- przegląd wywołań potwierdził, że produkcyjnie `getUserExercises` jest wołane
  wyłącznie przez `useUserExercises`; nie pozostał fallback `catch(() => [])`
  ani stare przekazywanie samej tablicy do selektora;
- bezpośrednia obserwacja wymuszonego błędu pozostaje zaakceptowanym `Pending`:
  Browser selektywnie przechwycił zapytania `userExercises`, ale Firestore
  WebChannel utrzymywał odczyt w ponawianym stanie `loading` zamiast zwrócić błąd
  do `getDocs`. W tym stanie globalny katalog pozostał dostępny;
- nie dodano produkcyjnego przełącznika awarii ani test bridge'a. Pusta sesja
  utworzona podczas obserwacji została odrzucona bez zapisu treningu;
- rollback kodu: odwrócić `c7686c2`, `baeab11`, `af9c9e2`; brak zmian danych,
  reguł i indeksów.

## RELEASE-01

- kod wydania z commita `0551c994e6a0dba1a4ecec5febdbaee84f79329e`
  wypchnięto z `main` do `origin/main`;
- deployment `dpl_36t7Mfves5kx8NEcRyjCAzaJkf9g` osiągnął `Ready` i został
  przypisany do `https://ironlog-coach.vercel.app`;
- produkcyjny build Vercel przeszedł, domena odpowiedziała `HTTP 200`, a skan
  logów wdrożenia nie znalazł błędów;
- Browser otworzył publiczny `/login`, zwrócił kompletny formularz IronLog oraz
  pustą listę błędów konsoli;
- uwierzytelniona obserwacja produkcyjnego katalogu pozostaje `Pending`, ponieważ
  w bezpiecznej sesji Browser dostępny był tylko publiczny ekran logowania;
- rollback produkcji: przywrócić deployment
  `dpl_2LNXCcWn7iZK1fQsKgMHbeY28XLT`.

## Zamknięcie

Zakres `roadmapa niezawodności → CATALOG-01 → RELEASE-01` jest zakończony.
Niedostępne obserwacje zostały jawnie sklasyfikowane jako `Pending` zgodnie z
zaakceptowanym kontraktem i nie wymagają utrzymywania aktywnego planu. Kolejna
praca wymaga nowego, konkretnego problemu produktowego.

## Świadomie poza zakresem

- trwała historia AI i panel budżetu — brak aktualnego wymagania produktowego;
- wirtualizacja biblioteki i dalszy podział chunków — brak pomiaru problemu;
- szeroka regresja screenshotowa — nie uzasadnia kosztu utrzymania;
- dalszy branding, EKG i globalny przegląd mikrotekstu — wracają tylko z nowym,
  konkretnym problemem;
- centralizacja kolorów kategorii i usunięcie `#808CB3` — wykonane wcześniej.
