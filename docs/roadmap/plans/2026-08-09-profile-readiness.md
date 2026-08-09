# Profile Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every protected route resolves the authenticated user's profile before rendering UI that depends on kg/lbs, while keeping missing-profile and read-error states truthful.

**Architecture:** Extend the existing Zustand profile store into the single account-bound profile resource and load it from a router-level profile gate. Keep `/logout` behind authentication but outside the profile gate, remove duplicate profile fetches from pages, and reuse the existing `ActionFeedback` and `LoadingState` UI.

**Tech Stack:** React 19, TypeScript, React Router 7, Zustand 5, Firebase Firestore, Vitest, Testing Library.

## Global Constraints

- Preserve the roadmap lineage: closed A–7 → closed 8A–9 → active data-reliability roadmap → `PROFILE-01`.
- Do not add dependencies, a React context/provider, a second profile cache, migration code, or speculative compatibility layers.
- Firestore access remains in `src/lib/userProfile.ts`; the store may call that service but must not call Firebase directly.
- Stored workout weights remain kilograms; `profile.units` changes display/input conversion only.
- `/logout` must remain reachable when profile loading fails.
- A missing profile redirects to `/onboarding`; a Firestore error must show retry and must not masquerade as missing profile or `kg`.
- Any UID change invalidates in-flight profile reads so one account cannot populate another account's store.
- Respect `react-hooks/set-state-in-effect`; do not add synchronous local state resets at the beginning of an effect.
- No full E2E suite or broad screenshot baseline is required for this change.
- Push and production deployment require separate user approval.

---

## File map

- `src/store/profileStore.ts` — authoritative account-bound profile state, load, retry, write-through update, and reset.
- `src/store/profileStore.test.ts` — focused success, failure, and stale-request regression checks.
- `src/lib/auth.ts` — clear the profile resource on every authenticated UID transition.
- `src/router/index.tsx` — keep the auth gate and add the profile gate around profile-dependent routes.
- `src/router/__tests__/ProfileRouteOutlet.test.tsx` — cold-route, retry, and onboarding route contracts.
- `src/pages/DashboardPage.tsx` — remove page-owned profile bootstrap and retain dashboard-data loading only.
- `src/pages/ProfilePage.tsx` — remove duplicate profile loading UI; write profile updates through the authoritative store.
- `src/pages/OnboardingPage.tsx` — publish the newly created profile into the account-bound store.
- `src/pages/WorkoutPage.tsx` — render session-volume summaries in the resolved profile units.
- `src/components/workout/WorkoutExerciseLedgerItem.tsx` — render exercise and set volume in the resolved profile units.
- `src/components/__tests__/WorkoutExerciseLedgerItem.test.tsx` — preserve the existing pounds boundary and cover volume display.
- `src/pages/__tests__/DashboardProjectionStatus.test.tsx` — align the profile-store mock with the final interface.
- `src/pages/__tests__/ProfilePage.test.tsx` — align the profile-store and profile-service mocks with the final interface.
- `docs/roadmap/ROADMAP.md` — record local gate state and the next lifecycle step after verification.

## Final interfaces

`src/store/profileStore.ts` must expose exactly this public state shape:

```ts
export type ProfileStatus = 'loading' | 'ready' | 'missing' | 'error'

interface ProfileState {
  profileUid: string | null
  profile: UserProfile | null
  status: ProfileStatus
  loadProfile: (uid: string) => Promise<void>
  setProfile: (uid: string, profile: UserProfile) => void
  resetProfile: () => void
}
```

The route structure must keep authentication and profile readiness separate:

```tsx
<Route element={<PrivateRouteOutlet />}>
  <Route path="/logout" element={<LogoutRoute />} />
  <Route element={<ProfileRouteOutlet />}>
    <Route path="/" element={<Navigate to="/dashboard" replace />} />
    <Route path="/onboarding" element={<OnboardingPage />} />
    <Route element={<AppLayout />}>
      {/* existing protected application routes */}
    </Route>
  </Route>
</Route>
```

