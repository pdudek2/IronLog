# IronLog Faza 2 — uczciwe stany danych i błędów: plan wdrożenia

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Błąd odczytu readiness, własnych ćwiczeń albo szablonów nigdy nie wygląda jak poprawny pusty stan, a każdy objęty błąd ma trwały komunikat i retry.

**Architecture:** Wspólny typ `DataState<T>` rozróżnia `loading`, `success` i `error`. Pusty stan wynika wyłącznie z `success` z `[]` albo `null`. Każdy komponent zachowuje własny loader, identyfikator requestu i retry; nie powstaje wspólny hook ani nowy framework zapytań.

**Tech Stack:** React 19, TypeScript 5.9, Vite 8, Vitest 4, Testing Library, Firebase Web SDK, Playwright 1.59.

**Approved design:** `docs/roadmap/specs/2026-07-12-phase-2-honest-data-states-design.md`

**Base commit:** `1ca8682` na branchu `puls-rebrand`.

**Status wykonania:** COMPLETE. Wszystkie kroki i Definition of Done zostały wykonane. Historyczne oczekiwania komend pozostają poniżej bez zmian; końcowe korekty broad final review i aktualna bramka 35 plików / 229 testów są udokumentowane w `.superpowers/sdd/final-fixes-report.md`.

## Global Constraints

- Statusy i kody w TypeScript pozostają po angielsku; tekst UI jest po polsku.
- Nie dodawać React Query, SWR, nowego generycznego hooka ani zależności npm.
- Odczyty Firestore pozostają w `src/lib/`; komponenty nie używają bezpośrednio `getDoc` ani `getDocs`.
- Nie ustawiać stanu synchronicznie na początku `useEffect`. Stan początkowy ma pochodzić z `useState`, a loading dla retry z handlera użytkownika.
- Nie wprowadzać retained snapshotu, automatycznego retry w tle ani cache między trasami.
- Nie zmieniać wtórnych konsumentów `getUserExercises`. Ich zakres pozostaje w `LATER-07`.
- Nie zmieniać schematu Firestore, reguł, API ani danych produkcyjnych.
- Nie wykonywać pushu, deployu ani publikacji reguł. `RELEASE-08` pozostaje otwarte.
- Każde zadanie stosuje TDD i kończy się osobnym commitem bez trailerów AI.

---

## Mapa plików

| Plik | Odpowiedzialność |
|---|---|
| `src/types/dataState.ts` | Wspólna unia `DataState<T>` bez logiki pobierania. |
| `src/lib/readinessService.ts` | Odczyt readiness dla jawnie wskazanej daty. |
| `src/lib/__tests__/readinessService.test.ts` | Kontrakt ID dokumentu i odpowiedzi `null`. |
| `src/components/ReadinessWidget.tsx` | Jeden odczyt UID + data, rollover dnia, retry i uczciwy błąd. |
| `src/pages/__tests__/ReadinessWidget.test.tsx` | StrictMode, error/empty, retry, rollover i wyścig odpowiedzi. |
| `src/pages/ExercisesPage.tsx` | `DataState<Exercise[]>` dla własnej biblioteki i dostępny katalog globalny. |
| `src/pages/__tests__/ExercisesPageDataState.test.tsx` | Błąd, poprawna pusta lista i recovery po retry. |
| `src/pages/DashboardPage.tsx` | Niezależny stan szablonów w sekcji „Plany”. |
| `src/pages/__tests__/DashboardProjectionStatus.test.tsx` | Regresja błędu, pustej listy i danych szablonów na dashboardzie. |
| `src/pages/__tests__/TemplatesPageDataState.test.tsx` | Ochrona istniejącego kontraktu error/empty/retry strony planów. |
| `docs/roadmap/ROADMAP.md` | Zamknięcie Fazy 2 i aktualny baseline testów. |
| `docs/roadmap/specs/2026-07-12-phase-2-honest-data-states-design.md` | Status wdrożenia i dowody weryfikacji. |

---

### Task 1: Wspólny kontrakt danych i odczyt readiness dla wskazanej daty

**Files:**
- Create: `src/types/dataState.ts`
- Modify: `src/lib/readinessService.ts`
- Modify: `src/lib/__tests__/readinessService.test.ts`

**Interfaces:**
- Produces: `DataState<T>`.
- Produces: `getReadiness(uid: string, date: string): Promise<ReadinessEntry | null>`.
- Preserves: `getTodayReadiness(uid: string): Promise<ReadinessEntry | null>` jako wrapper kompatybilności.

- [x] **Step 1: Rozszerz mock Firestore i dopisz dwa testy odczytu daty**

Na początku `src/lib/__tests__/readinessService.test.ts` zastąp obecne mocki tym blokiem:

```ts
const firestore = vi.hoisted(() => ({
  doc: vi.fn(() => 'readiness-ref'),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
}))

vi.mock('../firebase', () => ({ db: { name: 'test-db' }, auth: {} }))
vi.mock('firebase/firestore', () => ({
  doc: firestore.doc,
  getDoc: firestore.getDoc,
  setDoc: firestore.setDoc,
}))

import { computeReadinessScore, getReadiness } from '../readinessService'
```

Przed istniejącym `describe('computeReadinessScore')` dodaj:

