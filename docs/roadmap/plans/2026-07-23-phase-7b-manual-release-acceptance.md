# Phase 7B — Manual Release Acceptance

> Status: COMPLETE — VERIFIED — INTEGRATED LOCALLY
> Parent: Phase 7 — Release Readiness
> Scope: RELEASE-02 through RELEASE-07
> Remaining after this path: RELEASE-08 through RELEASE-10

Outcome: local desktop/mobile acceptance, accessibility, runtime diagnostics, README corrections, and the lbs regression fix are complete. An authenticated production account was inspected read-only without retaining credentials or personal screenshots. Production is credible but still runs the older blue `main` build; the expected mismatch with the undeployed Puls candidate is recorded for the next production release path.

## Goal

Manually validate the release candidate on desktop and mobile, verify keyboard and accessibility behavior, confirm a clean runtime, and compare the production demo and documentation with the current product.

This path is an acceptance gate. It does not include deployment, production data mutation, performance refactoring, or unrelated product improvements.

## Workflow classification

- Decision state: settled
- Work type: coordinated execution
- Risk: elevated because this is a release gate
- Complexity: medium
- Simplicity mode: Lean / Ponytail lite
- Execution: planned, single-agent, inline
- Primary interactive surface: in-app Browser
- Canonical owner: `docs/roadmap/ROADMAP.md`

## Safety boundaries

- Run every mutating user flow against local Firebase emulators.
- Treat the production demo as read-only.
- Do not deploy, push, reseed production, edit production data, or change Firebase/Vercel configuration.
- Do not optimize bundles unless measurements reveal a release-blocking problem.
- Do not add product scope while resolving acceptance findings.
- Preserve the user-owned untracked file `docs/audits/2026-07-14-senior-design-review.md`.

## Acceptance record

Create:

- `docs/audits/2026-07-23-phase-7b-manual-release-acceptance.md`

The report must contain:

- tested commit and environment;
- desktop and mobile viewport sizes;
- scenario matrix with `PASS`, `FAIL`, `BLOCKED`, or `NOT RUN`;
- direct visual evidence receipts for observed UI claims;
- keyboard and accessibility findings;
- console, page error, and failed-request findings;
- production-demo and README consistency findings;
- defects found, fixes made, and exact retest evidence;
- final verdict for RELEASE-02 through RELEASE-07;
- explicit statement that RELEASE-08 through RELEASE-10 remain open.

Use this evidence receipt format:

```text
Surface: Browser
State: <route, viewport, and user state>
Evidence: <returned visible state or emitted screenshot>
Result: <what was directly observed>
```

## Task 1 — Establish the execution baseline

1. Confirm the current branch, commit, and worktree state:

   ```bash
   git status --short --branch
   git rev-parse HEAD
   ```

2. Create an isolated execution worktree and the plain branch:

   ```bash
   git worktree add ../IronLog-phase-7b -b phase-7b-manual-release-acceptance
   ```

3. In the worktree, install dependencies only if `node_modules` is unavailable:

   ```bash
   npm install
   ```

4. Create the acceptance report with status `IN PROGRESS`, the baseline commit, the lineage above, and an empty scenario matrix.

5. Confirm that the full Phase 7A automated evidence is still present and that this path starts from the reviewed and closed-out baseline.

## Task 2 — Prepare the local acceptance environment

Use local emulators and a production-mode Vite preview so that CSP and built assets are exercised.

1. Start Auth and Firestore emulators:

   ```bash
   firebase emulators:start --only auth,firestore --project demo-ironlog
   ```

2. Start the local API in a separate persistent terminal session:

   ```bash
   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
   GCLOUD_PROJECT=demo-ironlog \
   E2E_BACKEND=emulator \
   VITE_FIREBASE_API_KEY=demo-api-key \
   VITE_FIREBASE_AUTH_DOMAIN=demo-ironlog.firebaseapp.com \
   VITE_FIREBASE_PROJECT_ID=demo-ironlog \
   VITE_FIREBASE_STORAGE_BUCKET=demo-ironlog.appspot.com \
   VITE_FIREBASE_MESSAGING_SENDER_ID=123456789 \
   VITE_FIREBASE_APP_ID=1:123456789:web:demo \
   VITE_FIREBASE_USE_EMULATORS=true \
   npm run dev:api
   ```