---

### Task 1: Make profile readiness authoritative before protected-route render

**Files:**

- Modify: `src/store/profileStore.ts:1-16`
- Create: `src/store/profileStore.test.ts`
- Modify: `src/lib/auth.ts:62-86`
- Modify: `src/router/index.tsx:58-63,110-129`
- Create: `src/router/__tests__/ProfileRouteOutlet.test.tsx`
- Modify: `src/pages/DashboardPage.tsx:32,151-156,316-337,442-446`
- Modify: `src/pages/ProfilePage.tsx:1-9,18-125`
- Modify: `src/pages/OnboardingPage.tsx:18-51`
- Modify: `src/pages/__tests__/DashboardProjectionStatus.test.tsx:18-45`
- Modify: `src/pages/__tests__/ProfilePage.test.tsx:1-35`

**Interfaces:**

- Consumes: `getProfile(uid: string): Promise<UserProfile | null>` from `src/lib/userProfile.ts`.
- Produces: `ProfileStatus`, `loadProfile(uid)`, `setProfile(uid, profile)`, and `resetProfile()` from `useProfileStore`.
- Produces: exported `ProfileRouteOutlet` for the focused router contract test.
- Preserves: `profile: UserProfile | null` for existing consumers such as `WorkoutPage`.

- [x] **Step 1: Write the failing profile-store tests**

Create `src/store/profileStore.test.ts` with three contracts: an `lbs` profile becomes ready, a read failure becomes retryable error state, and an older account request cannot overwrite a newer one.

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserProfile } from '../lib/userProfile'
import { useProfileStore } from './profileStore'

const mocks = vi.hoisted(() => ({ getProfile: vi.fn() }))

vi.mock('../lib/userProfile', () => ({ getProfile: mocks.getProfile }))

const lbsProfile: UserProfile = {
  displayName: 'Patryk',
  weeklyGoal: 3,
  primaryGoal: 'strength',
  units: 'lbs',
  createdAt: 1,
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve })
  return { promise, resolve }
}

describe('profileStore readiness', () => {
  beforeEach(() => {
    mocks.getProfile.mockReset()
    useProfileStore.setState({
      profileUid: null,
      profile: null,
      status: 'loading',
    })
  })

  it('loads the authenticated account profile with its preferred units', async () => {
    mocks.getProfile.mockResolvedValue(lbsProfile)

    await useProfileStore.getState().loadProfile('user-1')

    expect(useProfileStore.getState()).toMatchObject({
      profileUid: 'user-1',
      profile: lbsProfile,
      status: 'ready',
    })
  })

  it('keeps a failed profile read distinct from a missing profile', async () => {
    mocks.getProfile.mockRejectedValue(new Error('offline'))

    await useProfileStore.getState().loadProfile('user-1')

    expect(useProfileStore.getState()).toMatchObject({
      profileUid: 'user-1',
      profile: null,
      status: 'error',
    })
  })

  it('ignores a stale response after the authenticated account changes', async () => {
    const oldRequest = deferred<UserProfile | null>()
    mocks.getProfile
      .mockReturnValueOnce(oldRequest.promise)
      .mockResolvedValueOnce({ ...lbsProfile, displayName: 'New account' })

    const firstLoad = useProfileStore.getState().loadProfile('user-1')
    await useProfileStore.getState().loadProfile('user-2')
    oldRequest.resolve(lbsProfile)
    await firstLoad

    expect(useProfileStore.getState()).toMatchObject({
      profileUid: 'user-2',
      profile: { displayName: 'New account' },
      status: 'ready',
    })
  })
})
```

- [x] **Step 2: Run the store test and confirm RED**

Run:

```bash
npx vitest run src/store/profileStore.test.ts
```

Expected: FAIL because `loadProfile`, `profileUid`, and `status` do not exist yet.

- [x] **Step 3: Implement the minimum account-bound profile resource**

Replace the current `loading`/`setLoading` store contract in `src/store/profileStore.ts`. Use one module-local request version to invalidate stale reads; do not add AbortController or a cache.

```ts
import { create } from 'zustand'
import { getProfile, type UserProfile } from '../lib/userProfile'