```ts
describe('getReadiness', () => {
  it('reads the document for the exact local date supplied by the caller', async () => {
    firestore.getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        userId: 'user-1',
        date: '2026-07-12',
        sleep: 4,
        mood: 5,
        soreness: 2,
        createdAt: 123,
      }),
    })

    await expect(getReadiness('user-1', '2026-07-12')).resolves.toEqual({
      userId: 'user-1',
      date: '2026-07-12',
      sleep: 4,
      mood: 5,
      soreness: 2,
      createdAt: 123,
    })
    expect(firestore.doc).toHaveBeenCalledWith(
      { name: 'test-db' },
      'readiness',
      'user-1_2026-07-12',
    )
  })

  it('returns null only when the requested document does not exist', async () => {
    firestore.getDoc.mockResolvedValueOnce({ exists: () => false })

    await expect(getReadiness('user-1', '2026-07-12')).resolves.toBeNull()
  })
})
```

- [x] **Step 2: Uruchom test i potwierdź czerwony stan**

Run:

```bash
npm run test:unit -- src/lib/__tests__/readinessService.test.ts
```

Expected: FAIL, ponieważ `getReadiness` nie jest eksportowane.

- [x] **Step 3: Dodaj typ i jawny odczyt daty**

Utwórz `src/types/dataState.ts`:

```ts
export type DataState<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: unknown }
```

W `src/lib/readinessService.ts` zastąp `getTodayReadiness` tymi funkcjami:

```ts
export async function getReadiness(
  uid: string,
  date: string,
): Promise<ReadinessEntry | null> {
  const snap = await getDoc(doc(db, 'readiness', buildDocId(uid, date)))
  if (!snap.exists()) return null
  const data = snap.data()
  return {
    userId: String(data.userId ?? ''),
    date: String(data.date ?? ''),
    sleep: Number(data.sleep ?? 3),
    mood: Number(data.mood ?? 3),
    soreness: Number(data.soreness ?? 3),
    createdAt: Number(data.createdAt ?? 0),
  }
}

export function getTodayReadiness(uid: string): Promise<ReadinessEntry | null> {
  return getReadiness(uid, todayKey())
}
```

- [x] **Step 4: Uruchom test serwisu**

Run:

```bash
npm run test:unit -- src/lib/__tests__/readinessService.test.ts
```

Expected: PASS, 9 testów w pliku.

- [x] **Step 5: Sprawdź typy i wykonaj commit**

Run:

```bash
npm run build
git diff --check
git add src/types/dataState.ts src/lib/readinessService.ts src/lib/__tests__/readinessService.test.ts
git commit -m "refactor: add explicit readiness data contract"
```

Expected: build przechodzi; commit zawiera wyłącznie trzy wskazane pliki.

---

### Task 2: Readiness rozróżnia błąd, brak wpisu i zmianę dnia

**Files:**
- Create: `src/pages/__tests__/ReadinessWidget.test.tsx`
- Modify: `src/components/ReadinessWidget.tsx`

**Interfaces:**
- Consumes: `DataState<ReadinessEntry | null>` z Task 1.
- Consumes: `getReadiness(uid, date)` z Task 1.
- Produces: jeden request dla klucza UID + data, także pod `React.StrictMode`.

- [x] **Step 1: Napisz testy kontraktu widgetu**

Utwórz `src/pages/__tests__/ReadinessWidget.test.tsx`:

```tsx
import { StrictMode, createElement, type ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReadinessEntry } from '../../lib/readinessService'
import ReadinessWidget from '../../components/ReadinessWidget'

const mocks = vi.hoisted(() => ({
  currentDate: '2026-07-12',
  getReadiness: vi.fn(),
}))

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({ user: { uid: 'user-1' } }),
}))

vi.mock('../../lib/readinessService', () => ({
  todayKey: () => mocks.currentDate,
  getReadiness: mocks.getReadiness,
  computeReadinessScore: (entry: ReadinessEntry) => ({
    score: entry.sleep,
    tone: 'high',
    color: 'var(--accent)',
    label: entry.date,
  }),
}))

vi.mock('../../components/ReadinessPrompt', () => ({
  default: () => <div>readiness-prompt</div>,
}))

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_target, tag: string | symbol) => {
      if (typeof tag !== 'string') return undefined
      return ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => {
        delete props.initial
        delete props.animate
        delete props.transition
        return createElement(tag, props, children)
      }
    },
  }),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

function entry(date: string, sleep = 4): ReadinessEntry {
  return {
    userId: 'user-1',
    date,
    sleep,
    mood: 4,
    soreness: 2,
    createdAt: 123,
  }
}

describe('ReadinessWidget data states', () => {
  beforeEach(() => {
    mocks.currentDate = '2026-07-12'
    mocks.getReadiness.mockReset()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  })

  it('performs one initial read in StrictMode and renders the prompt only for success null', async () => {
    const request = deferred<ReadinessEntry | null>()
    mocks.getReadiness.mockReturnValueOnce(request.promise)

    render(<StrictMode><ReadinessWidget /></StrictMode>)

    await waitFor(() => expect(mocks.getReadiness).toHaveBeenCalledTimes(1))
    await act(async () => request.resolve(null))
    expect(await screen.findByText('readiness-prompt')).toBeInTheDocument()
  })

  it('renders a persistent error instead of the prompt and recovers through retry', async () => {
    mocks.getReadiness
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(entry('2026-07-12'))

    render(<ReadinessWidget />)

    expect(await screen.findByText('Nie udało się wczytać gotowości')).toBeInTheDocument()
    expect(screen.queryByText('readiness-prompt')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))
    expect(await screen.findByText('2026-07-12')).toBeInTheDocument()
    expect(mocks.getReadiness).toHaveBeenCalledTimes(2)
  })

  it('does not refetch on the same day and reads exactly once after the day changes', async () => {
    mocks.getReadiness.mockImplementation(
      (_uid: string, date: string) => Promise.resolve(entry(date)),
    )

    render(<StrictMode><ReadinessWidget /></StrictMode>)
    expect(await screen.findByText('2026-07-12')).toBeInTheDocument()

    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(mocks.getReadiness).toHaveBeenCalledTimes(1)

    mocks.currentDate = '2026-07-13'
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(await screen.findByText('2026-07-13')).toBeInTheDocument()
    expect(mocks.getReadiness).toHaveBeenCalledTimes(2)
    expect(mocks.getReadiness).toHaveBeenLastCalledWith('user-1', '2026-07-13')
  })

  it('ignores a late response from the previous day', async () => {
    const oldDay = deferred<ReadinessEntry | null>()
    const newDay = deferred<ReadinessEntry | null>()
    mocks.getReadiness
      .mockReturnValueOnce(oldDay.promise)
      .mockReturnValueOnce(newDay.promise)

    render(<ReadinessWidget />)
    await waitFor(() => expect(mocks.getReadiness).toHaveBeenCalledTimes(1))

    mocks.currentDate = '2026-07-13'
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    await waitFor(() => expect(mocks.getReadiness).toHaveBeenCalledTimes(2))

    await act(async () => newDay.resolve(entry('2026-07-13', 5)))
    expect(await screen.findByText('2026-07-13')).toBeInTheDocument()
    await act(async () => oldDay.resolve(entry('2026-07-12', 1)))
    expect(screen.getByText('2026-07-13')).toBeInTheDocument()
    expect(screen.queryByText('2026-07-12')).not.toBeInTheDocument()
  })
})
```

