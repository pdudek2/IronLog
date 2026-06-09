# IronLog

Webowa aplikacja do prowadzenia dziennika treningowego, wzorowana na Hevy. Pozwala rejestrować treningi siłowe na żywo, śledzić progres i rekordy, budować własne szablony treningów i rozmawiać z trenerem AI.

**Demo (produkcja):** https://ironlog-coach.vercel.app
Konto testowe: `demo@ironlog.app` / `demo123`

Projekt zaliczeniowy z przedmiotu *Techniki projektowania frontendowego*.

## Screeny aplikacji

![Widok desktop](docs/screenshots/app/desktop-showcase.png)

![Widok mobilny](docs/screenshots/app/mobile-showcase.png)

| Ekran | Screen |
|---|---|
| Logowanie | ![Logowanie](docs/screenshots/app/login.png) |
| Dashboard | ![Dashboard](docs/screenshots/app/dashboard.png) |
| Aktywny trening | ![Aktywny trening](docs/screenshots/app/workout-new.png) |
| Historia | ![Historia](docs/screenshots/app/history.png) |
| Progres | ![Progres](docs/screenshots/app/progress.png) |
| Szablony | ![Szablony](docs/screenshots/app/templates.png) |
| Baza ćwiczeń | ![Ćwiczenia](docs/screenshots/app/exercises.png) |
| Czat AI | ![Czat AI](docs/screenshots/app/chat.png) |
| Profil | ![Profil](docs/screenshots/app/profile.png) |

## Funkcje

- rejestracja i logowanie (Firebase Authentication, e-mail + hasło),
- rejestrowanie treningu na żywo: serie, powtórzenia, ciężar, rest timer, prefill na podstawie historii,
- historia treningów ze szczegółami każdej sesji,
- wykresy progresu i automatyczne wykrywanie rekordów (PR),
- szablony treningów + własne ćwiczenia użytkownika,
- ankieta gotowości (readiness) przed treningiem,
- czat z trenerem AI z limitem dziennego użycia,
- responsywny interfejs mobile-first z osobną nawigacją na desktop.

## Stack

- React 19 + TypeScript + Vite
- React Router 7, Zustand, Framer Motion, Recharts, Tailwind CSS 4
- Firebase Authentication + Firestore
- Vercel Serverless Functions (Node.js, Firebase Admin SDK)
- Hosting: Vercel, auto-deploy z GitHuba
- Analityka: Google Analytics 4 (`react-ga4`) + Hotjar (`@hotjar/browser`)

## Struktura projektu

```
src/
  pages/        # widoki powiązane z trasami (DashboardPage, WorkoutPage, ...)
  components/   # współdzielone komponenty (TopNav, BottomNav, ExercisePicker, ...)
    ui/         # podstawowe komponenty reużywalne (Button, Card, Input, LoadingState)
  router/       # konfiguracja React Router + lazy loading stron
  store/        # stan globalny (Zustand)
  lib/          # serwisy: Firebase, auth, analityka, logika Firestore
  data/         # globalna baza ćwiczeń (seed)
api/            # endpointy serverless (czat AI, finalizacja treningu)
```

## Routing

Wszystkie ekrany są dostępne przez React Router (nawigacja bez przeładowania strony). Trasy prywatne są chronione — bez zalogowania następuje przekierowanie na `/login`. Strony ładują się lazy (code-splitting per trasa), a widoki prywatne współdzielą jeden layout (`AppLayout`).

| Trasa | Ekran | Dostęp |
|---|---|---|
| `/login`, `/register` | logowanie / rejestracja | publiczny |
| `/onboarding` | konfiguracja konta | prywatny |
| `/dashboard` | dashboard | prywatny |
| `/workout/new` | aktywny trening | prywatny |
| `/workout/:id` | szczegóły treningu | prywatny |
| `/history` | historia treningów | prywatny |
| `/progress` | wykresy progresu | prywatny |
| `/templates`, `/templates/new`, `/templates/:id/edit` | szablony | prywatny |
| `/exercises`, `/exercises/:source/:id` | baza ćwiczeń | prywatny |
| `/chat` | czat AI | prywatny |
| `/profile` | profil | prywatny |
| `*` | strona 404 | publiczny |

## Logowanie

Uwierzytelnianie przez Firebase Authentication (metoda Email/Password). Stan sesji trzymany jest w store Zustand i zasilany przez `onAuthStateChanged`, więc odświeżenie strony nie wylogowuje użytkownika. Komponenty `PrivateRouteOutlet` / `PublicRouteOutlet` w `src/router/index.tsx` pilnują dostępu do tras.

## Google Analytics

Integracja przez `react-ga4` (`src/lib/analytics.ts`). Ponieważ aplikacja jest SPA i nawigacja nie przeładowuje strony, komponent `AnalyticsListener` wysyła zdarzenie `pageview` przy każdej zmianie trasy (`useLocation`).

Identyfikator pomiaru jest podawany przez zmienną środowiskową `VITE_GA_MEASUREMENT_ID` — bez niej moduł nie inicjalizuje się (dzięki temu środowisko lokalne nie zaśmieca statystyk produkcji).

<!-- TODO: po zebraniu danych z produkcji podmienić na prawdziwe screeny -->
![Google Analytics — przegląd](docs/screenshots/analytics/ga-overview.png)
![Google Analytics — strony](docs/screenshots/analytics/ga-pages.png)

## Hotjar (Contentsquare)

Hotjar działa obecnie na platformie Contentsquare — nowe konta zamiast numerycznego Site ID dostają tag identyfikowany hashem. Tag jest doładowywany w `src/lib/analytics.ts` przy starcie aplikacji, hash podaje zmienna `VITE_CSQ_TAG_ID`. Narzędzie zbiera nagrania sesji (Session Replay) i heatmapy kliknięć/scrolla.

<!-- TODO: po zebraniu danych z produkcji podmienić na prawdziwe screeny -->
![Hotjar — heatmapa](docs/screenshots/analytics/hotjar-heatmap.png)
![Hotjar — nagrania sesji](docs/screenshots/analytics/hotjar-recordings.png)

## Uruchomienie lokalne

```bash
npm install
cp .env.example .env.local   # uzupełnij wartości
npm run dev                  # frontend (Vite)
npm run dev:all              # frontend + lokalne API
```

Wymagane zmienne środowiskowe — patrz `.env.example`. Konfiguracja Firebase pochodzi z konsoli Firebase (Project settings → Web app). Zmienne analityki (`VITE_GA_MEASUREMENT_ID`, `VITE_HOTJAR_SITE_ID`) są opcjonalne — bez nich analityka jest po prostu wyłączona.

## Testy

```bash
npm run test:unit    # testy jednostkowe (Vitest)
npm run test:rules   # testy reguł Firestore (emulator)
npm run test:e2e     # testy end-to-end (Playwright)
```

## Deploy

Aplikacja jest wdrożona na Vercel (preset Vite + funkcje serverless w `api/`). Każdy push na `main` uruchamia automatyczny deploy. Zmienne środowiskowe są ustawione w panelu Vercela.