export type ProfileStatus = 'loading' | 'ready' | 'missing' | 'error'

interface ProfileState {
  profileUid: string | null
  profile: UserProfile | null
  status: ProfileStatus
  loadProfile: (uid: string) => Promise<void>
  setProfile: (uid: string, profile: UserProfile) => void
  resetProfile: () => void
}

let profileRequestVersion = 0

export const useProfileStore = create<ProfileState>((set, get) => ({
  profileUid: null,
  profile: null,
  status: 'loading',
  loadProfile: async (uid) => {
    const requestVersion = ++profileRequestVersion
    set({ profileUid: uid, profile: null, status: 'loading' })

    try {
      const profile = await getProfile(uid)
      if (requestVersion !== profileRequestVersion || get().profileUid !== uid) return
      set({ profile, status: profile ? 'ready' : 'missing' })
    } catch {
      if (requestVersion !== profileRequestVersion || get().profileUid !== uid) return
      set({ profile: null, status: 'error' })
    }
  },
  setProfile: (uid, profile) => {
    profileRequestVersion += 1
    set({ profileUid: uid, profile, status: 'ready' })
  },
  resetProfile: () => {
    profileRequestVersion += 1
    set({ profileUid: null, profile: null, status: 'loading' })
  },
}))
```

- [x] **Step 4: Run the store test and confirm GREEN**

Run:

```bash
npx vitest run src/store/profileStore.test.ts
```

Expected: `1` file and `3` tests PASS.

- [x] **Step 5: Write the failing route-gate tests**

Create `src/router/__tests__/ProfileRouteOutlet.test.tsx`. Use the real Zustand stores, mock only `getProfile`, and render `ProfileRouteOutlet` with a memory router. Cover these observable contracts:

```tsx
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { User } from 'firebase/auth'
import type { UserProfile } from '../../lib/userProfile'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useProfileStore } from '../../store/profileStore'
import { ProfileRouteOutlet } from '../index'

const mocks = vi.hoisted(() => ({ getProfile: vi.fn() }))

vi.mock('../../lib/userProfile', () => ({ getProfile: mocks.getProfile }))

const lbsProfile: UserProfile = {
  displayName: 'Patryk',
  weeklyGoal: 3,
  primaryGoal: 'strength',
  units: 'lbs',
  createdAt: 1,
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve })
  return { promise, resolve }
}

function ProtectedProbe() {
  const profile = useProfileStore((state) => state.profile)
  return <p data-testid="protected-content">units:{profile?.units}</p>
}

function renderProfileRouter(initialEntry: string) {
  const router = createMemoryRouter([
    {
      element: <ProfileRouteOutlet />,
      children: [
        { path: '/workout/new', element: <ProtectedProbe /> },
        { path: '/onboarding', element: <p>onboarding</p> },
        { path: '/dashboard', element: <p>dashboard</p> },
      ],
    },
  ], { initialEntries: [initialEntry] })

  render(<RouterProvider router={router} />)
}

beforeEach(() => {
  mocks.getProfile.mockReset()
  useAuthStore.setState({
    user: { uid: 'user-1' } as User,
    loading: false,
  })
  useProfileStore.getState().resetProfile()
})