3. Build the release candidate with CSP enabled:

   ```bash
   E2E_BACKEND=emulator \
   E2E_CSP=true \
   VITE_FIREBASE_API_KEY=demo-api-key \
   VITE_FIREBASE_AUTH_DOMAIN=demo-ironlog.firebaseapp.com \
   VITE_FIREBASE_PROJECT_ID=demo-ironlog \
   VITE_FIREBASE_STORAGE_BUCKET=demo-ironlog.appspot.com \
   VITE_FIREBASE_MESSAGING_SENDER_ID=123456789 \
   VITE_FIREBASE_APP_ID=1:123456789:web:demo \
   VITE_FIREBASE_USE_EMULATORS=true \
   npm run build
   ```

4. Start the built preview:

   ```bash
   E2E_BACKEND=emulator \
   E2E_CSP=true \
   VITE_FIREBASE_API_KEY=demo-api-key \
   VITE_FIREBASE_AUTH_DOMAIN=demo-ironlog.firebaseapp.com \
   VITE_FIREBASE_PROJECT_ID=demo-ironlog \
   VITE_FIREBASE_STORAGE_BUCKET=demo-ironlog.appspot.com \
   VITE_FIREBASE_MESSAGING_SENDER_ID=123456789 \
   VITE_FIREBASE_APP_ID=1:123456789:web:demo \
   VITE_FIREBASE_USE_EMULATORS=true \
   npm run preview -- --host 127.0.0.1 --port 5174
   ```

5. Create the local acceptance account without printing returned tokens:

   ```bash
   node -e 'const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "e2e@ironlog.local", password: "ironlog-e2e", returnSecureToken: true }) }); const body = await response.json(); if (!response.ok && body.error?.message !== "EMAIL_EXISTS") throw new Error(body.error?.message ?? "Auth emulator bootstrap failed");'
   ```

6. Connect the in-app Browser to `http://127.0.0.1:5174`.

7. Capture Browser console messages, page errors, and failed requests throughout the manual walkthrough. Record expected emulator noise separately from product failures; do not silently discard it.

## Task 3 — Desktop smoke walkthrough

Use a representative desktop viewport of `1440 × 900`. Execute the flows serially and record a receipt at each important settled state.

1. Authentication and onboarding:
   - sign in with the local acceptance account;
   - complete onboarding if it appears;
   - confirm the authenticated shell, desktop rail, and dashboard load correctly.

2. Dashboard and readiness:
   - inspect dashboard metrics and empty/data states;
   - submit a readiness check;
   - reload and verify that the recorded state remains coherent.

3. Workout completion:
   - start a workout;
   - add a global exercise;
   - add at least one valid set;
   - finish the workout;
   - confirm its presence in history and open the workout detail;
   - verify that exercise identity and `exerciseSource` behavior are represented correctly.

4. Progress:
   - verify the 30-day and 90-day ranges;
   - confirm that charts, summaries, empty states, and navigation do not contradict the completed workout.

5. Templates:
   - create a template;
   - edit it;
   - start a workout from it;
   - discard that workout;
   - delete the template;
   - verify confirmation and post-action states.

6. Exercises:
   - create a custom exercise;
   - edit it;
   - verify it is distinguishable from global exercises;
   - delete it and confirm the resulting list state.

7. AI without a configured key:
   - open the AI surface;
   - attempt the supported no-key path;
   - verify that the UI communicates the limitation without crashing, hanging, or presenting a false success.

8. Profile:
   - update a reversible local preference;
   - reload the route;
   - verify persistence and unit presentation.