- [x] **Step 2: Uruchom test i potwierdź błędy**

Run:

```bash
npm run test:unit -- src/pages/__tests__/ReadinessWidget.test.tsx
```

Expected: FAIL. Obecny widget importuje `getTodayReadiness`, po błędzie pokazuje prompt i wykonuje dodatkowy odczyt.

- [x] **Step 3: Zastąp loader widgetu stanem kluczowanym przez UID i datę**

W `src/components/ReadinessWidget.tsx`:

1. rozszerz import Reacta o `useCallback` i `useRef`;
2. importuj `Button`, `DataState` i `getReadiness`;
3. usuń `entry` oraz `lastCheckedDate`;
4. wstaw poniższy stan i loader na początku komponentu.

```tsx
interface ReadinessResource {
  key: string
  state: DataState<ReadinessEntry | null>
}

function resourceKey(uid: string, date: string): string {
  return `${uid}:${date}`
}

export default function ReadinessWidget() {
  const { user } = useAuthStore()
  const initialDate = todayKey()
  const [resource, setResource] = useState<ReadinessResource>({
    key: user ? resourceKey(user.uid, initialDate) : '',
    state: { status: 'loading' },
  })
  const mountedRef = useRef(false)
  const requestIdRef = useRef(0)
  const requestedKeyRef = useRef('')
  const inFlightKeyRef = useRef('')

  const loadReadiness = useCallback((uid: string, date: string) => {
    const key = resourceKey(uid, date)
    if (inFlightKeyRef.current === key) return

    const requestId = ++requestIdRef.current
    inFlightKeyRef.current = key
    getReadiness(uid, date)
      .then((data) => {
        if (!mountedRef.current || requestId !== requestIdRef.current) return
        setResource({ key, state: { status: 'success', data } })
      })
      .catch((error: unknown) => {
        console.error('[ReadinessWidget] load failed', error)
        if (!mountedRef.current || requestId !== requestIdRef.current) return
        setResource({ key, state: { status: 'error', error } })
      })
      .finally(() => {
        if (requestId === requestIdRef.current) inFlightKeyRef.current = ''
      })
  }, [])

  useEffect(() => {
    if (!user) return
    mountedRef.current = true

    const requestCurrentDay = () => {
      const date = todayKey()
      const key = resourceKey(user.uid, date)
      if (requestedKeyRef.current === key) return
      requestedKeyRef.current = key
      loadReadiness(user.uid, date)
    }

    requestCurrentDay()

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      const date = todayKey()
      const key = resourceKey(user.uid, date)
      if (requestedKeyRef.current === key) return
      requestedKeyRef.current = key
      setResource({ key, state: { status: 'loading' } })
      loadReadiness(user.uid, date)
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      mountedRef.current = false
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [loadReadiness, user])

  const date = todayKey()
  const key = user ? resourceKey(user.uid, date) : ''
  const state: DataState<ReadinessEntry | null> = resource.key === key
    ? resource.state
    : { status: 'loading' }

  function handleRetry() {
    if (!user) return
    const retryDate = todayKey()
    const retryKey = resourceKey(user.uid, retryDate)
    requestedKeyRef.current = retryKey
    setResource({ key: retryKey, state: { status: 'loading' } })
    loadReadiness(user.uid, retryDate)
  }
```

Zastąp trzy obecne gałęzie `undefined/null/entry` tym blokiem. Istniejący JSX zapisanej karty pozostaje bez zmian po przypisaniu `entry`:

```tsx
  if (state.status === 'loading') {
    return (
      <div
        className="readiness-card readiness-card--loading animate-pulse"
        style={{ minHeight: '5rem' }}
      />
    )
  }

  if (state.status === 'error') {
    return (
      <motion.div
        className="readiness-card"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <p className="text-sm font-semibold text-white">
          Nie udało się wczytać gotowości
        </p>
        <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
          Sprawdź połączenie i spróbuj ponownie.
        </p>
        <Button type="button" className="mt-4" onClick={handleRetry}>
          Spróbuj ponownie
        </Button>
      </motion.div>
    )
  }

  if (state.data === null) {
    return (
      <ReadinessPrompt
        onSaved={(saved) => setResource({
          key,
          state: { status: 'success', data: saved },
        })}
      />
    )
  }

  const entry = state.data
```

- [x] **Step 4: Uruchom test widgetu, lint i test serwisu**

Run:

```bash
npm run test:unit -- src/pages/__tests__/ReadinessWidget.test.tsx src/lib/__tests__/readinessService.test.ts
npm run lint
```

Expected: oba pliki przechodzą; lint nie zgłasza `set-state-in-effect` ani brakujących zależności hooków.

- [x] **Step 5: Wykonaj commit**

```bash
git diff --check
git add src/components/ReadinessWidget.tsx src/pages/__tests__/ReadinessWidget.test.tsx
git commit -m "fix: make readiness loading states honest"
```

---

### Task 3: Własna biblioteka ćwiczeń odróżnia błąd od pustej listy

**Files:**
- Create: `src/pages/__tests__/ExercisesPageDataState.test.tsx`
- Modify: `src/pages/ExercisesPage.tsx`

**Interfaces:**
- Consumes: `DataState<Exercise[]>`.
- Produces: trwały błąd sekcji z retry; katalog globalny pozostaje aktywny.
- Preserves: `data-load-state="loading" | "error" | "ready"` dla `expectAppReady`.

- [x] **Step 1: Napisz trzy testy strony ćwiczeń**

Utwórz `src/pages/__tests__/ExercisesPageDataState.test.tsx`:

```tsx
import { createElement, type ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ExercisesPage from '../ExercisesPage'

const mocks = vi.hoisted(() => ({
  getUserExercises: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({ user: { uid: 'user-1' } }),
}))

vi.mock('../../data/exercises', () => ({
  exercises: [{
    id: 'squat',
    name: 'Przysiad',
    category: 'legs',
    equipment: 'barbell',
    muscles: ['quads'],
  }],
}))

vi.mock('../../lib/userExercisesService', () => ({
  getUserExercises: mocks.getUserExercises,
  createUserExercise: vi.fn(),
  updateUserExercise: vi.fn(),
  deleteUserExercise: vi.fn(),
}))

vi.mock('../../hooks/useDialogA11y', () => ({ useDialogA11y: vi.fn() }))
vi.mock('../../components/ConfirmDialog', () => ({ default: () => null }))
vi.mock('@number-flow/react', () => ({
  default: ({ value }: { value: number }) => <>{value}</>,
}))
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mocks.navigate }
})
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  motion: new Proxy({}, {
    get: (_target, tag: string | symbol) => {
      if (typeof tag !== 'string') return undefined
      return ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => {
        delete props.initial
        delete props.animate
        delete props.exit
        delete props.transition
        delete props.whileTap
        return createElement(tag, props, children)
      }
    },
  }),
}))

const customExercise = {
  id: 'incline-db',
  name: 'Skos hantlami',
  category: 'chest',
  equipment: 'dumbbell',
  muscles: ['chest'],
}

describe('ExercisesPage user library states', () => {
  beforeEach(() => {
    mocks.getUserExercises.mockReset()
    mocks.navigate.mockReset()
  })

  it('shows a persistent error, unknown counts and the usable global catalog', async () => {
    mocks.getUserExercises.mockRejectedValueOnce(new Error('offline'))

    render(<ExercisesPage />)

    expect(await screen.findByText('Nie udało się wczytać Twoich ćwiczeń')).toBeInTheDocument()
    expect(screen.queryByText('Brak własnych ćwiczeń')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Dodaj pierwsze' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dodaj własne' })).toBeDisabled()
    expect(screen.getByText('Przysiad')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('recovers from an error and replaces the unknown state with the full list', async () => {
    mocks.getUserExercises
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([customExercise])

    render(<ExercisesPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Spróbuj ponownie' }))

    expect(await screen.findByText('Skos hantlami')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dodaj własne' })).toBeEnabled()
    expect(mocks.getUserExercises).toHaveBeenCalledTimes(2)
  })

  it('shows the first-resource CTA only after a successful empty response', async () => {
    mocks.getUserExercises.mockResolvedValueOnce([])

    render(<ExercisesPage />)

    expect(await screen.findByText('Brak własnych ćwiczeń')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dodaj pierwsze' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dodaj własne' })).toBeEnabled()
  })
})
```

- [x] **Step 2: Uruchom test i potwierdź czerwony stan**

Run:

```bash
npm run test:unit -- src/pages/__tests__/ExercisesPageDataState.test.tsx
```

Expected: FAIL, ponieważ błąd nadal przechodzi do `filteredUser.length === 0`, a akcja tworzenia pozostaje aktywna.

- [x] **Step 3: Zastąp booleany kluczowanym `DataState`**

W `src/pages/ExercisesPage.tsx` dodaj `useCallback` do importu Reacta i importuj `DataState`. Zmień typ `count` w `SectionHeader` na `number | string`.

