# IronLog

IronLog records strength workouts and tracks progress over time. An active workout stores sets, reps, weight, and rest time. Once finished, its data appears in the training history, progress charts, and personal records.

[Open IronLog](https://ironlog-coach.vercel.app/login)

## Training

Start an empty workout or use a saved template. IronLog shows the previous result for each exercise, keeps the active session available after a refresh, and includes a rest timer between sets.

Before training, a short readiness check records sleep, energy, stress, and soreness.

## Progress

Completed workouts are stored with their exercises and sets. The progress view covers the last 30 or 90 days and tracks training volume, frequency, muscle groups, and personal records.

Weights are stored in kilograms. The display unit can be changed to pounds in the user profile.

## Exercises and templates

IronLog includes a built-in exercise catalog. Custom exercises are stored separately from it.

Templates keep exercise order, targets, and notes for repeatable sessions. A template can be edited later or used as the starting point for a new workout.

## AI Coach

AI Coach answers questions about training and can draft a workout plan from the user's profile, readiness, recent sessions, and records. The draft can be edited before it is saved as a template.

The integration uses the user's own Claude API key. The key stays in local browser storage, scoped to the authenticated Firebase user, and is sent to the server only for the current request. IronLog does not store it in the training database.

## Local development

Install Node.js compatible with the locked dependencies, a Java runtime supported by the Firebase Emulator Suite, and the Firebase CLI (`firebase`) on your PATH. Firebase CLI is not a dependency in `package.json`. From a fresh checkout:

```sh
npm ci
cp .env.example .env.local
firebase emulators:exec --only auth,firestore --project demo-ironlog "npm run dev:all"
```

The example uses demo values and routes both Firebase clients to local emulators; it needs no service-account secret. `dev:all` starts Vite at `http://localhost:5173` and the Node API at `http://localhost:3000`. Vite proxies `/api` to that API. Auth runs at `127.0.0.1:9099` and Firestore at `127.0.0.1:8080`, as configured in `firebase.json`. Register a local account in the app to start using the empty emulator database.

`npm run dev` and `npm run dev:web` start only Vite. `npm run dev:api` starts the backend separately; finishing, editing and deleting workouts need this server. `npm run build` builds the SPA, and `npm run preview` serves that build without starting the API.

## Firebase configuration

`.env.local` is ignored by Git. Vite loads the public browser settings, and `api/_lib/firebaseAdmin.ts` loads local server settings without overriding existing process environment variables. On Vercel, configure the environment variables for the intended deployment environment. Firebase Admin requires **Node.js Functions**, not Edge runtime.

| Variables | Purpose |
| --- | --- |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` | Public Firebase Web app configuration from the Firebase console; included in the browser bundle. |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Server-only service-account configuration. The Admin SDK uses a certificate when all three are present. Never put the email/private key in `VITE_*` variables. |
| `VITE_FIREBASE_USE_EMULATORS` | Connects browser Auth and Firestore to the local ports above when exactly `true`. |
| `FIREBASE_AUTH_EMULATOR_HOST`, `FIRESTORE_EMULATOR_HOST` | Routes the corresponding Admin service to an emulator; host and port only, without `http://`. |
| `GCLOUD_PROJECT` | Preferred Admin project ID in emulator mode, falling back to `FIREBASE_PROJECT_ID`. The local demo project is `demo-ironlog`. |

For a live Firebase project, replace the demo Web settings, set `FIREBASE_PROJECT_ID` to the same project, set `VITE_FIREBASE_USE_EMULATORS=false`, and remove `GCLOUD_PROJECT` and both server emulator-host variables from the file and process environment. Supply the service-account email and private key on the server. Store the PEM key as one quoted line with literal `\n` separators, as shown in `.env.example`; the server converts those separators into actual newlines. Do not paste a multiline PEM into `.env.local`, whose server parser reads one line at a time.

If the three certificate fields are not all present, live mode calls `applicationDefault()` and relies on Application Default Credentials configured in the server environment. A Web API key alone does not authenticate Admin SDK calls. With either emulator-host variable set, Admin skips configured certificate/ADC creation; start both emulators for the complete local workflow.

## Tests

Install Playwright's Chromium browser once:

```sh
npx playwright install chromium
```

The default E2E command uses emulators:

```sh
npm run test:e2e
```

It runs `test:e2e:emulator` followed by `test:e2e:csp`. Each script starts Auth and Firestore for `demo-ironlog`, supplies test-only login values, runs Playwright, and shuts down its emulators. Playwright starts its own API on port 3000 and web server on port 5174; stop a manual dev session before running these tests. The setup creates the emulator account and saves its browser state separately from live test state. Emulator web configuration uses demo values and does not load the root `.env.local` into Vite.

`scripts/qaSafety.ts` requires `E2E_BACKEND=emulator`, `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`, and `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`. The npm scripts select emulator mode and Firebase CLI supplies the host variables. Running bare `playwright test` without that environment fails the local QA check.

Default E2E tests make **no real AI calls** and require no real Claude API key. The chat scenarios intercept `/api/ai-models` and `/api/ai-chat` in a browser-local mock using test-only keys. Both `chat.spec.ts` and `ai-key-isolation.spec.ts` are emulator-only: their mock setup obtains the authenticated UID through the emulator test bridge. Playwright excludes these files from live runs.

Other checks:

```sh
npm run test:unit
npm run lint
npm run build
npm run test:rules
npm run test:integration:workout
```

The last two commands start Firestore-only emulator runs. Run emulator suites serially to avoid competing for the configured ports.

Live E2E is an explicit opt-in with `npm run test:e2e:live` (`E2E_BACKEND=live`). It uses the live Firebase configuration described above and an existing test account. Put placeholder replacements for `TEST_EMAIL` and `TEST_PASSWORD` in the ignored `.env.test` file, or provide them in the process environment:

```dotenv
TEST_EMAIL=your-test-account@example.com
TEST_PASSWORD=REPLACE_WITH_TEST_ACCOUNT_PASSWORD
```

Live tests can create, update and delete data in that configured project and account. They are not part of `npm run test:e2e`; use a dedicated test project/account when choosing this mode.

## Repository contents

Keep application code, reusable tooling, tests, required visual test baselines, and this README in Git. Product notes, plans, audit reports, and agent memory stay local and are excluded from Git and deployments.

Generated screenshots, audit output, completed implementation plans, browser traces, and local agent state are ignored. Keep temporary evidence in `output/`; keep private documents outside this repository. Do not force-add these artifacts. The four images beside `templates.visual.spec.ts` are executable test baselines and remain versioned.