9. At the end of the desktop pass, confirm:
   - no active workout remains;
   - no broken overlays or covered controls remain;
   - no unexpected console error, page error, or failed request occurred.

## Task 4 — Mobile smoke walkthrough

Use a representative mobile viewport of `390 × 844`. Reuse the emulator account but begin from a settled state with no active workout.

1. Verify login/onboarding responsiveness if the session is not already authenticated.
2. Verify bottom/mobile navigation, safe-area spacing, and route transitions.
3. Verify dashboard and readiness presentation.
4. Start a workout, add an exercise and a set, then discard it.
5. Open history and workout detail.
6. Verify both Progress ranges and chart containment.
7. Open the template editor and exercise management surfaces.
8. Open the AI no-key state and the profile screen.
9. Check for:
   - horizontal overflow;
   - clipped content;
   - controls hidden behind navigation;
   - inaccessible dialogs or sheets;
   - tap targets that cannot be activated;
   - stale loading states.
10. Confirm a clean Browser runtime at the end of the pass.

## Task 5 — Keyboard and accessibility acceptance

Perform the manual keyboard walkthrough in Browser at desktop width:

1. Starting from the login screen, use `Tab` and `Shift+Tab` to verify a logical focus order and visible focus.
2. Use keyboard navigation on the desktop rail and mobile navigation where applicable.
3. Open and close a dialog or sheet with keyboard controls, including `Escape`.
4. Operate a primary form and confirmation action with `Enter` or `Space`.
5. Verify focus is not trapped incorrectly and does not move into hidden navigation.
6. Verify important validation and error messages are perceivable and associated with their controls.

After stopping the manual runtime, generate fresh structural accessibility evidence:

```bash
E2E_BACKEND=emulator \
TEST_EMAIL=e2e@ironlog.local \
TEST_PASSWORD=ironlog-e2e \
VITE_FIREBASE_API_KEY=demo-api-key \
VITE_FIREBASE_AUTH_DOMAIN=demo-ironlog.firebaseapp.com \
VITE_FIREBASE_PROJECT_ID=demo-ironlog \
VITE_FIREBASE_STORAGE_BUCKET=demo-ironlog.appspot.com \
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789 \
VITE_FIREBASE_APP_ID=1:123456789:web:demo \
VITE_FIREBASE_USE_EMULATORS=true \
firebase emulators:exec --only auth,firestore --project demo-ironlog \
  "npx playwright test tests/e2e/accessibility.spec.ts --project=desktop --project=mobile --retries=0"
```

List and review every generated ARIA snapshot:

```bash
find test-results -type f -name '*.aria.yml' -print
```

Record whether labels, landmarks, headings, dialogs, and interactive names agree with what was observed manually. The automated snapshots support the Browser observations; they do not replace them.

## Task 6 — Professional README, production demo, and documentation credibility

Use the same Browser as the only interactive observation surface. Open the public demo from `README.md` and perform read-only checks only.

1. Rewrite `README.md` as professional product and developer documentation:
   - remove every reference to a university assignment or assignment archive;
   - describe only capabilities confirmed in the current code;
   - present IronLog as a closed-source product rather than an open-source project;
   - omit demo credentials, repository links, local setup, tests, architecture, deployment, and contribution-oriented content;
   - keep the product link, privacy boundary, and representative screenshots;
   - apply `humanizer` and `my-humanizer`, then perform a final anti-AI language pass.
2. Sign in with the existing release-acceptance account. Do not publish its credentials in `README.md`, the report, logs, or screenshots.
3. Inspect, without modifying data:
   - dashboard;
   - history and a workout detail;
   - progress;
   - templates;
   - exercises;
   - AI no-key state if opening it is read-only;
   - profile display without saving.
4. Confirm the demo remains credible against the Phase 5 evidence:
   - populated workout history;
   - one or more useful templates/exercises;
   - plausible readiness and workout values;
   - no leftover active session.
5. Compare visible navigation, route names, key copy, and screen composition with:
   - `README.md`;
   - `docs/screenshots/app/`.
