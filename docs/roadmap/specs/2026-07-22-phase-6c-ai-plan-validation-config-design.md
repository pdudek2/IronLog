# Faza 6C — Walidacja planów i obsługa konfiguracji AI

**Status:** COMPLETED — VERIFIED — INTEGRATED LOCALLY

**Data:** 2026-07-22

**Właściciel zakresu:** `AI-04`, `AI-05`, `AI-06`, `AI-12`, `AI-13`, `AI-14` z `docs/roadmap/ROADMAP.md`

**Route:** Medium — zmiana kontraktu błędów AI, walidacji planu i kolejności powierzchni konfiguracji

**Ryzyko:** Elevated — zakres obejmuje BYOK, granicę API i poprawność planu zapisywanego jako szablon

## 1. Cel

Faza 6C domyka ścieżkę AI po 6A i 6B: użytkownik ma dostać właściwe działanie naprawcze przy problemach z kluczem, modelem, limitem lub upstreamem, a wygenerowany plan nie może wejść do UI jako gotowy szablon, jeśli nie respektuje briefu.

## 2. Decyzje

- Klient nie ufa surowym komunikatom Anthropic. API mapuje statusy na publiczne kategorie: `invalid-key`, `rate-limited`, `model-unavailable`, `upstream-unavailable`, `network-retryable`.
- Awaria listy modeli nie blokuje czatu ani generatora planu, jeżeli zapisany klucz nie został jednoznacznie odrzucony jako `invalid-key`.
- Walidacja planu zostaje na API. UI dostaje wyłącznie plan po normalizacji albo publiczny błąd do ponowienia.
- Plan musi mieć dokładnie tyle dni, ile wybrał użytkownik, używać ćwiczeń z katalogu, respektować wybrany sprzęt i mieścić się w limitach szablonu Firestore.
- Przy braku klucza konfiguracja pojawia się przed zablokowaną rozmową w DOM, więc na mobile użytkownik najpierw trafia na wymagane działanie.
- BYOK pozostaje bez zmian: klucz jest tylko w lokalnym storage przeglądarki i w bieżącym request body do API; nie trafia do Firestore ani logów.

## 3. Wynik wdrożenia

Dodano wspólny helper klasyfikacji Anthropic w `api/lib/anthropicErrors.ts`, użyty przez `api/ai-chat.ts` i `api/ai-models.ts`. Logi upstreamu zachowują status i model, ale nie zapisują treści promptu, odpowiedzi ani klucza API.

Generator planu odrzuca wynik z niewłaściwą liczbą dni i filtruje ćwiczenia spoza wybranego sprzętu przed akceptacją planu. Ćwiczenia są ograniczane do 20 na dzień, zgodnie z regułami szablonów Firestore.

`AiKeyPanel` rozróżnia invalid key od problemów z listą modeli. Retryable/model-list failure jest ogłaszane dostępnie, ale nie blokuje czatu. Invalid key oznacza select jako invalid i blokuje AI do czasu poprawienia klucza.

`ChatPage` przenosi panel konfiguracji nad główną rozmowę, kiedy nie ma klucza. To zamyka mobile-first przypadek, w którym użytkownik widział najpierw nieaktywny czat.

README opisuje rzeczywisty limit `8/min` liczony transakcyjnie w Firestore w kolekcji `aiRateLimits`.

## 4. Dowody lokalne

- Focused Vitest: 5 plików, 51/51 testów.
- Pełny unit/support Vitest: 59 plików, 467/467 testów.
- `npm run lint`: pass.
- `npm run build`: pass, 878 modułów.
- Focused whole-branch review: Critical 0, Important 0, Minor 0 po usunięciu pętli ponownej walidacji odrzuconego klucza.
- Bezpośrednia obserwacja Browser przy 390×844: pole konfiguracji było widoczne przed czatem, a composer pozostawał wyłączony z instrukcją dodania klucza.
- Lokalna integracja: fast-forward `puls-rebrand` do `f0f5f7f`.

Nie wykonano pushu, deployu, publikacji indeksów ani `RELEASE-08`.
