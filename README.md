# IronLog

IronLog to webowy dziennik treningów siłowych. Zapisuje serie podczas treningu, pokazuje historię i progres, wykrywa rekordy oraz obsługuje własne ćwiczenia i szablony.

[Otwórz demo](https://ironlog-coach.vercel.app) · [Repozytorium](https://github.com/pdudek2/IronLog)

Konto demonstracyjne: `demo@ironlog.app` / `demo123`

Konto jest współdzielone. Nie zapisuj w nim prywatnych danych ani własnego klucza API.

![IronLog na desktopie](docs/screenshots/app/desktop-showcase.png)

![IronLog na telefonie](docs/screenshots/app/mobile-showcase.png)

## Funkcje

- aktywny trening z seriami, powtórzeniami, ciężarem i timerem przerw;
- podpowiadanie ostatnich wyników dla wybranego ćwiczenia;
- historia treningów i szczegóły każdej sesji;
- wykresy progresu z zakresem 30 lub 90 dni;
- automatycznie wykrywane rekordy;
- własne ćwiczenia i szablony treningowe;
- krótka ankieta gotowości przed treningiem;
- AI Coach korzystający z własnego klucza Claude;
- interfejs dostosowany do telefonu i desktopu.

Ciężary są przechowywane w kilogramach. Profil pozwala wyświetlać je także w funtach.

## AI Coach

AI Coach odpowiada na pytania o trening i może przygotować plan na podstawie profilu, gotowości, ostatnich sesji oraz rekordów użytkownika. Wygenerowany plan można poprawić przed zapisaniem go jako szablonu.

Integracja działa w modelu BYOK. Klucz Claude jest przechowywany lokalnie w przeglądarce i trafia do funkcji serverless tylko na czas bieżącego zapytania. IronLog nie zapisuje go w Firestore.

## Stack

- React 19, TypeScript i Vite
- React Router, Zustand i Framer Motion
- Tailwind CSS i Recharts
- Firebase Authentication oraz Firestore
- Vercel Functions z Firebase Admin SDK
- Vitest, Playwright i Firebase Emulator Suite

## Architektura

Frontend jest aplikacją SPA. Chronione widoki korzystają ze wspólnego layoutu i ładują się osobno dla każdej trasy. Logika dostępu do Firestore znajduje się w serwisach w `src/lib`.

Aktywna sesja jest synchronizowana na żywo. Pozostałe dane są pobierane jednorazowo. Zakończenie treningu trafia do funkcji serverless, która zapisuje sesje ćwiczeń i aktualizuje rekordy.

```text
src/
  components/   współdzielone komponenty interfejsu
  data/         katalog globalnych ćwiczeń
  lib/          Firebase, serwisy danych i logika domenowa
  pages/        widoki aplikacji
  router/       trasy publiczne i chronione
  store/        stan aplikacji w Zustand
api/            funkcje serverless
tests/e2e/      scenariusze Playwright
```

## Uruchomienie lokalne

Wymagane są Node.js, npm i projekt Firebase z włączonym logowaniem przez e-mail i hasło.

```bash
git clone https://github.com/pdudek2/IronLog.git
cd IronLog
npm install
cp .env.example .env.local
npm run dev:all
```

Uzupełnij `.env.local` danymi aplikacji webowej z Firebase:

```dotenv
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

`npm run dev` uruchamia sam frontend. `npm run dev:all` uruchamia frontend razem z lokalnym serwerem obsługującym endpointy z katalogu `api`.

## Testy

```bash
npm run lint
npm run build
npm run test:unit
npm run test:rules
npm run test:e2e:isolated
```

`test:rules` i `test:e2e:isolated` wymagają Firebase CLI. Testy izolowane korzystają z emulatorów Auth i Firestore, więc nie zużywają produkcyjnego limitu i nie potrzebują danych dostępowych do środowiska produkcyjnego.

Pełny zestaw Playwright korzysta z danych logowania zapisanych w `.env.test`. Szablon znajduje się w `.env.test.example`.

```bash
npm run test:e2e
```

## Wdrożenie

Frontend i funkcje z katalogu `api` są wdrażane na Vercel. Zmienne Firebase trzeba wcześniej ustawić dla środowiska docelowego.

```bash
vercel --prod --yes
```

Reguły Firestore są utrzymywane osobno w `firestore.rules`.