6. Capture representative desktop and mobile visual evidence from Browser.
7. If production differs because Phase 7 has not been deployed, record the mismatch as release evidence. Do not deploy from this path.
8. If production access is unavailable, mark RELEASE-05 as blocked or partial and keep 7B open instead of bypassing the check.

## Task 7 — Evaluate findings without expanding scope

For every finding:

1. Reproduce it at least once.
2. Classify it as:
   - release blocker;
   - acceptance defect;
   - documentation/demo mismatch;
   - non-blocking follow-up.
3. Verify the cause before changing code.
4. For a real defect, use the systematic debugging workflow, add the smallest useful regression test, implement the smallest coherent fix, and rerun:
   - the focused test;
   - lint for the touched area or full lint;
   - build if runtime code changed;
   - the exact Browser scenario that failed.
5. Do not fix unrelated cleanup opportunities.
6. Record non-blocking follow-ups in the acceptance report and the roadmap's later-work list.

RELEASE-06 is satisfied by measurement, not by automatic optimization:

- cite the Phase 7A production build result;
- record whether the current build emits a chunk warning;
- use observed route behavior as supporting evidence;
- only open an optimization path if a measured release-impacting problem exists.

## Task 8 — Review, verdict, and closeout

1. Run the verification appropriate to any files changed during 7B:

   ```bash
   npm run lint
   npm run build
   npm run test:unit
   git diff --check
   ```

2. Review the branch diff for:
   - acceptance-scope compliance;
   - accidental production changes;
   - secrets or returned auth tokens;
   - unrelated files;
   - missing evidence or unsupported “observed” claims.

3. Complete the acceptance report with one verdict:
   - `PASS` — RELEASE-02 through RELEASE-07 are satisfied;
   - `FAIL` — a reproduced blocker remains;
   - `BLOCKED` — required observation could not be completed.

4. Update `docs/roadmap/ROADMAP.md`:
   - mark 7B complete only when its acceptance gate passes;
   - preserve RELEASE-08 through RELEASE-10 as the next open path;
   - add only verified later-work items.

5. Mark this plan `COMPLETE`, `FAILED`, or `BLOCKED` consistently with the report.

6. Commit the 7B result without an AI co-author trailer:

   ```bash
   git add docs/roadmap/plans/2026-07-23-phase-7b-manual-release-acceptance.md \
     docs/audits/2026-07-23-phase-7b-manual-release-acceptance.md \
     docs/roadmap/ROADMAP.md
   git commit -m "docs: complete phase 7b manual acceptance"
   ```

   Add code and tests to the commit only if a verified acceptance defect required a fix.

7. Present the reviewed branch for the normal local integration choice. Do not push or deploy.

8. After integration:
   - perform the project-convergence closeout;
   - mark the 7B child complete in memory;
   - keep the Phase 7 parent active because RELEASE-08 through RELEASE-10 remain;
   - remove the execution worktree and branch after confirming the merge.

## Done when

- RELEASE-02 through RELEASE-07 have direct, reviewable evidence.
- Desktop and mobile manual scenarios are completed in Browser.
- Keyboard and ARIA evidence is reviewed.
- Runtime errors and failed requests are accounted for.
- Production demo and README credibility are checked without production mutation.
- Any accepted defect has been retested at the failing surface.
- The report, roadmap, and plan agree on the verdict.
- The branch is reviewed and ready for the normal integration step.
- RELEASE-08 through RELEASE-10 remain explicitly open as the next path.

## Closeout

Phase 7B was integrated locally into `puls-rebrand` by fast-forward to `49d7ccc`. The merged result passed lint, a production build with 879 transformed modules, 471/471 unit tests, and `git diff --check`. The phase-owned branch and worktree were removed. No push, deployment, production rule publication, or production data mutation was performed.

The Phase 7 parent remains active. Its next path is RELEASE-08 through RELEASE-10, which requires separate authorization for production operations.
