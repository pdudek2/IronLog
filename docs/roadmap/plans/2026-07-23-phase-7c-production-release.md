# Phase 7C Production Release Implementation Plan

**Status:** COMPLETE

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Archive the current `main`, promote Puls to the canonical branch and production, publish the required Firestore configuration, and close RELEASE-08 through RELEASE-10 with direct production evidence.

**Architecture:** Preserve two rollback points before changing production: the remote branch `main-before-puls-2026-07-23` at the current `origin/main` SHA and the current Vercel production deployment `dpl_HVft88xzWNQWeYWN2AgCGRntaLCY`. Publish additive indexes before the app, deploy API and SPA together through Vercel, verify finish/discard before tightening Firestore Rules, then repeat the final smoke under the new rules.

**Tech Stack:** Git/GitHub, Vercel CLI, Firebase CLI, Playwright, React 19, Vite 8, Firestore.

## Global Constraints

- Canonical parent: Phase 7. Current child: 7C / RELEASE-08 through RELEASE-10.
- Source branch: `puls-rebrand`; destination branch: `main`.
- Archive branch: `main-before-puls-2026-07-23`.
- Expected archive SHA: `1e5911fec7feacb137fa457b082c5029f2486c2d`.
- Vercel project: `iron-log`; Firebase project: `ironlog-ede05`.
- Use the private `.env.test` account only for mutating live checks. Never print or commit its values.
- Do not reseed or mutate the user's personal production account.
- Preserve `docs/audits/2026-07-14-senior-design-review.md`.
- Single-agent inline execution; no parallel deployment or observation surfaces.

---

### Task 1: Record release baseline and rollback points

**Files:**
- Create: `docs/audits/2026-07-23-phase-7c-production-release.md`
- Modify: `docs/roadmap/ROADMAP.md`

**Interfaces:**
- Consumes: integrated `puls-rebrand` at `cbdada6`
- Produces: immutable release baseline and recovery contract

- [x] Confirm `origin/main` and local `main` both equal the expected archive SHA.
- [x] Confirm the archive branch does not already exist remotely.
- [x] Record the current production deployment ID, URL, aliases, and Ready status without copying environment values.
- [x] Commit the plan, baseline report, and roadmap status before external mutation.

### Task 2: Run production preflight

**Files:**
- Modify: `docs/audits/2026-07-23-phase-7c-production-release.md`

**Interfaces:**
- Consumes: the exact candidate commit produced by Task 1
- Produces: green local and configuration gates

- [x] Run:

  ```bash
  npm run lint
  npm run build
  npm run test:unit
  npm run test:rules
  npm run test:integration:workout
  git diff --check
  ```

- [x] Run a Firebase dry run for indexes and rules:

  ```bash
  firebase deploy --only firestore:indexes,firestore:rules \
    --project ironlog-ede05 --dry-run
  ```

- [x] Confirm `.env.test` contains non-empty `TEST_EMAIL` and `TEST_PASSWORD` without printing them.
- [x] Stop before external mutation if any gate fails.

### Task 3: Archive main and publish prerequisites

**Files:**
- Modify: `docs/audits/2026-07-23-phase-7c-production-release.md`

**Interfaces:**
- Consumes: green Task 2 candidate
- Produces: remote Git rollback branch, ready indexes, and clean Vercel environment names

- [x] Create the archive branch at the exact old-main SHA and push it:

  ```bash
  git branch main-before-puls-2026-07-23 origin/main
  git push -u origin main-before-puls-2026-07-23
  ```

- [x] Verify the remote archive SHA before changing `main`.
- [x] Publish indexes and poll until all seven configured composite indexes are present:

  ```bash
  firebase deploy --only firestore:indexes --project ironlog-ede05
  firebase firestore:indexes --project ironlog-ede05
  ```

- [x] Remove the retired production analytics variables and verify their names are absent:

  ```bash
  vercel env rm VITE_CSQ_TAG_ID production --yes
  vercel env rm VITE_GA_MEASUREMENT_ID production --yes
  vercel env ls
  ```

- [x] Fast-forward local `main` to `puls-rebrand`, push `main`, and verify `origin/main` equals the candidate SHA.

### Task 4: Deploy Puls and verify the pre-rules boundary

**Files:**
- Modify: `docs/audits/2026-07-23-phase-7c-production-release.md`

**Interfaces:**
- Consumes: published Git candidate and ready indexes
- Produces: Ready Vercel deployment and successful workout closure under the previous rules

- [x] Deploy the exact candidate:

  ```bash
  vercel --prod --yes
  ```

- [x] If Vercel counts support files as functions, move the shared API implementation under the reserved `api/_lib` path, update imports, rerun the focused and release gates, commit and push the corrected candidate, then retry the deployment.
- [x] Inspect the returned deployment until Ready and verify `ironlog-coach.vercel.app` resolves to it.
- [x] Verify public `/login`, SPA routing, security headers, and the enforced CSP.
- [x] Using the private release account, execute one finish flow and one discard flow. Delete the temporary completed workout and confirm no active session remains.
- [x] If closure fails, roll Vercel back immediately and do not publish rules. Not triggered: both closure flows passed.

### Task 5: Publish restrictive rules and run the final live gate

**Files:**
- Modify: `docs/audits/2026-07-23-phase-7c-production-release.md`

**Interfaces:**
- Consumes: successful pre-rules finish/discard smoke
- Produces: final production data boundary and release evidence

- [x] Publish only Firestore Rules:

  ```bash
  firebase deploy --only firestore:rules --project ironlog-ede05
  ```

- [x] Repeat finish, discard, history, Progress, templates, exercises, AI no-key, and profile checks against the private release account; clean temporary data.
- [x] Run the full live Playwright command with zero retries. Classify any emulator-only harness incompatibility separately, but do not hide a product failure.
- [x] Confirm no requests to GA4, Google Tag Manager, Hotjar, or Contentsquare and classify runtime diagnostics.
- [x] Measure three cold dashboard loads to the ready state and report all samples plus the median. Do not optimize without a repeatable regression.

### Task 6: Final observation, rollback decision, and closeout

**Files:**
- Modify: `docs/audits/2026-07-23-phase-7c-production-release.md`
- Modify: `docs/roadmap/ROADMAP.md`
- Modify: `docs/roadmap/plans/2026-07-23-phase-7c-production-release.md`

**Interfaces:**
- Consumes: final production state after rules publication
- Produces: PASS, FAIL, or ROLLED BACK verdict

- [x] Observe the final production UI serially in the primary Browser surface and record one visual evidence receipt.
- [x] If the release fails after rules publication, run both rollback halves if required. Not triggered; both rollback halves remain documented and ready:

  ```bash
  vercel rollback dpl_HVft88xzWNQWeYWN2AgCGRntaLCY --yes
  ```

  Then restore `firestore.rules` from `main-before-puls-2026-07-23` using an isolated temporary worktree and redeploy only the rules. Additive indexes may remain.

- [x] Mark RELEASE-08 through RELEASE-10 complete only when the deployed app, rules, Network evidence, and measurements pass.
- [x] Commit and push the release evidence. Perform project-convergence closeout and memory save.

## Done When

- The old `main` is recoverable from the verified remote archive branch.
- The previous Vercel deployment remains a tested rollback target.
- `main` contains Puls and production serves the Puls deployment.
- All configured indexes and restrictive Firestore Rules are published.
- Finish and discard work after the rules change.
- CSP, analytics removal, runtime diagnostics, and cold-dashboard measurements have production evidence.
- The report and roadmap agree on the final verdict.