describe('ProfileRouteOutlet', () => {
it('waits for an lbs profile before rendering a cold workout route', async () => {
  const request = deferred<UserProfile | null>()
  mocks.getProfile.mockReturnValue(request.promise)
  renderProfileRouter('/workout/new')

  expect(screen.getByText('Wczytywanie profilu...')).toBeInTheDocument()
  expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()

  act(() => request.resolve(lbsProfile))

  expect(await screen.findByText('units:lbs')).toBeInTheDocument()
})

it('shows a retryable error instead of onboarding or implicit kg', async () => {
  mocks.getProfile
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(lbsProfile)
  renderProfileRouter('/workout/new')

  expect(await screen.findByRole('alert')).toHaveTextContent('Nie udało się wczytać profilu')
  fireEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))

  expect(await screen.findByText('units:lbs')).toBeInTheDocument()
})

it('routes an authenticated account without a profile to onboarding', async () => {
  mocks.getProfile.mockResolvedValue(null)
  renderProfileRouter('/workout/new')

  expect(await screen.findByText('onboarding')).toBeInTheDocument()
})
})
```

- [x] **Step 6: Run the route test and confirm RED**

Run:

```bash
npx vitest run src/router/__tests__/ProfileRouteOutlet.test.tsx
```

Expected: FAIL because `ProfileRouteOutlet` does not exist and protected children currently render after auth alone.

- [x] **Step 7: Reset profile state on every account transition**

In `src/lib/auth.ts`, keep the existing UID comparison and reset profile alongside workout/dashboard state. Remove the `if (!user)` block and the obsolete `setLoading` calls.

```ts
if (previousUid !== nextUid) {
  useWorkoutStore.getState().clearWorkout()
  useDashboardStore.getState().clearSnapshot()
  useProfileStore.getState().resetProfile()
}
```

- [x] **Step 8: Add the profile route gate using existing UI**

Export `ProfileRouteOutlet` from `src/router/index.tsx`. It must initiate a read only when `profileUid !== user.uid`, show `LoadingState` while unresolved, reuse `ActionFeedback` for retry, distinguish `missing` from `error`, and redirect a completed profile away from onboarding.

```tsx
export function ProfileRouteOutlet() {
  const { user } = useAuthStore()
  const location = useLocation()
  const { profileUid, status, loadProfile } = useProfileStore()

  useEffect(() => {
    if (user && profileUid !== user.uid) void loadProfile(user.uid)
  }, [loadProfile, profileUid, user])

  if (!user || profileUid !== user.uid || status === 'loading') {
    return <LoadingState message="Wczytywanie profilu..." />
  }

  if (status === 'error') {
    return (
      <div className="page-shell flex items-center justify-center">
        <div className="page-container max-w-lg">
          <ActionFeedback
            status="error"
            message="Nie udało się wczytać profilu. Sprawdź połączenie i spróbuj ponownie."
            onRetry={() => { void loadProfile(user.uid) }}
          />
        </div>
      </div>
    )
  }

  if (status === 'missing') {
    return location.pathname === '/onboarding'
      ? <Outlet />
      : <Navigate to="/onboarding" replace />
  }

  return location.pathname === '/onboarding'
    ? <Navigate to="/dashboard" replace />
    : <Outlet />
}
```

Import `ActionFeedback` and `useProfileStore`, then apply the nested route structure from **Final interfaces**. Do not place `/logout` inside `ProfileRouteOutlet`.

- [x] **Step 9: Remove duplicate page-owned profile bootstrap**

Make these minimal consumer changes:

- `DashboardPage.tsx`: remove the `getProfile` import and the profile-fetch branch; fetch dashboard data once `user` exists. Change its loading guard to `!dashboardReady && !!user`.

```tsx
const { profile } = useProfileStore()

useEffect(() => {
  if (!user) return
  void Promise.resolve()
    .then(() => fetchData(user.uid))
    .catch(handleDashboardFetchError)
}, [dashboardLoadAttempt, user, fetchData, handleDashboardFetchError])

