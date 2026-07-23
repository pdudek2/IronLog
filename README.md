# IronLog

IronLog is a web-based strength training log. It tracks sets during a workout, keeps a detailed history, charts progress, detects personal records, and supports custom exercises and workout templates.

[Live demo](https://ironlog-coach.vercel.app) · [Repository](https://github.com/pdudek2/IronLog)

Demo account: `demo@ironlog.app` / `demo123`

This is a shared account. Do not add private data or save your own API key.

![IronLog on desktop](docs/screenshots/app/desktop-showcase.png)

![IronLog on mobile](docs/screenshots/app/mobile-showcase.png)

## Features

- Live workout tracking with sets, reps, weight, and a rest timer
- Previous results shown when logging the next session
- Workout history with a detailed view for each session
- Progress charts covering the last 30 or 90 days
- Automatic personal record detection
- Custom exercises and reusable workout templates
- A short readiness check before training
- An AI coach that runs on the user's own Claude API key
- Separate navigation designed for mobile and desktop

Weights are stored in kilograms. Users can switch the display unit to pounds in their profile.

## AI Coach

AI Coach answers training questions and can draft a workout plan from the user's profile, readiness, recent sessions, and personal records. The plan can be edited before it is saved as a template.

The integration uses a bring-your-own-key model. The Claude API key stays in the browser's local storage and is sent to the serverless API only for the current request. IronLog does not store it in Firestore.

## Tech stack

- React 19, TypeScript, and Vite
- React Router, Zustand, and Framer Motion
- Tailwind CSS and Recharts
- Firebase Authentication and Firestore
- Vercel Functions with Firebase Admin SDK
- Vitest, Playwright, and Firebase Emulator Suite

## Architecture

The frontend is a single-page application. Protected pages share one layout and are split into route-level chunks. Firestore access is kept in services under `src/lib`.

The active workout uses a live Firestore subscription. Other data is loaded on demand. Finishing a workout calls a serverless function that closes the active session, stores the exercise sessions, and updates personal records.

```text
src/
  components/   shared UI components
  data/         built-in exercise catalog
  lib/          Firebase, data services, and domain logic
  pages/        route-level pages
  router/       public and protected routes
  store/        Zustand stores
api/            serverless functions
tests/e2e/      Playwright scenarios
```

## Local development

You need Node.js, npm, and a Firebase project with email/password authentication enabled.

```bash
git clone https://github.com/pdudek2/IronLog.git
cd IronLog
npm install
cp .env.example .env.local
npm run dev:all
```

Fill in `.env.local` with the web app settings from Firebase:

```dotenv
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

`npm run dev` starts the frontend only. `npm run dev:all` starts the frontend and a local server for the endpoints under `api`.

## Tests

```bash
npm run lint
npm run build
npm run test:unit
npm run test:rules
npm run test:e2e:isolated
```

The rules and isolated end-to-end tests require Firebase CLI. The isolated suite runs against the Auth and Firestore emulators, so it does not use production data or quota.

The full Playwright suite reads test credentials from `.env.test`. Use `.env.test.example` as the template.

```bash
npm run test:e2e
```

## Deployment

The frontend and functions under `api` are deployed to Vercel. Configure the Firebase environment variables in the target environment before deploying.

```bash
vercel --prod --yes
```

Firestore rules are maintained separately in `firestore.rules`.