W komponencie zastąp stany `userExercises`, `loadingUser` i `userExercisesLoadError` tym blokiem:

```tsx
interface UserExercisesResource {
  uid: string | null
  state: DataState<Exercise[]>
}

const [userExercisesResource, setUserExercisesResource] = useState<UserExercisesResource>({
  uid: user?.uid ?? null,
  state: { status: 'loading' },
})
const userExercisesMountedRef = useRef(false)
const userExercisesRequestRef = useRef(0)
const requestedUserRef = useRef<string | null>(null)
const inFlightUserRef = useRef<string | null>(null)

const loadUserExercises = useCallback((uid: string) => {
  if (inFlightUserRef.current === uid) return
  const requestId = ++userExercisesRequestRef.current
  inFlightUserRef.current = uid

  getUserExercises(uid)
    .then((data) => {
      if (!userExercisesMountedRef.current || requestId !== userExercisesRequestRef.current) return
      setUserExercisesResource({ uid, state: { status: 'success', data } })
    })
    .catch((error: unknown) => {
      console.error('[userExercises load error]', error)
      toast.error('Nie udało się wczytać Twoich ćwiczeń.')
      if (!userExercisesMountedRef.current || requestId !== userExercisesRequestRef.current) return
      setUserExercisesResource({ uid, state: { status: 'error', error } })
    })
    .finally(() => {
      if (requestId === userExercisesRequestRef.current) inFlightUserRef.current = null
    })
}, [])

useEffect(() => {
  if (!user) return
  userExercisesMountedRef.current = true
  if (requestedUserRef.current !== user.uid) {
    requestedUserRef.current = user.uid
    loadUserExercises(user.uid)
  }
  return () => {
    userExercisesMountedRef.current = false
  }
}, [loadUserExercises, user])

const userExercisesState: DataState<Exercise[]> =
  userExercisesResource.uid === user?.uid
    ? userExercisesResource.state
    : { status: 'loading' }
const userExercises = userExercisesState.status === 'success'
  ? userExercisesState.data
  : []

function handleRetryUserExercises() {
  if (!user) return
  requestedUserRef.current = user.uid
  setUserExercisesResource({ uid: user.uid, state: { status: 'loading' } })
  loadUserExercises(user.uid)
}
```

W `handleCreate` zastąp obecne `setUserExercises`:

```tsx
setUserExercisesResource((current) => current.state.status === 'success'
  ? {
      ...current,
      state: { status: 'success', data: [created, ...current.state.data] },
    }
  : current)
```

W `handleUpdate` zastąp obecne `setUserExercises`:

```tsx
setUserExercisesResource((current) => current.state.status === 'success'
  ? {
      ...current,
      state: {
        status: 'success',
        data: current.state.data.map((exercise) => (
          exercise.id === formExercise.id
            ? { ...exercise, ...input }
            : exercise
        )),
      },
    }
  : current)
```

W `handleDeleteConfirmed` zastąp obecne `setUserExercises`:

```tsx
setUserExercisesResource((current) => current.state.status === 'success'
  ? {
      ...current,
      state: {
        status: 'success',
        data: current.state.data.filter((exercise) => exercise.id !== deletingId),
      },
    }
  : current)
```

- [x] **Step 4: Zmień liczniki, akcję tworzenia i kolejność gałęzi renderu**

Licznik „moje” i licznik sekcji pokazują dane wyłącznie po sukcesie:

```tsx
<strong>
  {userExercisesState.status === 'success'
    ? <NumberFlow value={userExercises.length} />
    : '—'}
</strong>
```

`SectionHeader` otrzymuje:

```tsx
count={userExercisesState.status === 'success' ? filteredUser.length : '—'}
```

Przycisk „Dodaj własne” otrzymuje:

```tsx
disabled={userExercisesState.status !== 'success'}
aria-describedby={userExercisesState.status === 'error' ? 'user-exercises-load-error' : undefined}
```

Ustaw `data-load-state` przez status:

```tsx
data-load-state={
  userExercisesState.status === 'success'
    ? 'ready'
    : userExercisesState.status
}
```

Przed gałęzią `filteredUser.length === 0` dodaj:

```tsx
{userExercisesState.status === 'loading' ? (
  <div className="exercise-empty-state">
    <p>Ładowanie...</p>
  </div>
) : userExercisesState.status === 'error' ? (
  <div id="user-exercises-load-error" className="exercise-empty-state">
    <strong>Nie udało się wczytać Twoich ćwiczeń</strong>
    <p>Katalog globalny nadal jest dostępny. Sprawdź połączenie i spróbuj ponownie.</p>
    <button
      type="button"
      onClick={handleRetryUserExercises}
      className="planner-secondary-action"
    >
      Spróbuj ponownie
    </button>
  </div>
) : filteredUser.length === 0 ? (
```

Domknij istniejącą gałąź bez zmiany jej success-empty i success-data JSX.

- [x] **Step 5: Uruchom testy ćwiczeń i izolowane E2E tej trasy**

Run:

```bash
npm run test:unit -- src/pages/__tests__/ExercisesPageDataState.test.tsx
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e firebase emulators:exec --only auth,firestore --project demo-ironlog "playwright test tests/e2e/exercises.spec.ts --project=desktop"
npm run lint
```

Expected: 3 testy komponentowe i 2 testy Playwright przechodzą; katalog globalny i CRUD po poprawnym odczycie pozostają bez regresji.

- [x] **Step 6: Wykonaj commit**

