# Phase 7B — Manual release acceptance

**Status:** IN PROGRESS

**Data:** 2026-07-23

**Commit bazowy:** `08007c81572fd003f5b82878cc7c119222b205d6`

## Zakres

7B obejmuje RELEASE-02–07: ręczny smoke test na desktopie i telefonie, obsługę klawiaturą, przegląd dostępności, diagnostykę runtime oraz zgodność demo, screenów i README z aplikacją.

Zmiany produkcyjne, deploy, push, publikacja reguł i pomiary RELEASE-08–10 pozostają poza tą ścieżką.

## Środowisko

| Element | Wartość |
| --- | --- |
| Branch | `phase-7b-manual-release-acceptance` |
| Frontend lokalny | produkcyjny build i Vite preview |
| Backend lokalny | emulatory Firebase Auth i Firestore |
| Główna powierzchnia obserwacji | Browser |
| Desktop | 1440 × 900 |
| Mobile | 390 × 844 |
| Demo produkcyjne | tylko odczyt |

## Macierz akceptacji

| Obszar | Desktop | Mobile | Uwagi |
| --- | --- | --- | --- |
| Logowanie i onboarding | NOT RUN | NOT RUN | |
| Dashboard i readiness | NOT RUN | NOT RUN | |
| Trening: start, zapis, zakończenie | NOT RUN | NOT RUN | |
| Trening: odrzucenie aktywnej sesji | NOT RUN | NOT RUN | |
| Historia i szczegóły treningu | NOT RUN | NOT RUN | |
| Progres 30/90 dni | NOT RUN | NOT RUN | |
| Szablony | NOT RUN | NOT RUN | |
| Własne ćwiczenia | NOT RUN | NOT RUN | |
| AI Coach bez klucza | NOT RUN | NOT RUN | |
| Profil | NOT RUN | NOT RUN | |
| Klawiatura i fokus | NOT RUN | NOT RUN | |
| Console, pageerror, requestfailed | NOT RUN | NOT RUN | |
| Demo i README | NOT RUN | NOT RUN | |

## README

README przepisano po angielsku jako dokumentację produktu i repozytorium. Usunięto opis projektu zaliczeniowego, archiwum zaliczenia, tabelę wszystkich tras oraz wewnętrzne uwagi o brakujących elementach produktu. Funkcje, architekturę, prywatność klucza Claude, uruchomienie i testy sprawdzono względem aktualnego kodu oraz skryptów w `package.json`.

Tekst przeszedł redakcję według `humanizer` i `my-humanizer`. Finalny pass usunął promocyjne sformułowania, sztuczne wprowadzenia, zbędne objaśnienia i wewnętrzny język raportowy.

## Dowody wizualne

Oczekują na wykonanie scenariuszy Browser.

## Znaleziska

Brak na tym etapie.

## Pozostałe obowiązki

- dokończyć manualną macierz RELEASE-02–07;
- wykonać review i closeout 7B;
- zachować RELEASE-08–10 jako kolejną ścieżkę.

## Wniosek

PENDING — odbiór manualny nie został jeszcze wykonany.