if (!dashboardReady && !!user) {
  return <LoadingState message="Ładowanie dashboardu..." />
}
```

- `ProfilePage.tsx`: remove `getProfile`, `useNavigate`, `bootstrapping`, `profileLoadError`, `loadAttempt`, the page-owned load effect, and its duplicate load/error views. Preserve the form-sync effect. After a successful update, call:

```ts
setProfile(user.uid, { ...profile, ...updated })
```

- `OnboardingPage.tsx`: after `saveProfile`, call:

```ts
setProfile(user.uid, profile)
```

- Update the two existing page-test mocks to expose only the final store fields they consume. Remove obsolete `getProfile`, `loading`, and `setLoading` mocks.

- [x] **Step 10: Run the focused regression set**

Run:

```bash
npx vitest run \
  src/store/profileStore.test.ts \
  src/router/__tests__/ProfileRouteOutlet.test.tsx \
  src/pages/__tests__/ProfilePage.test.tsx \
  src/pages/__tests__/DashboardProjectionStatus.test.tsx \
  src/pages/__tests__/WorkoutStaleSessionFeedback.test.tsx
```

Expected: all listed files PASS. `WorkoutStaleSessionFeedback` protects the existing direct `WorkoutPage` test harness that deliberately supplies `profile: null`.

- [x] **Step 11: Run static gates**

Run:

```bash
npm run lint
npm run build
git diff --check
```

Expected: all commands exit `0`. Confirm `rg -n "getProfile|setLoading" src/pages/DashboardPage.tsx src/pages/ProfilePage.tsx` returns no matches.

- [x] **Step 12: Review the whole implementation diff**

Check these failure boundaries directly in the diff:

- account A's pending read cannot populate account B;
- `missing` and `error` take different routes;
- `/logout` is not blocked by profile failure;
- no protected unit-dependent screen renders before profile readiness;
- onboarding and profile updates write through with the current UID;
- no second provider, cache, or compatibility adapter was introduced.

- [x] **Step 13: Commit the implementation**

```bash
git add \
  src/store/profileStore.ts \
  src/store/profileStore.test.ts \
  src/lib/auth.ts \
  src/router/index.tsx \
  src/router/__tests__/ProfileRouteOutlet.test.tsx \
  src/pages/DashboardPage.tsx \
  src/pages/ProfilePage.tsx \
  src/pages/OnboardingPage.tsx \
  src/pages/__tests__/DashboardProjectionStatus.test.tsx \
  src/pages/__tests__/ProfilePage.test.tsx