```bash
git diff --check
git add src/pages/ExercisesPage.tsx src/pages/__tests__/ExercisesPageDataState.test.tsx
git commit -m "fix: distinguish exercise library errors"
```

---

### Task 4: Szablony na dashboardzie i stronie planów zachowują uczciwe stany

**Files:**
- Modify: `src/pages/DashboardPage.tsx`
- Modify: `src/pages/__tests__/DashboardProjectionStatus.test.tsx`
- Create: `src/pages/__tests__/TemplatesPageDataState.test.tsx`

**Interfaces:**
- Consumes: `DataState<WorkoutTemplate[]>`.
- Produces: niezależne `loading/success/error` sekcji planów na dashboardzie.
- Preserves: istniejące zachowanie `TemplatesPage`; produkcyjny plik strony nie wymaga refaktoru.

- [x] **Step 1: Uczyń mock `getTemplates` sterowalnym w teście dashboardu**

W obiekcie `mocks` w `DashboardProjectionStatus.test.tsx` dodaj:

```ts
getTemplates: vi.fn(),
```

Zmień mock serwisu na:

```ts
vi.mock('../../lib/templateService', () => ({
  getTemplates: mocks.getTemplates,
}))
```

W `beforeEach` dodaj:

```ts
mocks.getTemplates.mockReset()
mocks.getTemplates.mockResolvedValue([])
```

Na końcu pliku dodaj:

```tsx
it('shows a persistent template error and reaches the empty state only after retry succeeds', async () => {
  mocks.getRecentWorkouts.mockResolvedValue([])
  mocks.getTemplates
    .mockRejectedValueOnce(new Error('templates offline'))
    .mockResolvedValueOnce([])

  render(<DashboardPage />)

  expect(await screen.findByText('Nie udało się wczytać planów')).toBeInTheDocument()
  expect(screen.queryByText('Brak zapisanych szablonów')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Utwórz pierwszy plan' })).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))

  expect(await screen.findByText('Brak zapisanych szablonów')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Utwórz pierwszy plan' })).toBeInTheDocument()
  expect(mocks.getTemplates).toHaveBeenCalledTimes(2)
})

it('renders template data after a successful read', async () => {
  mocks.getRecentWorkouts.mockResolvedValue([])
  mocks.getTemplates.mockResolvedValueOnce([{
    id: 'template-1',
    userId: 'user-1',
    name: 'Upper / Lower',
    createdAt: 1,
    updatedAt: 2,
    days: [{ name: 'Upper', exercises: [] }],
  }])

  render(<DashboardPage />)

  expect(await screen.findByText('Upper / Lower')).toBeInTheDocument()
  expect(screen.queryByText('Brak zapisanych szablonów')).not.toBeInTheDocument()
})
```

- [x] **Step 2: Dodaj test regresji strony planów**

Utwórz `src/pages/__tests__/TemplatesPageDataState.test.tsx`:

```tsx
import { createElement, type ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TemplatesPage from '../TemplatesPage'

const mocks = vi.hoisted(() => ({
  getTemplates: vi.fn(),
  navigate: vi.fn(),
  user: { uid: 'user-1' },
}))

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({ user: mocks.user }),
}))
vi.mock('../../lib/templateService', () => ({
  getTemplates: mocks.getTemplates,
  deleteTemplate: vi.fn(),
}))
vi.mock('../../hooks/useTemplateWorkoutLaunch', () => ({
  useTemplateWorkoutLaunch: () => ({
    pendingLaunch: null,
    launchingTemplateId: null,
    requestTemplateLaunch: vi.fn(),
    confirmTemplateLaunch: vi.fn(),
    cancelTemplateLaunch: vi.fn(),
  }),
}))
vi.mock('../../components/ConfirmDialog', () => ({ default: () => null }))
vi.mock('../../components/TemplateLaunchConfirmDialog', () => ({ default: () => null }))
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mocks.navigate }
})
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  motion: new Proxy({}, {
    get: (_target, tag: string | symbol) => {
      if (typeof tag !== 'string') return undefined
      return ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => {
        delete props.initial
        delete props.animate
        delete props.exit
        delete props.transition
        delete props.whileTap
        return createElement(tag, props, children)
      }
    },
  }),
}))

describe('TemplatesPage data states', () => {
  beforeEach(() => {
    mocks.getTemplates.mockReset()
    mocks.navigate.mockReset()
  })

  it('keeps error ahead of empty state and reaches empty only after retry succeeds', async () => {
    mocks.getTemplates
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([])

    render(<TemplatesPage />)

    expect(await screen.findByText('Nie udało się pobrać szablonów')).toBeInTheDocument()
    expect(screen.queryByText('Nie masz jeszcze szablonów')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Utwórz pierwszy szablon' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))

    expect(await screen.findByText('Nie masz jeszcze szablonów')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Utwórz pierwszy szablon' })).toBeInTheDocument()
    expect(mocks.getTemplates).toHaveBeenCalledTimes(2)
  })
})
```

- [x] **Step 3: Uruchom testy i potwierdź, że tylko dashboard jest czerwony**

Run:

```bash
npm run test:unit -- src/pages/__tests__/DashboardProjectionStatus.test.tsx src/pages/__tests__/TemplatesPageDataState.test.tsx
```

Expected: nowy test `TemplatesPage` przechodzi na istniejącym kodzie; dwa nowe testy dashboardu nie przechodzą.

- [x] **Step 4: Zastąp tablicę szablonów kluczowanym stanem**

W `DashboardPage.tsx` importuj `DataState`. Zastąp `templates` następującym zasobem i referencjami:

```tsx
interface TemplatesResource {
  uid: string | null
  state: DataState<WorkoutTemplate[]>
}

const [templatesResource, setTemplatesResource] = useState<TemplatesResource>({
  uid: user?.uid ?? null,
  state: { status: 'loading' },
})
const templatesMountedRef = useRef(false)
const templatesRequestRef = useRef(0)
const requestedTemplatesUserRef = useRef<string | null>(null)
const inFlightTemplatesUserRef = useRef<string | null>(null)
```

Dodaj loader obok pozostałych callbacków:

```tsx
const loadTemplates = useCallback((uid: string) => {
  if (inFlightTemplatesUserRef.current === uid) return
  const requestId = ++templatesRequestRef.current
  inFlightTemplatesUserRef.current = uid

  getTemplates(uid)
    .then((data) => {
      if (!templatesMountedRef.current || requestId !== templatesRequestRef.current) return
      setTemplatesResource({ uid, state: { status: 'success', data } })
    })
    .catch((error: unknown) => {
      console.error('[DashboardPage] getTemplates failed', error)
      toast.error('Nie udało się wczytać szablonów.')
      if (!templatesMountedRef.current || requestId !== templatesRequestRef.current) return
      setTemplatesResource({ uid, state: { status: 'error', error } })
    })
    .finally(() => {
      if (requestId === templatesRequestRef.current) inFlightTemplatesUserRef.current = null
    })
}, [])
```

Zastąp obecny efekt `getTemplates`:

```tsx
useEffect(() => {
  if (!user) return
  templatesMountedRef.current = true
  if (requestedTemplatesUserRef.current !== user.uid) {
    requestedTemplatesUserRef.current = user.uid
    loadTemplates(user.uid)
  }
  return () => {
    templatesMountedRef.current = false
  }
}, [loadTemplates, user])
```

Przed obliczeniem `recentTemplates` dodaj:

```tsx
const templatesState: DataState<WorkoutTemplate[]> =
  templatesResource.uid === user?.uid
    ? templatesResource.state
    : { status: 'loading' }
const templates = templatesState.status === 'success' ? templatesState.data : []
const recentTemplates = templates.slice(0, 3)

function handleRetryTemplates() {
  if (!user) return
  requestedTemplatesUserRef.current = user.uid
  setTemplatesResource({ uid: user.uid, state: { status: 'loading' } })
  loadTemplates(user.uid)
}
```

Usuń dawne `const recentTemplates = templates.slice(0, 3)`.

- [x] **Step 5: Nadaj sekcji planów cztery rozłączne gałęzie**

Zastąp warunek `recentTemplates.length === 0` kolejnością:

```tsx
{templatesState.status === 'loading' ? (
  <div
    className="rounded-[var(--radius-lg)] px-5 py-8 text-center"
    style={{ background: 'var(--surface-muted)' }}
  >
    <p className="text-sm font-semibold text-white">Ładowanie planów...</p>
  </div>
) : templatesState.status === 'error' ? (
  <div
    className="rounded-[var(--radius-lg)] border border-dashed px-5 py-8 text-center"
    style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)' }}
  >
    <p className="text-sm font-semibold text-white">Nie udało się wczytać planów</p>
    <p className="mt-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>
      Sprawdź połączenie i spróbuj ponownie.
    </p>
    <Button type="button" className="mt-5" onClick={handleRetryTemplates}>
      Spróbuj ponownie
    </Button>
  </div>
) : recentTemplates.length === 0 ? (
```

Pozostaw dotychczasowy success-empty i success-data JSX bez zmiany treści.

- [x] **Step 6: Uruchom testy szablonów, dashboardu i E2E planów**

Run:

```bash
npm run test:unit -- src/pages/__tests__/DashboardProjectionStatus.test.tsx src/pages/__tests__/TemplatesPageDataState.test.tsx
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e firebase emulators:exec --only auth,firestore --project demo-ironlog "playwright test tests/e2e/templates.spec.ts tests/e2e/critical.spec.ts --project=desktop"
npm run lint
```

Expected: testy komponentowe przechodzą; Playwright potwierdza stronę planów, dashboard i brak regresji tworzenia szablonu.

- [x] **Step 7: Wykonaj commit**

```bash
git diff --check
git add src/pages/DashboardPage.tsx src/pages/__tests__/DashboardProjectionStatus.test.tsx src/pages/__tests__/TemplatesPageDataState.test.tsx
git commit -m "fix: distinguish template loading errors"
```

---

### Task 5: Review wizualny, pełne bramki i zamknięcie dokumentacji

**Files:**
- Temporarily modify and then restore: `src/lib/readinessService.ts`
- Temporarily modify and then restore: `src/lib/userExercisesService.ts`
- Temporarily modify and then restore: `src/lib/templateService.ts`
- Modify: `docs/roadmap/ROADMAP.md`
- Modify: `docs/roadmap/specs/2026-07-12-phase-2-honest-data-states-design.md`

**Interfaces:**
- Consumes: kompletne UI z Tasks 1–4.
- Produces: wizualny dowód desktop/mobile, zielone bramki i status `DONE`.

- [x] **Step 1: Wymuś błędy wyłącznie na czas lokalnego review**