git commit -m "fix profile readiness before protected routes"
```

---

### Task 2: Record the elevated-risk local gate

**Files:**

- Modify: `docs/roadmap/ROADMAP.md`
- Modify: `docs/roadmap/plans/2026-08-09-profile-readiness.md`

**Interfaces:**

- Consumes: the committed `PROFILE-01` implementation and passing focused/static gates from Task 1.
- Produces: an evidence-backed `INTEGRATION PENDING` state; it does not push or deploy.

- [x] **Step 1: Read the visual-observation contract before runtime validation**

Read:

```bash
cat /Users/patryk/.codex/skills/project-convergence/references/visual-observation.md
```

Use exactly one primary observation surface selected by that contract.

- [x] **Step 2: Observe a cold `lbs` route directly**

Run the local app with the existing emulator workflow. Using one emulator account whose profile has `units: 'lbs'`:

1. open `/workout/new` directly in a fresh page or hard reload it;
2. confirm the profile-loading state appears before the workout UI;
3. confirm weight inputs and unit labels render as `lbs` on first protected render;
4. confirm no intermediate `kg` UI is exposed;
5. confirm browser console errors are empty for this flow.

Record the result as `Observed` with the surface and viewport. If direct observation cannot run, record the gate as pending; do not substitute a screenshot or test result.

- [x] **Step 3: Record failure-path and recovery evidence**

In the plan's execution notes, record:

- passing test name for the profile-read error and retry;
- passing test name for the stale account response;
- lint/build results;
- direct-observation result;
- rollout decision: no migration and no Firestore rules/index publication;
- recovery decision: revert the implementation commit before release, or roll back the resulting Vercel deployment after release.

- [x] **Step 4: Move the roadmap to integration pending**

Only when every local gate above passes:

- set `PROFILE-01` to `INTEGRATION PENDING` in `docs/roadmap/ROADMAP.md`;
- leave `CATALOG-01` blocked until production closeout;
- append a short execution-evidence section to this plan with exact commands and results;
- do not mark `PROFILE-01` done and do not delete this plan yet.

- [x] **Step 5: Commit the local gate evidence**

```bash
git add docs/roadmap/ROADMAP.md docs/roadmap/plans/2026-08-09-profile-readiness.md
git commit -m "docs: record profile readiness gate"
```

Stop for explicit user approval before push or production deployment.

---

## Execution evidence — 2026-08-09

- Implementation commit: `2e52f9c fix profile readiness before protected routes`.
- RED: the new store and router contract run failed as expected because the old
  store did not expose `loadProfile`/`resetProfile` or account-bound readiness.
- Focused GREEN:
  `/Users/patryk/.local/bin/node node_modules/vitest/vitest.mjs run src/store/profileStore.test.ts src/router/__tests__/ProfileRouteOutlet.test.tsx src/pages/__tests__/ProfilePage.test.tsx src/pages/__tests__/DashboardProjectionStatus.test.tsx src/pages/__tests__/WorkoutStaleSessionFeedback.test.tsx`
  — 5 files, 30 tests passed.
- Unit GREEN:
  `/Users/patryk/.local/bin/node node_modules/vitest/vitest.mjs run` — 66 files,
  498 tests passed. The explicit Node 22 runtime avoids the broken experimental
  `localStorage` global exposed by the machine's Node 25 installation.
- Static GREEN:
  `/Users/patryk/.local/bin/node node_modules/eslint/bin/eslint.js .`,
  `/Users/patryk/.local/bin/node node_modules/typescript/bin/tsc -b && /Users/patryk/.local/bin/node node_modules/vite/bin/vite.js build`
  (879 modules), and `git diff --check` all exited `0`.
- Failure-path evidence: `keeps a failed profile read distinct from a missing
  profile`, `shows a retryable error instead of onboarding or implicit kg`, and
  `ignores a stale response after the authenticated account changes` passed.
- **Observed — Codex in-app browser, 1280×720, local Auth/Firestore emulators:**
  cold reload of `http://127.0.0.1:5174/workout/new` first returned only
  `Wczytywanie profilu...`; the completed protected render exposed
  `Ciężar, Squat, seria 1, lbs`, contained `lbs`, contained no `kg`, and returned
  an empty console-error list. The first observation exposed hard-coded `kg` in
  volume summaries; those call sites were corrected before the successful rerun
  and covered by the existing ledger unit test.
- Rollout: no data migration and no Firestore rules or index publication.
- Recovery: revert `2e52f9c` before release, or roll back the resulting Vercel
  deployment after release.

---

## Production closeout after separate approval

After push and production deployment:

1. verify the exact production deployment reports `Ready`;
2. directly observe a cold authenticated `/workout/new` reload for an `lbs` account if a safe production account/session is available; otherwise report authenticated production observation as pending rather than borrowing local evidence;
3. set `PROFILE-01` to `DONE` and `CATALOG-01` to `READY`;
4. preserve final evidence in the roadmap or a compact audit receipt;
5. delete this completed plan after Git history and the roadmap preserve its remaining value;
6. commit and push the closeout only with explicit authority.

## Self-review result

- Spec coverage: every `PROFILE-01` contract maps to Task 1 or the elevated-risk gate in Task 2.
- Placeholder scan: no deferred implementation steps or unspecified error-handling instructions remain.
- Type consistency: every consumer uses `setProfile(uid, profile)` and the route/store share the same four profile statuses.
- Simplicity check: one existing store, one in-file router gate, no provider, no dependency, no migration, and no broad E2E expansion.