Za pomocą `apply_patch` dodaj jako pierwszą linię ciała `getReadiness`, `getUserExercises` i `getTemplates`:

```ts
throw new Error('Phase 2 visual QA')
```

Nie stage'uj tej zmiany. Uruchom aplikację lokalnie i zaloguj się kontem testowym:

```bash
npm run dev:all
```

Przez Playwright albo Computer Use sprawdź viewporty `1440×900` i `393×851`:

- `/dashboard`: osobne, nieucięte karty „Nie udało się wczytać gotowości” i „Nie udało się wczytać planów”; brak formularza readiness i CTA „Utwórz pierwszy plan”;
- `/exercises`: widoczny błąd własnej biblioteki, wyłączone „Dodaj własne”, liczniki `—` i dostępny katalog globalny;
- `/templates`: obecny błąd strony planów z retry, bez empty state.

Expected: żaden komunikat ani przycisk nie wychodzi poza viewport; na mobile nie powstaje poziomy scroll.

- [x] **Step 2: Usuń trzy tymczasowe wyjątki i potwierdź czysty kod produktu**

Za pomocą odwrotnego `apply_patch` usuń dokładnie trzy linie `throw new Error('Phase 2 visual QA')`.

Run:

```bash
rg -n "Phase 2 visual QA" src
git diff --check
```

Expected: `rg` nie zwraca dopasowań. Diff zawiera tylko docelową implementację i dokumentację.

- [x] **Step 3: Uruchom pełną bramkę automatyczną**

Run:

```bash
npm run lint
npm run test:unit
npm run test:rules
npm run test:integration:workout
npm run build
npm run test:e2e:isolated
npm run test:e2e:workout
```

Expected:

- lint: PASS;
- unit: 35 plików, 221 testów;
- Firestore rules: 10 testów;
- workout integration: 20 testów;
- build: PASS z istniejącym ostrzeżeniem o rozmiarze chunku;
- isolated Playwright: 13 testów;
- workout lifecycle Playwright: 9 testów bez retry.

Live `npm run test:e2e` pozostaje kontrolą `RELEASE-08` i nie blokuje Fazy 2.

- [x] **Step 4: Zamknij Fazę 2 w dokumentacji**

W `docs/roadmap/ROADMAP.md`:

- ustaw status Fazy 2 w mapie na `DONE`;
- ustaw nagłówek sekcji Fazy 2 na `Status: DONE`;
- zaktualizuj baseline unit do `35 plików i 221 testów`;
- jako następny rekomendowany pakiet wskaż Fazę 3; Faza 2B pozostaje niezależnym `READY`;
- zachowaj `LATER-07` oraz otwarte `RELEASE-08`.

W specyfikacji ustaw:

```md
**Status:** wdrożona i zweryfikowana
```

Dodaj na końcu specyfikacji:

```md
## 14. Wynik wdrożenia

Zakres `STATE-01`, `STATE-02`, `STATE-03`, `STATE-05`, `STATE-06` i `STATE-07` został wdrożony. Testy komponentowe rozróżniają błąd, poprawny pusty wynik i dane. Review desktop/mobile potwierdziło układ trwałych stanów błędu. Wtórni konsumenci własnych ćwiczeń pozostają w `LATER-07`, a czynności produkcyjne w `RELEASE-08`.
```

- [x] **Step 5: Sprawdź spójność dokumentów i wykonaj commit**

Run:

```bash
git diff --check
rg -n "Faza 2|STATE-0[1-7]|LATER-07|RELEASE-08|35 plików|221 testów" docs/roadmap/ROADMAP.md docs/roadmap/specs/2026-07-12-phase-2-honest-data-states-design.md
git status --short
git add docs/roadmap/ROADMAP.md docs/roadmap/specs/2026-07-12-phase-2-honest-data-states-design.md
git commit -m "docs: close honest data states phase"
```

Expected: dokumenty zgadzają się co do statusu, zakresu i bramek; working tree jest czysty po commicie.

---

## Definition of Done

- [x] `STATE-01`: błąd readiness nie renderuje promptu.
- [x] `STATE-02`: błąd własnych ćwiczeń nie renderuje pustej biblioteki ani potwierdzonego zera.
- [x] `STATE-03`: dashboard rozróżnia błąd szablonów, a `TemplatesPage` ma test regresji.
- [x] `STATE-05`: każdy objęty błąd ma trwały komunikat i retry.
- [x] `STATE-06`: wspólny kontrakt ogranicza się do `DataState<T>`; brak nowego frameworka zapytań.
- [x] `STATE-07`: pierwszy odczyt readiness jest pojedynczy także w `StrictMode`, a rollover dnia pobiera nową datę raz.
- [x] Spóźnione odpowiedzi nie nadpisują nowszego stanu.
- [x] Globalny katalog ćwiczeń działa podczas błędu własnej biblioteki.
- [x] Review desktop/mobile nie wykazuje overflow ani uciętych akcji.
- [x] Wszystkie bramki Task 5 przechodzą.
- [x] Roadmapa i specyfikacja mają status `DONE`.
- [x] Brak pushu, deployu i zmian `RELEASE-08`.

## Handoff wykonawczy

Rekomendowany tryb: `superpowers:subagent-driven-development` w osobnym worktree utworzonym z `puls-rebrand`. Każde zadanie otrzymuje świeżego implementera oraz review zgodności ze specyfikacją i jakości kodu przed następnym zadaniem. Merge do `puls-rebrand` następuje dopiero po pełnej bramce Task 5.
